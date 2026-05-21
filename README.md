# Vacation Planner

A personal travel planning app built on Google Maps. Plan a trip by dropping pins, drawing routes between stops, and building a day-by-day itinerary — all in a single interactive map.

Built by [Ryan Roper](mailto:ryan@ryanroper.com) for personal vacation planning.

---

## Features

### Map & locations
- **Full-screen Google Map** with a clean dark toolbar overlay
- **Add locations** by clicking the map or searching for an address/place
- **Edit locations** — set a custom title, emoji icon, marker color, and date range (single day or multi-day stay)
- **Info modals** — tap any location or route in view-only mode to see its details; an **Edit** button switches directly into edit mode

### Journeys
- **Journeys** between any two locations using Google's Directions API — choose from multiple suggested routes, each shown as a colored polyline with a travel-time label
- **Edit journeys** — assign a travel date, custom title, and path color
- **Add Stop** — search for a place inside the journey editor to insert it as a midpoint; the journey is split into two legs automatically with recalculated routes
- **Smart merge on delete** — when deleting a location that sits between two journeys on the same date, those journeys automatically merge into one (route recalculated)

### Itinerary
- **Agenda view** — a collapsible day-by-day summary of all locations and journeys that have dates assigned

### Saving & sync
- **Auto-save to `localStorage`** on every change, so the page survives a refresh
- **Server save/load** — a Save button pushes the full plan to the backend; anyone with the URL sees the latest saved plan on page load
- **Live sync via SSE** — all connected clients receive a silent notification when the plan is saved; their maps refresh automatically without a page reload (non-intrusive toast if they are actively editing)

### Navigation
- **Follow Me mode** — GPS dot appears on the map showing your real-time position; enable Follow Me to keep the map centred on you as you move
- **GPS dot tap** — tapping the GPS dot on the map directly toggles Follow Me mode

### Share Mode
- **Share Mode** — opt-in feature for travellers who want to share their live location with people who are _not_ on the trip (e.g. family following along from home)
  - Toggle from the menu; persists across sessions via `localStorage`
  - Prompts for your first name on first activation (also persisted)
  - Posts your GPS coordinates to the server every minute while active
  - Received locations are rebroadcast instantly to all connected clients via SSE
  - Remote users appear on the map as named orange markers
  - Background sync via **Service Worker Periodic Sync** — continues posting location even when the tab is closed (where supported by the browser)

### PWA
- **Installable as a PWA** — add to home screen on iOS/Android; full offline shell cached by the service worker

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), no build step |
| Map | Google Maps JavaScript API, Places API, Directions API |
| Backend | Node.js + Express |
| Storage | Single JSON file (`data/data.json`) |
| Push | Server-Sent Events (SSE) — live sync + location sharing, no extra dependencies |
| Deployment | Docker + [CapRover](https://caprover.com/) |

---

## Local development

**Prerequisites:** Node.js 18+, a Google Maps API key (see below).

```bash
git clone git@github.com:ryanomite/vacation.git
cd vacation
npm install

export GOOGLE_MAPS_API_KEY=your_key_here
npm start
# → http://localhost:3000
```

---

## Google Maps API key

You need one API key with three APIs enabled:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Enable **Maps JavaScript API**, **Places API**, and **Directions API**
3. Create an API key under *APIs & Services → Credentials*
4. Restrict it to HTTPS referrer `https://vacation.app.ryanroper.com/*` and the three APIs above

---

## Deployment (CapRover)

This app deploys to `https://vacation.app.ryanroper.com` via CapRover with GitHub webhooks.

### One-time setup

1. Create a CapRover app named **vacation**
2. Set environment variable: `GOOGLE_MAPS_API_KEY = your_key`
3. Add a **Persistent Data** volume: container path `/app/data`  
   _(this is critical — it keeps `data.json` alive across redeployments)_
4. Connect the GitHub repo under *Deployment → Method 3*, branch `main`
5. Add the CapRover webhook URL to GitHub under *Settings → Webhooks*
6. Enable Force HTTPS and configure the domain

### Deploy

```bash
git add -A && git commit -m "x.x.x Description" && git push
```

CapRover automatically rebuilds and redeploys on every push to `main`.

---

## Usage

| Action | How |
|---|---|
| Add a location | Click **📍 Add Location** in the menu, then click the map — or type in the search box |
| Edit a location | Enable **Edit Mode**, then click any marker |
| View location details | With Edit Mode off, click any marker |
| Add a journey | Click **🛣️ Add Journey**, then click two location markers, and choose a route |
| Add a stop to a journey | Open the journey editor, type in the **Add Stop** field |
| Edit/delete a journey | Enable **Edit Mode**, then click the colored route line |
| View itinerary | Click **📅 Agenda** to open the day-by-day sidebar |
| Save to server | Click **💾 Save** — pushes the latest plan so others with the link see it |
| Follow your position | Click **📍 Follow Me** in the menu (or tap the GPS dot on the map) |
| Share your location | Click **📡 Share Mode** in the menu — enter your name and your dot appears on all viewers' maps |

---

## Project structure

```
vacation/
├── server.js                 Express backend
├── public/
│   ├── index.html
│   ├── sw.js                 Service worker (offline shell + background location sync)
│   ├── manifest.json
│   ├── css/app.css
│   └── js/
│       ├── app.js            Boot / init
│       ├── api.js            Backend fetch calls
│       ├── state.js          Central data store
│       ├── events.js         Pub/sub event bus
│       ├── utils.js          Constants + helpers
│       ├── mapManager.js     Google Maps API wrapper
│       ├── mapLabel.js       Custom route-label overlay
│       ├── locationManager.js  Location markers + search
│       ├── journeyManager.js   Route polylines + directions
│       ├── panels.js         All UI panels + journey flow
│       └── shareManager.js   Share Mode — live location broadcast + remote user markers
├── data/                     Runtime data (persistent volume)
├── Dockerfile
├── captain-definition
└── .github/
    └── copilot-instructions.md
```

---

## License

Private. Personal use only.
