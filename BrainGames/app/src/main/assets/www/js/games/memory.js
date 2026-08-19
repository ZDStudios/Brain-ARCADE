/* Memory Match */
(function () {
    window.BrainGames.register({
        id: "memory", name: "Memory Match", icon: "&#127183;",
        gradient: "linear-gradient(135deg,#0EA5E9,#6366F1)",
        best: "low", bestLabel: "Best", bestSuffix: " moves", resumable: true,
        help: {"emoji":"&#127183;","goal":"Find all the matching pairs of cards.","steps":["Tap a card to flip it face up.","Tap a second card to look for its match.","Matching cards stay; others flip back over.","Match every pair in as few moves as you can!"]},
        mount: function (host, api) {
            var EMOJI = ["&#127822;","&#127817;","&#127826;","&#127818;","&#127827;","&#129373;","&#127820;","&#127814;"];
            var cards, first, lock, moves, matched, time, timer;

            var sMoves = stat("Moves", "0"), sTime = stat("Time", "0s"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sMoves.box, sTime.box, sBest.box]));
            var grid = api.el("div", { style: "display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:" + Math.min(api.space().board, 380) + "px;width:100%" });
            host.appendChild(api.el("div", { class: "board-wrap" }, grid));
            host.appendChild(api.el("div", { class: "small-note", text: "Flip two cards to find matching pairs." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New game", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }

            function reset(rs) {
                clearInterval(timer);
                var faces, doneFlags;
                if (rs && rs.faces && rs.faces.length) {
                    faces = rs.faces.slice(); doneFlags = (rs.done || []).slice();
                    moves = rs.moves || 0; matched = rs.matched || 0; time = rs.time || 0;
                } else {
                    faces = EMOJI.concat(EMOJI).map(function (e) { return { e: e, r: Math.random() }; })
                        .sort(function (a, b) { return a.r - b.r; }).map(function (d) { return d.e; });
                    doneFlags = []; moves = 0; matched = 0; time = 0;
                }
                first = null; lock = false;
                sMoves.val.textContent = String(moves); sTime.val.textContent = time + "s";
                grid.innerHTML = ""; cards = [];
                faces.forEach(function (e, i) {
                    var card = api.el("div", { style: cardStyle(false), html: "?" });
                    card._e = e; card._flipped = false; card._done = false;
                    card.addEventListener("click", function () { flip(card); });
                    cards.push(card); grid.appendChild(card);
                    // Pairs already found stay face-up across a restart.
                    if (doneFlags[i]) { card._done = true; show(card, true); }
                });
                saveNow();
                timer = setInterval(function () { time++; sTime.val.textContent = time + "s"; saveNow(); }, 1000);
            }
            function saveNow() {
                if (!cards || !cards.length || matched === EMOJI.length) return;
                api.saveState({
                    faces: cards.map(function (c) { return c._e; }),
                    done: cards.map(function (c) { return !!c._done; }),
                    moves: moves, matched: matched, time: time
                });
            }
            function cardStyle(open) {
                return "aspect-ratio:1;display:grid;place-items:center;font-size:30px;border-radius:12px;cursor:pointer;transition:transform .15s;" +
                    (open ? "background:linear-gradient(135deg,#1E2748,#2A3560);border:2px solid var(--accent)" : "background:linear-gradient(135deg,#6366F1,#0EA5E9);border:2px solid transparent;color:transparent");
            }
            function show(card, open) { card.style.cssText = cardStyle(open); card.innerHTML = open ? card._e : "?"; card._flipped = open; }
            function flip(card) {
                if (lock || card._flipped || card._done) return;
                show(card, true); api.sound.tick();
                if (!first) { first = card; return; }
                moves++; sMoves.val.textContent = moves;
                if (first._e === card._e) {
                    first._done = card._done = true; matched++; first = null; api.sound.pop(); api.haptic(10); saveNow();
                    if (matched === EMOJI.length) win();
                } else {
                    lock = true; var a = first, b = card; first = null;
                    setTimeout(function () { show(a, false); show(b, false); lock = false; api.sound.bad(); }, 700);
                }
            }
            function win() {
                clearInterval(timer); api.clearState(); var rec = api.setBest(moves); api.sound.win(); api.haptic(30);
                api.overlay({ emoji: "&#127881;", title: "All matched!", sub: "Finished in <b>" + moves + "</b> moves &middot; " + time + "s" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: function () { reset(); } } ] });
            }
            reset(api.resumeState);
            return function () { clearInterval(timer); };
        }
    });
})();
