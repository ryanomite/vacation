import * as state      from './state.js';
import * as events     from './events.js';
import * as mapManager from './mapManager.js';
import { generateId, DEFAULT_ICON, DEFAULT_COLOR } from './utils.js';

// locationId → google.maps.Marker
const _markers = new Map();

let _addMode = false;
let _clickHandle = null;

// ── Init ───────────────────────────────────────────────────────────

export function init() {
  // Toolbar "Add Location" button
  document.getElementById('btn-add-location').addEventListener('click', _toggleAddMode);

  // Address search via Places Autocomplete
  mapManager.getAutocomplete().addListener('place_changed', _onPlaceSelected);

  // Keep markers in sync with state changes
  events.on('location:updated', loc => _syncMarker(loc.id));
  events.on('location:deleted', id  => _removeMarker(id));
}

// ── Public API ─────────────────────────────────────────────────────

export function renderAll() {
  state.getLocations().forEach(loc => _addMarker(loc));
  if (state.getLocations().length > 0) {
    mapManager.fitBoundsToLocations(state.getLocations());
  }
}

export function getMarker(id) {
  return _markers.get(id) ?? null;
}

// ── Add mode ───────────────────────────────────────────────────────

function _toggleAddMode() {
  _addMode = !_addMode;
  const btn = document.getElementById('btn-add-location');
  btn.classList.toggle('active', _addMode);
  mapManager.setMapCursor(_addMode ? 'crosshair' : '');

  if (_addMode) {
    events.emit('status:show', {
      message: 'Click anywhere on the map to drop a pin',
      type: 'info',
    });
    _clickHandle = mapManager.addMapClickListener(async e => {
      const latLng = e.latLng;
      const title  = await mapManager.reverseGeocode(latLng);
      _createLocation({ lat: latLng.lat(), lng: latLng.lng(), title });
      _exitAddMode();
    });
  } else {
    _exitAddMode();
  }
}

function _exitAddMode() {
  _addMode = false;
  document.getElementById('btn-add-location').classList.remove('active');
  mapManager.setMapCursor('');
  events.emit('status:hide');
  if (_clickHandle) {
    mapManager.removeListener(_clickHandle);
    _clickHandle = null;
  }
}

// ── Place search ───────────────────────────────────────────────────

function _onPlaceSelected() {
  const place = mapManager.getAutocomplete().getPlace();
  if (!place.geometry?.location) return;
  const loc = place.geometry.location;
  _createLocation({
    lat:   loc.lat(),
    lng:   loc.lng(),
    title: place.name || place.formatted_address || 'New Location',
  });
  // Clear the search field
  document.getElementById('search-input').value = '';
  // Reset autocomplete internal state
  mapManager.getAutocomplete().set('place', null);
}

// ── Create / render ────────────────────────────────────────────────

function _createLocation({ lat, lng, title }) {
  const loc = {
    id:        generateId(),
    title:     title || 'New Location',
    icon:      DEFAULT_ICON,
    color:     DEFAULT_COLOR,
    lat,
    lng,
    startDate: '',
    endDate:   '',
  };
  state.addLocation(loc);
  _addMarker(loc);
  // Open the editor for this location immediately
  events.emit('ui:open-location', loc.id);
}

function _addMarker(loc) {
  const map = mapManager.getMap();

  const marker = new google.maps.Marker({
    position: { lat: loc.lat, lng: loc.lng },
    map,
    title: loc.title,
    label:  mapManager.makeMarkerLabel(loc.icon),
    icon:   mapManager.makeMarkerIcon(loc.color),
    zIndex: 200,
    optimized: false, // needed for emoji labels on some platforms
  });

  marker.addListener('click', () => {
    events.emit('location:map-click', loc.id);
  });

  _markers.set(loc.id, marker);
}

function _syncMarker(id) {
  const loc    = state.getLocation(id);
  const marker = _markers.get(id);
  if (!loc || !marker) return;
  marker.setTitle(loc.title);
  marker.setLabel(mapManager.makeMarkerLabel(loc.icon));
  marker.setIcon(mapManager.makeMarkerIcon(loc.color));
}

function _removeMarker(id) {
  const marker = _markers.get(id);
  if (marker) {
    marker.setMap(null);
    _markers.delete(id);
  }
}
