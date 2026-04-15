import { execSync } from 'child_process';
import { createWriteStream, readFileSync, writeFileSync, existsSync } from 'fs';
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
  // Cherche l'image sur storefront-prod.fr.picnicinternational.com
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

export async function extractRecipes() {
  log('Démarrage extraction recettes Picnic');

  // 1. Chercher les mails Picnic recettes (30 derniers jours, sujet "Recette :")
  let threads;
  try {
    const raw = JSON.parse(gog('gmail search "from:info@service.picnic-app.fr newer_than:30d" --max 20 --json --no-input'));
    threads = (raw.threads || []).filter(t => t.subject && t.subject.startsWith('Recette :'));
    log(`${threads.length} mail(s) recette trouvé(s)`);
  } catch (err) {
    log(`Erreur recherche Gmail : ${err.message}`);
    return;
  }

  const existing = loadRecipes();
  const existingIds = new Set(existing.map(r => r.id));
  let added = 0;

  for (const thread of threads) {
    const id = thread.id;
    if (existingIds.has(id)) continue; // déjà extrait

    const name = thread.subject.replace(/^Recette\s*:\s*/i, '').trim();
    log(`Traitement : ${name} (${id})`);

    // 2. Récupérer le mail complet pour l'image
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

    existing.push({
      id,
      name,
      imageUrl,
      imageCached: imageUrl !== null,
      done: false,
      extractedAt: new Date().toISOString(),
    });
    existingIds.add(id);
    added++;
  }

  saveRecipes(existing);
  log(`Extraction terminée : ${added} nouvelle(s) recette(s) ajoutée(s)`);
  return existing;
}
