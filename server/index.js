import 'dotenv/config';
import express from 'express';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ACCOUNT = process.env.GOG_ACCOUNT;

// ─── Mode Mock (dev sans gog) ───────────────────────────────────────────────

function checkGogAvailable() {
  try {
    execSync('gog --version', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const DEV_MODE = process.env.DEV_MODE === 'true' || !checkGogAvailable();

if (DEV_MODE) {
  console.log('⚠️  Mode MOCK activé (gog non disponible ou DEV_MODE=true)');
} else if (!ACCOUNT) {
  console.error('ERREUR : GOG_ACCOUNT non défini dans .env');
  process.exit(1);
}

// Données mock pour le développement
const mockEvents = [
  { id: 'mock-1', summary: 'Réunion équipe', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
  { id: 'mock-2', summary: 'Dentiste Emma', start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 86400000 + 3600000).toISOString() },
  { id: 'mock-3', summary: 'Anniversaire Maman', start: new Date(Date.now() + 172800000).toISOString(), end: new Date(Date.now() + 172800000 + 86400000).toISOString() },
];

const mockTasks = [
  { id: 'mock-t1', title: 'Faire les courses', completed: false },
  { id: 'mock-t2', title: 'Appeler plombier', completed: false },
  { id: 'mock-t3', title: 'Payer facture EDF', completed: true },
];

app.use(express.json());
app.use(express.static(join(__dirname, '../dashboard')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function gog(cmd) {
  return execSync(`gog --account ${ACCOUNT} ${cmd}`, {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD }
  });
}

function isoNow(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// Récupère l'ID de la première tasklist (mis en cache)
let tasklistId = null;
function getTasklistId() {
  if (tasklistId) return tasklistId;
  const raw = JSON.parse(gog('tasks lists --json --no-input'));
  const lists = raw.tasklists || raw;
  tasklistId = lists[0].id;
  return tasklistId;
}

// ─── Calendar ───────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  if (DEV_MODE) {
    return res.json(mockEvents);
  }
  try {
    const days = parseInt(req.query.days) || 7;
    const from = isoNow(0);
    const to = isoNow(days);
    const raw = JSON.parse(gog(`calendar events primary --from ${from} --to ${to} --json --no-input`));
    const events = (raw.events || raw).map(ev => ({
      id: ev.id,
      summary: ev.summary || '(sans titre)',
      start: ev.start?.dateTime || ev.start?.date || ev.start,
      end: ev.end?.dateTime || ev.end?.date || ev.end,
    }));
    res.json(events);
  } catch (err) {
    console.error('[GET /api/events]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', (req, res) => {
  if (DEV_MODE) {
    const { summary, start, end } = req.body;
    if (!summary || !start || !end) return res.status(400).json({ error: 'summary, start et end requis' });
    const newEvent = { id: `mock-${Date.now()}`, summary, start, end };
    mockEvents.push(newEvent);
    return res.json({ ok: true, event: newEvent });
  }
  try {
    const { summary, start, end } = req.body;
    if (!summary || !start || !end) return res.status(400).json({ error: 'summary, start et end requis' });
    const s = JSON.stringify(summary).replace(/'/g, "'\\''");
    gog(`calendar create primary --title ${s} --start "${start}" --end "${end}" --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/events]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', (req, res) => {
  if (DEV_MODE) {
    const idx = mockEvents.findIndex(e => e.id === req.params.id);
    if (idx !== -1) mockEvents.splice(idx, 1);
    return res.json({ ok: true });
  }
  try {
    gog(`calendar delete primary ${req.params.id} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/events/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Tasks ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  if (DEV_MODE) {
    return res.json(mockTasks);
  }
  try {
    const raw = JSON.parse(gog('tasks list @default --json --no-input'));
    const tasks = (raw.tasks || raw).map(t => ({
      id: t.id,
      title: t.title || t.name || '(sans titre)',
      completed: t.status === 'completed' || t.completed || false,
    }));
    res.json(tasks);
  } catch (err) {
    console.error('[GET /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', (req, res) => {
  if (DEV_MODE) {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    const newTask = { id: `mock-t${Date.now()}`, title, completed: false };
    mockTasks.push(newTask);
    return res.json({ ok: true, task: newTask });
  }
  try {
    const listId = getTasklistId();
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    const t = JSON.stringify(title);
    gog(`tasks create ${listId} --title ${t} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id/complete', (req, res) => {
  if (DEV_MODE) {
    const task = mockTasks.find(t => t.id === req.params.id);
    if (task) task.completed = true;
    return res.json({ ok: true });
  }
  try {
    const listId = getTasklistId();
    gog(`tasks complete ${listId} ${req.params.id} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/tasks/:id/complete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  if (DEV_MODE) {
    const idx = mockTasks.findIndex(t => t.id === req.params.id);
    if (idx !== -1) mockTasks.splice(idx, 1);
    return res.json({ ok: true });
  }
  try {
    const listId = getTasklistId();
    gog(`tasks delete ${listId} ${req.params.id} --force --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── SSE — push temps réel vers le dashboard ────────────────────────────────

const sseClients = new Set();

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Maintenir la connexion vivante
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);
  sseClients.add(res);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

function pushUpdate(type = 'update') {
  const msg = `data: ${type}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// Poll Google Calendar toutes les 30s, push SSE si changement détecté
let lastEventsHash = null;

function hashEvents(events) {
  return events.map(e => `${e.id}:${e.summary}:${e.start}`).join('|');
}

function startCalendarWatcher() {
  if (DEV_MODE) return;

  setInterval(async () => {
    try {
      const from = isoNow(0);
      const to = isoNow(30);
      const raw = JSON.parse(gog(`calendar events primary --from ${from} --to ${to} --json --no-input`));
      const events = (raw.events || raw).map(ev => ({
        id: ev.id,
        summary: ev.summary || '',
        start: ev.start?.dateTime || ev.start?.date || ev.start,
      }));
      const hash = hashEvents(events);
      if (lastEventsHash !== null && hash !== lastEventsHash) {
        console.log('[SSE] Changement détecté dans le calendrier — push update');
        pushUpdate('calendar');
      }
      lastEventsHash = hash;
    } catch (err) {
      console.error('[watcher]', err.message);
    }
  }, 30000);
}

// ─── Démarrage ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`HomeAssistant server running on http://localhost:${PORT}`);
  if (DEV_MODE) {
    console.log('🔧 Mode développement : données mock actives');
  } else {
    console.log(`Compte Google : ${ACCOUNT}`);
  }
  startCalendarWatcher();
});
