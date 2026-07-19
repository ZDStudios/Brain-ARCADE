/* 2048 */
(function () {
    window.BrainGames.register({
        id: "g2048", name: "2048", icon: "&#127922;",
        gradient: "linear-gradient(135deg,#F59E0B,#FBBF24)",
        best: "high",
        help: {"emoji":"&#127922;","goal":"Join tiles to reach the 2048 tile.","steps":["Swipe up, down, left or right to slide every tile.","Two tiles with the same number join into a bigger one.","Every swipe adds a new tile to the board.","Keep joining numbers to build 2048!"]},
        mount: function (host, api) {
            var N = 4, grid = [], score = 0, won = false, dead = false;
            var TCOL = { 2:"#EEE4DA",4:"#EDE0C8",8:"#F2B179",16:"#F59563",32:"#F67C5F",64:"#F65E3B",128:"#EDCF72",256:"#EDCC61",512:"#EDC850",1024:"#EDC53F",2048:"#EDC22E" };

            var sScore = stat("Score", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var size = api.space().board;
            var gap = 10, cellPx = Math.floor((size - gap * (N + 1)) / N);
            var boardEl = api.el("div", { style: "position:relative;width:" + (cellPx * N + gap * (N + 1)) + "px;height:" + (cellPx * N + gap * (N + 1)) + "px;background:rgba(255,255,255,0.06);border-radius:12px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            host.appendChild(api.el("div", { class: "small-note", text: "Swipe to merge tiles. Reach 2048!" }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function pos(r, c) { return gap + c * (cellPx + gap); }

            // background cells
            for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                boardEl.appendChild(api.el("div", { style: "position:absolute;left:" + pos(r,c) + "px;top:" + pos(0,r) + "px;width:" + cellPx + "px;height:" + cellPx + "px;border-radius:8px;background:rgba(255,255,255,0.04)" }));
            }
            // recompute top using row index
            function draw() {
                boardEl.querySelectorAll(".tile").forEach(function (t) { t.remove(); });
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                    var v = grid[r][c]; if (!v) continue;
                    var col = TCOL[v] || "#3C3A32";
                    var fs = v < 100 ? 26 : v < 1000 ? 22 : 18;
                    var tcolor = v <= 4 ? "#4b4640" : "#fff";
                    boardEl.appendChild(api.el("div", { class: "tile pop", style: "position:absolute;left:" + (gap + c * (cellPx + gap)) + "px;top:" + (gap + r * (cellPx + gap)) + "px;width:" + cellPx + "px;height:" + cellPx + "px;border-radius:8px;display:grid;place-items:center;font-weight:800;font-size:" + fs + "px;color:" + tcolor + ";background:" + col, text: v + "" }));
                }
            }
            function empty() { var a = []; for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!grid[r][c]) a.push([r, c]); return a; }
            function addTile() { var e = empty(); if (!e.length) return; var p = e[Math.floor(Math.random() * e.length)]; grid[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4; }

            function slide(row) {
                var arr = row.filter(function (v) { return v; });
                for (var i = 0; i < arr.length - 1; i++) { if (arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; if (arr[i] === 2048) won = true; arr[i + 1] = 0; } }
                arr = arr.filter(function (v) { return v; });
                while (arr.length < N) arr.push(0);
                return arr;
            }
            function rotate(g) { var n = []; for (var r = 0; r < N; r++) { n.push([]); for (var c = 0; c < N; c++) n[r].push(g[N - 1 - c][r]); } return n; }
            function moveLeft() { var moved = false; for (var r = 0; r < N; r++) { var ns = slide(grid[r]); if (ns.join() !== grid[r].join()) moved = true; grid[r] = ns; } return moved; }
            function move(dir) {
                if (dead) return;
                for (var i = 0; i < dir; i++) grid = rotate(grid);
                var moved = moveLeft();
                for (var j = 0; j < (4 - dir) % 4; j++) grid = rotate(grid);
                if (moved) { addTile(); api.sound.move(); api.haptic(8); draw(); update(); checkEnd(); }
            }
            function movesLeft() {
                if (empty().length) return true;
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                    if (c < N - 1 && grid[r][c] === grid[r][c + 1]) return true;
                    if (r < N - 1 && grid[r][c] === grid[r + 1][c]) return true;
                }
                return false;
            }
            function checkEnd() {
                if (won) { won = false; api.sound.win(); api.toast("You made 2048! Keep going &#128293;"); }
                if (!movesLeft()) { dead = true; var rec = api.setBest(score); api.sound.lose();
                    api.overlay({ emoji: "&#128533;", title: "Game Over", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                        buttons: [ { label: "Home", onClick: api.exit }, { label: "Retry", primary: true, onClick: reset } ] }); }
            }
            function update() { sScore.val.textContent = score; sBest.val.textContent = api.getBest() || 0; }
            function reset() { grid = []; for (var r = 0; r < N; r++) grid.push(new Array(N).fill(0)); score = 0; dead = false; won = false; addTile(); addTile(); draw(); update(); }

            // swipe
            var sx, sy;
            boardEl.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
            boardEl.addEventListener("touchend", function (e) {
                var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
                if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
                if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 2 : 0); else move(dy > 0 ? 3 : 1);
            });
            function key(e) { var m = { ArrowLeft:0, ArrowUp:1, ArrowRight:2, ArrowDown:3 }; if (e.key in m) { e.preventDefault(); move(m[e.key]); } }
            window.addEventListener("keydown", key);

            reset();
            return function () { window.removeEventListener("keydown", key); };
        }
    });
})();
