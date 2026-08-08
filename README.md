# 🧠 Brain Arcade

An offline Android **and Android TV** arcade with **27 brain games** — Chess, Tetris,
Solitaire, Rush Hour, Wordle, 2048, Reversi and more — plus WiFi auto-updates, a
built-in kiosk lock, and an optional remote control dashboard.

https://brain-arcade-control.onrender.com/

## 📲 Get the app
Download the latest APK from **[Releases](../../releases)** →
`BrainArcade-debug.apk`, open it on an Android device, and allow "install from
unknown sources". Games run fully offline.

## 📁 Repo layout

| Path | What it is |
|------|------------|
| [`BrainGames/`](BrainGames) | The Android app (a WebView shell + the game engine). CI builds the APK from here. |
| [`www/`](www) | The **over-the-air bundle** the installed app downloads on WiFi to update its games. `manifest.json` drives it. |
| [`control-server/`](control-server) | Zero-dependency Node dashboard + API to see tablets online, lock them, or restrict games. Deployable to Render. |
| [`.github/workflows/android.yml`](.github/workflows/android.yml) | GitHub Actions — builds the signed debug APK and publishes it to a Release. |

## 🔄 How updates work
The installed app ships with all games bundled (so it works with **no connection**).
On WiFi it checks [`www/manifest.json`](www/manifest.json); if the `version` changed
it downloads the new files and swaps them in — no reinstall. To ship an update: edit
files under `www/`, bump `version` in `manifest.json`, and push to `main`.

## 🔑 App signing (why updates work)
Every APK is signed with the fixed key in
[`BrainGames/keystore/`](BrainGames/keystore). Android refuses to install an
update signed by a different key — that is the "App not installed" / "package
conflicts with an existing package" error. CI runners are wiped between builds,
so before this key existed each build was signed with a fresh random debug key
and updates always failed. The keystore is committed on purpose: it is a build
key for a side-loaded personal app, not a Play Store upload key. To rotate it,
replace the file and update `signingConfigs.arcade` in
[`BrainGames/app/build.gradle`](BrainGames/app/build.gradle) — every device then
needs one manual uninstall + reinstall.

## 🔒 Kiosk mode (built in)
Kiosk mode is part of the app now — the old separate `KioskLock.apk` is no longer
needed. Turn it on in **Settings → Kiosk mode**, or remotely from the dashboard.

It works by making Brain Arcade the device's **Home app**: the tablet always comes
back here — from the Home button, after a reboot, whenever anything else closes —
the screen stays awake and Back can't leave the app. Enabling it walks you straight
to the Home-app picker, which is the step that actually matters.

Screen pinning is deliberately *not* used. It blocked the app's own updater (the
installer opened for a split second and bounced back) and needed a fiddly escape
gesture. As the Home app, normal things like installing an update still work.

## 📺 Android TV
The APK installs on Android TV and appears on the TV home screen (Leanback launcher
with a banner). The whole UI is drivable with a **remote or D-pad**: arrows move a
visible selection ring, OK/Enter selects, Back goes back. Arrow keys still belong to
the games while you're playing. TV layout (bigger type, 4–5 column grid,
overscan-safe margins) turns on automatically and can be forced in
**Settings → Appearance → TV mode**.

## 🎮 Control dashboard (optional)
Deploy [`control-server/`](control-server) to Render (it has a `render.yaml`), then
put the URL in the app's **Settings → Control server URL**. From the dashboard you can
lock a tablet or limit it to certain games. With no URL set, the app is 100% local.
See [`control-server/README.md`](control-server/README.md).
