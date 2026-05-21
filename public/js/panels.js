// panels.js — orchestrates all right-panel UI and the journey-creation flow

import * as state           from './state.js';
import * as events          from './events.js';
import * as journeyManager  from './journeyManager.js';
import * as locationManager from './locationManager.js';
import * as mapManager      from './mapManager.js';
import { ICONS, COLORS, DEFAULT_ICON, DEFAULT_JOURNEY_COLOR, formatDate, getIconDef, makeMarkerIconHTML, parseDurationMinutes, formatMinutes, generateId } from './utils.js';

// ── Journey flow state machine ─────────────────────────────────────
// Steps: 'idle' | 'select-from' | 'select-to' | 'select-route'
const _flow = {
  step:         'idle',
  fromId:       null,
  toId:         null,
  routes:       null,       // google.maps.DirectionsRoute[]
  routeIndex:   0,
  color:        DEFAULT_JOURNEY_COLOR,
  date:         '',  title:        '',};

let _currentLocationId = null; // which location the editor is showing
let _currentJourneyId  = null; // which existing journey the editor is showing
let _editMode          = false; // mirrors the global edit mode toggle

// ── Init ───────────────────────────────────────────────────────────

export function init() {
  _buildIconGrid();
  _buildColorGrid('loc-color-grid');
  _buildColorGrid('je-color-grid');
  _buildColorGrid('rp-color-grid');

  _wireLocationEditor();
  _wireJourneyEditor();
  _wireRoutePicker();
  _wirePanelCloseButtons();
  _wireToolbar();
  _wireEvents();
  _updateMenuStats();
}

// ── Event wiring ───────────────────────────────────────────────────

function _wireEvents() {
  // A location marker was clicked on the map
  events.on('location:map-click', id => {
    switch (_flow.step) {
      case 'select-from':
        _flow.fromId = id;
        _flow.step   = 'select-to';
        events.emit('status:show', {
          message: `From "${state.getLocation(id)?.title}" — now click the destination`,
          type: 'info',
        });
        break;

      case 'select-to':
        if (id !== _flow.fromId) {
          _flow.toId = id;
          _startFetchRoutes();
        }
        break;

      default:
        openLocationEditor(id);
    }
  });

  events.on('ui:open-location', id => openLocationEditor(id));
  events.on('ui:open-journey',  id => openJourneyEditor(id));

  events.on('status:show', ({ message, type }) => _showBanner(message, type));
  events.on('status:hide', () => _hideBanner());

  // Keep agenda fresh
  events.on('editmode:changed', enabled => {
    _editMode = enabled;
    if (!enabled) {
      journeyManager.clearPreviews();
      _resetFlow();
    }
  });

  events.on('state:changed', () => {
    if (!document.getElementById('agenda-panel').classList.contains('hidden')) {
      _updateAgenda();
    }
    _updateMenuStats();
  });
}

function _wireToolbar() {
  document.getElementById('btn-add-journey').addEventListener('click', () => {
    _resetFlow();
    _flow.step = 'select-from';
    document.getElementById('btn-add-journey').classList.add('active');
    closeRightPanel();
    events.emit('status:show', {
      message: 'Click a starting location on the map',
      type: 'info',
    });
  });

  document.getElementById('btn-agenda').addEventListener('click', _toggleAgenda);
}

function _wirePanelCloseButtons() {
  document.querySelectorAll('.btn-close-panel').forEach(btn => {
    btn.addEventListener('click', closeRightPanel);
  });
  document.getElementById('modal-backdrop').addEventListener('click', closeRightPanel);
  document.getElementById('btn-close-agenda')?.addEventListener('click', _closeAgenda);
  document.getElementById('btn-status-cancel').addEventListener('click', _cancelFlow);

  // Info modal close
  document.getElementById('btn-close-info-modal').addEventListener('click', _closeInfoModal);
  document.getElementById('info-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeInfoModal();
  });
}

// ── Location Editor ────────────────────────────────────────────────

function _wireLocationEditor() {
  // Live-update title
  document.getElementById('loc-title').addEventListener('input', e => {
    if (!_currentLocationId) return;
    state.updateLocation(_currentLocationId, { title: e.target.value });
  });

  // Date changes
  document.getElementById('loc-start-date').addEventListener('change', e => {
    if (!_currentLocationId) return;
    const prevStart = state.getLocation(_currentLocationId)?.startDate || '';
    const newStart  = e.target.value;
    state.updateLocation(_currentLocationId, { startDate: newStart });
    const endInput = document.getElementById('loc-end-date');
    if (!endInput.value || endInput.value === prevStart) {
      endInput.value = newStart;
      state.updateLocation(_currentLocationId, { endDate: newStart });
    }
    _refreshAgendaIfOpen();
  });
  document.getElementById('loc-end-date').addEventListener('change', e => {
    if (!_currentLocationId) return;
    state.updateLocation(_currentLocationId, { endDate: e.target.value });
    _refreshAgendaIfOpen();
  });

  // Notes
  document.getElementById('loc-notes').addEventListener('input', e => {
    if (!_currentLocationId) return;
    state.updateLocation(_currentLocationId, { notes: e.target.value });
    _refreshAgendaIfOpen();
  });

  // "Journey from here" button
  document.getElementById('btn-journey-from').addEventListener('click', () => {
    const id = _currentLocationId;
    if (!id) return;
    closeRightPanel();
    _resetFlow();
    _flow.step   = 'select-to';
    _flow.fromId = id;
    document.getElementById('btn-add-journey').classList.add('active');
    events.emit('status:show', {
      message: `From "${state.getLocation(id)?.title}" — click the destination`,
      type: 'info',
    });
  });

  // Delete location (with smart merge of adjacent journeys)
  document.getElementById('btn-delete-location').addEventListener('click', async () => {
    if (!_currentLocationId) return;
    if (!confirm('Delete this location? Adjacent journeys on the same date will be merged automatically.')) return;
    await _deleteLocationWithMerge(_currentLocationId);
    closeRightPanel();
  });

  // Copy Google Maps URL
  document.getElementById('btn-copy-maps-url').addEventListener('click', () => {
    if (!_currentLocationId) return;
    const loc = state.getLocation(_currentLocationId);
    if (!loc) return;
    const url = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    navigator.clipboard.writeText(url).then(() => {
      _showToast('Google Maps link copied!', 'success', 2500);
    }).catch(() => {
      _showToast('Could not copy to clipboard', 'error', 3000);
    });
  });
}

async function _deleteLocationWithMerge(id) {
  const journeys = state.getJourneys();
  const incoming = journeys.filter(j => j.toId === id);
  const outgoing = journeys.filter(j => j.fromId === id);
  const toDelete  = new Set();

  for (const jIn of incoming) {
    const jOut = outgoing.find(j => (j.date || '') === (jIn.date || ''));
    if (!jOut) continue;
    const fromLoc = state.getLocation(jIn.fromId);
    const toLoc   = state.getLocation(jOut.toId);
    if (!fromLoc || !toLoc) continue;
    try {
      const result = await mapManager.getDirections(fromLoc, toLoc);
      const route  = result.routes[0];
      state.updateJourney(jOut.id, {
        fromId:       jIn.fromId,
        durationText: route.legs[0].duration.text,
        distanceText: route.legs[0].distance.text,
        summary:      route.summary || '',
        path:         route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() })),
      });
    } catch (_) {
      state.updateJourney(jOut.id, { fromId: jIn.fromId });
    }
    journeyManager.rebuildRenderer(jOut.id);
    toDelete.add(jIn.id);
  }

  toDelete.forEach(jId => state.deleteJourney(jId));
  state.deleteLocation(id);
}

export function openLocationEditor(id) {
  if (!_editMode) {
    _openLocationView(id);
    return;
  }
  const loc = state.getLocation(id);
  if (!loc) return;

  _currentLocationId = id;
  _currentJourneyId  = null;

  document.getElementById('loc-title').value      = loc.title;
  document.getElementById('loc-start-date').value = loc.startDate || '';
  document.getElementById('loc-end-date').value   = loc.endDate   || '';
  document.getElementById('loc-notes').value      = loc.notes     || '';

  // Icon selection
  document.querySelectorAll('#icon-grid .icon-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === loc.icon);
  });

  // Color selection
  document.querySelectorAll('#loc-color-grid .color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === loc.color);
  });

  _showPanelView('location-editor');
  _openRightPanel();
}

// ── Journey Editor (existing journey) ─────────────────────────────

function _wireJourneyEditor() {
  document.getElementById('je-title').addEventListener('input', e => {
    if (!_currentJourneyId) return;
    state.updateJourney(_currentJourneyId, { title: e.target.value });
  });

  document.getElementById('je-date').addEventListener('change', e => {
    if (!_currentJourneyId) return;
    state.updateJourney(_currentJourneyId, { date: e.target.value });
    _refreshAgendaIfOpen();
  });

  document.getElementById('btn-save-journey').addEventListener('click', () => {
    closeRightPanel();
  });

  document.getElementById('btn-delete-journey').addEventListener('click', () => {
    if (!_currentJourneyId) return;
    if (!confirm('Delete this journey?')) return;
    state.deleteJourney(_currentJourneyId);
    closeRightPanel();
  });

  const addStopInput = document.getElementById('je-add-stop');
  if (addStopInput) {
    const addStopAC = mapManager.createAutocomplete(addStopInput);
    addStopAC.addListener('place_changed', async () => {
      const place = addStopAC.getPlace();
      if (!place?.geometry?.location) return;
      addStopInput.value = '';
      await _addStopToJourney(place);
    });
  }
}

async function _addStopToJourney(place) {
  const jId = _currentJourneyId;
  const j   = state.getJourney(jId);
  if (!j || !place?.geometry?.location) return;

  const origToId  = j.toId;
  const origToLoc = state.getLocation(origToId);
  const fromLoc   = state.getLocation(j.fromId);
  if (!fromLoc || !origToLoc) return;

  events.emit('status:show', { message: 'Adding stop and recalculating routes…', type: 'info' });

  const newLoc = {
    id:        generateId(),
    title:     place.name || place.formatted_address || 'New Stop',
    icon:      DEFAULT_ICON,
    color:     j.color,
    lat:       place.geometry.location.lat(),
    lng:       place.geometry.location.lng(),
    startDate: j.date || '',
    endDate:   j.date || '',
    notes:     '',
  };
  state.addLocation(newLoc);
  locationManager.renderLocation(newLoc);

  try {
    const r1  = await mapManager.getDirections(fromLoc, newLoc);
    const rt1 = r1.routes[0];
    state.updateJourney(jId, {
      toId:         newLoc.id,
      durationText: rt1.legs[0].duration.text,
      distanceText: rt1.legs[0].distance.text,
      summary:      rt1.summary || '',
      path:         rt1.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() })),
    });
    journeyManager.rebuildRenderer(jId);

    const r2  = await mapManager.getDirections(newLoc, origToLoc);
    const rt2 = r2.routes[0];
    const newJ = {
      id:           generateId(),
      fromId:       newLoc.id,
      toId:         origToId,
      title:        '',
      date:         j.date || '',
      color:        j.color,
      durationText: rt2.legs[0].duration.text,
      distanceText: rt2.legs[0].distance.text,
      summary:      rt2.summary || '',
      path:         rt2.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() })),
    };
    state.addJourney(newJ);
    journeyManager.rebuildRenderer(newJ.id);
  } catch (err) {
    _showToast(`Could not add stop: ${err.message}`, 'error', 4000);
    events.emit('status:hide');
    return;
  }

  events.emit('status:hide');
  closeRightPanel();
  events.emit('ui:open-location', newLoc.id);
}

export function openJourneyEditor(id) {
  if (!_editMode) {
    _openJourneyView(id);
    return;
  }
  const j     = state.getJourney(id);
  const fromL = state.getLocation(j?.fromId);
  const toL   = state.getLocation(j?.toId);
  if (!j || !fromL || !toL) return;

  _currentJourneyId  = id;
  _currentLocationId = null;

  document.getElementById('je-from-name').textContent = fromL.title;
  document.getElementById('je-to-name').textContent   = toL.title;
  document.getElementById('je-meta').textContent =
    [j.durationText, j.distanceText, j.summary ? `via ${j.summary}` : '']
      .filter(Boolean).join(' · ');
  document.getElementById('je-title').value = j.title || '';
  document.getElementById('je-date').value  = j.date  || '';

  document.querySelectorAll('#je-color-grid .color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === j.color);
  });

  _showPanelView('journey-editor');
  _openRightPanel();
}

// ── Info Modal (view-only — non-edit mode) ─────────────────────────

function _openLocationView(id) {
  const loc = state.getLocation(id);
  if (!loc) return;
  _currentLocationId = id;
  _currentJourneyId  = null;

  const iconDef   = getIconDef(loc.icon);
  const markerSvg = makeMarkerIconHTML(loc.color, iconDef, 52);

  let dateStr = '';
  if (loc.startDate && loc.endDate && loc.startDate !== loc.endDate) {
    dateStr = `${formatDate(loc.startDate)} – ${formatDate(loc.endDate)}`;
  } else if (loc.startDate) {
    dateStr = formatDate(loc.startDate);
  }

  const body = document.getElementById('info-modal-body');
  body.innerHTML = `
    <div class="info-modal-header">
      <div class="info-modal-marker">${markerSvg}</div>
      <div class="info-modal-title">${_esc(loc.title || 'Untitled')}</div>
    </div>
    ${dateStr ? `<div class="info-modal-dates">${dateStr}</div>` : ''}
    ${loc.notes ? `<div class="info-modal-notes">${_esc(loc.notes)}</div>` : ''}
    <button class="info-modal-btn info-modal-btn--edit" id="info-modal-edit-btn">✏️ &nbsp;Edit</button>
    <button class="info-modal-btn" id="info-modal-maps-btn">🗺️ &nbsp;Copy Google Maps link</button>
  `;

  body.querySelector('#info-modal-edit-btn').addEventListener('click', () => {
    const savedId = id;
    _closeInfoModal();
    events.emit('ui:activate-edit-mode');
    openLocationEditor(savedId);
  });

  body.querySelector('#info-modal-maps-btn').addEventListener('click', () => {
    const url = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    navigator.clipboard.writeText(url)
      .then(() => _showToast('Google Maps link copied!', 'success', 2500))
      .catch(() => _showToast('Could not copy to clipboard', 'error', 3000));
  });

  _openInfoModal();
}

function _openJourneyView(id) {
  const j     = state.getJourney(id);
  const fromL = state.getLocation(j?.fromId);
  const toL   = state.getLocation(j?.toId);
  if (!j || !fromL || !toL) return;
  _currentJourneyId  = id;
  _currentLocationId = null;

  const meta    = [j.durationText, j.distanceText, j.summary ? `via ${j.summary}` : ''].filter(Boolean).join(' · ');
  const dateStr = j.date ? formatDate(j.date) : '';

  const body = document.getElementById('info-modal-body');
  body.innerHTML = `
    <div class="info-modal-journey-header">
      <span class="info-modal-journey-dot" style="background:${j.color}"></span>
      <span>${_esc(fromL.title)} → ${_esc(toL.title)}</span>
    </div>
    ${meta    ? `<div class="info-modal-meta">${meta}</div>` : ''}
    ${dateStr ? `<div class="info-modal-dates">${dateStr}</div>` : ''}
    <button class="info-modal-btn info-modal-btn--edit" id="info-modal-edit-btn">✏️ &nbsp;Edit</button>
    <button class="info-modal-btn" id="info-modal-dir-btn">🗺️ &nbsp;Copy Google Maps directions</button>
  `;

  body.querySelector('#info-modal-edit-btn').addEventListener('click', () => {
    const savedId = id;
    _closeInfoModal();
    events.emit('ui:activate-edit-mode');
    openJourneyEditor(savedId);
  });

  body.querySelector('#info-modal-dir-btn').addEventListener('click', () => {
    const url = `https://www.google.com/maps/dir/${fromL.lat},${fromL.lng}/${toL.lat},${toL.lng}`;
    navigator.clipboard.writeText(url)
      .then(() => _showToast('Directions link copied!', 'success', 2500))
      .catch(() => _showToast('Could not copy to clipboard', 'error', 3000));
  });

  _openInfoModal();
}

function _openInfoModal() {
  document.getElementById('info-modal').classList.remove('hidden');
}

function _closeInfoModal() {
  document.getElementById('info-modal').classList.add('hidden');
  _currentLocationId = null;
  _currentJourneyId  = null;
}

// ── Route Picker (new journey) ─────────────────────────────────────

function _wireRoutePicker() {
  document.getElementById('rp-date').addEventListener('change', e => {
    _flow.date = e.target.value;
  });

  document.getElementById('rp-title').addEventListener('input', e => {
    _flow.title = e.target.value;
  });

  document.getElementById('btn-confirm-journey').addEventListener('click', () => {
    if (!_flow.routes) return;
    const journey = journeyManager.confirmJourney({
      fromId: _flow.fromId,
      toId:   _flow.toId,
      route:  _flow.routes[_flow.routeIndex],
      color:  _flow.color,
      date:   _flow.date,
      title:  _flow.title,
    });
    _resetFlow();
    closeRightPanel();
    _showToast(`Journey added (${journey.durationText})`, 'success');
  });

  document.getElementById('btn-cancel-route').addEventListener('click', () => {
    journeyManager.clearPreviews();
    _resetFlow();
    closeRightPanel();
  });
}

async function _startFetchRoutes() {
  const fromLoc = state.getLocation(_flow.fromId);
  const toLoc   = state.getLocation(_flow.toId);
  if (!fromLoc || !toLoc) return;

  events.emit('status:show', { message: 'Getting directions…', type: 'info' });

  try {
    const routes = await journeyManager.fetchRoutes(fromLoc, toLoc);
    _flow.routes     = routes;
    _flow.routeIndex = 0;
    _flow.color      = DEFAULT_JOURNEY_COLOR;
    _flow.step       = 'select-route';

    journeyManager.previewRoutes(routes);
    events.emit('status:hide');

    _populateRoutePicker(routes, fromLoc, toLoc);
    _showPanelView('route-picker-panel');
    _openRightPanel();
  } catch (err) {
    events.emit('status:hide');
    _showToast(`Directions failed: ${err.message}`, 'error');
    _resetFlow();
  }
}

function _populateRoutePicker(routes, fromLoc, toLoc) {
  document.getElementById('rp-from-name').textContent = fromLoc.title;
  document.getElementById('rp-to-name').textContent   = toLoc.title;
  document.getElementById('rp-date').value  = _flow.date  || '';
  document.getElementById('rp-title').value = '';
  _flow.title = '';

  // Highlight selected color swatch
  document.querySelectorAll('#rp-color-grid .color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === _flow.color);
  });

  const container = document.getElementById('route-options');
  container.innerHTML = '';

  routes.forEach((route, i) => {
    const leg     = route.legs[0];
    const summary = route.summary ? `via ${route.summary}` : 'Route';

    const option = document.createElement('label');
    option.className = `route-option${i === 0 ? ' selected' : ''}`;

    option.innerHTML = `
      <input type="radio" name="route" value="${i}" ${i === 0 ? 'checked' : ''}>
      <div class="route-option-info">
        <div class="route-option-summary">${summary}</div>
        <div class="route-option-detail">${leg.duration.text} · ${leg.distance.text}</div>
      </div>
      ${i === 0 ? '<span class="route-option-badge">Fastest</span>' : ''}
    `;

    option.querySelector('input').addEventListener('change', () => {
      _flow.routeIndex = i;
      container.querySelectorAll('.route-option').forEach((o, j) => {
        o.classList.toggle('selected', j === i);
      });
      journeyManager.highlightPreview(i);
    });

    container.appendChild(option);
  });
}

// ── Agenda ─────────────────────────────────────────────────────────

function _toggleAgenda() {
  const panel = document.getElementById('agenda-panel');
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    _updateAgenda();
    panel.classList.remove('hidden');
    document.getElementById('btn-agenda').classList.add('active');
  } else {
    _closeAgenda();
  }
}

function _closeAgenda() {
  document.getElementById('agenda-panel').classList.add('hidden');
  document.getElementById('btn-agenda').classList.remove('active');
}

function _refreshAgendaIfOpen() {
  if (!document.getElementById('agenda-panel').classList.contains('hidden')) {
    _updateAgenda();
  }
}

function _updateAgenda() {
  const content   = document.getElementById('agenda-content');
  const locations = state.getLocations();
  const journeys  = state.getJourneys();

  // Build a map of date → { locations[], journeys[] }
  const days = new Map();

  const ensureDay = d => {
    if (!days.has(d)) days.set(d, { locations: [], journeys: [] });
    return days.get(d);
  };

  locations.forEach(loc => {
    if (!loc.startDate) return;
    const end = (loc.endDate && loc.endDate >= loc.startDate) ? loc.endDate : loc.startDate;
    const [sy, sm, sd] = loc.startDate.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const cur  = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    while (cur <= last) {
      ensureDay(cur.toISOString().slice(0, 10)).locations.push(loc);
      cur.setDate(cur.getDate() + 1);
    }
  });

  journeys.forEach(j => {
    if (!j.date) return;
    const fromL = locations.find(l => l.id === j.fromId);
    const toL   = locations.find(l => l.id === j.toId);
    ensureDay(j.date).journeys.push({ journey: j, fromL, toL });
  });

  const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (sorted.length === 0) {
    content.innerHTML = `<div class="agenda-empty">No dates set yet.<br>Add locations and assign dates to see your itinerary here.</div>`;
    return;
  }

  content.innerHTML = '';
  sorted.forEach(([date, { locations: locs, journeys: jrns }]) => {
    const dayEl = document.createElement('div');
    dayEl.className = 'agenda-day';

    const header = document.createElement('div');
    header.className = 'agenda-day-header';
    header.textContent = formatDate(date);
    dayEl.appendChild(header);

    _buildOrderedDayItems(locs, jrns).forEach(item => {
      const el = document.createElement('div');
      el.className = 'agenda-item';

      if (item.type === 'loc') {
        const loc     = item.data;
        const iconDef = getIconDef(loc.icon);
        let iconHtml;
        if (iconDef?.path) {
          iconHtml = `<svg class="agenda-item-icon-svg" style="color:${loc.color}" viewBox="0 0 ${iconDef.width} 512"><path fill="currentColor" d="${iconDef.path}"/></svg>`;
        } else if (iconDef?.text) {
          iconHtml = `<svg class="agenda-item-icon-svg" style="color:${loc.color}" viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${iconDef.text}</text></svg>`;
        } else {
          iconHtml = `<span class="agenda-item-dot" style="background:${loc.color}"></span>`;
        }
        el.innerHTML = `
          ${iconHtml}
          <div class="agenda-item-body">
            <div class="agenda-item-title">${_esc(loc.title)}</div>
            ${loc.startDate !== loc.endDate && loc.endDate
              ? `<div class="agenda-item-detail">Stay: ${formatDate(loc.startDate)} \u2013 ${formatDate(loc.endDate)}</div>`
              : ''}
            ${loc.notes ? `<div class="agenda-item-notes">${_esc(loc.notes)}</div>` : ''}
          </div>
        `;
        el.addEventListener('click', () => events.emit('ui:open-location', loc.id));
      } else {
        const { journey: j } = item.data;
        el.innerHTML = `
          <span class="agenda-journey-dot" style="background:${j.color}"></span>
          <div class="agenda-item-body">
            <div class="agenda-item-detail">${j.durationText} \u00b7 ${j.distanceText}${j.summary ? ` \u00b7 via ${_esc(j.summary)}` : ''}</div>
          </div>
        `;
        el.addEventListener('click', () => events.emit('ui:open-journey', j.id));
      }

      dayEl.appendChild(el);
    });

    content.appendChild(dayEl);
  });

  // Stats footer
  const { days: totalDays, driveTime, locations: totalLocs } = _computeStats();
  const statsEl = document.createElement('div');
  statsEl.className = 'agenda-stats';
  statsEl.innerHTML = `
    <div class="agenda-stat"><span class="agenda-stat-value">${totalLocs}</span><span class="agenda-stat-label">Stops</span></div>
    <div class="agenda-stat"><span class="agenda-stat-value">${totalDays}</span><span class="agenda-stat-label">Days</span></div>
    <div class="agenda-stat"><span class="agenda-stat-value">${driveTime}</span><span class="agenda-stat-label">Driving</span></div>
  `;
  content.appendChild(statsEl);
}

// ── Stats ─────────────────────────────────────────────────────────

function _computeStats() {
  const locations = state.getLocations();
  const journeys  = state.getJourneys();

  const dates = new Set();
  locations.forEach(loc => {
    if (!loc.startDate) return;
    const end = (loc.endDate && loc.endDate >= loc.startDate) ? loc.endDate : loc.startDate;
    const [sy, sm, sd] = loc.startDate.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const cur  = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    while (cur <= last) {
      dates.add(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  });
  journeys.forEach(j => { if (j.date) dates.add(j.date); });

  const totalMins = journeys.reduce((acc, j) => acc + parseDurationMinutes(j.durationText), 0);

  return {
    days:      dates.size,
    driveTime: formatMinutes(totalMins),
    locations: locations.length,
  };
}

function _updateMenuStats() {
  const { days, driveTime, locations: locs } = _computeStats();
  const el = document.getElementById('menu-stats');
  if (!el) return;
  el.querySelector('#stat-locs').textContent  = locs;
  el.querySelector('#stat-days').textContent  = days;
  el.querySelector('#stat-drive').textContent = driveTime;
}

// ── Panel visibility helpers ───────────────────────────────────────

function _showPanelView(viewId) {
  document.querySelectorAll('#right-panel .panel-view').forEach(v => {
    v.classList.toggle('hidden', v.id !== viewId);
  });
}

function _openRightPanel() {
  document.getElementById('right-panel').classList.remove('hidden');
  document.getElementById('modal-backdrop').classList.add('active');
}

export function closeRightPanel() {
  document.getElementById('right-panel').classList.add('hidden');
  document.getElementById('modal-backdrop').classList.remove('active');
  // If we were in a journey flow, cancel it
  if (_flow.step !== 'idle') {
    journeyManager.clearPreviews();
    _resetFlow();
  }
  _currentLocationId = null;
  _currentJourneyId  = null;
}

function _resetFlow() {
  _flow.step       = 'idle';
  _flow.fromId     = null;
  _flow.toId       = null;
  _flow.routes     = null;
  _flow.routeIndex = 0;
  _flow.date       = '';
  _flow.title      = '';
  document.getElementById('btn-add-journey').classList.remove('active');
  events.emit('status:hide');
}

function _cancelFlow() {
  journeyManager.clearPreviews();
  _resetFlow();
  _hideBanner();
}

// ── Icon / color builders ──────────────────────────────────────────

function _buildIconGrid() {
  const grid = document.getElementById('icon-grid');
  ICONS.forEach(iconDef => {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.dataset.icon = iconDef.id;
    btn.title = iconDef.label;

    if (!iconDef.path && !iconDef.text) {
      // "None" — circle with diagonal slash
      btn.innerHTML = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="10"/><line x1="9" y1="9" x2="23" y2="23"/></svg>`;
    } else if (iconDef.text) {
      btn.innerHTML = `<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="15" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700" fill="currentColor">${iconDef.text}</text></svg>`;
    } else {
      btn.innerHTML = `<svg viewBox="0 0 ${iconDef.width} 512"><path fill="currentColor" d="${iconDef.path}"/></svg>`;
    }

    btn.addEventListener('click', () => {
      if (!_currentLocationId) return;
      state.updateLocation(_currentLocationId, { icon: iconDef.id });
      grid.querySelectorAll('.icon-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.icon === iconDef.id);
      });
    });
    grid.appendChild(btn);
  });
}

function _buildColorGrid(containerId) {
  const grid = document.getElementById(containerId);
  COLORS.forEach(color => {
    const sw = document.createElement('button');
    sw.className = 'color-swatch';
    sw.style.background = color;
    sw.dataset.color = color;
    sw.title = color;
    sw.addEventListener('click', () => _onColorClick(containerId, color, sw));
    grid.appendChild(sw);
  });
}

function _onColorClick(gridId, color, clickedSwatch) {
  const grid = document.getElementById(gridId);
  grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  clickedSwatch.classList.add('selected');

  if (gridId === 'loc-color-grid' && _currentLocationId) {
    state.updateLocation(_currentLocationId, { color });
  } else if (gridId === 'je-color-grid' && _currentJourneyId) {
    state.updateJourney(_currentJourneyId, { color });
  } else if (gridId === 'rp-color-grid') {
    _flow.color = color;
  }
}

// ── Status banner ──────────────────────────────────────────────────

function _showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  document.getElementById('status-message').textContent = message;
  banner.className = type === 'error' ? 'error' : '';
  banner.classList.remove('hidden');
}

function _hideBanner() {
  document.getElementById('status-banner').classList.add('hidden');
}

// ── Toast ──────────────────────────────────────────────────────────

let _toastTimer = null;

export function _showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = type;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ── Utility ────────────────────────────────────────────────────────

/**
 * Order a day's locations and journeys so that journeys appear between
 * their from/to locations when both are on the same day.
 * Falls back to [all locs, all journeys] if no linking is possible.
 */
function _buildOrderedDayItems(locs, jrns) {
  const locIds = new Set(locs.map(l => l.id));

  // Journeys where both endpoints appear on this day
  const linked   = jrns.filter(({ fromL, toL }) =>
    fromL && toL && locIds.has(fromL.id) && locIds.has(toL.id));
  const unlinked = jrns.filter(({ fromL, toL }) =>
    !(fromL && toL && locIds.has(fromL.id) && locIds.has(toL.id)));

  if (linked.length === 0) {
    return [
      ...locs.map(l => ({ type: 'loc', data: l })),
      ...jrns.map(j => ({ type: 'journey', data: j })),
    ];
  }

  // fromId → journey entry
  const fromMap = new Map();
  linked.forEach(j => fromMap.set(j.fromL.id, j));

  // Locations that are destinations (don't start chains)
  const toSet = new Set(linked.map(j => j.toL.id));

  const result = [];
  const placed = new Set();

  // Walk chains starting from non-destination locations
  const startLocs = locs.filter(l => !toSet.has(l.id));
  const starts    = startLocs.length > 0 ? startLocs : locs;

  for (const start of starts) {
    if (placed.has(start.id)) continue;
    result.push({ type: 'loc', data: start });
    placed.add(start.id);

    let cur     = start;
    const seen  = new Set([start.id]); // cycle guard
    while (fromMap.has(cur.id)) {
      const entry = fromMap.get(cur.id);
      result.push({ type: 'journey', data: entry });
      const next = entry.toL;
      if (!placed.has(next.id)) {
        result.push({ type: 'loc', data: next });
        placed.add(next.id);
      }
      if (seen.has(next.id)) break;
      seen.add(next.id);
      cur = next;
    }
  }

  // Any locations not yet placed
  locs.filter(l => !placed.has(l.id)).forEach(l => {
    result.push({ type: 'loc', data: l });
  });

  // Unlinked journeys at end
  unlinked.forEach(j => result.push({ type: 'journey', data: j }));

  return result;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
