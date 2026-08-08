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
const MP_QUESTIONS = 10;
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
    return { id: peer.id, label: mpLabel(peer), platform: peer.platform || "", progress: 0, wrong: 0, done: false, ms: 0, left: false };
}
function mpCreate(peers) {
    const id = "mtc_" + (++seq);
    const m = {
        id: id, state: "countdown", createdAt: Date.now(),
        startAt: Date.now() + 4000,          // shared countdown, so nobody starts early
        total: MP_QUESTIONS, questions: mpQuestions(MP_QUESTIONS),
        players: peers.map(mpPlayer), winner: null
    };
    matches[id] = m;
    return m;
}
/** Both racers must get identical questions, so the server makes them. */
function mpQuestions(n) {
    const out = [];
    const ri = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
    for (let i = 0; i < n; i++) {
        const kind = i % 4, hard = i >= n / 2;
        let text, answer;
        if (kind === 0) { const a = ri(hard ? 12 : 3, hard ? 49 : 19), b = ri(hard ? 12 : 2, hard ? 49 : 9); text = a + " + " + b; answer = a + b; }
        else if (kind === 1) { const a = ri(hard ? 25 : 8, hard ? 80 : 20), b = ri(2, hard ? 24 : 7); text = a + " − " + b; answer = a - b; }
        else if (kind === 2) { const a = ri(2, hard ? 12 : 6), b = ri(2, hard ? 12 : 6); text = a + " × " + b; answer = a * b; }
        else { const b = ri(2, hard ? 12 : 6), q = ri(2, hard ? 11 : 6); text = (b * q) + " ÷ " + b; answer = q; }
        const choices = [answer];
        while (choices.length < 4) {
            const off = ri(1, Math.max(3, Math.round(Math.abs(answer) * 0.35) + 3)) * (Math.random() < 0.5 ? -1 : 1);
            const cand = answer + off;
            if (cand >= 0 && choices.indexOf(cand) < 0) choices.push(cand);
        }
        for (let j = choices.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); const t = choices[j]; choices[j] = choices[k]; choices[k] = t; }
        out.push({ text: text, answer: answer, choices: choices });
    }
    return out;
}
/** Client-safe view (the answers are needed to score locally, so they go too). */
function mpView(m) {
    // "countdown" becomes "running" purely by the clock — both sides share startAt,
    // so nobody needs a message to tell them the race began.
    const state = (m.state === "countdown" && Date.now() >= m.startAt) ? "running" : m.state;
    return {
        id: m.id, state: state, startAt: m.startAt, total: m.total,
        questions: m.questions, winner: m.winner,
        players: m.players.map(function (p) {
            return { id: p.id, label: p.label, platform: p.platform, progress: p.progress, wrong: p.wrong || 0, done: !!p.done, ms: p.ms || 0, left: !!p.left };
        })
    };
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
            battery: bat, games: games, canStream: !!b.canStream,
            canKiosk: !!b.canKiosk, kiosk: !!b.kiosk, tv: !!b.tv,
            stats: (b.stats && typeof b.stats === "object") ? b.stats : (prev.stats || null),
            summary: (b.summary && typeof b.summary === "object") ? b.summary : (prev.summary || null)
        };
        const pol = policies[b.deviceId] || defaultPolicy();
        const cmd = commands[b.deviceId] || (commands[b.deviceId] = {});

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
            match: match ? mpView(match) : null
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
        return send(res, 200, { ok: true, match: mpView(match) });
    }

    // One answer submitted. The server counts progress so nobody can disagree
    // about who got there first.
    if (p === "/api/mp/answer" && req.method === "POST") {
        const b = await readBody(req);
        const match = matches[b.matchId];
        if (!match) return send(res, 404, { error: "unknown match" });
        const pl = match.players.filter(function (x) { return x.id === b.deviceId; })[0];
        if (!pl) return send(res, 404, { error: "not in this match" });
        // Nothing counts before "Go" — otherwise an early tap banks progress during
        // the countdown and the finish time comes out negative.
        if (Date.now() < match.startAt) return send(res, 200, { ok: false, early: true, match: mpView(match) });
        if (!pl.done) {
            if (b.correct) pl.progress = Math.min(match.total, pl.progress + 1);
            else pl.wrong = (pl.wrong || 0) + 1;
            if (pl.progress >= match.total) {
                pl.done = true;
                pl.ms = Math.max(1, Date.now() - match.startAt);
                if (!match.winner) match.winner = pl.id;
            }
        }
        const live = match.players.filter(function (x) { return !x.left; });
        if (live.length && live.every(function (x) { return x.done; })) match.state = "over";
        else if (match.winner) match.state = "over";   // a race ends when it is won
        return send(res, 200, { ok: true, match: mpView(match) });
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
