/* Cube Recall 3D — spatial memory in three dimensions.
   A lattice of cubes floats in space and keeps turning. Some of them light up in
   order; you have to tap them back in the same order — but the whole thing has
   rotated since, so remembering "second from the left" is not enough. That is the
   twist: it trains spatial working memory (the block-tapping test) in 3D.

   The 3D is hand-rolled on a 2D canvas: rotate points, project them with a focal
   length, then paint the cube faces back-to-front. No libraries, no WebGL, so it
   behaves the same in the app's WebView, on a TV and offline. */
(function () {
    window.BrainGames.register({
        id: "cube3d", name: "Cube Recall 3D", icon: "&#129513;",
        gradient: "linear-gradient(135deg,#6366F1,#06B6D4)",
        best: "high", bestLabel: "Longest",
        difficulties: true,
        help: {
            emoji: "&#129513;", goal: "Remember which cubes light up — in 3D, while everything spins.",
            steps: [
                "Watch: some cubes flash one after another.",
                "The lattice keeps turning, so follow the cubes, not the screen positions.",
                "Then tap the same cubes in the same order.",
                "Drag anywhere to spin the view yourself. Get it right and the sequence gets longer!"
            ]
        },
        mount: function (host, api) {
            var sp = api.space();
            var W = Math.round(Math.min(sp.board, 460));
            var H = W;

            var SET = {
                easy:   { n: 2, spin: 0.22, start: 2, wobble: 0.10 },
                medium: { n: 3, spin: 0.34, start: 2, wobble: 0.16 },
                hard:   { n: 3, spin: 0.52, start: 3, wobble: 0.30 }
            };
            var cfg = SET[api.difficulty] || SET.medium;

            var GAP = 1.0, SIZE = 0.46;          // spacing vs cube half-size: gaps let you see inside
            // Chosen so the whole lattice fits the frame at any rotation: the far
            // corner sits at radius sqrt(3)*(GAP+SIZE), and FOCAL*r/(CAM-r) < W/2.
            var FOCAL = W * 1.15, CAM = 6.6;
            var yaw = 0.6, pitch = 0.42, spin = cfg.spin, wobbleT = 0;
            var cubes = [], seq = [], step = 0, round = 0, bestLen = 0, best = api.getBest() || 0;
            var phase = "idle";                  // idle | show | recall | over
            var raf = null, lastT = 0, focusIdx = -1;

            /* ---------- lattice ---------- */
            (function build() {
                var n = cfg.n, off = (n - 1) / 2;
                for (var x = 0; x < n; x++) for (var y = 0; y < n; y++) for (var z = 0; z < n; z++) {
                    var f = n === 1 ? 0 : 1;
                    cubes.push({
                        x: (x - off) * GAP, y: (y - off) * GAP, z: (z - off) * GAP,
                        lit: 0,          // 1 = flashing, fades back down
                        good: 0, bad: 0, // feedback pulses
                        tint: [
                            96 + Math.round(70 * (x / Math.max(f, n - 1))),
                            104 + Math.round(60 * (y / Math.max(f, n - 1))),
                            176 + Math.round(60 * (z / Math.max(f, n - 1)))
                        ]
                    });
                }
            })();

            /* ---------- chrome ---------- */
            var sRound = stat("Round", "1"), sSeq = stat("Sequence", String(cfg.start)), sBest = stat("Longest", String(best));
            host.appendChild(api.el("div", { class: "game-topline" }, [sRound.box, sSeq.box, sBest.box]));

            var canvas = api.el("canvas", { width: W, height: H, style: "border-radius:16px;touch-action:none;cursor:pointer" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "width:auto" }, canvas));
            var msg = api.el("div", { class: "small-note", text: "Watch the cubes light up…" });
            host.appendChild(msg);
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", text: "Restart", onclick: function () { api.sound.click(); reset(); } })
            ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            /* ---------- 3D maths ---------- */
            function view(p) {
                var cy = Math.cos(yaw), sy = Math.sin(yaw);
                var x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy;
                var cp = Math.cos(pitch), sp2 = Math.sin(pitch);
                return { x: x, y: p.y * cp - z * sp2, z: p.y * sp2 + z * cp };
            }
            function project(v) {
                var d = CAM - v.z;
                if (d < 0.4) d = 0.4;
                var f = FOCAL / d;
                return { x: W / 2 + v.x * f, y: H / 2 + v.y * f, f: f, d: d };
            }
            // Cube corners and the four corner indices of each face.
            var CORNERS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
            var FACES = [
                { i: [0,1,2,3], shade: 0.74 }, { i: [5,4,7,6], shade: 0.52 },
                { i: [4,0,3,7], shade: 0.62 }, { i: [1,5,6,2], shade: 0.90 },
                { i: [4,5,1,0], shade: 1.15 }, { i: [3,2,6,7], shade: 0.46 }
            ];

            function cubeColor(c) {
                if (c.bad > 0) return [248, 113, 113];
                if (c.good > 0) return [52, 211, 153];
                if (c.lit > 0) {
                    var t = c.lit;
                    return [130 + 125 * t, 100 + 155 * t, 255];
                }
                // A gentle tint per lattice position: neighbours are told apart by
                // colour as well as position, which is what makes 27 cubes readable.
                return c.tint;
            }

            function draw() {
                ctx.clearRect(0, 0, W, H);
                var g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#0a0f22"); g.addColorStop(1, "#151d3b");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

                // Every face of every cube, painted back to front.
                var quads = [];
                for (var i = 0; i < cubes.length; i++) {
                    var c = cubes[i];
                    var pts = [], j;
                    for (j = 0; j < 8; j++) {
                        pts.push(project(view({
                            x: c.x + CORNERS[j][0] * SIZE,
                            y: c.y + CORNERS[j][1] * SIZE,
                            z: c.z + CORNERS[j][2] * SIZE
                        })));
                    }
                    var col = cubeColor(c);
                    for (j = 0; j < FACES.length; j++) {
                        var f = FACES[j], q = [pts[f.i[0]], pts[f.i[1]], pts[f.i[2]], pts[f.i[3]]];
                        // Back-face cull by winding: skip faces pointing away from us.
                        var area = (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[2].x - q[0].x) * (q[1].y - q[0].y);
                        if (area <= 0) continue;
                        quads.push({ q: q, shade: f.shade, col: col, d: (q[0].d + q[1].d + q[2].d + q[3].d) / 4, idx: i });
                    }
                }
                quads.sort(function (a, b) { return b.d - a.d; });
                for (var k = 0; k < quads.length; k++) {
                    var Q = quads[k];
                    // Far cubes are dimmer — cheap depth cue that sells the 3D.
                    var fog = Math.max(0.35, Math.min(1, 1.25 - (Q.d - (CAM - 2)) * 0.22));
                    var sh = Q.shade * fog;
                    ctx.beginPath();
                    ctx.moveTo(Q.q[0].x, Q.q[0].y);
                    for (var v = 1; v < 4; v++) ctx.lineTo(Q.q[v].x, Q.q[v].y);
                    ctx.closePath();
                    ctx.fillStyle = "rgb(" + Math.round(Q.col[0] * sh) + "," + Math.round(Q.col[1] * sh) + "," + Math.round(Q.col[2] * sh) + ")";
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255," + (0.10 * fog).toFixed(3) + ")";
                    ctx.lineWidth = 1; ctx.stroke();
                }
                // Selection ring for remote / keyboard play.
                if (focusIdx >= 0 && focusIdx < cubes.length) {
                    var pc = project(view(cubes[focusIdx]));
                    ctx.beginPath();
                    ctx.arc(pc.x, pc.y, Math.max(10, SIZE * pc.f * 1.25), 0, Math.PI * 2);
                    ctx.strokeStyle = "#FBBF24"; ctx.lineWidth = 3; ctx.stroke();
                }
            }

            function loop(t) {
                raf = requestAnimationFrame(loop);
                var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
                lastT = t;
                if (!dragging) {
                    yaw += spin * dt;
                    wobbleT += dt;
                    pitch = 0.42 + Math.sin(wobbleT * 0.6) * cfg.wobble;
                }
                for (var i = 0; i < cubes.length; i++) {
                    var c = cubes[i];
                    if (c.lit > 0) c.lit = Math.max(0, c.lit - dt * 2.2);
                    if (c.good > 0) c.good = Math.max(0, c.good - dt * 2.6);
                    if (c.bad > 0) c.bad = Math.max(0, c.bad - dt * 1.4);
                }
                draw();
            }

            /* ---------- rounds ---------- */
            function reset() {
                round = 0; bestLen = 0; phase = "idle"; focusIdx = -1;
                cubes.forEach(function (c) { c.lit = c.good = c.bad = 0; });
                nextRound();
            }
            function seqLen() { return cfg.start + round - 1; }
            function nextRound() {
                round++;
                sRound.val.textContent = String(round);
                sSeq.val.textContent = String(seqLen());
                var pool = cubes.map(function (_, i) { return i; });
                seq = [];
                for (var i = 0; i < seqLen() && pool.length; i++) {
                    seq.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
                }
                playSequence();
            }
            var showTimers = [];
            function clearTimers() { showTimers.forEach(clearTimeout); showTimers = []; }
            function playSequence() {
                clearTimers();
                phase = "show"; step = 0;
                msg.textContent = "Watch… " + seq.length + " cube" + (seq.length === 1 ? "" : "s");
                seq.forEach(function (idx, i) {
                    showTimers.push(setTimeout(function () {
                        cubes[idx].lit = 1;
                        api.sound.pop();
                        api.haptic(8);
                    }, 550 + i * 620));
                });
                showTimers.push(setTimeout(function () {
                    phase = "recall"; step = 0;
                    msg.textContent = "Your turn — tap them in order (0/" + seq.length + ")";
                }, 550 + seq.length * 620 + 260));
            }
            function tapCube(idx) {
                if (phase !== "recall" || idx < 0) return;
                var c = cubes[idx];
                if (idx === seq[step]) {
                    c.good = 1; api.sound.good(); api.haptic(12);
                    step++;
                    if (step >= seq.length) {
                        phase = "idle";
                        bestLen = Math.max(bestLen, seq.length);
                        msg.textContent = "Nice! Round " + (round + 1) + " coming up…";
                        recordBest(seq.length);
                        setTimeout(function () { if (phase === "idle") nextRound(); }, 900);
                    } else {
                        msg.textContent = "Your turn — tap them in order (" + step + "/" + seq.length + ")";
                    }
                } else {
                    c.bad = 1; api.sound.bad(); api.haptic(30);
                    // Show what the answer was, then end.
                    cubes[seq[step]].lit = 1;
                    phase = "over";
                    gameOver();
                }
            }
            function recordBest(len) {
                if (len > best) { best = len; sBest.val.textContent = String(best); }
            }
            function gameOver() {
                clearTimers();
                // Credit the longest sequence actually completed, and give partial
                // credit for how far this one got — nothing is invented either way.
                var scored = Math.max(bestLen, step);
                msg.textContent = "Sequence broken.";
                var isBest = api.setBest(scored);
                api.overlay({
                    emoji: "&#129513;", title: isBest ? "New record!" : "Sequence broken",
                    sub: "You recalled <b>" + scored + "</b> cube" + (scored === 1 ? "" : "s") +
                         " in a row across " + round + " round" + (round === 1 ? "" : "s") + ".",
                    buttons: [
                        { label: "Home", onClick: function () { api.exit(); } },
                        { label: "Play again", primary: true, onClick: function () { reset(); } }
                    ]
                });
            }

            /* ---------- input: tap to pick, drag to spin ---------- */
            var dragging = false, moved = 0, downX = 0, downY = 0, downT = 0, lastX = 0, lastY = 0;
            function localPt(ev) {
                var r = canvas.getBoundingClientRect();
                return {
                    x: (ev.clientX - r.left) * (W / r.width),
                    y: (ev.clientY - r.top) * (H / r.height)
                };
            }
            /** Nearest cube to a point on screen — front-most wins when they overlap. */
            function pickAt(x, y) {
                var bestIdx = -1, bestD = 1e9;
                for (var i = 0; i < cubes.length; i++) {
                    var p = project(view(cubes[i]));
                    var r = SIZE * p.f * 1.05;
                    var dx = p.x - x, dy = p.y - y, dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r) continue;
                    // p.d is distance from the camera: smaller is in front.
                    if (p.d < bestD) { bestD = p.d; bestIdx = i; }
                }
                return bestIdx;
            }
            canvas.addEventListener("pointerdown", function (ev) {
                ev.preventDefault();
                var p = localPt(ev);
                dragging = true; moved = 0; downX = lastX = p.x; downY = lastY = p.y; downT = Date.now();
                try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
            });
            canvas.addEventListener("pointermove", function (ev) {
                if (!dragging) return;
                var p = localPt(ev);
                var dx = p.x - lastX, dy = p.y - lastY;
                lastX = p.x; lastY = p.y;
                moved += Math.abs(dx) + Math.abs(dy);
                if (moved > 8) {
                    yaw += dx * 0.012;
                    pitch += dy * 0.010;
                    pitch = Math.max(-1.2, Math.min(1.2, pitch));
                }
            });
            function endDrag(ev) {
                if (!dragging) return;
                dragging = false;
                var quick = Date.now() - downT < 500;
                if (moved <= 8 && quick) {
                    var p = ev ? localPt(ev) : { x: downX, y: downY };
                    var idx = pickAt(p.x, p.y);
                    if (idx >= 0) { focusIdx = idx; tapCube(idx); }
                } else {
                    // Rotating by hand shouldn't leave the auto-spin fighting you.
                    wobbleT = 0;
                }
            }
            canvas.addEventListener("pointerup", endDrag);
            canvas.addEventListener("pointercancel", function () { dragging = false; });

            /* ---------- remote / keyboard: move a ring, OK to pick ---------- */
            function focusNearest() {
                if (focusIdx >= 0) return;
                var bestIdx = 0, bestD = 1e9;
                for (var i = 0; i < cubes.length; i++) {
                    var p = project(view(cubes[i]));
                    var d = Math.abs(p.x - W / 2) + Math.abs(p.y - H / 2);
                    if (d < bestD) { bestD = d; bestIdx = i; }
                }
                focusIdx = bestIdx;
            }
            function moveFocus(dx, dy) {
                focusNearest();
                var from = project(view(cubes[focusIdx]));
                var bestIdx = -1, bestScore = 1e9;
                for (var i = 0; i < cubes.length; i++) {
                    if (i === focusIdx) continue;
                    var p = project(view(cubes[i]));
                    var vx = p.x - from.x, vy = p.y - from.y;
                    var along = vx * dx + vy * dy;
                    if (along <= 6) continue;                       // must be in that direction
                    var side = Math.abs(vx * dy - vy * dx);         // how far off-axis
                    var score = along + side * 2.2;
                    if (score < bestScore) { bestScore = score; bestIdx = i; }
                }
                if (bestIdx >= 0) { focusIdx = bestIdx; api.haptic(6); }
            }
            function onKey(ev) {
                var k = ev.key;
                if (k === "ArrowLeft") { moveFocus(-1, 0); ev.preventDefault(); }
                else if (k === "ArrowRight") { moveFocus(1, 0); ev.preventDefault(); }
                else if (k === "ArrowUp") { moveFocus(0, -1); ev.preventDefault(); }
                else if (k === "ArrowDown") { moveFocus(0, 1); ev.preventDefault(); }
                else if (k === "Enter" || k === " ") { focusNearest(); tapCube(focusIdx); ev.preventDefault(); }
            }
            document.addEventListener("keydown", onKey);

            reset();
            raf = requestAnimationFrame(loop);

            return function cleanup() {
                clearTimers();
                if (raf) cancelAnimationFrame(raf);
                document.removeEventListener("keydown", onKey);
            };
        }
    });
})();
