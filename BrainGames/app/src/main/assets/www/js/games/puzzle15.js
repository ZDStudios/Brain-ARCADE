/* 15-Puzzle sliding tiles */
(function () {
    window.BrainGames.register({
        id: "puzzle15", name: "15 Puzzle", icon: "&#128302;",
        gradient: "linear-gradient(135deg,#0891B2,#4F46E5)",
        best: "low", bestLabel: "Best", bestSuffix: " moves",
        mount: function (host, api) {
            var N = 4, tiles, blank, moves, solvedGame;

            var sMoves = stat("Moves", "0"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sMoves.box, sBest.box]));
            var size = Math.min(api.space().board, 380);
            var gap = 8, cellPx = Math.floor((size - gap * (N + 1)) / N);
            var boardEl = api.el("div", { style: "position:relative;width:" + (cellPx * N + gap * (N + 1)) + "px;height:" + (cellPx * N + gap * (N + 1)) + "px;background:var(--card-2);border-radius:12px" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            host.appendChild(api.el("div", { class: "small-note", text: "Slide tiles to arrange 1–15 in order." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Shuffle", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function pos(i) { return gap + i * (cellPx + gap); }

            var tileEls = [];
            function build() {
                boardEl.innerHTML = ""; tileEls = [];
                for (var i = 0; i < 16; i++) {
                    var t = api.el("div", { style: "position:absolute;width:" + cellPx + "px;height:" + cellPx + "px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:" + Math.floor(cellPx * 0.4) + "px;color:#fff;transition:left .12s,top .12s;background:linear-gradient(135deg,#4F46E5,#0891B2)" });
                    (function (t) { t.addEventListener("click", function () { clickTile(t._val); }); })(t);
                    tileEls.push(t); boardEl.appendChild(t);
                }
            }
            function render() {
                for (var idx = 0; idx < 16; idx++) {
                    var v = tiles[idx]; var el = tileEls[v];
                    if (v === 0) { el.style.display = "none"; continue; }
                    el.style.display = "grid"; el._val = v; el.textContent = v;
                    var r = Math.floor(idx / N), c = idx % N;
                    el.style.left = pos(c) + "px"; el.style.top = pos(r) + "px";
                }
                sMoves.val.textContent = moves;
            }
            function clickTile(v) {
                if (solvedGame) return;
                var idx = tiles.indexOf(v), bi = tiles.indexOf(0);
                var r = Math.floor(idx / N), c = idx % N, br = Math.floor(bi / N), bc = bi % N;
                if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return;
                tiles[bi] = v; tiles[idx] = 0; moves++; api.sound.move(); api.haptic(6); render();
                if (isSolved()) win();
            }
            function slide(dir) {
                if (solvedGame) return;
                var bi = tiles.indexOf(0), r = Math.floor(bi / N), c = bi % N, tr = r, tc = c;
                if (dir === "up") tr = r + 1; else if (dir === "down") tr = r - 1; else if (dir === "left") tc = c + 1; else if (dir === "right") tc = c - 1;
                if (tr < 0 || tr >= N || tc < 0 || tc >= N) return;
                clickTile(tiles[tr * N + tc]);
            }
            function isSolved() { for (var i = 0; i < 15; i++) if (tiles[i] !== i + 1) return false; return tiles[15] === 0; }
            function solvable(arr) {
                var inv = 0, flat = arr.filter(function (v) { return v; });
                for (var i = 0; i < flat.length; i++) for (var j = i + 1; j < flat.length; j++) if (flat[i] > flat[j]) inv++;
                var blankRow = Math.floor(arr.indexOf(0) / N);
                return ((N % 2 === 1) ? (inv % 2 === 0) : ((inv + (N - blankRow)) % 2 === 1));
            }
            function win() {
                solvedGame = true; var rec = api.setBest(moves); api.sound.win(); api.haptic(30);
                api.overlay({ emoji: "&#127881;", title: "Solved!", sub: "In <b>" + moves + "</b> moves" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Shuffle", primary: true, onClick: reset } ] });
            }
            function reset() {
                solvedGame = false; moves = 0;
                do { tiles = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]; for (var i = tiles.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = tiles[i]; tiles[i] = tiles[j]; tiles[j] = t; } } while (!solvable(tiles) || isSolved());
                render();
            }
            var sx, sy;
            boardEl.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
            boardEl.addEventListener("touchend", function (e) { var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
                if (Math.abs(dx) > Math.abs(dy)) slide(dx > 0 ? "right" : "left"); else slide(dy > 0 ? "down" : "up"); });
            function key(e) { var m = { ArrowUp:"up", ArrowDown:"down", ArrowLeft:"left", ArrowRight:"right" }; if (e.key in m) { e.preventDefault(); slide(m[e.key]); } }
            window.addEventListener("keydown", key);
            build(); reset();
            return function () { window.removeEventListener("keydown", key); };
        }
    });
})();
