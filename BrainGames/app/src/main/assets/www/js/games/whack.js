/* Whack-a-Mole: big grassy board, moles that really pop out of holes, golden moles, bombs and combos */
(function () {
    window.BrainGames.register({
        id: "whack", name: "Whack-a-Mole", icon: "&#128296;",
        gradient: "linear-gradient(135deg,#65A30D,#CA8A04)",
        best: "high", difficulties: true,
        help: {"emoji":"&#128296;","goal":"Bop as many moles as you can in 30 seconds.","steps":["Tap a mole fast before it ducks back down!","Golden moles with a crown are worth 3 points.","Do NOT hit the bombs &#128163; — they cost points.","Hit moles in a row for a combo: x2 at 5, x3 at 10!"]},
        mount: function (host, api) {
            var DIFF = {
                easy:   { up: 1500, floor: 850, max: 2, gold: 0.10, bomb: 0.06, gap: 650 },
                medium: { up: 1150, floor: 600, max: 2, gold: 0.10, bomb: 0.10, gap: 480 },
                hard:   { up: 900,  floor: 430, max: 3, gold: 0.09, bomb: 0.14, gap: 340 }
            }[api.difficulty] || { up: 1150, floor: 600, max: 2, gold: 0.10, bomb: 0.10, gap: 480 };
            var GAME = 30;
            var sp = api.space(), size = Math.round(Math.min(sp.w, sp.h * 0.98, sp.isTV ? 640 : 700));
            var score, timeLeft, running = false, holes = [], combo, bestCombo, hits, misses, spawnT, tickT, startT, endsAt, lastPointer = 0;

            var sScore = stat("Score", "0"), sTime = stat("Time", GAME + "s"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sTime.box, sBest.box]));
            var field = api.el("div", { class: "wm-field", style: "width:" + size + "px;height:" + Math.round(size * 1.02) + "px;font-size:" + Math.round(size / 22) + "px" });
            var bar = api.el("div", { class: "wm-bar" }, api.el("i"));
            var comboEl = api.el("div", { class: "wm-combo" });
            var grid = api.el("div", { class: "wm-grid" });
            var cover = api.el("div", { class: "wm-cover" });
            field.appendChild(bar); field.appendChild(comboEl); field.appendChild(grid); field.appendChild(cover);
            host.appendChild(field);
            host.appendChild(api.el("div", { class: "small-note", html: "Golden mole = 3 points &middot; Don't hit the &#128163;!" }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            for (var i = 0; i < 9; i++) (function (i) {
                var btn = api.el("button", { class: "wm-hole", "aria-label": "Hole " + (i + 1) });
                var pit = api.el("div", { class: "wm-pit" });
                var clip = api.el("div", { class: "wm-clip" });
                var critter = api.el("div", { class: "wm-critter" });
                clip.appendChild(critter);
                btn.appendChild(pit); btn.appendChild(clip); btn.appendChild(api.el("div", { class: "wm-lip" }));
                btn.addEventListener("pointerdown", function (e) { lastPointer = Date.now(); e.preventDefault(); whack(i, e); });
                btn.addEventListener("click", function () { if (Date.now() - lastPointer > 400) whack(i, null); });
                holes.push({ btn: btn, critter: critter, kind: null, timer: null, hit: false });
                grid.appendChild(btn);
            })(i);

            function critterHTML(kind) {
                if (kind === "bomb") return "<div class='wm-bomb'><span class='fuse'></span><span class='spark'></span></div>";
                return "<div class='wm-mole" + (kind === "gold" ? " gold" : "") + "'>" +
                    (kind === "gold" ? "<span class='crown'>&#128081;</span>" : "") +
                    "<span class='eye l'></span><span class='eye r'></span><span class='cheek l'></span><span class='cheek r'></span>" +
                    "<span class='nose'></span><span class='teeth'></span><span class='paw l'></span><span class='paw r'></span></div>";
            }

            function showCover(html, btnText, onGo) {
                cover.innerHTML = ""; cover.hidden = false;
                cover.appendChild(api.el("div", { class: "wm-cover-in", html: html }));
                if (btnText) cover.appendChild(api.el("button", { class: "btn primary wm-start", text: btnText, onclick: onGo }));
            }
            function idle() {
                showCover("<div class='wm-big'>&#128296;</div><div class='wm-title'>Whack-a-Mole</div><div class='wm-sub'>30 seconds &middot; how many can you bop?</div>", "Start", countdown);
            }
            function countdown() {
                var n = 3;
                clearTimeout(startT);
                (function step() {
                    if (n === 0) { cover.hidden = true; start(); return; }
                    showCover("<div class='wm-count'>" + n + "</div>"); api.sound.tick(); n--;
                    startT = setTimeout(step, 650);
                })();
            }

            function start() {
                running = true; score = 0; combo = 0; bestCombo = 0; hits = 0; misses = 0;
                endsAt = Date.now() + GAME * 1000; timeLeft = GAME;
                sScore.val.textContent = "0"; sTime.val.textContent = GAME + "s"; paintCombo();
                holes.forEach(function (h) { hide(h, true); });
                tickT = setInterval(tick, 100);
                spawn();
            }
            function tick() {
                var left = Math.max(0, (endsAt - Date.now()) / 1000);
                bar.firstChild.style.width = (left / GAME * 100) + "%";
                field.classList.toggle("hurry", left <= 5);
                var s = Math.ceil(left);
                if (s !== timeLeft) { timeLeft = s; sTime.val.textContent = s + "s"; if (s <= 5 && s > 0) api.sound.tick(); }
                if (left <= 0) end();
            }
            function spawn() {
                if (!running) return;
                var elapsed = GAME - (endsAt - Date.now()) / 1000;
                var maxUp = elapsed < 8 ? 1 : elapsed < 18 ? Math.min(2, DIFF.max) : DIFF.max;
                var up = holes.filter(function (h) { return h.kind; }).length;
                if (up < maxUp) {
                    var free = holes.filter(function (h) { return !h.kind; });
                    var h = free[Math.floor(Math.random() * free.length)];
                    var r = Math.random(), kind = r < DIFF.bomb ? "bomb" : r < DIFF.bomb + DIFF.gold ? "gold" : "mole";
                    var stay = Math.max(DIFF.floor, DIFF.up - elapsed * 22) * (kind === "gold" ? 0.75 : kind === "bomb" ? 1.3 : 1);
                    rise(h, kind, stay);
                }
                spawnT = setTimeout(spawn, DIFF.gap * (0.7 + Math.random() * 0.6) * (1 - elapsed / GAME * 0.35));
            }
            function rise(h, kind, stay) {
                h.kind = kind; h.hit = false;
                h.critter.innerHTML = critterHTML(kind);
                h.critter.className = "wm-critter up";
                h.timer = setTimeout(function () {
                    if (h.kind && !h.hit && h.kind !== "bomb") { combo = 0; paintCombo(); }
                    hide(h);
                }, stay);
            }
            function hide(h, now) {
                clearTimeout(h.timer); h.kind = null;
                if (now) { h.critter.className = "wm-critter"; h.critter.innerHTML = ""; } else sink(h);
            }
            // Duck down, then empty the hole so nothing (dizzy stars, a fuse) peeks over the rim.
            function sink(h) {
                h.critter.className = "wm-critter down";
                setTimeout(function () { if (!h.kind) h.critter.innerHTML = ""; }, 220);
            }

            function whack(i, e) {
                if (!running) return;
                var h = holes[i], r = h.btn.getBoundingClientRect();
                var x = e ? e.clientX - r.left : r.width / 2, y = e ? e.clientY - r.top : r.height * 0.4;
                hammer(h.btn, x, y);
                if (!h.kind || h.hit) { misses++; combo = 0; paintCombo(); puff(h.btn, x, y); return; }
                h.hit = true; clearTimeout(h.timer);
                if (h.kind === "bomb") {
                    score = Math.max(0, score - 2); combo = 0; misses++;
                    float(h.btn, "-2", "bad"); api.sound.bad(); api.haptic(60);
                    h.critter.innerHTML = "<div class='wm-boom'>&#128165;</div>";
                    field.classList.remove("shake"); void field.offsetWidth; field.classList.add("shake");
                } else {
                    combo++; hits++; bestCombo = Math.max(bestCombo, combo);
                    var mult = combo >= 10 ? 3 : combo >= 5 ? 2 : 1, pts = (h.kind === "gold" ? 3 : 1) * mult;
                    score += pts;
                    float(h.btn, "+" + pts, h.kind === "gold" ? "gold" : mult > 1 ? "hot" : "");
                    api.sound.pop(); if (h.kind === "gold") api.sound.good(); api.haptic(h.kind === "gold" ? 25 : 12);
                    if (h.critter.firstChild) h.critter.firstChild.classList.add("bonk");
                    if (combo === 5 || combo === 10) api.toast(combo === 5 ? "🔥 Combo x2!" : "🔥🔥 Combo x3!");
                }
                sScore.val.textContent = score; paintCombo();
                h.kind = null;
                setTimeout(function () { if (!h.kind) sink(h); }, 260);
            }
            function paintCombo() {
                comboEl.innerHTML = combo >= 2 ? "&#128293; " + combo + " in a row" + (combo >= 10 ? " &middot; x3" : combo >= 5 ? " &middot; x2" : "") : "";
                comboEl.className = "wm-combo" + (combo >= 2 ? " on" : "") + (combo >= 5 ? " hot" : "");
            }
            function float(node, text, cls) {
                var f = api.el("div", { class: "wm-float " + (cls || ""), text: text });
                node.appendChild(f); setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 750);
            }
            function hammer(node, x, y) {
                var hm = api.el("div", { class: "wm-hammer", html: "&#128296;", style: "left:" + x + "px;top:" + y + "px" });
                node.appendChild(hm); setTimeout(function () { if (hm.parentNode) hm.parentNode.removeChild(hm); }, 260);
            }
            function puff(node, x, y) {
                var p = api.el("div", { class: "wm-puff", style: "left:" + x + "px;top:" + y + "px" });
                node.appendChild(p); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 400);
            }

            function end() {
                if (!running) return;
                running = false; clearInterval(tickT); clearTimeout(spawnT);
                field.classList.remove("hurry");
                holes.forEach(function (h) { hide(h); });
                var acc = hits + misses ? Math.round(hits / (hits + misses) * 100) : 0;
                var rec = api.setBest(score); sBest.val.textContent = api.getBest() || score;
                api.sound.win(); api.haptic(30);
                showCover("<div class='wm-big'>&#9200;</div><div class='wm-title'>Time's up!</div>", "Play again", countdown);
                api.overlay({ emoji: rec ? "&#127942;" : "&#128296;", title: rec ? "New best!" : "Time's up!",
                    sub: "<b style='font-size:1.6em'>" + score + "</b> points<br>Best combo " + bestCombo + " &middot; " + acc + "% accuracy",
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: countdown } ] });
            }

            function key(e) {
                var map = { "7": 0, "8": 1, "9": 2, "4": 3, "5": 4, "6": 5, "1": 6, "2": 7, "3": 8 };
                if (running && map[e.key] !== undefined) { whack(map[e.key], null); e.preventDefault(); }
            }
            window.addEventListener("keydown", key);
            idle();
            return function () { running = false; clearInterval(tickT); clearTimeout(spawnT); clearTimeout(startT); holes.forEach(function (h) { clearTimeout(h.timer); }); window.removeEventListener("keydown", key); };
        }
    });
})();
