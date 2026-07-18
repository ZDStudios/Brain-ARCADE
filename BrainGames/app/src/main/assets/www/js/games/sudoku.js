/* Sudoku */
(function () {
    window.BrainGames.register({
        id: "sudoku", name: "Sudoku", icon: "&#128290;",
        gradient: "linear-gradient(135deg,#0D9488,#0EA5E9)",
        best: "low", bestLabel: "Best", bestSuffix: "s",
        mount: function (host, api) {
            var solution, puzzle, given, sel = -1, time = 0, timer, doneGame;

            var sDiff = stat("Level", "Medium"), sTime = stat("Time", "0s"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sDiff.box, sTime.box, sBest.box]));
            var size = Math.min(api.space().board, 468);
            var cellPx = Math.floor(size / 9);
            var boardEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(9," + cellPx + "px);gap:0;background:var(--text);padding:2px;border-radius:8px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var padEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(9,1fr);gap:5px;max-width:360px;width:100%;margin-top:6px" });
            host.appendChild(padEl);
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", html: "&#9003; Erase", onclick: function () { setCell(0); } }),
                api.el("button", { class: "btn", text: "New puzzle", onclick: reset })
            ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            /* generator */
            function makeSolution() {
                var g = new Array(81).fill(0);
                function ok(p, v) {
                    var r = Math.floor(p / 9), c = p % 9;
                    for (var i = 0; i < 9; i++) { if (g[r * 9 + i] === v || g[i * 9 + c] === v) return false; }
                    var br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
                    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) if (g[(br + a) * 9 + bc + b] === v) return false;
                    return true;
                }
                function fill(p) {
                    if (p === 81) return true;
                    var nums = [1,2,3,4,5,6,7,8,9];
                    for (var i = nums.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = nums[i]; nums[i] = nums[j]; nums[j] = t; }
                    for (var k = 0; k < 9; k++) { if (ok(p, nums[k])) { g[p] = nums[k]; if (fill(p + 1)) return true; g[p] = 0; } }
                    return false;
                }
                fill(0); return g;
            }
            function dig(sol, holes) {
                var p = sol.slice(), order = [];
                for (var i = 0; i < 81; i++) order.push(i);
                for (var i2 = order.length - 1; i2 > 0; i2--) { var j = Math.floor(Math.random() * (i2 + 1)); var t = order[i2]; order[i2] = order[j]; order[j] = t; }
                for (var k = 0; k < holes; k++) p[order[k]] = 0;
                return p;
            }

            var cellEls = [];
            function build() {
                boardEl.innerHTML = ""; cellEls = [];
                for (var i = 0; i < 81; i++) {
                    (function (i) {
                        var r = Math.floor(i / 9), c = i % 9;
                        var bt = (r % 3 === 0) ? 2 : 0, bl = (c % 3 === 0) ? 2 : 0;
                        var d = api.el("div", { style: baseStyle(i) + ";border-top:" + bt + "px solid var(--text);border-left:" + bl + "px solid var(--text)" });
                        d.addEventListener("click", function () { select(i); });
                        cellEls.push(d); boardEl.appendChild(d);
                    })(i);
                }
                buildPad(); paint();
            }
            function baseStyle(i) {
                return "width:" + cellPx + "px;height:" + cellPx + "px;display:grid;place-items:center;background:var(--card);font-weight:700;font-size:" + Math.floor(cellPx * 0.5) + "px;box-sizing:border-box";
            }
            function buildPad() {
                padEl.innerHTML = "";
                for (var n = 1; n <= 9; n++) { (function (n) {
                    padEl.appendChild(api.el("button", { class: "btn", style: "padding:12px 0", text: n + "", onclick: function () { setCell(n); } }));
                })(n); }
            }
            function select(i) { if (doneGame) return; sel = i; api.sound.tick(); paint(); }
            function setCell(n) {
                if (doneGame || sel < 0 || given[sel]) return;
                puzzle[sel] = n; api.sound.click(); api.haptic(6); paint();
                if (n && puzzle.every(function (v, k) { return v === solution[k]; })) winGame();
            }
            function conflict(i) {
                var v = puzzle[i]; if (!v) return false;
                var r = Math.floor(i / 9), c = i % 9;
                for (var k = 0; k < 9; k++) { if (k !== c && puzzle[r * 9 + k] === v) return true; if (k !== r && puzzle[k * 9 + c] === v) return true; }
                var br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
                for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) { var p = (br + a) * 9 + bc + b; if (p !== i && puzzle[p] === v) return true; }
                return false;
            }
            function paint() {
                var selVal = sel >= 0 ? puzzle[sel] : 0;
                for (var i = 0; i < 81; i++) {
                    var d = cellEls[i], v = puzzle[i];
                    d.textContent = v ? v : "";
                    var bg = "var(--card)";
                    if (i === sel) bg = "rgba(124,92,255,0.35)";
                    else if (sel >= 0 && (Math.floor(i/9) === Math.floor(sel/9) || i % 9 === sel % 9)) bg = "rgba(124,92,255,0.10)";
                    else if (selVal && v === selVal) bg = "rgba(34,211,238,0.18)";
                    d.style.background = bg;
                    d.style.color = given[i] ? "var(--text)" : conflict(i) ? "#F87171" : "#22D3EE";
                }
            }
            function winGame() {
                doneGame = true; clearInterval(timer); var rec = api.setBest(time); api.sound.win(); api.haptic(30);
                api.overlay({ emoji: "&#127881;", title: "Solved!", sub: "Time <b>" + time + "s</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "New puzzle", primary: true, onClick: reset } ] });
            }
            function reset() {
                clearInterval(timer); doneGame = false; time = 0; sTime.val.textContent = "0s"; sel = -1;
                solution = makeSolution(); puzzle = dig(solution, 44); given = puzzle.map(function (v) { return v !== 0; });
                build();
                timer = setInterval(function () { time++; sTime.val.textContent = time + "s"; }, 1000);
            }
            function key(e) { if (/^[1-9]$/.test(e.key)) setCell(+e.key); else if (e.key === "Backspace" || e.key === "0") setCell(0); }
            window.addEventListener("keydown", key);
            reset();
            return function () { clearInterval(timer); window.removeEventListener("keydown", key); };
        }
    });
})();
