'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Provide the Maps API key to the client — never committed to git
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

// Save vacation data
app.post('/api/data', (req, res) => {
  try {
    const { locations, journeys } = req.body;
    if (!Array.isArray(locations) || !Array.isArray(journeys)) {
      return res.status(400).json({ error: 'Invalid data: locations and journeys must be arrays' });
    }
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write atomically via temp file
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ locations, journeys }, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to save data:', err.message);
    res.status(500).json({ error: 'Failed to save vacation data' });
  }
});

app.listen(PORT, () => {
  console.log(`Vacation planner running on http://localhost:${PORT}`);
});
