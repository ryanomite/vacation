// Wrapper around the Google Maps JavaScript API
// All google.maps.* calls live here so other modules stay Maps-agnostic.

let _map = null;
let _geocoder = null;
let _directionsService = null;
let _autocomplete = null;

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

// ── Marker helpers ─────────────────────────────────────────────────

export function makeMarkerIcon(color) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 20,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: 'rgba(255,255,255,0.9)',
    strokeWeight: 2.5,
    labelOrigin: new google.maps.Point(0, 0),
  };
}

export function makeMarkerLabel(icon) {
  return { text: icon, fontSize: '18px' };
}
