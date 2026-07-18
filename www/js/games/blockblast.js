/* Block Blast — place pieces, clear full rows & columns */
(function () {
    window.BrainGames.register({
        id: "blockblast", name: "Block Blast", icon: "&#129000;",
        gradient: "linear-gradient(135deg,#F97316,#EF4444)",
        best: "high",
        mount: function (host, api) {
            var N = 8;
            var COLORS = ["#22D3EE", "#A78BFA", "#F59E0B", "#34D399", "#F472B6", "#60A5FA", "#FBBF24"];
            var PIECES = [
                [[1]], [[1,1]], [[1],[1]], [[1,1,1]], [[1],[1],[1]],
                [[1,1],[1,1]], [[1,1,1],[1,1,1]],
                [[1,0],[1,0],[1,1]], [[0,1],[0,1],[1,1]], [[1,1],[0,1],[0,1]], [[1,1],[1,0],[1,0]],
                [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
                [[1,1,1],[0,1,0]], [[1,1,1,1]], [[1],[1],[1],[1]], [[1,1,1],[1,0,0]]
            ];
            var grid = [], score = 0, tray = [], selected = -1;

            for (var i = 0; i < N; i++) grid.push(new Array(N).fill(0));

            var sScore = stat("Score", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));

            var cellPx = Math.floor(api.space().board / N);
            var boardEl = api.el("div", { class: "cells", style: "grid-template-columns:repeat(" + N + "," + cellPx + "px)" });
            var wrap = api.el("div", { class: "board-wrap" }, boardEl);
            host.appendChild(wrap);

            var trayEl = api.el("div", { class: "btn-row", style: "align-items:flex-start;min-height:80px;margin-top:6px" });
            host.appendChild(trayEl);
            host.appendChild(api.el("div", { class: "small-note", text: "Tap a piece, then tap the board to drop it." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            var cellEls = [];
            function buildBoard() {
                boardEl.innerHTML = ""; cellEls = [];
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                    (function (r, c) {
                        var d = api.el("div", { style: "width:" + cellPx + "px;height:" + cellPx + "px;border-radius:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.05)" });
                        d.addEventListener("click", function () { tryPlace(r, c); });
                        cellEls.push(d); boardEl.appendChild(d);
                    })(r, c);
                }
            }
            function paint() {
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                    var v = grid[r][c], d = cellEls[r * N + c];
                    if (v) { d.style.background = COLORS[v - 1]; d.style.boxShadow = "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.25)"; }
                    else { d.style.background = "rgba(255,255,255,0.05)"; d.style.boxShadow = "none"; }
                }
            }
            function newTray() {
                tray = []; for (var i = 0; i < 3; i++) tray.push(randPiece()); selected = -1; renderTray();
            }
            function randPiece() {
                var m = PIECES[Math.floor(Math.random() * PIECES.length)];
                return { m: m, color: Math.floor(Math.random() * COLORS.length) + 1 };
            }
            function renderTray() {
                trayEl.innerHTML = "";
                tray.forEach(function (p, idx) {
                    if (!p) { trayEl.appendChild(api.el("div", { style: "width:70px" })); return; }
                    var mini = 15;
                    var box = api.el("div", { style: "padding:8px;border-radius:12px;border:2px solid " + (selected === idx ? "var(--accent)" : "var(--line)") + ";background:var(--card-2)" });
                    var g = api.el("div", { style: "display:grid;gap:2px;grid-template-columns:repeat(" + p.m[0].length + "," + mini + "px)" });
                    p.m.forEach(function (row) { row.forEach(function (v) {
                        g.appendChild(api.el("div", { style: "width:" + mini + "px;height:" + mini + "px;border-radius:3px;background:" + (v ? COLORS[p.color - 1] : "transparent") }));
                    }); });
                    box.appendChild(g);
                    box.addEventListener("click", function () { selected = idx; api.sound.click(); renderTray(); });
                    trayEl.appendChild(box);
                });
            }
            function canPlaceAt(p, r, c) {
                for (var i = 0; i < p.m.length; i++) for (var j = 0; j < p.m[i].length; j++) {
                    if (!p.m[i][j]) continue;
                    var nr = r + i, nc = c + j;
                    if (nr >= N || nc >= N || grid[nr][nc]) return false;
                }
                return true;
            }
            function anyPlace(p) {
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (canPlaceAt(p, r, c)) return true;
                return false;
            }
            function tryPlace(r, c) {
                if (selected < 0 || !tray[selected]) { api.toast("Pick a piece first"); return; }
                var p = tray[selected];
                if (!canPlaceAt(p, r, c)) { api.sound.bad(); api.haptic(20); return; }
                var placed = 0;
                for (var i = 0; i < p.m.length; i++) for (var j = 0; j < p.m[i].length; j++) if (p.m[i][j]) { grid[r + i][c + j] = p.color; placed++; }
                score += placed; api.sound.pop(); api.haptic(10);
                tray[selected] = null; selected = -1;
                clearLines();
                paint(); renderTray(); update();
                if (tray.every(function (x) { return !x; })) newTray();
                checkOver();
            }
            function clearLines() {
                var fullRows = [], fullCols = [], r, c;
                for (r = 0; r < N; r++) if (grid[r].every(function (v) { return v; })) fullRows.push(r);
                for (c = 0; c < N; c++) { var full = true; for (r = 0; r < N; r++) if (!grid[r][c]) { full = false; break; } if (full) fullCols.push(c); }
                var total = fullRows.length + fullCols.length;
                if (!total) return;
                fullRows.forEach(function (r) { for (var c = 0; c < N; c++) grid[r][c] = 0; });
                fullCols.forEach(function (c) { for (var r = 0; r < N; r++) grid[r][c] = 0; });
                score += total * 10 * total; // combo bonus
                api.sound.good(); api.haptic(total > 1 ? 45 : 22);
                if (total > 1) api.toast("Combo x" + total + "!");
            }
            function checkOver() {
                var live = tray.filter(function (x) { return x; });
                if (!live.length) return;
                var ok = live.some(function (p) { return anyPlace(p); });
                if (!ok) gameOver();
            }
            function gameOver() {
                var record = api.setBest(score);
                api.sound.lose();
                api.overlay({ emoji: "&#129000;", title: "No moves left",
                    sub: "Score <b>" + score + "</b>" + (record ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] });
            }
            function update() { sScore.val.textContent = score; sBest.val.textContent = api.getBest() || 0; }
            function reset() {
                for (var r = 0; r < N; r++) grid[r].fill(0);
                score = 0; buildBoard(); paint(); newTray(); update();
            }

            buildBoard(); reset();
            return function () {};
        }
    });
})();
