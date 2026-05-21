// shareManager.js — Share Mode: broadcast own location, display remote users on map

const SHARE_MODE_KEY = 'share-mode';
const SHARE_NAME_KEY = 'share-name';
const SHARE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SHARE_CACHE    = 'share-data-v1';

let _map        = null;
let _watchId    = null;
let _intervalId = null;
let _lastPos    = null;

// name → { dot, label, overlay } for remote users
const _remoteOverlays = new Map();

// ── Public API ─────────────────────────────────────────────────────

export function isShareMode() {
  return localStorage.getItem(SHARE_MODE_KEY) === '1';
}

export function getName() {
  return localStorage.getItem(SHARE_NAME_KEY) || '';
}

export function init(map) {
  _map = map;
  if (isShareMode()) _start();
}

export function toggle() {
  if (isShareMode()) {
    localStorage.setItem(SHARE_MODE_KEY, '0');
    _stop();
    return false;
  } else {
    let name = getName();
    if (!name) {
      name = (prompt('Enter your first name to share your location:') || '').trim();
      if (!name) return false; // user cancelled
      localStorage.setItem(SHARE_NAME_KEY, name);
    }
    localStorage.setItem(SHARE_MODE_KEY, '1');
    _start();
    return true;
  }
}

export function updateRemoteUser(name, lat, lng) {
  if (!_map) return;
  const latLng = new google.maps.LatLng(lat, lng);

  if (_remoteOverlays.has(name)) {
    const entry = _remoteOverlays.get(name);
    entry.latLng = latLng;
    entry.overlay.draw();
    return;
  }

  // Build the DOM elements
  const wrap  = document.createElement('div');
  wrap.className = 'remote-user-wrap';

  const label = document.createElement('div');
  label.className = 'remote-user-label';
  label.textContent = name;

  const dot   = document.createElement('div');
  dot.className = 'remote-user-dot';

  wrap.appendChild(label);
  wrap.appendChild(dot);

  const entry = { latLng, overlay: null };

  const overlay = new google.maps.OverlayView();
  overlay.onAdd = function () {
    this.getPanes().floatPane.appendChild(wrap);
  };
  overlay.draw = function () {
    const proj = this.getProjection();
    if (!proj) return;
    const point = proj.fromLatLngToDivPixel(entry.latLng);
    wrap.style.left = point.x + 'px';
    wrap.style.top  = point.y + 'px';
  };
  overlay.onRemove = function () { wrap.remove(); };

  entry.overlay = overlay;
  overlay.setMap(_map);

  _remoteOverlays.set(name, entry);
}

// ── Private ────────────────────────────────────────────────────────

function _start() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    pos => { _lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; _notifySW(); },
    () => {},
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
  );

  _watchId = navigator.geolocation.watchPosition(
    pos => {
      _lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      _notifySW();
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 60000 }
  );

  _postLocation();
  _intervalId = setInterval(_postLocation, SHARE_INTERVAL);
  _registerPeriodicSync();
}

function _stop() {
  if (_watchId    !== null) navigator.geolocation.clearWatch(_watchId);
  if (_intervalId !== null) clearInterval(_intervalId);
  _watchId    = null;
  _intervalId = null;
  _lastPos    = null;
}

async function _postLocation() {
  if (!_lastPos) return;
  const name = getName();
  if (!name) return;
  try {
    await fetch('/api/location', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, lat: _lastPos.lat, lng: _lastPos.lng }),
    });
  } catch (_) {}
}

function _notifySW() {
  if (!navigator.serviceWorker?.controller || !_lastPos) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'share-location-update',
    name: getName(),
    lat:  _lastPos.lat,
    lng:  _lastPos.lng,
  });
}

async function _registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state === 'granted') {
      await reg.periodicSync.register('share-location', { minInterval: SHARE_INTERVAL });
    }
  } catch (_) {}
}
