// Custom map overlay that renders a styled pill label at a LatLng position.
// Must be instantiated after Google Maps API is loaded.
//
// Constructor: new MapLabel(lines, position, bgColor, cssClass?)
//   lines    — string or string[] (multiple lines rendered as stacked divs)
//   position — google.maps.LatLng
//   bgColor  — CSS colour string
//   cssClass — CSS class on the container div (default: 'map-journey-label')

let _MapLabelClass = null;

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
    }

    _renderContent() {
      if (!this._div) return;
      this._div.innerHTML = this._lines
        .filter(Boolean)
        .map(l => `<div>${_esc(l)}</div>`)
        .join('');
      this._div.style.backgroundColor = this._bgColor;
    }

    onAdd() {
      this._div = document.createElement('div');
      this._div.className = this._cssClass;
      if (this._onClick) {
        this._div.style.cursor = 'pointer';
        this._div.addEventListener('click', e => { e.stopPropagation(); this._onClick(); });
      }
      this._renderContent();
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

    getDiv() { return this._div; }
  };

  return _MapLabelClass;
}

// ── Label spreading ────────────────────────────────────────────────
// Iteratively push overlapping labels apart so they don't occlude each other.

export function spreadLabels(labels) {
  if (!labels.length) return;

  // Reset to natural positions first
  labels.forEach(l => l.setOffset(0, 0));

  // Read positions after browser applies the style update, then spread
  requestAnimationFrame(() => {
    const PAD = 6; // px padding between labels

    const items = labels
      .map(l => {
        const div = l.getDiv();
        if (!div) return null;
        const r = div.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { label: l, x: r.left, y: r.top, w: r.width, h: r.height, dx: 0, dy: 0 };
      })
      .filter(Boolean);

    for (let iter = 0; iter < 12; iter++) {
      let anyOverlap = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          const ax1 = a.x + a.dx, ax2 = ax1 + a.w;
          const ay1 = a.y + a.dy, ay2 = ay1 + a.h;
          const bx1 = b.x + b.dx, bx2 = bx1 + b.w;
          const by1 = b.y + b.dy, by2 = by1 + b.h;

          if (ax2 + PAD <= bx1 || bx2 + PAD <= ax1 || ay2 + PAD <= by1 || by2 + PAD <= ay1) continue;

          anyOverlap = true;
          const overlapX = Math.min(ax2 - bx1, bx2 - ax1) + PAD;
          const overlapY = Math.min(ay2 - by1, by2 - ay1) + PAD;
          const push = 0.5;

          if (overlapX < overlapY) {
            const d = overlapX * push;
            if (ax1 < bx1) { a.dx -= d; b.dx += d; } else { a.dx += d; b.dx -= d; }
          } else {
            const d = overlapY * push;
            if (ay1 < by1) { a.dy -= d; b.dy += d; } else { a.dy += d; b.dy -= d; }
          }
        }
      }
      if (!anyOverlap) break;
    }

    items.forEach(item => item.label.setOffset(item.dx, item.dy));
  });
}
