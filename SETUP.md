# Vacation Planner — Setup Guide

## 1. Google Maps API Key

You'll need three APIs enabled. All three have generous free tiers that cover personal use.

### Steps

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. **Enable APIs** — via *APIs & Services → Library*, enable each:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
4. **Create a credential** — via *APIs & Services → Credentials → Create Credentials → API key*
5. **Restrict the key** (strongly recommended):
   - Under *Application restrictions*: select **HTTP referrers**
   - Add: `https://vacation.app.ryanroper.com/*`
   - Under *API restrictions*: select **Restrict key**, pick the three APIs above
6. Copy the key value — you'll set it as an environment variable below

---

## 2. Local development

```bash
cd /Users/ryan/travel
npm install

# Set your key for local testing
export GOOGLE_MAPS_API_KEY=your_key_here

npm start
# → http://localhost:3000
```

---

## 3. Caprover deployment

### First deployment

1. Log into your Caprover dashboard at `https://captain.app.ryanroper.com`
2. Create a new app called **vacation**
3. Under **App Configs → Environmental Variables**, add:
   ```
   GOOGLE_MAPS_API_KEY = your_key_here
   ```
4. Under **App Configs → Persistent Data**, add a volume:
   - **Container path**: `/app/data`
   - This ensures `data.json` survives container restarts and redeployments

5. Under **Deployment → Method 3 (GitHub/BitBucket repo)**, connect this repo:
   - Repo: `github.com/yourusername/vacation`
   - Branch: `main`
   - Copy the webhook URL and add it to your GitHub repo under *Settings → Webhooks*

6. Enable **Force HTTPS** and set up the domain `vacation.app.ryanroper.com`

### Every subsequent push

```bash
git add -A && git commit -m "update" && git push
```

Caprover will automatically rebuild and redeploy.

---

## 4. App usage

| Action | How |
|---|---|
| **Add location** | Click 📍 in toolbar, then click the map — OR — type in the search box |
| **Edit location** | Click any map marker |
| **Journey from location** | Open a location, click "Journey from here…" |
| **Add journey (toolbar)** | Click 🛣️, then click two location markers |
| **Edit/delete journey** | Click the colored route line on the map |
| **Agenda** | Click 📅 to toggle the left-side agenda panel |
| **Save** | Click 💾 — persists data to the server so your wife can see changes too |

---

## 5. Data persistence notes

- The app **auto-saves to `localStorage`** on every change (so your browser tab survives a refresh)
- The **💾 Save button** pushes to the server — this is the primary share mechanism
- On page load, the server copy is loaded first; `localStorage` is the fallback if the server is unreachable
- Your wife visiting the URL will always see the last explicitly saved state

---

## 6. Project structure

```
travel/
├── server.js            Express backend
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── app.js           Boot / init
│       ├── api.js           Backend fetch calls
│       ├── state.js         Central data store
│       ├── events.js        Pub/sub bus
│       ├── utils.js         Constants + helpers
│       ├── mapManager.js    Google Maps API wrapper
│       ├── mapLabel.js      Custom route-label overlay
│       ├── locationManager.js  Pin markers
│       ├── journeyManager.js   Route polylines
│       └── panels.js        All UI panels + flows
├── data/                 Runtime data dir (persistent volume)
├── Dockerfile
└── captain-definition
```
