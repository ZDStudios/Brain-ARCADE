/* Chess vs AI (alpha-beta) — you play White */
(function () {
    window.BrainGames.register({
        id: "chess", name: "Chess", icon: "&#9822;",
        gradient: "linear-gradient(135deg,#1F2937,#4B5563)",
        best: "high", bestLabel: "Wins",
        mount: function (host, api) {
            var GLYPH = { P:"♙", N:"♘", B:"♗", R:"♖", Q:"♕", K:"♔",
                          p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" };
            var VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };
            var PST = { // simple pawn/knight/king tables (white perspective)
                p:[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
                n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50]
            };
            var board, turn, sel, legalCache, over, wins = api.load("wins", 0);
            var castling, epTarget, aiThinking;

            var sScore = stat("Wins", wins + ""), sTurn = stat("Turn", "White"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sTurn.box, sBest.box]));
            var sz = api.space().board;
            var cell = Math.floor(Math.min(sz, 440) / 8);
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(8," + cell + "px);border-radius:10px;overflow:hidden;box-shadow:var(--shadow)" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "padding:8px" }, boardEl));
            var msg = api.el("div", { class: "small-note", text: "Tap a piece, then tap where to move. You are White." });
            host.appendChild(msg);
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New game", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function isW(p) { return p && p === p.toUpperCase(); }
            function isB(p) { return p && p === p.toLowerCase(); }
            function clone(b) { return b.slice(); }

            var cells = [];
            function build() {
                boardEl.innerHTML = ""; cells = [];
                for (var i = 0; i < 64; i++) {
                    (function (i) {
                        var r = i >> 3, c = i & 7, dark = (r + c) % 2 === 1;
                        var d = api.el("div", { style: sqStyle(dark) });
                        d.addEventListener("click", function () { onSquare(i); });
                        cells.push(d); boardEl.appendChild(d);
                    })(i);
                }
            }
            function sqStyle(dark) {
                return "width:" + cell + "px;height:" + cell + "px;display:grid;place-items:center;font-size:" + Math.floor(cell * 0.74) + "px;line-height:1;cursor:pointer;background:" + (dark ? "#6B7280" : "#E5E7EB") + ";position:relative";
            }
            function paint() {
                for (var i = 0; i < 64; i++) {
                    var p = board[i], d = cells[i];
                    d.textContent = p ? GLYPH[p] : "";
                    d.style.color = isW(p) ? "#fff" : "#111";
                    d.style.textShadow = isW(p) ? "0 1px 2px rgba(0,0,0,0.6)" : "none";
                    d.style.boxShadow = "none";
                    d.style.outline = "none";
                }
                if (sel != null) {
                    cells[sel].style.boxShadow = "inset 0 0 0 4px #22D3EE";
                    legalCache.filter(function (m) { return m.from === sel; }).forEach(function (m) {
                        var t = cells[m.to];
                        t.style.boxShadow = board[m.to] ? "inset 0 0 0 4px #F87171" : "inset 0 0 0 4px rgba(52,211,153,0.9)";
                    });
                }
            }

            function genMoves(b, white, cast, ep, onlyCaptures) {
                var moves = [];
                for (var i = 0; i < 64; i++) {
                    var p = b[i]; if (!p) continue;
                    if (white !== isW(p)) continue;
                    var r = i >> 3, c = i & 7, t = p.toUpperCase();
                    if (t === "P") pawn(b, i, r, c, white, ep, moves);
                    else if (t === "N") leap(b, i, r, c, white, [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]], moves);
                    else if (t === "K") { leap(b, i, r, c, white, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], moves); if (!onlyCaptures) castle(b, i, white, cast, moves); }
                    else {
                        var dirs = t === "B" ? [[-1,-1],[-1,1],[1,-1],[1,1]] : t === "R" ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
                        slide(b, i, r, c, white, dirs, moves);
                    }
                }
                if (onlyCaptures) return moves.filter(function (m) { return b[m.to] || m.ep; });
                return moves;
            }
            function add(b, from, to, white, moves, flag) {
                var tp = b[to];
                if (tp && isW(tp) === white) return;
                var m = { from: from, to: to };
                if (flag) m[flag] = true;
                // promotion
                var pr = to >> 3;
                if (b[from].toUpperCase() === "P" && (pr === 0 || pr === 7)) m.promo = white ? "Q" : "q";
                moves.push(m);
            }
            function leap(b, i, r, c, white, deltas, moves) {
                deltas.forEach(function (d) { var nr = r + d[0], nc = c + d[1]; if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return; add(b, i, nr * 8 + nc, white, moves); });
            }
            function slide(b, i, r, c, white, dirs, moves) {
                dirs.forEach(function (d) { var nr = r + d[0], nc = c + d[1];
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { var to = nr * 8 + nc; if (b[to]) { if (isW(b[to]) !== white) add(b, i, to, white, moves); break; } add(b, i, to, white, moves); nr += d[0]; nc += d[1]; } });
            }
            function pawn(b, i, r, c, white, ep, moves) {
                var dir = white ? -1 : 1, start = white ? 6 : 1, nr = r + dir;
                if (nr < 0 || nr > 7) return;
                if (!b[nr * 8 + c]) { add(b, i, nr * 8 + c, white, moves); if (r === start && !b[(r + 2 * dir) * 8 + c]) add(b, i, (r + 2 * dir) * 8 + c, white, moves, "dbl"); }
                [c - 1, c + 1].forEach(function (nc) { if (nc < 0 || nc > 7) return; var to = nr * 8 + nc;
                    if (b[to] && isW(b[to]) !== white) add(b, i, to, white, moves);
                    else if (to === ep) add(b, i, to, white, moves, "ep");
                });
            }
            function castle(b, i, white, cast, moves) {
                var rank = white ? 7 : 0, base = rank * 8;
                if (i !== base + 4) return;
                if (attacked(b, base + 4, !white)) return;
                var K = white ? "K" : "k", Q = white ? "Q" : "q";
                if (cast.indexOf(K) > -1 && !b[base + 5] && !b[base + 6] && !attacked(b, base + 5, !white) && !attacked(b, base + 6, !white)) moves.push({ from: i, to: base + 6, castle: "K" });
                if (cast.indexOf(Q) > -1 && !b[base + 3] && !b[base + 2] && !b[base + 1] && !attacked(b, base + 3, !white) && !attacked(b, base + 2, !white)) moves.push({ from: i, to: base + 2, castle: "Q" });
            }
            function attacked(b, sq, byWhite) {
                var moves = genMoves(b, byWhite, "", -1, true);
                for (var k = 0; k < moves.length; k++) if (moves[k].to === sq) return true;
                // pawn attacks handled in genMoves captures except empty target; also check pawn diagonal onto sq
                return false;
            }
            function kingSq(b, white) { var kc = white ? "K" : "k"; for (var i = 0; i < 64; i++) if (b[i] === kc) return i; return -1; }
            function inCheck(b, white) { return attacked(b, kingSq(b, white), !white); }

            function apply(b, m, cast, ep) {
                var nb = clone(b), p = nb[m.from];
                var newEp = -1;
                nb[m.to] = m.promo ? m.promo : p; nb[m.from] = "";
                if (m.ep) { var capSq = (m.from >> 3) * 8 + (m.to & 7); nb[capSq] = ""; }
                if (m.dbl) newEp = (m.from + m.to) / 2;
                if (m.castle) { var rank = (m.from >> 3) * 8; if (m.castle === "K") { nb[rank + 5] = nb[rank + 7]; nb[rank + 7] = ""; } else { nb[rank + 3] = nb[rank + 0]; nb[rank + 0] = ""; } }
                // update castling rights
                var nc = cast;
                if (p === "K") nc = nc.replace("K", "").replace("Q", "");
                if (p === "k") nc = nc.replace("k", "").replace("q", "");
                if (m.from === 63 || m.to === 63) nc = nc.replace("K", "");
                if (m.from === 56 || m.to === 56) nc = nc.replace("Q", "");
                if (m.from === 7 || m.to === 7) nc = nc.replace("k", "");
                if (m.from === 0 || m.to === 0) nc = nc.replace("q", "");
                return { b: nb, cast: nc, ep: newEp };
            }
            function legal(b, white, cast, ep) {
                return genMoves(b, white, cast, ep).filter(function (m) { var s = apply(b, m, cast, ep); return !inCheck(s.b, white); });
            }

            function evaluate(b) {
                var score = 0;
                for (var i = 0; i < 64; i++) { var p = b[i]; if (!p) continue; var t = p.toLowerCase(); var v = VAL[t];
                    var pst = 0; if (PST[t]) { pst = isW(p) ? PST[t][i] : PST[t][63 - i]; }
                    score += isW(p) ? (v + pst) : -(v + pst);
                }
                return score;
            }
            function search(b, depth, alpha, beta, white, cast, ep) {
                if (depth === 0) return evaluate(b);
                var moves = legal(b, white, cast, ep);
                if (!moves.length) return inCheck(b, white) ? (white ? -99999 + (3 - depth) : 99999 - (3 - depth)) : 0;
                if (white) {
                    var best = -Infinity;
                    for (var i = 0; i < moves.length; i++) { var s = apply(b, moves[i], cast, ep); best = Math.max(best, search(s.b, depth - 1, alpha, beta, false, s.cast, s.ep)); alpha = Math.max(alpha, best); if (beta <= alpha) break; }
                    return best;
                } else {
                    var best2 = Infinity;
                    for (var j = 0; j < moves.length; j++) { var s2 = apply(b, moves[j], cast, ep); best2 = Math.min(best2, search(s2.b, depth - 1, alpha, beta, true, s2.cast, s2.ep)); beta = Math.min(beta, best2); if (beta <= alpha) break; }
                    return best2;
                }
            }
            function aiMove() {
                var moves = legal(board, false, castling, epTarget);
                if (!moves.length) return null;
                // shuffle for variety
                for (var i = moves.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = moves[i]; moves[i] = moves[j]; moves[j] = t; }
                var best = Infinity, bm = moves[0];
                for (var k = 0; k < moves.length; k++) { var s = apply(board, moves[k], castling, epTarget); var v = search(s.b, 2, -Infinity, Infinity, true, s.cast, s.ep); if (v < best) { best = v; bm = moves[k]; } }
                return bm;
            }

            function onSquare(i) {
                if (over || aiThinking || turn !== "w") return;
                var p = board[i];
                if (sel == null) { if (p && isW(p)) { sel = i; api.sound.tick(); paint(); } return; }
                var mv = legalCache.filter(function (m) { return m.from === sel && m.to === i; })[0];
                if (mv) { doMove(mv); }
                else if (p && isW(p)) { sel = i; api.sound.tick(); paint(); }
                else { sel = null; paint(); }
            }
            function doMove(m) {
                var s = apply(board, m, castling, epTarget);
                board = s.b; castling = s.cast; epTarget = s.ep;
                sel = null; api.sound.move(); api.haptic(8); turn = "b"; sTurn.val.textContent = "Black";
                paint();
                if (checkEnd("w")) return;
                aiThinking = true; msg.textContent = "Thinking…";
                setTimeout(function () {
                    var am = aiMove();
                    if (am) { var s2 = apply(board, am, castling, epTarget); board = s2.b; castling = s2.cast; epTarget = s2.ep; api.sound.tick(); }
                    aiThinking = false; turn = "w"; sTurn.val.textContent = "White";
                    legalCache = legal(board, true, castling, epTarget);
                    msg.textContent = inCheck(board, true) ? "Check!" : "Your move.";
                    paint();
                    checkEnd("b");
                }, 60);
            }
            function checkEnd(justMoved) {
                var mover = justMoved === "w" ? false : true; // side to move now
                var moves = legal(board, mover, castling, epTarget);
                if (moves.length) { legalCache = mover ? moves : legalCache; return false; }
                over = true;
                if (inCheck(board, mover)) {
                    if (!mover) { // black mated -> white wins
                        wins++; api.save("wins", wins); sScore.val.textContent = wins; api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win(); api.haptic(30);
                        api.overlay({ emoji: "&#127942;", title: "Checkmate — you win!", sub: "Brilliant play.", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] });
                    } else { api.sound.lose();
                        api.overlay({ emoji: "&#129302;", title: "Checkmate", sub: "The AI got you this time.", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] });
                    }
                } else { api.sound.pop();
                    api.overlay({ emoji: "&#129309;", title: "Stalemate", sub: "It's a draw.", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] });
                }
                return true;
            }
            function reset() {
                board = ("rnbqkbnr" + "pppppppp" + "........" + "........" + "........" + "........" + "PPPPPPPP" + "RNBQKBNR").split("").map(function (c) { return c === "." ? "" : c; });
                turn = "w"; sel = null; over = false; aiThinking = false; castling = "KQkq"; epTarget = -1;
                sTurn.val.textContent = "White"; msg.textContent = "Tap a piece, then tap where to move. You are White.";
                legalCache = legal(board, true, castling, epTarget);
                build(); paint();
            }
            reset();
            return function () {};
        }
    });
})();
