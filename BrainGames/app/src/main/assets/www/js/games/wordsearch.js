/* Word Search — find the hidden words in the letter grid */
(function () {
    var BANK = {
        easy: ["CAT", "DOG", "SUN", "HAT", "BUS", "CAKE", "FISH", "STAR", "MILK", "BALL", "TREE", "BIRD", "MOON", "FROG", "DUCK"],
        medium: ["PLANET", "GUITAR", "ORANGE", "TIGER", "CASTLE", "ROCKET", "GARDEN", "MONKEY", "PENCIL", "WINTER", "DRAGON", "SILVER", "MARKET", "BRIDGE"],
        hard: ["ELEPHANT", "MOUNTAIN", "TREASURE", "DINOSAUR", "SANDWICH", "UMBRELLA", "COMPUTER", "BIRTHDAY", "PYRAMIDS", "AIRPLANE", "CHOCOLATE", "ADVENTURE"]
    };
    window.BrainGames.register({
        id: "wordsearch", name: "Word Search", icon: "&#128269;",
        gradient: "linear-gradient(135deg,#0EA5E9,#6366F1)",
        best: "low", bestLabel: "Fastest", bestSuffix: "s",
        difficulties: true,
        help: {
            emoji: "&#128269;", goal: "Find every hidden word in the grid.",
            steps: [
                "The words to find are listed under the grid.",
                "Drag across the letters of a word to select it.",
                "Words hide across, down and diagonally.",
                "Find them all as fast as you can!"
            ]
        },
        mount: function (host, api) {
            var CFG = { easy: { n: 7, words: 4 }, medium: { n: 9, words: 6 }, hard: { n: 11, words: 7 } };
            var cfg = CFG[api.difficulty] || CFG.medium;
            var N = cfg.n;
            var sp = api.space();
            var cell = Math.floor(Math.min(sp.board, 460) / N);
            var grid, targets, found, cells, t0 = 0, timer = null, done = false;

            var sFound = stat("Found", "0"), sTotal = stat("Words", String(cfg.words)), sTime = stat("Time", "0s");
            host.appendChild(api.el("div", { class: "game-topline" }, [sFound.box, sTotal.box, sTime.box]));

            var boardEl = api.el("div", { class: "ws-grid", style: "grid-template-columns:repeat(" + N + "," + cell + "px)" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var listEl = api.el("div", { class: "ws-words" });
            host.appendChild(listEl);
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", text: "New puzzle", onclick: reset })
            ]));

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }
            function rnd(n) { return Math.floor(Math.random() * n); }

            var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
            function place(word) {
                for (var tries = 0; tries < 250; tries++) {
                    var d = DIRS[rnd(DIRS.length)];
                    var r = rnd(N), c = rnd(N);
                    var endR = r + d[1] * (word.length - 1), endC = c + d[0] * (word.length - 1);
                    if (endR < 0 || endR >= N || endC < 0 || endC >= N) continue;
                    var ok = true, i;
                    for (i = 0; i < word.length; i++) {
                        var ch = grid[r + d[1] * i][c + d[0] * i];
                        if (ch && ch !== word[i]) { ok = false; break; }
                    }
                    if (!ok) continue;
                    var path = [];
                    for (i = 0; i < word.length; i++) {
                        var rr = r + d[1] * i, cc = c + d[0] * i;
                        grid[rr][cc] = word[i];
                        path.push(rr * N + cc);
                    }
                    return path;
                }
                return null;
            }

            function reset() {
                done = false;
                grid = []; for (var r = 0; r < N; r++) { grid.push([]); for (var c = 0; c < N; c++) grid[r].push(""); }
                var bank = (BANK[api.difficulty] || BANK.medium).slice();
                targets = []; found = {};
                while (targets.length < cfg.words && bank.length) {
                    var w = bank.splice(rnd(bank.length), 1)[0];
                    if (w.length > N) continue;
                    var path = place(w);
                    if (path) targets.push({ word: w, path: path });
                }
                var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (!grid[r][c]) grid[r][c] = A[rnd(26)];
                draw();
                sFound.val.textContent = "0";
                sTotal.val.textContent = String(targets.length);
                t0 = Date.now();
                clearInterval(timer);
                timer = setInterval(function () {
                    if (done) return;
                    sTime.val.textContent = Math.round((Date.now() - t0) / 1000) + "s";
                }, 500);
            }

            function draw() {
                boardEl.innerHTML = ""; cells = [];
                for (var i = 0; i < N * N; i++) {
                    var r = Math.floor(i / N), c = i % N;
                    var d = api.el("div", { class: "ws-cell", text: grid[r][c], style: "width:" + cell + "px;height:" + cell + "px;font-size:" + Math.round(cell * 0.52) + "px" });
                    d.setAttribute("data-i", i);
                    cells.push(d); boardEl.appendChild(d);
                }
                paintFound();
                drawList();
            }
            function drawList() {
                listEl.innerHTML = "";
                targets.forEach(function (t) {
                    listEl.appendChild(api.el("span", { class: "ws-word" + (found[t.word] ? " got" : ""), text: t.word }));
                });
            }
            function paintFound() {
                cells.forEach(function (c) { c.classList.remove("found", "sel"); });
                targets.forEach(function (t) {
                    if (!found[t.word]) return;
                    t.path.forEach(function (i) { cells[i].classList.add("found"); });
                });
            }

            function lineBetween(a, b) {
                var ar = Math.floor(a / N), ac = a % N, br = Math.floor(b / N), bc = b % N;
                var dr = br - ar, dc = bc - ac;
                var len = Math.max(Math.abs(dr), Math.abs(dc));
                if (len === 0) return [a];
                if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null; // not a straight line
                var sr = dr === 0 ? 0 : dr / Math.abs(dr), sc = dc === 0 ? 0 : dc / Math.abs(dc);
                var out = [];
                for (var i = 0; i <= len; i++) out.push((ar + sr * i) * N + (ac + sc * i));
                return out;
            }
            function preview(path) {
                cells.forEach(function (c) { c.classList.remove("sel"); });
                if (path) path.forEach(function (i) { cells[i].classList.add("sel"); });
            }
            function commit(path) {
                if (!path) return;
                var s = path.map(function (i) { return grid[Math.floor(i / N)][i % N]; }).join("");
                var rev = s.split("").reverse().join("");
                var hit = null;
                targets.forEach(function (t) { if (!found[t.word] && (t.word === s || t.word === rev)) hit = t; });
                if (hit) {
                    found[hit.word] = true;
                    api.sound.good(); api.haptic(12);
                    var n = Object.keys(found).length;
                    sFound.val.textContent = String(n);
                    paintFound(); drawList();
                    if (n >= targets.length) win();
                } else {
                    api.sound.bad();
                }
                preview(null);
            }
            function win() {
                done = true; clearInterval(timer);
                var secs = Math.round((Date.now() - t0) / 1000);
                var rec = api.setBest(secs);
                api.sound.win();
                api.overlay({
                    emoji: "&#127881;", title: "All found!",
                    sub: "You found every word in <b>" + secs + "s</b>" + (rec ? "<br>&#127942; New best time!" : ""),
                    buttons: [{ label: "Home", onClick: api.exit }, { label: "New puzzle", primary: true, onClick: reset }]
                });
            }

            /* Input: drag across the letters, OR tap the first letter then the last.
               The cell comes from the event target rather than screen coordinates,
               so it works for touch, mouse and synthetic clicks alike. */
            var dragFrom = null, tapStart = null, suppressClick = false;

            function idxOf(e) {
                var t = e.target;
                if (t && t.classList && t.classList.contains("ws-cell")) return Number(t.getAttribute("data-i"));
                if (typeof e.clientX === "number" && (e.clientX || e.clientY)) {
                    var el2 = document.elementFromPoint(e.clientX, e.clientY);
                    if (el2 && el2.classList.contains("ws-cell")) return Number(el2.getAttribute("data-i"));
                }
                return null;
            }
            function cellAtPoint(x, y) {
                var el2 = document.elementFromPoint(x, y);
                if (!el2 || !el2.classList.contains("ws-cell")) return null;
                return Number(el2.getAttribute("data-i"));
            }

            boardEl.addEventListener("pointerdown", function (e) {
                var i = idxOf(e);
                if (i == null) return;
                dragFrom = i; preview([i]);
            });
            boardEl.addEventListener("pointermove", function (e) {
                if (dragFrom == null) return;
                var i = cellAtPoint(e.clientX, e.clientY);
                if (i == null) return;
                preview(lineBetween(dragFrom, i));
            });
            window.addEventListener("pointerup", function (e) {
                if (dragFrom == null) return;
                var from = dragFrom; dragFrom = null;
                var i = cellAtPoint(e.clientX, e.clientY);
                if (i != null && i !== from) {          // a real drag
                    tapStart = null; suppressClick = true;
                    commit(lineBetween(from, i));
                    return;
                }
                // A tap: first tap marks the start, second tap completes the word.
                suppressClick = true;
                handleTap(from);
            });
            boardEl.addEventListener("click", function (e) {
                if (suppressClick) { suppressClick = false; return; }
                var i = idxOf(e);
                if (i != null) handleTap(i);
            });
            function handleTap(i) {
                if (tapStart == null) { tapStart = i; preview([i]); }
                else if (tapStart === i) { tapStart = null; preview(null); }   // tap again to cancel
                else { var t = tapStart; tapStart = null; commit(lineBetween(t, i)); }
            }

            reset();
            return function () { clearInterval(timer); };
        }
    });
})();
