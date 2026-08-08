/* Tower Stack — time your tap to stack the blocks as high as you can */
(function () {
    window.BrainGames.register({
        id: "towerstack", name: "Tower Stack", icon: "&#127959;",
        gradient: "linear-gradient(135deg,#F59E0B,#EF4444)",
        best: "high", bestLabel: "Tallest",
        difficulties: true,
        help: {
            emoji: "&#127959;", goal: "Stack the blocks to build the tallest tower.",
            steps: [
                "A block slides back and forth at the top.",
                "Tap the screen (or press OK) to drop it.",
                "Line it up with the block below — the overhang gets sliced off!",
                "Miss completely and the tower is finished."
            ]
        },
        mount: function (host, api) {
            var sp = api.space();
            var W = Math.round(Math.min(sp.w, 420));
            var H = Math.round(Math.min(sp.h, W * 1.3));
            var SPEEDS = { easy: 0.10, medium: 0.16, hard: 0.24 };
            var baseSpeed = SPEEDS[api.difficulty] || SPEEDS.medium;

            var COLORS = ["#7C5CFF", "#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#60A5FA", "#FB923C"];
            var BH = Math.max(16, Math.round(H / 16));      // block height
            var stack, moving, raf = null, last = 0, over = false, score = 0, camera = 0;

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

            function reset() {
                over = false; score = 0; camera = 0; last = 0;
                var w0 = Math.round(W * 0.55);
                stack = [{ x: Math.round((W - w0) / 2), w: w0, color: COLORS[0] }];
                spawn();
                sScore.val.textContent = "0";
                sBest.val.textContent = api.getBest() || 0;
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function spawn() {
                var top = stack[stack.length - 1];
                moving = {
                    x: 0, w: top.w, dir: 1,
                    speed: baseSpeed * (1 + Math.min(1.2, score * 0.03)),
                    color: COLORS[stack.length % COLORS.length]
                };
            }
            function drop() {
                if (over || !moving) return;
                var top = stack[stack.length - 1];
                var left = Math.max(moving.x, top.x);
                var right = Math.min(moving.x + moving.w, top.x + top.w);
                var overlapW = right - left;
                if (overlapW <= 2) { return gameOver(); }
                var perfect = Math.abs(moving.x - top.x) <= 3;
                stack.push({ x: left, w: perfect ? top.w : overlapW, color: moving.color, pop: 1 });
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

            function step(dt) {
                if (!moving) return;
                moving.x += moving.dir * moving.speed * dt;
                if (moving.x <= 0) { moving.x = 0; moving.dir = 1; }
                if (moving.x + moving.w >= W) { moving.x = W - moving.w; moving.dir = -1; }
                // keep the top of the tower in view
                var targetCam = Math.max(0, (stack.length + 2) * BH - H * 0.75);
                camera += (targetCam - camera) * Math.min(1, dt / 180);
                for (var i = 0; i < stack.length; i++) if (stack[i].pop) stack[i].pop = Math.max(0, stack[i].pop - dt / 160);
            }
            function yFor(level) { return H - BH - level * BH + camera; }
            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#131C36"); g.addColorStop(1, "#0B1020");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // ground
                ctx.fillStyle = "rgba(255,255,255,.06)";
                ctx.fillRect(0, yFor(0) + BH, W, H);
                var i, b, y;
                for (i = 0; i < stack.length; i++) {
                    b = stack[i]; y = yFor(i);
                    if (y > H + BH || y < -BH * 2) continue;
                    var squash = b.pop ? 1 + b.pop * 0.25 : 1;
                    ctx.fillStyle = b.color;
                    var h = BH * (b.pop ? 1 / squash : 1);
                    roundRect(b.x, y + (BH - h), b.w, h, Math.min(6, BH / 3));
                    ctx.fillStyle = "rgba(255,255,255,.16)";
                    roundRect(b.x, y + (BH - h), b.w, Math.max(2, h * 0.28), Math.min(6, BH / 3));
                }
                if (moving && !over) {
                    y = yFor(stack.length);
                    ctx.fillStyle = moving.color;
                    roundRect(moving.x, y, moving.w, BH, Math.min(6, BH / 3));
                    // drop guide
                    ctx.strokeStyle = "rgba(255,255,255,.22)";
                    ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(moving.x + moving.w / 2, y + BH); ctx.lineTo(moving.x + moving.w / 2, H); ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
            function roundRect(x, y, w, h, r) {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + w, y, x + w, y + h, r);
                ctx.arcTo(x + w, y + h, x, y + h, r);
                ctx.arcTo(x, y + h, x, y, r);
                ctx.arcTo(x, y, x + w, y, r);
                ctx.closePath(); ctx.fill();
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
