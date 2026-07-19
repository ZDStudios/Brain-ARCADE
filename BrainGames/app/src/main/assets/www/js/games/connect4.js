/* Connect Four vs AI */
(function () {
    window.BrainGames.register({
        id: "c4", name: "Connect Four", icon: "&#128309;",
        gradient: "linear-gradient(135deg,#DC2626,#F59E0B)",
        best: "high", bestLabel: "Wins",
        help: {"emoji":"&#128309;","goal":"Connect four of your discs in a line.","steps":["You are the red discs.","Tap a column to drop your disc to the bottom.","Line up four across, up, or diagonally.","Stop the computer's yellow discs from doing it first!"]},
        mount: function (host, api) {
            var COLS = 7, ROWS = 6, board, lock, wins = api.load("wins", 0);

            var sScore = stat("Wins", wins + ""), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var sp = api.space();
            var cellPx = Math.floor(Math.min(sp.w / COLS, sp.h / ROWS, 54));
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(" + COLS + ",1fr);gap:5px;background:#1E3A8A;padding:8px;border-radius:12px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            host.appendChild(api.el("div", { class: "small-note", text: "You are red. Drop into a column to connect four." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New round", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            var cellEls = [];
            function build() {
                boardEl.innerHTML = ""; cellEls = [];
                for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { (function (r, c) {
                    var d = api.el("div", { style: discStyle(0) });
                    d.addEventListener("click", function () { drop(c); });
                    cellEls[r * COLS + c] = d; boardEl.appendChild(d);
                })(r, c); }
            }
            function discStyle(v) {
                var col = v === 1 ? "radial-gradient(circle at 35% 30%,#FCA5A5,#DC2626)" : v === 2 ? "radial-gradient(circle at 35% 30%,#FDE68A,#F59E0B)" : "var(--bg)";
                return "width:" + cellPx + "px;height:" + cellPx + "px;border-radius:50%;background:" + col + ";cursor:pointer";
            }
            function paint(hl) {
                for (var i = 0; i < ROWS * COLS; i++) { cellEls[i].style.cssText = discStyle(board[i]); if (hl && hl.indexOf(i) > -1) cellEls[i].style.boxShadow = "0 0 0 3px #34D399, 0 0 18px #34D399"; }
            }
            function dropRow(bb, c) { for (var r = ROWS - 1; r >= 0; r--) if (!bb[r * COLS + c]) return r; return -1; }
            function drop(c) {
                if (lock) return; var r = dropRow(board, c); if (r < 0) return;
                board[r * COLS + c] = 1; api.sound.click(); api.haptic(8); paint();
                var w = winLine(board, 1); if (w) return end(1, w);
                if (full(board)) return end(0);
                lock = true;
                setTimeout(function () {
                    var c2 = aiMove(); var r2 = dropRow(board, c2); board[r2 * COLS + c2] = 2; api.sound.tick(); paint();
                    var w2 = winLine(board, 2); if (w2) return end(2, w2);
                    if (full(board)) return end(0);
                    lock = false;
                }, 300);
            }
            function full(bb) { for (var c = 0; c < COLS; c++) if (dropRow(bb, c) >= 0) return false; return true; }
            function winLine(bb, p) {
                var dirs = [[0,1],[1,0],[1,1],[1,-1]];
                for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
                    if (bb[r * COLS + c] !== p) continue;
                    for (var d = 0; d < 4; d++) {
                        var line = [r * COLS + c], ok = true;
                        for (var k = 1; k < 4; k++) { var nr = r + dirs[d][0] * k, nc = c + dirs[d][1] * k; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || bb[nr * COLS + nc] !== p) { ok = false; break; } line.push(nr * COLS + nc); }
                        if (ok) return line;
                    }
                }
                return null;
            }
            function aiMove() {
                // win now?
                for (var c = 0; c < COLS; c++) { var r = dropRow(board, c); if (r < 0) continue; board[r * COLS + c] = 2; if (winLine(board, 2)) { board[r * COLS + c] = 0; return c; } board[r * COLS + c] = 0; }
                // block?
                for (var c2 = 0; c2 < COLS; c2++) { var r2 = dropRow(board, c2); if (r2 < 0) continue; board[r2 * COLS + c2] = 1; if (winLine(board, 1)) { board[r2 * COLS + c2] = 0; return c2; } board[r2 * COLS + c2] = 0; }
                // avoid giving opponent a win, prefer center
                var order = [3,2,4,1,5,0,6], safe = [];
                for (var i = 0; i < order.length; i++) { var c3 = order[i], r3 = dropRow(board, c3); if (r3 < 0) continue;
                    board[r3 * COLS + c3] = 2; var ar = dropRow(board, c3); var bad = false;
                    if (ar >= 0) { board[ar * COLS + c3] = 1; if (winLine(board, 1)) bad = true; board[ar * COLS + c3] = 0; }
                    board[r3 * COLS + c3] = 0; if (!bad) safe.push(c3);
                }
                var pool = safe.length ? safe : order.filter(function (c) { return dropRow(board, c) >= 0; });
                return pool[0];
            }
            function end(p, line) {
                lock = true; paint(line);
                if (p === 1) { wins++; api.save("wins", wins); sScore.val.textContent = wins; api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127881;", title: "You win!", sub: "Four in a row!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else if (p === 2) { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "AI wins", sub: "Watch those diagonals!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else { api.sound.pop(); api.overlay({ emoji: "&#129309;", title: "Draw", sub: "Board's full!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
            }
            function reset() { board = new Array(ROWS * COLS).fill(0); lock = false; build(); paint(); }
            reset();
            return function () {};
        }
    });
})();
