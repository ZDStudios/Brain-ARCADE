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
        devices[b.deviceId] = { id: b.deviceId, name: b.name || "Tablet", app: b.app || "", lastSeen: Date.now(), battery: bat, games: games };
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
            stream: !!cmd.stream,
            input: taps,
            scoresBackup: scores[b.deviceId] || null
        });
    }

    if (p === "/api/devices" && req.method === "GET") {
        const now = Date.now();
        const list = Object.keys(devices).map(function (id) {
            const d = devices[id];
            const cmd = commands[id] || {};
            const fr = frames[id];
            return {
                id: d.id, name: d.name, app: d.app, battery: d.battery,
                games: d.games || null,
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

    // Dashboard queues a remote tap (normalized 0..1 coordinates).
    if (p === "/api/input" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        var q = inputs[b.deviceId] || (inputs[b.deviceId] = []);
        if (typeof b.x === "number" && typeof b.y === "number") q.push({ x: b.x, y: b.y });
        if (q.length > 20) q.splice(0, q.length - 20);
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
