import * as state      from './state.js';
import * as events     from './events.js';
import * as mapManager from './mapManager.js';
import { getMapLabelClass } from './mapLabel.js';
import { generateId, DEFAULT_ICON, DEFAULT_COLOR } from './utils.js';

// locationId → google.maps.Marker
const _markers = new Map();
// locationId → MapLabel (title overlay above marker)
const _titleLabels = new Map();

let _addMode    = false;
let _clickHandle = null;
let _editingId  = null; // which location is currently open in the editor

// ── Init ───────────────────────────────────────────────────────────

export function init() {
  document.getElementById('btn-add-location').addEventListener('click', _toggleAddMode);

  mapManager.getAutocomplete().addListener('place_changed', _onPlaceSelected);

  // Move-to-place search inside the location editor
  const moveInput = document.getElementById('loc-move-search');
  const moveAC    = mapManager.createAutocomplete(moveInput);
  moveAC.addListener('place_changed', () => {
    if (!_editingId) return;
    const place = moveAC.getPlace();
    if (!place?.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    _moveLocation(_editingId, lat, lng, true);
    moveInput.value = '';
    moveAC.set('place', null);
  });

  // Track which location is open in the editor
  events.on('ui:open-location', id => { _editingId = id; });

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
    events.emit('status:show', { message: 'Click anywhere on the map to drop a pin', type: 'info' });
    _clickHandle = mapManager.addMapClickListener(async e => {
      if (e.placeId) e.stop(); // prevent default POI info window
      const latLng = e.latLng;
      if (e.placeId) {
        events.emit('status:show', { message: 'Loading place details…', type: 'info' });
        try {
          const place = await mapManager.getPlaceDetails(e.placeId);
          const notes = [place.formatted_address, place.formatted_phone_number]
            .filter(Boolean).join('\n');
          _createLocation({
            lat:   place.geometry.location.lat(),
            lng:   place.geometry.location.lng(),
            title: place.name || 'New Location',
            notes,
          });
        } catch (_) {
          const title = await mapManager.reverseGeocode(latLng);
          _createLocation({ lat: latLng.lat(), lng: latLng.lng(), title });
        }
      } else {
        const title = await mapManager.reverseGeocode(latLng);
        _createLocation({ lat: latLng.lat(), lng: latLng.lng(), title });
      }
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

// ── Place search (toolbar) ─────────────────────────────────────────

function _onPlaceSelected() {
  const place = mapManager.getAutocomplete().getPlace();
  if (!place.geometry?.location) return;
  const loc = place.geometry.location;
  _createLocation({
    lat:   loc.lat(),
    lng:   loc.lng(),
    title: place.name || place.formatted_address || 'New Location',
  });
  document.getElementById('search-input').value = '';
  mapManager.getAutocomplete().set('place', null);
}

// ── Create ─────────────────────────────────────────────────────────

function _createLocation({ lat, lng, title, notes = '' }) {
  const loc = {
    id:        generateId(),
    title:     title || 'New Location',
    icon:      DEFAULT_ICON,
    color:     DEFAULT_COLOR,
    lat,
    lng,
    startDate: '',
    endDate:   '',
    notes,
  };
  state.addLocation(loc);
  _addMarker(loc);
  events.emit('ui:open-location', loc.id);
}

// ── Move location (drag or search) ────────────────────────────────

function _moveLocation(id, lat, lng, panMap = false) {
  state.updateLocation(id, { lat, lng });
  const marker     = _markers.get(id);
  const titleLabel = _titleLabels.get(id);
  const latLng     = new google.maps.LatLng(lat, lng);
  if (marker)     marker.setPosition(latLng);
  if (titleLabel) titleLabel.updatePosition(latLng);
  if (panMap)     mapManager.getMap().panTo(latLng);
  events.emit('location:moved', { id });
}

// ── Marker & title label ───────────────────────────────────────────

function _addMarker(loc) {
  const map = mapManager.getMap();

  const marker = new google.maps.Marker({
    position:  { lat: loc.lat, lng: loc.lng },
    map,
    title:     loc.title,
    label:     mapManager.makeMarkerLabel(loc.icon),
    icon:      mapManager.makeMarkerIcon(loc.color),
    zIndex:    200,
    draggable: true,
    optimized: false,
  });

  marker.addListener('click', () => {
    events.emit('location:map-click', loc.id);
  });

  marker.addListener('dragend', () => {
    const pos = marker.getPosition();
    _moveLocation(loc.id, pos.lat(), pos.lng());
  });

  // Title overlay above the marker
  const MapLabel   = getMapLabelClass();
  const titleLabel = new MapLabel(
    [loc.title],
    new google.maps.LatLng(loc.lat, loc.lng),
    'rgba(15,23,42,0.82)',
    'map-location-label'
  );
  titleLabel.setMap(map);

  _markers.set(loc.id, marker);
  _titleLabels.set(loc.id, titleLabel);
}

function _syncMarker(id) {
  const loc    = state.getLocation(id);
  const marker = _markers.get(id);
  if (!loc || !marker) return;
  marker.setTitle(loc.title);
  marker.setLabel(mapManager.makeMarkerLabel(loc.icon));
  marker.setIcon(mapManager.makeMarkerIcon(loc.color));
  const titleLabel = _titleLabels.get(id);
  if (titleLabel) titleLabel.update([loc.title], 'rgba(15,23,42,0.82)');
}

function _removeMarker(id) {
  const marker = _markers.get(id);
  if (marker) { marker.setMap(null); _markers.delete(id); }
  const titleLabel = _titleLabels.get(id);
  if (titleLabel) { titleLabel.setMap(null); _titleLabels.delete(id); }
}
