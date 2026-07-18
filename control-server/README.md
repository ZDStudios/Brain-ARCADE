# Brain Arcade — Control Server

A tiny **zero-dependency Node server** with a web dashboard to monitor and control
your Brain Arcade tablets.

From the dashboard you can:
- 🟢 See which tablets are **online / offline** (and their app version)
- 🔒 **Lock** a tablet (shows a full-screen lock; games can't be played)
- 🎮 Restrict a tablet to **only certain games** (unchecked games disappear from its home screen)

The tablet checks in every ~15 seconds when it has WiFi and applies whatever policy
you set. **If the tablet is offline, it just works normally** — nothing is locked
or restricted until it can reach the server again.

## Deploy in ~2 minutes (Render.com free tier)

1. Push this repo to GitHub (already done if you're reading this in the repo).
2. Go to [render.com](https://render.com) → **New → Blueprint** → pick the **Brain-ARCADE** repo.
   Render reads `control-server/render.yaml` and deploys the `control-server/` folder.
   *(Or: New → Web Service, root directory `control-server`, start command `node server.js`.)*
3. When it's live you'll get a URL like `https://brain-arcade-control.onrender.com`.
4. On each tablet: **Brain Arcade → Settings → Control server URL** → paste that URL.
   Give each tablet a **Device name** too so you can tell them apart.
5. Open the URL in any browser → that's your dashboard.

### Optional: protect the dashboard
Set an `ADMIN_TOKEN` environment variable in Render. Then policy changes require
that token — enter it in the box at the top of the dashboard.

## Run locally

```bash
cd control-server
node server.js         # http://localhost:3000
```

## API

| Method | Path             | Body / notes |
|--------|------------------|--------------|
| POST   | `/api/heartbeat` | `{deviceId, name, app}` → `{locked, allowedGames}` |
| GET    | `/api/devices`   | list of devices + online status + policy |
| POST   | `/api/policy`    | `{deviceId, locked, allowedGames}` (header `X-Admin-Token` if set) |
| GET    | `/api/config`    | `{authRequired}` |

> State is kept in memory, so it resets if the server restarts (fine for the free
> tier). Set policies again after a restart, or add a database if you need
> persistence.
