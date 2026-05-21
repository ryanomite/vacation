// Wrapper around the Google Maps JavaScript API
// All google.maps.* calls live here so other modules stay Maps-agnostic.

let _map = null;
let _followMe = false;
let _onFollowMeDisabled = null;
let _geocoder = null;
let _directionsService = null;
let _autocomplete = null;
let _placesService = null;

export function init() {
  _map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 30, lng: 15 },
    zoom: 3,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER,
    },
    gestureHandling: 'greedy',
  });

  _geocoder = new google.maps.Geocoder();
  _directionsService = new google.maps.DirectionsService();

  _map.addListener('dragstart', () => {
    if (_followMe) {
      _followMe = false;
      if (_onFollowMeDisabled) _onFollowMeDisabled();
    }
  });

  const searchEl = document.getElementById('search-input');
  _autocomplete = new google.maps.places.Autocomplete(searchEl, {
    fields: ['geometry', 'name', 'formatted_address'],
  });

  return _map;
}

export function getMap()          { return _map; }
export function getAutocomplete() { return _autocomplete; }

/** Create and return a new Places Autocomplete bound to the given input element. */
export function createAutocomplete(inputEl) {
  return new google.maps.places.Autocomplete(inputEl, {
    fields: ['geometry', 'name', 'formatted_address'],
  });
}

// ── Map interactions ───────────────────────────────────────────────

export function addMapClickListener(fn) {
  return _map.addListener('click', fn);
}

export function removeListener(handle) {
  google.maps.event.removeListener(handle);
}

export function setMapCursor(cursor) {
  _map.getDiv().style.cursor = cursor;
}

export function fitBoundsToLocations(locations) {
  if (!locations.length) return;
  if (locations.length === 1) {
    _map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
    _map.setZoom(12);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  locations.forEach(l => bounds.extend({ lat: l.lat, lng: l.lng }));
  _map.fitBounds(bounds, 80);
}

// ── Geocoding ──────────────────────────────────────────────────────

export function reverseGeocode(latLng) {
  return new Promise(resolve => {
    _geocoder.geocode({ location: latLng }, (results, status) => {
      resolve(
        status === 'OK' && results[0]
          ? results[0].formatted_address
          : `${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`
      );
    });
  });
}

// ── Directions ─────────────────────────────────────────────────────

export function getDirections(from, to) {
  return new Promise((resolve, reject) => {
    _directionsService.route(
      {
        origin:      { lat: from.lat, lng: from.lng },
        destination: { lat: to.lat,   lng: to.lng   },
        travelMode:  google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status === 'OK') resolve(result);
        else reject(new Error(`Directions API: ${status}`));
      }
    );
  });
}

// ── Follow Me ──────────────────────────────────────────────────────

export function setFollowMe(enabled, onDisabled) {
  _followMe = enabled;
  _onFollowMeDisabled = onDisabled || null;
}

// ── Marker helpers ─────────────────────────────────────────────────

/**
 * Returns a Google Maps Icon using an inline SVG data URL.
 * iconDef: { id, width, path } for FA path icons
 *          { id, text }        for number icons
 *          null / undefined    for no icon (plain circle)
 */
export function makeMarkerIcon(color, iconDef) {
  let inner = '';
  if (iconDef?.path) {
    inner = `<svg x="12" y="12" width="24" height="24" viewBox="0 0 ${iconDef.width} 512"><path fill="white" d="${iconDef.path}"/></svg>`;
  } else if (iconDef?.text) {
    inner = `<text x="24" y="24" text-anchor="middle" dominant-baseline="central" fill="white" font-size="19" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700">${iconDef.text}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="21" fill="${color}"/>${inner}<circle cx="24" cy="24" r="21" fill="none" stroke="white" stroke-opacity="0.85" stroke-width="2.5"/></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(48, 48),
    anchor:     new google.maps.Point(24, 24),
  };
}

// ── Places details ─────────────────────────────────────────────────

export function getPlaceDetails(placeId) {
  if (!_placesService) {
    _placesService = new google.maps.places.PlacesService(_map);
  }
  return new Promise((resolve, reject) => {
    _placesService.getDetails(
      { placeId, fields: ['name', 'formatted_address', 'formatted_phone_number', 'geometry'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) resolve(place);
        else reject(new Error(`Places: ${status}`));
      }
    );
  });
}

// ── Geolocation (GPS dot) ──────────────────────────────────────────

export function initGeolocation(onTap) {
  if (!navigator.geolocation) return;

  const dot = document.createElement('div');
  dot.className = 'gps-dot';

  if (onTap) {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', e => { e.stopPropagation(); onTap(); });
  }

  const overlay = new google.maps.OverlayView();
  overlay.onAdd = function () {
    this.getPanes().floatPane.appendChild(dot);
  };
  overlay.draw = function () {};
  overlay.onRemove = function () { dot.remove(); };

  let overlayAdded = false;

  navigator.geolocation.watchPosition(
    pos => {
      const latLng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);

      if (!overlayAdded) {
        overlay.setMap(_map);
        overlayAdded = true;

        overlay.draw = function () {
          const proj = this.getProjection();
          if (!proj) return;
          const point = proj.fromLatLngToDivPixel(latLng);
          dot.style.left = point.x + 'px';
          dot.style.top  = point.y + 'px';
        };
      }

      overlay.draw = function () {
        const proj = this.getProjection();
        if (!proj) return;
        const point = proj.fromLatLngToDivPixel(latLng);
        dot.style.left = point.x + 'px';
        dot.style.top  = point.y + 'px';
      };

      overlay.draw();
      if (_followMe) _map.panTo(latLng);
    },
    err => console.warn('Geolocation:', err.message),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  );
}
