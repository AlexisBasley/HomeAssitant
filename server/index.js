import 'dotenv/config';
import express from 'express';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '../dashboard')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function gog(cmd) {
  return execSync(`gog ${cmd}`, { encoding: 'utf8', timeout: 15000 });
}

function isoNow(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// ─── Calendar ───────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const from = isoNow(0);
    const to = isoNow(days);
    const output = gog(`calendar events primary --from ${from} --to ${to} --json --no-input`);
    res.json(JSON.parse(output));
  } catch (err) {
    console.error('[GET /api/events]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', (req, res) => {
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
  try {
    const output = gog('tasks list @default --json --no-input');
    res.json(JSON.parse(output));
  } catch (err) {
    console.error('[GET /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    const t = JSON.stringify(title).replace(/'/g, "'\\''");
    gog(`tasks create @default --title ${t} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id/complete', (req, res) => {
  try {
    gog(`tasks complete @default ${req.params.id} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/tasks/:id/complete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    gog(`tasks delete @default ${req.params.id} --no-input`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Démarrage ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`HomeAssistant server running on http://localhost:${PORT}`);
});
