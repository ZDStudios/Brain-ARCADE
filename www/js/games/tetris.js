/* Tetris */
(function () {
    window.BrainGames.register({
        id: "tetris", name: "Tetris", icon: "&#129513;",
        gradient: "linear-gradient(135deg,#6D28D9,#DB2777)",
        best: "high", bestLabel: "Best", difficulties: true,
        help: {"emoji":"&#129513;","goal":"Fill whole lines with blocks to clear them and score.","steps":["Blocks fall from the top. Move them with the &#8592; and &#8594; buttons.","Tap &#8635; to spin the block so it fits.","Fill a whole row with no gaps to clear it and score.","Tap &#9196; to drop fast. Don't let blocks stack to the top!"]},
        mount: function (host, api) {
            var COLS = 10, ROWS = 20;
            var COLORS = [null, "#22D3EE", "#3B82F6", "#F59E0B", "#FBBF24", "#34D399", "#A78BFA", "#F87171"];
            var SHAPES = [
                [],
                [[1,1,1,1]],                         // I
                [[2,0,0],[2,2,2]],                   // J
                [[0,0,3],[3,3,3]],                   // L
                [[4,4],[4,4]],                       // O
                [[0,5,5],[5,5,0]],                   // S
                [[0,6,0],[6,6,6]],                   // T
                [[7,7,0],[0,7,7]]                    // Z
            ];
            var grid = [], piece, score = 0, lines = 0, level = 1, over = false, paused = false;
            var baseDrop = { easy: 950, medium: 700, hard: 480 }[api.difficulty] || 700;
            var dropMs = baseDrop, acc = 0, last = 0, raf = null;

            for (var r = 0; r < ROWS; r++) { grid.push(new Array(COLS).fill(0)); }

            var sp = api.space();
            var cell = Math.max(12, Math.floor(Math.min(sp.w / COLS, sp.h / ROWS, 34)));
            var W = cell * COLS, H = cell * ROWS;

            var best = api.getBest();
            var sScore = stat("Score", "0"), sLines = stat("Lines", "0"), sLevel = stat("Level", "1");
            var topline = api.el("div", { class: "game-topline" }, [sScore.box, sLines.box, sLevel.box]);
            var canvas = api.el("canvas", { width: W, height: H });
            var wrap = api.el("div", { class: "board-wrap" }, canvas);
            var ctx = canvas.getContext("2d");

            var pad = api.el("div", { class: "btn-row" }, [
                mk("&#8592;", function () { move(-1); }),
                mk("&#8635;", function () { rotate(); }),
                mk("&#8594;", function () { move(1); }),
                mk("&#8595;", function () { soft(); }),
                mk("&#9193;", function () { hard(); })
            ]);
            var ctrl = api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn ghost", text: "Pause", onclick: togglePause }),
                api.el("button", { class: "btn", text: "Restart", onclick: reset })
            ]);
            host.appendChild(topline);
            host.appendChild(wrap);
            host.appendChild(pad);
            host.appendChild(ctrl);

            function mk(label, fn) { return api.el("button", { class: "btn", html: label, onclick: function () { fn(); api.haptic(8); } }); }
            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function rand() { return Math.floor(Math.random() * 7) + 1; }
            function spawn() {
                var t = rand();
                piece = { t: t, m: SHAPES[t].map(function (r) { return r.slice(); }), x: (COLS >> 1) - 1, y: 0 };
                if (collide(piece.x, piece.y, piece.m)) { gameOver(); }
            }
            function collide(x, y, m) {
                for (var i = 0; i < m.length; i++) for (var j = 0; j < m[i].length; j++) {
                    if (!m[i][j]) continue;
                    var nx = x + j, ny = y + i;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
                    if (ny >= 0 && grid[ny][nx]) return true;
                }
                return false;
            }
            function merge() {
                piece.m.forEach(function (row, i) { row.forEach(function (v, j) { if (v) { var ny = piece.y + i; if (ny >= 0) grid[ny][piece.x + j] = v; } }); });
            }
            function clearLines() {
                var cleared = 0;
                for (var r = ROWS - 1; r >= 0; r--) {
                    if (grid[r].every(function (v) { return v; })) {
                        grid.splice(r, 1); grid.unshift(new Array(COLS).fill(0)); cleared++; r++;
                    }
                }
                if (cleared) {
                    lines += cleared;
                    score += [0, 40, 100, 300, 1200][cleared] * level;
                    level = 1 + Math.floor(lines / 10);
                    dropMs = Math.max(120, baseDrop - (level - 1) * 55);
                    api.sound.good(); api.haptic(cleared >= 4 ? 40 : 18);
                    update();
                }
            }
            function lock() { merge(); clearLines(); spawn(); }
            function move(d) { if (over || paused) return; if (!collide(piece.x + d, piece.y, piece.m)) { piece.x += d; api.sound.move(); draw(); } }
            function rotate() {
                if (over || paused) return;
                var m = piece.m, N = m.length, M = m[0].length, nm = [];
                for (var j = 0; j < M; j++) { nm.push([]); for (var i = N - 1; i >= 0; i--) nm[j].push(m[i][j]); }
                var kicks = [0, -1, 1, -2, 2];
                for (var k = 0; k < kicks.length; k++) { if (!collide(piece.x + kicks[k], piece.y, nm)) { piece.x += kicks[k]; piece.m = nm; api.sound.tick(); draw(); return; } }
            }
            function soft() { if (over || paused) return; if (!collide(piece.x, piece.y + 1, piece.m)) { piece.y++; score += 1; update(); } else { lock(); } draw(); }
            function hard() { if (over || paused) return; while (!collide(piece.x, piece.y + 1, piece.m)) { piece.y++; score += 2; } lock(); api.haptic(20); update(); draw(); }

            function tick(ts) {
                raf = requestAnimationFrame(tick);
                if (over || paused) { last = ts; return; }
                if (!last) last = ts;
                acc += ts - last; last = ts;
                if (acc >= dropMs) {
                    acc = 0;
                    if (!collide(piece.x, piece.y + 1, piece.m)) piece.y++;
                    else lock();
                    draw();
                }
            }
            function drawCell(x, y, c) {
                ctx.fillStyle = c;
                ctx.fillRect(x * cell, y * cell, cell, cell);
                ctx.fillStyle = "rgba(255,255,255,0.18)";
                ctx.fillRect(x * cell, y * cell, cell, cell * 0.28);
                ctx.strokeStyle = "rgba(0,0,0,0.35)";
                ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
            }
            function draw() {
                ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-2") || "#141B33";
                ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = "rgba(255,255,255,0.04)";
                for (var x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, H); ctx.stroke(); }
                for (var y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(W, y * cell); ctx.stroke(); }
                for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (grid[r][c]) drawCell(c, r, COLORS[grid[r][c]]);
                if (piece) piece.m.forEach(function (row, i) { row.forEach(function (v, j) { if (v && piece.y + i >= 0) drawCell(piece.x + j, piece.y + i, COLORS[v]); }); });
            }
            function update() {
                sScore.val.textContent = score; sLines.val.textContent = lines; sLevel.val.textContent = level;
            }
            function gameOver() {
                over = true;
                var record = api.setBest(score);
                api.sound.lose();
                api.overlay({
                    emoji: "&#128128;", title: "Game Over",
                    sub: "Score <b>" + score + "</b> &middot; " + lines + " lines" + (record ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ]
                });
            }
            function togglePause() { if (over) return; paused = !paused; api.toast(paused ? "Paused" : "Resumed"); }
            function reset() {
                for (var r = 0; r < ROWS; r++) grid[r].fill(0);
                score = 0; lines = 0; level = 1; over = false; paused = false; dropMs = baseDrop; acc = 0; last = 0;
                update(); spawn(); draw();
            }

            // Swipe controls on canvas
            var sx = 0, sy = 0, st = 0, moved = false;
            function ts_(e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); moved = false; }
            function tm_(e) {
                var t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
                if (Math.abs(dx) > cell && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); sx = t.clientX; moved = true; }
                else if (dy > cell) { soft(); sy = t.clientY; moved = true; }
                e.preventDefault();
            }
            function te_(e) { if (!moved && Date.now() - st < 250) rotate(); }
            canvas.addEventListener("touchstart", ts_, { passive: true });
            canvas.addEventListener("touchmove", tm_, { passive: false });
            canvas.addEventListener("touchend", te_);

            function key(e) {
                if (e.key === "ArrowLeft") move(-1);
                else if (e.key === "ArrowRight") move(1);
                else if (e.key === "ArrowUp") rotate();
                else if (e.key === "ArrowDown") soft();
                else if (e.key === " ") hard();
            }
            window.addEventListener("keydown", key);

            reset();
            raf = requestAnimationFrame(tick);

            return function () {
                cancelAnimationFrame(raf);
                window.removeEventListener("keydown", key);
            };
        }
    });
})();
