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

**Windows will ask "Allow access?" the first time — click Allow** (private networks).
Without that the tablets cannot reach the computer. Leave the window open; closing it
stops the server.

Options: `--port 9000` to use another port, `--no-browser` to not open the dashboard.

## How the tablets find it

1. The tablet always tries the **Render server first**.
2. If Render does not answer, the tablet shouts on the WiFi (a UDP broadcast on port
   **41234**). This server answers with its address.
3. If the router blocks broadcasts, the tablet instead knocks on port **8787** of every
   address on the network and keeps the one that answers `/api/ping` as Brain Arcade.
4. While it is on the WiFi server the status dot next to the title turns **blue**.
   About once a minute it checks Render again and moves back (dot goes **green**) as
   soon as Render is up.

You can switch this off, or search straight away, in the tablet's
**Settings → Use a server on this WiFi / Look for a WiFi server now**.

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
