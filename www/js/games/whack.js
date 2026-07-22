/* Whack-a-Mole */
(function () {
    window.BrainGames.register({
        id: "whack", name: "Whack-a-Mole", icon: "&#128058;",
        gradient: "linear-gradient(135deg,#65A30D,#CA8A04)",
        best: "high", difficulties: true,
        help: {"emoji":"&#128058;","goal":"Bop as many moles as you can in 30 seconds.","steps":["Tap Start to begin.","Moles pop up out of the holes.","Tap a mole fast before it ducks back down!","Get as many as you can before time runs out."]},
        mount: function (host, api) {
            var score, timeLeft, running, holes = [], popTimer, tickTimer, activeIdx = -1;

            var sScore = stat("Score", "0"), sTime = stat("Time", "30s"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sScore.box, sTime.box, sBest.box]));
            var grid = api.el("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:340px;width:100%" });
            host.appendChild(api.el("div", { class: "board-wrap" }, grid));
            var startBtn = api.el("button", { class: "btn primary", text: "Start", onclick: start });
            host.appendChild(api.el("div", { class: "btn-row" }, [ startBtn ]));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap the moles before they duck. 30 seconds!" }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            for (var i = 0; i < 9; i++) { (function (i) {
                var h = api.el("div", { style: holeStyle(), html: "" });
                h.addEventListener("click", function () { whack(i); });
                holes.push(h); grid.appendChild(h);
            })(i); }
            function holeStyle() { return "aspect-ratio:1;border-radius:16px;background:radial-gradient(circle at 50% 120%,#3f2a12,#1c1206);display:grid;place-items:center;font-size:34px;overflow:hidden;cursor:pointer;transition:transform .08s"; }

            function start() {
                if (running) return; running = true; score = 0; timeLeft = 30; activeIdx = -1;
                sScore.val.textContent = "0"; sTime.val.textContent = "30s"; startBtn.textContent = "Playing…";
                tickTimer = setInterval(function () { timeLeft--; sTime.val.textContent = timeLeft + "s"; if (timeLeft <= 0) end(); }, 1000);
                pop();
            }
            function pop() {
                if (!running) return;
                if (activeIdx > -1) holes[activeIdx].innerHTML = "";
                activeIdx = Math.floor(Math.random() * 9);
                holes[activeIdx].innerHTML = "&#128058;";
                holes[activeIdx].animate([{ transform: "translateY(40%)" }, { transform: "translateY(0)" }], { duration: 120 });
                var mole = { easy: { base: 1450, floor: 750 }, medium: { base: 1100, floor: 500 }, hard: { base: 820, floor: 360 } }[api.difficulty] || { base: 1100, floor: 500 };
                var up = Math.max(mole.floor, mole.base - (30 - timeLeft) * 22);
                popTimer = setTimeout(function () { if (activeIdx > -1) holes[activeIdx].innerHTML = ""; pop(); }, up);
            }
            function whack(i) {
                if (!running || i !== activeIdx) { if (running) { api.sound.bad(); } return; }
                score++; sScore.val.textContent = score; api.sound.pop(); api.haptic(12);
                holes[i].innerHTML = "&#128165;"; var idx = i; activeIdx = -1;
                holes[i].animate([{ transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 150 });
                setTimeout(function () { if (holes[idx].innerHTML === "&#128165;") holes[idx].innerHTML = ""; }, 150);
            }
            function end() {
                running = false; clearInterval(tickTimer); clearTimeout(popTimer);
                if (activeIdx > -1) holes[activeIdx].innerHTML = ""; activeIdx = -1; startBtn.textContent = "Start";
                var rec = api.setBest(score); api.sound.win();
                api.overlay({ emoji: "&#128058;", title: "Time's up!", sub: "You whacked <b>" + score + "</b> moles" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: start } ] });
            }
            return function () { running = false; clearInterval(tickTimer); clearTimeout(popTimer); };
        }
    });
})();
