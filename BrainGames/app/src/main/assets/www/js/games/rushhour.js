/* Rush Hour — get the red car out of the jam */
(function () {
    var LEVELS = [
        [ {id:"X",x:1,y:2,len:2,dir:"h",t:1}, {id:"A",x:4,y:2,len:3,dir:"v"}, {id:"B",x:0,y:0,len:2,dir:"h"}, {id:"C",x:3,y:0,len:2,dir:"v"} ],
        [ {id:"X",x:0,y:2,len:2,dir:"h",t:1}, {id:"A",x:2,y:0,len:3,dir:"v"}, {id:"B",x:3,y:1,len:2,dir:"v"}, {id:"C",x:2,y:4,len:2,dir:"h"}, {id:"D",x:5,y:2,len:3,dir:"v"} ],
        [ {id:"X",x:1,y:2,len:2,dir:"h",t:1}, {id:"A",x:0,y:0,len:2,dir:"v"}, {id:"B",x:3,y:0,len:2,dir:"h"}, {id:"C",x:3,y:1,len:3,dir:"v"}, {id:"D",x:0,y:3,len:3,dir:"h"}, {id:"E",x:5,y:3,len:2,dir:"v"}, {id:"F",x:2,y:5,len:2,dir:"h"} ],
        [ {id:"X",x:2,y:2,len:2,dir:"h",t:1}, {id:"A",x:0,y:0,len:3,dir:"h"}, {id:"B",x:4,y:0,len:2,dir:"v"}, {id:"C",x:5,y:0,len:3,dir:"v"}, {id:"D",x:0,y:1,len:2,dir:"v"}, {id:"E",x:1,y:3,len:2,dir:"v"}, {id:"F",x:3,y:4,len:3,dir:"h"} ]
    ];
    window.BrainGames.register({
        id: "rushhour", name: "Rush Hour", icon: "&#128663;",
        gradient: "linear-gradient(135deg,#B91C1C,#F59E0B)",
        best: "low", bestLabel: "Best", bestSuffix: " moves",
        mount: function (host, api) {
            var N = 6, cars, sel, moves, level = api.load("level", 0) % LEVELS.length, solved;
            var COLORS = { X:"#EF4444", A:"#22D3EE", B:"#A78BFA", C:"#34D399", D:"#FBBF24", E:"#F472B6", F:"#60A5FA", G:"#FB923C" };

            var sLevel = stat("Level", (level + 1) + ""), sMoves = stat("Moves", "0"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sLevel.box, sMoves.box, sBest.box]));
            var size = Math.min(api.space().board, 420);
            var cell = Math.floor(size / N);
            var boardEl = api.el("div", { style: "position:relative;width:" + (cell * N) + "px;height:" + (cell * N) + "px;background:#0E1428;border-radius:10px" });
            // exit marker
            boardEl.appendChild(api.el("div", { style: "position:absolute;right:-6px;top:" + (2 * cell + cell * 0.2) + "px;width:12px;height:" + (cell * 0.6) + "px;background:#EF4444;border-radius:3px" }));
            host.appendChild(api.el("div", { class: "board-wrap", style: "overflow:visible" }, boardEl));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap the red car, then tap a space to slide it. Free it out the right!" }));
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn ghost", text: "Restart", onclick: function () { load(level); } }),
                api.el("button", { class: "btn", text: "Next level", onclick: function () { level = (level + 1) % LEVELS.length; api.save("level", level); load(level); } })
            ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function occ() {
                var g = {};
                cars.forEach(function (c) { for (var k = 0; k < c.len; k++) { var x = c.x + (c.dir === "h" ? k : 0), y = c.y + (c.dir === "v" ? k : 0); g[x + "," + y] = c.id; } });
                return g;
            }
            var carEls = {};
            function render() {
                boardEl.querySelectorAll(".car").forEach(function (e) { e.remove(); });
                carEls = {};
                cars.forEach(function (c) {
                    var w = (c.dir === "h" ? c.len : 1) * cell - 6, h = (c.dir === "v" ? c.len : 1) * cell - 6;
                    var d = api.el("div", { class: "car", style: "position:absolute;left:" + (c.x * cell + 3) + "px;top:" + (c.y * cell + 3) + "px;width:" + w + "px;height:" + h + "px;border-radius:9px;background:" + (COLORS[c.id] || "#94A3B8") + ";box-shadow:inset 0 -4px 0 rgba(0,0,0,0.25), inset 0 4px 0 rgba(255,255,255,0.25);transition:left .15s,top .15s;cursor:pointer;" + (sel === c.id ? "outline:3px solid #fff;" : "") + (c.id === "X" ? "background-image:radial-gradient(circle at 30% 30%,#FCA5A5,#EF4444);" : "") });
                    d.addEventListener("click", function (e) { e.stopPropagation(); sel = (sel === c.id ? null : c.id); api.sound.click(); render(); });
                    carEls[c.id] = d; boardEl.appendChild(d);
                });
            }
            function cellFromEvent(e) {
                var rect = boardEl.getBoundingClientRect();
                var px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
                var py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
                return { x: Math.floor(px / cell), y: Math.floor(py / cell) };
            }
            boardEl.addEventListener("click", function (e) {
                if (!sel || solved) return;
                var car = cars.filter(function (c) { return c.id === sel; })[0];
                var p = cellFromEvent(e);
                slide(car, p.x, p.y);
            });
            function slide(car, tx, ty) {
                var g = occ();
                if (car.dir === "h") {
                    if (ty < car.y || ty >= car.y + 1) return;
                    var target = tx;
                    if (target < car.x) { // move left
                        var nx = car.x;
                        while (nx - 1 >= 0 && !g[(nx - 1) + "," + car.y]) { nx--; if (nx <= target) break; }
                        if (nx !== car.x) { car.x = nx; done(car); }
                    } else if (target > car.x + car.len - 1) { // move right
                        var nx2 = car.x;
                        while (nx2 + car.len <= N - 1 && !g[(nx2 + car.len) + "," + car.y]) { nx2++; if (nx2 + car.len - 1 >= target) break; }
                        if (nx2 !== car.x) { car.x = nx2; done(car); }
                    }
                } else {
                    if (tx < car.x || tx >= car.x + 1) return;
                    var t2 = ty;
                    if (t2 < car.y) { var ny = car.y; while (ny - 1 >= 0 && !g[car.x + "," + (ny - 1)]) { ny--; if (ny <= t2) break; } if (ny !== car.y) { car.y = ny; done(car); } }
                    else if (t2 > car.y + car.len - 1) { var ny2 = car.y; while (ny2 + car.len <= N - 1 && !g[car.x + "," + (ny2 + car.len)]) { ny2++; if (ny2 + car.len - 1 >= t2) break; } if (ny2 !== car.y) { car.y = ny2; done(car); } }
                }
            }
            function done(car) {
                moves++; sMoves.val.textContent = moves; api.sound.move(); api.haptic(8); render();
                if (car.id === "X" && car.x + car.len - 1 === N - 1) win();
            }
            function win() {
                solved = true; var rec = api.setBest(moves); api.sound.win(); api.haptic(40);
                api.overlay({ emoji: "&#128663;", title: "Escaped!", sub: "Level " + (level + 1) + " in <b>" + moves + "</b> moves" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Next level", primary: true, onClick: function () { level = (level + 1) % LEVELS.length; api.save("level", level); load(level); } } ] });
            }
            function load(lv) {
                cars = LEVELS[lv].map(function (c) { return { id: c.id, x: c.x, y: c.y, len: c.len, dir: c.dir }; });
                sel = null; moves = 0; solved = false; sMoves.val.textContent = "0"; sLevel.val.textContent = (lv + 1);
                render();
            }
            load(level);
            return function () {};
        }
    });
})();
