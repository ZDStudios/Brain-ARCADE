# 📡 Brain Arcade Server (run it on your own computer)

The same dashboard as <https://brain-arcade-control.onrender.com>, running on a
computer in your house. Use it when the Render server is offline (for example when
the free Render hours run out) — every Brain Arcade tablet on the same WiFi finds it
by itself. Nobody types an IP address.

## Start it

| You have | Do this |
| --- | --- |
| **Windows** | Download **`BrainArcadeServer.exe`** from the [latest release](../../../releases/tag/brain-arcade-latest) and double-click it. No install, no Python needed. |
| **Python 3.8+** (Windows, Mac, Linux) | Download **`BrainArcadeServer-python.zip`**, unzip, then double-click `start-server.bat` (Windows) or run `./start-server.sh` (Mac/Linux). |
| **This repo** | `python local-server/brain_arcade_server.py` |

A window opens showing the addresses, and the dashboard opens in your browser:

```
  Dashboard on this computer:  http://localhost:8787
  Dashboard on other devices:  http://192.168.1.20:8787
  Play in a browser:           http://192.168.1.20:8787/play/
```

**On Windows it asks once for admin ("Do you want to allow this app…?") — click Yes.**
That adds firewall rules so tablets can reach it on any kind of network (Windows' own
"Allow access" pop-up only covers *Private* networks, and clicking Cancel on it quietly
blocks the tablets). Leave the window open; closing it stops the server.

The window logs what happens, which is the quickest way to see where it breaks:

```
[18:02:11] Windows Firewall: done - tablets are allowed in.
[18:02:40] A tablet at 192.168.1.33 is looking for this server - answered it
[18:02:41] Tablet connected: Lounge tablet (192.168.1.33, app 1.19.0)
```

If after a minute no tablet has connected it prints a checklist.

Options: `--port 9000` to use another port, `--no-browser` to not open the dashboard.

## How the tablets find it

Needs **Brain Arcade 1.17 or newer** on the tablet (the WiFi search is part of the
Android app, so the over-WiFi game updates cannot add it). Older apps show
*"Update the app to use a WiFi server"* in Settings with an **Update app** button.

1. About once a minute the tablet shouts on the WiFi (a UDP broadcast on port
   **41234**). This server answers with its address.
2. If the router blocks broadcasts, the tablet knocks on port **8787** of every address
   on the network and keeps the one whose `/api/ping` says it is Brain Arcade.
3. **A running WiFi server is used first** — even when Render is up — and the status dot
   next to the title turns **blue**. When the computer's server stops, the tablet goes
   back to Render (dot **green**) by itself.

Tablet **Settings** has everything to check or fix it:

| Setting | What it does |
| --- | --- |
| Use a server on this WiFi | On/off, and shows what the tablet is connected to right now |
| Prefer the WiFi server | On (default): a running WiFi server always wins. Off: only when Render is down |
| Computer's address + **Test** | Type the address the server window shows (e.g. `192.168.1.20`). Test says straight away whether the tablet can reach it, and what to check if not |
| Look for a WiFi server now | Searches immediately and says what it tried |

**Still not connecting?** If *Test* fails with the right address, the computer or router
is blocking it: run the exe once as administrator, set the WiFi to *Private* in Windows
network settings, and make sure the tablet is not on a guest network (those keep
devices apart).

## What it does

Everything the Render dashboard does — it is a line-by-line port of
`control-server/server.js` and speaks exactly the same API:

- see every tablet (online, battery, app version, platform)
- lock a tablet, or allow only some games
- scores & play stats, with score backup
- send a message, remote control (live screen + taps), kiosk mode on/off,
  "let them out", find-my-tablet (ring), update the app
- the **Brain Race 3D** multiplayer lobby — tablets on the same WiFi can race
  each other with no internet at all
- `/play/` — the whole arcade in any browser on your network

Locks, game limits and score backups are saved to `brain_arcade_data.json` next to the
program, so they survive a restart. (The Render server keeps everything in memory.)

Set `ADMIN_TOKEN` in the environment to require a password for changes, exactly like
the Render server.
