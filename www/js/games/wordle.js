/* Wordle — full copy of the classic rules.
   Word lists come from js/games/wordle-words.js (window.WORDLE_WORDS):
     answers = ~2500 common 5-letter words (the secret words)
     allowed = full 12k+ valid-guess dictionary (so any real word is accepted) */
(function () {
    var DATA = window.WORDLE_WORDS || { answers: "apple beach crane dream eagle", allowed: "apple beach crane dream eagle" };
    var ANSWERS = DATA.answers.toUpperCase().split(" ");
    var ALLOWED = {};
    DATA.allowed.toUpperCase().split(" ").forEach(function (w) { ALLOWED[w] = 1; });
    ANSWERS.forEach(function (w) { ALLOWED[w] = 1; }); // answers are always valid guesses

    window.BrainGames.register({
        id: "wordle", name: "Wordle", icon: "&#128221;",
        gradient: "linear-gradient(135deg,#16A34A,#22D3EE)",
        best: "high", bestLabel: "Streak",
        help: { emoji: "&#128221;", goal: "Guess the secret 5-letter word in 6 tries.", steps: [
            "Type any real 5-letter word and press Enter.",
            "Green means the letter is right and in the right spot.",
            "Yellow means the letter is in the word, but a different spot.",
            "Grey means the letter is not in the word. Use the clues to win!" ] },
        mount: function (host, api) {
            var target, row, col, letters, done, busy, streak = api.load("streak", 0);

            var sStreak = stat("Streak", streak + ""), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sStreak.box, sBest.box]));
            var boardEl = api.el("div", { style: "display:grid;grid-template-rows:repeat(6,1fr);gap:6px;margin:6px 0" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var kbEl = api.el("div", { style: "display:flex;flex-direction:column;gap:6px;width:100%;max-width:460px" });
            host.appendChild(kbEl);
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn ghost", text: "New word", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            var tileMin = api.isTablet() ? 58 : 46;
            function tileStyle(bg, border) { return "aspect-ratio:1;min-height:" + tileMin + "px;display:grid;place-items:center;font-weight:800;font-size:26px;border-radius:8px;border:2px solid " + (border || "var(--line)") + ";background:" + bg + ";color:#fff;text-transform:uppercase;transition:border-color .1s"; }

            var tiles = [];
            function buildBoard() {
                boardEl.innerHTML = ""; tiles = [];
                for (var r = 0; r < 6; r++) {
                    var rowEl = api.el("div", { style: "display:grid;grid-template-columns:repeat(5,1fr);gap:6px" });
                    for (var c = 0; c < 5; c++) { var t = api.el("div", { style: tileStyle("transparent") }); tiles.push(t); rowEl.appendChild(t); }
                    boardEl.appendChild(rowEl);
                }
            }
            var keyEls = {};
            var ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
            function buildKb() {
                kbEl.innerHTML = ""; keyEls = {};
                ROWS.forEach(function (rw, idx) {
                    var rowEl = api.el("div", { style: "display:flex;gap:5px;justify-content:center" });
                    if (idx === 2) rowEl.appendChild(keyBtn("ENTER", 1.6));
                    rw.split("").forEach(function (ch) { rowEl.appendChild(keyBtn(ch, 1)); });
                    if (idx === 2) rowEl.appendChild(keyBtn("DEL", 1.6));
                    kbEl.appendChild(rowEl);
                });
            }
            function keyBtn(labelText, flex) {
                var b = api.el("button", { class: "btn kbd", style: "flex:" + flex + ";padding:14px 0;font-size:13px;min-width:0;min-height:52px", html: labelText === "DEL" ? "&#9003;" : labelText });
                b.addEventListener("click", function () { press(labelText); });
                if (labelText.length === 1) keyEls[labelText] = b;
                return b;
            }
            function press(k) {
                if (done || busy) return;
                if (k === "ENTER") return submit();
                if (k === "DEL") { if (col > 0) { col--; tiles[row * 5 + col].textContent = ""; tiles[row * 5 + col].style.borderColor = "var(--line)"; letters[row][col] = ""; } return; }
                if (col < 5 && /^[A-Z]$/.test(k)) { var t = tiles[row * 5 + col]; t.textContent = k; t.style.borderColor = "var(--muted)"; t.animate([{transform:"scale(0.85)"},{transform:"scale(1)"}],{duration:100}); letters[row][col] = k; col++; api.sound.tick(); }
            }
            function submit() {
                if (col < 5) { api.toast("Not enough letters"); shake(); return; }
                var guess = letters[row].join("");
                if (!ALLOWED[guess]) { api.toast("Not in word list"); api.sound.bad(); shake(); return; }
                var res = score(guess, target);
                busy = true;
                for (var i = 0; i < 5; i++) {
                    (function (i) { setTimeout(function () {
                        flip(tiles[row * 5 + i], res[i] === 2 ? "#16A34A" : res[i] === 1 ? "#CA8A04" : "#3A3F55");
                        var kb = keyEls[guess[i]];
                        if (kb) { var pr = kb._state || 0; if (res[i] >= pr) { kb._state = res[i]; kb.style.background = res[i] === 2 ? "#16A34A" : res[i] === 1 ? "#CA8A04" : "#3A3F55"; kb.style.color = "#fff"; kb.style.borderColor = "transparent"; } }
                        if (i === 4) setTimeout(finishRow, 340);
                    }, i * 260); })(i);
                }
                api.sound.move();
                function finishRow() {
                    busy = false;
                    if (guess === target) {
                        done = true; streak++; api.save("streak", streak); var rec = api.setBest(streak); sStreak.val.textContent = streak; sBest.val.textContent = api.getBest();
                        api.sound.win(); api.haptic(30);
                        for (var j = 0; j < 5; j++) (function (j) { setTimeout(function () { tiles[row * 5 + j].animate([{transform:"translateY(0)"},{transform:"translateY(-14px)"},{transform:"translateY(0)"}], { duration: 400 }); }, j * 90); })(j);
                        setTimeout(function () {
                            api.overlay({ emoji: "&#127881;", title: "Solved!", sub: "The word was <b>" + target + "</b><br>Streak: " + streak + (rec ? " &#127942;" : ""),
                                buttons: [ { label: "Home", onClick: api.exit }, { label: "Next word", primary: true, onClick: reset } ] });
                        }, 700);
                    } else {
                        row++; col = 0;
                        if (row >= 6) { done = true; streak = 0; api.save("streak", 0); sStreak.val.textContent = 0; api.sound.lose();
                            api.overlay({ emoji: "&#128533;", title: "Out of guesses", sub: "The word was <b>" + target + "</b>",
                                buttons: [ { label: "Home", onClick: api.exit }, { label: "Try again", primary: true, onClick: reset } ] }); }
                    }
                }
            }
            function score(guess, tgt) {
                var res = [0,0,0,0,0], t = tgt.split(""), used = [false,false,false,false,false];
                for (var i = 0; i < 5; i++) if (guess[i] === t[i]) { res[i] = 2; used[i] = true; }
                for (var j = 0; j < 5; j++) { if (res[j]) continue; for (var k = 0; k < 5; k++) { if (!used[k] && guess[j] === t[k]) { res[j] = 1; used[k] = true; break; } } }
                return res;
            }
            function flip(t, color) {
                // one clean flip 0->90->0; swap the colour at the midpoint
                t.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: 340, easing: "ease-in-out" });
                setTimeout(function () { t.style.background = color; t.style.borderColor = color; }, 170);
            }
            function shake() { boardEl.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 200 }); }
            function reset() {
                target = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
                row = 0; col = 0; done = false; busy = false; letters = []; for (var r = 0; r < 6; r++) letters.push(["","","","",""]);
                buildBoard(); buildKb();
            }
            function key(e) { var k = e.key.toUpperCase(); if (k === "ENTER") press("ENTER"); else if (k === "BACKSPACE") press("DEL"); else if (/^[A-Z]$/.test(k)) press(k); }
            window.addEventListener("keydown", key);
            reset();
            return function () { window.removeEventListener("keydown", key); };
        }
    });
})();
