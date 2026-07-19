/* Reaction Time */
(function () {
    window.BrainGames.register({
        id: "reaction", name: "Reaction Time", icon: "&#9889;",
        gradient: "linear-gradient(135deg,#F59E0B,#EF4444)",
        best: "low", bestLabel: "Best", bestSuffix: " ms",
        help: {"emoji":"&#9889;","goal":"Tap the instant the box turns green.","steps":["Tap the box to get ready.","Wait while it is red, don't tap yet!","The moment it turns green, tap as fast as you can.","Lower time (in milliseconds) is better!"]},
        mount: function (host, api) {
            var state = "idle", startT = 0, waitTimer = null, results = [];

            var sLast = stat("Last", "—"), sAvg = stat("Avg", "—"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sLast.box, sAvg.box, sBest.box]));

            var size = Math.round(Math.min(api.space().w, api.space().h / 1.1, 380));
            var pad = api.el("div", { style: "width:100%;max-width:" + size + "px;height:" + Math.round(size * 1.1) + "px;border-radius:20px;display:grid;place-items:center;text-align:center;padding:20px;font-weight:800;cursor:pointer;user-select:none;transition:background .1s", html: "" });
            host.appendChild(api.el("div", { class: "board-wrap" }, pad));
            host.appendChild(api.el("div", { class: "small-note", text: "When the box turns green, tap as fast as you can!" }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function setPad(bg, title, sub) {
                pad.style.background = bg;
                pad.innerHTML = "<div><div style='font-size:26px'>" + title + "</div>" + (sub ? "<div style='font-size:14px;opacity:.85;margin-top:8px;font-weight:600'>" + sub + "</div>" : "") + "</div>";
                pad.style.color = "#fff";
            }
            function idle() { state = "idle"; setPad("linear-gradient(135deg,#334155,#1E293B)", "&#9889; Tap to start", "Test your reflexes"); }
            function waiting() {
                state = "waiting"; setPad("linear-gradient(135deg,#B91C1C,#7F1D1D)", "Wait for green…", "Don't tap yet!");
                var delay = 1200 + Math.random() * 2600;
                waitTimer = setTimeout(function () { state = "go"; startT = performance.now(); setPad("linear-gradient(135deg,#16A34A,#22C55E)", "TAP!", ""); api.sound.tick(); }, delay);
            }
            function go() {
                var ms = Math.round(performance.now() - startT);
                state = "result"; results.push(ms);
                sLast.val.textContent = ms;
                var avg = Math.round(results.reduce(function (a, b) { return a + b; }, 0) / results.length);
                sAvg.val.textContent = avg;
                var rec = api.setBest(ms); sBest.val.textContent = api.getBest();
                api.sound.good(); api.haptic(12);
                var rating = ms < 220 ? "&#128293; Lightning!" : ms < 300 ? "&#9889; Fast!" : ms < 400 ? "&#128077; Solid" : "&#128012; Keep trying";
                setPad("linear-gradient(135deg,#1E2748,#2A3560)", ms + " ms", rating + (rec ? " &middot; New best!" : "") + "<br><span style='opacity:.7'>Tap to go again</span>");
            }
            function tooSoon() {
                clearTimeout(waitTimer); state = "result"; api.sound.bad(); api.haptic(30);
                setPad("linear-gradient(135deg,#7C3AED,#4C1D95)", "Too soon! &#128558;", "Tap to try again");
            }
            function tap() {
                if (state === "idle" || state === "result") return waiting();
                if (state === "waiting") return tooSoon();
                if (state === "go") return go();
            }
            pad.addEventListener("touchstart", function (e) { e.preventDefault(); tap(); }, { passive: false });
            pad.addEventListener("mousedown", tap);
            idle();
            return function () { clearTimeout(waitTimer); };
        }
    });
})();
