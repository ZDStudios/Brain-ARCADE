# 🧠 Brain Arcade

An offline Android **and Android TV** arcade with **35 brain games** — Chess, Tetris,
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
| [`local-server/`](local-server) | The same dashboard + API in pure Python (and a Windows **.exe**) to run on your own computer. Tablets on the WiFi find it automatically when Render is down. |
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

## 📝 Wordle hints
Stuck on a word? **💡 Hint** fills one letter of the answer into the row you are
typing, at its real position, and locks that square so you cannot type over it or
delete it. Two per word — enough to unstick a child, not enough to solve it for them.
The win panel says how many you used.

## 🆕 Four games built to be "one more go"
Each is short, scored, and has a visible streak or rank to chase — the hook — while
training something specific. None of them is arithmetic.

| Game | Trains | The hook |
| --- | --- | --- |
| 🐝 **Spelling Bee** | Vocabulary, spelling, word retrieval | Ranks from Beginner to **Queen Bee**, a gold **PANGRAM** bonus for using all seven letters, a fresh hive every day |
| ⚡ **Speed Match** | Working memory, processing speed (an n-back task; Hard is 2-back) | Combo multiplier up to **x5** that resets on a slip, 60-second rounds |
| 🔀 **Switch Sort** | Cognitive flexibility (task switching) | The rule flips mid-round between colour and shape; speed bonus for fast hands |
| 🚰 **Pipe Flow** | Spatial reasoning and planning | Water floods every pipe you connect and houses light up; boards grow every three levels |

**Spelling Bee** uses the newspaper rules: 4+ letters, the gold centre letter in every
word, letters may repeat. Its 150 puzzles are built from the *common* tiers of the
SCOWL word lists (MIT), so every word you are scored on is one a child could know;
rarer real words still count as bonus words. Offensive words are filtered out, and no
puzzle uses S, so it never turns into a plurals hunt. Progress on each hive is kept.

**Pipe Flow** boards are built from a random spanning tree rooted at the tap and then
scrambled, so every board has a solution that uses every pipe with no leaks.

## 🔨 Whack-a-Mole
Rebuilt from scratch: a big grassy board that fills the screen, moles drawn in CSS that
really rise out of their holes (and go cross-eyed when bopped), **golden moles** worth 3,
**bombs** that cost 2 and shake the board, a combo meter (**x2** at 5 in a row, **x3** at
10), a hammer swing on every tap, a 3-2-1 countdown and a timer bar that turns red for
the last five seconds. More moles pop up at once as the round goes on. Number keys 1–9
work as the holes on a keyboard or remote.

## 🏒 Air Hockey
You against a bot on a glowing rink. Drag your blue mallet anywhere in your half (it
cannot cross the centre line), smash the puck off the walls and into the bot's goal at
the top — first to 7 wins. The puck has real physics: it keeps the speed of your swing,
bounces off the side walls and goal posts and slowly glides to a stop.

- The bot's goal is wider than yours and the puck tops out a little slower, so it is
  easier to score than to concede.
- **Easy / Medium / Hard** change how fast the bot moves, how quickly it reacts and how
  often it comes forward to attack instead of guarding its goal.
- After a goal the puck is placed in the half of whoever conceded, like the real game.
- The rink freezes while the how-to-play panel is open, so nobody concedes while reading.
- The score is saved after every goal, so a closed app picks up where it left off.
- Arrow keys / a TV remote move the mallet too.

## 🥤 Water Sort
Pour the colours until every tube holds just one. You can only pour onto the same
colour or into an empty tube, so every move closes doors as well as opening them —
it is pure forward planning, with no numbers anywhere. Undo and Restart are built in,
levels get an extra colour every three, and **every deal is checked to be solvable
before you see it** (a bounded depth-first search), so a child can never be handed a
dead board.

## 💾 Session saving
Games save as you play, not when you leave. `api.saveState()` writes straight to
storage (throttled, and flushed on `visibilitychange`/`pagehide`), which is the whole
point: the case that actually loses work is the app being *killed* — a reboot, a crash,
an OTA reload — and that never runs the normal teardown path.

- The window is **a week**, not the old 30 seconds.
- **16 games** resume mid-play (was 3): Sudoku, Minesweeper, Chess, Solitaire, Word
  Search, Rush Hour, Tetris, Block Blast, Water Sort, 2048, Wordle, 15 Puzzle, Memory
  Match, Reversi, Connect Four and Tic-Tac-Toe.
- Opening a game with a saved board shows a **Do you want to continue?** menu —
  whether or not that game has a difficulty chooser — and says when you last played.
- The home screen gets a **⏸ Carry on** strip listing unfinished games, so you do not
  have to remember which one you were in.
- Finishing or losing a game clears its save, so nothing offers to "continue" a game
  that is already over.

## 🌐 Server URL is built in
Fresh installs already point at <https://brain-arcade-control.onrender.com> — nobody
has to type a URL on a tablet. The copy served by the control server itself (the
website under `/play/`) uses **its own origin**, so the website and the app always
agree without any configuration. Change it any time in
**Settings → Control server URL**, or tap **Use the built-in server → Reset** to go
back. Blank it out and the app is 100% local again (no dashboard, no multiplayer).

## 📡 No Render? Run the server on your computer
Download **`BrainArcadeServer.exe`** (Windows) or **`BrainArcadeServer-python.zip`**
from the [latest release](../../releases/tag/brain-arcade-latest) and run it. Every
tablet on the same WiFi finds it **by itself** when the Render server does not answer —
no IP addresses to type — and goes back to Render once it is up again. The status dot
is **green** on Render and **blue** on the WiFi server. It does everything the Render
dashboard does, including the Brain Race multiplayer lobby. Details:
[`local-server/README.md`](local-server/README.md).

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

Only Settings is gated. The kiosk escape is deliberately **not** behind the PIN — a PIN in
front of the way out is what made this annoying the first time round. It is hidden on the
PIN screen instead: spam-tap the 🔒, then spam-tap the “Ha ha!” that pops up. (The old
7-taps-on-the-battery shortcut is gone — kids kept finding it.) Leave the “Ha ha!” alone
and it disappears after five seconds.

### Getting out
Three ways:

| Where | What it does |
| --- | --- |
| **Settings → Kiosk mode** switch | Flips kiosk off. If Android still points Home at Brain Arcade it opens the Home-app picker so the change sticks; otherwise it just confirms you're unlocked and offers to leave now. |
| **Settings → Leave Brain Arcade** | Steps straight out to your normal launcher **without** changing kiosk mode. With kiosk on, the Home button brings the tablet right back — handy for a quick trip to another app. |
| **Secret tap route** | Tap ⚙️ Settings, then keep tapping the 🔒 on the *Grown-ups only* PIN screen. A “Ha ha!” pop-up appears — keep tapping that too and the kiosk admin panel opens (it has both of the above). |

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
