/* Simon — repeat the sequence */
(function () {
    window.BrainGames.register({
        id: "simon", name: "Simon Says", icon: "&#128302;",
        gradient: "linear-gradient(135deg,#DB2777,#7C3AED)",
        best: "high", bestLabel: "Best", bestSuffix: " rounds",
        mount: function (host, api) {
            var seq = [], input = [], round = 0, playing = false, acceptingInput = false;
            var FREQ = [329.63, 415.30, 554.37, 659.25];
            var COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#F472B6"];

            var sRound = stat("Round", "0"), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sRound.box, sBest.box]));

            var size = Math.min(api.space().board, 360);
            var boardEl = api.el("div", { style: "position:relative;width:" + size + "px;height:" + size + "px;border-radius:50%;background:var(--card);display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px" });
            var pads = [];
            var rounds = ["30% 0 0 0", "0 30% 0 0", "0 0 0 30%", "0 0 30% 0"];
            for (var i = 0; i < 4; i++) { (function (i) {
                var p = api.el("div", { style: padStyle(i, false) });
                p.addEventListener("click", function () { userTap(i); });
                pads.push(p); boardEl.appendChild(p);
            })(i); }
            var center = api.el("div", { style: "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34%;height:34%;border-radius:50%;background:var(--bg);display:grid;place-items:center;font-weight:800;text-align:center;font-size:14px;color:var(--muted)", text: "START" });
            boardEl.appendChild(center);
            host.appendChild(api.el("div", { class: "board-wrap", style: "display:grid;place-items:center" }, boardEl));
            var startBtn = api.el("button", { class: "btn primary", text: "Start", onclick: start });
            host.appendChild(api.el("div", { class: "btn-row" }, [ startBtn ]));
            host.appendChild(api.el("div", { class: "small-note", text: "Watch the pattern, then repeat it. It grows each round." }));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function padStyle(i, lit) {
                return "border-radius:" + rounds[i] + ";background:" + COLORS[i] + ";opacity:" + (lit ? "1" : "0.45") + ";cursor:pointer;transition:opacity .12s, box-shadow .12s;" + (lit ? "box-shadow:0 0 30px " + COLORS[i] : "");
            }
            function tone(i) { if (!api.settings.sound) return; try { var c = new (window.AudioContext || window.webkitAudioContext)(); var o = c.createOscillator(), g = c.createGain(); o.frequency.value = FREQ[i]; o.type = "sine"; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35); o.stop(c.currentTime + 0.36); } catch (e) {} }
            function light(i, ms) { pads[i].style.cssText = padStyle(i, true); tone(i); api.haptic(8); setTimeout(function () { pads[i].style.cssText = padStyle(i, false); }, ms); }

            function start() { if (playing) return; playing = true; seq = []; round = 0; center.textContent = ""; next(); }
            function next() {
                round++; sRound.val.textContent = round; input = [];
                seq.push(Math.floor(Math.random() * 4));
                acceptingInput = false; center.textContent = "WATCH";
                var speed = Math.max(320, 650 - round * 25);
                seq.forEach(function (s, k) { setTimeout(function () { light(s, speed * 0.6); if (k === seq.length - 1) setTimeout(function () { acceptingInput = true; center.textContent = "GO"; }, speed); }, speed * (k + 1)); });
            }
            function userTap(i) {
                if (!acceptingInput) return;
                light(i, 200); input.push(i);
                var k = input.length - 1;
                if (input[k] !== seq[k]) return fail();
                if (input.length === seq.length) { acceptingInput = false; center.textContent = "&#10003;"; api.sound.pop(); setTimeout(next, 700); }
            }
            function fail() {
                acceptingInput = false; playing = false; center.textContent = "START"; api.sound.lose(); api.haptic(40);
                var reached = round - 1; var rec = api.setBest(reached);
                api.overlay({ emoji: "&#128302;", title: "Wrong!", sub: "You reached round <b>" + reached + "</b>" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Again", primary: true, onClick: start } ] });
            }
            return function () {};
        }
    });
})();
