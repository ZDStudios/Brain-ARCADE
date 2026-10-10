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
            var sp = api.space(), gw = Math.round(Math.min(sp.w + 28, sp.h * 0.97, sp.isTV ? 720 : 700));
            var grid = api.el("div", { class: "mm-grid", style: "width:" + gw + "px;font-size:" + Math.round(gw / 4 * 0.5) + "px" });
            host.appendChild(grid);
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
                    var card = api.el("button", { class: "mm-card", "aria-label": "Card " + (i + 1) },
                        api.el("div", { class: "mm-inner" }, [api.el("div", { class: "mm-back" }, api.el("span", { html: "&#129504;" })), api.el("div", { class: "mm-face", html: e })]));
                    card._e = e; card._flipped = false; card._done = false;
                    card.addEventListener("click", function () { flip(card); });
                    cards.push(card); grid.appendChild(card);
                    // Pairs already found stay face-up across a restart.
                    if (doneFlags[i]) { card._done = true; show(card, true); card.classList.add("done"); }
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
            function show(card, open) { card.classList.toggle("open", open); card._flipped = open; }
            function flip(card) {
                if (lock || card._flipped || card._done) return;
                show(card, true); api.sound.tick();
                if (!first) { first = card; return; }
                moves++; sMoves.val.textContent = moves;
                if (first._e === card._e) {
                    first._done = card._done = true; matched++; api.sound.pop(); api.haptic(10); saveNow();
                    var pa = first, pb = card; first = null;
                    setTimeout(function () { pa.classList.add("done"); pb.classList.add("done"); }, 320);
                    if (matched === EMOJI.length) win();
                } else {
                    lock = true; var a = first, b = card; first = null;
                    setTimeout(function () { a.classList.add("nope"); b.classList.add("nope"); }, 380);
                    setTimeout(function () { a.classList.remove("nope"); b.classList.remove("nope"); show(a, false); show(b, false); lock = false; api.sound.bad(); }, 850);
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
