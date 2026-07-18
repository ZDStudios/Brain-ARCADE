/* Color Clash (Stroop test) — tap the INK color, not the word */
(function () {
    window.BrainGames.register({
        id: "stroop", name: "Color Clash", icon: "&#127752;",
        gradient: "linear-gradient(135deg,#DB2777,#F59E0B)",
        best: "high",
        mount: function (host, api) {
            var COLORS = [ ["Red", "#EF4444"], ["Blue", "#3B82F6"], ["Green", "#22C55E"], ["Yellow", "#FBBF24"], ["Purple", "#A78BFA"] ];
            var score, timeLeft, running, tickTimer, inkIndex;

            var sScore = stat("Score", "0"), sTime = stat("Time", "30s"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sTime.box, sBest.box]));
            var word = api.el("div", { style: "font-size:52px;font-weight:900;text-align:center;padding:34px 10px", text: "Ready?" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "width:100%;max-width:420px" }, word));
            var opts = api.el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:420px;margin-top:12px" });
            host.appendChild(opts);
            var startBtn = api.el("button", { class: "btn primary", text: "Start", onclick: start });
            host.appendChild(api.el("div", { class: "btn-row" }, [ startBtn ]));
            host.appendChild(api.el("div", { class: "small-note", html: "Tap the button matching the <b>INK color</b> of the word — not what it says!" }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function nextWord() {
                var wordIdx = Math.floor(Math.random() * COLORS.length);
                inkIndex = Math.floor(Math.random() * COLORS.length);
                word.textContent = COLORS[wordIdx][0];
                word.style.color = COLORS[inkIndex][1];
                // options: shuffle color buttons
                var order = COLORS.map(function (_, i) { return i; });
                for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
                opts.innerHTML = "";
                order.forEach(function (idx) {
                    var b = api.el("button", { class: "btn", style: "padding:18px 0;font-size:18px;color:#fff;background:" + COLORS[idx][1], text: COLORS[idx][0] });
                    b.addEventListener("click", function () { tap(idx); });
                    opts.appendChild(b);
                });
            }
            function tap(idx) {
                if (!running) return;
                if (idx === inkIndex) { score++; sScore.val.textContent = score; api.sound.good(); api.haptic(8); }
                else { score = Math.max(0, score - 1); sScore.val.textContent = score; api.sound.bad(); api.haptic(25); }
                nextWord();
            }
            function start() {
                if (running) return; running = true; score = 0; timeLeft = 30;
                sScore.val.textContent = "0"; sTime.val.textContent = "30s"; startBtn.textContent = "Playing…";
                nextWord();
                tickTimer = setInterval(function () { timeLeft--; sTime.val.textContent = timeLeft + "s"; if (timeLeft <= 0) end(); }, 1000);
            }
            function end() {
                running = false; clearInterval(tickTimer); startBtn.textContent = "Start"; word.textContent = "Done!"; word.style.color = "var(--text)"; opts.innerHTML = "";
                var rec = api.setBest(score); api.sound.win();
                api.overlay({ emoji: "&#127752;", title: "Time's up!", sub: "Score <b>" + score + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: start } ] });
            }
            return function () { running = false; clearInterval(tickTimer); };
        }
    });
})();
