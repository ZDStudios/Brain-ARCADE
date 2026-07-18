/* Breakout */
(function () {
    window.BrainGames.register({
        id: "breakout", name: "Breakout", icon: "&#127951;",
        gradient: "linear-gradient(135deg,#7C3AED,#2563EB)",
        best: "high",
        mount: function (host, api) {
            var sp = api.space(), W = Math.round(Math.min(sp.w, sp.h / 1.25, 420)), H = Math.round(W * 1.25);
            var score, lives, level, bricks, ball, paddle, raf, running, over;
            var COLS = 7, ROWS = 5, bw, bh = 18, pad;

            var sScore = stat("Score", "0"), sLives = stat("Lives", "3"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sLives.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: "Drag anywhere to move the paddle." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            var COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE"];

            function buildBricks() {
                bricks = []; bw = (W - 20) / COLS;
                for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) bricks.push({ x: 10 + c * bw, y: 50 + r * (bh + 6), alive: true, col: COLORS[r % COLORS.length], pts: (ROWS - r) * 10 });
            }
            function reset() {
                score = 0; lives = 3; level = 1; over = false;
                pad = W * 0.24; paddle = { x: W / 2 - pad / 2, w: pad, h: 12 };
                buildBricks(); launch(); update(); running = true;
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function launch() { ball = { x: W / 2, y: H - 40, r: Math.max(5, W * 0.018), dx: (Math.random() < 0.5 ? -1 : 1) * W * 0.006, dy: -W * 0.008, stuck: true }; }
            function update() { sScore.val.textContent = score; sLives.val.textContent = lives; sBest.val.textContent = api.getBest() || 0; }

            function step() {
                if (ball.stuck) { ball.x = paddle.x + paddle.w / 2; ball.y = H - 26; return; }
                ball.x += ball.dx; ball.y += ball.dy;
                if (ball.x < ball.r) { ball.x = ball.r; ball.dx *= -1; api.sound.tick(); }
                if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.dx *= -1; api.sound.tick(); }
                if (ball.y < ball.r) { ball.y = ball.r; ball.dy *= -1; api.sound.tick(); }
                // paddle
                if (ball.y + ball.r >= H - 18 && ball.y < H - 6 && ball.x > paddle.x && ball.x < paddle.x + paddle.w && ball.dy > 0) {
                    ball.dy = -Math.abs(ball.dy);
                    var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
                    ball.dx = hit * W * 0.009; api.sound.pop(); api.haptic(6);
                }
                if (ball.y > H + 20) { lives--; update(); api.sound.bad(); api.haptic(30); if (lives <= 0) return gameOver(); launch(); }
                // bricks
                for (var i = 0; i < bricks.length; i++) { var b = bricks[i]; if (!b.alive) continue;
                    if (ball.x > b.x && ball.x < b.x + bw && ball.y - ball.r < b.y + bh && ball.y + ball.r > b.y) {
                        b.alive = false; ball.dy *= -1; score += b.pts; update(); api.sound.tick(); api.haptic(5); break;
                    }
                }
                if (bricks.every(function (b) { return !b.alive; })) { level++; score += 100; buildBricks(); launch(); ball.dx *= 1.08; ball.dy *= 1.08; api.sound.win(); }
            }
            function loop() {
                raf = requestAnimationFrame(loop);
                if (running && !over) step();
                draw();
            }
            function draw() {
                ctx.fillStyle = "#0E1428"; ctx.fillRect(0, 0, W, H);
                bricks.forEach(function (b) { if (!b.alive) return; ctx.fillStyle = b.col; roundRect(b.x + 2, b.y, bw - 4, bh, 5); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(b.x + 2, b.y, bw - 4, 4); });
                ctx.fillStyle = "#EEF2FF"; roundRect(paddle.x, H - 18, paddle.w, paddle.h, 6); ctx.fill();
                ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fillStyle = "#FBBF24"; ctx.fill();
            }
            function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
            function gameOver() { over = true; var rec = api.setBest(score); api.sound.lose();
                api.overlay({ emoji: "&#127951;", title: "Game Over", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] }); }

            function movePaddle(clientX) { var rect = canvas.getBoundingClientRect(); var x = (clientX - rect.left) * (W / rect.width); paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2)); }
            canvas.addEventListener("touchstart", function (e) { if (ball.stuck) ball.stuck = false; movePaddle(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("touchmove", function (e) { movePaddle(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("mousemove", function (e) { movePaddle(e.clientX); });
            canvas.addEventListener("mousedown", function () { if (ball.stuck) ball.stuck = false; });

            reset();
            return function () { cancelAnimationFrame(raf); raf = null; };
        }
    });
})();
