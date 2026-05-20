import * as events from './events.js';

let _data = { locations: [], journeys: [] };

export function init(data) {
  _data = {
    locations: Array.isArray(data.locations) ? data.locations : [],
    journeys:  Array.isArray(data.journeys)  ? data.journeys  : [],
  };
}

export function serialize() {
  // Deep-copy so callers can't mutate internal state
  return JSON.parse(JSON.stringify(_data));
}

// ── Selectors ──────────────────────────────────────────────────────

export function getLocations() { return _data.locations; }
export function getJourneys()  { return _data.journeys;  }

export function getLocation(id) { return _data.locations.find(l => l.id === id) ?? null; }
export function getJourney(id)  { return _data.journeys.find(j => j.id === id)  ?? null; }

// ── Mutations ──────────────────────────────────────────────────────

export function addLocation(loc) {
  _data.locations.push(loc);
  events.emit('location:added', loc);
  events.emit('state:changed');
}

export function updateLocation(id, updates) {
  const idx = _data.locations.findIndex(l => l.id === id);
  if (idx < 0) return null;
  _data.locations[idx] = { ..._data.locations[idx], ...updates };
  events.emit('location:updated', _data.locations[idx]);
  events.emit('state:changed');
  return _data.locations[idx];
}

export function deleteLocation(id) {
  _data.locations = _data.locations.filter(l => l.id !== id);
  // Cascade: remove journeys that reference this location
  const removed = _data.journeys.filter(j => j.fromId === id || j.toId === id);
  _data.journeys = _data.journeys.filter(j => j.fromId !== id && j.toId !== id);
  removed.forEach(j => events.emit('journey:deleted', j.id));
  events.emit('location:deleted', id);
  events.emit('state:changed');
}

export function addJourney(journey) {
  _data.journeys.push(journey);
  events.emit('journey:added', journey);
  events.emit('state:changed');
}

export function updateJourney(id, updates) {
  const idx = _data.journeys.findIndex(j => j.id === id);
  if (idx < 0) return null;
  _data.journeys[idx] = { ..._data.journeys[idx], ...updates };
  events.emit('journey:updated', _data.journeys[idx]);
  events.emit('state:changed');
  return _data.journeys[idx];
}

export function deleteJourney(id) {
  _data.journeys = _data.journeys.filter(j => j.id !== id);
  events.emit('journey:deleted', id);
  events.emit('state:changed');
}
