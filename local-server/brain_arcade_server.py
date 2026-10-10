#!/usr/bin/env python3
"""Brain Arcade - local control server.

Run this on any computer on your WiFi and every Brain Arcade tablet on the same
network finds it by itself (no typing IP addresses). It does everything the
Render dashboard does: see devices, lock them, limit games, scores, messages,
remote control, kiosk, "let them out", find-my-tablet and the Brain Race
multiplayer lobby.

Tablets still prefer the Render server when it is up; they fall back to this
one when Render does not answer, and go back to Render once it returns.

    python brain_arcade_server.py            # port 8787
    python brain_arcade_server.py --port 9000
    python brain_arcade_server.py --no-browser

Pure Python 3 standard library - nothing to pip install. It is a line-by-line
port of control-server/server.js, so both servers speak exactly the same API.
"""
import argparse
import ctypes
import json
import mimetypes
import os
import random
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

VERSION = "1.0"
DEFAULT_PORT = 8787
DISCOVERY_PORT = 41234            # UDP port tablets probe to find this server
DISCOVER_MAGIC = b"BRAIN_ARCADE_DISCOVER"

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
ONLINE_MS = 40000


def now_ms():
    return int(time.time() * 1000)


# The server window is the place to see what is going on, so it says when a tablet
# looks for the server and when one connects. (ASCII only: the Windows console
# cannot always print emoji.)
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass


def log(msg):
    print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


_seen_probe = {}
first_connect = [False]


def log_once(key, every_s, msg):
    t = time.time()
    if t - _seen_probe.get(key, 0) >= every_s:
        _seen_probe[key] = t
        log(msg)


def resource_dir(name):
    """public/ and www/ live next to the script in the repo, or inside the exe."""
    if getattr(sys, "frozen", False):
        return os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)), name)
    here = os.path.dirname(os.path.abspath(__file__))
    # The download zip keeps public/ and www/ right next to this script.
    if os.path.isdir(os.path.join(here, name)):
        return os.path.join(here, name)
    if name == "public":
        return os.path.join(here, "..", "control-server", "public")
    return os.path.join(here, "..", "www")


PUBLIC = os.path.realpath(resource_dir("public"))
GAMES_DIR = os.path.realpath(resource_dir("www"))
DATA_FILE = os.path.join(
    os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__)),
    "brain_arcade_data.json")

LOCK = threading.RLock()
devices = {}    # id -> { id, name, app, lastSeen, battery, games, ... }
policies = {}   # id -> { locked, allowedGames }
commands = {}   # id -> { appUpdateAt, popupText, popupAt, stream, ... }
frames = {}     # id -> { data, ts }
inputs = {}     # id -> [ {type, x, y} ]
scores = {}     # id -> { gameId: best }


def default_policy():
    return {"locked": False, "allowedGames": None}


# ---- persistence: locks, game limits and score backups survive a restart ----
def load_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        policies.update(d.get("policies") or {})
        scores.update(d.get("scores") or {})
    except Exception:
        pass


_save_timer = None


def save_data_soon():
    global _save_timer
    if _save_timer:
        return

    def run():
        global _save_timer
        _save_timer = None
        try:
            with LOCK:
                blob = json.dumps({"policies": policies, "scores": scores})
            tmp = DATA_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(blob)
            os.replace(tmp, DATA_FILE)
        except Exception as e:
            print("  (could not save data: %s)" % e)
    _save_timer = threading.Timer(2.0, run)
    _save_timer.daemon = True
    _save_timer.start()


# ================= Multiplayer (Brain Race) =================
MP_MAX = 3
MP_TASKS = 12
MP_ENERGY_MAX = 9
MP_ABILITIES = {
    "turbo":    {"cost": 3, "jump": 2},
    "freeze":   {"cost": 4, "ms": 3000},
    "scramble": {"cost": 2, "ms": 8000},
    "shield":   {"cost": 3, "ms": 12000, "self": True},
}
MP_PEER_MS = 20000
mp_peers = {}
invites = {}
matches = {}
_seq = [0]


def next_seq():
    _seq[0] += 1
    return _seq[0]


def mp_peer(pid):
    if pid not in mp_peers:
        mp_peers[pid] = {"id": pid, "name": "", "platform": "", "ts": now_ms(), "matchId": None}
    return mp_peers[pid]


def mp_label(peer):
    return (peer.get("name") or "").strip() or peer.get("platform") or "Brain Arcade device"


def mp_prune():
    t = now_ms()
    for pid in list(mp_peers):
        if t - mp_peers[pid]["ts"] > MP_PEER_MS:
            del mp_peers[pid]
    for k in list(invites):
        v = invites[k]
        if t - v["ts"] > 45000 or v["from"] not in mp_peers or v["to"] not in mp_peers:
            del invites[k]
    for k in list(matches):
        if t - matches[k]["createdAt"] > 15 * 60000:
            del matches[k]


def mp_player(peer):
    return {"id": peer["id"], "label": mp_label(peer), "platform": peer.get("platform") or "",
            "progress": 0, "energy": 0, "combo": 0, "wrong": 0,
            "effects": [], "done": False, "ms": 0, "left": False}


def mp_create(peers):
    mid = "mtc_%d" % next_seq()
    m = {"id": mid, "state": "countdown", "createdAt": now_ms(), "startAt": now_ms() + 4000,
         "total": MP_TASKS, "tasks": mp_tasks(MP_TASKS),
         "players": [mp_player(p) for p in peers], "winner": None}
    matches[mid] = m
    return m


SHAPES = ["circle", "square", "triangle", "star", "hexagon", "diamond"]
COLORS = ["red", "blue", "green", "yellow", "purple", "orange"]
TASK_KINDS = ["odd", "rotate", "stroop", "next", "recall"]


def ri(a, b):
    return random.randint(a, b)


def shuffled(arr):
    a = list(arr)
    random.shuffle(a)
    return a


def rotate_cells(cells, k):
    out = [[c[0], c[1]] for c in cells]
    for _ in range(k % 4):
        out = [[3 - c[1], c[0]] for c in out]
    mx = min(c[0] for c in out)
    my = min(c[1] for c in out)
    out = [[c[0] - mx, c[1] - my] for c in out]
    out.sort(key=lambda c: (c[1], c[0]))
    return out


def cells_key(cells):
    return ";".join("%d,%d" % (c[0], c[1]) for c in cells)


def random_piece():
    cells = [[1, 1]]
    target = ri(4, 5)
    while len(cells) < target:
        frm = random.choice(cells)
        step = random.choice([[1, 0], [-1, 0], [0, 1], [0, -1]])
        c = [frm[0] + step[0], frm[1] + step[1]]
        if c[0] < 0 or c[1] < 0 or c[0] > 3 or c[1] > 3:
            continue
        if any(x[0] == c[0] and x[1] == c[1] for x in cells):
            continue
        cells.append(c)
    return rotate_cells(cells, 0)


def sort_cells(cells):
    return sorted(cells, key=lambda c: (c[1], c[0]))


def mp_task(i, hard):
    kind = TASK_KINDS[i % len(TASK_KINDS)]

    if kind == "odd":
        shape, color = random.choice(SHAPES), random.choice(COLORS)
        by_shape = random.random() < 0.5
        other, other_color = shape, color
        if by_shape:
            while other == shape:
                other = random.choice(SHAPES)
        else:
            while other_color == color:
                other_color = random.choice(COLORS)
        odd = ri(0, 3)
        items = []
        for k in range(4):
            if k == odd:
                items.append({"shape": other if by_shape else shape, "color": color if by_shape else other_color})
            else:
                items.append({"shape": shape, "color": color})
        return {"kind": kind, "prompt": "Which one is different?", "tiles": items, "answer": odd}

    if kind == "rotate":
        piece = random_piece()
        answer = ri(0, 3)
        tiles = []
        target = cells_key(piece)
        for k in range(4):
            if k == answer:
                tiles.append({"cells": rotate_cells(piece, ri(1, 3))})
                continue
            other, guard = random_piece(), 0
            while guard < 40 and any(cells_key(rotate_cells(other, r)) == target for r in range(4)):
                other = random_piece()
                guard += 1
            tiles.append({"cells": other})
        return {"kind": kind, "prompt": "Which one is the same piece, turned?", "target": {"cells": piece},
                "tiles": tiles, "answer": answer}

    if kind == "stroop":
        ink = random.choice(COLORS)
        word = random.choice(COLORS)
        while word == ink:
            word = random.choice(COLORS)
        opts = shuffled([ink] + shuffled([c for c in COLORS if c != ink])[:3])
        return {"kind": kind, "prompt": "Tap the COLOUR of the word", "word": word.upper(), "ink": ink,
                "tiles": [{"color": c, "swatch": True} for c in opts], "answer": opts.index(ink)}

    if kind == "next":
        ln = 3 if hard else 2
        cycle = shuffled(SHAPES)[:ln]
        colors = shuffled(COLORS)[:ln]
        seq = [{"shape": cycle[k % ln], "color": colors[k % ln]} for k in range(5)]
        right = {"shape": cycle[5 % ln], "color": colors[5 % ln]}
        wrongs = []
        while len(wrongs) < 3:
            w = {"shape": random.choice(SHAPES), "color": random.choice(COLORS)}
            if w == right or w in wrongs:
                continue
            wrongs.append(w)
        tiles = shuffled([right] + wrongs)
        return {"kind": kind, "prompt": "What comes next?", "seq": seq, "tiles": tiles, "answer": tiles.index(right)}

    n = 5 if hard else 4
    all_cells = [[x, y] for y in range(3) for x in range(3)]
    lit = shuffled(all_cells)[:n]
    key = cells_key(sort_cells(lit))
    answer = ri(0, 3)
    tiles = []
    for k in range(4):
        if k == answer:
            tiles.append({"grid": lit})
            continue
        other, guard = shuffled(all_cells)[:n], 0
        while guard < 40 and cells_key(sort_cells(other)) == key:
            other = shuffled(all_cells)[:n]
            guard += 1
        tiles.append({"grid": other})
    return {"kind": "recall", "prompt": "Which pattern did you just see?", "flash": {"grid": lit},
            "tiles": tiles, "answer": answer}


def mp_tasks(n):
    return [mp_task(i, i >= n / 2) for i in range(n)]


def task_view(t):
    v = {"kind": t["kind"], "prompt": t["prompt"], "tiles": t["tiles"]}
    for k in ("target", "seq", "flash"):
        if k in t:
            v[k] = t[k]
    if t.get("word"):
        v["word"] = t["word"]
        v["ink"] = t["ink"]
    return v


def live_effects(p):
    t = now_ms()
    p["effects"] = [e for e in (p.get("effects") or []) if e["until"] > t]
    return p["effects"]


def mp_view(m, for_id):
    state = "running" if (m["state"] == "countdown" and now_ms() >= m["startAt"]) else m["state"]
    me = next((p for p in m["players"] if p["id"] == for_id), None) if for_id else None
    out = {"id": m["id"], "state": state, "startAt": m["startAt"], "total": m["total"], "winner": m["winner"],
           "players": [{"id": p["id"], "label": p["label"], "platform": p["platform"], "progress": p["progress"],
                        "energy": p["energy"], "combo": p["combo"], "wrong": p.get("wrong") or 0,
                        "done": bool(p["done"]), "ms": p.get("ms") or 0, "left": bool(p["left"]),
                        "effects": [{"kind": e["kind"], "until": e["until"]} for e in live_effects(p)]}
                       for p in m["players"]]}
    if me:
        out["task"] = task_view(m["tasks"][me["progress"]]) if me["progress"] < m["total"] else None
    return out


def player_in(match, did):
    return next((x for x in match["players"] if x["id"] == did), None)


# ================= HTTP =================
class Handler(BaseHTTPRequestHandler):
    server_version = "BrainArcadeLocal/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # keep the console readable: heartbeats arrive every few seconds

    def send(self, code, body, ctype="application/json"):
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        elif isinstance(body, str):
            data = body.encode("utf-8")
        else:
            data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 8_000_000:
                return {}
            d = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            return d if isinstance(d, dict) else {}
        except Exception:
            return {}

    def authed(self):
        return not ADMIN_TOKEN or self.headers.get("X-Admin-Token") == ADMIN_TOKEN

    def do_OPTIONS(self):
        self.send(204, "")

    def do_GET(self):
        self.route("GET")

    def do_HEAD(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def route(self, method):
        u = urlparse(self.path)
        p = u.path
        q = parse_qs(u.query)
        try:
            if p.startswith("/api/"):
                with LOCK:
                    return self.api(method, p, q)
            return self.static(p)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # never let one bad request kill the server
            print("  error on %s %s: %r" % (method, p, e))
            try:
                self.send(500, {"error": "server error"})
            except Exception:
                pass

    # ---------------------------------------------------------------- API
    def api(self, method, p, q):
        if p == "/api/ping":
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                log_once("ping " + self.client_address[0], 30, "A device at %s reached this server" % self.client_address[0])
            # How tablets recognise a Brain Arcade server when they scan the WiFi.
            return self.send(200, {"brainArcade": True, "kind": "local", "name": socket.gethostname(), "version": VERSION})

        if p == "/api/heartbeat" and method == "POST":
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            bat = b.get("battery")
            bat = bat if isinstance(bat, (int, float)) and not isinstance(bat, bool) and bat >= 0 else None
            prev = devices.get(did, {})
            if not prev or now_ms() - prev.get("lastSeen", 0) > ONLINE_MS:
                first_connect[0] = True
                log("Tablet connected: %s (%s, app %s)" % (b.get("name") or "Tablet", self.client_address[0], b.get("app") or "?"))
            games = b.get("games") if isinstance(b.get("games"), list) and b.get("games") else prev.get("games")
            devices[did] = {
                "id": did, "name": b.get("name") or "Tablet", "app": b.get("app") or "", "lastSeen": now_ms(),
                "platform": str(b["platform"])[:40] if b.get("platform") else prev.get("platform", ""),
                "canFind": bool(prev.get("canFind")) if b.get("canFind") is None else bool(b.get("canFind")),
                "battery": bat, "games": games, "canStream": bool(b.get("canStream")),
                "canKiosk": bool(b.get("canKiosk")), "kiosk": bool(b.get("kiosk")), "tv": bool(b.get("tv")),
                "stats": b["stats"] if isinstance(b.get("stats"), dict) else prev.get("stats"),
                "summary": b["summary"] if isinstance(b.get("summary"), dict) else prev.get("summary"),
            }
            pol = policies.get(did) or default_policy()
            cmd = commands.setdefault(did, {})
            if b.get("findStopped"):
                cmd["findOn"] = False
            if b.get("clearScores"):
                scores[did] = {}
                save_data_soon()
            if isinstance(b.get("scores"), dict):
                store = scores.setdefault(did, {})
                if store != {**store, **b["scores"]}:
                    store.update(b["scores"])
                    save_data_soon()
            taps = inputs.get(did) or []
            inputs[did] = []
            return self.send(200, {
                "locked": bool(pol.get("locked")),
                "allowedGames": pol.get("allowedGames"),
                "appUpdate": cmd.get("appUpdateAt"),
                "popup": {"text": cmd.get("popupText") or "", "ts": cmd["popupAt"]} if cmd.get("popupAt") else None,
                "kiosk": {"on": bool(cmd.get("kioskOn")), "ts": cmd["kioskAt"]} if cmd.get("kioskAt") else None,
                "leave": cmd.get("leaveAt"),
                "find": {"on": bool(cmd.get("findOn")), "ts": cmd.get("findAt") or 0},
                "stream": bool(cmd.get("stream")),
                "input": taps,
                "scoresBackup": scores.get(did),
            })

        if p == "/api/scores" and method == "GET":
            did = (q.get("deviceId") or [None])[0]

            def build(d):
                meta = {g.get("id"): g for g in (d.get("games") or []) if isinstance(g, dict)}
                best = scores.get(d["id"]) or {}
                st = d.get("stats") or {}
                ids = list(meta) if meta else list(dict.fromkeys(list(best) + list(st)))
                out = []
                for gid in ids:
                    m = meta.get(gid) or {}
                    s = st.get(gid) or {}
                    out.append({"id": gid, "name": m.get("name") or gid, "mode": m.get("mode") or "high",
                                "suffix": m.get("suffix") or "", "label": m.get("label") or "Best",
                                "best": best.get(gid) if gid in best else None,
                                "plays": s.get("plays") or 0, "ms": s.get("ms") or 0, "last": s.get("last") or 0})
                return {"id": d["id"], "name": d["name"], "online": (now_ms() - d["lastSeen"]) < ONLINE_MS,
                        "summary": d.get("summary"), "games": out}
            if did:
                d = devices.get(did)
                if not d:
                    return self.send(404, {"error": "unknown device"})
                return self.send(200, build(d))
            return self.send(200, {"devices": [build(d) for d in devices.values()]})

        if p == "/api/devices" and method == "GET":
            t = now_ms()
            lst = []
            for did, d in devices.items():
                cmd = commands.get(did) or {}
                fr = frames.get(did)
                lst.append({
                    "id": d["id"], "name": d["name"], "app": d["app"], "battery": d["battery"],
                    "platform": d.get("platform") or "", "games": d.get("games"),
                    "canStream": bool(d.get("canStream")), "canKiosk": bool(d.get("canKiosk")),
                    "kiosk": bool(d.get("kiosk")), "tv": bool(d.get("tv")), "canFind": bool(d.get("canFind")),
                    "finding": bool(cmd.get("findOn")), "streaming": bool(cmd.get("stream")),
                    "hasFrame": bool(fr and (t - fr["ts"]) < 15000),
                    "lastSeen": d["lastSeen"], "online": (t - d["lastSeen"]) < ONLINE_MS,
                    "policy": policies.get(did) or default_policy(),
                })
            lst.sort(key=lambda a: (not a["online"], a["name"].lower()))
            return self.send(200, {"devices": lst, "serverTime": t})

        if p == "/api/command" and method == "POST":
            if not self.authed():
                return self.send(401, {"error": "unauthorized"})
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            cmd = commands.setdefault(did, {})
            a = b.get("action")
            if a == "update":
                cmd["appUpdateAt"] = now_ms()
            elif a == "popup":
                cmd["popupText"] = str(b.get("text") or "")[:500]
                cmd["popupAt"] = now_ms()
            elif a == "stream":
                cmd["stream"] = bool(b.get("on"))
                if not b.get("on"):
                    frames.pop(did, None)
            elif a == "kiosk":
                cmd["kioskOn"] = bool(b.get("on"))
                cmd["kioskAt"] = now_ms()
            elif a == "leave":
                cmd["leaveAt"] = now_ms()
            elif a == "find":
                cmd["findOn"] = bool(b.get("on"))
                cmd["findAt"] = now_ms()
            return self.send(200, {"ok": True})

        if p == "/api/frame" and method == "POST":
            b = self.body()
            if not b.get("deviceId") or not b.get("data"):
                return self.send(400, {"error": "deviceId and data required"})
            frames[b["deviceId"]] = {"data": str(b["data"]), "ts": now_ms()}
            return self.send(200, {"ok": True})

        if p == "/api/frame" and method == "GET":
            did = (q.get("deviceId") or [None])[0]
            fr = frames.get(did) if did else None
            if not fr:
                return self.send(200, {"data": None})
            return self.send(200, {"data": fr["data"], "ts": fr["ts"]})

        if p == "/api/input" and method == "POST":
            if not self.authed():
                return self.send(401, {"error": "unauthorized"})
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            qq = inputs.setdefault(did, [])
            num = (int, float)
            if b.get("type") == "scroll" and isinstance(b.get("dyFrac"), num):
                qq.append({"type": "scroll", "dyFrac": b["dyFrac"]})
            elif isinstance(b.get("x"), num) and isinstance(b.get("y"), num):
                qq.append({"type": "tap", "x": b["x"], "y": b["y"]})
            del qq[:-30]
            return self.send(200, {"ok": True})

        if p == "/api/device/remove" and method == "POST":
            if not self.authed():
                return self.send(401, {"error": "unauthorized"})
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            for store in (devices, policies, commands, frames, inputs, scores):
                store.pop(did, None)
            save_data_soon()
            return self.send(200, {"ok": True})

        if p == "/api/policy" and method == "POST":
            if not self.authed():
                return self.send(401, {"error": "unauthorized"})
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            policies[did] = {"locked": bool(b.get("locked")),
                             "allowedGames": b["allowedGames"] if isinstance(b.get("allowedGames"), list) else None}
            save_data_soon()
            return self.send(200, {"ok": True, "policy": policies[did]})

        if p == "/api/config" and method == "GET":
            return self.send(200, {"authRequired": bool(ADMIN_TOKEN), "local": True})

        # ---------------- multiplayer ----------------
        if p == "/api/mp/sync" and method == "POST":
            b = self.body()
            did = b.get("deviceId")
            if not did:
                return self.send(400, {"error": "deviceId required"})
            mp_prune()
            me = mp_peer(did)
            me["name"] = str(b.get("name") or "")[:40]
            me["platform"] = str(b.get("platform") or "")[:40]
            me["ts"] = now_ms()
            match = matches.get(me["matchId"]) if me["matchId"] else None
            if not match:
                me["matchId"] = None
            peers = []
            for pid, pq in mp_peers.items():
                if pid == me["id"]:
                    continue
                qm = matches.get(pq["matchId"]) if pq["matchId"] else None
                peers.append({"id": pq["id"], "name": pq["name"], "platform": pq["platform"], "label": mp_label(pq),
                              "busy": bool(qm and qm["state"] != "over")})
            mine = [{"id": v["id"], "from": v["from"], "fromLabel": v["fromLabel"], "ts": v["ts"]}
                    for v in invites.values() if v["to"] == me["id"]]
            return self.send(200, {"me": {"id": me["id"], "label": mp_label(me)}, "peers": peers, "invites": mine,
                                   "match": mp_view(match, me["id"]) if match else None})

        if p == "/api/mp/invite" and method == "POST":
            b = self.body()
            mp_prune()
            if not b.get("deviceId") or not b.get("to"):
                return self.send(400, {"error": "deviceId and to required"})
            if b["to"] not in mp_peers:
                return self.send(404, {"error": "that device is not in the lobby"})
            me = mp_peer(b["deviceId"])
            iid = "inv_%d" % next_seq()
            invites[iid] = {"id": iid, "from": me["id"], "fromLabel": mp_label(me), "to": b["to"], "ts": now_ms()}
            return self.send(200, {"ok": True, "inviteId": iid})

        if p == "/api/mp/respond" and method == "POST":
            b = self.body()
            mp_prune()
            inv = invites.get(b.get("inviteId"))
            if not inv or inv["to"] != b.get("deviceId"):
                return self.send(404, {"error": "unknown invite"})
            del invites[inv["id"]]
            if not b.get("accept"):
                return self.send(200, {"ok": True, "match": None})
            host = mp_peers.get(inv["from"])
            me = mp_peer(b["deviceId"])
            if not host:
                return self.send(404, {"error": "the host left the lobby"})
            match = matches.get(host["matchId"]) if host["matchId"] else None
            if match and match["state"] == "countdown" and len(match["players"]) < MP_MAX:
                match["players"].append(mp_player(me))
            else:
                match = mp_create([host, me])
            host["matchId"] = match["id"]
            me["matchId"] = match["id"]
            for pl in match["players"]:
                if pl["id"] in mp_peers:
                    mp_peers[pl["id"]]["matchId"] = match["id"]
            return self.send(200, {"ok": True, "match": mp_view(match, me["id"])})

        if p == "/api/mp/task" and method == "POST":
            b = self.body()
            match = matches.get(b.get("matchId"))
            if not match:
                return self.send(404, {"error": "unknown match"})
            pl = player_in(match, b.get("deviceId"))
            if not pl:
                return self.send(404, {"error": "not in this match"})
            if now_ms() < match["startAt"]:
                return self.send(200, {"ok": False, "early": True, "match": mp_view(match, pl["id"])})
            if any(e["kind"] == "freeze" for e in live_effects(pl)):
                return self.send(200, {"ok": False, "frozen": True, "match": mp_view(match, pl["id"])})
            correct = None
            if not pl["done"] and pl["progress"] < match["total"]:
                task = match["tasks"][pl["progress"]]
                try:
                    choice = int(b.get("choice"))
                except (TypeError, ValueError):
                    choice = -1
                correct = choice == task["answer"]
                if correct:
                    pl["progress"] += 1
                    pl["combo"] += 1
                    pl["energy"] = min(MP_ENERGY_MAX, pl["energy"] + 1 + (1 if pl["combo"] % 3 == 0 else 0))
                else:
                    pl["wrong"] = (pl.get("wrong") or 0) + 1
                    pl["combo"] = 0
                if pl["progress"] >= match["total"]:
                    pl["done"] = True
                    pl["ms"] = max(1, now_ms() - match["startAt"])
                    if not match["winner"]:
                        match["winner"] = pl["id"]
            live = [x for x in match["players"] if not x["left"]]
            if (live and all(x["done"] for x in live)) or match["winner"]:
                match["state"] = "over"
            return self.send(200, {"ok": True, "correct": correct, "match": mp_view(match, pl["id"])})

        if p == "/api/mp/ability" and method == "POST":
            b = self.body()
            match = matches.get(b.get("matchId"))
            if not match:
                return self.send(404, {"error": "unknown match"})
            pl = player_in(match, b.get("deviceId"))
            if not pl:
                return self.send(404, {"error": "not in this match"})
            if match["state"] == "over" or now_ms() < match["startAt"]:
                return self.send(200, {"ok": False, "match": mp_view(match, pl["id"])})
            kind = b.get("kind")
            ability = MP_ABILITIES.get(kind)
            if not ability:
                return self.send(400, {"error": "unknown ability"})
            if pl["energy"] < ability["cost"]:
                return self.send(200, {"ok": False, "reason": "not enough boost", "match": mp_view(match, pl["id"])})
            if ability.get("self"):
                pl["effects"].append({"kind": kind, "until": now_ms() + ability["ms"], "from": pl["label"]})
                target_label = pl["label"]
            elif kind == "turbo":
                pl["progress"] = min(match["total"], pl["progress"] + ability["jump"])
                pl["combo"] = 0
                if pl["progress"] >= match["total"]:
                    pl["done"] = True
                    pl["ms"] = max(1, now_ms() - match["startAt"])
                    if not match["winner"]:
                        match["winner"] = pl["id"]
                    match["state"] = "over"
                target_label = pl["label"]
            else:
                others = sorted([x for x in match["players"] if x["id"] != pl["id"] and not x["left"] and not x["done"]],
                                key=lambda x: -x["progress"])
                if not others:
                    return self.send(200, {"ok": False, "reason": "nobody to aim at", "match": mp_view(match, pl["id"])})
                target = others[0]
                if any(e["kind"] == "shield" for e in live_effects(target)):
                    target["effects"] = [e for e in target["effects"] if e["kind"] != "shield"]
                    target_label = target["label"] + " (blocked!)"
                else:
                    target["effects"].append({"kind": kind, "until": now_ms() + ability["ms"], "from": pl["label"]})
                    target_label = target["label"]
            pl["energy"] -= ability["cost"]
            return self.send(200, {"ok": True, "used": kind, "target": target_label, "match": mp_view(match, pl["id"])})

        if p == "/api/mp/quit" and method == "POST":
            b = self.body()
            me = mp_peers.get(b.get("deviceId"))
            match = matches.get(b.get("matchId")) if b.get("matchId") else None
            if not match and me and me["matchId"]:
                match = matches.get(me["matchId"])
            if match:
                for x in match["players"]:
                    if x["id"] == b.get("deviceId"):
                        x["left"] = True
                if len([x for x in match["players"] if not x["left"]]) < 2:
                    match["state"] = "over"
            if me:
                me["matchId"] = None
                if b.get("leaveLobby"):
                    mp_peers.pop(me["id"], None)
            return self.send(200, {"ok": True})

        return self.send(404, {"error": "not found"})

    # ------------------------------------------------------------- static
    def file(self, root, rel):
        fp = os.path.realpath(os.path.join(root, rel.lstrip("/\\")))
        if (fp == root or fp.startswith(root + os.sep)) and os.path.isfile(fp):
            ctype = {".webmanifest": "application/manifest+json", ".js": "text/javascript"}.get(
                os.path.splitext(fp)[1]) or mimetypes.guess_type(fp)[0] or "application/octet-stream"
            with open(fp, "rb") as f:
                return self.send(200, f.read(), ctype)
        return self.send(404, {"error": "not found"})

    def static(self, p):
        if p == "/play":
            self.send_response(302)
            self.send_header("Location", "/play/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if p.startswith("/play/"):
            rel = "index.html" if p == "/play/" else p[len("/play/"):]
            return self.file(GAMES_DIR, rel)
        return self.file(PUBLIC, "index.html" if p == "/" else p)


# ================= LAN discovery =================
def discovery_responder(port):
    """Answer tablets that shout 'is there a Brain Arcade server here?' on the WiFi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", DISCOVERY_PORT))
    except OSError as e:
        print("  ! Auto-discovery is off (UDP %d busy: %s). Tablets will still find this" % (DISCOVERY_PORT, e))
        print("    computer by scanning the WiFi, it just takes a few seconds longer.")
        return
    reply = json.dumps({"brainArcade": True, "port": port, "name": socket.gethostname()}).encode("utf-8")
    while True:
        try:
            data, addr = s.recvfrom(1024)
            if data.strip().startswith(DISCOVER_MAGIC):
                s.sendto(reply, addr)
                log_once("udp " + addr[0], 60, "A tablet at %s is looking for this server - answered it" % addr[0])
        except Exception:
            time.sleep(0.2)


def lan_ips():
    ips = set()
    try:
        u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        u.connect(("10.255.255.255", 1))   # no packet is sent; this just picks the LAN interface
        ips.add(u.getsockname()[0])
        u.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    best = None
    try:
        u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        u.connect(("10.255.255.255", 1))
        best = u.getsockname()[0]
        u.close()
    except Exception:
        pass
    rest = sorted(ip for ip in ips if not ip.startswith("127.") and ip != best)
    return ([best] if best and not best.startswith("127.") else []) + rest


# ================= Windows Firewall =================
FW = "Brain Arcade Server"


def fw_rule_names(port):
    return ["%s (TCP %d)" % (FW, port), "%s (UDP %d)" % (FW, DISCOVERY_PORT)]


def fw_has_rules(port):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    for name in fw_rule_names(port):
        try:
            r = subprocess.run(["netsh", "advfirewall", "firewall", "show", "rule", "name=" + name],
                               capture_output=True, text=True, creationflags=flags, timeout=15)
            if r.returncode != 0:
                return False
        except Exception:
            return False
    return True


def ensure_firewall(port):
    """On Windows, let tablets in: the 'Allow access' pop-up only covers Private
    networks, and clicking Cancel on it silently adds BLOCK rules. Asks once
    for admin (UAC) and adds allow rules for this port + discovery on every
    network type, after removing any block rules for this program."""
    if os.name != "nt":
        return
    if fw_has_rules(port):
        log("Windows Firewall: tablets are allowed in.")
        return
    exe = sys.executable
    tcp, udp = fw_rule_names(port)
    bat = os.path.join(tempfile.gettempdir(), "brain_arcade_firewall.bat")
    with open(bat, "w", newline="") as f:
        f.write("@echo off\r\n")
        f.write('powershell -NoProfile -Command "Get-NetFirewallApplicationFilter -Program \'%s\' -ErrorAction SilentlyContinue | '
                'Get-NetFirewallRule | Where-Object { $_.Action -eq \'Block\' } | Remove-NetFirewallRule" >nul 2>&1\r\n' % exe)
        for name in (tcp, udp):
            f.write('netsh advfirewall firewall delete rule name="%s" >nul 2>&1\r\n' % name)
        f.write('netsh advfirewall firewall add rule name="%s" dir=in action=allow protocol=TCP localport=%d profile=any >nul\r\n' % (tcp, port))
        f.write('netsh advfirewall firewall add rule name="%s" dir=in action=allow protocol=UDP localport=%d profile=any >nul\r\n' % (udp, DISCOVERY_PORT))
    log("Asking Windows to let tablets connect - click YES on the pop-up.")
    try:
        if ctypes.windll.shell32.IsUserAnAdmin():
            subprocess.run(["cmd", "/c", bat], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), timeout=60)
        else:
            rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", bat, None, None, 0)
            if rc <= 32:
                raise OSError("declined")
            for _ in range(20):
                time.sleep(1)
                if fw_has_rules(port):
                    break
    except Exception:
        pass
    if fw_has_rules(port):
        log("Windows Firewall: done - tablets are allowed in.")
    else:
        log("Windows Firewall was NOT changed, so tablets may be blocked. To fix it:")
        log("  close this window, right-click BrainArcadeServer.exe > 'Run as administrator' once,")
        log("  or set your WiFi to 'Private' in Windows Settings > Network.")


def troubleshoot_later(port, ips):
    time.sleep(75)
    if first_connect[0]:
        return
    addr = ips[0] if ips else "this computer's IP"
    log("No tablet has connected yet. Things to check:")
    log("  1. The tablet runs Brain Arcade 1.17 or newer (Settings shows 'Use a server on this WiFi').")
    log("  2. It is on the SAME WiFi as this computer (not a guest network).")
    log("  3. On the tablet: Settings > Computer's address > type  %s  > Test." % addr)
    log("  4. If Test fails, the firewall or router is blocking it (see above).")


def main():
    ap = argparse.ArgumentParser(description="Brain Arcade local control server")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", DEFAULT_PORT)))
    ap.add_argument("--no-browser", action="store_true", help="do not open the dashboard on start")
    ap.add_argument("--no-firewall", action="store_true", help="do not touch the Windows Firewall")
    args = ap.parse_args()

    load_data()
    try:
        httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    except OSError as e:
        print("Could not start on port %d: %s" % (args.port, e))
        print("Is it already running? Try:  --port 8788")
        if getattr(sys, "frozen", False):
            input("Press Enter to close...")
        sys.exit(1)
    httpd.daemon_threads = True
    threading.Thread(target=discovery_responder, args=(args.port,), daemon=True).start()

    ips = lan_ips()
    line = "=" * 60
    print(line)
    print("  Brain Arcade local server is running")
    print(line)
    print("  Dashboard on this computer:  http://localhost:%d" % args.port)
    for ip in ips:
        print("  Dashboard on other devices:  http://%s:%d" % (ip, args.port))
        print("  Play in a browser:           http://%s:%d/play/" % (ip, args.port))
    print()
    print("  Tablets on this WiFi find this computer by themselves.")
    if ips:
        print("  If one does not, type this on the tablet in")
        print("  Settings > Computer's address:   %s" % (ips[0] if args.port == DEFAULT_PORT else "%s:%d" % (ips[0], args.port)))
    print("  Leave this window open. Press Ctrl+C to stop.")
    print(line, flush=True)
    if not args.no_firewall:
        threading.Thread(target=ensure_firewall, args=(args.port,), daemon=True).start()
    threading.Thread(target=troubleshoot_later, args=(args.port, ips), daemon=True).start()
    if not os.path.isdir(GAMES_DIR):
        print("  (the /play/ games bundle was not found at %s)" % GAMES_DIR)
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open("http://localhost:%d" % args.port)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
