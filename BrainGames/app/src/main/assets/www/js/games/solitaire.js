/* Klondike Solitaire */
(function () {
    window.BrainGames.register({
        id: "solitaire", name: "Solitaire", icon: "&#127183;",
        gradient: "linear-gradient(135deg,#047857,#065F46)",
        best: "low", bestLabel: "Best", bestSuffix: "s",
        mount: function (host, api) {
            var SUITS = ["♠", "♥", "♦", "♣"];
            var RED = { "♥": 1, "♦": 1 };
            var RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
            var stock, waste, found, tableau, sel, moves, time, timer, won;

            var sMoves = stat("Moves", "0"), sTime = stat("Time", "0s"), sBest = stat("Best", (api.getBest() || "—") + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sMoves.box, sTime.box, sBest.box]));

            var W = Math.min(api.space().w, 460);
            var cw = Math.floor((W - 12) / 7) - 4, ch = Math.floor(cw * 1.4), yoff = Math.floor(ch * 0.32);
            var topRow = api.el("div", { style: "display:flex;gap:4px;margin-bottom:10px" });
            var tabRow = api.el("div", { style: "display:flex;gap:4px;align-items:flex-start" });
            host.appendChild(api.el("div", { class: "board-wrap", style: "padding:10px;overflow:visible" }, [topRow, tabRow]));
            host.appendChild(api.el("div", { class: "small-note", text: "Tap the deck to draw. Tap a card, then a pile to move it." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "New game", onclick: reset }) ]));

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function cardStyle(card, faceup, top) {
                var base = "width:" + cw + "px;height:" + ch + "px;border-radius:7px;box-sizing:border-box;position:absolute;left:0;font-weight:800;font-size:" + Math.max(11, Math.floor(cw * 0.32)) + "px;padding:3px 5px;";
                if (!faceup) return base + "top:" + top + "px;background:repeating-linear-gradient(45deg,#3730A3,#3730A3 6px,#4338CA 6px,#4338CA 12px);border:1px solid #1E1B4B";
                return base + "top:" + top + "px;background:#fff;border:1px solid #cbd5e1;color:" + (RED[card.s] ? "#DC2626" : "#111") + (sel && sel.card === card ? ";box-shadow:0 0 0 3px #22D3EE" : "");
            }
            function slotStyle() { return "width:" + cw + "px;height:" + ch + "px;border-radius:7px;border:1.5px dashed rgba(255,255,255,0.25);flex:0 0 auto;position:relative;background:rgba(255,255,255,0.04)"; }

            function reset() {
                clearInterval(timer);
                var deck = [];
                for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) deck.push({ s: SUITS[s], r: r });
                for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
                tableau = [[],[],[],[],[],[],[]]; found = [[],[],[],[]]; waste = []; stock = [];
                for (var col = 0; col < 7; col++) for (var k = 0; k <= col; k++) { var c = deck.pop(); c.up = (k === col); tableau[col].push(c); }
                stock = deck.map(function (c) { c.up = false; return c; });
                sel = null; moves = 0; time = 0; won = false;
                sMoves.val.textContent = "0"; sTime.val.textContent = "0s";
                render();
                timer = setInterval(function () { if (!won) { time++; sTime.val.textContent = time + "s"; } }, 1000);
            }
            function label(c) { return RANKS[c.r] + c.s; }

            function render() {
                topRow.innerHTML = ""; tabRow.innerHTML = "";
                // stock
                var stockEl = api.el("div", { style: slotStyle() });
                if (stock.length) stockEl.appendChild(api.el("div", { style: cardStyle(null, false, 0) }));
                stockEl.addEventListener("click", drawStock);
                topRow.appendChild(stockEl);
                // waste
                var wasteEl = api.el("div", { style: slotStyle() });
                if (waste.length) { var wc = waste[waste.length - 1]; var d = api.el("div", { style: cardStyle(wc, true, 0), html: label(wc) }); d.addEventListener("click", function () { pick({ type: "waste" }, wc); }); wasteEl.appendChild(d); }
                topRow.appendChild(wasteEl);
                topRow.appendChild(api.el("div", { style: "flex:1" }));
                // foundations
                found.forEach(function (f, fi) {
                    var fe = api.el("div", { style: slotStyle() });
                    fe.innerHTML = f.length ? "" : "<div style='opacity:.4;text-align:center;line-height:" + ch + "px'>" + SUITS[fi] + "</div>";
                    if (f.length) { var tc = f[f.length - 1]; fe.appendChild(api.el("div", { style: cardStyle(tc, true, 0), html: label(tc) })); }
                    fe.addEventListener("click", function () { dest({ type: "found", i: fi }); });
                    topRow.appendChild(fe);
                });
                // tableau
                tableau.forEach(function (pile, ci) {
                    var colEl = api.el("div", { style: "width:" + cw + "px;flex:0 0 auto;position:relative;min-height:" + ch + "px;height:" + Math.max(ch, (pile.length ? (pile.length - 1) * yoff + ch : ch)) + "px" });
                    if (!pile.length) { var empty = api.el("div", { style: slotStyle() }); empty.addEventListener("click", function () { dest({ type: "tab", i: ci }); }); colEl.appendChild(empty); }
                    pile.forEach(function (c, ri) {
                        var d = api.el("div", { style: cardStyle(c, c.up, ri * yoff), html: c.up ? label(c) : "" });
                        d.addEventListener("click", function () { if (c.up) pick({ type: "tab", i: ci, idx: ri }, c); else if (ri === pile.length - 1) { /* flip only via move */ } });
                        colEl.appendChild(d);
                    });
                    colEl.addEventListener("click", function (e) { if (e.target === colEl) dest({ type: "tab", i: ci }); });
                    tabRow.appendChild(colEl);
                });
            }
            function drawStock() {
                if (won) return;
                if (!stock.length) { if (!waste.length) return; stock = waste.reverse().map(function (c) { c.up = false; return c; }); waste = []; }
                else { var c = stock.pop(); c.up = true; waste.push(c); }
                sel = null; bump(); api.sound.tick(); render();
            }
            function pick(src, card) {
                if (won) return;
                if (sel && sel.card === card) { sel = null; render(); return; }
                sel = { src: src, card: card }; api.sound.click(); render();
            }
            function movingCards() {
                var s = sel.src;
                if (s.type === "waste") return [waste[waste.length - 1]];
                if (s.type === "found") return [found[s.i][found[s.i].length - 1]];
                if (s.type === "tab") return tableau[s.i].slice(s.idx);
                return [];
            }
            function canToFound(card, fi) {
                var f = found[fi]; if (SUITS[fi] !== card.s) return false;
                return f.length ? f[f.length - 1].r === card.r - 1 : card.r === 0;
            }
            function canToTab(card, ci) {
                var p = tableau[ci]; if (!p.length) return card.r === 12; // King to empty
                var top = p[p.length - 1]; return top.up && (RED[top.s] ? 1 : 0) !== (RED[card.s] ? 1 : 0) && top.r === card.r + 1;
            }
            function removeFromSrc() {
                var s = sel.src;
                if (s.type === "waste") waste.pop();
                else if (s.type === "found") found[s.i].pop();
                else if (s.type === "tab") { var pile = tableau[s.i]; pile.splice(s.idx); if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true; }
            }
            function dest(d) {
                if (won || !sel) { return; }
                var cards = movingCards();
                if (d.type === "found") {
                    if (cards.length === 1 && canToFound(cards[0], d.i)) { var c = cards[0]; removeFromSrc(); found[d.i].push(c); after(); return; }
                } else if (d.type === "tab") {
                    if (canToTab(cards[0], d.i)) { removeFromSrc(); cards.forEach(function (c) { tableau[d.i].push(c); }); after(); return; }
                }
                api.sound.bad(); sel = null; render();
            }
            function after() { sel = null; bump(); api.sound.pop(); api.haptic(8); render(); checkWin(); }
            function bump() { moves++; sMoves.val.textContent = moves; }
            function checkWin() {
                if (found.reduce(function (a, f) { return a + f.length; }, 0) === 52) {
                    won = true; clearInterval(timer); var rec = api.setBest(time); api.sound.win(); api.haptic(40);
                    api.overlay({ emoji: "&#127881;", title: "You won!", sub: "Cleared in <b>" + time + "s</b>, " + moves + " moves" + (rec ? "<br>&#127942; New best!" : ""),
                        buttons: [ { label: "Home", onClick: api.exit }, { label: "New game", primary: true, onClick: reset } ] });
                }
            }
            reset();
            return function () { clearInterval(timer); };
        }
    });
})();
