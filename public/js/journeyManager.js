import * as state      from './state.js';
import * as events     from './events.js';
import * as mapManager from './mapManager.js';
import { generateId, DEFAULT_JOURNEY_COLOR } from './utils.js';
import { getMapLabelClass } from './mapLabel.js';

// journeyId → { polyline: google.maps.Polyline, label: MapLabel }
const _renderers = new Map();

// Temporary polylines shown while the user is picking a route
let _previewPolylines = [];

// ── Init ───────────────────────────────────────────────────────────

export function init() {
  events.on('journey:updated', j => _syncRenderer(j));
  events.on('journey:deleted', id => _removeRenderer(id));

  // Recalculate any affected journeys when a location is dragged or moved
  events.on('location:moved', async ({ id }) => {
    const affected = state.getJourneys().filter(j => j.fromId === id || j.toId === id);
    for (const j of affected) {
      await _recalculateJourney(j.id);
    }
  });
}

// ── Render all saved journeys ──────────────────────────────────────

export function renderAll() {
  state.getJourneys().forEach(j => _renderJourney(j));
}

export function clearAll() {
  _renderers.forEach(r => {
    r.polyline.setMap(null);
    r.label.setMap(null);
  });
  _renderers.clear();
}

/** Remove and re-create the renderer for an already-updated journey in state. */
export function rebuildRenderer(id) {
  _removeRenderer(id);
  const j = state.getJourney(id);
  if (j) _renderJourney(j);
}

export function getJourneyLabels() {
  return Array.from(_renderers.values()).map(r => r.label);
}

// ── Directions & preview ───────────────────────────────────────────

export async function fetchRoutes(fromLoc, toLoc) {
  const result = await mapManager.getDirections(fromLoc, toLoc);
  return result.routes; // google.maps.DirectionsRoute[]
}

export function previewRoutes(routes) {
  clearPreviews();
  const map = mapManager.getMap();
  routes.forEach((route, i) => {
    const pl = new google.maps.Polyline({
      path:          route.overview_path,
      strokeColor:   i === 0 ? '#4285F4' : '#9E9E9E',
      strokeOpacity: i === 0 ? 0.85 : 0.45,
      strokeWeight:  i === 0 ? 6 : 4,
      map,
      zIndex: i === 0 ? 8 : 4,
      clickable: false,
    });
    _previewPolylines.push(pl);
  });
}

export function highlightPreview(index) {
  _previewPolylines.forEach((pl, i) => {
    pl.setOptions({
      strokeColor:   i === index ? '#4285F4' : '#9E9E9E',
      strokeOpacity: i === index ? 0.85 : 0.45,
      strokeWeight:  i === index ? 6 : 4,
      zIndex:        i === index ? 8 : 4,
    });
  });
}

export function clearPreviews() {
  _previewPolylines.forEach(pl => pl.setMap(null));
  _previewPolylines = [];
}

// ── Confirm / save a new journey ───────────────────────────────────

export function confirmJourney({ fromId, toId, route, color, date, title }) {
  clearPreviews();

  const leg  = route.legs[0];
  const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));

  const journey = {
    id:           generateId(),
    fromId,
    toId,
    title:        title || '',
    date:         date || '',
    color:        color || DEFAULT_JOURNEY_COLOR,
    durationText: leg.duration.text,
    distanceText: leg.distance.text,
    summary:      route.summary || '',
    path,
  };

  state.addJourney(journey);
  _renderJourney(journey);
  return journey;
}

// ── Internal render ────────────────────────────────────────────────

function _renderJourney(journey) {
  const map = mapManager.getMap();

  const polyline = new google.maps.Polyline({
    path:          journey.path.map(p => ({ lat: p.lat, lng: p.lng })),
    strokeColor:   journey.color,
    strokeOpacity: 0.85,
    strokeWeight:  5,
    map,
    zIndex: 10,
    clickable: true,
  });

  polyline.addListener('click', () => {
    events.emit('ui:open-journey', journey.id);
  });

  // Duration (and optional title) label at route midpoint
  const midIndex = Math.floor(journey.path.length / 2);
  const midPt    = journey.path[midIndex] || journey.path[0];

  const MapLabel = getMapLabelClass();
  const label    = new MapLabel(
    [journey.title, journey.durationText].filter(Boolean),
    new google.maps.LatLng(midPt.lat, midPt.lng),
    journey.color,
    'map-journey-label',
    () => events.emit('ui:open-journey', journey.id)
  );
  label.setMap(map);

  _renderers.set(journey.id, { polyline, label });
}

function _syncRenderer(journey) {
  const r = _renderers.get(journey.id);
  if (!r) return;
  r.polyline.setOptions({ strokeColor: journey.color });
  r.label.update([journey.title, journey.durationText].filter(Boolean), journey.color);
}

function _removeRenderer(id) {
  const r = _renderers.get(id);
  if (!r) return;
  r.polyline.setMap(null);
  r.label.setMap(null);
  _renderers.delete(id);
}

// ── Recalculate an existing journey's route ────────────────────────

async function _recalculateJourney(id) {
  const j       = state.getJourney(id);
  const fromLoc = state.getLocation(j?.fromId);
  const toLoc   = state.getLocation(j?.toId);
  if (!j || !fromLoc || !toLoc) return;

  try {
    const result = await mapManager.getDirections(fromLoc, toLoc);
    const route  = result.routes[0];
    const leg    = route.legs[0];
    const path   = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));

    state.updateJourney(id, {
      durationText: leg.duration.text,
      distanceText: leg.distance.text,
      summary:      route.summary || '',
      path,
    });

    // Update renderer directly (state:changed already fired via updateJourney)
    const r = _renderers.get(id);
    if (r) {
      r.polyline.setPath(path);
      const midPt = path[Math.floor(path.length / 2)] || path[0];
      r.label.updatePosition(new google.maps.LatLng(midPt.lat, midPt.lng));
    }
  } catch (err) {
    console.warn(`Could not recalculate journey ${id}:`, err.message);
  }
}
