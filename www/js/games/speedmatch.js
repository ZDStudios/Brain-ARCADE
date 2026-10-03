/* Speed Match — is this card the same as the one before?
   A fast "n-back" game: it trains working memory and processing speed, the two
   things most brain-training research actually measures. Easy and Medium ask
   about the PREVIOUS card; Hard asks about the card TWO back, which is a genuinely
   tough working-memory load.

   The hook is the combo: every five right in a row bumps the multiplier (up to
   x5), so a streak feels great and a slip stings. 60 seconds a round. */
(function () {
    var SHAPES = ["circle", "square", "triangle", "star", "diamond", "hexagon"];
    var FILL = ["#F87171", "#60A5FA", "#34D399", "#FBBF24", "#A78BFA", "#FB923C"];
    function svg(i, size) {
        var s = SHAPES[i], f = FILL[i], b;
        if (s === "circle") b = '<circle cx="50" cy="50" r="38"/>';
        else if (s === "square") b = '<rect x="14" y="14" width="72" height="72" rx="10"/>';
        else if (s === "triangle") b = '<polygon points="50,10 90,86 10,86"/>';
        else if (s === "diamond") b = '<polygon points="50,6 94,50 50,94 6,50"/>';
        else if (s === "hexagon") b = '<polygon points="50,7 88,28 88,72 50,93 12,72 12,28"/>';
        else b = '<polygon points="50,5 61,38 96,38 68,59 78,93 50,72 22,93 32,59 4,38 39,38"/>';
        return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="' + f + '">' + b + '</svg>';
    }

    window.BrainGames.register({
        id: "speedmatch", name: "Speed Match", icon: "&#9889;",
        gradient: "linear-gradient(135deg,#06B6D4,#8B5CF6)",
        best: "high", bestLabel: "Best",
        difficulties: true,
        help: {
            emoji: "&#9889;", goal: "Is this shape the same as the one before?",
            steps: [
                "A shape appears. Remember it!",
                "When the next one appears, tap YES if it matches, NO if it does not.",
                "On Hard, compare with the shape from TWO cards ago.",
                "Five right in a row raises your multiplier — up to x5. You have 60 seconds!"
            ]
        },
        mount: function (host, api) {
            var BACK = api.difficulty === "hard" ? 2 : 1;
            var POOL = api.difficulty === "easy" ? 3 : api.difficulty === "hard" ? 6 : 5;   // fewer shapes = easier to tell apart
            var ROUND = 60;

            var history = [], score = 0, streak = 0, mult = 1, right = 0, wrong = 0;
            var left = ROUND, timer = null, running = false, lock = false;

            var sScore = stat("Score", "0"), sMult = stat("Combo", "x1"), sTime = stat("Time", ROUND + "s");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sMult.box, sTime.box]));
            var streakBar = api.el("i", { class: "sm-streak-fill" });
            host.appendChild(api.el("div", { class: "sm-streak" }, [streakBar]));
            var prompt = api.el("div", { class: "sm-prompt", text: BACK === 2 ? "Same as TWO cards ago?" : "Same as the last card?" });
            host.appendChild(prompt);
            var card = api.el("div", { class: "sm-card" });
            host.appendChild(api.el("div", { class: "sm-stage" }, [card]));
            var noBtn = api.el("button", { class: "btn sm-no", html: "&#10006; NO" });
            var yesBtn = api.el("button", { class: "btn sm-yes", html: "&#10004; YES" });
            noBtn.addEventListener("click", function () { answer(false); });
            yesBtn.addEventListener("click", function () { answer(true); });
            host.appendChild(api.el("div", { class: "sm-buttons" }, [noBtn, yesBtn]));
            var note = api.el("div", { class: "small-note", text: "Keys: ← NO   → YES" });
            host.appendChild(note);

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }

            function show(i, intro) {
                card.innerHTML = svg(i, 132);
                card.classList.remove("flip"); void card.offsetWidth; card.classList.add("flip");
                if (intro) prompt.textContent = BACK === 2 ? "Remember these two…" : "Remember this one…";
            }
            function nextShape() {
                // Aim for roughly 45% matches so neither button is a safe spam.
                var target = history.length >= BACK ? history[history.length - BACK] : null;
                if (target !== null && Math.random() < 0.45) return target;
                var s;
                do { s = Math.floor(Math.random() * POOL); } while (target !== null && s === target);
                return s;
            }
            function start() {
                history = []; score = 0; streak = 0; mult = 1; right = 0; wrong = 0; left = ROUND; running = true; lock = false;
                paint();
                // the opening card(s) only have to be remembered
                var first = Math.floor(Math.random() * POOL);
                history.push(first); show(first, true);
                yesBtn.disabled = noBtn.disabled = true;
                setTimeout(function () {
                    if (BACK === 2) {
                        var second = Math.floor(Math.random() * POOL);
                        history.push(second); show(second, true);
                        setTimeout(go, 900);
                    } else go();
                }, 1000);
            }
            function go() {
                prompt.textContent = BACK === 2 ? "Same as TWO cards ago?" : "Same as the last card?";
                yesBtn.disabled = noBtn.disabled = false;
                var s = nextShape(); history.push(s); show(s);
                clearInterval(timer);
                timer = setInterval(function () {
                    left--; sTime.val.textContent = left + "s";
                    if (left <= 5) { sTime.val.parentNode.classList.add("sm-hurry"); api.sound.tick(); }
                    if (left <= 0) end();
                }, 1000);
            }
            function answer(saidYes) {
                if (!running || lock || history.length <= BACK) return;
                var cur = history[history.length - 1], back = history[history.length - 1 - BACK];
                var correct = (cur === back) === saidYes;
                lock = true;
                if (correct) {
                    right++; streak++;
                    mult = Math.min(5, 1 + Math.floor(streak / 5));
                    var gain = 10 * mult;
                    score += gain;
                    pop("+" + gain, true);
                    api.sound.good(); api.haptic(8);
                    if (streak > 0 && streak % 5 === 0 && mult < 6) { api.toast("&#128293; Combo x" + mult + "!"); api.sound.win(); }
                } else {
                    wrong++; streak = 0; mult = 1;
                    pop("miss", false);
                    api.sound.bad(); api.haptic(30);
                }
                card.classList.remove("good", "bad"); void card.offsetWidth; card.classList.add(correct ? "good" : "bad");
                paint();
                setTimeout(function () {
                    lock = false;
                    if (!running) return;
                    var s = nextShape(); history.push(s); show(s);
                }, correct ? 140 : 420);   // a mistake costs you a beat
            }
            function pop(text, good) {
                var p = api.el("div", { class: "sm-pop" + (good ? "" : " bad"), text: text });
                card.parentNode.appendChild(p);
                setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 650);
            }
            function paint() {
                sScore.val.textContent = String(score);
                sMult.val.textContent = "x" + mult;
                streakBar.style.width = ((streak % 5) / 5) * 100 + "%";
                sMult.val.parentNode.classList.toggle("sm-hot", mult >= 3);
            }
            function end() {
                running = false; clearInterval(timer);
                yesBtn.disabled = noBtn.disabled = true;
                sTime.val.parentNode.classList.remove("sm-hurry");
                var acc = right + wrong ? Math.round(right / (right + wrong) * 100) : 0;
                var rec = api.setBest(score);
                api.sound.win();
                api.overlay({
                    emoji: rec ? "&#127942;" : "&#9889;", title: rec ? "New best!" : "Time's up!",
                    sub: "Score <b>" + score + "</b><br>" + right + " right &middot; " + acc + "% accuracy",
                    buttons: [{ label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: start }]
                });
            }
            function onKey(e) {
                if (e.key === "ArrowLeft") { answer(false); e.preventDefault(); }
                else if (e.key === "ArrowRight") { answer(true); e.preventDefault(); }
            }
            document.addEventListener("keydown", onKey);
            start();
            return function () { running = false; clearInterval(timer); document.removeEventListener("keydown", onKey); };
        }
    });
})();
