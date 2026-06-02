// app.js — entry point, boots the entire application

import * as api             from './api.js';
import * as state           from './state.js';
import * as mapManager      from './mapManager.js';
import * as locationManager from './locationManager.js';
import * as journeyManager  from './journeyManager.js';
import * as panels          from './panels.js';
import { _showToast }       from './panels.js';
import { selectVisibleLabels } from './mapLabel.js';
import * as events          from './events.js';
import * as shareManager    from './shareManager.js';

// ── Bootstrap ──────────────────────────────────────────────────────

async function boot() {
  try {
    // 1. Get Maps API key from the server
    const config = await api.getConfig();

    // 2. Dynamically load the Google Maps JS API
    await loadMapsAPI(config.mapsApiKey);

    // 3. Try to load saved state (falls back to localStorage on network error)
    const data = await loadDataWithFallback();
    state.init(data);

    // 4. Initialise the map and all managers
    mapManager.init();
    locationManager.init();
    journeyManager.init();
    panels.init();

    // 5. Render saved locations/journeys
    locationManager.renderAll();
    journeyManager.renderAll();

    // 6. Persist any time state changes (auto-save to localStorage)
    // Full server save is user-triggered via the Save button.
    events.on('state:changed', () => {
      try {
        localStorage.setItem('vacation-data', JSON.stringify(state.serialize()));
      } catch (_) { /* storage full — not critical */ }

      _doSpread();
    });

    // 7. Wire Save button
    document.getElementById('btn-save').addEventListener('click', handleSave);

    // 8. Hide loading screen
    hideLoading();

    // 9. Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .catch(e => console.warn('SW registration failed:', e));
    }

    // 10. Start GPS dot and wire tap → Follow Me
    mapManager.initGeolocation(() => {
      const nowOn = document.getElementById('follow-me-badge').textContent !== 'ON';
      _setFollowMeUI(nowOn);
      mapManager.setFollowMe(nowOn, () => _setFollowMeUI(false));
    });

    // 10b. Init share manager (restores share mode if it was active)
    shareManager.init(mapManager.getMap());

    // 11. Wire dropdown menu
    const menuBtn  = document.getElementById('menu-btn');
    const dropdown = document.getElementById('dropdown-menu');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      const nowHidden = dropdown.classList.toggle('hidden');
      menuBtn.setAttribute('aria-expanded', String(!nowHidden));
    });
    document.addEventListener('click', () => {
      if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    dropdown.addEventListener('click', e => e.stopPropagation());
    ['btn-add-location', 'btn-add-journey', 'btn-agenda', 'btn-save', 'btn-refresh'].forEach(id => {
      document.getElementById(id).addEventListener('click', () => {
        dropdown.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // 12. Edit mode toggle
    document.getElementById('btn-edit-mode').addEventListener('click', () => {
      const editOn = document.getElementById('edit-mode-badge').textContent !== 'ON';
      const badge  = document.getElementById('edit-mode-badge');
      badge.textContent = editOn ? 'ON' : 'OFF';
      badge.classList.toggle('on', editOn);
      document.getElementById('btn-edit-mode').classList.toggle('active', editOn);
      ['btn-add-location', 'btn-add-journey'].forEach(id => {
        document.getElementById(id).disabled = !editOn;
      });
      events.emit('editmode:changed', editOn);
    });

    // 13. Follow Me toggle
    function _setFollowMeUI(on) {
      const badge = document.getElementById('follow-me-badge');
      badge.textContent = on ? 'ON' : 'OFF';
      badge.classList.toggle('on', on);
      document.getElementById('btn-follow-me').classList.toggle('active', on);
    }
    document.getElementById('btn-follow-me').addEventListener('click', () => {
      const nowOn = document.getElementById('follow-me-badge').textContent !== 'ON';
      _setFollowMeUI(nowOn);
      mapManager.setFollowMe(nowOn, () => _setFollowMeUI(false));
      dropdown.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    });

    // 13b. Share Mode toggle
    function _setShareModeUI(on) {
      const badge = document.getElementById('share-mode-badge');
      badge.textContent = on ? 'ON' : 'OFF';
      badge.classList.toggle('on', on);
      document.getElementById('btn-share-mode').classList.toggle('active', on);
    }
    _setShareModeUI(shareManager.isShareMode());
    document.getElementById('btn-share-mode').addEventListener('click', () => {
      const nowOn = shareManager.toggle();
      if (nowOn === false && shareManager.isShareMode()) return; // user cancelled name prompt
      _setShareModeUI(shareManager.isShareMode());
      dropdown.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    });

    // 14. Force Refresh — clear SW caches then reload
    document.getElementById('btn-refresh').addEventListener('click', async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(n => caches.delete(n)));
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.unregister();
      } catch (_) { /* ignore */ }
      window.location.reload();
    });

    // 15. Spread labels after every map render
    mapManager.getMap().addListener('idle', _doSpread);

    // 16. Connect to live-update stream (SSE)
    _connectSSE();

    // 17. Handle requests from panels to activate edit mode
    events.on('ui:activate-edit-mode', () => {
      const badge = document.getElementById('edit-mode-badge');
      if (badge.textContent === 'ON') return; // already on
      badge.textContent = 'ON';
      badge.classList.add('on');
      document.getElementById('btn-edit-mode').classList.add('active');
      ['btn-add-location', 'btn-add-journey'].forEach(id => {
        document.getElementById(id).disabled = false;
      });
      events.emit('editmode:changed', true);
    });

  } catch (err) {
    showError(err);
  }
}

// ── Maps API loader ────────────────────────────────────────────────

function loadMapsAPI(apiKey) {
  return new Promise((resolve, reject) => {
    // Unique callback name avoids conflicts on hot-reload
    const cb = '_googleMapsReady_' + Date.now();
    window[cb] = () => { delete window[cb]; resolve(); };

    const script    = document.createElement('script');
    script.src      = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${cb}`;
    script.async    = true;
    script.defer    = true;
    script.onerror  = () => reject(new Error('Failed to load Google Maps API. Check your API key and network connection.'));
    document.head.appendChild(script);
  });
}

// ── Data loading with localStorage fallback ────────────────────────

async function loadDataWithFallback() {
  try {
    return await api.loadData();
  } catch (err) {
    console.warn('Backend unavailable, falling back to localStorage:', err.message);
    try {
      const raw = localStorage.getItem('vacation-data');
      if (raw) return JSON.parse(raw);
    } catch (_) { /* corrupted */ }
    return { locations: [], journeys: [] };
  }
}

// ── Save handler ───────────────────────────────────────────────────

async function handleSave() {
  const btn = document.getElementById('btn-save');
  btn.classList.add('saving');
  btn.disabled = true;

  try {
    await api.saveData(state.serialize());
    // Also keep localStorage in sync
    localStorage.setItem('vacation-data', JSON.stringify(state.serialize()));
    _showToast('Saved!', 'success', 3000);
  } catch (err) {
    _showToast(`Save failed: ${err.message}`, 'error', 5000);
  } finally {
    btn.classList.remove('saving');
    btn.disabled = false;
  }
}

// ── UI helpers ─────────────────────────────────────────────────────

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('hidden');
  // Remove from DOM after transition
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}

function showError(err) {
  console.error(err);
  document.getElementById('loading-overlay')?.remove();
  const screen = document.getElementById('error-screen');
  const detail = document.getElementById('error-detail');
  if (detail) detail.textContent = err.message;
  screen.classList.remove('hidden');
}

function _doSpread() {
  const locations = state.getLocations();
  const journeys = state.getJourneys();
  const averageJourneyMinutes = _getAverageJourneyMinutes(journeys);
  const dayCounts = _buildDayVisitCounts(locations);

  const labels = [
    ...locationManager.getTitleLabels(),
    ...journeyManager.getJourneyLabels(),
  ];

  labels.forEach(label => {
    const meta = label.getMeta();
    if (!meta) return;

    if (meta.type === 'location') {
      const location = state.getLocation(meta.locationId);
      label.setMeta({ ...meta, priority: _getLocationLabelPriority(location, dayCounts) });
      return;
    }

    if (meta.type === 'journey') {
      const journey = state.getJourney(meta.journeyId);
      label.setMeta({ ...meta, priority: _getJourneyLabelPriority(journey, averageJourneyMinutes) });
    }
  });

  selectVisibleLabels(labels);
}

function _getAverageJourneyMinutes(journeys) {
  const minutes = journeys
    .map(journey => _parseDurationMinutes(journey?.durationText))
    .filter(value => value > 0);

  if (!minutes.length) return 0;
  return minutes.reduce((sum, value) => sum + value, 0) / minutes.length;
}

function _getJourneyLabelPriority(journey, averageJourneyMinutes) {
  if (!journey) return 0;

  const durationMinutes = _parseDurationMinutes(journey.durationText);
  let priority = 35;

  if (averageJourneyMinutes > 0 && durationMinutes > averageJourneyMinutes) {
    priority = 70;
  } else if (averageJourneyMinutes > 0 && durationMinutes > 0 && durationMinutes < averageJourneyMinutes / 2) {
    priority = 10;
  }

  if (!journey.title?.trim()) {
    priority -= 15;
  }

  return priority;
}

function _getLocationLabelPriority(location, dayCounts) {
  if (!location) return 0;

  const visitDates = _getLocationVisitDates(location);
  const spansMultipleDays = visitDates.length > 1;
  const soloDay = visitDates.some(date => dayCounts.get(date) === 1);

  if (spansMultipleDays) return 100;
  if (soloDay) return 80;
  if (visitDates.length > 0) return 55;
  return 40;
}

function _buildDayVisitCounts(locations) {
  const counts = new Map();
  locations.forEach(location => {
    _getLocationVisitDates(location).forEach(date => {
      counts.set(date, (counts.get(date) || 0) + 1);
    });
  });
  return counts;
}

function _getLocationVisitDates(location) {
  if (!location?.startDate) return [];

  const dates = [];
  const endDate = location.endDate && location.endDate >= location.startDate
    ? location.endDate
    : location.startDate;
  const current = new Date(`${location.startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function _parseDurationMinutes(durationText) {
  if (!durationText) return 0;

  const lower = durationText.toLowerCase();
  let total = 0;

  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) total += Number(dayMatch[1]) * 24 * 60;

  const hourMatch = lower.match(/(\d+)\s*hour/);
  if (hourMatch) total += Number(hourMatch[1]) * 60;

  const minuteMatch = lower.match(/(\d+)\s*min/);
  if (minuteMatch) total += Number(minuteMatch[1]);

  return total;
}

// ── Live updates via Server-Sent Events ───────────────────────────

function _connectSSE() {
  if (typeof EventSource === 'undefined') return;
  const es = new EventSource('/api/events');
  es.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'data-changed') _remoteReload();
      if (msg.type === 'user-location') shareManager.updateRemoteUser(msg.name, msg.lat, msg.lng);
    } catch (_) {}
  };
  // EventSource auto-reconnects on its own; no manual retry needed.
}

async function _remoteReload() {
  // Don't interrupt an active edit session
  if (!document.getElementById('right-panel').classList.contains('hidden')) {
    _showToast('Map updated by another device', 'info', 3000);
    return;
  }
  try {
    const data = await api.loadData();
    locationManager.clearAll();
    journeyManager.clearAll();
    state.init(data);
    locationManager.renderAll();
    journeyManager.renderAll();
    try { localStorage.setItem('vacation-data', JSON.stringify(state.serialize())); } catch (_) {}
    _showToast('Map refreshed', 'info', 2000);
  } catch (_) { /* fail silently — network blip */ }
}

// ── Force-reload on BFCache restore (e.g. PWA re-open) ───────────
window.addEventListener('pageshow', e => {
  if (e.persisted) window.location.reload();
});

// ── Screen Wake Lock — prevents device screen-off while app is open ──
let _wakeLock = null;
async function _acquireWakeLock() {
  if (!navigator.wakeLock) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) { /* permission denied or unavailable */ }
}
_acquireWakeLock();
// Wake lock is released automatically when the page is hidden; re-acquire on return
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _acquireWakeLock();
});

// ── PWA install prompt ─────────────────────────────────────────────

let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  // Don't show if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  setTimeout(_showInstallBanner, 2500);
});

function _showInstallBanner() {
  const MAX_SHOWS = 2;
  const key = 'vacation-pwa-prompt-count';
  const count = parseInt(localStorage.getItem(key) || '0', 10);
  if (count >= MAX_SHOWS) return;
  localStorage.setItem(key, String(count + 1));

  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.classList.remove('hidden');

  document.getElementById('btn-install').addEventListener('click', async () => {
    banner.classList.add('hidden');
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') _installPrompt = null;
  }, { once: true });

  document.getElementById('btn-install-dismiss').addEventListener('click', () => {
    banner.classList.add('hidden');
  }, { once: true });
}

// ── Go ─────────────────────────────────────────────────────────────
boot();
