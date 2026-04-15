import { execSync } from 'child_process';
import { createWriteStream, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_PATH = join(__dirname, 'data/recipes.json');
const CACHE_DIR    = join(__dirname, 'cache/recipes');
const LOG_PATH     = join(__dirname, 'logs/recipes.log');
const ACCOUNT      = process.env.GOG_ACCOUNT;
const GOG_ENV      = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD };

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG_PATH, line + '\n', { flag: 'a' }); } catch {}
}

function gog(cmd) {
  return execSync(`gog --account ${ACCOUNT} ${cmd}`, {
    encoding: 'utf8', timeout: 20000, env: GOG_ENV
  });
}

function loadRecipes() {
  try { return JSON.parse(readFileSync(RECIPES_PATH, 'utf8')); }
  catch { return []; }
}

function saveRecipes(recipes) {
  writeFileSync(RECIPES_PATH, JSON.stringify(recipes, null, 2));
}

function extractImageUrl(htmlParts) {
  for (const part of htmlParts) {
    const html = Buffer.from(part.body.data || '', 'base64').toString('utf8');
    const matches = [...html.matchAll(/<img[^>]+src="(https:\/\/storefront-prod\.fr\.picnicinternational\.com\/[^"]+)"/gi)];
    if (matches.length) return matches[matches.length - 1][1];
  }
  return null;
}

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    if (existsSync(destPath)) { resolve(true); return; }
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(true)));
      file.on('error', reject);
    }).on('error', reject);
  });
}

// Parse "Mon, 07 Apr 2026 19:11:49 +0000" ou "2026-04-07 21:11"
function parseThreadDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
}

export async function extractRecipes() {
  log('Démarrage extraction recettes Picnic');

  // 1. Chercher les mails Picnic recettes (30 derniers jours)
  let threads;
  try {
    const raw = JSON.parse(gog('gmail search "from:info@service.picnic-app.fr newer_than:30d" --max 30 --json --no-input'));
    threads = (raw.threads || []).filter(t => t.subject && t.subject.startsWith('Recette :'));
    log(`${threads.length} mail(s) recette trouvé(s) au total`);
  } catch (err) {
    log(`Erreur recherche Gmail : ${err.message}`);
    return;
  }

  if (!threads.length) {
    log('Aucun mail recette — rien à faire');
    return loadRecipes();
  }

  // 2. Détecter la dernière commande
  // On regroupe les mails par tranches de 3h, puis on prend le groupe le plus récent avec ≥1 recette.
  // Si le groupe le plus récent n'a qu'1 recette, on tente le groupe suivant (rattrapage Picnic).
  threads.sort((a, b) => new Date(b.date) - new Date(a.date));
  const windowMs = 3 * 60 * 60 * 1000; // 3h

  // Construire les groupes
  const groups = [];
  for (const t of threads) {
    const d = parseThreadDate(t.date);
    if (!d || isNaN(d)) continue;
    const last = groups[groups.length - 1];
    if (last && Math.abs(d - parseThreadDate(last[0].date)) <= windowMs) {
      last.push(t);
    } else {
      groups.push([t]);
    }
  }

  // Prendre le groupe le plus récent avec ≥ 2 recettes, sinon le plus récent tout court
  const lastOrderThreads = groups.find(g => g.length >= 2) || groups[0] || [];
  const refDate = parseThreadDate(lastOrderThreads[0]?.date);

  log(`Dernière commande détectée : ${refDate?.toISOString().slice(0,10)} — ${lastOrderThreads.length} recette(s)`);

  // 3. Purger les recettes "cuisinées" de la commande précédente
  //    (on les reconnaît car leur id n'est pas dans la nouvelle commande)
  const newIds = new Set(lastOrderThreads.map(t => t.id));
  const existing = loadRecipes();

  const toKeep = existing.filter(r => {
    if (newIds.has(r.id)) return true;   // recette de la nouvelle commande → garder
    if (!r.done) return true;            // recette en cours non cuisinée → garder
    // recette cuisinée d'une commande précédente → purger
    log(`Purge recette cuisinée ancienne : ${r.name} (${r.id})`);
    const imgPath = join(CACHE_DIR, `${r.id}.png`);
    if (existsSync(imgPath)) { try { unlinkSync(imgPath); } catch {} }
    return false;
  });

  // 4. Ajouter les nouvelles recettes de la dernière commande
  const existingIds = new Set(toKeep.map(r => r.id));
  let added = 0;

  for (const thread of lastOrderThreads) {
    const id = thread.id;
    if (existingIds.has(id)) continue;

    const name = thread.subject.replace(/^Recette\s*:\s*/i, '').trim();
    log(`Traitement : ${name} (${id})`);

    let imageUrl = null;
    try {
      const mail = JSON.parse(gog(`gmail get ${id} --json --no-input`));
      const parts = (mail.message?.payload?.parts || []).filter(p => p.mimeType === 'text/html');
      const remoteUrl = extractImageUrl(parts);

      if (remoteUrl) {
        const destPath = join(CACHE_DIR, `${id}.png`);
        try {
          await downloadImage(remoteUrl, destPath);
          imageUrl = `/api/recipes/image/${id}`;
          log(`Image cachée : ${destPath}`);
        } catch (err) {
          log(`Erreur téléchargement image pour ${id} : ${err.message}`);
        }
      } else {
        log(`Aucune image trouvée pour ${id}`);
      }
    } catch (err) {
      log(`Erreur récupération mail ${id} : ${err.message}`);
    }

    toKeep.push({ id, name, imageUrl, imageCached: imageUrl !== null, done: false, extractedAt: new Date().toISOString() });
    added++;
  }

  saveRecipes(toKeep);
  log(`Extraction terminée : ${added} nouvelle(s) recette(s) ajoutée(s)`);
  return toKeep;
}
