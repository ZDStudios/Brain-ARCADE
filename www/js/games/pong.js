/* Pong vs AI (vertical, portrait) */
(function () {
    window.BrainGames.register({
        id: "pong", name: "Pong", icon: "&#127955;",
        gradient: "linear-gradient(135deg,#334155,#0EA5E9)",
        best: "high", bestLabel: "Wins", difficulties: true, twoPlayer: true,
        twoPlayerHint: "One at each end of the screen",
        help: {"emoji":"&#127955;","goal":"First to 7 points wins.","steps":["Drag left and right to move your paddle.","Bounce the ball past the other paddle to score.","2 Players: sit at opposite ends — each of you drags your own paddle.","First one to 7 points wins!"]},
        mount: function (host, api) {
            var TWO = api.twoPlayer;
            var AI_SPEED = { easy: 0.0045, medium: 0.007, hard: 0.0095 }[api.difficulty] || 0.007;
            var keys = {};
            var sp = api.space(), W = Math.round(Math.min(sp.w, sp.h / 1.35, 600)), H = Math.round(W * 1.35);
            var ball, pw, ph, player, ai, pScore, aiScore, raf, running, wins = api.load("wins", 0), roundOver;

            var sYou = stat(TWO ? "Blue" : "You", "0"), sCpu = stat(TWO ? "Pink" : "CPU", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, TWO ? [sYou.box, sCpu.box] : [sYou.box, sCpu.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: TWO ? "Pink drags in the top half, Blue in the bottom half. First to 7!" : "Drag to move your paddle. First to 7 wins." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function reset() {
                pw = W * 0.26; ph = Math.max(10, H * 0.02);
                player = W / 2 - pw / 2; ai = W / 2 - pw / 2;
                pScore = 0; aiScore = 0; roundOver = false; running = true;
                sYou.val.textContent = "0"; sCpu.val.textContent = "0";
                serve(1);
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function serve(dir) { ball = { x: W / 2, y: H / 2, r: Math.max(6, W * 0.02), dx: (Math.random() < 0.5 ? -1 : 1) * W * 0.005, dy: dir * H * 0.006 }; }
            function step() {
                if (roundOver) return;
                ball.x += ball.dx; ball.y += ball.dy;
                if (ball.x < ball.r || ball.x > W - ball.r) { ball.dx *= -1; ball.x = Math.max(ball.r, Math.min(W - ball.r, ball.x)); api.sound.tick(); }
                // top paddle: the computer, or player 2 (A/D keys or their finger)
                if (TWO) {
                    if (keys.a) ai -= W * 0.015; if (keys.d) ai += W * 0.015;
                } else { var target = ball.x - pw / 2; ai += Math.max(-W * AI_SPEED, Math.min(W * AI_SPEED, target - ai)); }
                ai = Math.max(0, Math.min(W - pw, ai));
                if (keys.ArrowLeft) player -= W * 0.015; if (keys.ArrowRight) player += W * 0.015;
                player = Math.max(0, Math.min(W - pw, player));
                // player paddle collision (bottom)
                if (ball.y + ball.r > H - ph - 6 && ball.y < H - 6 && ball.x > player && ball.x < player + pw && ball.dy > 0) {
                    ball.dy = -Math.abs(ball.dy); ball.dx += ((ball.x - (player + pw / 2)) / (pw / 2)) * W * 0.004; api.sound.pop(); api.haptic(6);
                }
                // ai paddle collision (top)
                if (ball.y - ball.r < ph + 6 && ball.y > 6 && ball.x > ai && ball.x < ai + pw && ball.dy < 0) {
                    ball.dy = Math.abs(ball.dy); ball.dx += ((ball.x - (ai + pw / 2)) / (pw / 2)) * W * 0.003; api.sound.tick();
                }
                if (ball.y < 0) { pScore++; sYou.val.textContent = pScore; api.sound.good(); point(1); }
                else if (ball.y > H) { aiScore++; sCpu.val.textContent = aiScore; api.sound.bad(); point(-1); }
            }
            function point(dir) {
                if (pScore >= 7 || aiScore >= 7) return finish();
                roundOver = true; setTimeout(function () { serve(dir > 0 ? -1 : 1); roundOver = false; }, 700);
            }
            function finish() {
                running = false; roundOver = true;
                if (TWO) {
                    api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: (pScore > aiScore ? "Blue" : "Pink") + " wins!", sub: "Blue " + pScore + " – " + aiScore + " Pink", buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: reset } ] });
                    return;
                }
                if (pScore > aiScore) { wins++; api.save("wins", wins); api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "You win!", sub: pScore + " – " + aiScore, buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: reset } ] }); }
                else { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "CPU wins", sub: pScore + " – " + aiScore, buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: reset } ] }); }
            }
            function loop() { raf = requestAnimationFrame(loop); if (running) step(); draw(); }
            var trail = [];
            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2A1036"); g.addColorStop(0.5, "#0E1428"); g.addColorStop(1, "#06283D");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
                ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.12, 0, 7); ctx.stroke();
                ctx.font = "900 " + Math.round(W * 0.2) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,0.06)";
                ctx.fillText(aiScore, W / 2, H * 0.27); ctx.fillText(pScore, W / 2, H * 0.73);
                ctx.shadowBlur = 16;
                ctx.shadowColor = "#F472B6"; ctx.fillStyle = "#F472B6"; roundRect(ai, 6, pw, ph, 6); ctx.fill();
                ctx.shadowColor = "#22D3EE"; ctx.fillStyle = "#22D3EE"; roundRect(player, H - ph - 6, pw, ph, 6); ctx.fill();
                ctx.shadowBlur = 0;
                if (!roundOver) { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.shift(); } else trail = [];
                for (var t = 0; t < trail.length; t++) { ctx.globalAlpha = t / trail.length * 0.3; ctx.beginPath(); ctx.arc(trail[t].x, trail[t].y, ball.r * (t / trail.length), 0, 7); ctx.fillStyle = "#FBBF24"; ctx.fill(); }
                ctx.globalAlpha = 1; ctx.shadowColor = "#FBBF24"; ctx.shadowBlur = 14;
                ctx.fillStyle = "#FDE68A"; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
            }
            function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

            /* Every finger counts, so two players can drag at the same time: a touch in
               the top half moves the top paddle (in 2-player mode), the bottom half the
               bottom paddle. */
            function moveAt(clientX, clientY) {
                var rect = canvas.getBoundingClientRect();
                var x = (clientX - rect.left) * (W / rect.width), y = (clientY - rect.top) * (H / rect.height);
                var nx = Math.max(0, Math.min(W - pw, x - pw / 2));
                if (TWO && y < H / 2) ai = nx; else player = nx;
            }
            function touches(e) { for (var i = 0; i < e.touches.length; i++) moveAt(e.touches[i].clientX, e.touches[i].clientY); e.preventDefault(); }
            canvas.addEventListener("touchstart", touches, { passive: false });
            canvas.addEventListener("touchmove", touches, { passive: false });
            canvas.addEventListener("mousemove", function (e) { moveAt(e.clientX, e.clientY); });
            function kd(e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k === "ArrowLeft" || k === "ArrowRight" || (TWO && (k === "a" || k === "d"))) { keys[k] = true; e.preventDefault(); } }
            function ku(e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; }
            window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
            reset();
            return function () { cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
        }
    });
})();
