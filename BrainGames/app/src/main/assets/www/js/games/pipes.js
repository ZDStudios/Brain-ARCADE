/* Pipe Flow — spin the pipes until water reaches every house.
   Spatial reasoning and planning: every tap rotates one tile a quarter turn, and
   you have to picture how each turn changes the path before you make it. Water
   floods along whatever is connected as you play, so progress is visible and the
   board lighting up is its own reward.

   Every board is built from a random spanning tree rooted at the tap, then each
   tile is spun to a random angle — so a solution always exists, and it uses
   every pipe with no leaks. */
(function () {
    var N_ = 1, E_ = 2, S_ = 4, W_ = 8;
    var DIRS = [{ b: N_, dx: 0, dy: -1, o: S_ }, { b: E_, dx: 1, dy: 0, o: W_ }, { b: S_, dx: 0, dy: 1, o: N_ }, { b: W_, dx: -1, dy: 0, o: E_ }];
    function rot(mask, turns) {
        var t = ((turns % 4) + 4) % 4, m = mask;
        for (var i = 0; i < t; i++) m = ((m << 1) | (m >> 3)) & 15;   // clockwise
        return m;
    }
    function bits(m) { var c = 0; for (var i = 0; i < 4; i++) if (m & (1 << i)) c++; return c; }

    /** Random spanning tree over an n×n grid, rooted at the source. */
    function build(n) {
        var masks = new Array(n * n).fill(0), seen = new Array(n * n).fill(false);
        var src = Math.floor(n / 2) * n + Math.floor(n / 2);
        var frontier = [];
        function addEdges(i) {
            var x = i % n, y = Math.floor(i / n);
            DIRS.forEach(function (d) {
                var nx = x + d.dx, ny = y + d.dy;
                if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
                var j = ny * n + nx;
                if (!seen[j]) frontier.push([i, j, d]);
            });
        }
        seen[src] = true; addEdges(src);
        while (frontier.length) {
            // random Prim's: branchy, interesting networks rather than long corridors
            var k = Math.floor(Math.random() * frontier.length);
            var e = frontier.splice(k, 1)[0];
            if (seen[e[1]]) continue;
            seen[e[1]] = true;
            masks[e[0]] |= e[2].b;
            masks[e[1]] |= e[2].o;
            addEdges(e[1]);
        }
        return { masks: masks, src: src };
    }

    window.BrainGames.register({
        id: "pipes", name: "Pipe Flow", icon: "&#128688;",
        gradient: "linear-gradient(135deg,#0EA5E9,#22C55E)",
        best: "high", bestLabel: "Level",
        difficulties: true, resumable: true,
        help: {
            emoji: "&#128688;", goal: "Turn the pipes so water from the tap reaches every house.",
            steps: [
                "Tap a pipe to turn it a quarter turn.",
                "Water flows from the tap in the middle along every pipe that joins up.",
                "Get water to every house — no gaps, no leaks.",
                "Each level gets bigger. Plan ahead to use fewer turns!"
            ]
        },
        mount: function (host, api) {
            var BASE = { easy: 4, medium: 5, hard: 6 }[api.difficulty] || 5;
            var n, level = 1, base, turns, src, wet, taps = 0, solved = false, best = api.getBest() || 0, focus = -1;

            var sLevel = stat("Level", "1"), sTaps = stat("Turns", "0"), sHouses = stat("Houses", "0/0");
            host.appendChild(api.el("div", { class: "game-topline" }, [sLevel.box, sTaps.box, sHouses.box]));
            var gridEl = api.el("div", { class: "pf-grid" });
            host.appendChild(api.el("div", { class: "board-wrap" }, gridEl));
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn ghost", text: "New board", onclick: function () { api.sound.click(); newLevel(level); } })
            ]));

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            function tileSvg(mask, isSrc, isLeaf) {
                var arms = "";
                if (mask & N_) arms += '<line x1="50" y1="50" x2="50" y2="-4"/>';
                if (mask & E_) arms += '<line x1="50" y1="50" x2="104" y2="50"/>';
                if (mask & S_) arms += '<line x1="50" y1="50" x2="50" y2="104"/>';
                if (mask & W_) arms += '<line x1="50" y1="50" x2="-4" y2="50"/>';
                var hub = isSrc ? '<circle class="pf-src" cx="50" cy="50" r="24"/>'
                        : isLeaf ? '<rect class="pf-house" x="31" y="31" width="38" height="38" rx="8"/>'
                        : '<circle cx="50" cy="50" r="13"/>';
                return '<svg viewBox="0 0 100 100" class="pf-svg">' + '<g class="pf-pipe">' + arms + hub + '</g></svg>';
            }

            function draw() {
                gridEl.innerHTML = "";
                var size = Math.floor(Math.min(api.space().board, 460) / n) - 4;
                gridEl.style.gridTemplateColumns = "repeat(" + n + "," + size + "px)";
                for (var i = 0; i < n * n; i++) {
                    (function (i) {
                        var leaf = bits(base[i]) === 1 && i !== src;
                        var b = api.el("button", { class: "pf-tile" + (i === src ? " src" : "") + (leaf ? " leaf" : ""), style: "width:" + size + "px;height:" + size + "px" });
                        var inner = api.el("div", { class: "pf-spin", html: tileSvg(base[i], i === src, leaf) });
                        inner.style.transform = "rotate(" + (turns[i] * 90) + "deg)";
                        b.appendChild(inner);
                        b.addEventListener("click", function () { spin(i); });
                        gridEl.appendChild(b);
                    })(i);
                }
                flow(false);
            }

            /** Which tiles does water reach right now? */
            function flow(announce) {
                var reach = new Array(n * n).fill(false), q = [src];
                reach[src] = true;
                while (q.length) {
                    var i = q.shift(), m = rot(base[i], turns[i]), x = i % n, y = Math.floor(i / n);
                    DIRS.forEach(function (d) {
                        if (!(m & d.b)) return;
                        var nx = x + d.dx, ny = y + d.dy;
                        if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
                        var j = ny * n + nx;
                        if (reach[j]) return;
                        if (rot(base[j], turns[j]) & d.o) { reach[j] = true; q.push(j); }
                    });
                }
                var tiles = gridEl.children, gained = 0, houses = 0, wetHouses = 0;
                for (var k = 0; k < n * n; k++) {
                    var was = wet && wet[k];
                    if (reach[k] && !was) gained++;
                    tiles[k].classList.toggle("wet", reach[k]);
                    if (tiles[k].classList.contains("leaf")) { houses++; if (reach[k]) wetHouses++; }
                }
                wet = reach;
                sHouses.val.textContent = wetHouses + "/" + houses;
                if (announce && gained > 0) { api.sound.pop(); api.haptic(6); }
                return reach.every(Boolean);
            }

            function spin(i) {
                if (solved) return;
                turns[i]++;
                taps++;
                sTaps.val.textContent = String(taps);
                var tile = gridEl.children[i];
                tile.firstChild.style.transform = "rotate(" + (turns[i] * 90) + "deg)";
                focus = i;
                api.sound.tick();
                var done = flow(true);
                save();
                if (done) win();
            }

            function win() {
                solved = true;
                api.clearState();
                api.sound.win(); api.haptic(35);
                gridEl.classList.add("pf-won");
                var rec = level > best;
                if (rec) best = level;
                api.setBest(level);
                setTimeout(function () {
                    api.overlay({
                        emoji: "&#128167;", title: "Water everywhere!",
                        sub: "Level " + level + " solved in <b>" + taps + "</b> turns." + (rec ? "<br>New best level! &#127942;" : ""),
                        buttons: [{ label: "Home", onClick: api.exit }, { label: "Next level", primary: true, onClick: function () { newLevel(level + 1); } }]
                    });
                }, 650);
            }

            function newLevel(lv) {
                level = lv;
                n = Math.min(8, BASE + Math.floor((level - 1) / 3));   // a size up every three levels
                var t = build(n);
                base = t.masks; src = t.src;
                turns = base.map(function () { return Math.floor(Math.random() * 4); });
                // never hand over a board that is already solved
                wet = null; taps = 0; solved = false;
                gridEl.classList.remove("pf-won");
                sLevel.val.textContent = String(level); sTaps.val.textContent = "0";
                draw();
                if (flow(false)) { turns[(src + 1) % (n * n)]++; draw(); }
                save();
            }
            function save() {
                if (solved) return;
                api.saveState({ level: level, n: n, base: base, turns: turns, src: src, taps: taps });
            }

            function onKey(e) {
                var k = e.key;
                if (!/^Arrow|^Enter$|^ $/.test(k)) return;
                if (focus < 0) focus = src;
                var x = focus % n, y = Math.floor(focus / n);
                if (k === "ArrowLeft") x = (x + n - 1) % n;
                else if (k === "ArrowRight") x = (x + 1) % n;
                else if (k === "ArrowUp") y = (y + n - 1) % n;
                else if (k === "ArrowDown") y = (y + 1) % n;
                else { spin(focus); e.preventDefault(); return; }
                focus = y * n + x;
                [].forEach.call(gridEl.children, function (t, i) { t.classList.toggle("nav-here", i === focus); });
                e.preventDefault();
            }
            document.addEventListener("keydown", onKey);

            var rs = api.resumeState;
            if (rs && rs.base && rs.turns && rs.n) {
                level = rs.level || 1; n = rs.n; base = rs.base; turns = rs.turns; src = rs.src; taps = rs.taps || 0;
                wet = null; solved = false;
                sLevel.val.textContent = String(level); sTaps.val.textContent = String(taps);
                draw();
            } else newLevel(1);

            return function () { document.removeEventListener("keydown", onKey); };
        }
    });
})();
