/* Chess — vs the computer (alpha-beta) or two players on one tablet */
(function () {
    window.BrainGames.register({
        id: "chess", name: "Chess", icon: "&#9822;",
        gradient: "linear-gradient(135deg,#1F2937,#4B5563)",
        best: "high", bestLabel: "Wins", difficulties: true, twoPlayer: true, resumable: true,
        help: {"emoji":"&#9823;","goal":"Trap the other king so it cannot escape (checkmate).","steps":["White moves first. Pieces that can move glow green.","Tap a piece: green dots show where it can go, red rings show captures.","The yellow squares show the last move the other side made.","If your king is in CHECK you must save it — only moves that do are allowed."]},
        mount: function (host, api) {
            var TWO = api.twoPlayer;
            var GLYPH = { P:"♙", N:"♘", B:"♗", R:"♖", Q:"♕", K:"♔",
                          p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" };
            var NAMES = { P:"Pawn", N:"Knight", B:"Bishop", R:"Rook", Q:"Queen", K:"King" };
            var VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };
            var PST = { // simple pawn/knight tables (white perspective)
                p:[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
                n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50]
            };
            var board, turn, sel, legalCache, over, lastMove, wins = api.load("wins", 0);
            var castling, epTarget, aiThinking, aiTimer;
            var showMoves = api.load("showMoves", true);

            var sA = TWO ? stat("Players", "2") : stat("Wins", wins + ""), sTurn = stat("Turn", "White"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, TWO ? [sA.box, sTurn.box] : [sA.box, sTurn.box, sBest.box]));
            var sz = api.space().board;
            var cell = Math.floor(Math.min(sz, api.space().isTablet ? 620 : 440) / 8);
            var boardEl = api.el("div", { class: "ch-board", style: "grid-template-columns:repeat(8," + cell + "px);font-size:" + Math.floor(cell * 0.74) + "px" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "padding:8px" }, boardEl));
            var msg = api.el("div", { class: "ch-msg" });
            host.appendChild(msg);
            var hintBtn = api.el("button", { class: "btn", onclick: function () { showMoves = !showMoves; api.save("showMoves", showMoves); paintHintBtn(); paint(); } });
            host.appendChild(api.el("div", { class: "btn-row" }, [ hintBtn, api.el("button", { class: "btn", text: "New game", onclick: reset }) ]));
            function paintHintBtn() { hintBtn.innerHTML = showMoves ? "&#128064; Show moves: ON" : "&#128064; Show moves: OFF"; }
            paintHintBtn();

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function isW(p) { return !!p && p === p.toUpperCase(); }
            function clone(b) { return b.slice(); }
            function sqName(i) { return "abcdefgh"[i & 7] + (8 - (i >> 3)); }
            function sideName(white) { return white ? "White" : "Black"; }
            function humanSide(white) { return TWO || white; }
            function say(html) { msg.innerHTML = html; }

            var cells = [];
            function build() {
                boardEl.innerHTML = ""; cells = [];
                for (var i = 0; i < 64; i++) {
                    (function (i) {
                        var r = i >> 3, c = i & 7, dark = (r + c) % 2 === 1;
                        var d = api.el("div", { class: "ch-sq " + (dark ? "dk" : "lt"), style: "width:" + cell + "px;height:" + cell + "px" });
                        if (c === 0) d.appendChild(api.el("span", { class: "ch-rank", text: String(8 - r) }));
                        if (r === 7) d.appendChild(api.el("span", { class: "ch-file", text: "abcdefgh"[c] }));
                        d._piece = api.el("span", { class: "ch-pc" });
                        d._mark = api.el("span", { class: "ch-mark" });
                        d.appendChild(d._piece); d.appendChild(d._mark);
                        d.addEventListener("click", function () { onSquare(i); });
                        cells.push(d); boardEl.appendChild(d);
                    })(i);
                }
            }
            function saveNow() {
                if (over || !board) return;
                api.saveState({ board: board.slice(), turn: turn, castling: castling, epTarget: epTarget, lastMove: lastMove, mode: TWO ? "2p" : "bot" });
            }
            function paint() {
                saveNow();
                var white = turn === "w";
                var movable = {};
                if (showMoves && !over && humanSide(white) && !aiThinking) legalCache.forEach(function (m) { movable[m.from] = true; });
                var checkSq = !over && inCheck(board, white) ? kingSq(board, white) : -1;
                var targets = {};
                if (sel != null) legalCache.forEach(function (m) { if (m.from === sel) targets[m.to] = m; });
                for (var i = 0; i < 64; i++) {
                    var p = board[i], d = cells[i];
                    d._piece.textContent = p ? GLYPH[p] : "";
                    d._piece.className = "ch-pc" + (p ? (isW(p) ? " w" : " b") : "");
                    var cls = "ch-sq " + (((i >> 3) + (i & 7)) % 2 ? "dk" : "lt");
                    if (lastMove && (i === lastMove.from || i === lastMove.to)) cls += " last";
                    if (i === checkSq) cls += " check";
                    if (i === sel) cls += " sel";
                    else if (movable[i]) cls += " can";
                    d.className = cls;
                    d._mark.className = "ch-mark" + (targets[i] ? (board[i] || targets[i].ep ? " cap" : " dot") : "");
                }
            }

            /* ---------- move generation ---------- */
            function genMoves(b, white, cast, ep) {
                var moves = [];
                for (var i = 0; i < 64; i++) {
                    var p = b[i]; if (!p || white !== isW(p)) continue;
                    var r = i >> 3, c = i & 7, t = p.toUpperCase();
                    if (t === "P") pawn(b, i, r, c, white, ep, moves);
                    else if (t === "N") leap(b, i, r, c, white, [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]], moves);
                    else if (t === "K") { leap(b, i, r, c, white, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], moves); castle(b, i, white, cast, moves); }
                    else {
                        var dirs = t === "B" ? [[-1,-1],[-1,1],[1,-1],[1,1]] : t === "R" ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
                        slide(b, i, r, c, white, dirs, moves);
                    }
                }
                return moves;
            }
            function add(b, from, to, white, moves, flag) {
                var tp = b[to];
                if (tp && isW(tp) === white) return;
                var m = { from: from, to: to };
                if (flag) m[flag] = true;
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
                    else if (to === ep && !b[to]) add(b, i, to, white, moves, "ep");
                });
            }
            function castle(b, i, white, cast, moves) {
                var rank = white ? 7 : 0, base = rank * 8, R = white ? "R" : "r";
                if (i !== base + 4 || attacked(b, base + 4, !white)) return;
                var K = white ? "K" : "k", Q = white ? "Q" : "q";
                if (cast.indexOf(K) > -1 && b[base + 7] === R && !b[base + 5] && !b[base + 6] && !attacked(b, base + 5, !white) && !attacked(b, base + 6, !white)) moves.push({ from: i, to: base + 6, castle: "K" });
                if (cast.indexOf(Q) > -1 && b[base] === R && !b[base + 3] && !b[base + 2] && !b[base + 1] && !attacked(b, base + 3, !white) && !attacked(b, base + 2, !white)) moves.push({ from: i, to: base + 2, castle: "Q" });
            }
            /** Is square sq attacked by the given side? Works for empty squares too (castling). */
            function attacked(b, sq, byWhite) {
                var r = sq >> 3, c = sq & 7, k, nr, nc, p;
                var pr = byWhite ? r + 1 : r - 1, P = byWhite ? "P" : "p";
                if (pr >= 0 && pr < 8) { if (c > 0 && b[pr * 8 + c - 1] === P) return true; if (c < 7 && b[pr * 8 + c + 1] === P) return true; }
                var N = byWhite ? "N" : "n", KK = byWhite ? "K" : "k";
                var kn = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (k = 0; k < 8; k++) { nr = r + kn[k][0]; nc = c + kn[k][1]; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === N) return true; }
                for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    nr = r + dr; nc = c + dc;
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === KK) return true;
                    var diag = dr && dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        p = b[nr * 8 + nc];
                        if (p) {
                            if (isW(p) === byWhite) { var t = p.toUpperCase(); if (t === "Q" || (diag ? t === "B" : t === "R")) return true; }
                            break;
                        }
                        nr += dr; nc += dc;
                    }
                }
                return false;
            }
            function kingSq(b, white) { var kc = white ? "K" : "k"; for (var i = 0; i < 64; i++) if (b[i] === kc) return i; return -1; }
            function inCheck(b, white) { var k = kingSq(b, white); return k >= 0 && attacked(b, k, !white); }

            function apply(b, m, cast) {
                var nb = clone(b), p = nb[m.from];
                var newEp = -1;
                nb[m.to] = m.promo ? m.promo : p; nb[m.from] = "";
                if (m.ep) { nb[(m.from >> 3) * 8 + (m.to & 7)] = ""; }
                if (m.dbl) newEp = (m.from + m.to) / 2;
                if (m.castle) { var rank = (m.from >> 3) * 8; if (m.castle === "K") { nb[rank + 5] = nb[rank + 7]; nb[rank + 7] = ""; } else { nb[rank + 3] = nb[rank]; nb[rank] = ""; } }
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
                return genMoves(b, white, cast, ep).filter(function (m) { return !inCheck(apply(b, m, cast).b, white); });
            }

            /* ---------- computer ---------- */
            function evaluate(b) {
                var score = 0;
                for (var i = 0; i < 64; i++) { var p = b[i]; if (!p) continue; var t = p.toLowerCase(); var v = VAL[t];
                    var pst = PST[t] ? (isW(p) ? PST[t][i] : PST[t][63 - i]) : 0;
                    score += isW(p) ? (v + pst) : -(v + pst);
                }
                return score;
            }
            function ordered(b, moves) {
                // captures of big pieces first: makes alpha-beta prune far more
                return moves.map(function (m) { return { m: m, k: b[m.to] ? VAL[b[m.to].toLowerCase()] - VAL[b[m.from].toLowerCase()] / 10 : (m.promo ? 800 : 0) }; })
                    .sort(function (a, c) { return c.k - a.k; }).map(function (x) { return x.m; });
            }
            function search(b, depth, alpha, beta, white, cast, ep) {
                if (depth === 0) return evaluate(b);
                var moves = legal(b, white, cast, ep);
                if (!moves.length) return inCheck(b, white) ? (white ? -99999 - depth : 99999 + depth) : 0;
                moves = ordered(b, moves);
                var i, s, v;
                if (white) {
                    var best = -Infinity;
                    for (i = 0; i < moves.length; i++) { s = apply(b, moves[i], cast); v = search(s.b, depth - 1, alpha, beta, false, s.cast, s.ep); if (v > best) best = v; if (best > alpha) alpha = best; if (beta <= alpha) break; }
                    return best;
                }
                var best2 = Infinity;
                for (i = 0; i < moves.length; i++) { s = apply(b, moves[i], cast); v = search(s.b, depth - 1, alpha, beta, true, s.cast, s.ep); if (v < best2) best2 = v; if (best2 < beta) beta = best2; if (beta <= alpha) break; }
                return best2;
            }
            function aiMove() {
                var moves = legal(board, false, castling, epTarget);
                if (!moves.length) return null;
                for (var i = moves.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = moves[i]; moves[i] = moves[j]; moves[j] = t; }
                if (api.difficulty === "easy" && Math.random() < 0.55) return moves[0];
                var depth = api.difficulty === "hard" ? 3 : api.difficulty === "easy" ? 1 : 2;
                moves = ordered(board, moves);
                var best = Infinity, bm = moves[0];
                for (var k = 0; k < moves.length; k++) {
                    var s = apply(board, moves[k], castling);
                    var v = search(s.b, depth, -Infinity, best, true, s.cast, s.ep);
                    if (v < best) { best = v; bm = moves[k]; }
                }
                return bm;
            }

            /* ---------- playing ---------- */
            function describe(m, piece, captured, white) {
                var who = TWO ? sideName(white) : (white ? "You" : "The computer");
                var verb = TWO || !white ? "moved" : "moved";
                var s = who + " " + verb + " " + GLYPH[piece] + " " + NAMES[piece.toUpperCase()] + " " + sqName(m.from) + " &rarr; " + sqName(m.to);
                if (m.castle) s = who + " castled " + (m.castle === "K" ? "king-side" : "queen-side");
                if (captured) s += ", taking " + (TWO ? "" : (white ? "a " : "your ")) + GLYPH[captured] + " " + NAMES[captured.toUpperCase()];
                if (m.promo) s += " &mdash; and made a Queen!";
                return s;
            }
            function onSquare(i) {
                var white = turn === "w";
                if (over || aiThinking || !humanSide(white)) return;
                var p = board[i], mine = p && isW(p) === white;
                if (sel != null) {
                    var mv = legalCache.filter(function (m) { return m.from === sel && m.to === i; })[0];
                    if (mv) { doMove(mv); return; }
                }
                if (mine) {
                    var any = legalCache.some(function (m) { return m.from === i; });
                    sel = i; api.sound.tick();
                    if (any) say("<span class='piece-tag'>" + GLYPH[p] + " " + NAMES[p.toUpperCase()] + "</span> Tap a green dot to move it.");
                    else explainStuck(i, white);
                    paint();
                    return;
                }
                if (p) {
                    // Tapping any other piece just names it (handy for learning), and
                    // clears a selection so the board is not left mid-move.
                    var ownerTxt = TWO ? sideName(!white) + "'s" : "the computer's";
                    sel = null; api.sound.tick();
                    say("<span class='piece-tag'>" + GLYPH[p] + " " + (isW(p) ? "White " : "Black ") + NAMES[p.toUpperCase()] + "</span> That is " + ownerTxt + " piece. It is " + (TWO ? sideName(white) + "'s" : "your") + " turn.");
                    paint();
                    return;
                }
                sel = null; prompt(); paint();
            }
            function explainStuck(i, white) {
                var pseudo = genMoves(board, white, castling, epTarget).some(function (m) { return m.from === i; });
                if (inCheck(board, white)) say("&#9888;&#65039; Your king is in <b>check</b>! This piece can't save it &mdash; try a glowing piece.");
                else if (pseudo) say("&#128274; This piece is <b>pinned</b>: moving it would leave your king in danger.");
                else say("This piece is blocked in right now. Try a glowing piece.");
                api.sound.bad();
            }
            function prompt() {
                var white = turn === "w";
                var head = TWO ? "<b>" + sideName(white) + "'s turn.</b> " : "";
                if (inCheck(board, white)) { say(head + "&#9888;&#65039; <b>Check!</b> Save the king &mdash; only the glowing pieces can help."); return; }
                if (lastMove && lastMove.text) { say(head + lastMove.text + "."); return; }
                say(head + (TWO ? "Tap a piece, then a green dot." : "Tap a glowing piece, then a green dot. You are White."));
            }
            function commit(m) {
                var piece = board[m.from], captured = m.ep ? (isW(piece) ? "p" : "P") : board[m.to];
                var white = isW(piece);
                var s = apply(board, m, castling);
                board = s.b; castling = s.cast; epTarget = s.ep;
                lastMove = { from: m.from, to: m.to, text: describe(m, piece, captured, white) };
                turn = white ? "b" : "w";
                sTurn.val.textContent = sideName(!white);
                if (captured) { api.sound.pop(); api.haptic(14); } else api.sound.move();
            }
            function doMove(m) {
                sel = null;
                commit(m);
                legalCache = legal(board, turn === "w", castling, epTarget);
                paint();
                if (checkEnd()) return;
                if (TWO) { prompt(); paint(); return; }
                aiTurn();
            }
            function aiTurn() {
                aiThinking = true; say("The computer is thinking&hellip;"); paint();
                aiTimer = setTimeout(function () {
                    var am = aiMove();
                    if (am) commit(am);
                    aiThinking = false;
                    legalCache = legal(board, true, castling, epTarget);
                    prompt(); paint();
                    checkEnd();
                }, 120);
            }
            function checkEnd() {
                var white = turn === "w";
                if (legalCache.length) return false;
                over = true; api.clearState(); paint();
                var buttons = [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ];
                if (!inCheck(board, white)) {
                    api.sound.pop(); say("Stalemate &mdash; nobody can move. It's a draw.");
                    api.overlay({ emoji: "&#129309;", title: "Stalemate", sub: "No legal moves left, but no check. It's a draw.", buttons: buttons });
                    return true;
                }
                var winner = !white;
                say("Checkmate! " + sideName(winner) + " wins.");
                if (TWO) {
                    api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "Checkmate — " + sideName(winner) + " wins!", sub: "Great game, both of you.", buttons: buttons });
                } else if (winner) {
                    wins++; api.save("wins", wins); sA.val.textContent = wins; api.setBest(wins); sBest.val.textContent = api.getBest();
                    api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "Checkmate — you win!", sub: "Brilliant play.", buttons: buttons });
                } else {
                    api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "Checkmate", sub: "The computer got you this time.", buttons: buttons });
                }
                return true;
            }
            function restore(rs) {
                board = rs.board.slice(); turn = rs.turn || "w"; sel = null; over = false; aiThinking = false;
                castling = rs.castling == null ? "KQkq" : rs.castling;
                epTarget = typeof rs.epTarget === "number" ? rs.epTarget : -1;
                lastMove = rs.lastMove || null;
                sTurn.val.textContent = sideName(turn === "w");
                legalCache = legal(board, turn === "w", castling, epTarget);
                build(); prompt(); paint();
                // Saved mid-way through the computer's turn: let it finish instead of
                // leaving the board stuck with nobody able to move.
                if (!TWO && turn === "b") aiTurn();
            }
            function reset() {
                clearTimeout(aiTimer);
                api.clearState();
                board = ("rnbqkbnr" + "pppppppp" + "........" + "........" + "........" + "........" + "PPPPPPPP" + "RNBQKBNR").split("").map(function (c) { return c === "." ? "" : c; });
                turn = "w"; sel = null; over = false; aiThinking = false; castling = "KQkq"; epTarget = -1; lastMove = null;
                sTurn.val.textContent = "White";
                legalCache = legal(board, true, castling, epTarget);
                build(); prompt(); paint();
            }
            if (api.resumeState && api.resumeState.board && api.resumeState.board.length === 64) restore(api.resumeState);
            else reset();
            return function () { clearTimeout(aiTimer); };
        }
    });
})();
