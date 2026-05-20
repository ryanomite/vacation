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
    constructor(lines, position, bgColor, cssClass = 'map-journey-label') {
      super();
      this._lines    = Array.isArray(lines) ? lines : [lines];
      this._position = position;
      this._bgColor  = bgColor;
      this._cssClass = cssClass;
      this._div      = null;
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
      this._renderContent();
      this.getPanes().overlayLayer.appendChild(this._div);
    }

    draw() {
      if (!this._div || !this._position) return;
      const proj = this.getProjection();
      if (!proj) return;
      const pos = proj.fromLatLngToDivPixel(this._position);
      if (!pos) return;
      this._div.style.left = `${pos.x}px`;
      this._div.style.top  = `${pos.y}px`;
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
  };

  return _MapLabelClass;
}
