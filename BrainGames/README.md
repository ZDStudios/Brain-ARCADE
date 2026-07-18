# 🧠 Brain Arcade

A polished Android app packing **23 brain-teasing games** into one arcade —
Chess, Tetris, Solitaire, Rush Hour, Wordle, 2048 and more — with a nice animated
UI, dark/light themes, sound, haptics, per-game high scores, tablet-aware scaling
and full screen-rotation support. **Games run fully offline**; the only time the
network is used is optional WiFi auto-updates and the optional remote dashboard.

## 🎮 Games included (23)

| | | |
|---|---|---|
| ♟️ Chess (AI) | 🃏 Solitaire | 🚗 Rush Hour |
| ⚫ Reversi (AI) | ➕ Math Blitz | 🌈 Color Clash |
| 🧩 Tetris | 🟧 Block Blast | 🎲 2048 |
| 📝 Wordle | 🐍 Snake | 🃏 Memory Match |
| 💣 Minesweeper | 🔢 Sudoku | 🔮 Simon Says |
| ⭕ Tic-Tac-Toe (AI) | 🔵 Connect Four (AI) | 🏓 Breakout |
| 🐺 Whack-a-Mole | 🔀 15 Puzzle | 🐦 Flappy Bird |
| 🏓 Pong (AI) | ⚡ Reaction Time | |

Chess, Reversi, Tic-Tac-Toe and Connect Four have real AI opponents. Fast-thinking
games (Math Blitz, Color Clash, Reaction Time) and strategy/puzzle games (Chess,
Reversi, Rush Hour, Solitaire) round out the mix. Each game tracks a personal best
saved on the device.

## ✨ Features

- **Rotation & tablets** — plays in portrait or landscape; boards scale to fit
  phones and tablets, with bigger controls and text on large screens.
- **Animations** — staggered card entrances, view transitions, shimmering cards,
  celebratory pop-ins.
- **Settings** — light/dark theme, sound effects, haptics, device name, control
  server URL, manual update check, reset scores.
- **WiFi auto-updates** — on WiFi the app checks the
  [`Brain-ARCADE`](https://github.com/ZDStudios/Brain-ARCADE) repo and downloads new
  games automatically. Offline, it uses the copy bundled in the APK — so it always
  works with no connection.
- **Optional remote control** — point the app at a control server (see
  [`control-server/`](../control-server)) to see the tablet online, lock it, or
  limit it to certain games. With no server URL set, none of this runs and the app
  is 100% local.

## 📱 How to get the APK

The APK is built automatically by **GitHub Actions** (the workflow lives at
`.github/workflows/android.yml`). To download an installable APK:

1. Go to the repo's **Actions** tab → **Build Brain Arcade APK**.
2. Open the latest successful run (or click **Run workflow** to start one).
3. Download the **`BrainArcade-debug-apk`** artifact — it contains
   `BrainArcade-debug.apk`.
4. Copy it to your Android phone and open it. You may need to allow
   *"Install from unknown sources"* for your file manager / browser.
   *(A manual `workflow_dispatch` run also publishes the APK to a
   `brain-arcade-latest` GitHub Release for easy phone download.)*

> The build produces a **debug-signed** APK — perfect for installing and playing.
> For the Play Store you'd swap in a release signing key.

## 🛠️ Building locally

If you have the Android SDK installed (`ANDROID_HOME` set):

```bash
cd BrainGames
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## 🧱 How it works

The app is a small native **WebView** shell (`MainActivity.java`) that loads a
self-contained HTML/CSS/JS game engine from `app/src/main/assets/www/`. That keeps
the app tiny and fast while making the games easy to extend:

```
app/src/main/assets/www/
├── index.html          # shell + script includes
├── css/style.css       # theme, layout, components
├── js/app.js           # registry, router, settings, sound, storage
└── js/games/*.js        # one file per game (self-registering)
```

Adding a game is just dropping a new `js/games/xyz.js` that calls
`window.BrainGames.register({ id, name, icon, gradient, mount })` and adding a
`<script>` line to `index.html`.

## 🔐 Privacy

All gameplay is local — scores and settings live only in the device's storage, and
every game works with no connection. The app uses the internet permission for just
two optional things: checking the `Brain-ARCADE` repo for game updates on WiFi, and
(only if you set a control-server URL) sending a heartbeat so the dashboard can show
the tablet and apply lock/allow policies. No ads, no analytics, no third parties.
