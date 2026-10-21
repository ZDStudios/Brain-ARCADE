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
6. **Environment Variables:**
   - `ADMIN_TOKEN` = your dashboard password (pick a long one). The dashboard asks for
     it before showing *anything*. If you skip this, the server makes one up and prints
     it in Coolify's **Logs** tab — look for "the dashboard password is".
7. **Domain:** `https://brainarcade.zdstudios.network`. Coolify sets up HTTPS by itself; keep
   **Force HTTPS** switched on.
8. Click **Deploy**.

## Check it worked

- Open https://brainarcade.zdstudios.network in a browser. You should see a **sign-in** screen;
  enter the password and the **Brain Arcade · Control** dashboard appears.
- Open https://brainarcade.zdstudios.network/api/ping. It should show `{"brainArcade":true,...}`.
- Open https://brainarcade.zdstudios.network/play/ to play the games in the browser.

## The app already points here

The app's built-in server is now https://brainarcade.zdstudios.network. Tablets that were on the
old Render address switch over by themselves after the next update.

## If something goes wrong

- **Deploy fails:** copy the build log from Coolify and send it to me.
- **Dashboard loads but no tablets show up:** the tablet has not had the update yet.
  Type https://brainarcade.zdstudios.network in the tablet's Settings → Control server URL.
- **Forgot the password:** set a new `ADMIN_TOKEN` in Coolify and redeploy.
- **A tablet says the server doesn't recognise it** (after a reset): tap **Re-pair** on
  its card in the dashboard.
- **Data disappears after a redeploy:** the `/data` volume isn't set up (step 5).
