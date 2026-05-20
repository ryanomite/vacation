// Custom map overlay that renders a styled pill label at a LatLng position.
// Must be instantiated after Google Maps API is loaded.

let _MapLabelClass = null;

export function getMapLabelClass() {
  if (_MapLabelClass) return _MapLabelClass;

  _MapLabelClass = class MapLabel extends google.maps.OverlayView {
    constructor(text, position, bgColor) {
      super();
      this._text     = text;
      this._position = position; // google.maps.LatLng
      this._bgColor  = bgColor;
      this._div      = null;
    }

    onAdd() {
      this._div = document.createElement('div');
      this._div.className = 'map-journey-label';
      this._div.textContent = this._text;
      this._div.style.backgroundColor = this._bgColor;
      // Render in the overlay layer (above tiles, below markers)
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

    update(text, bgColor) {
      this._text    = text;
      this._bgColor = bgColor;
      if (this._div) {
        this._div.textContent = text;
        this._div.style.backgroundColor = bgColor;
      }
    }

    updatePosition(position) {
      this._position = position;
      this.draw();
    }
  };

  return _MapLabelClass;
}
