// app.js — entry point, boots the entire application

import * as api             from './api.js';
import * as state           from './state.js';
import * as mapManager      from './mapManager.js';
import * as locationManager from './locationManager.js';
import * as journeyManager  from './journeyManager.js';
import * as panels          from './panels.js';
import { _showToast }       from './panels.js';
import { spreadLabels }     from './mapLabel.js';

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
    import('./events.js').then(events => {
      events.on('state:changed', () => {
        try {
          localStorage.setItem('vacation-data', JSON.stringify(state.serialize()));
        } catch (_) { /* storage full — not critical */ }

        _doSpread();
      });
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

    // 10. Start GPS dot
    mapManager.initGeolocation();

    // 11. Wire hamburger toggle
    document.getElementById('menu-btn').addEventListener('click', () => {
      document.body.classList.add('toolbar-open');
    });

    // 12. Spread labels after every map render
    mapManager.getMap().addListener('idle', _doSpread);

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
  spreadLabels([
    ...locationManager.getTitleLabels(),
    ...journeyManager.getJourneyLabels(),
  ]);
}

// ── Force-reload on BFCache restore (e.g. PWA re-open) ───────────
window.addEventListener('pageshow', e => {
  if (e.persisted) window.location.reload();
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
