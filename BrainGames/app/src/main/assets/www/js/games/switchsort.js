/* Switch Sort — sort by colour… until the rule switches to shape.
   Each card is blue or orange, and a circle or a triangle. Under the COLOUR rule
   blue goes left and orange goes right; under the SHAPE rule circles go left and
   triangles go right. The rule keeps changing mid-round, so your brain has to
   throw away the old habit and apply the new one instantly.

   That is "task switching" (cognitive flexibility) — the same thing measured by
   switch-cost tests — dressed up as a fast arcade game. Speed bonus + combo
   multiplier is what makes it moreish. */
(function () {
    var BLUE = "#60A5FA", ORANGE = "#FB923C";
    function shape(isCircle, isBlue, size) {
        var f = isBlue ? BLUE : ORANGE;
        var body = isCircle ? '<circle cx="50" cy="50" r="38"/>' : '<polygon points="50,10 90,86 10,86"/>';
        return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="' + f + '">' + body + '</svg>';
    }

    window.BrainGames.register({
        id: "switchsort", name: "Switch Sort", icon: "&#128256;",
        gradient: "linear-gradient(135deg,#FB923C,#3B82F6)",
        best: "high", bestLabel: "Best",
        difficulties: true,
        help: {
            emoji: "&#128256;", goal: "Sort each card left or right — but watch out, the rule keeps switching!",
            steps: [
                "COLOUR rule: blue goes LEFT, orange goes RIGHT.",
                "SHAPE rule: circles go LEFT, triangles go RIGHT.",
                "The rule at the top changes during the round. Switch fast!",
                "Swipe the card, tap the sides, or use the arrow keys. Quick answers score extra."
            ]
        },
        mount: function (host, api) {
            var D = api.difficulty;
            // how often the rule flips, and whether you get a warning flash
            var SWITCH = D === "easy" ? [7, 9] : D === "hard" ? [2, 5] : [4, 7];
            var WARN = D !== "hard";
            var ROUND = 60;

            var rule = "colour", untilSwitch = 0, item = null, shownAt = 0;
            var score = 0, streak = 0, mult = 1, right = 0, wrong = 0, switches = 0;
            var left = ROUND, timer = null, running = false, lock = false;

            var sScore = stat("Score", "0"), sMult = stat("Combo", "x1"), sTime = stat("Time", ROUND + "s");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sMult.box, sTime.box]));

            var ruleEl = api.el("div", { class: "ss-rule" });
            host.appendChild(ruleEl);

            var leftBin = api.el("button", { class: "ss-bin left" });
            var rightBin = api.el("button", { class: "ss-bin right" });
            var card = api.el("div", { class: "ss-card" });
            leftBin.addEventListener("click", function () { answer("L"); });
            rightBin.addEventListener("click", function () { answer("R"); });
            host.appendChild(api.el("div", { class: "ss-stage" }, [leftBin, card, rightBin]));
            host.appendChild(api.el("div", { class: "small-note", text: "Swipe the card, tap a side, or use ← →" }));

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            function paintRule() {
                ruleEl.className = "ss-rule " + rule;
                ruleEl.innerHTML = rule === "colour"
                    ? "Sort by <b>COLOUR</b>"
                    : "Sort by <b>SHAPE</b>";
                leftBin.innerHTML = rule === "colour"
                    ? '<span class="ss-chip" style="background:' + BLUE + '"></span><span>BLUE</span>'
                    : shape(true, null, 34).replace(/fill="[^"]*"/, 'fill="#E5E7EB"') + "<span>CIRCLE</span>";
                rightBin.innerHTML = rule === "colour"
                    ? '<span class="ss-chip" style="background:' + ORANGE + '"></span><span>ORANGE</span>'
                    : shape(false, null, 34).replace(/fill="[^"]*"/, 'fill="#E5E7EB"') + "<span>TRIANGLE</span>";
            }
            function newItem() {
                item = { circle: Math.random() < 0.5, blue: Math.random() < 0.5 };
                card.innerHTML = shape(item.circle, item.blue, 118);
                card.className = "ss-card in";
                shownAt = Date.now();
            }
            function correctSide() {
                if (rule === "colour") return item.blue ? "L" : "R";
                return item.circle ? "L" : "R";
            }
            function scheduleSwitch() { untilSwitch = SWITCH[0] + Math.floor(Math.random() * (SWITCH[1] - SWITCH[0] + 1)); }

            function start() {
                score = 0; streak = 0; mult = 1; right = 0; wrong = 0; switches = 0; left = ROUND;
                rule = Math.random() < 0.5 ? "colour" : "shape";
                running = true; lock = false;
                scheduleSwitch(); paintRule(); paint(); newItem();
                clearInterval(timer);
                timer = setInterval(function () {
                    left--; sTime.val.textContent = left + "s";
                    if (left <= 5) api.sound.tick();
                    if (left <= 0) end();
                }, 1000);
            }
            function answer(side) {
                if (!running || lock || !item) return;
                lock = true;
                var ok = side === correctSide();
                var ms = Date.now() - shownAt;
                card.className = "ss-card fly-" + (side === "L" ? "left" : "right") + (ok ? " good" : " bad");
                if (ok) {
                    right++; streak++;
                    mult = Math.min(5, 1 + Math.floor(streak / 6));
                    var speed = ms < 600 ? 5 : ms < 1000 ? 3 : ms < 1600 ? 1 : 0;   // quick hands score more
                    var gain = (10 + speed) * mult;
                    score += gain;
                    flash("+" + gain + (speed >= 5 ? " ⚡" : ""), true);
                    api.sound.good(); api.haptic(8);
                    if (streak % 6 === 0) { api.toast("&#128293; Combo x" + mult + "!"); api.sound.win(); }
                } else {
                    wrong++; streak = 0; mult = 1;
                    flash("wrong rule!", false);
                    api.sound.bad(); api.haptic(30);
                }
                paint();
                setTimeout(function () {
                    if (!running) return;
                    untilSwitch--;
                    if (untilSwitch <= 0) {
                        rule = rule === "colour" ? "shape" : "colour"; switches++;
                        scheduleSwitch(); paintRule();
                        if (WARN) {
                            ruleEl.classList.add("switch");
                            api.toast("&#128256; Rule change!");
                            api.sound.pop();
                        }
                    }
                    lock = false;
                    newItem();
                }, ok ? 170 : 480);
            }
            function flash(text, good) {
                var p = api.el("div", { class: "sm-pop" + (good ? "" : " bad"), text: text });
                card.parentNode.appendChild(p);
                setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 650);
            }
            function paint() {
                sScore.val.textContent = String(score);
                sMult.val.textContent = "x" + mult;
                sMult.val.parentNode.classList.toggle("sm-hot", mult >= 3);
            }
            function end() {
                running = false; clearInterval(timer);
                var acc = right + wrong ? Math.round(right / (right + wrong) * 100) : 0;
                var rec = api.setBest(score);
                api.sound.win();
                api.overlay({
                    emoji: rec ? "&#127942;" : "&#128256;", title: rec ? "New best!" : "Time's up!",
                    sub: "Score <b>" + score + "</b><br>" + right + " sorted &middot; " + acc + "% right &middot; " + switches + " rule switches",
                    buttons: [{ label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: start }]
                });
            }

            // swipe the card itself
            var sx = null;
            card.addEventListener("pointerdown", function (e) { sx = e.clientX; });
            card.addEventListener("pointerup", function (e) {
                if (sx === null) return;
                var dx = e.clientX - sx; sx = null;
                if (Math.abs(dx) > 30) answer(dx < 0 ? "L" : "R");
            });
            function onKey(e) {
                if (e.key === "ArrowLeft") { answer("L"); e.preventDefault(); }
                else if (e.key === "ArrowRight") { answer("R"); e.preventDefault(); }
            }
            document.addEventListener("keydown", onKey);
            start();
            return function () { running = false; clearInterval(timer); document.removeEventListener("keydown", onKey); };
        }
    });
})();
