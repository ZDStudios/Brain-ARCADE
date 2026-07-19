/* Rush Hour — get the red car out of the jam */
(function () {
    var LEVELS = [
        [ {id:"X",x:1,y:2,len:2,dir:"h"}, {id:"A",x:4,y:2,len:3,dir:"v"}, {id:"B",x:0,y:0,len:2,dir:"h"}, {id:"C",x:3,y:0,len:2,dir:"v"} ],
        [ {id:"X",x:0,y:2,len:2,dir:"h"}, {id:"A",x:2,y:0,len:3,dir:"v"}, {id:"B",x:3,y:1,len:2,dir:"v"}, {id:"C",x:2,y:4,len:2,dir:"h"}, {id:"D",x:5,y:2,len:3,dir:"v"} ],
        [ {id:"X",x:1,y:2,len:2,dir:"h"}, {id:"A",x:0,y:0,len:2,dir:"v"}, {id:"B",x:3,y:0,len:2,dir:"h"}, {id:"C",x:3,y:1,len:3,dir:"v"}, {id:"D",x:0,y:3,len:3,dir:"h"}, {id:"E",x:5,y:3,len:2,dir:"v"}, {id:"F",x:2,y:5,len:2,dir:"h"} ],
        [ {id:"X",x:2,y:2,len:2,dir:"h"}, {id:"A",x:0,y:0,len:3,dir:"h"}, {id:"B",x:4,y:0,len:2,dir:"v"}, {id:"C",x:5,y:0,len:3,dir:"v"}, {id:"D",x:0,y:1,len:2,dir:"v"}, {id:"E",x:1,y:3,len:2,dir:"v"}, {id:"F",x:3,y:4,len:3,dir:"h"} ]
    ];
    window.BrainGames.register({
        id: "rushhour", name: "Rush Hour", icon: "&#128663;",
        gradient: "linear-gradient(135deg,#B91C1C,#F59E0B)",
        best: "low", bestLabel: "Best", bestSuffix: " moves",
        help: { emoji: "&#128663;", goal: "Drive the red car out through the exit on the right.", steps: [
            "Cars only slide forwards and backwards, never sideways.",
            "Tap a car to pick it — it lifts up and shows blue arrows.",
            "Tap a glowing arrow to slide that car into an empty space.",
            "Clear a path, then slide the red car off the right side to win!" ] },
        mount: function (host, api) {
            var N = 6, cars, sel, moves, level = api.load("level", 0) % LEVELS.length, solved;
            var COLORS = { X:"#EF4444", A:"#22D3EE", B:"#A78BFA", C:"#34D399", D:"#FBBF24", E:"#F472B6", F:"#60A5FA", G:"#FB923C" };

            var sLevel = stat("Level", (level + 1) + ""), sMoves = stat("Moves", "0"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sLevel.box, sMoves.box, sBest.box]));
            var size = Math.min(api.space().board, 420);
            var cell = Math.floor(size / N);
            var boardEl = api.el("div", { style: "position:relative;width:" + (cell * N) + "px;height:" + (cell * N) + "px;background:linear-gradient(135deg,#1b2440,#0E1428);border-radius:12px;box-shadow:inset 0 0 0 3px rgba(255,255,255,0.05)" });
            boardEl.appendChild(api.el("div", { style: "position:absolute;right:-6px;top:" + (2 * cell) + "px;height:" + cell + "px;width:14px;display:grid;place-items:center;color:#EF4444;font-size:" + Math.floor(cell*0.5) + "px;font-weight:900", html: "&#8594;" }));
            host.appendChild(api.el("div", { class: "board-wrap", style: "overflow:visible;padding:14px" }, boardEl));
            var hint = api.el("div", { class: "small-note", html: "Tap a car, then tap a blue arrow to slide it. Free the red car! &#128663;" });
            host.appendChild(hint);
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

            function buildCar(c) {
                var horiz = c.dir === "h";
                var w = (horiz ? c.len : 1) * cell - 8, h = (horiz ? 1 : c.len) * cell - 8;
                var base = COLORS[c.id] || "#94A3B8";
                var hero = c.id === "X";
                var d = api.el("div", { class: "rh-car" + (sel === c.id ? " sel" : ""), style:
                    "position:absolute;left:" + (c.x * cell + 4) + "px;top:" + (c.y * cell + 4) + "px;width:" + w + "px;height:" + h + "px;" +
                    "border-radius:" + Math.floor(cell*0.28) + "px;cursor:pointer;transition:left .18s,top .18s,transform .1s;" +
                    "background:linear-gradient(" + (horiz ? "180deg" : "90deg") + ",rgba(255,255,255,0.45)," + base + " 55%," + base + ");" +
                    "box-shadow:inset 0 0 0 2px rgba(255,255,255,0.35), 0 5px 10px rgba(0,0,0,0.4);overflow:hidden" });
                var roofPad = Math.floor(cell * 0.16);
                d.appendChild(api.el("div", { style: "position:absolute;inset:" + roofPad + "px;border-radius:" + Math.floor(cell*0.18) + "px;background:rgba(255,255,255,0.28)" }));
                var glass = api.el("div", { style: "position:absolute;background:rgba(11,16,32,0.55);border-radius:3px;" + (horiz
                    ? "top:" + Math.floor(h*0.18) + "px;bottom:" + Math.floor(h*0.18) + "px;width:" + Math.floor(cell*0.34) + "px;" + (hero ? "right:" + Math.floor(cell*0.28) + "px" : "left:50%;transform:translateX(-50%)")
                    : "left:" + Math.floor(w*0.18) + "px;right:" + Math.floor(w*0.18) + "px;height:" + Math.floor(cell*0.34) + "px;top:50%;transform:translateY(-50%)") });
                d.appendChild(glass);
                if (hero) {
                    var eye = "position:absolute;width:" + Math.floor(cell*0.16) + "px;height:" + Math.floor(cell*0.16) + "px;border-radius:50%;background:#fff";
                    var e1 = api.el("div", { style: eye + ";right:" + Math.floor(cell*0.10) + "px;top:" + Math.floor(h*0.26) + "px" });
                    var e2 = api.el("div", { style: eye + ";right:" + Math.floor(cell*0.10) + "px;bottom:" + Math.floor(h*0.26) + "px" });
                    e1.appendChild(api.el("div", { style: "position:absolute;right:1px;top:35%;width:38%;height:38%;border-radius:50%;background:#111" }));
                    e2.appendChild(api.el("div", { style: "position:absolute;right:1px;top:35%;width:38%;height:38%;border-radius:50%;background:#111" }));
                    d.appendChild(e1); d.appendChild(e2);
                }
                d.addEventListener("click", function (e) { e.stopPropagation(); if (solved) return; sel = (sel === c.id ? null : c.id); api.sound.click(); api.haptic(6); render(); });
                return d;
            }

            function render() {
                boardEl.querySelectorAll(".rh-car,.rh-arrow").forEach(function (e) { e.remove(); });
                cars.forEach(function (c) { boardEl.appendChild(buildCar(c)); });
                if (sel && !solved) addArrows(cars.filter(function (c) { return c.id === sel; })[0]);
            }
            function addArrows(car) {
                var g = occ();
                var opts = car.dir === "h"
                    ? [ { dx:-1, cx: car.x-1, cy: car.y, gly:"&#8592;" }, { dx:1, cx: car.x+car.len, cy: car.y, gly:"&#8594;" } ]
                    : [ { dy:-1, cx: car.x, cy: car.y-1, gly:"&#8593;" }, { dy:1, cx: car.x, cy: car.y+car.len, gly:"&#8595;" } ];
                opts.forEach(function (o) {
                    if (o.cx < 0 || o.cx >= N || o.cy < 0 || o.cy >= N || g[o.cx + "," + o.cy]) return;
                    var b = api.el("button", { class: "rh-arrow", html: o.gly, style:
                        "position:absolute;left:" + (o.cx*cell + cell*0.15) + "px;top:" + (o.cy*cell + cell*0.15) + "px;width:" + (cell*0.7) + "px;height:" + (cell*0.7) + "px" });
                    b.addEventListener("click", function (e) { e.stopPropagation(); step(car, o.dx || 0, o.dy || 0); });
                    boardEl.appendChild(b);
                });
            }
            function step(car, dx, dy) {
                if (solved) return;
                var g = occ();
                var checkX = car.dir === "h" ? (dx > 0 ? car.x + car.len : car.x - 1) : car.x;
                var checkY = car.dir === "v" ? (dy > 0 ? car.y + car.len : car.y - 1) : car.y;
                if (checkX < 0 || checkX >= N || checkY < 0 || checkY >= N || g[checkX + "," + checkY]) { api.sound.bad(); return; }
                car.x += dx; car.y += dy;
                moves++; sMoves.val.textContent = moves; api.sound.move(); api.haptic(8);
                render();
                if (car.id === "X" && car.x + car.len - 1 === N - 1) win();
            }
            function win() {
                solved = true; sel = null; render(); var rec = api.setBest(moves); api.sound.win(); api.haptic(40);
                api.overlay({ emoji: "&#128663;", title: "You freed it!", sub: "Level " + (level + 1) + " in <b>" + moves + "</b> moves" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Next level", primary: true, onClick: function () { level = (level + 1) % LEVELS.length; api.save("level", level); load(level); } } ] });
            }
            function load(lv) {
                cars = LEVELS[lv].map(function (c) { return { id: c.id, x: c.x, y: c.y, len: c.len, dir: c.dir }; });
                sel = null; moves = 0; solved = false; sMoves.val.textContent = "0"; sLevel.val.textContent = (lv + 1);
                render();
            }
            boardEl.addEventListener("click", function () { if (sel) { sel = null; render(); } });
            load(level);
            return function () {};
        }
    });
})();
