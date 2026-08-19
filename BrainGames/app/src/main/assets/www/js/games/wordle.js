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
        difficulties: true, resumable: true,
        help: { emoji: "&#128221;", goal: "Guess the secret 5-letter word in 6 tries.", steps: [
            "Type any real 5-letter word and press Enter.",
            "Green means the letter is right and in the right spot.",
            "Yellow means the letter is in the word, but a different spot.",
            "Grey means the letter is not in the word. Use the clues to win!",
            "Stuck? Tap \u{1F4A1} Hint to have one letter filled in for you \u2014 you get two per word." ] },
        mount: function (host, api) {
            var target, row, col, letters, done, busy, guesses, streak = api.load("streak", 0);
            var hintsLeft, hintCells;      // hintCells: positions already given away
            // Difficulty: easier = more common words (answers are frequency-ordered).
            var pool = api.difficulty === "easy" ? ANSWERS.slice(0, 400)
                     : api.difficulty === "hard" ? ANSWERS
                     : ANSWERS.slice(0, 1200);

            var sStreak = stat("Streak", streak + ""), sBest = stat("Best", (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sStreak.box, sBest.box]));
            var boardEl = api.el("div", { style: "display:grid;grid-template-rows:repeat(6,1fr);gap:6px;margin:6px 0" });
            host.appendChild(api.el("div", { class: "board-wrap" }, boardEl));
            var kbEl = api.el("div", { style: "display:flex;flex-direction:column;gap:6px;width:100%;max-width:460px" });
            host.appendChild(kbEl);
            var hintBtn = api.el("button", { class: "btn", html: "&#128161; Hint" });
            hintBtn.addEventListener("click", useHint);
            host.appendChild(api.el("div", { class: "btn-row" }, [
                hintBtn,
                api.el("button", { class: "btn ghost", text: "New word", onclick: reset })
            ]));

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

            /* ---------- hints ----------
               A hint fills in one letter of the answer at its real position in the
               row you are typing, and locks that square so you cannot type over it.
               Two per word: enough to unstick a child, not enough to solve it. */
            function paintHints() {
                hintBtn.disabled = done || hintsLeft <= 0;
                hintBtn.style.opacity = hintBtn.disabled ? ".45" : "1";
                hintBtn.innerHTML = "&#128161; Hint" + (hintsLeft > 0 ? " (" + hintsLeft + ")" : "");
            }
            function useHint() {
                if (done || busy || hintsLeft <= 0) return;
                // Only offer positions the player has not already been given.
                var free = [];
                for (var i = 0; i < 5; i++) if (hintCells.indexOf(i) < 0) free.push(i);
                if (!free.length) { api.toast("Nothing left to give away!"); return; }
                var pos = free[Math.floor(Math.random() * free.length)];
                hintsLeft--;
                hintCells.push(pos);
                api.sound.good(); api.haptic(15);
                applyHintsToRow();
                api.toast("&#128161; Letter " + (pos + 1) + " is <b>" + target[pos] + "</b>");
                paintHints();
                saveNow();
            }
            /** Write every known hint letter into the current row and lock it. */
            function applyHintsToRow() {
                hintCells.forEach(function (pos) {
                    letters[row][pos] = target[pos];
                    var t = tiles[row * 5 + pos];
                    t.textContent = target[pos];
                    t.style.borderColor = "#FBBF24";
                    t.style.boxShadow = "inset 0 0 0 2px rgba(251,191,36,.45)";
                });
                // Move the cursor to the first square that is still empty.
                col = 0;
                while (col < 5 && letters[row][col]) col++;
            }
            function isHinted(c) { return hintCells.indexOf(c) > -1; }
            function saveNow() {
                if (done) return;
                api.saveState({ target: target, guesses: guesses.slice(), streak: streak,
                                hintsLeft: hintsLeft, hintCells: hintCells.slice(),
                                typed: letters[row].join("") });
            }

            function press(k) {
                if (done || busy) return;
                if (k === "ENTER") return submit();
                if (k === "DEL") {
                    // Step back over any hinted squares — they are not yours to delete.
                    var c = col - 1;
                    while (c >= 0 && isHinted(c)) c--;
                    if (c >= 0) {
                        col = c;
                        tiles[row * 5 + col].textContent = ""; tiles[row * 5 + col].style.borderColor = "var(--line)";
                        letters[row][col] = "";
                    }
                    saveNow();
                    return;
                }
                if (/^[A-Z]$/.test(k)) {
                    while (col < 5 && isHinted(col)) col++;      // skip letters already given
                    if (col >= 5) return;
                    var t = tiles[row * 5 + col];
                    t.textContent = k; t.style.borderColor = "var(--muted)";
                    t.animate([{transform:"scale(0.85)"},{transform:"scale(1)"}],{duration:100});
                    letters[row][col] = k; col++;
                    while (col < 5 && isHinted(col)) col++;
                    api.sound.tick();
                    saveNow();
                }
            }
            function submit() {
                if (letters[row].some(function (x) { return !x; })) { api.toast("Not enough letters"); shake(); return; }
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
                    guesses.push(guess);
                    if (guess === target) {
                        done = true; api.clearState(); streak++; api.save("streak", streak); var rec = api.setBest(streak); sStreak.val.textContent = streak; sBest.val.textContent = api.getBest();
                        api.sound.win(); api.haptic(30);
                        for (var j = 0; j < 5; j++) (function (j) { setTimeout(function () { tiles[row * 5 + j].animate([{transform:"translateY(0)"},{transform:"translateY(-14px)"},{transform:"translateY(0)"}], { duration: 400 }); }, j * 90); })(j);
                        setTimeout(function () {
                            var used = 2 - hintsLeft;
                            api.overlay({ emoji: "&#127881;", title: "Solved!", sub: "The word was <b>" + target + "</b><br>Streak: " + streak + (rec ? " &#127942;" : "") +
                                (used ? "<br><span class=\"small-note\">with " + used + " hint" + (used === 1 ? "" : "s") + "</span>" : ""),
                                buttons: [ { label: "Home", onClick: api.exit }, { label: "Next word", primary: true, onClick: reset } ] });
                        }, 700);
                    } else {
                        row++; col = 0;
                        if (row < 6) applyHintsToRow();
                        saveNow();
                        if (row >= 6) { done = true; api.clearState(); streak = 0; api.save("streak", 0); sStreak.val.textContent = 0; api.sound.lose();
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
                api.clearState(); guesses = [];
                target = pool[Math.floor(Math.random() * pool.length)];
                row = 0; col = 0; done = false; busy = false; letters = []; for (var r = 0; r < 6; r++) letters.push(["","","","",""]);
                hintsLeft = 2; hintCells = [];
                buildBoard(); buildKb(); paintHints();
                saveNow();
            }
            function restore(rs) {
                guesses = (rs.guesses || []).slice(); target = rs.target;
                if (typeof rs.streak === "number") { streak = rs.streak; sStreak.val.textContent = streak; }
                hintsLeft = typeof rs.hintsLeft === "number" ? rs.hintsLeft : 2;
                hintCells = (rs.hintCells || []).slice();
                row = 0; col = 0; done = false; busy = false; letters = []; for (var r = 0; r < 6; r++) letters.push(["","","","",""]);
                buildBoard(); buildKb();
                guesses.forEach(function (g) {
                    var res = score(g, target);
                    for (var i = 0; i < 5; i++) {
                        var t = tiles[row * 5 + i]; t.textContent = g[i];
                        var c = res[i] === 2 ? "#16A34A" : res[i] === 1 ? "#CA8A04" : "#3A3F55";
                        t.style.background = c; t.style.borderColor = c;
                        var kb = keyEls[g[i]]; if (kb) { var pr = kb._state || 0; if (res[i] >= pr) { kb._state = res[i]; kb.style.background = c; kb.style.color = "#fff"; kb.style.borderColor = "transparent"; } }
                    }
                    row++;
                });
                col = 0;
                if (row < 6) {
                    applyHintsToRow();
                    // Put back the letters that were mid-typing when the app went away.
                    var typed = (rs.typed || "").toUpperCase();
                    for (var c2 = 0; c2 < 5 && c2 < typed.length; c2++) {
                        if (!typed[c2] || typed[c2] === " " || isHinted(c2)) continue;
                        letters[row][c2] = typed[c2];
                        var tt = tiles[row * 5 + c2];
                        tt.textContent = typed[c2]; tt.style.borderColor = "var(--muted)";
                    }
                    col = 0; while (col < 5 && letters[row][col]) col++;
                }
                paintHints();
            }
            function key(e) { var k = e.key.toUpperCase(); if (k === "ENTER") press("ENTER"); else if (k === "BACKSPACE") press("DEL"); else if (/^[A-Z]$/.test(k)) press(k); }
            window.addEventListener("keydown", key);
            if (api.resumeState && api.resumeState.target) restore(api.resumeState); else reset();
            return function () { window.removeEventListener("keydown", key); };
        }
    });
})();
