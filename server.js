'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE   = path.join(__dirname, 'data', 'data.json');
const BACKUP_DIR  = path.join(__dirname, 'data', 'backups');

// ── Server-Sent Events clients ─────────────────────────────────────
const _sseClients = new Set();

function _broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  _sseClients.forEach(res => {
    try { res.write(msg); } catch (_) { _sseClients.delete(res); }
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Live-update push channel (SSE — no extra dependencies)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  _sseClients.add(res);
  // Keepalive comment every 25s — prevents nginx/proxy from closing idle streams
  const keepalive = setInterval(() => {
    try { res.write(':ping\n\n'); } catch (_) { clearInterval(keepalive); _sseClients.delete(res); }
  }, 25000);
  req.on('close', () => { clearInterval(keepalive); _sseClients.delete(res); });
});

app.get('/api/config', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY environment variable is not set' });
  }
  res.json({ mapsApiKey: apiKey });
});

// Load vacation data
app.get('/api/data', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ locations: [], journeys: [] });
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Validate top-level shape
    if (!Array.isArray(data.locations) || !Array.isArray(data.journeys)) {
      throw new Error('Invalid data shape');
    }
    res.json(data);
  } catch (err) {
    console.error('Failed to load data:', err.message);
    res.status(500).json({ error: 'Failed to load vacation data' });
  }
});

// Save vacation data (also writes a dated backup)
app.post('/api/data', (req, res) => {
  try {
    const { locations, journeys } = req.body;
    if (!Array.isArray(locations) || !Array.isArray(journeys)) {
      return res.status(400).json({ error: 'Invalid data: locations and journeys must be arrays' });
    }
    const payload = JSON.stringify({ locations, journeys }, null, 2);

    // Atomic write of main file
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, DATA_FILE);

    // Write backup
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}.json`), payload, 'utf8');

    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    console.error('Failed to save data:', err.message);
    res.status(500).json({ error: 'Failed to save vacation data' });
  }
});

// Share mode: receive a user's location and rebroadcast to all SSE clients
app.post('/api/location', (req, res) => {
  const { name, lat, lng } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat/lng required' });
  _broadcast({ type: 'user-location', name: name.trim().slice(0, 50), lat, lng });
  res.json({ ok: true });
});

// List backups (newest first)
app.get('/api/backups', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Could not list backups' });
  }
});

// Restore a backup to data.json
app.post('/api/restore/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // strip any path traversal
    if (!/^[\w\-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const src = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

    const raw  = fs.readFileSync(src, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.locations) || !Array.isArray(data.journeys)) {
      return res.status(400).json({ error: 'Backup has invalid shape' });
    }

    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, raw, 'utf8');
    fs.renameSync(tmp, DATA_FILE);

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to restore backup:', err.message);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Restore page
app.get('/restore', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'restore.html'));
});

app.listen(PORT, () => {
  console.log(`Vacation planner running on http://localhost:${PORT}`);
});
