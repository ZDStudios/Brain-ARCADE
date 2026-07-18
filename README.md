# 🧠 Brain Arcade

An offline Android arcade with **23 brain games** — Chess, Tetris, Solitaire, Rush
Hour, Wordle, 2048, Reversi and more — plus WiFi auto-updates and an optional remote
control dashboard.

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

## 🎮 Control dashboard (optional)
Deploy [`control-server/`](control-server) to Render (it has a `render.yaml`), then
put the URL in the app's **Settings → Control server URL**. From the dashboard you can
lock a tablet or limit it to certain games. With no URL set, the app is 100% local.
See [`control-server/README.md`](control-server/README.md).
