// Custom map overlay that renders a styled pill label at a LatLng position.
// Must be instantiated after Google Maps API is loaded.
//
// Constructor: new MapLabel(lines, position, bgColor, cssClass?)
//   lines    — string or string[] (multiple lines rendered as stacked divs)
//   position — google.maps.LatLng
//   bgColor  — CSS colour string
//   cssClass — CSS class on the container div (default: 'map-journey-label')

let _MapLabelClass = null;

const DEFAULT_MARGIN = 18;
const DEFAULT_SPREAD_PADDING = 6;
const MAX_SPREAD_ITERATIONS = 12;

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getMapLabelClass() {
  if (_MapLabelClass) return _MapLabelClass;

  _MapLabelClass = class MapLabel extends google.maps.OverlayView {
    constructor(lines, position, bgColor, cssClass = 'map-journey-label', onClick = null) {
      super();
      this._lines    = Array.isArray(lines) ? lines : [lines];
      this._position = position;
      this._bgColor  = bgColor;
      this._cssClass = cssClass;
      this._onClick  = onClick;
      this._div      = null;
      this._rawPos   = null;
      this._offset   = { x: 0, y: 0 };
      this._visible  = true;
      this._meta     = null;
    }

    _renderContent() {
      if (!this._div) return;
      this._div.innerHTML = this._lines
        .filter(Boolean)
        .map(l => `<div>${_esc(l)}</div>`)
        .join('');
      this._div.style.backgroundColor = this._bgColor;
    }

    _applyVisibility() {
      if (!this._div) return;
      this._div.style.visibility = this._visible ? 'visible' : 'hidden';
      this._div.style.pointerEvents = this._visible ? '' : 'none';
    }

    onAdd() {
      this._div = document.createElement('div');
      this._div.className = this._cssClass;
      if (this._onClick) {
        this._div.style.cursor = 'pointer';
        this._div.addEventListener('click', e => { e.stopPropagation(); this._onClick(); });
      }
      this._renderContent();
      this._applyVisibility();
      // floatPane sits above the polyline SVG layer, keeping labels readable
      this.getPanes().floatPane.appendChild(this._div);
    }

    draw() {
      if (!this._div || !this._position) return;
      const proj = this.getProjection();
      if (!proj) return;
      const pos = proj.fromLatLngToDivPixel(this._position);
      if (!pos) return;
      this._rawPos = { x: pos.x, y: pos.y };
      this._div.style.left = `${pos.x + this._offset.x}px`;
      this._div.style.top  = `${pos.y + this._offset.y}px`;
    }

    onRemove() {
      if (this._div?.parentNode) {
        this._div.parentNode.removeChild(this._div);
        this._div = null;
      }
    }

    // lines: string or string[], bgColor: CSS string
    update(lines, bgColor) {
      this._lines  = Array.isArray(lines) ? lines : [lines];
      this._bgColor = bgColor;
      this._renderContent();
    }

    updatePosition(position) {
      this._position = position;
      this.draw();
    }

    setOffset(x, y) {
      this._offset = { x, y };
      if (this._div && this._rawPos) {
        this._div.style.left = `${this._rawPos.x + x}px`;
        this._div.style.top  = `${this._rawPos.y + y}px`;
      }
    }

    setVisible(visible) {
      this._visible = visible !== false;
      this._applyVisibility();
    }

    isVisible() {
      return this._visible;
    }

    setMeta(meta) {
      this._meta = meta;
    }

    getMeta() {
      return this._meta;
    }

    getDiv() { return this._div; }
  };

  return _MapLabelClass;
}

// ── Label spreading ────────────────────────────────────────────────
// Iteratively push overlapping labels apart so they don't occlude each other.

export function spreadLabels(labels) {
  if (!labels.length) return;

  labels.forEach(label => {
    label.setVisible(false);
    label.setOffset(0, 0);
  });

  requestAnimationFrame(() => {
    const items = _buildItems(labels);
    _spreadItems(items, DEFAULT_SPREAD_PADDING);
    labels.forEach(label => label.setVisible(true));
    _applyOffsets(items);
  });
}

export function selectVisibleLabels(labels, options = {}) {
  if (!labels.length) return;

  labels.forEach(label => {
    label.setVisible(false);
    label.setOffset(0, 0);
  });

  requestAnimationFrame(() => {
    const margin = options.margin ?? DEFAULT_MARGIN;
    const spreadPadding = options.spreadPadding ?? DEFAULT_SPREAD_PADDING;
    const items = _buildItems(labels).map(item => ({
      ...item,
      priority: Number.isFinite(item.label.getMeta()?.priority) ? item.label.getMeta().priority : 0,
    }));

    if (!items.length) {
      _applyVisibility(labels, new Set());
      return;
    }

    let selected = items.slice();
    let laidOut = selected.map(item => ({ ...item, dx: 0, dy: 0 }));

    while (selected.length > 1) {
      laidOut = selected.map(item => ({ ...item, dx: 0, dy: 0 }));
      _spreadItems(laidOut, spreadPadding);

      const crowdedPairs = _getCrowdedPairs(laidOut, margin);
      if (!crowdedPairs.length) {
        _applyVisibility(labels, new Set(laidOut.map(item => item.label)));
        _applyOffsets(laidOut);
        return;
      }

      const conflicting = new Set();
      crowdedPairs.forEach(([a, b]) => {
        conflicting.add(a.label);
        conflicting.add(b.label);
      });

      const toRemove = selected
        .filter(item => conflicting.has(item.label))
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.index - a.index;
        })[0];

      if (!toRemove) break;
      selected = selected.filter(item => item.label !== toRemove.label);
    }

    const visible = new Set(selected.map(item => item.label));
    _applyVisibility(labels, visible);
    if (selected.length === 1) {
      selected[0].label.setOffset(0, 0);
    }
  });
}

function _buildItems(labels) {
  return labels
    .map((label, index) => {
      const div = label.getDiv();
      if (!div) return null;
      const rect = div.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        index,
        label,
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
        dx: 0,
        dy: 0,
      };
    })
    .filter(Boolean);
}

function _spreadItems(items, padding) {
  for (let iter = 0; iter < MAX_SPREAD_ITERATIONS; iter++) {
    let anyOverlap = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ax1 = a.x + a.dx;
        const ax2 = ax1 + a.w;
        const ay1 = a.y + a.dy;
        const ay2 = ay1 + a.h;
        const bx1 = b.x + b.dx;
        const bx2 = bx1 + b.w;
        const by1 = b.y + b.dy;
        const by2 = by1 + b.h;

        if (ax2 + padding <= bx1 || bx2 + padding <= ax1 || ay2 + padding <= by1 || by2 + padding <= ay1) continue;

        anyOverlap = true;
        const overlapX = Math.min(ax2 - bx1, bx2 - ax1) + padding;
        const overlapY = Math.min(ay2 - by1, by2 - ay1) + padding;
        const push = 0.5;

        if (overlapX < overlapY) {
          const delta = overlapX * push;
          if (ax1 < bx1) {
            a.dx -= delta;
            b.dx += delta;
          } else {
            a.dx += delta;
            b.dx -= delta;
          }
        } else {
          const delta = overlapY * push;
          if (ay1 < by1) {
            a.dy -= delta;
            b.dy += delta;
          } else {
            a.dy += delta;
            b.dy -= delta;
          }
        }
      }
    }
    if (!anyOverlap) break;
  }
}

function _getCrowdedPairs(items, margin) {
  const crowded = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const ax1 = a.x + a.dx;
      const ax2 = ax1 + a.w;
      const ay1 = a.y + a.dy;
      const ay2 = ay1 + a.h;
      const bx1 = b.x + b.dx;
      const bx2 = bx1 + b.w;
      const by1 = b.y + b.dy;
      const by2 = by1 + b.h;

      if (ax2 + margin <= bx1 || bx2 + margin <= ax1 || ay2 + margin <= by1 || by2 + margin <= ay1) continue;
      crowded.push([a, b]);
    }
  }
  return crowded;
}

function _applyOffsets(items) {
  items.forEach(item => item.label.setOffset(item.dx, item.dy));
}

function _applyVisibility(labels, visible) {
  labels.forEach(label => {
    label.setVisible(visible.has(label));
    if (!visible.has(label)) {
      label.setOffset(0, 0);
    }
  });
}
