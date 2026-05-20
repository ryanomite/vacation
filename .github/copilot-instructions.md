# Copilot Instructions — Vacation Planner

## Versioning

This project uses semantic versioning (`MAJOR.MINOR.PATCH`), starting at `0.1.0`.

- **Minor** (`x.Y.0`): New features, new UI panels, new API endpoints, or any meaningful new capability.
- **Patch** (`x.x.Z`): Bug fixes, copy changes, style tweaks, refactors that don't change behavior.
- **Major** (`X.0.0`): Reserved for breaking changes to the data schema or a full architectural overhaul.

### Commit message format

Every commit message **must** be prefixed with the next version number:

```
0.1.0 Add README and versioning conventions
0.1.1 Fix journey color not persisting after reload
0.2.0 Add waypoint support to journeys
```

- Determine the next version before committing — check `package.json` for the current version.
- Update `package.json` `"version"` field to match before committing.
- After committing, the version in `package.json` is the current version.

## Project conventions

- **Language**: Vanilla JavaScript ES modules (no build step, no transpiler).
- **Backend**: Node.js + Express. Keep it minimal — no ORM, no extra frameworks.
- **Storage**: Single `data/data.json` file. No database.
- **Styling**: Plain CSS in `public/css/app.css`. Dark theme (`#0f172a` base). No CSS frameworks.
- **No comments or docstrings** should be added to code that wasn't changed.
- **No new dependencies** without a clear reason — check `package.json` before adding anything.

## Architecture

```
server.js          → Express backend (API + static serving)
public/js/
  app.js           → Boot sequence only
  state.js         → Single source of truth; all mutations here
  events.js        → Pub/sub bus; no direct module cross-imports
  mapManager.js    → All google.maps.* calls isolated here
  locationManager  → Markers, add-mode, place search
  journeyManager   → Directions, polylines, route labels
  panels.js        → All UI panels and the journey creation flow
```

Events flow: user interaction → manager emits event → panels/state react.  
Never import `panels.js` from a manager module (one-way dependency).
