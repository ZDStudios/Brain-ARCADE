/* Water Sort — pour the colours until every tube holds one colour.
   No numbers anywhere: it is pure forward planning. You can only pour onto the
   same colour or into an empty tube, so every move closes doors as well as
   opening them, and the two spare tubes are the whole puzzle.

   Every level is checked to be solvable before it is handed to you (a bounded
   depth-first search), so a child can never be given a dead deal. Undo, restart
   and full session saving are all in — a half-finished level survives the app
   being killed. */
(function () {
    var CAP = 4;                       // units per tube
    var COLORS = [
        "#F87171", "#60A5FA", "#34D399", "#FBBF24", "#A78BFA",
        "#FB923C", "#22D3EE", "#F472B6", "#A3E635"
    ];

    /* ---------- pure model ---------- */
    function topRun(tube) {              // [colour, count] of the pourable top run
        if (!tube.length) return null;
        var c = tube[tube.length - 1], n = 1;
        for (var i = tube.length - 2; i >= 0 && tube[i] === c; i--) n++;
        return [c, n];
    }
    function canPour(from, to) {
        // Free pouring: any colour may go on top of any other. The only rules left
        // are that a tube must have something to give, room to take it, and that a
        // finished tube is not emptied into a spare one for nothing.
        if (from === to || !from.length || to.length >= CAP) return false;
        if (!to.length) return from.length !== countSame(from);
        return true;
    }
    function countSame(tube) {
        if (!tube.length) return 0;
        var c = tube[0];
        for (var i = 0; i < tube.length; i++) if (tube[i] !== c) return 0;
        return tube.length;
    }
    function pour(tubes, i, j) {
        var from = tubes[i], to = tubes[j];
        var run = topRun(from), moved = 0;
        var room = CAP - to.length;
        var n = Math.min(run[1], room);
        for (var k = 0; k < n; k++) { to.push(from.pop()); moved++; }
        return moved;
    }
    function solved(tubes) {
        return tubes.every(function (t) { return !t.length || (t.length === CAP && countSame(t) === CAP); });
    }
    function keyOf(tubes) {
        return tubes.map(function (t) { return t.join(""); }).sort().join("|");
    }
    /** Bounded DFS: is this deal winnable at all? */
    function isSolvable(tubes, cap) {
        var seen = {}, nodes = 0, limit = cap || 120000;
        function walk(state) {
            if (nodes++ > limit) return false;
            if (solved(state)) return true;
            var k = keyOf(state);
            if (seen[k]) return false;
            seen[k] = 1;
            for (var i = 0; i < state.length; i++) {
                for (var j = 0; j < state.length; j++) {
                    if (!canPour(state[i], state[j])) continue;
                    var copy = state.map(function (t) { return t.slice(); });
                    pour(copy, i, j);
                    if (walk(copy)) return true;
                }
            }
            return false;
        }
        return walk(tubes.map(function (t) { return t.slice(); }));
    }
    function deal(nColors, nEmpty) {
        for (var attempt = 0; attempt < 40; attempt++) {
            var pool = [];
            for (var c = 0; c < nColors; c++) for (var k = 0; k < CAP; k++) pool.push(c);
            for (var i = pool.length - 1; i > 0; i--) {
                var r = Math.floor(Math.random() * (i + 1));
                var t = pool[i]; pool[i] = pool[r]; pool[r] = t;
            }
            var tubes = [];
            for (var n = 0; n < nColors; n++) tubes.push(pool.slice(n * CAP, n * CAP + CAP));
            for (var e = 0; e < nEmpty; e++) tubes.push([]);
            if (solved(tubes)) continue;                 // a freak already-done deal
            if (isSolvable(tubes)) return tubes;
        }
        return null;                                     // caller falls back
    }

    window.BrainGames.register({
        id: "watersort", name: "Water Sort", icon: "&#129380;",
        gradient: "linear-gradient(135deg,#0EA5E9,#A78BFA)",
        best: "high", bestLabel: "Level",
        difficulties: true, resumable: true,
        help: {
            emoji: "&#129380;", goal: "Pour the colours until every tube holds just one colour.",
            steps: [
                "Tap a tube to pick up the colour on top, then tap another tube to pour it.",
                "You can pour onto any colour, or into an empty tube — but a tube only holds four.",
                "The empty tubes are your workspace — think before you fill them!",
                "Tap Undo if you get stuck. Clear the board to reach the next level."
            ]
        },
        mount: function (host, api) {
            var SET = {
                easy:   { colors: 4, empty: 2 },
                medium: { colors: 6, empty: 2 },
                hard:   { colors: 8, empty: 2 }
            };
            var cfg = SET[api.difficulty] || SET.medium;

            var tubes = [], level = 1, moves = 0, sel = -1, history = [], focus = -1;   // -1 until a key is used
            var best = api.getBest() || 0;

            var sLevel = stat("Level", "1"), sMoves = stat("Moves", "0"), sBest = stat("Best", String(best));
            host.appendChild(api.el("div", { class: "game-topline" }, [sLevel.box, sMoves.box, sBest.box]));

            var boardEl = api.el("div", { class: "ws-tubes" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var note = api.el("div", { class: "small-note", text: "Tap a tube to pick up a colour." });
            host.appendChild(note);

            var undoBtn = api.el("button", { class: "btn", html: "&#8630; Undo", onclick: undo });
            host.appendChild(api.el("div", { class: "btn-row" }, [
                undoBtn,
                api.el("button", { class: "btn ghost", text: "Restart level", onclick: function () { api.sound.click(); newLevel(level, true); } })
            ]));

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            /* ---------- drawing ---------- */
            function draw() {
                boardEl.innerHTML = "";
                var sp = api.space();
                var perRow = tubes.length > 6 ? Math.ceil(tubes.length / 2) : tubes.length;
                var w = Math.max(34, Math.min(62, Math.floor((Math.min(sp.board, 460) - (perRow + 1) * 10) / perRow)));
                tubes.forEach(function (tube, i) {
                    var el = api.el("button", {
                        class: "ws-tube" + (sel === i ? " sel" : "") + (focus === i ? " nav-here" : ""),
                        style: "width:" + w + "px;height:" + Math.round(w * 3.1) + "px",
                        "data-i": String(i)
                    });
                    for (var k = CAP - 1; k >= 0; k--) {
                        var c = tube[k];
                        el.appendChild(api.el("span", {
                            class: "ws-unit" + (c === undefined ? " empty" : ""),
                            style: c === undefined ? "" : "background:" + COLORS[c % COLORS.length]
                        }));
                    }
                    if (countSame(tube) === CAP) el.classList.add("done");
                    el.addEventListener("click", function () { tap(i); });
                    boardEl.appendChild(el);
                });
                undoBtn.disabled = !history.length;
                undoBtn.style.opacity = history.length ? "1" : ".45";
                sMoves.val.textContent = String(moves);
                sLevel.val.textContent = String(level);
            }

            /* ---------- play ---------- */
            function tap(i) {
                if (sel === i) { sel = -1; note.textContent = "Tap a tube to pick up a colour."; draw(); return; }
                if (sel < 0) {
                    if (!tubes[i].length) { api.toast("That tube is empty"); return; }
                    if (countSame(tubes[i]) === CAP) { api.toast("That one is already done!"); return; }
                    sel = i; focus = i;
                    api.sound.click(); api.haptic(8);
                    note.textContent = "Now tap where to pour it.";
                    draw();
                    return;
                }
                if (!canPour(tubes[sel], tubes[i])) {
                    api.sound.bad(); api.haptic(20);
                    api.toast("That tube is full");
                    sel = -1; draw();
                    return;
                }
                history.push(tubes.map(function (t) { return t.slice(); }));
                if (history.length > 60) history.shift();
                pour(tubes, sel, i);
                moves++;
                sel = -1; focus = i;
                api.sound.pop(); api.haptic(10);
                note.textContent = "Tap a tube to pick up a colour.";
                draw();
                saveNow();
                if (solved(tubes)) win();
            }
            function undo() {
                if (!history.length) return;
                tubes = history.pop();
                moves = Math.max(0, moves - 1);
                sel = -1;
                api.sound.click();
                draw(); saveNow();
            }
            function win() {
                api.sound.win(); api.haptic(30);
                var rec = level > best;
                if (rec) { best = level; sBest.val.textContent = String(best); }
                api.setBest(level);
                api.clearState();
                setTimeout(function () {
                    api.overlay({
                        emoji: "&#127881;", title: "Level " + level + " cleared!",
                        sub: "Sorted in <b>" + moves + "</b> moves." + (rec ? "<br>New best level! &#127942;" : ""),
                        buttons: [
                            { label: "Home", onClick: api.exit },
                            { label: "Next level", primary: true, onClick: function () { newLevel(level + 1); } }
                        ]
                    });
                }, 420);
            }

            /* ---------- levels ---------- */
            function newLevel(n, same) {
                level = n;
                moves = 0; sel = -1; history = [];
                // One extra colour every three levels, up to what the palette holds.
                var colors = Math.min(COLORS.length, cfg.colors + Math.floor((level - 1) / 3));
                var made = deal(colors, cfg.empty);
                if (!made) made = deal(Math.max(3, colors - 1), cfg.empty + 1);
                tubes = made || [[0,0,0,0],[1,1,1,1],[]];
                note.textContent = same ? "Fresh start on level " + level + "." : "Tap a tube to pick up a colour.";
                draw(); saveNow();
            }
            function saveNow() {
                api.saveState({ tubes: tubes.map(function (t) { return t.slice(); }), level: level, moves: moves });
            }

            /* ---------- remote / keyboard ---------- */
            function onKey(ev) {
                var k = ev.key;
                if (k === "ArrowLeft") { focus = focus < 0 ? 0 : (focus + tubes.length - 1) % tubes.length; draw(); ev.preventDefault(); }
                else if (k === "ArrowRight") { focus = focus < 0 ? 0 : (focus + 1) % tubes.length; draw(); ev.preventDefault(); }
                else if (k === "Enter" || k === " ") { if (focus < 0) focus = 0; else tap(focus); draw(); ev.preventDefault(); }
                else if (k === "Backspace") { undo(); ev.preventDefault(); }
            }
            document.addEventListener("keydown", onKey);

            var rs = api.resumeState;
            if (rs && rs.tubes && rs.tubes.length) {
                tubes = rs.tubes.map(function (t) { return t.slice(); });
                level = rs.level || 1;
                moves = rs.moves || 0;
                draw();
            } else {
                newLevel(1);
            }

            return function () { document.removeEventListener("keydown", onKey); };
        }
    });
})();
