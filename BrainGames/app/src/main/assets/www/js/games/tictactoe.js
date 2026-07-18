/* Tic-Tac-Toe vs AI (minimax) */
(function () {
    window.BrainGames.register({
        id: "ttt", name: "Tic-Tac-Toe", icon: "&#11093;",
        gradient: "linear-gradient(135deg,#2563EB,#06B6D4)",
        best: "high", bestLabel: "Wins",
        mount: function (host, api) {
            var b, turn, lock, wins = api.load("wins", 0);
            var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

            var sScore = stat("Wins", wins + ""), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sBest.box]));
            var size = Math.min(api.space().board, 380);
            var cellPx = Math.floor(size / 3) - 8;
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:8px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            host.appendChild(api.el("div", { class: "small-note", text: "You are X. The AI never loses — can you force a draw?" }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New round", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            var cellEls = [];
            function build() {
                boardEl.innerHTML = ""; cellEls = [];
                for (var i = 0; i < 9; i++) { (function (i) {
                    var d = api.el("div", { style: "width:" + cellPx + "px;height:" + cellPx + "px;display:grid;place-items:center;font-size:" + Math.floor(cellPx * 0.6) + "px;font-weight:800;background:var(--card-2);border-radius:14px;cursor:pointer" });
                    d.addEventListener("click", function () { play(i); });
                    cellEls.push(d); boardEl.appendChild(d);
                })(i); }
            }
            function winner(bb) {
                for (var i = 0; i < LINES.length; i++) { var l = LINES[i]; if (bb[l[0]] && bb[l[0]] === bb[l[1]] && bb[l[1]] === bb[l[2]]) return { who: bb[l[0]], line: l }; }
                if (bb.every(function (v) { return v; })) return { who: "draw" };
                return null;
            }
            function play(i) {
                if (lock || b[i] || turn !== "X") return;
                b[i] = "X"; api.sound.click(); api.haptic(8); paint();
                var w = winner(b); if (w) return end(w);
                turn = "O"; lock = true;
                setTimeout(function () { var m = best(b); if (m > -1) { b[m] = "O"; api.sound.tick(); paint(); } var w2 = winner(b); if (w2) return end(w2); turn = "X"; lock = false; }, 320);
            }
            function best(bb) {
                var bestScore = -Infinity, move = -1;
                for (var i = 0; i < 9; i++) if (!bb[i]) { bb[i] = "O"; var s = mini(bb, 0, false); bb[i] = ""; if (s > bestScore) { bestScore = s; move = i; } }
                return move;
            }
            function mini(bb, d, isMax) {
                var w = winner(bb);
                if (w) { if (w.who === "O") return 10 - d; if (w.who === "X") return d - 10; return 0; }
                var best = isMax ? -Infinity : Infinity;
                for (var i = 0; i < 9; i++) if (!bb[i]) { bb[i] = isMax ? "O" : "X"; var s = mini(bb, d + 1, !isMax); bb[i] = ""; best = isMax ? Math.max(best, s) : Math.min(best, s); }
                return best;
            }
            function paint(line) {
                for (var i = 0; i < 9; i++) {
                    cellEls[i].textContent = b[i];
                    cellEls[i].style.color = b[i] === "X" ? "#22D3EE" : "#F472B6";
                    cellEls[i].style.background = line && line.indexOf(i) > -1 ? "rgba(52,211,153,0.25)" : "var(--card-2)";
                }
            }
            function end(w) {
                lock = true; paint(w.line);
                if (w.who === "X") { wins++; api.save("wins", wins); sScore.val.textContent = wins; api.setBest(wins); sBest.val.textContent = api.getBest(); api.sound.win();
                    api.overlay({ emoji: "&#127881;", title: "You win!", sub: "Impressive!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else if (w.who === "O") { api.sound.lose();
                    api.overlay({ emoji: "&#129302;", title: "AI wins", sub: "Try to see two moves ahead.", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
                else { api.sound.pop();
                    api.overlay({ emoji: "&#129309;", title: "Draw", sub: "Nicely played — a draw is the best you can force!", buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: reset } ] }); }
            }
            function reset() { b = ["","","","","","","","",""]; turn = "X"; lock = false; build(); paint(); }
            reset();
            return function () {};
        }
    });
})();
