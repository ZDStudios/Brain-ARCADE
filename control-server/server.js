/* Brain Arcade — control server
   Pure Node (no dependencies). Serves the dashboard + a small JSON API.
   Devices (tablets) send heartbeats; the dashboard shows who's online and
   lets you lock a device or restrict it to certain games.

   Env:
     PORT         - port to listen on (Render sets this automatically)
     ADMIN_TOKEN  - optional; if set, changing policy requires this token
*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ONLINE_MS = 40000;

const devices = Object.create(null);  // id -> { id, name, app, lastSeen, battery, games }
const policies = Object.create(null); // id -> { locked, allowedGames }
const commands = Object.create(null); // id -> { appUpdateAt, popupText, popupAt, stream }
const frames = Object.create(null);   // id -> { data, ts }  (latest screen image, on-demand)
const inputs = Object.create(null);   // id -> [ { x, y } ]  (queued remote taps)
const scores = Object.create(null);   // id -> { gameId: bestValue }  (backup across reinstalls)

function defaultPolicy() { return { locked: false, allowedGames: null }; }

/* ---- multiplayer (Brain Race) ----
   Presence is separate from the heartbeat devices list on purpose: a tablet is a
   "device" the moment it checks in, but it is only a racer while somebody has the
   multiplayer lobby open on it.                                                  */
const MP_MAX = 3;                     // racers per match
const MP_TASKS = 12;                  // tasks to complete the race
const MP_ENERGY_MAX = 9;
/* Special abilities. Costs are in boost energy, which you earn by answering. */
const MP_ABILITIES = {
    turbo:    { cost: 3, jump: 2 },                 // jump two lengths forward
    freeze:   { cost: 4, ms: 3000 },                // the leader cannot answer for 3s
    scramble: { cost: 2, ms: 8000 },                // the leader's tiles keep shuffling
    shield:   { cost: 3, ms: 12000, self: true }    // absorbs the next hit aimed at you
};
const MP_PEER_MS = 20000;             // presence expires this long after the last poll
const mpPeers = Object.create(null);  // id -> { id, name, platform, ts, matchId }
const invites = Object.create(null);  // id -> { id, from, fromLabel, to, ts }
const matches = Object.create(null);  // id -> match
let seq = 0;

function mpPeer(id) {
    return mpPeers[id] || (mpPeers[id] = { id: id, name: "", platform: "", ts: Date.now(), matchId: null });
}
/** What the other devices see: the device's own name, or its OS as a fallback. */
function mpLabel(peer) {
    return (peer.name && peer.name.trim()) || peer.platform || "Brain Arcade device";
}
function mpPrune() {
    const now = Date.now();
    Object.keys(mpPeers).forEach(function (id) { if (now - mpPeers[id].ts > MP_PEER_MS) delete mpPeers[id]; });
    Object.keys(invites).forEach(function (k) {
        const v = invites[k];
        if (now - v.ts > 45000 || !mpPeers[v.from] || !mpPeers[v.to]) delete invites[k];
    });
    Object.keys(matches).forEach(function (k) {
        if (now - matches[k].createdAt > 15 * 60000) delete matches[k];
    });
}
function mpPlayer(peer) {
    return {
        id: peer.id, label: mpLabel(peer), platform: peer.platform || "",
        progress: 0, energy: 0, combo: 0, wrong: 0,
        effects: [],            // { kind, until, from }
        done: false, ms: 0, left: false
    };
}
function mpCreate(peers) {
    const id = "mtc_" + (++seq);
    const m = {
        id: id, state: "countdown", createdAt: Date.now(),
        startAt: Date.now() + 4000,          // shared countdown, so nobody starts early
        total: MP_TASKS, tasks: mpTasks(MP_TASKS),
        players: peers.map(mpPlayer), winner: null
    };
    matches[id] = m;
    return m;
}

/* ---- the tasks that move your racer ----
   Deliberately no arithmetic: these are visual/attention puzzles (odd one out,
   mental rotation, Stroop, what-comes-next, pattern recall). Every one is
   "pick 1 of 4" so the controls stay identical whichever task comes up, and the
   answer never leaves the server — the client sends its pick and is told. */
const SHAPES = ["circle", "square", "triangle", "star", "hexagon", "diamond"];
const COLORS = ["red", "blue", "green", "yellow", "purple", "orange"];
const TASK_KINDS = ["odd", "rotate", "stroop", "next", "recall"];

function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
}
/** A polyomino as a list of [x,y] cells, rotated k quarter-turns in a 4x4 box. */
function rotateCells(cells, k) {
    let out = cells.map(function (c) { return [c[0], c[1]]; });
    for (let n = 0; n < ((k % 4) + 4) % 4; n++) out = out.map(function (c) { return [3 - c[1], c[0]]; });
    // normalise to the top-left so rotations are comparable as sets
    const mx = Math.min.apply(null, out.map(function (c) { return c[0]; }));
    const my = Math.min.apply(null, out.map(function (c) { return c[1]; }));
    return out.map(function (c) { return [c[0] - mx, c[1] - my]; }).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
}
function cellsKey(cells) { return cells.map(function (c) { return c.join(","); }).join(";"); }
function randomPiece() {
    const cells = [[1, 1]];
    while (cells.length < ri(4, 5)) {
        const from = pick(cells);
        const step = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const c = [from[0] + step[0], from[1] + step[1]];
        if (c[0] < 0 || c[1] < 0 || c[0] > 3 || c[1] > 3) continue;
        if (cells.some(function (x) { return x[0] === c[0] && x[1] === c[1]; })) continue;
        cells.push(c);
    }
    return rotateCells(cells, 0);
}

function mpTask(i, hard) {
    const kind = TASK_KINDS[i % TASK_KINDS.length];

    if (kind === "odd") {
        // Four tiles; one differs in shape or colour. Attention / visual search.
        const shape = pick(SHAPES), color = pick(COLORS);
        const byShape = Math.random() < 0.5;
        let other = shape, otherColor = color;
        if (byShape) { while (other === shape) other = pick(SHAPES); }
        else { while (otherColor === color) otherColor = pick(COLORS); }
        const odd = ri(0, 3);
        const items = [];
        for (let k = 0; k < 4; k++) {
            items.push(k === odd ? { shape: byShape ? other : shape, color: byShape ? color : otherColor }
                                 : { shape: shape, color: color });
        }
        return { kind: kind, prompt: "Which one is different?", tiles: items, answer: odd };
    }

    if (kind === "rotate") {
        // Mental rotation: which tile is the same piece, just turned?
        const piece = randomPiece();
        const answer = ri(0, 3);
        const tiles = [];
        const target = cellsKey(piece);
        for (let k = 0; k < 4; k++) {
            if (k === answer) { tiles.push({ cells: rotateCells(piece, ri(1, 3)) }); continue; }
            let other = randomPiece(), guard = 0;
            // a decoy must NOT be the same piece under any rotation
            while (guard++ < 40 && [0, 1, 2, 3].some(function (r) { return cellsKey(rotateCells(other, r)) === target; })) other = randomPiece();
            tiles.push({ cells: other });
        }
        return { kind: kind, prompt: "Which one is the same piece, turned?", target: { cells: piece }, tiles: tiles, answer: answer };
    }

    if (kind === "stroop") {
        // Say the INK, not the word. Classic interference task.
        const ink = pick(COLORS);
        let word = pick(COLORS);
        while (word === ink) word = pick(COLORS);
        const opts = shuffled([ink].concat(shuffled(COLORS.filter(function (c) { return c !== ink; })).slice(0, 3)));
        return { kind: kind, prompt: "Tap the COLOUR of the word", word: word.toUpperCase(), ink: ink,
                 tiles: opts.map(function (c) { return { color: c, swatch: true }; }), answer: opts.indexOf(ink) };
    }

    if (kind === "next") {
        // What comes next in the pattern? (shape/colour cycles, not numbers)
        const len = hard ? 3 : 2;
        const cycle = shuffled(SHAPES).slice(0, len);
        const colors = shuffled(COLORS).slice(0, len);
        const seq = [];
        for (let k = 0; k < 5; k++) seq.push({ shape: cycle[k % len], color: colors[k % len] });
        const right = { shape: cycle[5 % len], color: colors[5 % len] };
        const wrongs = [];
        while (wrongs.length < 3) {
            const w = { shape: pick(SHAPES), color: pick(COLORS) };
            if (w.shape === right.shape && w.color === right.color) continue;
            if (wrongs.some(function (x) { return x.shape === w.shape && x.color === w.color; })) continue;
            wrongs.push(w);
        }
        const tiles = shuffled([right].concat(wrongs));
        return { kind: kind, prompt: "What comes next?", seq: seq, tiles: tiles,
                 answer: tiles.findIndex(function (t) { return t.shape === right.shape && t.color === right.color; }) };
    }

    // recall: a lit pattern flashes, then pick the one you saw
    const n = hard ? 5 : 4;
    const all = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) all.push([x, y]);
    const litCells = shuffled(all).slice(0, n);
    const key = cellsKey(litCells.slice().sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; }));
    const answer = ri(0, 3);
    const tiles = [];
    for (let k = 0; k < 4; k++) {
        if (k === answer) { tiles.push({ grid: litCells }); continue; }
        let other = shuffled(all).slice(0, n), guard = 0;
        while (guard++ < 40 && cellsKey(other.slice().sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; })) === key) other = shuffled(all).slice(0, n);
        tiles.push({ grid: other });
    }
    return { kind: "recall", prompt: "Which pattern did you just see?", flash: { grid: litCells }, tiles: tiles, answer: answer };
}

function mpTasks(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(mpTask(i, i >= n / 2));
    return out;
}

/** Strip a task of its answer before it goes near a client. */
function taskView(t) {
    const v = { kind: t.kind, prompt: t.prompt, tiles: t.tiles };
    if (t.target) v.target = t.target;
    if (t.seq) v.seq = t.seq;
    if (t.flash) v.flash = t.flash;
    if (t.word) { v.word = t.word; v.ink = t.ink; }
    return v;
}

function liveEffects(p) {
    const now = Date.now();
    p.effects = (p.effects || []).filter(function (e) { return e.until > now; });
    return p.effects;
}

/** Client-safe view. Answers stay on the server; tasks arrive one at a time. */
function mpView(m, forId) {
    // "countdown" becomes "running" purely by the clock — both sides share startAt,
    // so nobody needs a message to tell them the race began.
    const state = (m.state === "countdown" && Date.now() >= m.startAt) ? "running" : m.state;
    const meP = forId ? m.players.filter(function (p) { return p.id === forId; })[0] : null;
    const out = {
        id: m.id, state: state, startAt: m.startAt, total: m.total, winner: m.winner,
        players: m.players.map(function (p) {
            return {
                id: p.id, label: p.label, platform: p.platform, progress: p.progress,
                energy: p.energy, combo: p.combo, wrong: p.wrong || 0,
                done: !!p.done, ms: p.ms || 0, left: !!p.left,
                effects: liveEffects(p).map(function (e) { return { kind: e.kind, until: e.until }; })
            };
        })
    };
    if (meP) out.task = meP.progress < m.total ? taskView(m.tasks[meP.progress]) : null;
    return out;
}

function send(res, code, body, type) {
    res.writeHead(code, {
        "Content-Type": type || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Cache-Control": "no-store"
    });
    res.end(Buffer.isBuffer(body) ? body : (typeof body === "string" ? body : JSON.stringify(body)));
}

function readBody(req) {
    return new Promise(function (resolve) {
        let data = "";
        req.on("data", function (c) { data += c; if (data.length > 1e6) req.destroy(); });
        req.on("end", function () { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    });
}

const PUBLIC = path.join(__dirname, "public");
const GAMES_DIR = path.join(__dirname, "..", "www"); // the playable game bundle
const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
    ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
    ".webmanifest": "application/manifest+json"
};

const server = http.createServer(async function (req, res) {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;

    if (req.method === "OPTIONS") return send(res, 204, "");

    // ---- API ----
    if (p === "/api/heartbeat" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        var bat = (typeof b.battery === "number" && b.battery >= 0) ? b.battery : null;
        var prev = devices[b.deviceId] || {};
        var games = Array.isArray(b.games) && b.games.length ? b.games : (prev.games || null);
        devices[b.deviceId] = {
            id: b.deviceId, name: b.name || "Tablet", app: b.app || "", lastSeen: Date.now(),
            platform: b.platform ? String(b.platform).slice(0, 40) : (prev.platform || ""),
            canFind: b.canFind === undefined ? !!prev.canFind : !!b.canFind,
            battery: bat, games: games, canStream: !!b.canStream,
            canKiosk: !!b.canKiosk, kiosk: !!b.kiosk, tv: !!b.tv,
            stats: (b.stats && typeof b.stats === "object") ? b.stats : (prev.stats || null),
            summary: (b.summary && typeof b.summary === "object") ? b.summary : (prev.summary || null)
        };
        const pol = policies[b.deviceId] || defaultPolicy();
        const cmd = commands[b.deviceId] || (commands[b.deviceId] = {});

        // The device reports when the alarm was stopped on it, so the dashboard
        // button flips back without the parent having to guess.
        if (b.findStopped) cmd.findOn = false;

        // --- score backup / restore (keyed by the device's stable id) ---
        if (b.clearScores) { scores[b.deviceId] = {}; }
        if (b.scores && typeof b.scores === "object") {
            var store = scores[b.deviceId] || (scores[b.deviceId] = {});
            // The device is authoritative for the games it reports a best for.
            Object.keys(b.scores).forEach(function (g) { store[g] = b.scores[g]; });
        }

        // --- drain queued remote taps for this device ---
        var taps = inputs[b.deviceId] || [];
        inputs[b.deviceId] = [];

        return send(res, 200, {
            locked: !!pol.locked,
            allowedGames: pol.allowedGames,
            appUpdate: cmd.appUpdateAt || null,
            popup: cmd.popupAt ? { text: cmd.popupText || "", ts: cmd.popupAt } : null,
            kiosk: cmd.kioskAt ? { on: !!cmd.kioskOn, ts: cmd.kioskAt } : null,
            // "let them out": step the tablet out to its normal home screen without
            // changing the kiosk setting.
            leave: cmd.leaveAt || null,
            find: { on: !!cmd.findOn, ts: cmd.findAt || 0 },
            stream: !!cmd.stream,
            input: taps,
            scoresBackup: scores[b.deviceId] || null
        });
    }

    // Full high-score + play-stats report for one device (or every device).
    if (p === "/api/scores" && req.method === "GET") {
        const id = u.searchParams.get("deviceId");
        const build = function (d) {
            const meta = {};
            (d.games || []).forEach(function (g) { meta[g.id] = g; });
            const best = scores[d.id] || {};
            const st = d.stats || {};
            const ids = Object.keys(meta).length ? Object.keys(meta)
                : Array.from(new Set(Object.keys(best).concat(Object.keys(st))));
            return {
                id: d.id, name: d.name, online: (Date.now() - d.lastSeen) < ONLINE_MS,
                summary: d.summary || null,
                games: ids.map(function (gid) {
                    const m = meta[gid] || {};
                    const s = st[gid] || {};
                    return {
                        id: gid, name: m.name || gid,
                        mode: m.mode || "high", suffix: m.suffix || "", label: m.label || "Best",
                        best: (gid in best) ? best[gid] : null,
                        plays: s.plays || 0, ms: s.ms || 0, last: s.last || 0
                    };
                })
            };
        };
        if (id) {
            const d = devices[id];
            if (!d) return send(res, 404, { error: "unknown device" });
            return send(res, 200, build(d));
        }
        return send(res, 200, { devices: Object.keys(devices).map(function (k) { return build(devices[k]); }) });
    }

    if (p === "/api/devices" && req.method === "GET") {
        const now = Date.now();
        const list = Object.keys(devices).map(function (id) {
            const d = devices[id];
            const cmd = commands[id] || {};
            const fr = frames[id];
            return {
                id: d.id, name: d.name, app: d.app, battery: d.battery,
                platform: d.platform || "",
                games: d.games || null,
                canStream: !!d.canStream,
                canKiosk: !!d.canKiosk, kiosk: !!d.kiosk, tv: !!d.tv,
                canFind: !!d.canFind,
                finding: !!cmd.findOn,
                streaming: !!cmd.stream,
                hasFrame: !!(fr && (now - fr.ts) < 15000),
                lastSeen: d.lastSeen, online: (now - d.lastSeen) < ONLINE_MS,
                policy: policies[id] || defaultPolicy()
            };
        }).sort(function (a, b) { return (b.online - a.online) || a.name.localeCompare(b.name); });
        return send(res, 200, { devices: list, serverTime: now });
    }

    if (p === "/api/command" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        const cmd = commands[b.deviceId] || (commands[b.deviceId] = {});
        if (b.action === "update") { cmd.appUpdateAt = Date.now(); }
        else if (b.action === "popup") { cmd.popupText = String(b.text || "").slice(0, 500); cmd.popupAt = Date.now(); }
        else if (b.action === "stream") { cmd.stream = !!b.on; if (!b.on) delete frames[b.deviceId]; }
        else if (b.action === "kiosk") { cmd.kioskOn = !!b.on; cmd.kioskAt = Date.now(); }
        else if (b.action === "leave") { cmd.leaveAt = Date.now(); }
        // "Where is it?" — ring the device until somebody stops it, on the device
        // or from here.
        else if (b.action === "find") { cmd.findOn = !!b.on; cmd.findAt = Date.now(); }
        return send(res, 200, { ok: true });
    }

    // Device uploads a screen frame (only while streaming is enabled).
    if (p === "/api/frame" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.deviceId || !b.data) return send(res, 400, { error: "deviceId and data required" });
        frames[b.deviceId] = { data: String(b.data), ts: Date.now() };
        return send(res, 200, { ok: true });
    }

    // Dashboard fetches the latest frame for a device.
    if (p === "/api/frame" && req.method === "GET") {
        const id = u.searchParams.get("deviceId");
        const fr = id && frames[id];
        if (!fr) return send(res, 200, { data: null });
        return send(res, 200, { data: fr.data, ts: fr.ts });
    }

    // Dashboard queues remote input: a tap (normalized 0..1 coords) or a scroll
    // (dyFrac is a fraction of the screen height, so it works on any device).
    if (p === "/api/input" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        var q = inputs[b.deviceId] || (inputs[b.deviceId] = []);
        if (b.type === "scroll" && typeof b.dyFrac === "number") {
            q.push({ type: "scroll", dyFrac: b.dyFrac });
        } else if (typeof b.x === "number" && typeof b.y === "number") {
            q.push({ type: "tap", x: b.x, y: b.y });
        }
        if (q.length > 30) q.splice(0, q.length - 30);
        return send(res, 200, { ok: true });
    }

    if (p === "/api/device/remove" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        delete devices[b.deviceId]; delete policies[b.deviceId]; delete commands[b.deviceId];
        delete frames[b.deviceId]; delete inputs[b.deviceId]; delete scores[b.deviceId];
        return send(res, 200, { ok: true });
    }

    if (p === "/api/policy" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        policies[b.deviceId] = {
            locked: !!b.locked,
            allowedGames: Array.isArray(b.allowedGames) ? b.allowedGames : null
        };
        return send(res, 200, { ok: true, policy: policies[b.deviceId] });
    }

    if (p === "/api/config" && req.method === "GET") {
        return send(res, 200, { authRequired: !!ADMIN_TOKEN });
    }

    /* ================= Multiplayer (Brain Race) =================
       Devices in the lobby call /api/mp/sync every couple of seconds; it is the
       only endpoint that returns state, so a client never has to stitch several
       responses together. Everything lives in memory — a match is worth nothing
       once it is over, and a restart just drops everyone back to the lobby.   */

    // One poll: refresh my presence and get back peers, invites and my match.
    if (p === "/api/mp/sync" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        mpPrune();
        const me = mpPeer(b.deviceId);
        me.name = String(b.name || "").slice(0, 40);
        me.platform = String(b.platform || "").slice(0, 40);
        me.ts = Date.now();
        const match = me.matchId ? matches[me.matchId] : null;
        if (!match) me.matchId = null;
        return send(res, 200, {
            me: { id: me.id, label: mpLabel(me) },
            peers: Object.keys(mpPeers).filter(function (id) { return id !== me.id; }).map(function (id) {
                const q = mpPeers[id];
                // "Busy" means mid-race. A device still looking at a result panel is
                // free to be invited again, so a finished match does not count.
                const qm = q.matchId ? matches[q.matchId] : null;
                return { id: q.id, name: q.name, platform: q.platform, label: mpLabel(q),
                         busy: !!(qm && qm.state !== "over") };
            }),
            invites: Object.keys(invites).map(function (k) { return invites[k]; })
                .filter(function (v) { return v.to === me.id; })
                .map(function (v) { return { id: v.id, from: v.from, fromLabel: v.fromLabel, ts: v.ts }; }),
            match: match ? mpView(match, me.id) : null
        });
    }

    // Ask another device to race.
    if (p === "/api/mp/invite" && req.method === "POST") {
        const b = await readBody(req);
        mpPrune();
        if (!b.deviceId || !b.to) return send(res, 400, { error: "deviceId and to required" });
        if (!mpPeers[b.to]) return send(res, 404, { error: "that device is not in the lobby" });
        const me = mpPeer(b.deviceId);
        const id = "inv_" + (++seq);
        invites[id] = { id: id, from: me.id, fromLabel: mpLabel(me), to: b.to, ts: Date.now() };
        return send(res, 200, { ok: true, inviteId: id });
    }

    // Accept or decline. Accepting a second invite from the same host joins the
    // match already forming, which is how a third racer gets in.
    if (p === "/api/mp/respond" && req.method === "POST") {
        const b = await readBody(req);
        mpPrune();
        const inv = invites[b.inviteId];
        if (!inv || inv.to !== b.deviceId) return send(res, 404, { error: "unknown invite" });
        delete invites[inv.id];
        if (!b.accept) return send(res, 200, { ok: true, match: null });
        const host = mpPeers[inv.from], me = mpPeer(b.deviceId);
        if (!host) return send(res, 404, { error: "the host left the lobby" });
        let match = host.matchId ? matches[host.matchId] : null;
        if (match && match.state === "countdown" && match.players.length < MP_MAX) {
            match.players.push(mpPlayer(me));
        } else {
            match = mpCreate([host, me]);
        }
        host.matchId = match.id; me.matchId = match.id;
        match.players.forEach(function (pl) { if (mpPeers[pl.id]) mpPeers[pl.id].matchId = match.id; });
        return send(res, 200, { ok: true, match: mpView(match, me.id) });
    }

    /* One task answered. The server owns the answer key, the progress and the
       energy — a client can only say which tile it picked. */
    if (p === "/api/mp/task" && req.method === "POST") {
        const b = await readBody(req);
        const match = matches[b.matchId];
        if (!match) return send(res, 404, { error: "unknown match" });
        const pl = match.players.filter(function (x) { return x.id === b.deviceId; })[0];
        if (!pl) return send(res, 404, { error: "not in this match" });
        // Nothing counts before "Go" — otherwise an early tap banks progress during
        // the countdown and the finish time comes out negative.
        if (Date.now() < match.startAt) return send(res, 200, { ok: false, early: true, match: mpView(match, pl.id) });
        // Frozen players cannot answer; that is the whole point of the ability.
        const frozen = liveEffects(pl).some(function (e) { return e.kind === "freeze"; });
        if (frozen) return send(res, 200, { ok: false, frozen: true, match: mpView(match, pl.id) });

        let correct = null;
        if (!pl.done && pl.progress < match.total) {
            const task = match.tasks[pl.progress];
            correct = Number(b.choice) === task.answer;
            if (correct) {
                pl.progress++;
                pl.combo++;
                // Every answer charges the boost meter; a streak of three charges more.
                pl.energy = Math.min(MP_ENERGY_MAX, pl.energy + 1 + (pl.combo % 3 === 0 ? 1 : 0));
            } else {
                pl.wrong = (pl.wrong || 0) + 1;
                pl.combo = 0;
            }
            if (pl.progress >= match.total) {
                pl.done = true;
                pl.ms = Math.max(1, Date.now() - match.startAt);
                if (!match.winner) match.winner = pl.id;
            }
        }
        const live = match.players.filter(function (x) { return !x.left; });
        if (live.length && live.every(function (x) { return x.done; })) match.state = "over";
        else if (match.winner) match.state = "over";   // a race ends when it is won
        return send(res, 200, { ok: true, correct: correct, match: mpView(match, pl.id) });
    }

    /* Spend boost energy on a special ability. Offensive abilities always aim at
       whoever is winning (excluding yourself), so there is no target UI to learn. */
    if (p === "/api/mp/ability" && req.method === "POST") {
        const b = await readBody(req);
        const match = matches[b.matchId];
        if (!match) return send(res, 404, { error: "unknown match" });
        const pl = match.players.filter(function (x) { return x.id === b.deviceId; })[0];
        if (!pl) return send(res, 404, { error: "not in this match" });
        if (match.state === "over" || Date.now() < match.startAt) return send(res, 200, { ok: false, match: mpView(match, pl.id) });
        const ability = MP_ABILITIES[b.kind];
        if (!ability) return send(res, 400, { error: "unknown ability" });
        if (pl.energy < ability.cost) return send(res, 200, { ok: false, reason: "not enough boost", match: mpView(match, pl.id) });

        let targetLabel = "";
        if (ability.self) {
            pl.effects.push({ kind: b.kind, until: Date.now() + ability.ms, from: pl.label });
            targetLabel = pl.label;
        } else if (b.kind === "turbo") {
            pl.progress = Math.min(match.total, pl.progress + ability.jump);
            pl.combo = 0;                     // a turbo is not a streak of answers
            if (pl.progress >= match.total) {
                pl.done = true;
                pl.ms = Math.max(1, Date.now() - match.startAt);
                if (!match.winner) match.winner = pl.id;
                match.state = "over";
            }
            targetLabel = pl.label;
        } else {
            // aim at the leader who is not me and has not finished or left
            const others = match.players.filter(function (x) { return x.id !== pl.id && !x.left && !x.done; })
                .sort(function (a, c) { return c.progress - a.progress; });
            if (!others.length) return send(res, 200, { ok: false, reason: "nobody to aim at", match: mpView(match, pl.id) });
            const target = others[0];
            const shielded = liveEffects(target).some(function (e) { return e.kind === "shield"; });
            if (shielded) {
                // A shield absorbs one hit and is used up doing it.
                target.effects = target.effects.filter(function (e) { return e.kind !== "shield"; });
                targetLabel = target.label + " (blocked!)";
            } else {
                target.effects.push({ kind: b.kind, until: Date.now() + ability.ms, from: pl.label });
                targetLabel = target.label;
            }
        }
        pl.energy -= ability.cost;
        return send(res, 200, { ok: true, used: b.kind, target: targetLabel, match: mpView(match, pl.id) });
    }

    // Leave the lobby or bail out of a race.
    if (p === "/api/mp/quit" && req.method === "POST") {
        const b = await readBody(req);
        const me = mpPeers[b.deviceId];
        const match = (b.matchId && matches[b.matchId]) || (me && me.matchId && matches[me.matchId]);
        if (match) {
            match.players.forEach(function (x) { if (x.id === b.deviceId) x.left = true; });
            const live = match.players.filter(function (x) { return !x.left; });
            if (live.length < 2) match.state = "over";
        }
        if (me) { me.matchId = null; if (b.leaveLobby) delete mpPeers[me.id]; }
        return send(res, 200, { ok: true });
    }

    // ---- playable games app (served from the shared www/ bundle) ----
    if (p === "/play") {
        res.writeHead(302, { "Location": "/play/" });
        return res.end();
    }
    if (p === "/play/" || p.indexOf("/play/") === 0) {
        const rel = p === "/play/" ? "/index.html" : p.slice("/play".length);
        const gp = path.join(GAMES_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
        if (gp.startsWith(GAMES_DIR) && fs.existsSync(gp) && fs.statSync(gp).isFile()) {
            return send(res, 200, fs.readFileSync(gp), MIME[path.extname(gp)] || "application/octet-stream");
        }
        return send(res, 404, { error: "not found" });
    }

    // ---- static dashboard ----
    let file = p === "/" ? "/index.html" : p;
    const fp = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    if (fp.startsWith(PUBLIC) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || "application/octet-stream");
    }
    return send(res, 404, { error: "not found" });
});

server.listen(PORT, function () { console.log("Brain Arcade control server on :" + PORT); });
