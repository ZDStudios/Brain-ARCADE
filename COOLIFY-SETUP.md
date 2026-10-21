# Brain Arcade on Coolify: what to do

## The repo

- **Repository:** https://github.com/ZDStudios/Brain-ARCADE
- **Branch:** `main`
- **What gets deployed:** the control server (the dashboard plus the API the tablets
  talk to). The `Dockerfile` is in the root of the repo.

## Steps in Coolify

1. **+ New → Resource → Application**, then choose the GitHub repo above, branch `main`.
   - If Coolify can't see the repo, connect your GitHub account in Coolify first
     (Sources → GitHub App), or use "Public Repository" with the URL above if the
     repo is public.
2. **Build Pack:** `Dockerfile`
3. **Base Directory:** `/` (leave it as is)
4. **Port:** `3000`
5. **Persistent Storage:** add a volume with **Destination Path** `/data`
   (this keeps tablet locks, allowed games and score backups when you redeploy)
6. **Environment Variables** (optional):
   - `ADMIN_TOKEN` = a password. The dashboard then asks for it before anyone can lock a
     tablet or change its games. Skip this for no password.
7. **Domain:** enter your domain, e.g. `https://arcade.yourdomain.com`.
   Coolify sets up HTTPS by itself.
8. Click **Deploy**.

## Check it worked

- Open your domain in a browser. You should see the **Brain Arcade · Control** dashboard.
- Open `https://your-domain/api/ping`. It should show `{"brainArcade":true,...}`.
- Open `https://your-domain/play/` to play the games in the browser.

## Then send Claude the URL

Send me the final URL, e.g. `https://arcade.yourdomain.com`. I'll change the app's
built-in server address from Render to yours and ship an update, so new installs and
the WiFi update both use it.

Until then, on any tablet you can type the new URL in
**Settings → Control server URL**.

## If something goes wrong

- **Deploy fails:** copy the build log from Coolify and send it to me.
- **Dashboard loads but no tablets show up:** the tablet is still pointing at Render.
  Type the new URL in the tablet's Settings, or wait for my update.
- **Data disappears after a redeploy:** the `/data` volume isn't set up (step 5).
