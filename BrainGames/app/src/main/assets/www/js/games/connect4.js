/* Connect Four vs AI */
(function () {
    window.BrainGames.register({
        id: "c4", name: "Connect Four", icon: "&#128309;",
        gradient: "linear-gradient(135deg,#DC2626,#F59E0B)",
        best: "high", bestLabel: "Wins", difficulties: true, twoPlayer: true, resumable: true,
        help: {"emoji":"&#128309;","goal":"Connect four of your discs in a line.","steps":["You are the red discs.","Tap a column to drop your disc to the bottom.","Line up four across, up, or diagonally.","Stop the computer's yellow discs from doing it first!"]},
        mount: function (host, api) {
            var TWO = api.twoPlayer;
            var COLS = 7, ROWS = 6, board, lock, wins = api.load("wins", 0), turn = 1, tally = [0, 0, 0];

            var sScore = stat(TWO ? "Red" : "Wins", TWO ? "0" : wins + ""), sBest = stat(TWO ? "Yellow" : "Best", TWO ? "0" : (api.getBest() || 0) + "");
            var sTurn = stat("Turn", "Red");
            host.appendChild(api.el("div", { class: "game-topline" }, TWO ? [sScore.box, sTurn.box, sBest.box] : [sScore.box, sBest.box]));
            var sp = api.space();
            var cellPx = Math.floor(Math.min((sp.w - 40) / COLS, (sp.h - 30) / ROWS, sp.isTablet ? 76 : 54));
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(" + COLS + ",1fr);gap:5px;background:#1E3A8A;padding:8px;border-radius:12px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var note = api.el("div", { class: "small-note", text: TWO ? "Red goes first. Take turns dropping discs!" : "You are red. Drop into a column to connect four." });
            host.appendChild(note);
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
            function saveNow() {
                if (!board) return;
                // Nothing to come back to on an empty board.
                if (board.every(function (v) { return !v; })) { api.clearState(); return; }
                api.saveState({ board: board.slice(), turn: turn });
            }
            function paint(hl) {
                for (var i = 0; i < ROWS * COLS; i++) { cellEls[i].style.cssText = discStyle(board[i]); if (hl && hl.indexOf(i) > -1) cellEls[i].style.boxShadow = "0 0 0 3px #34D399, 0 0 18px #34D399"; }
                if (!hl) saveNow();          // a highlight means the game just ended
            }
            function dropRow(bb, c) { for (var r = ROWS - 1; r >= 0; r--) if (!bb[r * COLS + c]) return r; return -1; }
            function showTurn() { sTurn.val.textContent = turn === 1 ? "Red" : "Yellow"; sTurn.val.style.color = turn === 1 ? "#F87171" : "#FBBF24"; note.textContent = (turn === 1 ? "Red" : "Yellow") + "'s turn"; }
            function drop(c) {
                if (TWO) {
                    if (lock) return; var rr = dropRow(board, c); if (rr < 0) return;
                    board[rr * COLS + c] = turn; api.sound.click(); api.haptic(8);
                    var wl = winLine(board, turn); if (wl) { paint(); return end(turn, wl); }
                    if (full(board)) { paint(); return end(0); }
                    turn = turn === 1 ? 2 : 1; showTurn(); paint();
                    return;
                }
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
                var valid = []; for (var vc = 0; vc < COLS; vc++) if (dropRow(board, vc) >= 0) valid.push(vc);
                // Easy: mostly random; still takes an immediate win.
                if (api.difficulty === "easy") {
                    for (var w = 0; w < COLS; w++) { var wr = dropRow(board, w); if (wr < 0) continue; board[wr * COLS + w] = 2; if (winLine(board, 2)) { board[wr * COLS + w] = 0; return w; } board[wr * COLS + w] = 0; }
                    if (Math.random() < 0.7) return valid[Math.floor(Math.random() * valid.length)];
                }
                // win now?
                for (var c = 0; c < COLS; c++) { var r = dropRow(board, c); if (r < 0) continue; board[r * COLS + c] = 2; if (winLine(board, 2)) { board[r * COLS + c] = 0; return c; } board[r * COLS + c] = 0; }
                // block? (skip blocking sometimes on medium for fairness; always on hard)
                if (api.difficulty === "hard" || Math.random() < 0.85)
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
                api.clearState();
                if (TWO) {
                    if (p) { tally[p]++; sScore.val.textContent = tally[1]; sBest.val.textContent = tally[2]; api.sound.win(); api.haptic(30); } else api.sound.pop();
                    api.overlay({ emoji: p ? "&#127881;" : "&#129309;", title: p === 1 ? "Red wins!" : p === 2 ? "Yellow wins!" : "Draw",
                        sub: p ? "Four in a row! Red " + tally[1] + " &ndash; " + tally[2] + " Yellow" : "Board's full!",
                        buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] });
                    return;
                }
                if (p === 1) { wins++; api.save("wins", wins); sScore.val.textContent = wins; api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127881;", title: "You win!", sub: "Four in a row!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else if (p === 2) { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "AI wins", sub: "Watch those diagonals!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else { api.sound.pop(); api.overlay({ emoji: "&#129309;", title: "Draw", sub: "Board's full!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
            }
            function reset(rs) {
                if (rs && rs.board && rs.board.length === ROWS * COLS) {
                    board = rs.board.slice(); lock = false; turn = TWO && rs.turn ? rs.turn : 1; build(); paint(); if (TWO) showTurn();
                    return;
                }
                board = new Array(ROWS * COLS).fill(0); lock = false; turn = 1; build(); paint(); api.clearState(); if (TWO) showTurn();
            }
            reset(api.resumeState);
            return function () {};
        }
    });
})();
