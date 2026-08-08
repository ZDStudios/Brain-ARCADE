/* Brain Race — the multiplayer game.
   Only appears when the tablet is on WiFi AND talking to the control server: it is
   the one game that cannot work offline, so the card is hidden rather than broken
   (see requiresServer in app.js).

   Two or three devices race through the same ten questions. The server hands out
   the questions and counts progress, so both sides always agree on who is ahead
   and who won. Devices are listed by their own name, falling back to the OS they
   are running when a name was never set. */
(function () {
    var TOTAL_FALLBACK = 10;

    window.BrainGames.register({
        id: "race", name: "Brain Race", icon: "&#127937;",
        gradient: "linear-gradient(135deg,#F43F5E,#FB923C)",
        best: "low", bestLabel: "Best time", bestSuffix: "s",
        requiresServer: true,
        difficulties: false,
        help: {
            emoji: "&#127937;", goal: "Race another device through ten questions — first to the finish line wins.",
            steps: [
                "Open Brain Arcade on a second device on the same WiFi.",
                "Pick that device from the list and tap Race.",
                "They accept, you both count down together, and the questions start.",
                "Every correct answer moves your racer forward. Wrong answers cost you a moment!"
            ]
        },
        mount: function (host, api) {
            var base = (api.serverUrl || "").replace(/\/+$/, "");
            var me = api.deviceId;
            var stage = "lobby";              // lobby | race | over
            var match = null, peers = [], invites = [], sentTo = {}, netFails = 0;
            var myCorrect = 0, locked = false, timer = null, tickTimer = null, dead = false;

            var wrap = api.el("div");
            host.appendChild(wrap);

            /* ---------- tiny fetch helper: never throws, never spams ---------- */
            function post(path, body) {
                var ctrl = ("timeout" in AbortSignal) ? AbortSignal.timeout(7000) : undefined;
                return fetch(base + path, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body || {}), signal: ctrl
                }).then(function (r) { return r.json(); }).catch(function () { return null; });
            }

            /* ---------- polling ---------- */
            function sync() {
                if (dead) return;
                post("/api/mp/sync", {
                    deviceId: me,
                    name: api.deviceName || "",
                    platform: api.platform || "",
                    matchId: match ? match.id : null
                }).then(function (data) {
                    if (dead) return;
                    if (!data) {
                        netFails++;
                        if (netFails === 3) renderOffline();
                        return;
                    }
                    netFails = 0;
                    peers = data.peers || [];
                    invites = data.invites || [];
                    var wasStage = stage;
                    var prevId = match && match.id;
                    match = data.match || null;
                    if (match && (match.state === "countdown" || match.state === "running")) {
                        if (stage !== "race" || prevId !== match.id) {
                            myCorrect = 0; locked = false; stage = "race"; renderRace(true);
                        } else { paintRace(); }
                    } else if (match && match.state === "over") {
                        if (stage !== "over") { stage = "over"; renderResult(); }
                    } else if (stage !== "lobby") {
                        stage = "lobby"; renderLobby();
                    } else if (wasStage === "lobby") {
                        renderLobby();
                    }
                });
            }
            function startPolling(ms) {
                clearInterval(timer);
                timer = setInterval(sync, ms);
            }

            /* ---------- lobby ---------- */
            function renderLobby() {
                wrap.innerHTML = "";
                wrap.appendChild(api.el("div", { class: "mp-head" }, [
                    api.el("div", { class: "mp-title", html: "&#127937; Brain Race" }),
                    api.el("div", { class: "small-note", style: "margin:0",
                        text: "You are “" + (api.deviceName || api.platform) + "”. Pick who to race." })
                ]));

                // Someone wants to race me.
                invites.forEach(function (inv) {
                    var card = api.el("div", { class: "mp-invite" }, [
                        api.el("div", { class: "mp-invite-txt", html: "<b>" + esc(inv.fromLabel) + "</b> wants to race you!" }),
                        api.el("div", { class: "btn-row", style: "margin:0" }, [
                            api.el("button", { class: "btn", text: "No thanks", onclick: function () {
                                api.sound.click(); post("/api/mp/respond", { deviceId: me, inviteId: inv.id, accept: false }).then(sync);
                            } }),
                            api.el("button", { class: "btn primary", text: "Race!", onclick: function () {
                                api.sound.good(); api.haptic(20);
                                post("/api/mp/respond", { deviceId: me, inviteId: inv.id, accept: true }).then(sync);
                            } })
                        ])
                    ]);
                    wrap.appendChild(card);
                });

                wrap.appendChild(api.el("div", { class: "section-label", text: "Devices on your server" }));
                if (!peers.length) {
                    wrap.appendChild(api.el("div", { class: "mp-empty" }, [
                        api.el("div", { class: "mp-empty-ico", html: "&#128225;" }),
                        api.el("div", { class: "mp-empty-txt", text: "Nobody else is here yet." }),
                        api.el("div", { class: "small-note", style: "margin:6px 0 0",
                            text: "Open Brain Arcade on another device and tap Brain Race there too — it will show up within a few seconds." })
                    ]));
                } else {
                    var list = api.el("div", { class: "mp-peers" });
                    peers.forEach(function (pr) {
                        var invited = !!sentTo[pr.id];
                        var row = api.el("div", { class: "mp-peer" }, [
                            api.el("div", { class: "mp-peer-ico", html: iconFor(pr.platform) }),
                            api.el("div", { class: "mp-peer-main" }, [
                                api.el("div", { class: "mp-peer-name", text: pr.label }),
                                api.el("div", { class: "mp-peer-sub", text: pr.busy ? "in a race" : (pr.platform || "Brain Arcade") })
                            ]),
                            api.el("button", {
                                class: "btn " + (pr.busy ? "" : "primary"),
                                text: pr.busy ? "Busy" : (invited ? "Asked…" : "Race"),
                                onclick: function () {
                                    if (pr.busy) { api.toast("That device is already racing"); return; }
                                    api.sound.click(); api.haptic(12);
                                    sentTo[pr.id] = true;
                                    renderLobby();
                                    post("/api/mp/invite", { deviceId: me, to: pr.id }).then(function (r) {
                                        if (!r || r.error) { sentTo[pr.id] = false; api.toast("Could not send the invite"); renderLobby(); }
                                        else api.toast("Invite sent to " + pr.label);
                                    });
                                }
                            })
                        ]);
                        list.appendChild(row);
                    });
                    wrap.appendChild(list);
                    wrap.appendChild(api.el("div", { class: "small-note",
                        text: "Ask two devices and all three of you race together." }));
                }
            }
            function iconFor(platform) {
                var p = (platform || "").toLowerCase();
                if (p.indexOf("tv") > -1) return "&#128250;";
                if (p.indexOf("iphone") > -1 || p.indexOf("phone") > -1) return "&#128241;";
                if (p.indexOf("ipad") > -1 || p.indexOf("tablet") > -1) return "&#128242;";
                if (p.indexOf("pc") > -1 || p.indexOf("mac") > -1 || p.indexOf("chromebook") > -1) return "&#128187;";
                return "&#127918;";
            }
            function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

            /* ---------- the race ---------- */
            var lanes = null, qBox = null, choiceBox = null, statusEl = null;
            function renderRace(fresh) {
                if (fresh) { wrap.innerHTML = ""; }
                else if (lanes) { paintRace(); return; }
                startPolling(1200);

                statusEl = api.el("div", { class: "mp-status", text: "Get ready…" });
                wrap.appendChild(statusEl);

                lanes = api.el("div", { class: "mp-track" });
                wrap.appendChild(lanes);

                qBox = api.el("div", { class: "mp-question", text: "—" });
                wrap.appendChild(qBox);
                choiceBox = api.el("div", { class: "mp-choices" });
                wrap.appendChild(choiceBox);
                wrap.appendChild(api.el("div", { class: "btn-row" }, [
                    api.el("button", { class: "btn", text: "Quit race", onclick: function () {
                        api.sound.click();
                        post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null }).then(function () { api.exit(); });
                    } })
                ]));

                clearInterval(tickTimer);
                tickTimer = setInterval(paintRace, 200);   // smooth countdown without hammering the server
                paintRace();
            }

            function total() { return (match && match.total) || TOTAL_FALLBACK; }
            function myPlayer() {
                if (!match) return null;
                var mine = match.players.filter(function (p) { return p.id === me; });
                return mine.length ? mine[0] : null;
            }

            function paintRace() {
                if (!match || !lanes) return;
                var waiting = Date.now() < match.startAt;
                var secs = Math.ceil((match.startAt - Date.now()) / 1000);

                // ---- lanes ----
                lanes.innerHTML = "";
                match.players.forEach(function (p) {
                    var pct = Math.round((p.progress / total()) * 100);
                    var lane = api.el("div", { class: "mp-lane" + (p.id === me ? " me" : "") }, [
                        api.el("div", { class: "mp-lane-top" }, [
                            api.el("div", { class: "mp-lane-name", text: (p.id === me ? "You" : p.label) + (p.left ? " (left)" : "") }),
                            api.el("div", { class: "mp-lane-score", text: p.progress + "/" + total() })
                        ]),
                        api.el("div", { class: "mp-rail" }, [
                            api.el("div", { class: "mp-fill", style: "width:" + pct + "%" }),
                            api.el("div", { class: "mp-racer", style: "left:" + pct + "%",
                                html: p.done ? "&#127942;" : (p.id === me ? "&#128640;" : "&#128663;") }),
                            api.el("div", { class: "mp-flag", html: "&#127937;" })
                        ])
                    ]);
                    lanes.appendChild(lane);
                });

                // ---- question ----
                if (waiting) {
                    statusEl.textContent = secs > 0 ? "Starting in " + secs + "…" : "Go!";
                    qBox.textContent = "Ready?";
                    choiceBox.innerHTML = "";
                    return;
                }
                var mine = myPlayer();
                if (mine && mine.progress > myCorrect) myCorrect = mine.progress;   // trust the server
                if (mine && mine.done) {
                    statusEl.textContent = "Finished! Waiting for the others…";
                    qBox.innerHTML = "&#127881; Done!";
                    choiceBox.innerHTML = "";
                    return;
                }
                statusEl.textContent = "Question " + (myCorrect + 1) + " of " + total();
                var q = match.questions[Math.min(myCorrect, match.questions.length - 1)];
                if (!q) return;
                if (qBox.getAttribute("data-q") !== String(myCorrect)) {
                    qBox.setAttribute("data-q", String(myCorrect));
                    qBox.textContent = q.text + " = ?";
                    choiceBox.innerHTML = "";
                    q.choices.forEach(function (choice) {
                        var b = api.el("button", { class: "mp-choice", text: String(choice) });
                        b.addEventListener("click", function () { answer(choice, q, b); });
                        choiceBox.appendChild(b);
                    });
                }
            }

            function answer(choice, q, btn) {
                if (locked || !match) return;
                var right = choice === q.answer;
                if (right) {
                    locked = true;
                    btn.classList.add("good");
                    api.sound.good(); api.haptic(12);
                    myCorrect++;
                    post("/api/mp/answer", { deviceId: me, matchId: match.id, correct: true }).then(function (r) {
                        locked = false;
                        if (r && r.match) { match = r.match; if (match.state === "over" && stage !== "over") { stage = "over"; renderResult(); return; } }
                        paintRace();
                    });
                } else {
                    // A wrong answer costs a moment — the question stays put.
                    locked = true;
                    btn.classList.add("bad");
                    api.sound.bad(); api.haptic(30);
                    post("/api/mp/answer", { deviceId: me, matchId: match.id, correct: false });
                    setTimeout(function () { locked = false; btn.classList.remove("bad"); }, 900);
                }
            }

            /* ---------- result ---------- */
            function renderResult() {
                clearInterval(tickTimer);
                var order = (match.players || []).slice().sort(function (a, b) {
                    if (b.progress !== a.progress) return b.progress - a.progress;
                    return (a.ms || 1e9) - (b.ms || 1e9);
                });
                var mine = myPlayer();
                var iWon = match.winner === me;
                if (iWon) {
                    var wins = (api.load("wins", 0) || 0) + 1;
                    api.save("wins", wins);
                }
                // Only a finished run has a time worth recording.
                var isBest = false;
                if (mine && mine.done && mine.ms > 0) isBest = api.setBest(Math.round(mine.ms / 100) / 10);

                var lines = order.map(function (p, i) {
                    var medal = i === 0 ? "&#129351;" : i === 1 ? "&#129352;" : "&#129353;";
                    var who = p.id === me ? "You" : esc(p.label);
                    var t = p.done && p.ms ? " &middot; " + (Math.round(p.ms / 100) / 10) + "s" : "";
                    return medal + " " + who + " — " + p.progress + "/" + total() + t;
                }).join("<br>");

                api.overlay({
                    emoji: iWon ? "&#127942;" : "&#127937;",
                    title: iWon ? "You won!" : (mine && mine.done ? "Good race!" : "Race over"),
                    sub: lines + (isBest ? "<br><br><b>New best time!</b>" : "") +
                         "<br><span class=\"small-note\">Wins so far: " + (api.load("wins", 0) || 0) + "</span>",
                    buttons: [
                        { label: "Home", onClick: function () { api.exit(); } },
                        { label: "Back to lobby", primary: true, onClick: function () {
                            post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null }).then(function () {
                                match = null; lanes = null; stage = "lobby";
                                startPolling(2000);
                                renderLobby(); sync();
                            });
                        } }
                    ]
                });
            }

            function renderOffline() {
                wrap.innerHTML = "";
                wrap.appendChild(api.el("div", { class: "mp-empty" }, [
                    api.el("div", { class: "mp-empty-ico", html: "&#128246;" }),
                    api.el("div", { class: "mp-empty-txt", text: "Lost the server" }),
                    api.el("div", { class: "small-note", style: "margin:6px 0 0",
                        text: "Brain Race needs WiFi and the control server. Every other game still works offline." })
                ]));
                wrap.appendChild(api.el("div", { class: "btn-row" }, [
                    api.el("button", { class: "btn primary", text: "Back to games", onclick: function () { api.exit(); } })
                ]));
            }

            if (!base) { renderOffline(); return function () {}; }
            renderLobby();
            sync();
            startPolling(2000);

            return function cleanup() {
                dead = true;
                clearInterval(timer); clearInterval(tickTimer);
                // Drop out of the lobby so nobody is invited to a device that left.
                post("/api/mp/quit", { deviceId: me, matchId: match ? match.id : null, leaveLobby: true });
            };
        }
    });
})();
