/* Air Hockey vs a bot (portrait rink, your goal at the bottom) */
(function () {
    window.BrainGames.register({
        id: "airhockey", name: "Air Hockey", icon: "&#127954;",
        gradient: "linear-gradient(135deg,#0EA5E9,#6366F1)",
        best: "high", bestLabel: "Wins", difficulties: true, twoPlayer: true, resumable: true,
        twoPlayerHint: "One at each end of the rink",
        help: {"emoji":"&#127954;","goal":"Smash the puck into the other goal. First to 7 wins!","steps":["Drag your mallet around your own half of the rink.","Hit the puck hard — it bounces off the walls.","Bank shots off the side walls to sneak past.","2 Players: one at each end — you can both drag at the same time."]},
        mount: function (host, api) {
            var TWO = api.twoPlayer;
            var sp = api.space();
            var W = Math.round(Math.min(sp.w, (sp.h - 40) / 1.5, 460)), H = Math.round(W * 1.5);
            var TARGET = 7;
            var BOT = {
                easy:   { speed: 0.55, react: 0.26, aim: 0.75, attack: 0.3 },
                medium: { speed: 0.95, react: 0.15, aim: 0.45, attack: 0.55 },
                hard:   { speed: 1.5,  react: 0.07, aim: 0.18, attack: 0.85 }
            }[api.difficulty] || { speed: 0.95, react: 0.15, aim: 0.45, attack: 0.55 };

            var MR = W * 0.085, PR = W * 0.045;
            // The bot's goal (top) is wider than yours, so scoring is easier than conceding.
            // vs the bot its goal is wider (easier to score than to concede); 2 players get a fair rink
            var TGOAL = W * (TWO ? 0.44 : 0.5), T0 = (W - TGOAL) / 2, T1 = T0 + TGOAL, GOAL = W * (TWO ? 0.44 : 0.4), G0 = (W - GOAL) / 2, G1 = G0 + GOAL;
            var MAXV = H * 2.0, MALLET_V = H * 4.2;
            var puck, you, bot, target, target2, pScore, bScore, raf, last = 0, state = "play", pauseT = 0, flash = null, sparks = [], trail = [], botAim = 0, botThink = 0, botAttack = true, stillT = 0;
            var wins = api.load("wins", 0), keys = {};

            var sYou = stat(TWO ? "Blue" : "You", "0"), sBot = stat(TWO ? "Pink" : "Bot", "0"), sBest = stat(TWO ? "First to" : "Wins", TWO ? "7" : (api.getBest() || 0) + "");
            host.appendChild(api.el("div", { class: "game-topline" }, [sYou.box, sBot.box, sBest.box]));
            var canvas = api.el("canvas", { width: W, height: H, class: "ah-canvas" });
            host.appendChild(api.el("div", { class: "board-wrap" }, canvas));
            host.appendChild(api.el("div", { class: "small-note", text: TWO ? "Pink plays from the top, Blue from the bottom — both drag at once. First to " + TARGET + "!" : "Drag your mallet. First to " + TARGET + " wins." }));
            host.appendChild(api.el("div", { class: "btn-row" }, [ api.el("button", { class: "btn", text: "Restart", onclick: function () { reset(null); } }) ]));
            var ctx = canvas.getContext("2d");

            function stat(k, v) { var val = api.el("div", { class: "v", text: v }); return { box: api.el("div", { class: "stat" }, [api.el("div", { class: "k", text: k }), val]), val: val }; }
            function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

            function reset(saved) {
                pScore = saved ? saved.p | 0 : 0; bScore = saved ? saved.b | 0 : 0;
                you = { x: W / 2, y: H * 0.82, vx: 0, vy: 0 };
                bot = { x: W / 2, y: H * 0.18, vx: 0, vy: 0 };
                target = { x: you.x, y: you.y };
                target2 = { x: bot.x, y: bot.y };
                sparks = []; trail = []; flash = null;
                place(saved && saved.serve === "bot" ? -1 : 1);
                showScore();
                if (!saved) api.clearState();
            }
            // Puck rests in the half of whoever conceded (dir 1 = your half).
            function place(dir) {
                puck = { x: W / 2, y: dir > 0 ? H * 0.62 : H * 0.38, vx: 0, vy: 0 };
                state = "serve"; pauseT = 0.6;
            }
            function showScore() { sYou.val.textContent = pScore; sBot.val.textContent = bScore; }

            /* ---------- physics ---------- */
            function moveMallet(m, tx, ty, maxV, dt, top) {
                var dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), stepMax = maxV * dt;
                if (d > stepMax) { dx *= stepMax / d; dy *= stepMax / d; }
                var nx = clamp(m.x + dx, MR, W - MR);
                var ny = top ? clamp(m.y + dy, MR, H / 2 - MR) : clamp(m.y + dy, H / 2 + MR, H - MR);
                m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt; m.x = nx; m.y = ny;
            }
            function hitMallet(m, isYou) {
                var dx = puck.x - m.x, dy = puck.y - m.y, d = Math.hypot(dx, dy), min = MR + PR;
                if (d >= min) return;
                if (d < 0.001) { dx = 0; dy = isYou ? -1 : 1; d = 1; }
                var nx = dx / d, ny = dy / d;
                puck.x = m.x + nx * min; puck.y = m.y + ny * min;
                var rv = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
                if (rv < 0) {
                    puck.vx -= 1.9 * rv * nx; puck.vy -= 1.9 * rv * ny;
                    var sp = Math.hypot(puck.vx, puck.vy);
                    if (sp > MAXV) { puck.vx *= MAXV / sp; puck.vy *= MAXV / sp; }
                    var hard = Math.min(1, -rv / (H * 1.2));
                    burst(puck.x - nx * PR, puck.y - ny * PR, isYou ? "#38BDF8" : "#F472B6", 4 + Math.round(hard * 8));
                    if (isYou) { api.sound.pop(); api.haptic(hard > 0.5 ? 14 : 6); } else api.sound.tick();
                }
            }
            function post(px, py) {
                var dx = puck.x - px, dy = puck.y - py, d = Math.hypot(dx, dy);
                if (d >= PR || d < 0.001) return;
                var nx = dx / d, ny = dy / d; puck.x = px + nx * PR; puck.y = py + ny * PR;
                var rv = puck.vx * nx + puck.vy * ny; if (rv < 0) { puck.vx -= 1.8 * rv * nx; puck.vy -= 1.8 * rv * ny; api.sound.tick(); }
            }
            function walls() {
                if (puck.x < PR) { puck.x = PR; if (puck.vx < 0) { puck.vx = -puck.vx * 0.9; bump(); } }
                if (puck.x > W - PR) { puck.x = W - PR; if (puck.vx > 0) { puck.vx = -puck.vx * 0.9; bump(); } }
                if (!(puck.x > T0 && puck.x < T1) && puck.y < PR) { puck.y = PR; if (puck.vy < 0) { puck.vy = -puck.vy * 0.9; bump(); } }
                if (!(puck.x > G0 && puck.x < G1) && puck.y > H - PR) { puck.y = H - PR; if (puck.vy > 0) { puck.vy = -puck.vy * 0.9; bump(); } }
                post(T0, 0); post(T1, 0); post(G0, H); post(G1, H);
                if (puck.y < -PR * 0.6) goal(true);
                else if (puck.y > H + PR * 0.6) goal(false);
            }
            function bump() { if (Math.hypot(puck.vx, puck.vy) > H * 0.3) api.sound.tick(); }

            function goal(forYou) {
                if (state !== "play") return;
                if (forYou) { pScore++; api.sound.good(); api.haptic(25); burst(puck.x, 4, "#FBBF24", 26); }
                else { bScore++; api.sound.bad(); api.haptic(40); burst(puck.x, H - 4, "#F87171", 18); }
                showScore();
                flash = TWO ? { text: forYou ? "BLUE SCORES!" : "PINK SCORES!", color: forYou ? "#38BDF8" : "#F472B6", t: 0 }
                            : { text: forYou ? "GOAL!" : "Bot scores", color: forYou ? "#FBBF24" : "#F87171", t: 0 };
                if (pScore >= TARGET || bScore >= TARGET) return finish();
                api.saveState({ p: pScore, b: bScore, serve: forYou ? "bot" : "you" });
                state = "goal"; pauseT = 1.1;
                puck.vx = puck.vy = 0; puck.hidden = true;
                goal.next = forYou ? -1 : 1;
            }
            function finish() {
                state = "over"; puck.hidden = true; api.clearState();
                var won = pScore > bScore;
                if (TWO) {
                    api.sound.win(); api.haptic(40);
                    setTimeout(function () {
                        api.overlay({ emoji: "&#127942;", title: (won ? "Blue" : "Pink") + " wins!", sub: "Blue " + pScore + " – " + bScore + " Pink",
                            buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: function () { reset(null); } } ] });
                    }, 700);
                    return;
                }
                if (won) {
                    wins++; api.save("wins", wins); api.setBest(wins); sBest.val.textContent = api.getBest() || wins;
                    api.sound.win(); api.haptic(40);
                }
                else api.sound.lose();
                setTimeout(function () {
                    api.overlay({ emoji: won ? "&#127942;" : "&#129302;", title: won ? "You win!" : "The bot wins",
                        sub: pScore + " – " + bScore + (won ? "  ·  " + wins + (wins === 1 ? " win" : " wins") + " so far" : "  ·  so close — go again!"),
                        buttons: [ { label: "Home", onClick: api.exit }, { label: "Rematch", primary: true, onClick: function () { reset(null); } } ] });
                }, 700);
            }

            /* ---------- bot brain ---------- */
            function botTarget(dt) {
                botThink -= dt;
                if (botThink <= 0) { botThink = BOT.react; botAim = (Math.random() - 0.5) * BOT.aim * W; if (Math.random() < 0.25) botAttack = Math.random() < BOT.attack; }
                var homeY = H * 0.1 + MR;
                var inHalf = puck.y < H / 2, slow = Math.hypot(puck.vx, puck.vy) < H * 0.5, coming = puck.vy < 0;
                if (!puck.hidden && inHalf && (slow || puck.y > bot.y) && (botAttack || slow)) {
                    // Puck parked where the bot cannot get behind it (against its own wall): just shove it.
                    if (stillT > 1.5) return { x: puck.x, y: puck.y };
                    // Get behind the puck (on the side away from your goal) and drive through it.
                    var aimX = W / 2 + botAim, aimY = H + PR;
                    var dx = aimX - puck.x, dy = aimY - puck.y, d = Math.hypot(dx, dy) || 1;
                    if (bot.y < puck.y - MR * 0.5) return { x: puck.x - dx / d * MR * 0.4, y: puck.y - dy / d * MR * 0.4 + MR * 0.2 };
                    return { x: puck.x + (puck.x < W / 2 ? -1 : 1) * MR * 1.4, y: Math.max(MR, puck.y - (MR + PR) * 1.5) };
                }
                // Defend: sit between the puck and the middle of the goal.
                var px = puck.x;
                if (coming && puck.vy < -1) {
                    var t = (homeY - puck.y) / puck.vy; px = puck.x + puck.vx * t;
                    var span = W - 2 * PR; px -= PR; px = ((px % (2 * span)) + 2 * span) % (2 * span); if (px > span) px = 2 * span - px; px += PR;
                }
                return { x: clamp(px + botAim * 0.5, T0 - MR * 0.3, T1 + MR * 0.3), y: homeY };
            }

            /* ---------- loop ---------- */
            function update(dt) {
                for (var i = sparks.length - 1; i >= 0; i--) { var s = sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) sparks.splice(i, 1); }
                if (flash) { flash.t += dt; if (flash.t > 1.2) flash = null; }
                if (keys.ArrowLeft) target.x -= W * 1.4 * dt; if (keys.ArrowRight) target.x += W * 1.4 * dt;
                if (keys.ArrowUp) target.y -= W * 1.4 * dt; if (keys.ArrowDown) target.y += W * 1.4 * dt;
                target.x = clamp(target.x, MR, W - MR); target.y = clamp(target.y, H / 2 + MR, H - MR);
                if (TWO) {
                    if (keys.a) target2.x -= W * 1.4 * dt; if (keys.d) target2.x += W * 1.4 * dt;
                    if (keys.w) target2.y -= W * 1.4 * dt; if (keys.s) target2.y += W * 1.4 * dt;
                    target2.x = clamp(target2.x, MR, W - MR); target2.y = clamp(target2.y, MR, H / 2 - MR);
                }
                if (state === "over") return;
                if (state === "goal") { pauseT -= dt; if (pauseT <= 0) place(goal.next); return; }
                if (state === "serve") { pauseT -= dt; if (pauseT <= 0) state = "play"; }
                var N = 6, h = dt / N, bt = TWO ? target2 : botTarget(dt);
                for (var k = 0; k < N; k++) {
                    moveMallet(you, target.x, target.y, MALLET_V, h, false);
                    moveMallet(bot, bt.x, bt.y, TWO ? MALLET_V : H * BOT.speed, h, true);
                    if (state !== "play") continue;
                    puck.x += puck.vx * h; puck.y += puck.vy * h;
                    hitMallet(you, true); hitMallet(bot, false); walls();
                    if (state !== "play") break;
                }
                stillT = (puck.y < H / 2 && Math.hypot(puck.vx, puck.vy) < H * 0.15) ? stillT + dt : 0;
                var f = Math.pow(0.7, dt); puck.vx *= f; puck.vy *= f;
                if (!puck.hidden) { trail.push({ x: puck.x, y: puck.y }); if (trail.length > 9) trail.shift(); }
            }
            function burst(x, y, color, n) {
                for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = W * (0.2 + Math.random() * 0.6); sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.35, color: color }); }
            }

            function draw() {
                var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1E1B4B"); g.addColorStop(0.5, "#0F172A"); g.addColorStop(1, "#082F49");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // air holes
                ctx.fillStyle = "rgba(255,255,255,0.05)";
                var gap = W / 14; for (var yy = gap / 2; yy < H; yy += gap) for (var xx = gap / 2; xx < W; xx += gap) ctx.fillRect(xx, yy, 1.5, 1.5);
                ctx.lineWidth = 3; ctx.strokeStyle = "rgba(244,114,182,0.45)";
                ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.16, 0, 7); ctx.stroke();
                ctx.strokeStyle = "rgba(244,114,182,0.3)"; ctx.beginPath(); ctx.arc(W / 2, 0, TGOAL * 0.56, 0, Math.PI); ctx.stroke();
                ctx.strokeStyle = "rgba(56,189,248,0.3)"; ctx.beginPath(); ctx.arc(W / 2, H, GOAL * 0.62, Math.PI, 2 * Math.PI); ctx.stroke();
                // goals
                ctx.fillStyle = "#020617"; ctx.fillRect(T0, 0, TGOAL, 7); ctx.fillRect(G0, H - 7, GOAL, 7);
                ctx.fillStyle = "#F472B6"; ctx.fillRect(T0, 0, TGOAL, 3);
                ctx.fillStyle = "#38BDF8"; ctx.fillRect(G0, H - 3, GOAL, 3);
                ctx.fillStyle = "#E2E8F0"; [[T0, 0], [T1, 0], [G0, H], [G1, H]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fill(); });
                // trail + puck
                if (!puck.hidden) {
                    for (var i = 0; i < trail.length; i++) { ctx.globalAlpha = (i + 1) / trail.length * 0.25; ctx.fillStyle = "#FBBF24"; ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, PR * (0.5 + i / trail.length * 0.5), 0, 7); ctx.fill(); }
                    ctx.globalAlpha = 1;
                    ctx.shadowColor = "#FBBF24"; ctx.shadowBlur = 14;
                    ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.arc(puck.x, puck.y, PR, 0, 7); ctx.fill();
                    ctx.shadowBlur = 0; ctx.lineWidth = PR * 0.28; ctx.strokeStyle = "#FBBF24"; ctx.beginPath(); ctx.arc(puck.x, puck.y, PR * 0.78, 0, 7); ctx.stroke();
                }
                mallet(bot, "#F472B6", "#9D174D"); mallet(you, "#38BDF8", "#075985");
                for (var j = 0; j < sparks.length; j++) { var s = sparks[j]; ctx.globalAlpha = Math.max(0, s.life * 2); ctx.fillStyle = s.color; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
                ctx.globalAlpha = 1;
                if (state === "serve" && pauseT > 0) { ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "bold " + Math.round(W * 0.05) + "px sans-serif"; ctx.textAlign = "center"; ctx.fillText(puck.y > H / 2 ? (TWO ? "Blue's puck!" : "Your puck!") : (TWO ? "Pink's puck!" : "Bot's puck"), W / 2, H / 2 + (puck.y > H / 2 ? W * 0.3 : -W * 0.25)); }
                if (flash) {
                    var a = Math.min(1, (1.2 - flash.t) * 3), sc = 1 + Math.max(0, 0.3 - flash.t) * 2;
                    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.scale(sc, sc);
                    ctx.font = "900 " + Math.round(W * 0.14) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.lineWidth = 6; ctx.strokeStyle = "#020617"; ctx.strokeText(flash.text, 0, 0); ctx.fillStyle = flash.color; ctx.fillText(flash.text, 0, 0);
                    ctx.restore();
                }
            }
            function mallet(m, c, dark) {
                ctx.shadowColor = c; ctx.shadowBlur = 16;
                ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(m.x, m.y, MR, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
                ctx.fillStyle = c; ctx.beginPath(); ctx.arc(m.x, m.y, MR * 0.8, 0, 7); ctx.fill();
                ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(m.x, m.y, MR * 0.42, 0, 7); ctx.fill();
                ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(m.x - MR * 0.12, m.y - MR * 0.14, MR * 0.22, 0, 7); ctx.fill();
            }
            function loop(ts) {
                raf = requestAnimationFrame(loop);
                var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
                // Freeze while a panel (how-to-play, continue?) covers the rink, so the bot never scores on a kid who is reading.
                if (!document.querySelector(".overlay")) update(dt);
                draw();
            }

            /* ---------- input ---------- */
            /* Each finger is tracked on its own. In 2-player mode the half of the rink a
               finger first lands in decides whose mallet it drives, so both players can
               play at the same time without stealing each other's mallet. */
            var owner = {};   // pointerId -> "top" | "bottom"
            function aim(e) {
                var r = canvas.getBoundingClientRect();
                var x = (e.clientX - r.left) * (W / r.width), y = (e.clientY - r.top) * (H / r.height);
                var side = owner[e.pointerId] || (TWO && y < H / 2 ? "top" : "bottom");
                var t = side === "top" ? target2 : target;
                t.x = x; t.y = y;
                e.preventDefault();
            }
            canvas.addEventListener("pointerdown", function (e) {
                try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
                var r = canvas.getBoundingClientRect();
                owner[e.pointerId] = TWO && (e.clientY - r.top) * (H / r.height) < H / 2 ? "top" : "bottom";
                aim(e);
            });
            canvas.addEventListener("pointermove", aim);
            function up(e) { delete owner[e.pointerId]; }
            canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
            function kd(e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (/^Arrow/.test(k) || (TWO && /^[wasd]$/.test(k))) { keys[k] = true; e.preventDefault(); } }
            function ku(e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; }
            window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

            reset(api.resumeState || null);
            raf = requestAnimationFrame(loop);
            return function () { cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
        }
    });
})();
