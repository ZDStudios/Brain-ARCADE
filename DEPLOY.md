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
5. **Environment variables:**
   - `ADMIN_TOKEN` — **the dashboard password** (recommended: set a long one). It is
     needed for *everything* on the dashboard, including just viewing the tablets, their
     screens and photos. If you leave it unset the server generates a strong password,
     keeps it in `/data`, and prints it in the **Logs** tab when it starts.
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

## The live server

The app and website point at **https://brainarcade.zdstudios.network** (`DEFAULT_SERVER_URL` in
`BrainGames/app/src/main/assets/www/js/app.js`). Tablets that were still on the old
Render address move to it by themselves.

## Security

- All traffic is HTTPS (Coolify's proxy). The compose file deliberately does **not**
  publish port 3000, so nobody can skip HTTPS by talking to the container directly.
  In Coolify, keep **Force HTTPS** on for the domain.
- Every dashboard request needs `ADMIN_TOKEN` (sent as the `X-Admin-Token` header).
  Ten wrong passwords from one address lock it out for 10 minutes.
- Each tablet is given its own secret key on first contact and must send it with every
  request after that. Only a hash is stored (in `/data`). A reset tablet shows up on the
  dashboard with a **Re-pair** button.
- `OPEN_DASHBOARD=1` turns the password off. Never use it on the internet.

## Notes

- The server binds to all interfaces on `PORT` (default 3000; Coolify/Render set `PORT`
  themselves). It is plain HTTP inside the container — put it behind Coolify's HTTPS
  proxy (it does this for you when you give the app a domain).
- Only `control-server/` and `www/` go into the image (see `.dockerignore`); the Android
  app and the Windows local-server are left out, so the image stays small.
- `photos` (the "where is it?" camera shots) and live screen frames are kept in memory
  only and are never written to the volume.
