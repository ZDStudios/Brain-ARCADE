/* Math Blitz — fast mental arithmetic */
(function () {
    window.BrainGames.register({
        id: "mathblitz", name: "Math Blitz", icon: "&#10133;",
        gradient: "linear-gradient(135deg,#2563EB,#7C3AED)",
        best: "high",
        help: {"emoji":"&#10133;","goal":"Answer as many sums as you can in 30 seconds.","steps":["Tap Start and a sum appears.","Tap the button with the correct answer.","Correct answers score; a streak scores bonus points.","Be quick, you only get 30 seconds!"]},
        mount: function (host, api) {
            var score, timeLeft, running, tickTimer, answer, streak;

            var sScore = stat("Score", "0"), sTime = stat("Time", "30s"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sTime.box, sBest.box]));
            var q = api.el("div", { style: "font-size:44px;font-weight:800;text-align:center;padding:26px 10px;letter-spacing:1px" , text: "Ready?" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "width:100%;max-width:420px" }, q));
            var opts = api.el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:420px;margin-top:12px" });
            host.appendChild(opts);
            var startBtn = api.el("button", { class: "btn primary", text: "Start", onclick: start });
            host.appendChild(api.el("div", { class: "btn-row" }, [ startBtn ]));
            host.appendChild(api.el("div", { class: "small-note", text: "Answer as many as you can in 30 seconds. Streaks give bonus points!" }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

            function makeQ() {
                var op = ["+", "-", "×"][ri(0, 2)], a, b, res;
                var hard = Math.min(1, score / 40);
                if (op === "+") { a = ri(2, 20 + hard * 40); b = ri(2, 20 + hard * 40); res = a + b; }
                else if (op === "-") { a = ri(10, 30 + hard * 50); b = ri(2, a); res = a - b; }
                else { a = ri(2, 6 + hard * 6); b = ri(2, 6 + hard * 6); res = a * b; }
                answer = res;
                q.textContent = a + " " + op + " " + b + " = ?";
                var choices = [res];
                while (choices.length < 4) { var d = res + ri(-8, 8) * (op === "×" ? 1 : 1) + (Math.random() < 0.3 ? ri(-3, 3) : 0); if (d !== res && choices.indexOf(d) < 0 && d >= 0) choices.push(d); }
                for (var i = choices.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = choices[i]; choices[i] = choices[j]; choices[j] = t; }
                opts.innerHTML = "";
                choices.forEach(function (c) { opts.appendChild(api.el("button", { class: "btn", style: "font-size:24px;padding:18px 0", text: c + "", onclick: function () { answerTap(c, this); } })); });
            }
            function answerTap(c, btn) {
                if (!running) return;
                if (c === answer) { streak++; var bonus = Math.min(5, Math.floor(streak / 3)); score += 1 + bonus; sScore.val.textContent = score; api.sound.good(); api.haptic(8);
                    if (btn) btn.style.background = "#16A34A"; }
                else { streak = 0; score = Math.max(0, score - 1); sScore.val.textContent = score; api.sound.bad(); api.haptic(25); if (btn) btn.style.background = "#DC2626"; }
                setTimeout(makeQ, 120);
            }
            function start() {
                if (running) return; running = true; score = 0; streak = 0; timeLeft = 30;
                sScore.val.textContent = "0"; sTime.val.textContent = "30s"; startBtn.textContent = "Playing…";
                makeQ();
                tickTimer = setInterval(function () { timeLeft--; sTime.val.textContent = timeLeft + "s"; if (timeLeft <= 0) end(); }, 1000);
            }
            function end() {
                running = false; clearInterval(tickTimer); startBtn.textContent = "Start"; q.textContent = "Done!"; opts.innerHTML = "";
                var rec = api.setBest(score); api.sound.win();
                api.overlay({ emoji: "&#129504;", title: "Time's up!", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: start } ] });
            }
            return function () { running = false; clearInterval(tickTimer); };
        }
    });
})();
