# 🧠 Brain Arcade

An offline Android **and Android TV** arcade with **29 brain games** — Chess, Tetris,
Solitaire, Rush Hour, Wordle, 2048, Reversi, a 3D spatial-memory game and a
head-to-head multiplayer race — plus WiFi auto-updates, a built-in kiosk lock, and
a remote control dashboard.

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

## 🧊 Cube Recall 3D
A rotating lattice of cubes floats in space; some light up in order and you tap them
back. The lattice keeps turning while you watch, so screen positions are useless and
you have to track the cubes in three dimensions — it is the block-tapping spatial
memory test, in 3D. Drag to spin the view yourself; a D-pad moves a selection ring.

The 3D is hand-rolled on a plain 2D canvas (rotate, project, paint faces back to
front). No WebGL and no libraries, so it renders identically in the app's WebView,
in a browser, on a TV, and **offline** like everything else.

## 🏁 Brain Race 3D (multiplayer)
The one game that needs a connection, so its card only appears when the device is on
WiFi **and** the control server answered its last heartbeat. Every other game stays
exactly as available as before.

Two or three devices race down a **3D track** — same hand-rolled projection as Cube
Recall, with a camera that follows your own craft, lane markers streaming past, a
checkered finish gate ahead and a "▼ 3 behind" tag for anyone off camera.

**You do not steer — you move by solving tasks, and none of them are sums:**

| Task | What it trains |
| --- | --- |
| Which one is different? | visual search / attention |
| Which piece is the same, turned? | mental rotation |
| Tap the COLOUR of the word | Stroop interference |
| What comes next? | pattern completion |
| Which pattern did you just see? | visual working memory |

Every correct answer charges a **BOOST** meter (a clean three-in-a-row pays a bonus),
and boost buys **special abilities**:

| Ability | Cost | Effect |
| --- | --- | --- |
| ⚡ Turbo | 3 | Jump two lengths up the track |
| 🧊 Freeze | 4 | The leader cannot answer for 3 seconds |
| 🌀 Scramble | 2 | The leader's tiles shuffle for 8 seconds |
| 🛡️ Shield | 3 | Absorbs the next hit aimed at you |

Offensive abilities aim at whoever is leading (never yourself), so there is no target
UI to learn. Devices are listed by their own name, or by what they are running
(`iPad`, `Android TV`, `Windows PC`) when a name was never set.

The server owns the answer key, the progress and the energy — a client only ever says
"I picked tile 2", and tasks arrive one at a time.

## 🌐 Server URL is built in
Fresh installs already point at <https://brain-arcade-control.onrender.com> — nobody
has to type a URL on a tablet. The copy served by the control server itself (the
website under `/play/`) uses **its own origin**, so the website and the app always
agree without any configuration. Change it any time in
**Settings → Control server URL**, or tap **Use the built-in server → Reset** to go
back. Blank it out and the app is 100% local again (no dashboard, no multiplayer).

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

### Adult PIN on Settings
Settings is where games get switched off, kiosk gets toggled and time limits live, so
opening it asks for the adult PIN **2580** on a big keypad (typeable on a keyboard or
TV remote). The keypad appears **every** time Settings is opened — an unlock that
lasted the whole session meant handing the tablet over after changing one setting left
Settings wide open. Nothing re-prompts while you are already inside Settings.

Only Settings is gated. The 7-tap kiosk escape is deliberately **not** behind the PIN —
a PIN in front of the way out is what made this annoying the first time round.

### Getting out
Three ways:

| Where | What it does |
| --- | --- |
| **Settings → Kiosk mode** switch | Flips kiosk off. If Android still points Home at Brain Arcade it opens the Home-app picker so the change sticks; otherwise it just confirms you're unlocked and offers to leave now. |
| **Settings → Leave Brain Arcade** | Steps straight out to your normal launcher **without** changing kiosk mode. With kiosk on, the Home button brings the tablet right back — handy for a quick trip to another app. |
| **7 quick taps in the top-left corner** | Opens the kiosk admin panel from anywhere; it has both of the above. |

The dashboard mirrors this: **Kiosk mode / Exit kiosk** toggles the setting, and
**🚪 Let them out** sends the tablet to its home screen while leaving kiosk on.

With kiosk off, Back on the home screen also leaves the app — it hands over to the
real launcher rather than closing, since closing the launcher would just show it
again. If Brain Arcade is the *only* launcher installed it stays as Home on purpose
(the device would otherwise have no home screen) and the app explains that.

## 🔊 Find this tablet
Lost down the back of the sofa? **🔊 Find this tablet** on the dashboard rings it:
volume to maximum on both the media and alarm streams, a repeating buzz, and a loud
beep, plus a full-screen shaking panel on the device with one big **STOP** button.

- Stopping it on the device also tells the server, so the dashboard button flips back
  from **🔇 Stop ringing** on its own — no guessing whether it worked.
- You can also stop it remotely from the dashboard.
- It puts the volume back exactly where it found it, so a parent is not left with a
  tablet stuck at maximum.
- It gives up after 3 minutes, and never survives the app closing.
- On a device still running an older APK the full-screen panel and a WebAudio siren
  still play; the volume change and the buzz need the current APK, and the dashboard
  says so before you ring it.

This also fixed a long-standing bug: `android.permission.VIBRATE` was never declared,
so the Haptics setting had never actually buzzed anything.

## 📺 Android TV
The APK installs on Android TV and appears on the TV home screen (Leanback launcher
with a banner). The whole UI is drivable with a **remote or D-pad**: arrows move a
visible selection ring, OK/Enter selects, Back goes back. Arrow keys still belong to
the games while you're playing. TV layout (bigger type, 4–5 column grid,
overscan-safe margins) turns on automatically and can be forced in
**Settings → Appearance → TV mode**.

## 🎮 Control dashboard
Live at <https://brain-arcade-control.onrender.com> (deploy your own from
[`control-server/`](control-server) — it has a `render.yaml`). New installs already
point at it. From the dashboard you can lock a tablet, limit it to certain games, see
every high score, send a message, take remote control, toggle kiosk, or let a device
out of the app. It also hosts a playable copy of the whole arcade at `/play/`.
See [`control-server/README.md`](control-server/README.md).

The server is also the multiplayer matchmaker: `/api/mp/sync` keeps presence for the
lobby, `/api/mp/invite` + `/api/mp/respond` pair devices up, and `/api/mp/answer`
counts progress so the race has a single source of truth. It is all in memory —
a restart just drops everyone back to the lobby.
