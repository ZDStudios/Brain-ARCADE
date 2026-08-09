/* Brain Race 3D — the multiplayer game.
   Only appears when the tablet is on WiFi AND talking to the control server: it is
   the one game that cannot work offline, so the card is hidden rather than broken
   (see requiresServer in app.js).

   Two or three devices race down a 3D track. You do not steer — you MOVE by
   completing tasks, and none of them are sums: odd-one-out, mental rotation (which
   piece is the same, just turned), Stroop (tap the ink, not the word), what-comes-
   next, and pattern recall. Every correct answer charges a boost meter you spend on
   special abilities: turbo, freeze the leader, scramble their tiles, or shield
   yourself.

   The track is drawn with the same hand-rolled 3D as Cube Recall: project world
   points through a camera sitting just behind your own racer, then paint back to
   front. No WebGL, no libraries. The server owns the answer key, the progress and
   the energy — this file only ever says "I picked tile 2". */
(function () {
    var SEG = 6;                 // world units per task completed
    var LANE = 2.6;              // spacing between lanes
    var COLOR_HEX = {
        red: "#F87171", blue: "#60A5FA", green: "#34D399",
        yellow: "#FBBF24", purple: "#A78BFA", orange: "#FB923C"
    };
    var SHIP_HUES = ["#22D3EE", "#F472B6", "#FBBF24"];

    /* ---------- little SVG helpers for the task tiles ---------- */
    function shapeSvg(shape, color, size) {
        var fill = COLOR_HEX[color] || "#A78BFA";
        var body;
        if (shape === "circle") body = '<circle cx="50" cy="50" r="38"/>';
        else if (shape === "square") body = '<rect x="13" y="13" width="74" height="74" rx="10"/>';
        else if (shape === "triangle") body = '<polygon points="50,9 91,87 9,87"/>';
        else if (shape === "diamond") body = '<polygon points="50,6 94,50 50,94 6,50"/>';
        else if (shape === "hexagon") body = '<polygon points="50,7 88,28 88,72 50,93 12,72 12,28"/>';
        else body = '<polygon points="50,5 61,38 96,38 68,59 78,93 50,72 22,93 32,59 4,38 39,38"/>';
        return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="' + fill + '">' + body + '</svg>';
    }
    function gridSvg(cells, n, size, color) {
        var s = size / n, out = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">';
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
            var on = cells.some(function (c) { return c[0] === x && c[1] === y; });
            out += '<rect x="' + (x * s + 1.5) + '" y="' + (y * s + 1.5) + '" width="' + (s - 3) + '" height="' + (s - 3) +
                   '" rx="3" fill="' + (on ? (color || "#7C5CFF") : "rgba(255,255,255,.10)") + '"/>';
        }
        return out + '</svg>';
    }

    window.BrainGames.register({
        id: "race", name: "Brain Race 3D", icon: "&#127950;",
        gradient: "linear-gradient(135deg,#F43F5E,#7C5CFF)",
        best: "low", bestLabel: "Best time", bestSuffix: "s",
        requiresServer: true,
        difficulties: false,
        help: {
            emoji: "&#127950;", goal: "Race another device down a 3D track. Solve tasks to move — no sums anywhere!",
            steps: [
                "Open Brain Arcade on a second device and tap Brain Race 3D there too.",
                "Pick that device from the list, they accept, and you count down together.",
                "Each task you solve fires your engine and moves you a length up the track.",
                "Correct answers charge your BOOST meter. Spend it: Turbo jumps you forward, Freeze stops the leader, Scramble shuffles their tiles, Shield blocks the next hit.",
                "First racer through the finish gate wins."
            ]
        },
        mount: function (host, api) {
            var base = (api.serverUrl || "").replace(/\/+$/, "");
            var me = api.deviceId;
            var stage = "lobby";              // lobby | race | over
            var match = null, task = null, peers = [], invites = [], sentTo = {}, netFails = 0;
            var locked = false, timer = null, rafId = null, dead = false;
            var flashUntil = 0, flashedFor = -1;   // pattern-recall peek
            var scrambleSeed = 0, lastScrambleAt = 0;
            var toastAbility = "", toastUntil = 0;

            var wrap = api.el("div");
            host.appendChild(wrap);

            /* ---------- networking: never throws, never spams ---------- */
            function post(path, body) {
                var ctrl = ("timeout" in AbortSignal) ? AbortSignal.timeout(7000) : undefined;
                return fetch(base + path, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body || {}), signal: ctrl
                }).then(function (r) { return r.json(); }).catch(function () { return null; });
            }
            function applyMatch(data) {
                if (!data) return;
                if (data.match) {
                    var prev = match && match.id;
                    match = data.match;
                    task = match.task || null;
                    if (prev !== match.id) { flashedFor = -1; locked = false; }
                }
            }

            function sync() {
                if (dead) return;
                post("/api/mp/sync", {
                    deviceId: me, name: api.deviceName || "", platform: api.platform || "",
                    matchId: match ? match.id : null
                }).then(function (data) {
                    if (dead) return;
                    if (!data) { netFails++; if (netFails === 3) renderOffline(); return; }
                    netFails = 0;
                    peers = data.peers || [];
                    invites = data.invites || [];
                    var prevId = match && match.id;
                    match = data.match || null;
                    task = match && match.task ? match.task : null;
                    if (match && (match.state === "countdown" || match.state === "running")) {
                        if (stage !== "race" || prevId !== match.id) { stage = "race"; renderRace(); }
                        else paintTask();
                    } else if (match && match.state === "over") {
                        if (stage !== "over") { stage = "over"; renderResult(); }
                    } else if (stage !== "lobby") {
                        stage = "lobby"; renderLobby();
                    } else {
                        renderLobby();
                    }
                });
            }
            function startPolling(ms) { clearInterval(timer); timer = setInterval(sync, ms); }

            /* ================= LOBBY ================= */
            function renderLobby() {
                wrap.innerHTML = "";
                wrap.appendChild(api.el("div", { class: "mp-hero" }, [
                    api.el("div", { class: "mp-hero-ico", html: "&#127950;" }),
                    api.el("div", { class: "mp-title", text: "Brain Race 3D" }),
                    api.el("div", { class: "mp-sub", text: "Solve tasks to move. Spend boost on abilities. First to the gate wins." }),
                    api.el("div", { class: "mp-you", text: "You are “" + (api.deviceName || api.platform) + "”" })
                ]));

                invites.forEach(function (inv) {
                    wrap.appendChild(api.el("div", { class: "mp-invite" }, [
                        api.el("div", { class: "mp-invite-txt", html: "<b>" + esc(inv.fromLabel) + "</b> challenged you to a race!" }),
                        api.el("div", { class: "btn-row", style: "margin:0" }, [
                            api.el("button", { class: "btn", text: "No thanks", onclick: function () {
                                api.sound.click();
                                post("/api/mp/respond", { deviceId: me, inviteId: inv.id, accept: false }).then(sync);
                            } }),
                            api.el("button", { class: "btn primary", html: "&#127937; Race!", onclick: function () {
                                api.sound.good(); api.haptic(20);
                                post("/api/mp/respond", { deviceId: me, inviteId: inv.id, accept: true }).then(function (d) { applyMatch(d); sync(); });
                            } })
                        ])
                    ]));
                });

                wrap.appendChild(api.el("div", { class: "section-label", text: "Racers on your server" }));
                if (!peers.length) {
                    wrap.appendChild(api.el("div", { class: "mp-empty" }, [
                        api.el("div", { class: "mp-empty-ico", html: "&#128225;" }),
                        api.el("div", { class: "mp-empty-txt", text: "Nobody else is here yet" }),
                        api.el("div", { class: "small-note", style: "margin:6px 0 0",
                            text: "Open Brain Arcade on another device and tap Brain Race 3D there too — it shows up within a few seconds." })
                    ]));
                } else {
                    var list = api.el("div", { class: "mp-peers" });
                    peers.forEach(function (pr) {
                        list.appendChild(api.el("div", { class: "mp-peer" }, [
                            api.el("div", { class: "mp-peer-ico", html: iconFor(pr.platform) }),
                            api.el("div", { class: "mp-peer-main" }, [
                                api.el("div", { class: "mp-peer-name", text: pr.label }),
                                api.el("div", { class: "mp-peer-sub", text: pr.busy ? "in a race" : (pr.platform || "Brain Arcade") })
                            ]),
                            api.el("button", {
                                class: "btn " + (pr.busy ? "" : "primary"),
                                text: pr.busy ? "Busy" : (sentTo[pr.id] ? "Asked…" : "Challenge"),
                                onclick: function () {
                                    if (pr.busy) { api.toast("That device is already racing"); return; }
                                    api.sound.click(); api.haptic(12);
                                    sentTo[pr.id] = true; renderLobby();
                                    post("/api/mp/invite", { deviceId: me, to: pr.id }).then(function (r) {
                                        if (!r || r.error) { sentTo[pr.id] = false; api.toast("Could not send the challenge"); renderLobby(); }
                                        else api.toast("Challenge sent to " + pr.label);
                                    });
                                }
                            })
                        ]));
                    });
                    wrap.appendChild(list);
                    wrap.appendChild(api.el("div", { class: "small-note", text: "Challenge two devices and all three race together." }));
                }
            }
            function iconFor(platform) {
                var p = (platform || "").toLowerCase();
                if (p.indexOf("tv") > -1) return "&#128250;";
                if (p.indexOf("iphone") > -1 || p.indexOf("phone") > -1) return "&#128241;";
                if (p.indexOf("ipad") > -1 || p.indexOf("tablet") > -1) return "&#128242;";
                if (p.indexOf("pc") > -1 || p.indexOf("mac") > -1 || p.indexOf("chromebook") > -1) return "&#128187;";
                return "&#127918;";
            }
            function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

            /* ================= RACE ================= */
            var canvas = null, ctx = null, W = 0, H = 0;
            var abilityBar = null, taskBox = null, statusEl = null, energyFill = null, energyTxt = null;
            var camZ = -3, camX = 0, shipZ = {}, focusRow = 0, focusCol = 0;

            var ABILITIES = [
                { kind: "turbo",    emoji: "&#9889;",  name: "Turbo",    cost: 3, blurb: "Jump 2 lengths" },
                { kind: "freeze",   emoji: "&#129482;", name: "Freeze",  cost: 4, blurb: "Leader frozen 3s" },
                { kind: "scramble", emoji: "&#127744;", name: "Scramble", cost: 2, blurb: "Shuffle their tiles" },
                { kind: "shield",   emoji: "&#128737;&#65039;", name: "Shield", cost: 3, blurb: "Block the next hit" }
            ];

            function renderRace() {
                wrap.innerHTML = "";
                startPolling(1100);

                var sp = api.space();
                W = Math.max(280, Math.round(sp.w));
                H = Math.round(Math.min(Math.max(220, sp.h * 0.58), W * 0.78));
                canvas = api.el("canvas", { width: W, height: H, class: "mp-canvas" });
                wrap.appendChild(api.el("div", { class: "mp-view" }, canvas));
                ctx = canvas.getContext("2d");

                statusEl = api.el("div", { class: "mp-status", text: "Get ready…" });
                wrap.appendChild(statusEl);

                // boost meter
                energyFill = api.el("i", { class: "mp-energy-fill" });
                energyTxt = api.el("span", { class: "mp-energy-txt", text: "0" });
                wrap.appendChild(api.el("div", { class: "mp-energy" }, [
                    api.el("span", { class: "mp-energy-k", html: "&#9889; BOOST" }),
                    api.el("span", { class: "mp-energy-bar" }, [energyFill]),
                    energyTxt
                ]));

                abilityBar = api.el("div", { class: "mp-abilities" });
                ABILITIES.forEach(function (ab, i) {
                    var b = api.el("button", { class: "mp-ability", "data-i": String(i) }, [
                        api.el("span", { class: "ab-ico", html: ab.emoji }),
                        api.el("span", { class: "ab-name", text: ab.name }),
                        api.el("span", { class: "ab-cost", html: "&#9889;" + ab.cost })
                    ]);
                    b.addEventListener("click", function () { useAbility(ab); });
                    abilityBar.appendChild(b);
                });
                wrap.appendChild(abilityBar);

                taskBox = api.el("div", { class: "mp-task" });
                wrap.appendChild(taskBox);

                wrap.appendChild(api.el("div", { class: "btn-row" }, [
                    api.el("button", { class: "btn", text: "Quit race", onclick: function () {
                        api.sound.click();
                        post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null }).then(function () { api.exit(); });
                    } })
                ]));

                camZ = -3; shipZ = {};
                if (!rafId) rafId = requestAnimationFrame(frame);
                paintTask();
            }

            function myPlayer() {
                if (!match) return null;
                var m = match.players.filter(function (p) { return p.id === me; });
                return m.length ? m[0] : null;
            }
            function hasEffect(p, kind) {
                return !!(p && (p.effects || []).some(function (e) { return e.kind === kind && e.until > Date.now(); }));
            }
            function total() { return (match && match.total) || 12; }

            /* ---------- 3D track ---------- */
            function project(x, y, z) {
                // Camera sits behind, above and in MY lane, looking down +z. Tracking
                // camX matters: without it your own ship drifts to the edge of the
                // frame (and off it entirely in a three-way race).
                var dz = z - camZ;
                if (dz < 0.35) dz = 0.35;
                var f = (W * 0.82) / dz;
                return { x: W / 2 + (x - camX) * f, y: H * 0.56 - (y - 1.7) * f, f: f, dz: dz };
            }
            function laneX(i, n) { return (i - (n - 1) / 2) * LANE; }

            function frame() {
                rafId = requestAnimationFrame(frame);
                if (!ctx || !match) return;
                var players = match.players, n = players.length;
                // ease each ship toward its true position so progress reads as motion
                players.forEach(function (p) {
                    var target = p.progress * SEG;
                    if (shipZ[p.id] == null) shipZ[p.id] = target;
                    shipZ[p.id] += (target - shipZ[p.id]) * 0.10;
                });
                var mineZ = shipZ[me] == null ? 0 : shipZ[me];
                camZ += ((mineZ - 6.6) - camZ) * 0.12;
                var myIdx = players.map(function (q) { return q.id; }).indexOf(me);
                if (myIdx >= 0) camX += (laneX(myIdx, n) - camX) * 0.10;
                draw(players, n);
            }

            function draw(players, n) {
                var finishZ = total() * SEG;

                // ---- sky ----
                var sky = ctx.createLinearGradient(0, 0, 0, H);
                sky.addColorStop(0, "#0A0E22");
                sky.addColorStop(0.55, "#1B1E4A");
                sky.addColorStop(1, "#2A1B4E");
                ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
                // a couple of distant moons for depth
                ctx.fillStyle = "rgba(124,92,255,.20)"; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.20, H * 0.14, 0, 6.3); ctx.fill();
                ctx.fillStyle = "rgba(34,211,238,.14)"; ctx.beginPath(); ctx.arc(W * 0.22, H * 0.14, H * 0.08, 0, 6.3); ctx.fill();

                // ---- track surface, painted far to near ----
                var half = (n * LANE) / 2 + 0.9;
                var zStart = Math.max(0, Math.floor(camZ));
                var zEnd = Math.min(finishZ + SEG * 2, camZ + 90);
                var step = 1.5;
                for (var z = zEnd; z > zStart; z -= step) {
                    var a = project(-half, 0, z), b2 = project(half, 0, z);
                    var c = project(half, 0, z - step), d = project(-half, 0, z - step);
                    var band = Math.floor(z / SEG) % 2 === 0;
                    var fog = Math.max(0, Math.min(1, 1 - (z - camZ) / 70));
                    ctx.fillStyle = band ? "rgba(38,46,88," + (0.35 + 0.6 * fog) + ")"
                                        : "rgba(28,34,68," + (0.35 + 0.6 * fog) + ")";
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
                    ctx.closePath(); ctx.fill();
                }
                // lane dividers + glowing edges
                for (var li = 0; li <= n; li++) {
                    var lx = laneX(li, n + 1) + (LANE / 2) * 0;
                    var x0 = laneX(0, n) - LANE / 2 + li * LANE;
                    var p1 = project(x0, 0.01, Math.max(camZ + 0.6, 0));
                    var p2 = project(x0, 0.01, zEnd);
                    ctx.strokeStyle = (li === 0 || li === n) ? "rgba(124,92,255,.85)" : "rgba(255,255,255,.16)";
                    ctx.lineWidth = (li === 0 || li === n) ? 3 : 2;
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                }
                // distance markers on both sides — this is what makes speed readable
                for (var mz = Math.ceil(Math.max(camZ, 0) / SEG) * SEG; mz < zEnd; mz += SEG) {
                    [-1, 1].forEach(function (side) {
                        var b0 = project(side * (half + 0.35), 0, mz);
                        var b1 = project(side * (half + 0.35), 1.1, mz);
                        ctx.strokeStyle = "rgba(34,211,238,.55)"; ctx.lineWidth = Math.max(1.5, 6 / b0.dz * 2);
                        ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
                    });
                }

                // ---- finish gate ----
                if (finishZ < camZ + 90) {
                    var gl = project(-half, 0, finishZ), gr = project(half, 0, finishZ);
                    var tl = project(-half, 3.2, finishZ), tr = project(half, 3.2, finishZ);
                    var sq = 8, wq = (gr.x - gl.x) / sq;
                    for (var q = 0; q < sq; q++) {
                        ctx.fillStyle = q % 2 ? "#F8FAFC" : "#111827";
                        ctx.fillRect(gl.x + q * wq, tl.y, wq + 1, Math.max(3, (gl.y - tl.y) * 0.14));
                    }
                    ctx.strokeStyle = "rgba(248,250,252,.75)"; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(gl.x, gl.y); ctx.lineTo(tl.x, tl.y); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(gr.x, gr.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
                }

                // ---- racers, far to near ----
                var order = players.map(function (p, i) { return { p: p, i: i }; })
                    .sort(function (a, b) { return (shipZ[b.p.id] || 0) - (shipZ[a.p.id] || 0); });
                order.forEach(function (o) {
                    drawShip(o.p, laneX(o.i, players.length), shipZ[o.p.id] || 0, o.p.id === me);
                });

                // ---- anyone behind me is off-camera, so flag them at the bottom ----
                var myZ = shipZ[me] == null ? 0 : shipZ[me];
                var behind = players.filter(function (p) { return p.id !== me && (shipZ[p.id] || 0) < camZ + 0.5; });
                if (behind.length) {
                    ctx.textAlign = "center";
                    behind.forEach(function (p, bi) {
                        var gap = Math.max(0, Math.round((myZ - (shipZ[p.id] || 0)) / SEG));
                        var txt = "\u25BC " + p.label + "  -" + gap;
                        ctx.font = "800 12px sans-serif";
                        var tw = ctx.measureText(txt).width;
                        var bx = W / 2, by = H - 8 - bi * 20;
                        ctx.fillStyle = "rgba(9,12,26,.72)";
                        ctx.fillRect(bx - tw / 2 - 7, by - 14, tw + 14, 18);
                        ctx.fillStyle = "#9CA3AF";
                        ctx.fillText(txt, bx, by);
                    });
                }

                // ---- my own status overlays ----
                var mine = myPlayer();
                if (hasEffect(mine, "freeze")) {
                    ctx.fillStyle = "rgba(96,165,250,.30)"; ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#DBEAFE"; ctx.font = "700 " + Math.round(H * 0.09) + "px sans-serif";
                    ctx.textAlign = "center"; ctx.fillText("FROZEN!", W / 2, H * 0.5);
                }
                if (hasEffect(mine, "shield")) {
                    ctx.strokeStyle = "rgba(52,211,153,.8)"; ctx.lineWidth = 4;
                    ctx.strokeRect(3, 3, W - 6, H - 6);
                }
                if (toastUntil > Date.now() && toastAbility) {
                    ctx.fillStyle = "rgba(0,0,0,.55)";
                    ctx.fillRect(0, H * 0.06, W, H * 0.12);
                    ctx.fillStyle = "#FDE68A"; ctx.font = "800 " + Math.round(H * 0.062) + "px sans-serif";
                    ctx.textAlign = "center"; ctx.fillText(toastAbility, W / 2, H * 0.145);
                }
            }

            function drawShip(p, x, z, isMe) {
                var nose = project(x, 0.34, z + 0.70);
                var back = project(x, 0.26, z - 0.34);
                var lw = project(x - 0.52, 0.14, z - 0.24);
                var rw = project(x + 0.52, 0.14, z - 0.24);
                var hue = SHIP_HUES[Math.max(0, match.players.map(function (q) { return q.id; }).indexOf(p.id)) % SHIP_HUES.length];

                // shadow on the track
                var sh = project(x, 0.01, z);
                ctx.fillStyle = "rgba(0,0,0,.35)";
                ctx.beginPath(); ctx.ellipse(sh.x, sh.y, Math.max(3, 0.52 * sh.f), Math.max(2, 0.16 * sh.f), 0, 0, 6.3); ctx.fill();

                // engine glow behind
                var glowR = Math.max(5, 0.34 * back.f);
                var g = ctx.createRadialGradient(back.x, back.y, 1, back.x, back.y, glowR);
                g.addColorStop(0, p.combo >= 3 ? "rgba(253,224,71,.95)" : "rgba(255,255,255,.7)");
                g.addColorStop(1, "rgba(255,255,255,0)");
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(back.x, back.y, glowR, 0, 6.3); ctx.fill();

                // wings + body
                ctx.fillStyle = hue;
                ctx.beginPath();
                ctx.moveTo(nose.x, nose.y); ctx.lineTo(rw.x, rw.y); ctx.lineTo(back.x, back.y); ctx.lineTo(lw.x, lw.y);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5; ctx.stroke();
                // canopy
                var cp = project(x, 0.46, z + 0.16);
                ctx.fillStyle = "rgba(255,255,255,.8)";
                ctx.beginPath(); ctx.ellipse(cp.x, cp.y, Math.max(2, 0.13 * cp.f), Math.max(1.5, 0.08 * cp.f), 0, 0, 6.3); ctx.fill();
                // a fin, so the craft reads as 3D rather than as a flat arrow
                var fin = project(x, 0.62, z - 0.30);
                ctx.fillStyle = "rgba(255,255,255,.35)";
                ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(fin.x, fin.y); ctx.lineTo(cp.x, cp.y); ctx.closePath(); ctx.fill();

                if (hasEffect(p, "shield")) {
                    ctx.strokeStyle = "rgba(52,211,153,.85)"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(cp.x, cp.y, Math.max(8, 0.55 * cp.f), 0, 6.3); ctx.stroke();
                }
                if (hasEffect(p, "freeze")) {
                    ctx.fillStyle = "rgba(147,197,253,.55)";
                    ctx.beginPath(); ctx.arc(cp.x, cp.y, Math.max(7, 0.5 * cp.f), 0, 6.3); ctx.fill();
                }

                // Name tags are for the OTHER racers — a tag hanging over your own
                // craft just covers the track, and the HUD already says where you are.
                if (isMe) return;
                var tag = project(x, 1.15, z);
                var size = Math.max(10, Math.min(20, 0.30 * tag.f));
                ctx.font = "800 " + size + "px sans-serif";
                ctx.textAlign = "center";
                var label = p.label + "  " + p.progress + "/" + total();
                var tw = ctx.measureText(label).width;
                // Keep the tag on screen: a racer in an outside lane pushed it past the
                // edge and the name was cut in half.
                var tx = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, tag.x));
                ctx.fillStyle = "rgba(9,12,26,.78)";
                ctx.fillRect(tx - tw / 2 - 6, tag.y - size, tw + 12, size + 7);
                ctx.fillStyle = "#E5E7EB";
                ctx.fillText(label, tx, tag.y);
            }

            /* ---------- the task panel ---------- */
            function tileNode(t, idx) {
                var b = api.el("button", { class: "mp-tile", "data-i": String(idx) });
                var inner = api.el("span", { class: "mp-tile-in" });
                if (t.swatch) inner.appendChild(api.el("span", { class: "mp-swatch", style: "background:" + (COLOR_HEX[t.color] || "#888") }));
                else if (t.cells) inner.appendChild(api.el("span", { html: gridSvg(t.cells, 4, 88, "#22D3EE") }));
                else if (t.grid) inner.appendChild(api.el("span", { html: gridSvg(t.grid, 3, 88, "#A78BFA") }));
                else inner.appendChild(api.el("span", { html: shapeSvg(t.shape, t.color, 62) }));
                b.appendChild(inner);
                b.addEventListener("click", function () { answer(idx, b); });
                return b;
            }

            function paintTask() {
                if (!match || !taskBox) return;
                var mine = myPlayer();
                var waiting = Date.now() < match.startAt;
                var secs = Math.ceil((match.startAt - Date.now()) / 1000);

                // energy meter + abilities
                var energy = mine ? mine.energy : 0;
                if (energyFill) energyFill.style.width = Math.round((energy / 9) * 100) + "%";
                if (energyTxt) energyTxt.textContent = String(energy);
                if (abilityBar) {
                    abilityBar.querySelectorAll(".mp-ability").forEach(function (btn, i) {
                        var ab = ABILITIES[i];
                        var can = !waiting && energy >= ab.cost && !hasEffect(mine, "freeze");
                        btn.classList.toggle("ready", can);
                        btn.disabled = !can;
                        btn.classList.toggle("nav-here", focusRow === 0 && focusCol === i);
                    });
                }

                if (waiting) {
                    statusEl.textContent = secs > 0 ? "Starting in " + secs + "…" : "GO!";
                    taskBox.innerHTML = "";
                    taskBox.appendChild(api.el("div", { class: "mp-prompt", text: "Get ready to race!" }));
                    return;
                }
                if (mine && mine.done) {
                    statusEl.textContent = "Finished! Waiting for the others…";
                    taskBox.innerHTML = "";
                    taskBox.appendChild(api.el("div", { class: "mp-prompt", html: "&#127881; Through the gate!" }));
                    return;
                }
                if (hasEffect(mine, "freeze")) {
                    statusEl.textContent = "Frozen — hang on!";
                }
                if (!task) return;

                var idx = mine ? mine.progress : 0;
                // Pattern recall gets a peek at the answer pattern before the options.
                if (task.kind === "recall" && flashedFor !== idx) {
                    flashedFor = idx;
                    flashUntil = Date.now() + 1600;
                }
                var flashing = task.kind === "recall" && Date.now() < flashUntil;
                if (flashing) setTimeout(paintTask, 220);

                if (!hasEffect(mine, "freeze")) {
                    statusEl.textContent = "Task " + (idx + 1) + " of " + total() +
                        "  ·  🚀 " + (mine ? mine.progress : 0) + "/" + total() +
                        (mine && mine.combo >= 3 ? "  ·  🔥 " + mine.combo + " streak" : "");
                }

                // Scrambled tiles shuffle while the effect lasts.
                var scrambled = hasEffect(mine, "scramble");
                if (scrambled && Date.now() - lastScrambleAt > 700) { scrambleSeed++; lastScrambleAt = Date.now(); setTimeout(paintTask, 720); }

                var sig = task.kind + "|" + idx + "|" + (flashing ? "flash" : "opts") + "|" + (scrambled ? scrambleSeed : "s");
                if (taskBox.getAttribute("data-sig") === sig) return;
                taskBox.setAttribute("data-sig", sig);
                taskBox.innerHTML = "";
                taskBox.classList.toggle("scrambled", scrambled);

                if (flashing) {
                    taskBox.appendChild(api.el("div", { class: "mp-prompt", text: "Remember this pattern!" }));
                    taskBox.appendChild(api.el("div", { class: "mp-flash", html: gridSvg(task.flash.grid, 3, 150, "#FBBF24") }));
                    return;
                }

                taskBox.appendChild(api.el("div", { class: "mp-prompt", text: task.prompt }));

                if (task.kind === "rotate" && task.target) {
                    taskBox.appendChild(api.el("div", { class: "mp-target" }, [
                        api.el("span", { class: "mp-target-k", text: "this one:" }),
                        api.el("span", { html: gridSvg(task.target.cells, 4, 96, "#FBBF24") })
                    ]));
                }
                if (task.kind === "next" && task.seq) {
                    var row = api.el("div", { class: "mp-seq" });
                    task.seq.forEach(function (s) { row.appendChild(api.el("span", { html: shapeSvg(s.shape, s.color, 38) })); });
                    row.appendChild(api.el("span", { class: "mp-seq-q", text: "?" }));
                    taskBox.appendChild(row);
                }
                if (task.kind === "stroop") {
                    taskBox.appendChild(api.el("div", { class: "mp-word", style: "color:" + (COLOR_HEX[task.ink] || "#fff"), text: task.word }));
                }

                var order = [0, 1, 2, 3];
                if (scrambled) {
                    // deterministic per-seed shuffle so it jitters rather than flickers randomly
                    order = order.slice().sort(function (a, b) { return Math.sin((a + 1) * scrambleSeed * 12.9898) - Math.sin((b + 1) * scrambleSeed * 12.9898); });
                }
                var grid = api.el("div", { class: "mp-tiles" });
                order.forEach(function (i) { grid.appendChild(tileNode(task.tiles[i], i)); });
                taskBox.appendChild(grid);
                paintFocus();
            }

            function answer(i, btn) {
                if (locked || !match) return;
                var mine = myPlayer();
                if (hasEffect(mine, "freeze")) { api.toast("You are frozen!"); return; }
                locked = true;
                post("/api/mp/task", { deviceId: me, matchId: match.id, choice: i }).then(function (r) {
                    locked = false;
                    if (!r) return;
                    if (r.frozen) { api.toast("You are frozen!"); return; }
                    if (r.correct === true) {
                        if (btn) btn.classList.add("good");
                        api.sound.good(); api.haptic(12);
                    } else if (r.correct === false) {
                        if (btn) btn.classList.add("bad");
                        api.sound.bad(); api.haptic(30);
                        locked = true;
                        setTimeout(function () { locked = false; if (btn) btn.classList.remove("bad"); }, 700);
                    }
                    applyMatch(r);
                    if (match && match.state === "over" && stage !== "over") { stage = "over"; renderResult(); return; }
                    taskBox.removeAttribute("data-sig");
                    paintTask();
                });
            }

            function useAbility(ab) {
                if (!match) return;
                var mine = myPlayer();
                if (!mine || mine.energy < ab.cost) { api.toast("Not enough boost yet"); return; }
                if (hasEffect(mine, "freeze")) { api.toast("You are frozen!"); return; }
                api.sound.pop(); api.haptic(18);
                post("/api/mp/ability", { deviceId: me, matchId: match.id, kind: ab.kind }).then(function (r) {
                    if (!r) return;
                    if (r.ok) {
                        toastAbility = ab.name.toUpperCase() + (r.target && ab.kind !== "turbo" && ab.kind !== "shield" ? " → " + r.target : "!");
                        toastUntil = Date.now() + 1600;
                    } else if (r.reason) {
                        api.toast(r.reason);
                    }
                    applyMatch(r);
                    if (match && match.state === "over" && stage !== "over") { stage = "over"; renderResult(); return; }
                    taskBox.removeAttribute("data-sig");
                    paintTask();
                });
            }

            /* ---------- remote / keyboard: two rows of focus ---------- */
            function paintFocus() {
                if (!taskBox) return;
                taskBox.querySelectorAll(".mp-tile").forEach(function (t) {
                    t.classList.toggle("nav-here", focusRow === 1 && Number(t.getAttribute("data-i")) === focusCol);
                });
            }
            function onKey(ev) {
                var k = ev.key;
                if (k >= "1" && k <= "4") { var t = taskBox && taskBox.querySelector('.mp-tile[data-i="' + (Number(k) - 1) + '"]'); if (t) { t.click(); ev.preventDefault(); } return; }
                if (k === "ArrowUp" || k === "ArrowDown") { focusRow = focusRow === 0 ? 1 : 0; paintTask(); paintFocus(); ev.preventDefault(); return; }
                if (k === "ArrowLeft") { focusCol = (focusCol + 3) % 4; paintTask(); paintFocus(); ev.preventDefault(); return; }
                if (k === "ArrowRight") { focusCol = (focusCol + 1) % 4; paintTask(); paintFocus(); ev.preventDefault(); return; }
                if (k === "Enter" || k === " ") {
                    if (focusRow === 0) useAbility(ABILITIES[focusCol]);
                    else { var b = taskBox && taskBox.querySelector('.mp-tile[data-i="' + focusCol + '"]'); if (b) b.click(); }
                    ev.preventDefault();
                }
            }
            document.addEventListener("keydown", onKey);

            /* ================= RESULT ================= */
            function renderResult() {
                var order = (match.players || []).slice().sort(function (a, b) {
                    if (b.progress !== a.progress) return b.progress - a.progress;
                    return (a.ms || 1e9) - (b.ms || 1e9);
                });
                var mine = myPlayer();
                var iWon = match.winner === me;
                if (iWon) api.save("wins", (api.load("wins", 0) || 0) + 1);
                var isBest = false;
                if (mine && mine.done && mine.ms > 0) isBest = api.setBest(Math.round(mine.ms / 100) / 10);

                var lines = order.map(function (p, i) {
                    var medal = i === 0 ? "&#129351;" : i === 1 ? "&#129352;" : "&#129353;";
                    var who = p.id === me ? "You" : esc(p.label);
                    var t = p.done && p.ms ? " &middot; " + (Math.round(p.ms / 100) / 10) + "s" : "";
                    return medal + " " + who + " — " + p.progress + "/" + total() + t;
                }).join("<br>");

                api.overlay({
                    emoji: iWon ? "&#127942;" : "&#127937;",
                    title: iWon ? "You won the race!" : (mine && mine.done ? "Good race!" : "Race over"),
                    sub: lines + (isBest ? "<br><br><b>New best time!</b>" : "") +
                         "<br><span class=\"small-note\">Wins so far: " + (api.load("wins", 0) || 0) + "</span>",
                    buttons: [
                        { label: "Home", onClick: function () { api.exit(); } },
                        { label: "Back to lobby", primary: true, onClick: function () {
                            post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null }).then(function () {
                                match = null; task = null; stage = "lobby";
                                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                                startPolling(2000); renderLobby(); sync();
                            });
                        } }
                    ]
                });
            }

            function renderOffline() {
                wrap.innerHTML = "";
                wrap.appendChild(api.el("div", { class: "mp-empty" }, [
                    api.el("div", { class: "mp-empty-ico", html: "&#128246;" }),
                    api.el("div", { class: "mp-empty-txt", text: "Lost the server" }),
                    api.el("div", { class: "small-note", style: "margin:6px 0 0",
                        text: "Brain Race needs WiFi and the control server. Every other game still works offline." })
                ]));
                wrap.appendChild(api.el("div", { class: "btn-row" }, [
                    api.el("button", { class: "btn primary", text: "Back to games", onclick: function () { api.exit(); } })
                ]));
            }

            if (!base) { renderOffline(); return function () {}; }
            renderLobby(); sync(); startPolling(2000);

            return function cleanup() {
                dead = true;
                clearInterval(timer);
                if (rafId) cancelAnimationFrame(rafId);
                document.removeEventListener("keydown", onKey);
                post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null, leaveLobby: true });
            };
        }
    });
})();
