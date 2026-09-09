/* Tower Stack (3D) — time your tap to stack the blocks as high as you can.
   Classic "Stack" mechanic: each block alternately slides along X then Z,
   rendered as isometric 3D cuboids. Miss the overlap and the tower is done. */
(function () {
    var COS30 = Math.cos(Math.PI / 6), SIN30 = Math.sin(Math.PI / 6);
    var WS = 280;              // world footprint (x/z both range 0..WS)
    var BLOCK_H = 24;          // world-unit height of one block
    var GRAV = 0.0022;         // world units / ms^2 for falling debris

    function shade(hex, amt) {
        var n = parseInt(hex.replace("#", ""), 16);
        var r = Math.min(255, Math.max(0, (n >> 16) + amt));
        var g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
        var b = Math.min(255, Math.max(0, (n & 0xff) + amt));
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    window.BrainGames.register({
        id: "towerstack", name: "Tower Stack", icon: "&#127959;",
        gradient: "linear-gradient(135deg,#F59E0B,#EF4444)",
        best: "high", bestLabel: "Tallest",
        difficulties: true,
        help: {
            emoji: "&#127959;", goal: "Stack the blocks to build the tallest 3D tower.",
            steps: [
                "A block slides back and forth — first along one side, then the other.",
                "Tap the screen (or press OK) to drop it.",
                "Line it up with the block below — the overhang gets sliced off!",
                "Miss completely and the tower is finished."
            ]
        },
        mount: function (host, api) {
            var sp = api.space();
            var W = Math.round(Math.min(sp.w, 420));
            var H = Math.round(Math.min(sp.h, W * 1.3));
            var SPEEDS = { easy: 0.075, medium: 0.11, hard: 0.16 };
            var baseSpeed = SPEEDS[api.difficulty] || SPEEDS.medium;

            var COLORS = ["#7C5CFF", "#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#60A5FA", "#FB923C"];
            var scale = (Math.min(W, H) * 0.86) / (WS * 1.9);
            var originX = W / 2, originY = H * 0.8;

            var stack, moving, debris, raf = null, last = 0, over = false, score = 0, camera = 0;

            var sScore = stat("Height", "0"), sBest = stat("Tallest", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H, style: "border-radius:14px;cursor:pointer" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "width:auto" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap to drop the block. Line it up!" }));
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", text: "Restart", onclick: reset }),
                api.el("button", { class: "btn primary", text: "Drop", onclick: drop })
            ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            /* ---------- projection ---------- */
            function project(x, z, y) {
                var effY = y - camera;
                return {
                    x: originX + (x - z) * COS30 * scale,
                    y: originY + (x + z) * SIN30 * scale - effY * scale
                };
            }
            function poly(pts, fill) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
            }

            /* ---------- state ---------- */
            function reset() {
                over = false; score = 0; camera = 0; last = 0; debris = [];
                var w0 = WS * 0.6, off = (WS - w0) / 2;
                stack = [{ x0: off, x1: off + w0, z0: off, z1: off + w0, color: COLORS[0] }];
                spawn();
                sScore.val.textContent = "0";
                sBest.val.textContent = api.getBest() || 0;
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function spawn() {
                var top = stack[stack.length - 1];
                var axis = stack.length % 2;               // 0 = slides on X, 1 = slides on Z
                var len = axis === 0 ? (top.x1 - top.x0) : (top.z1 - top.z0);
                moving = {
                    axis: axis, len: len, t: 0, dir: 1,
                    speed: baseSpeed * (1 + Math.min(1.2, score * 0.03)),
                    color: COLORS[stack.length % COLORS.length],
                    fx0: top.x0, fx1: top.x1, fz0: top.z0, fz1: top.z1
                };
            }
            function movingExtent() {
                if (moving.axis === 0) return { x0: moving.t, x1: moving.t + moving.len, z0: moving.fz0, z1: moving.fz1 };
                return { x0: moving.fx0, x1: moving.fx1, z0: moving.t, z1: moving.t + moving.len };
            }

            function drop() {
                if (over || !moving) return;
                var top = stack[stack.length - 1];
                var m = movingExtent();
                var level = stack.length;
                var perfect, left, right, overlap, cut;

                if (moving.axis === 0) {
                    left = Math.max(m.x0, top.x0); right = Math.min(m.x1, top.x1);
                    overlap = right - left;
                    if (overlap <= 1.5) return gameOver();
                    perfect = Math.abs(m.x0 - top.x0) <= Math.min(4, moving.len * 0.06);
                    var nx0 = left, nx1 = perfect ? top.x1 : right;
                    if (!perfect) {
                        cut = m.x0 < left
                            ? { x0: m.x0, x1: left, z0: top.z0, z1: top.z1 }
                            : (m.x1 > right ? { x0: right, x1: m.x1, z0: top.z0, z1: top.z1 } : null);
                    }
                    stack.push({ x0: nx0, x1: nx1, z0: top.z0, z1: top.z1, color: moving.color, pop: 1, perfect: perfect });
                } else {
                    left = Math.max(m.z0, top.z0); right = Math.min(m.z1, top.z1);
                    overlap = right - left;
                    if (overlap <= 1.5) return gameOver();
                    perfect = Math.abs(m.z0 - top.z0) <= Math.min(4, moving.len * 0.06);
                    var nz0 = left, nz1 = perfect ? top.z1 : right;
                    if (!perfect) {
                        cut = m.z0 < left
                            ? { x0: top.x0, x1: top.x1, z0: m.z0, z1: left }
                            : (m.z1 > right ? { x0: top.x0, x1: top.x1, z0: right, z1: m.z1 } : null);
                    }
                    stack.push({ x0: top.x0, x1: top.x1, z0: nz0, z1: nz1, color: moving.color, pop: 1, perfect: perfect });
                }
                if (cut) debris.push({ x0: cut.x0, x1: cut.x1, z0: cut.z0, z1: cut.z1, level: level, color: moving.color, vy: 0, fall: 0, alpha: 1 });

                score++;
                sScore.val.textContent = String(score);
                if (perfect) { api.sound.good(); api.haptic(14); }
                else { api.sound.pop(); api.haptic(6); }
                spawn();
            }
            function gameOver() {
                over = true;
                var rec = api.setBest(score);
                api.sound.lose();
                api.overlay({
                    emoji: "&#127959;", title: "Tower Down!",
                    sub: "You stacked <b>" + score + "</b> block" + (score === 1 ? "" : "s") + (rec ? "<br>&#127942; New record!" : ""),
                    buttons: [{ label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset }]
                });
            }

            /* ---------- loop ---------- */
            function step(dt) {
                if (moving) {
                    var max = WS - moving.len;
                    moving.t += moving.dir * moving.speed * dt;
                    if (moving.t <= 0) { moving.t = 0; moving.dir = 1; }
                    if (moving.t >= max) { moving.t = max; moving.dir = -1; }
                }
                var targetCam = Math.max(0, (stack.length - 6) * BLOCK_H);
                camera += (targetCam - camera) * Math.min(1, dt / 200);
                for (var i = 0; i < stack.length; i++) if (stack[i].pop) stack[i].pop = Math.max(0, stack[i].pop - dt / 160);
                for (var d = debris.length - 1; d >= 0; d--) {
                    var b = debris[d];
                    b.vy += GRAV * dt;
                    b.fall += b.vy * dt;
                    b.alpha -= dt / 700;
                    if (b.alpha <= 0 || b.fall > BLOCK_H * 8) debris.splice(d, 1);
                }
            }

            function drawBlock(b, i, squashOverride) {
                var yBottom = i * BLOCK_H, yTop = yBottom + BLOCK_H;
                var sq = squashOverride != null ? squashOverride : (b.pop || 0);
                var pad = sq * 6, hTop = yTop - sq * BLOCK_H * 0.5;
                var x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.z0 - pad, z1 = b.z1 + pad;
                var fA = project(x0, z1, yBottom), fB = project(x1, z1, yBottom), fC = project(x1, z1, hTop), fD = project(x0, z1, hTop);
                var rA = project(x1, z0, yBottom), rB = project(x1, z1, yBottom), rC = project(x1, z1, hTop), rD = project(x1, z0, hTop);
                var tA = project(x0, z0, hTop), tB = project(x1, z0, hTop), tC = project(x1, z1, hTop), tD = project(x0, z1, hTop);
                poly([fA, fB, fC, fD], shade(b.color, -50));
                poly([rA, rB, rC, rD], shade(b.color, -22));
                poly([tA, tB, tC, tD], shade(b.color, 20));
                if (b.perfect && b.pop) {
                    ctx.save(); ctx.globalAlpha = Math.max(0, b.pop);
                    ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y); ctx.closePath(); ctx.stroke();
                    ctx.restore();
                }
            }
            function drawDebris(b) {
                var yBottom = b.level * BLOCK_H - b.fall, yTop = yBottom + BLOCK_H;
                var fA = project(b.x0, b.z1, yBottom), fB = project(b.x1, b.z1, yBottom), fC = project(b.x1, b.z1, yTop), fD = project(b.x0, b.z1, yTop);
                var rA = project(b.x1, b.z0, yBottom), rB = project(b.x1, b.z1, yBottom), rC = project(b.x1, b.z1, yTop), rD = project(b.x1, b.z0, yTop);
                var tA = project(b.x0, b.z0, yTop), tB = project(b.x1, b.z0, yTop), tC = project(b.x1, b.z1, yTop), tD = project(b.x0, b.z1, yTop);
                ctx.save(); ctx.globalAlpha = Math.max(0, b.alpha);
                poly([fA, fB, fC, fD], shade(b.color, -50));
                poly([rA, rB, rC, rD], shade(b.color, -22));
                poly([tA, tB, tC, tD], shade(b.color, 20));
                ctx.restore();
            }
            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#131C36"); g.addColorStop(1, "#0B1020");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

                // ground diamond
                var g0 = project(0, 0, -camera <= -1e9 ? 0 : 0), g1 = project(WS, 0, 0), g2 = project(WS, WS, 0), g3 = project(0, WS, 0);
                var gb0 = project(0, 0, -camera), gb1 = project(WS, 0, -camera), gb2 = project(WS, WS, -camera), gb3 = project(0, WS, -camera);
                ctx.save(); ctx.globalAlpha = 0.5;
                poly([project(0, 0, 0), project(WS, 0, 0), project(WS, WS, 0), project(0, WS, 0)], "rgba(255,255,255,.05)");
                ctx.restore();

                for (var i = 0; i < stack.length; i++) drawBlock(stack[i], i);
                for (var d = 0; d < debris.length; d++) drawDebris(debris[d]);
                if (moving && !over) {
                    var m = movingExtent();
                    drawBlock({ x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1, color: moving.color, pop: 0 }, stack.length, 0);
                }
            }
            function loop(ts) {
                raf = requestAnimationFrame(loop);
                if (over) { draw(); return; }
                if (!last) last = ts;
                var dt = Math.min(48, ts - last); last = ts;
                step(dt); draw();
            }

            canvas.addEventListener("click", drop);
            canvas.addEventListener("touchstart", function (e) { drop(); e.preventDefault(); }, { passive: false });
            function key(e) {
                if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.key === "ArrowDown") { drop(); e.preventDefault(); }
            }
            window.addEventListener("keydown", key);

            reset();
            return function () { cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", key); };
        }
    });
})();
