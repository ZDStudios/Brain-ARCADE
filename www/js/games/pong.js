/* Pong vs AI (vertical, portrait) */
(function () {
    window.BrainGames.register({
        id: "pong", name: "Pong", icon: "&#127955;",
        gradient: "linear-gradient(135deg,#334155,#0EA5E9)",
        best: "high", bestLabel: "Wins",
        mount: function (host, api) {
            var sp = api.space(), W = Math.round(Math.min(sp.w, sp.h / 1.35, 420)), H = Math.round(W * 1.35);
            var ball, pw, ph, player, ai, pScore, aiScore, raf, running, wins = api.load("wins", 0), roundOver;

            var sYou = stat("You", "0"), sCpu = stat("CPU", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sYou.box, sCpu.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: "Drag to move your paddle. First to 7 wins." }));
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
                // AI paddle (top)
                var target = ball.x - pw / 2; ai += Math.max(-W * 0.007, Math.min(W * 0.007, target - ai)); ai = Math.max(0, Math.min(W - pw, ai));
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
                if (pScore > aiScore) { wins++; api.save("wins", wins); api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "You win!", sub: pScore + " – " + aiScore, buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: reset } ] }); }
                else { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "CPU wins", sub: pScore + " – " + aiScore, buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: reset } ] }); }
            }
            function loop() { raf = requestAnimationFrame(loop); if (running) step(); draw(); }
            function draw() {
                ctx.fillStyle = "#0E1428"; ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = "#F472B6"; roundRect(ai, 6, pw, ph, 6); ctx.fill();
                ctx.fillStyle = "#22D3EE"; roundRect(player, H - ph - 6, pw, ph, 6); ctx.fill();
                ctx.fillStyle = "#FBBF24"; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
            }
            function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

            function movePlayer(clientX) { var rect = canvas.getBoundingClientRect(); var x = (clientX - rect.left) * (W / rect.width); player = Math.max(0, Math.min(W - pw, x - pw / 2)); }
            canvas.addEventListener("touchstart", function (e) { movePlayer(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("touchmove", function (e) { movePlayer(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("mousemove", function (e) { movePlayer(e.clientX); });
            reset();
            return function () { cancelAnimationFrame(raf); raf = null; };
        }
    });
})();
