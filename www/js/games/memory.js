/* Memory Match */
(function () {
    window.BrainGames.register({
        id: "memory", name: "Memory Match", icon: "&#127183;",
        gradient: "linear-gradient(135deg,#0EA5E9,#6366F1)",
        best: "low", bestLabel: "Best", bestSuffix: " moves",
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

            function reset() {
                clearInterval(timer);
                var deck = EMOJI.concat(EMOJI).map(function (e) { return { e: e, r: Math.random() }; }).sort(function (a, b) { return a.r - b.r; });
                first = null; lock = false; moves = 0; matched = 0; time = 0;
                sMoves.val.textContent = "0"; sTime.val.textContent = "0s";
                grid.innerHTML = ""; cards = [];
                deck.forEach(function (d, i) {
                    var card = api.el("div", { style: cardStyle(false), html: "?" });
                    card._e = d.e; card._flipped = false; card._done = false;
                    card.addEventListener("click", function () { flip(card); });
                    cards.push(card); grid.appendChild(card);
                });
                timer = setInterval(function () { time++; sTime.val.textContent = time + "s"; }, 1000);
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
                    first._done = card._done = true; matched++; first = null; api.sound.pop(); api.haptic(10);
                    if (matched === EMOJI.length) win();
                } else {
                    lock = true; var a = first, b = card; first = null;
                    setTimeout(function () { show(a, false); show(b, false); lock = false; api.sound.bad(); }, 700);
                }
            }
            function win() {
                clearInterval(timer); var rec = api.setBest(moves); api.sound.win(); api.haptic(30);
                api.overlay({ emoji: "&#127881;", title: "All matched!", sub: "Finished in <b>" + moves + "</b> moves &middot; " + time + "s" + (rec ? "<br>&#127942; New best!" : ""),
                    buttons: [ { label: "Home", onClick: api.exit }, { label: "Play again", primary: true, onClick: reset } ] });
            }
            reset();
            return function () { clearInterval(timer); };
        }
    });
})();
