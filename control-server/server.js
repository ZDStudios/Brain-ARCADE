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

const devices = Object.create(null);  // id -> { id, name, app, lastSeen, battery }
const policies = Object.create(null); // id -> { locked, allowedGames }
const commands = Object.create(null); // id -> { appUpdateAt }

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
        devices[b.deviceId] = { id: b.deviceId, name: b.name || "Tablet", app: b.app || "", lastSeen: Date.now(), battery: bat };
        const pol = policies[b.deviceId] || defaultPolicy();
        const cmd = commands[b.deviceId] || {};
        return send(res, 200, { locked: !!pol.locked, allowedGames: pol.allowedGames, appUpdate: cmd.appUpdateAt || null });
    }

    if (p === "/api/devices" && req.method === "GET") {
        const now = Date.now();
        const list = Object.keys(devices).map(function (id) {
            const d = devices[id];
            return {
                id: d.id, name: d.name, app: d.app, battery: d.battery,
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
        if (b.action === "update") { commands[b.deviceId] = { appUpdateAt: Date.now() }; }
        return send(res, 200, { ok: true });
    }

    if (p === "/api/device/remove" && req.method === "POST") {
        if (ADMIN_TOKEN && req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "unauthorized" });
        const b = await readBody(req);
        if (!b.deviceId) return send(res, 400, { error: "deviceId required" });
        delete devices[b.deviceId]; delete policies[b.deviceId]; delete commands[b.deviceId];
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
