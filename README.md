# Vacation Planner

A personal travel planning app built on Google Maps. Plan a trip by dropping pins, drawing routes between stops, and building a day-by-day itinerary — all in a single interactive map.

Built by [Ryan Roper](mailto:ryan@ryanroper.com) for personal vacation planning.

---

## Features

- **Full-screen Google Map** with a clean dark toolbar overlay
- **Add locations** by clicking the map or searching for an address/place
- **Edit locations** — set a custom title, emoji icon, marker color, and date range (single day or multi-day stay)
- **Journeys** between any two locations using Google's Directions API — choose from multiple suggested routes, each shown as a colored polyline with a travel-time label
- **Edit journeys** — assign a travel date and path color
- **Agenda view** — a collapsible day-by-day summary of all locations and journeys that have dates assigned
- **Auto-save to `localStorage`** on every change, so the page survives a refresh
- **Server save/load** — a Save button pushes the full plan to the backend; anyone with the URL (e.g. a shared family link) sees the latest saved plan on page load

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), no build step |
| Map | Google Maps JavaScript API, Places API, Directions API |
| Backend | Node.js + Express |
| Storage | Single JSON file (`data/data.json`) |
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
| Add a location | Click **📍 Add Location** in the toolbar, then click the map — or type in the search box |
| Edit a location | Click any marker on the map |
| Add a journey | Click **🛣️ Add Journey**, then click two location markers, and choose a route |
| Edit/delete a journey | Click the colored route line on the map |
| View itinerary | Click **📅 Agenda** to open the day-by-day sidebar |
| Save to server | Click **💾 Save** — pushes the latest plan so others with the link see it too |

---

## Project structure

```
vacation/
├── server.js                 Express backend
├── public/
│   ├── index.html
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
│       └── panels.js         All UI panels + journey flow
├── data/                     Runtime data (persistent volume)
├── Dockerfile
├── captain-definition
└── .github/
    └── copilot-instructions.md
```

---

## License

Private. Personal use only.
