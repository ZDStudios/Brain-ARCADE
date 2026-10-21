# Deploying the Brain Arcade control server

The control server (dashboard + API that the tablets talk to) is a single pure-Node
app with **no dependencies**. It serves the dashboard from `control-server/public` and
the playable games from `www/`. You can host it anywhere that runs Node or Docker.

This repo ships a `Dockerfile` and a `docker-compose.yml` at the root, ready for
**Coolify** on your own VPS (or plain Docker, or anything that builds a Dockerfile).

## Deploy on Coolify (recommended)

1. In Coolify: **+ New → Resource → Application**, and pick this GitHub repo
   (`ZDStudios/Brain-ARCADE`), branch `main`.
2. **Build Pack: `Dockerfile`**. Leave **Base Directory** as `/` — the Dockerfile is at
   the repo root and expects the whole repo as its build context (it needs both
   `control-server/` and `www/`).
3. **Port: `3000`** (the container exposes 3000; Coolify's proxy maps your domain to it
   and handles HTTPS).
4. **Persistent Storage:** add a volume mounted at **`/data`**. This keeps device locks,
   allow-lists and score backups across redeploys. (Without it the server still runs,
   just forgetting those on each redeploy — the same as the old Render free tier.)
5. **Environment variables** (optional):
   - `ADMIN_TOKEN` — set a password and the dashboard will require it before it can
     lock a tablet or change its games. Leave unset for no password.
   - `DATA_DIR` — already set to `/data` by the Dockerfile; only change it if you mount
     the volume somewhere else.
6. Give it your **domain** (e.g. `arcade.example.com`) and deploy. Coolify gets the
   HTTPS certificate automatically.

Health: Coolify can watch `GET /api/ping` (returns `{"brainArcade":true}`), which the
Docker image also uses as its built-in healthcheck.

## Plain Docker / docker compose

```sh
# from the repo root
docker compose up -d --build
# dashboard on http://<server>:3000  (set ADMIN_TOKEN in a .env file or the environment)
```

Or build and run by hand:

```sh
docker build -t brain-arcade-control .
docker run -d --name brain-arcade -p 3000:3000 \
  -e ADMIN_TOKEN=yourpassword \
  -v brain-arcade-data:/data \
  brain-arcade-control
```

## Without Docker

```sh
# Node 18+; from the repo root
ADMIN_TOKEN=yourpassword DATA_DIR=/var/lib/brain-arcade node control-server/server.js
```

## After it is live — point the app at it

Once you have the URL (e.g. `https://arcade.example.com`), the app and website should
default to it instead of the old Render address. Change **one** constant and the
default flows everywhere:

- `BrainGames/app/src/main/assets/www/js/app.js` → `DEFAULT_SERVER_URL`

Then rebuild the bundle (`www/`) and ship a new app version, so fresh installs and the
over-WiFi update both point at the new server. Tablets already set up can also just type
the new URL in **Settings → Control server URL**. (The WiFi-server fallback is
unaffected — that is found on the local network and does not use this URL.)

> Tell Claude the final URL and it will make this change and ship it.

## Notes

- The server binds to all interfaces on `PORT` (default 3000; Coolify/Render set `PORT`
  themselves). It is plain HTTP inside the container — put it behind Coolify's HTTPS
  proxy (it does this for you when you give the app a domain).
- Only `control-server/` and `www/` go into the image (see `.dockerignore`); the Android
  app and the Windows local-server are left out, so the image stays small.
- `photos` (the "where is it?" camera shots) and live screen frames are kept in memory
  only and are never written to the volume.
