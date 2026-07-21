/* Fruit Catch — move the basket to catch falling fruit */
(function () {
    window.BrainGames.register({
        id: "fruitcatch", name: "Fruit Catch", icon: "&#127826;",
        gradient: "linear-gradient(135deg,#F97316,#EF4444)",
        best: "high",
        help: { emoji: "&#127826;", goal: "Catch the falling fruit in your basket.", steps: [
            "Drag left and right to move the basket.",
            "Catch fruit to score points.",
            "Watch out — catching a bomb loses a life!",
            "You have 3 lives. Miss fruit is okay, but don't run out of lives." ] },
        mount: function (host, api) {
            var sp = api.space(), W = Math.round(Math.min(sp.w, sp.h / 1.25, 420)), H = Math.round(W * 1.25);
            var FRUITS = ["🍎","🍌","🍉","🍓","🍑","🍇","🍊","🍍"];
            var score, lives, items, basket, raf, over, spawnAcc, last, speed;

            var sScore = stat("Score", "0"), sLives = stat("Lives", "3"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sLives.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: "Drag to move the basket. Catch fruit, dodge bombs!" }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function reset() {
                score = 0; lives = 3; items = []; over = false; spawnAcc = 0; last = 0; speed = H * 0.004;
                basket = { x: W / 2, w: W * 0.22, y: H - W * 0.12 };
                sScore.val.textContent = "0"; sLives.val.textContent = "3"; sBest.val.textContent = api.getBest() || 0;
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function spawn() {
                var bomb = Math.random() < 0.16;
                items.push({ x: W * (0.1 + Math.random() * 0.8), y: -20, r: W * 0.05, bomb: bomb, e: bomb ? "💣" : FRUITS[Math.floor(Math.random() * FRUITS.length)], vy: speed * (0.8 + Math.random() * 0.6) });
            }
            function step(dt) {
                spawnAcc += dt;
                var interval = Math.max(520, 1100 - score * 8);
                if (spawnAcc > interval) { spawnAcc = 0; spawn(); }
                for (var i = items.length - 1; i >= 0; i--) {
                    var it = items[i]; it.y += it.vy * dt / 16;
                    if (it.y > basket.y - basket.w * 0.2 && it.y < basket.y + 30 && Math.abs(it.x - basket.x) < basket.w / 2 + it.r * 0.4) {
                        if (it.bomb) { lives--; sLives.val.textContent = lives; api.sound.bad(); api.haptic(30); if (lives <= 0) return gameOver(); }
                        else { score++; sScore.val.textContent = score; api.sound.pop(); api.haptic(6); speed += H * 0.00003; }
                        items.splice(i, 1); continue;
                    }
                    if (it.y > H + 30) { items.splice(i, 1); }
                }
            }
            function loop(ts) {
                raf = requestAnimationFrame(loop);
                if (over) return;
                if (!last) last = ts; var dt = Math.min(48, ts - last); last = ts;
                step(dt); draw();
            }
            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1e293b"); g.addColorStop(1, "#0E1428");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.font = (W * 0.09) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                items.forEach(function (it) { ctx.fillText(it.e, it.x, it.y); });
                // basket
                ctx.font = (W * 0.14) + "px sans-serif";
                ctx.fillText("🧺", basket.x, basket.y);
            }
            function gameOver() {
                over = true; var rec = api.setBest(score); api.sound.lose();
                api.overlay({ emoji: "&#127826;", title: "Game Over", sub: "You caught <b>" + score + "</b> fruit" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] });
            }
            function move(clientX) { var rect = canvas.getBoundingClientRect(); var x = (clientX - rect.left) * (W / rect.width); basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, x)); }
            canvas.addEventListener("touchstart", function (e) { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("touchmove", function (e) { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("mousemove", function (e) { if (e.buttons || e.type === "mousemove") move(e.clientX); });
            function key(e) { if (e.key === "ArrowLeft") { basket.x = Math.max(basket.w / 2, basket.x - W * 0.08); } else if (e.key === "ArrowRight") { basket.x = Math.min(W - basket.w / 2, basket.x + W * 0.08); } }
            window.addEventListener("keydown", key);

            reset();
            return function () { cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", key); };
        }
    });
})();
