/* Bubble Popper — solve the sum, pop the bubble with the answer */
(function () {
    window.BrainGames.register({
        id: "bubblepop", name: "Bubble Popper", icon: "&#129529;",
        gradient: "linear-gradient(135deg,#06B6D4,#3B82F6)",
        art: "background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.35),transparent 45%),radial-gradient(circle at 70% 70%,rgba(255,255,255,.25),transparent 40%)",
        best: "high", difficulties: true,
        help: {
            emoji: "&#129529;", goal: "Pop the bubble that answers the sum.",
            steps: [
                "A sum appears at the top, like <b>7 + 5</b>.",
                "Bubbles float up with different numbers on them.",
                "Tap the bubble with the right answer to pop it!",
                "On a TV, use the arrows to pick a bubble and press OK.",
                "A wrong pop costs a life — you have 3."
            ]
        },
        mount: function (host, api) {
            var sp = api.space();
            var W = Math.round(Math.min(sp.w, 460));
            var H = Math.round(Math.min(sp.h, W * 1.15));
            var LEVELS = {
                easy:   { count: 4, speed: 0.020, max: 10 },
                medium: { count: 5, speed: 0.028, max: 20 },
                hard:   { count: 6, speed: 0.036, max: 50 }
            };
            var cfg = LEVELS[api.difficulty] || LEVELS.medium;

            var score = 0, lives = 3, question = null, bubbles = [], raf = null, last = 0, over = false, sel = -1, speed = cfg.speed;

            var sScore = stat("Score", "0"), sLives = stat("Lives", "3"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sLives.box, sBest.box]));

            var qEl = api.el("div", { class: "bp-question", text: "…" });
            var field = api.el("div", { class: "bp-field", style: "height:" + H + "px" });
            var wrap = api.el("div", { class: "board-wrap", style: "width:" + W + "px;max-width:100%" }, [qEl, field]);
            host.appendChild(wrap);
            host.appendChild(api.el("div", { class: "small-note", text: "Pop the bubble that answers the sum." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", text: "Restart", onclick: reset })
            ]));

            function stat(k, v) {
                var val = api.el("div", { class: "v", text: v });
                return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val };
            }
            function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

            /* ---------- the maths ---------- */
            function makeQuestion() {
                var d = api.difficulty || "medium", a, b, text, ans, r;
                if (d === "easy") {
                    if (Math.random() < 0.35) { a = rnd(2, 10); b = rnd(1, a); text = a + " − " + b; ans = a - b; }
                    else { a = rnd(1, 9); b = rnd(1, 9); text = a + " + " + b; ans = a + b; }
                } else if (d === "hard") {
                    r = Math.random();
                    if (r < 0.4) { a = rnd(2, 12); b = rnd(2, 9); text = a + " × " + b; ans = a * b; }
                    else if (r < 0.7) { b = rnd(2, 9); ans = rnd(2, 9); a = b * ans; text = a + " ÷ " + b; }
                    else { a = rnd(2, 9); b = rnd(2, 9); var c = rnd(1, 9); text = a + " × " + b + " + " + c; ans = a * b + c; }
                } else {
                    r = Math.random();
                    if (r < 0.35) { a = rnd(5, 20); b = rnd(1, a); text = a + " − " + b; ans = a - b; }
                    else if (r < 0.7) { a = rnd(2, 15); b = rnd(2, 12); text = a + " + " + b; ans = a + b; }
                    else { a = rnd(2, 6); b = rnd(2, 6); text = a + " × " + b; ans = a * b; }
                }
                return { text: text + " = ?", answer: ans };
            }
            // A believable wrong answer that is never the right one.
            function distractor(ans) {
                for (var i = 0; i < 40; i++) {
                    var spread = Math.max(3, Math.round(Math.abs(ans) * 0.4));
                    var v = ans + rnd(-spread, spread);
                    if (v !== ans && v >= 0 && v <= cfg.max * 12) return v;
                }
                return ans + 1;
            }

            /* ---------- bubbles ---------- */
            var COLORS = ["#22D3EE", "#7C5CFF", "#34D399", "#FBBF24", "#F472B6", "#60A5FA"];
            function bubbleSize() { return Math.max(46, Math.min(74, Math.round(W / 5.4))); }

            function spawn(correct, startAtBottom) {
                var size = bubbleSize();
                var value = correct ? question.answer : distractor(question.answer);
                var elB = api.el("button", {
                    class: "bp-bubble", type: "button", text: String(value),
                    style: "width:" + size + "px;height:" + size + "px;background:radial-gradient(circle at 32% 28%,#fff8," +
                        "transparent 60%)," + COLORS[rnd(0, COLORS.length - 1)]
                });
                var y = startAtBottom ? H + rnd(0, 60) : rnd(0, H);
                // Pick the least crowded column so bubbles don't spawn on top of
                // each other (overlapping ones look broken and are ambiguous to tap).
                var maxX = Math.max(6, W - size - 4), bx = rnd(4, maxX), bestGap = -1;
                for (var t = 0; t < 12; t++) {
                    var cand = rnd(4, maxX), gap = Infinity;
                    for (var j = 0; j < bubbles.length; j++) {
                        var o = bubbles[j];
                        if (Math.abs(o.y - y) > size * 1.2) continue;   // only rows near this one
                        gap = Math.min(gap, Math.abs(o.x - cand));
                    }
                    if (gap > bestGap) { bestGap = gap; bx = cand; }
                    if (bestGap >= size * 1.1) break;
                }
                var b = {
                    el: elB, value: value, correct: !!correct, size: size,
                    x: bx,
                    y: y,
                    vy: speed * (0.75 + Math.random() * 0.6),
                    drift: (Math.random() - 0.5) * 0.02
                };
                elB.addEventListener("click", function () { pop(b); });
                field.appendChild(elB);
                bubbles.push(b);
                place(b);
                return b;
            }
            function place(b) { b.el.style.transform = "translate(" + Math.round(b.x) + "px," + Math.round(b.y) + "px)"; }
            function removeBubble(b) {
                var i = bubbles.indexOf(b);
                if (i > -1) bubbles.splice(i, 1);
                if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
            }
            function hasCorrect() { for (var i = 0; i < bubbles.length; i++) if (bubbles[i].correct) return true; return false; }

            function newRound() {
                question = makeQuestion();
                qEl.textContent = question.text;
                bubbles.slice().forEach(removeBubble);
                var slots = cfg.count;
                var correctSlot = rnd(0, slots - 1);
                for (var i = 0; i < slots; i++) spawn(i === correctSlot, false);
                sel = -1; paintSel();
            }

            function pop(b) {
                if (over || !b) return;
                if (b.correct) {
                    score++; sScore.val.textContent = score;
                    api.sound.pop(); api.haptic(8);
                    burst(b, true);
                    speed += 0.0012;
                    removeBubble(b);
                    newRound();
                } else {
                    lives--; sLives.val.textContent = lives;
                    api.sound.bad(); api.haptic(30);
                    burst(b, false);
                    removeBubble(b);
                    if (lives <= 0) return gameOver();
                    if (!hasCorrect()) spawn(true, true);
                    if (bubbles.length < cfg.count) spawn(false, true);
                    sel = -1; paintSel();
                }
            }
            function burst(b, good) {
                var f = api.el("div", { class: "bp-burst" + (good ? " good" : " bad"), html: good ? "&#10024;" : "&#128165;",
                    style: "left:" + (b.x + b.size / 2) + "px;top:" + (b.y + b.size / 2) + "px" });
                field.appendChild(f);
                setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 480);
            }

            /* ---------- remote / keyboard control ---------- */
            function paintSel() {
                bubbles.forEach(function (b, i) { b.el.classList.toggle("sel", i === sel); });
            }
            function moveSel(dx, dy) {
                if (!bubbles.length) return;
                if (sel < 0 || sel >= bubbles.length) { sel = 0; return paintSel(); }
                var cur = bubbles[sel], best = -1, bestScore = Infinity;
                for (var i = 0; i < bubbles.length; i++) {
                    if (i === sel) continue;
                    var b = bubbles[i];
                    var ddx = (b.x - cur.x) * dx, ddy = (b.y - cur.y) * dy;
                    var along = ddx + ddy;
                    if (along <= 2) continue;
                    var across = dx ? Math.abs(b.y - cur.y) : Math.abs(b.x - cur.x);
                    var s = along + across * 1.6;
                    if (s < bestScore) { bestScore = s; best = i; }
                }
                if (best > -1) { sel = best; paintSel(); }
            }
            function onKey(e) {
                if (over) return;
                var k = e.key;
                if (k === "ArrowLeft") { moveSel(-1, 0); e.preventDefault(); }
                else if (k === "ArrowRight") { moveSel(1, 0); e.preventDefault(); }
                else if (k === "ArrowUp") { moveSel(0, -1); e.preventDefault(); }
                else if (k === "ArrowDown") { moveSel(0, 1); e.preventDefault(); }
                else if (k === "Enter" || k === " " || k === "Spacebar") {
                    if (sel >= 0 && sel < bubbles.length) { pop(bubbles[sel]); e.preventDefault(); }
                }
            }
            window.addEventListener("keydown", onKey);

            /* ---------- loop ---------- */
            function step(dt) {
                for (var i = bubbles.length - 1; i >= 0; i--) {
                    var b = bubbles[i];
                    b.y -= b.vy * dt;
                    b.x += b.drift * dt;
                    if (b.x < 2) { b.x = 2; b.drift = Math.abs(b.drift); }
                    if (b.x > W - b.size - 2) { b.x = W - b.size - 2; b.drift = -Math.abs(b.drift); }
                    if (b.y < -b.size - 10) {
                        var wasCorrect = b.correct;
                        removeBubble(b);
                        spawn(wasCorrect, true);      // keep the right answer always reachable
                        sel = -1; paintSel();
                        continue;
                    }
                    place(b);
                }
                if (!hasCorrect()) spawn(true, true);
            }
            function loop(ts) {
                raf = requestAnimationFrame(loop);
                if (over) return;
                if (!last) last = ts;
                var dt = Math.min(48, ts - last); last = ts;
                step(dt);
            }

            function gameOver() {
                over = true;
                var rec = api.setBest(score);
                api.sound.lose();
                api.overlay({
                    emoji: "&#129529;", title: "Bubbles Burst!",
                    sub: "You solved <b>" + score + "</b> sum" + (score === 1 ? "" : "s") + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [{ label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset }]
                });
            }

            function reset() {
                over = false; score = 0; lives = 3; speed = cfg.speed; last = 0;
                sScore.val.textContent = "0"; sLives.val.textContent = "3";
                sBest.val.textContent = api.getBest() || 0;
                bubbles.slice().forEach(removeBubble);
                newRound();
                if (!raf) raf = requestAnimationFrame(loop);
            }

            reset();
            return function () {
                cancelAnimationFrame(raf); raf = null;
                window.removeEventListener("keydown", onKey);
            };
        }
    });
})();
