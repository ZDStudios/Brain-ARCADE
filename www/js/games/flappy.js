/* Flappy — tap to fly */
(function () {
    window.BrainGames.register({
        id: "flappy", name: "Flappy Bird", icon: "&#128038;",
        gradient: "linear-gradient(135deg,#0EA5E9,#22C55E)",
        best: "high",
        mount: function (host, api) {
            var sp = api.space(), W = Math.round(Math.min(sp.w, sp.h / 1.3, 420)), H = Math.round(W * 1.3);
            var bird, pipes, score, over, started, raf, grav, jump, gap, pipeW, speed, spawnX;

            var sScore = stat("Score", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap the screen to flap through the gaps." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function reset() {
                grav = H * 0.0011; jump = -H * 0.018; gap = H * 0.28; pipeW = W * 0.16; speed = W * 0.006; spawnX = W * 0.62;
                bird = { x: W * 0.28, y: H / 2, v: 0, r: Math.max(9, W * 0.03) };
                pipes = []; score = 0; over = false; started = false; sScore.val.textContent = "0";
                addPipe(W); addPipe(W + spawnX);
                draw();
                if (!raf) raf = requestAnimationFrame(loop);
            }
            function addPipe(x) { var top = 40 + Math.random() * (H - gap - 120); pipes.push({ x: x, top: top, passed: false }); }
            function flap() { if (over) return; started = true; bird.v = jump; api.sound.tick(); }

            function step() {
                if (!started) return;
                bird.v += grav; bird.y += bird.v;
                for (var i = 0; i < pipes.length; i++) {
                    var p = pipes[i]; p.x -= speed;
                    if (!p.passed && p.x + pipeW < bird.x) { p.passed = true; score++; sScore.val.textContent = score; api.sound.pop(); api.haptic(8); }
                    if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + pipeW && (bird.y - bird.r < p.top || bird.y + bird.r > p.top + gap)) return gameOver();
                }
                if (pipes.length && pipes[0].x + pipeW < 0) pipes.shift();
                if (pipes[pipes.length - 1].x < W - spawnX) addPipe(W);
                if (bird.y + bird.r > H || bird.y - bird.r < 0) return gameOver();
            }
            function loop() { raf = requestAnimationFrame(loop); if (!over) step(); draw(); }
            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0EA5E9"); g.addColorStop(1, "#38BDF8"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = "#22C55E";
                pipes.forEach(function (p) { ctx.fillRect(p.x, 0, pipeW, p.top); ctx.fillRect(p.x, p.top + gap, pipeW, H - p.top - gap);
                    ctx.fillStyle = "#16A34A"; ctx.fillRect(p.x - 3, p.top - 16, pipeW + 6, 16); ctx.fillRect(p.x - 3, p.top + gap, pipeW + 6, 16); ctx.fillStyle = "#22C55E"; });
                // bird
                ctx.save(); ctx.translate(bird.x, bird.y); ctx.rotate(Math.max(-0.5, Math.min(1, bird.v * 0.06)));
                ctx.fillStyle = "#FBBF24"; ctx.beginPath(); ctx.arc(0, 0, bird.r, 0, 7); ctx.fill();
                ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bird.r * 0.3, -bird.r * 0.3, bird.r * 0.35, 0, 7); ctx.fill();
                ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(bird.r * 0.45, -bird.r * 0.3, bird.r * 0.15, 0, 7); ctx.fill();
                ctx.fillStyle = "#F97316"; ctx.beginPath(); ctx.moveTo(bird.r, 0); ctx.lineTo(bird.r * 1.5, bird.r * 0.2); ctx.lineTo(bird.r, bird.r * 0.35); ctx.fill();
                ctx.restore();
                ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold " + Math.floor(W * 0.11) + "px sans-serif"; ctx.textAlign = "center"; ctx.fillText(score, W / 2, H * 0.16);
                if (!started && !over) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.font = "bold " + Math.floor(W * 0.06) + "px sans-serif"; ctx.fillText("Tap to start", W / 2, H / 2); }
            }
            function gameOver() { if (over) return; over = true; var rec = api.setBest(score); api.sound.lose(); api.haptic(30);
                api.overlay({ emoji: "&#128038;", title: "Game Over", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] }); }

            canvas.addEventListener("touchstart", function (e) { flap(); e.preventDefault(); }, { passive: false });
            canvas.addEventListener("mousedown", flap);
            function key(e) { if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); } }
            window.addEventListener("keydown", key);
            reset();
            return function () { cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", key); };
        }
    });
})();
