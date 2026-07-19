/* Snake */
(function () {
    window.BrainGames.register({
        id: "snake", name: "Snake", icon: "&#128013;",
        gradient: "linear-gradient(135deg,#059669,#84CC16)",
        best: "high",
        help: {"emoji":"&#128013;","goal":"Eat food and grow as long as you can.","steps":["Swipe or use the arrow buttons to steer.","Eat the red food to grow longer and score.","Don't crash into the walls.","And don't bite your own tail!"]},
        mount: function (host, api) {
            var N = 17;
            var cell = Math.floor(api.space().board / N), W = cell * N, H = cell * N;
            var snake, dir, nextDir, food, score, over, raf, acc = 0, last = 0, stepMs;

            var sScore = stat("Score", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            var ctx = canvas.getContext("2d");
            host.appendChild(api.el("div", { class: "pad", style: "margin-top:4px" }, [
                sp(), mk("&#9650;", [0,-1]), sp(),
                mk("&#9664;", [-1,0]), sp(), mk("&#9654;", [1,0]),
                sp(), mk("&#9660;", [0,1]), sp()
            ]));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function sp() { return api.el("div"); }
            function mk(html, d) { return api.el("button", { class: "btn", html: html, onclick: function () { setDir(d); api.haptic(6); } }); }
            function setDir(d) { if (d[0] === -dir[0] && d[1] === -dir[1]) return; nextDir = d; }

            function placeFood() {
                do { food = [rnd(N), rnd(N)]; } while (snake.some(function (s) { return s[0] === food[0] && s[1] === food[1]; }));
            }
            function rnd(n) { return Math.floor(Math.random() * n); }

            function step() {
                dir = nextDir;
                var head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
                if (head[0] < 0 || head[0] >= N || head[1] < 0 || head[1] >= N || snake.some(function (s) { return s[0] === head[0] && s[1] === head[1]; })) { return gameOver(); }
                snake.unshift(head);
                if (head[0] === food[0] && head[1] === food[1]) { score++; api.sound.pop(); api.haptic(10); placeFood(); stepMs = Math.max(70, stepMs - 3); update(); }
                else snake.pop();
            }
            function loop(ts) {
                raf = requestAnimationFrame(loop);
                if (over) return;
                if (!last) last = ts; acc += ts - last; last = ts;
                if (acc >= stepMs) { acc = 0; step(); draw(); }
            }
            function draw() {
                ctx.fillStyle = "#0E1428"; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = "#EF4444";
                roundRect(food[0] * cell + 2, food[1] * cell + 2, cell - 4, cell - 4, 5); ctx.fill();
                snake.forEach(function (s, i) {
                    var t = i / snake.length;
                    ctx.fillStyle = i === 0 ? "#A3E635" : "hsl(" + (95 + t * 30) + ",65%," + (55 - t * 15) + "%)";
                    roundRect(s[0] * cell + 1, s[1] * cell + 1, cell - 2, cell - 2, 5); ctx.fill();
                });
            }
            function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
            function update() { sScore.val.textContent = score; sBest.val.textContent = api.getBest() || 0; }
            function gameOver() { over = true; var rec = api.setBest(score); api.sound.lose();
                api.overlay({ emoji: "&#128013;", title: "Game Over", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] }); }
            function reset() {
                snake = [[8,8],[7,8],[6,8]]; dir = [1,0]; nextDir = [1,0]; score = 0; over = false; stepMs = 160; acc = 0; last = 0;
                placeFood(); update(); draw();
            }

            var sx, sy;
            canvas.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
            canvas.addEventListener("touchend", function (e) { var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
                if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
                if (Math.abs(dx) > Math.abs(dy)) setDir([dx > 0 ? 1 : -1, 0]); else setDir([0, dy > 0 ? 1 : -1]); });
            function key(e) { var m = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] }; if (e.key in m) { e.preventDefault(); setDir(m[e.key]); } }
            window.addEventListener("keydown", key);

            reset(); raf = requestAnimationFrame(loop);
            return function () { cancelAnimationFrame(raf); window.removeEventListener("keydown", key); };
        }
    });
})();
