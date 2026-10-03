/* Spelling Bee — make words from seven letters, always using the gold one.
   The same rules as the newspaper puzzle: 4+ letters, letters can repeat, the
   centre letter must be in every word, and a word that uses all seven is a
   PANGRAM. Ranks climb from Beginner to Queen Bee, which is what keeps people
   coming back for "just one more word".

   Puzzles are pre-built from common English words (see bee-words.js), so every
   word you are scored against is one a child could actually know. Rarer real
   words still count as bonus words — typing a genuine word is never "wrong". */
(function () {
    var PUZZLES = window.BEE_PUZZLES || [];
    var RANKS = [
        { at: 0,    name: "Beginner",   emoji: "&#128029;" },
        { at: 0.02, name: "Good Start", emoji: "&#127793;" },
        { at: 0.05, name: "Moving Up",  emoji: "&#11014;&#65039;" },
        { at: 0.08, name: "Good",       emoji: "&#128077;" },
        { at: 0.15, name: "Solid",      emoji: "&#128170;" },
        { at: 0.25, name: "Nice",       emoji: "&#10024;" },
        { at: 0.40, name: "Great",      emoji: "&#127775;" },
        { at: 0.50, name: "Amazing",    emoji: "&#128293;" },
        { at: 0.70, name: "Genius",     emoji: "&#129504;" },
        { at: 1.00, name: "Queen Bee",  emoji: "&#128081;" }
    ];

    function points(word, isPangram) {
        var p = word.length === 4 ? 1 : word.length;
        return p + (isPangram ? 7 : 0);
    }
    function todayIndex() {
        var d = new Date(), key = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
        return PUZZLES.length ? key % PUZZLES.length : 0;
    }

    window.BrainGames.register({
        id: "spellingbee", name: "Spelling Bee", icon: "&#128029;",
        gradient: "linear-gradient(135deg,#F59E0B,#FBBF24)",
        best: "high", bestLabel: "Best score",
        resumable: true,
        help: {
            emoji: "&#128029;", goal: "Make as many words as you can from the seven letters.",
            steps: [
                "Every word must use the GOLD letter in the middle.",
                "Words need at least 4 letters. You can use a letter more than once!",
                "Longer words score more. Use all seven letters for a PANGRAM bonus.",
                "Climb the ranks from Beginner all the way to Queen Bee."
            ]
        },
        mount: function (host, api) {
            if (!PUZZLES.length) { host.appendChild(api.el("div", { class: "small-note", text: "Puzzles failed to load." })); return; }

            var idx, P, letters, typed = "", found = [], score = 0, maxScore = 0, lastRank = -1;

            // ---- layout ----
            var rankName = api.el("div", { class: "bee-rank-name" });
            var rankFill = api.el("i", { class: "bee-rank-fill" });
            var scoreEl = api.el("div", { class: "bee-score" });
            host.appendChild(api.el("div", { class: "bee-top" }, [
                api.el("div", { class: "bee-rank-row" }, [rankName, scoreEl]),
                api.el("div", { class: "bee-rank-bar" }, [rankFill])
            ]));
            var foundEl = api.el("div", { class: "bee-found" });
            host.appendChild(foundEl);
            var inputEl = api.el("div", { class: "bee-input" });
            host.appendChild(inputEl);
            var hive = api.el("div", { class: "bee-hive" });
            host.appendChild(hive);
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn", text: "Delete", onclick: function () { backspace(); } }),
                api.el("button", { class: "btn bee-shuffle", html: "&#128260;", "aria-label": "Shuffle", onclick: function () { shuffle(); } }),
                api.el("button", { class: "btn primary", text: "Enter", onclick: function () { submit(); } })
            ]));
            host.appendChild(api.el("div", { class: "btn-row" }, [
                api.el("button", { class: "btn ghost", text: "Today's puzzle", onclick: function () { load(todayIndex()); } }),
                api.el("button", { class: "btn ghost", text: "New puzzle", onclick: function () { load((idx + 1 + Math.floor(Math.random() * (PUZZLES.length - 1))) % PUZZLES.length); } })
            ]));

            // ---- puzzle ----
            function load(i, restoreFound) {
                idx = i; P = PUZZLES[idx];
                letters = P.letters.split("");
                // progress on each puzzle is kept, so coming back to today's hive
                // shows everything already found
                found = restoreFound || api.load("found_" + idx, []);
                maxScore = P.words.reduce(function (s, w) { return s + points(w, P.pangrams.indexOf(w) > -1); }, 0);
                score = found.reduce(function (s, w) { return s + points(w, isPangram(w)); }, 0);
                typed = ""; lastRank = rankIndex();
                drawHive(); drawInput(); drawFound(); drawRank();
                persist();
            }
            function isPangram(w) {
                var all = P.letters + P.centre;
                for (var k = 0; k < all.length; k++) if (w.indexOf(all[k]) < 0) return false;
                return true;
            }
            function rankIndex() {
                var r = 0, frac = maxScore ? score / maxScore : 0;
                for (var k = 0; k < RANKS.length; k++) if (frac >= RANKS[k].at - 1e-9) r = k;
                return r;
            }

            // ---- drawing ----
            function hex(letter, centre, slot) {
                var b = api.el("button", { class: "bee-cell" + (centre ? " centre" : ""), "data-slot": String(slot), text: letter.toUpperCase() });
                b.addEventListener("click", function () { add(letter); b.classList.remove("tap"); void b.offsetWidth; b.classList.add("tap"); });
                return b;
            }
            function drawHive() {
                hive.innerHTML = "";
                hive.appendChild(hex(P.centre, true, 0));
                letters.forEach(function (l, i) { hive.appendChild(hex(l, false, i + 1)); });
            }
            function drawInput() {
                inputEl.innerHTML = "";
                if (!typed) { inputEl.appendChild(api.el("span", { class: "bee-caret" })); return; }
                typed.split("").forEach(function (ch) {
                    var cls = ch === P.centre ? "c" : (P.letters.indexOf(ch) > -1 ? "" : "bad");
                    inputEl.appendChild(api.el("span", { class: "bee-ch " + cls, text: ch.toUpperCase() }));
                });
            }
            function drawFound() {
                foundEl.innerHTML = "";
                var head = api.el("div", { class: "bee-found-head", text: "You have found " + found.length + " word" + (found.length === 1 ? "" : "s") });
                foundEl.appendChild(head);
                var list = api.el("div", { class: "bee-found-list" });
                found.slice().sort().forEach(function (w) {
                    list.appendChild(api.el("span", { class: "bee-word" + (isPangram(w) ? " pg" : ""), text: w }));
                });
                foundEl.appendChild(list);
            }
            function drawRank() {
                var r = rankIndex();
                rankName.innerHTML = RANKS[r].emoji + " " + RANKS[r].name;
                scoreEl.textContent = score + " pts";
                rankFill.style.width = Math.min(100, maxScore ? (score / maxScore) * 100 : 0) + "%";
            }

            // ---- input ----
            function add(l) {
                if (typed.length >= 19) return;
                typed += l; api.sound.tick(); api.haptic(5); drawInput();
            }
            function backspace() { typed = typed.slice(0, -1); drawInput(); }
            function shuffle() {
                for (var i = letters.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = letters[i]; letters[i] = letters[j]; letters[j] = t; }
                api.sound.click(); drawHive();
            }
            function reject(msg) {
                api.toast(msg); api.sound.bad(); api.haptic(25);
                inputEl.classList.remove("shake"); void inputEl.offsetWidth; inputEl.classList.add("shake");
                setTimeout(function () { typed = ""; drawInput(); }, 380);
            }
            function submit() {
                var w = typed.toLowerCase();
                if (!w) return;
                if (w.length < 4) return reject("Too short");
                if (w.indexOf(P.centre) < 0) return reject("Missing the gold letter");
                for (var k = 0; k < w.length; k++) if ((P.letters + P.centre).indexOf(w[k]) < 0) return reject("Bad letters");
                if (found.indexOf(w) > -1) return reject("Already found");
                var main = P.words.indexOf(w) > -1, bonus = (P.bonus || []).indexOf(w) > -1;
                if (!main && !bonus) return reject("Not in word list");

                var pg = isPangram(w), pts = points(w, pg);
                found.push(w); score += pts; typed = "";
                api.save("found_" + idx, found);
                // a word earns its own little moment — that is the hook
                var praise = pg ? "&#127881; PANGRAM! +" + pts : (w.length >= 7 ? "Awesome! +" : w.length >= 5 ? "Nice! +" : "Good! +") + pts;
                if (bonus) praise += " <span class=\"small-note\">(bonus word)</span>";
                api.toast(praise);
                if (pg) { api.sound.win(); api.haptic(40); } else { api.sound.good(); api.haptic(12); }

                var r = rankIndex();
                if (r > lastRank) {
                    lastRank = r;
                    api.setBest(score);
                    setTimeout(function () { api.toast(RANKS[r].emoji + " New rank: <b>" + RANKS[r].name + "</b>!"); api.sound.win(); }, 900);
                    if (r === RANKS.length - 1) {
                        setTimeout(function () {
                            api.overlay({ emoji: "&#128081;", title: "Queen Bee!", sub: "You found every word in this hive.",
                                buttons: [{ label: "Home", onClick: api.exit }, { label: "New puzzle", primary: true, onClick: function () { load((idx + 1) % PUZZLES.length); } }] });
                        }, 1500);
                    }
                }
                drawInput(); drawFound(); drawRank(); persist();
            }
            function persist() { api.saveState({ idx: idx, found: found.slice() }); }

            function onKey(e) {
                var k = e.key;
                if (/^[a-zA-Z]$/.test(k)) { add(k.toLowerCase()); e.preventDefault(); }
                else if (k === "Backspace") { backspace(); e.preventDefault(); }
                else if (k === "Enter") { submit(); e.preventDefault(); }
                else if (k === " ") { shuffle(); e.preventDefault(); }
            }
            document.addEventListener("keydown", onKey);

            var rs = api.resumeState;
            if (rs && typeof rs.idx === "number" && PUZZLES[rs.idx]) load(rs.idx, rs.found || []);
            else load(todayIndex());

            return function () { document.removeEventListener("keydown", onKey); };
        }
    });
})();
