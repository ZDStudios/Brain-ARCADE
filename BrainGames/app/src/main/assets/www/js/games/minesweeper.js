/* Minesweeper */
(function () {
    window.BrainGames.register({
        id: "mines", name: "Minesweeper", icon: "&#128163;",
        gradient: "linear-gradient(135deg,#475569,#0F172A)",
        best: "low", bestLabel: "Best", bestSuffix: "s",
        help: {"emoji":"&#128163;","goal":"Reveal every safe square without hitting a mine.","steps":["Tap a square to reveal it.","A number shows how many mines touch that square.","Turn on Flag mode (or long-press) to mark a mine.","Reveal all the safe squares to win!"]},
        mount: function (host, api) {
            var N = 9, MINES = 10;
            var grid, revealed, flags, dead, wonGame, started, time, timer, flagMode = false, left;

            var sMines = stat("Mines", MINES + ""), sTime = stat("Time", "0s"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sMines.box, sTime.box, sBest.box]));
            var cellPx = Math.floor(api.space().board / N);
            var boardEl = api.el("div", { class: "cells", style: "grid-template-columns:repeat(" + N + "," + cellPx + "px)" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var flagBtn = api.el("button", { class: "btn", html: "&#128681; Flag: OFF", onclick: function () { flagMode = !flagMode; flagBtn.innerHTML = "&#128681; Flag: " + (flagMode ? "ON" : "OFF"); flagBtn.classList.toggle("primary", flagMode); api.sound.click(); } });
            host.appendChild(api.el("div", { class: "btn-row" }, [ flagBtn, api.el("button", { class: "btn", text: "New", onclick: reset }) ]));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap to reveal. Toggle Flag (or long-press) to mark mines." }));

            var NUMCOL = ["", "#60A5FA", "#34D399", "#F87171", "#A78BFA", "#FB923C", "#22D3EE", "#F472B6", "#E5E7EB"];
            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            var cellEls = [];
            function idx(r, c) { return r * N + c; }
            function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
            function neighbors(r, c, fn) { for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) if ((dr || dc) && inb(r + dr, c + dc)) fn(r + dr, c + dc); }

            function build() {
                boardEl.innerHTML = ""; cellEls = [];
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
                    (function (r, c) {
                        var d = api.el("div", { style: cellStyle(false) });
                        var lp = null;
                        d.addEventListener("touchstart", function () { lp = setTimeout(function () { lp = null; toggleFlag(r, c); }, 380); }, { passive: true });
                        d.addEventListener("touchend", function (e) { if (lp) { clearTimeout(lp); lp = null; tap(r, c); e.preventDefault(); } }, { passive: false });
                        d.addEventListener("click", function () { if ("ontouchstart" in window) return; tap(r, c); });
                        d.addEventListener("contextmenu", function (e) { e.preventDefault(); toggleFlag(r, c); });
                        cellEls[idx(r, c)] = d; boardEl.appendChild(d);
                    })(r, c);
                }
            }
            function cellStyle(open) {
                return "width:" + cellPx + "px;height:" + cellPx + "px;display:grid;place-items:center;font-weight:800;font-size:" + Math.floor(cellPx * 0.5) + "px;border-radius:5px;" +
                    (open ? "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.05)" : "background:linear-gradient(135deg,#334155,#1E293B);border:1px solid rgba(255,255,255,0.08)");
            }
            function plant(sr, sc) {
                var spots = [];
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (Math.abs(r - sr) > 1 || Math.abs(c - sc) > 1) spots.push([r, c]);
                for (var i = spots.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
                for (var k = 0; k < MINES; k++) grid[idx(spots[k][0], spots[k][1])] = -1;
                for (var r2 = 0; r2 < N; r2++) for (var c2 = 0; c2 < N; c2++) {
                    if (grid[idx(r2, c2)] === -1) continue;
                    var n = 0; neighbors(r2, c2, function (rr, cc) { if (grid[idx(rr, cc)] === -1) n++; });
                    grid[idx(r2, c2)] = n;
                }
                started = true; timer = setInterval(function () { time++; sTime.val.textContent = time + "s"; }, 1000);
            }
            function tap(r, c) {
                if (dead || wonGame) return;
                if (flagMode) return toggleFlag(r, c);
                if (!started) plant(r, c);
                if (flags[idx(r, c)] || revealed[idx(r, c)]) return;
                reveal(r, c);
                if (grid[idx(r, c)] === -1) return loseGame();
                api.sound.tick(); checkWin();
            }
            function reveal(r, c) {
                var i = idx(r, c);
                if (revealed[i] || flags[i]) return;
                revealed[i] = true;
                var v = grid[i], d = cellEls[i];
                d.style.cssText = cellStyle(true);
                if (v === -1) { d.innerHTML = "&#128163;"; d.style.background = "#7F1D1D"; }
                else if (v > 0) { d.textContent = v; d.style.color = NUMCOL[v]; }
                else { neighbors(r, c, function (rr, cc) { reveal(rr, cc); }); }
            }
            function toggleFlag(r, c) {
                if (dead || wonGame || revealed[idx(r, c)] || !started && false) return;
                if (!started) return; var i = idx(r, c);
                if (revealed[i]) return;
                flags[i] = !flags[i]; cellEls[i].innerHTML = flags[i] ? "&#128681;" : "";
                left += flags[i] ? -1 : 1; sMines.val.textContent = left; api.sound.click(); api.haptic(8);
            }
            function loseGame() {
                dead = true; clearInterval(timer); api.sound.lose(); api.haptic(40);
                for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (grid[idx(r, c)] === -1 && !flags[idx(r, c)]) reveal(r, c);
                api.overlay({ emoji: "&#128165;", title: "Boom!", sub: "You hit a mine.",
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Retry", primary: true, onClick: reset } ] });
            }
            function checkWin() {
                var count = 0; for (var i = 0; i < N * N; i++) if (revealed[i]) count++;
                if (count === N * N - MINES) {
                    wonGame = true; clearInterval(timer); var rec = api.setBest(time); api.sound.win(); api.haptic(30);
                    api.overlay({ emoji: "&#127942;", title: "Cleared!", sub: "Time <b>" + time + "s</b>" + (rec ? "<br>New best!" : ""),
                        buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] });
                }
            }
            function reset() {
                clearInterval(timer);
                grid = new Array(N * N).fill(0); revealed = new Array(N * N).fill(false); flags = new Array(N * N).fill(false);
                dead = false; wonGame = false; started = false; time = 0; left = MINES;
                sTime.val.textContent = "0s"; sMines.val.textContent = MINES;
                build();
            }
            reset();
            return function () { clearInterval(timer); };
        }
    });
})();
