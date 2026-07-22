/* Reversi / Othello vs AI */
(function () {
    window.BrainGames.register({
        id: "reversi", name: "Reversi", icon: "&#9899;",
        gradient: "linear-gradient(135deg,#065F46,#111827)",
        best: "high", bestLabel: "Wins", difficulties: true,
        help: {"emoji":"&#9899;","goal":"Have the most discs when the board fills up.","steps":["You are the black discs.","Tap a glowing square to place a disc.","Trap white discs between two of yours to flip them black.","Whoever has more discs at the end wins."]},
        mount: function (host, api) {
            var N = 8, board, turn, over, wins = api.load("wins", 0), busy;
            var DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            var WEIGHT = [
                [120,-20,20,5,5,20,-20,120],[-20,-40,-5,-5,-5,-5,-40,-20],[20,-5,15,3,3,15,-5,20],[5,-5,3,3,3,3,-5,5],
                [5,-5,3,3,3,3,-5,5],[20,-5,15,3,3,15,-5,20],[-20,-40,-5,-5,-5,-5,-40,-20],[120,-20,20,5,5,20,-20,120]
            ];

            var sYou = stat("You", "2"), sCpu = stat("CPU", "2"), sWins = stat("Wins", wins + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sYou.box, sCpu.box, sWins.box]));
            var size = Math.min(api.space().board, 440), cell = Math.floor(size / N);
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(" + N + "," + cell + "px);gap:2px;background:#0B3D2E;padding:6px;border-radius:10px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var msg = api.el("div", { class: "small-note", text: "You are black. Outflank the AI's discs. Tap a highlighted square." });
            host.appendChild(msg);
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New game", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            var cells = [];
            function build() {
                boardEl.innerHTML = ""; cells = [];
                for (var i = 0; i < N * N; i++) { (function (i) {
                    var d = api.el("div", { style: "width:" + cell + "px;height:" + cell + "px;background:#15803D;border-radius:4px;display:grid;place-items:center;cursor:pointer" });
                    d.addEventListener("click", function () { play(i); });
                    cells.push(d); boardEl.appendChild(d);
                })(i); }
            }
            function flips(b, i, p) {
                if (b[i]) return [];
                var r = i / N | 0, c = i % N, all = [];
                DIRS.forEach(function (d) {
                    var line = [], nr = r + d[0], nc = c + d[1];
                    while (nr >= 0 && nr < N && nc >= 0 && nc < N) { var j = nr * N + nc; if (b[j] === -p) { line.push(j); } else if (b[j] === p) { all = all.concat(line); break; } else break; nr += d[0]; nc += d[1]; }
                });
                return all;
            }
            function legal(b, p) { var m = []; for (var i = 0; i < N * N; i++) if (!b[i] && flips(b, i, p).length) m.push(i); return m; }
            function place(b, i, p) { var f = flips(b, i, p); b[i] = p; f.forEach(function (j) { b[j] = p; }); return f.length; }
            function counts(b) { var y = 0, c = 0; b.forEach(function (v) { if (v === 1) y++; else if (v === -1) c++; }); return { y: y, c: c }; }

            function paint(hints) {
                var cnt = counts(board); sYou.val.textContent = cnt.y; sCpu.val.textContent = cnt.c;
                for (var i = 0; i < N * N; i++) {
                    var d = cells[i]; d.innerHTML = "";
                    if (board[i]) {
                        var disc = api.el("div", { class: "pop", style: "width:78%;height:78%;border-radius:50%;background:" + (board[i] === 1 ? "radial-gradient(circle at 35% 30%,#4B5563,#111)" : "radial-gradient(circle at 35% 30%,#fff,#cbd5e1)") });
                        d.appendChild(disc);
                    } else if (hints && hints.indexOf(i) > -1) {
                        d.appendChild(api.el("div", { style: "width:26%;height:26%;border-radius:50%;background:rgba(34,211,238,0.7)" }));
                    }
                }
            }
            function play(i) {
                if (over || busy || turn !== 1) return;
                if (!flips(board, i, 1).length) return;
                place(board, i, 1); api.sound.click(); api.haptic(8); turn = -1; paint();
                next();
            }
            function next() {
                if (endCheck()) return;
                if (turn === -1) {
                    if (!legal(board, -1).length) { turn = 1; msg.textContent = "AI has no move — your turn."; afterPaint(); return; }
                    busy = true; msg.textContent = "AI thinking…";
                    setTimeout(function () { var mv = ai(); if (mv != null) place(board, mv, -1); api.sound.tick(); turn = 1; busy = false; paint(legal(board, 1)); if (endCheck()) return;
                        if (!legal(board, 1).length) { msg.textContent = "No move for you — AI continues."; turn = -1; next(); } else msg.textContent = "Your turn."; }, 260);
                } else { afterPaint(); }
            }
            function afterPaint() { var l = legal(board, 1); paint(l); if (turn === 1 && !l.length) { turn = -1; next(); } }
            function ai() {
                var moves = legal(board, -1); if (!moves.length) return null;
                // Easy: play a random legal move most of the time.
                if (api.difficulty === "easy" && Math.random() < 0.6) return moves[Math.floor(Math.random() * moves.length)];
                var depth = api.difficulty === "hard" ? 4 : api.difficulty === "easy" ? 1 : 2;
                var best = -Infinity, bm = moves[0];
                moves.forEach(function (m) {
                    var b2 = board.slice(); place(b2, m, -1);
                    var score = -negamax(b2, depth, 1, -Infinity, Infinity);
                    if (score > best) { best = score; bm = m; }
                });
                return bm;
            }
            function heur(b, p) { var s = 0; for (var i = 0; i < N * N; i++) if (b[i]) s += b[i] === p ? WEIGHT[i/N|0][i%N] : -WEIGHT[i/N|0][i%N]; return s; }
            function negamax(b, depth, p, alpha, beta) {
                if (depth === 0) return heur(b, p);
                var moves = legal(b, p);
                if (!moves.length) { if (!legal(b, -p).length) { var c = counts(b); var diff = (p === 1 ? c.y - c.c : c.c - c.y); return diff * 1000; } return -negamax(b, depth, -p, -beta, -alpha); }
                var best = -Infinity;
                for (var i = 0; i < moves.length; i++) { var b2 = b.slice(); place(b2, moves[i], p); best = Math.max(best, -negamax(b2, depth - 1, -p, -beta, -alpha)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
                return best;
            }
            function endCheck() {
                if (legal(board, 1).length || legal(board, -1).length) return false;
                over = true; var c = counts(board);
                if (c.y > c.c) { wins++; api.save("wins", wins); sWins.val.textContent = wins; api.setBest(wins); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "You win!", sub: c.y + " – " + c.c, buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else if (c.c > c.y) { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "AI wins", sub: c.y + " – " + c.c, buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else { api.sound.pop(); api.overlay({ emoji: "&#129309;", title: "Draw", sub: c.y + " – " + c.c, buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                return true;
            }
            function reset() {
                board = new Array(N * N).fill(0); over = false; busy = false; turn = 1;
                board[27] = 1; board[28] = -1; board[35] = -1; board[36] = 1;
                msg.textContent = "You are black. Tap a highlighted square.";
                build(); paint(legal(board, 1));
            }
            reset();
            return function () {};
        }
    });
})();
