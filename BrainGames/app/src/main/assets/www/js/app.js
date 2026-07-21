/* ============================================================
   Brain Arcade — core framework
   Registry, router, settings, sound, storage, UI helpers,
   responsive sizing, animations, WiFi update + remote control.
   ============================================================ */
(function () {
    "use strict";

    var VERSION = "1.4.0";
    var batteryLevel = -1;
    var GAMES = [];
    var current = null;      // { def, cleanup }
    var route = "home";      // 'home' | 'game' | 'settings'
    var routeArg = null;

    /* ---------- storage ---------- */
    var LS = window.localStorage;
    function load(key, dflt) {
        try { var v = LS.getItem("ba_" + key); return v === null ? dflt : JSON.parse(v); }
        catch (e) { return dflt; }
    }
    function save(key, val) { try { LS.setItem("ba_" + key, JSON.stringify(val)); } catch (e) {} }

    var settings = load("settings", { theme: "dark", sound: true, haptics: true, serverUrl: "", deviceName: "" });
    if (settings.serverUrl == null) settings.serverUrl = "";
    if (settings.deviceName == null) settings.deviceName = "";

    var deviceId = load("deviceId", null);
    if (!deviceId) { deviceId = "dev_" + Math.random().toString(36).slice(2, 10); save("deviceId", deviceId); }

    function applyTheme() {
        document.documentElement.setAttribute("data-theme", settings.theme === "light" ? "light" : "dark");
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", settings.theme === "light" ? "#F4F6FF" : "#0B1020");
    }
    applyTheme();

    /* ---------- responsive sizing ---------- */
    function isTablet() { return Math.min(window.innerWidth, window.innerHeight) >= 600; }
    function space() {
        var view = document.getElementById("view");
        // leave room for #view padding (28) + board-wrap padding/border (~28)
        var pad = 56;
        var w = Math.max(200, (view ? view.clientWidth : window.innerWidth) - pad);
        var tab = isTablet();
        // room for topbar + stat tiles + control buttons
        var reserve = tab ? 300 : 250;
        var h = Math.max(240, window.innerHeight - reserve);
        var board = Math.min(w, h);
        // let tablets use bigger boards but keep it comfortable
        if (tab) board = Math.min(board, 560);
        return { w: w, h: h, board: board, isTablet: tab, unit: tab ? 1.15 : 1 };
    }
    document.documentElement.classList.toggle("tablet", isTablet());

    /* ---------- sound engine (WebAudio blips) ---------- */
    var actx = null;
    function ac() {
        if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
        if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
        return actx;
    }
    function tone(freq, dur, type, vol) {
        if (!settings.sound) return;
        var c = ac(); if (!c) return;
        try {
            var o = c.createOscillator(), g = c.createGain();
            o.type = type || "square"; o.frequency.value = freq;
            g.gain.value = (vol == null ? 0.06 : vol);
            o.connect(g); g.connect(c.destination);
            var t = c.currentTime;
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.start(t); o.stop(t + dur);
        } catch (e) {}
    }
    var Sound = {
        click: function () { tone(420, 0.05, "square", 0.05); },
        move:  function () { tone(300, 0.04, "triangle", 0.04); },
        good:  function () { tone(660, 0.08, "square", 0.06); setTimeout(function(){ tone(880, 0.09, "square", 0.06); }, 70); },
        bad:   function () { tone(160, 0.18, "sawtooth", 0.06); },
        tick:  function () { tone(520, 0.03, "square", 0.035); },
        win:   function () { [523,659,784,1047].forEach(function (f, i) { setTimeout(function(){ tone(f, 0.14, "square", 0.06); }, i * 90); }); },
        lose:  function () { [400,300,200].forEach(function (f, i) { setTimeout(function(){ tone(f, 0.16, "sawtooth", 0.06); }, i * 110); }); },
        pop:   function () { tone(740, 0.05, "sine", 0.05); }
    };
    function haptic(ms) {
        if (!settings.haptics) return;
        try {
            if (window.AndroidBridge && window.AndroidBridge.vibrate) { window.AndroidBridge.vibrate(ms || 15); return; }
            if (navigator.vibrate) navigator.vibrate(ms || 15);
        } catch (e) {}
    }

    /* ---------- DOM helpers ---------- */
    function el(tag, props, kids) {
        var n = document.createElement(tag);
        if (props) {
            for (var k in props) {
                if (k === "class") n.className = props[k];
                else if (k === "html") n.innerHTML = props[k];
                else if (k === "text") n.textContent = props[k];
                else if (k === "style") n.setAttribute("style", props[k]);
                else if (k.slice(0, 2) === "on" && typeof props[k] === "function") n.addEventListener(k.slice(2), props[k]);
                else if (props[k] != null) n.setAttribute(k, props[k]);
            }
        }
        if (kids != null) {
            if (!Array.isArray(kids)) kids = [kids];
            kids.forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
        }
        return n;
    }
    var toastTimer = null;
    function toast(msg) {
        var t = document.getElementById("toast");
        t.innerHTML = msg; t.hidden = false;
        requestAnimationFrame(function () { t.classList.add("show"); });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.hidden = true; }, 250); }, 1800);
    }

    /* ---------- best scores ---------- */
    function bestKey(id) { return "best_" + id; }
    function getBest(id) { return load(bestKey(id), null); }
    function setBest(id, value, mode) {
        var cur = getBest(id);
        var better = cur == null || (mode === "low" ? value < cur : value > cur);
        if (better) { save(bestKey(id), value); return true; }
        return false;
    }

    /* ---------- registry ---------- */
    function register(def) { GAMES.push(def); }

    /* ---------- overlay helper ---------- */
    function overlay(opts) {
        var ov = el("div", { class: "overlay" });
        var panel = el("div", { class: "panel pop" });
        if (opts.emoji) panel.appendChild(el("div", { class: "big", html: opts.emoji }));
        panel.appendChild(el("h2", { text: opts.title || "" }));
        if (opts.sub) panel.appendChild(el("p", { html: opts.sub }));
        var row = el("div", { class: "btn-row" });
        (opts.buttons || []).forEach(function (b) {
            row.appendChild(el("button", { class: "btn " + (b.primary ? "primary" : ""), text: b.label,
                onclick: function () { close(); if (b.onClick) b.onClick(); } }));
        });
        panel.appendChild(row);
        ov.appendChild(panel);
        document.body.appendChild(ov);
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
        ov._close = close;
        return ov;
    }
    function clearOverlays() { document.querySelectorAll(".overlay").forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); }

    /* ---------- How-to-Play instructions ---------- */
    var helpFab = null;
    function removeHelpFab() { if (helpFab && helpFab.parentNode) helpFab.parentNode.removeChild(helpFab); helpFab = null; }
    function openHelp(def) {
        var h = def.help || {};
        var ov = el("div", { class: "overlay help-overlay" });
        var panel = el("div", { class: "panel pop", style: "text-align:left;max-width:380px" });
        panel.appendChild(el("div", { class: "big", style: "text-align:center", html: h.emoji || def.icon || "&#127918;" }));
        panel.appendChild(el("h2", { style: "text-align:center", text: "How to play " + def.name }));
        if (h.goal) panel.appendChild(el("p", { class: "help-goal", html: "&#127919; <b>Goal:</b> " + h.goal }));
        var steps = el("ol", { class: "help-steps" });
        (h.steps || []).forEach(function (s) { steps.appendChild(el("li", { html: s })); });
        panel.appendChild(steps);
        var row = el("div", { class: "btn-row", style: "margin-top:10px" });
        row.appendChild(el("button", { class: "btn primary", text: "Let's play!", onclick: function () { if (ov.parentNode) ov.parentNode.removeChild(ov); } }));
        panel.appendChild(row);
        ov.appendChild(panel);
        document.body.appendChild(ov);
    }
    function showHelpFab(def) {
        removeHelpFab();
        if (!def.help) return;
        helpFab = el("button", { class: "help-fab", html: "?", onclick: function () { Sound.click(); haptic(8); openHelp(def); } });
        document.body.appendChild(helpFab);
        if (!load("helpseen_" + def.id, false)) { save("helpseen_" + def.id, true); setTimeout(function () { openHelp(def); }, 380); }
    }

    /* ---------- PIN keypad ---------- */
    function openPin(onOk) {
        var entered = "";
        var ov = el("div", { class: "overlay" });
        var panel = el("div", { class: "panel pop", style: "max-width:300px" });
        panel.appendChild(el("div", { class: "big", html: "&#128272;" }));
        panel.appendChild(el("h2", { text: "Enter PIN" }));
        var dots = el("div", { class: "pin-dots" });
        function drawDots() { dots.innerHTML = ""; for (var i = 0; i < 4; i++) dots.appendChild(el("span", { class: "pin-dot" + (i < entered.length ? " on" : "") })); }
        drawDots(); panel.appendChild(dots);
        var pad = el("div", { class: "pin-pad" });
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
        function pressKey(k) {
            Sound.tick(); haptic(6);
            if (k === "del") { entered = entered.slice(0, -1); drawDots(); return; }
            if (entered.length >= 4) return;
            entered += k; drawDots();
            if (entered.length === 4) {
                if (entered === PIN) { Sound.good(); close(); onOk(); }
                else { Sound.bad(); haptic(30); panel.animate([{transform:"translateX(0)"},{transform:"translateX(-8px)"},{transform:"translateX(8px)"},{transform:"translateX(0)"}],{duration:220}); entered = ""; setTimeout(drawDots, 120); }
            }
        }
        ["1","2","3","4","5","6","7","8","9","del","0","ok"].forEach(function (k) {
            var label = k === "del" ? "&#9003;" : k === "ok" ? "&#10003;" : k;
            var b = el("button", { class: "pin-key" + (k === "del" || k === "ok" ? " alt" : ""), html: label });
            b.addEventListener("click", function () { if (k === "ok") { if (entered === PIN) { Sound.good(); close(); onOk(); } else { Sound.bad(); } } else pressKey(k); });
            pad.appendChild(b);
        });
        panel.appendChild(pad);
        panel.appendChild(el("button", { class: "btn ghost", text: "Cancel", style: "margin-top:12px", onclick: close }));
        ov.appendChild(panel); document.body.appendChild(ov);
    }

    /* ---------- game on/off manager (behind PIN) ---------- */
    function openGameManager() {
        var ov = el("div", { class: "overlay" });
        var panel = el("div", { class: "panel", style: "max-width:420px;width:100%;text-align:left;max-height:82vh;display:flex;flex-direction:column" });
        panel.appendChild(el("h2", { style: "text-align:center;margin-bottom:4px", text: "Manage games" }));
        panel.appendChild(el("p", { class: "small-note", style: "margin:0 0 12px", text: "Tap to turn games on or off for the tablet." }));
        var list = el("div", { style: "overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px" });
        function isOn(id) { var l = settings.localAllowed; return !l || l.indexOf(id) > -1; }
        function toggle(id) {
            var l = settings.localAllowed ? settings.localAllowed.slice() : allGameIds();
            var i = l.indexOf(id);
            if (i > -1) l.splice(i, 1); else l.push(id);
            settings.localAllowed = (l.length === GAMES.length) ? null : l;
            save("settings", settings); Sound.click(); haptic(8);
        }
        GAMES.forEach(function (g) {
            var row = el("div", { class: "gm-row" });
            var ico = el("div", { class: "gm-ico", html: g.icon || "&#127918;", style: "background:" + (g.gradient || "#7C5CFF") });
            var name = el("div", { class: "gm-name", text: g.name });
            var input = el("input", { type: "checkbox" }); input.checked = isOn(g.id);
            var sw = el("label", { class: "switch" }, [input, el("span", { class: "track" }), el("span", { class: "thumb" })]);
            input.addEventListener("change", function () { toggle(g.id); });
            row.appendChild(ico); row.appendChild(name); row.appendChild(sw);
            list.appendChild(row);
        });
        panel.appendChild(list);
        var btns = el("div", { class: "btn-row", style: "margin-top:14px" }, [
            el("button", { class: "btn", text: "All on", onclick: function () { settings.localAllowed = null; save("settings", settings); Sound.good(); redraw(); } }),
            el("button", { class: "btn primary", text: "Done", onclick: function () { close(); refreshPolicyUI(); } })
        ]);
        panel.appendChild(btns);
        ov.appendChild(panel); document.body.appendChild(ov);
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
        function redraw() { close(); openGameManager(); }
    }

    /* ---------- api passed to games ---------- */
    function makeApi(def) {
        return {
            el: el, sound: Sound, haptic: haptic, toast: toast, overlay: overlay,
            space: space, isTablet: isTablet,
            getBest: function () { return getBest(def.id); },
            setBest: function (v) { return setBest(def.id, v, def.best || "high"); },
            save: function (k, v) { save(def.id + "_" + k, v); },
            load: function (k, d) { return load(def.id + "_" + k, d); },
            settings: settings,
            exit: function () { go("home"); }
        };
    }

    /* ---------- control policy (admin online) + local PIN list (offline) ---------- */
    var PIN = "2580";
    var policy = { locked: false, allowedGames: null }; // from server
    var serverGoverns = false;                          // true when online AND admin is restricting
    if (settings.localAllowed === undefined) settings.localAllowed = null; // null = all games on
    var allGameIds = function () { return GAMES.map(function (g) { return g.id; }); };
    function effAllowedList() {
        if (serverGoverns && policy.allowedGames) return policy.allowedGames;
        return settings.localAllowed || null; // null = all
    }
    function effLocked() { return serverGoverns && policy.locked; }
    function allowed(id) { var l = effAllowedList(); return !l || l.indexOf(id) > -1; }
    function serverUrl() { return (settings.serverUrl || "").replace(/\/+$/, ""); }
    function online() {
        try { if (window.AndroidBridge && typeof window.AndroidBridge.isOnline === "function") return !!window.AndroidBridge.isOnline(); } catch (e) {}
        return navigator.onLine !== false;
    }
    var pollTimer = null;
    function schedulePoll(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms || 15000); }
    function setGovern(v) { if (serverGoverns !== v) { serverGoverns = v; refreshPolicyUI(); } }
    function poll() {
        if (!serverUrl()) { setDot("off"); setGovern(false); return schedulePoll(30000); }
        if (!online()) { setDot("offline"); setGovern(false); return schedulePoll(12000); }
        var ctrl = "timeout" in AbortSignal ? AbortSignal.timeout(8000) : undefined;
        fetch(serverUrl() + "/api/heartbeat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: deviceId, name: settings.deviceName || "Tablet", app: VERSION, battery: batteryLevel }),
            signal: ctrl
        }).then(function (r) { return r.json(); }).then(function (data) {
            setDot("online");
            applyPolicy(data || {});
        }).catch(function () { setDot("offline"); setGovern(false); }).finally(function () { schedulePoll(15000); });
    }
    function applyPolicy(data) {
        policy.locked = !!data.locked;
        policy.allowedGames = Array.isArray(data.allowedGames) ? data.allowedGames.slice() : null;
        serverGoverns = policy.locked || policy.allowedGames != null;
        // Remote "update the app" command from the dashboard.
        if (data.appUpdate && data.appUpdate !== load("lastAppUpdate", null)) {
            save("lastAppUpdate", data.appUpdate);
            try { if (window.AndroidBridge && window.AndroidBridge.checkUpdate) { window.AndroidBridge.checkUpdate(); toast("Checking for an app update…"); } } catch (e) {}
        }
        refreshPolicyUI();
    }
    function refreshPolicyUI() {
        renderLock();
        if (route === "home") renderHome();
        if (route === "game" && routeArg && !allowed(routeArg.id)) { toast("This game is turned off"); go("home"); }
    }
    function renderLock() {
        var existing = document.getElementById("lockScreen");
        if (effLocked()) {
            if (existing) return;
            var ls = el("div", { id: "lockScreen", class: "lock-screen fade-in" }, [
                el("div", { class: "lock-inner" }, [
                    el("div", { class: "lock-ico", html: "&#128274;" }),
                    el("h2", { text: "Locked" }),
                    el("p", { text: "This tablet has been locked by the administrator." })
                ])
            ]);
            document.body.appendChild(ls);
        } else if (existing) { existing.remove(); }
    }
    var statusDot = null;
    function setDot(state) {
        if (!statusDot) return;
        statusDot.className = "status-dot " + state;
        statusDot.title = state === "online" ? "Connected to control server" : state === "offline" ? "Offline — games still work" : "";
        statusDot.style.display = (state === "off") ? "none" : "inline-block";
    }

    /* ---------- rendering ---------- */
    var view = null;
    function setView() { view = document.getElementById("view"); }
    function animateView() { view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter"); }

    function renderHome() {
        route = "home"; routeArg = null; current = null;
        document.getElementById("backBtn").hidden = true;
        view.innerHTML = "";
        var list = GAMES.filter(function (g) { return allowed(g.id); });
        var hero = el("div", { class: "hero fade-in" }, [
            el("h1", { text: "Play. Think. Repeat." }),
            el("p", { text: list.length + " brain-teasing games in one arcade. Beat your best scores!" })
        ]);
        view.appendChild(hero);
        view.appendChild(el("div", { class: "section-label", text: "All Games" }));
        var grid = el("div", { class: "grid" });
        list.forEach(function (def, i) {
            var best = getBest(def.id);
            var bestStr = best == null ? "Tap to play" : (def.bestLabel || "Best") + ": " + best + (def.bestSuffix || "");
            var card = el("div", { class: "game-card card-enter", style: "background:" + (def.gradient || "linear-gradient(135deg,#7C5CFF,#22D3EE)") + ";animation-delay:" + (i * 35) + "ms" }, [
                el("div", { class: "art", style: def.art || "" }),
                el("div", { class: "glass" }),
                el("div", { class: "ico", html: def.icon || "&#127918;" }),
                el("div", { class: "meta" }, [
                    el("div", { class: "name", text: def.name }),
                    el("div", { class: "best", text: bestStr })
                ])
            ]);
            card.addEventListener("click", function () { Sound.click(); haptic(12); openGame(def); });
            grid.appendChild(card);
        });
        view.appendChild(grid);
        if (!list.length) view.appendChild(el("div", { class: "small-note", text: "No games are currently enabled." }));
        else view.appendChild(el("div", { class: "small-note", html: "Made with &#128150; — everything runs offline on your device." }));
        animateView(); window.scrollTo(0, 0);
    }

    function openGame(def) {
        if (effLocked()) return;
        if (!allowed(def.id)) { toast("This game is turned off"); return; }
        route = "game"; routeArg = def;
        clearOverlays();
        document.getElementById("backBtn").hidden = false;
        view.innerHTML = "";
        var host = el("div", { class: "game-host" });
        view.appendChild(host);
        var api = makeApi(def);
        var cleanup = null;
        try { cleanup = def.mount(host, api); } catch (e) { toast("Game failed to load"); console.error(e); }
        current = { def: def, cleanup: typeof cleanup === "function" ? cleanup : null };
        showHelpFab(def);
        animateView(); window.scrollTo(0, 0);
    }

    function renderSettings() {
        route = "settings"; routeArg = null;
        clearOverlays();
        document.getElementById("backBtn").hidden = false;
        view.innerHTML = "";
        var wrap = el("div");
        wrap.appendChild(el("div", { class: "section-label", text: "Appearance" }));
        var g1 = el("div", { class: "settings-group" });
        g1.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#127912;" }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: "Theme" }), el("div", { class: "s-sub", text: "Choose light or dark mode" }) ])
        ]));
        var seg = el("div", { class: "seg", style: "margin:0 16px 15px" });
        ["dark", "light"].forEach(function (mode) {
            var b = el("button", { class: settings.theme === mode ? "active" : "", text: mode === "dark" ? "Dark" : "Light" });
            b.addEventListener("click", function () {
                settings.theme = mode; save("settings", settings); applyTheme();
                seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
                b.classList.add("active"); Sound.click(); haptic(10);
            });
            seg.appendChild(b);
        });
        g1.appendChild(seg);
        wrap.appendChild(g1);

        wrap.appendChild(el("div", { class: "section-label", text: "Feedback" }));
        var g2 = el("div", { class: "settings-group" });
        g2.appendChild(toggleRow("&#128266;", "Sound effects", "Retro blips while you play", "sound"));
        g2.appendChild(toggleRow("&#128243;", "Haptics", "Vibrate on key moments", "haptics"));
        wrap.appendChild(g2);

        wrap.appendChild(el("div", { class: "section-label", text: "Device & Control" }));
        var g4 = el("div", { class: "settings-group" });
        g4.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#128274;" }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: "Manage games (PIN)" }), el("div", { class: "s-sub", text: "Turn games on or off. Works offline." }) ]),
            el("button", { class: "btn", text: "Open", onclick: function () { Sound.click(); openPin(openGameManager); } })
        ]));
        g4.appendChild(textRow("&#127991;", "Device name", "Shown on the control dashboard", "deviceName", "Tablet"));
        g4.appendChild(textRow("&#127760;", "Control server URL", "Leave blank to disable remote control", "serverUrl", "https://your-app.onrender.com"));
        g4.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#8635;" }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: "Check for updates" }), el("div", { class: "s-sub", text: "Download the latest games over WiFi" }) ]),
            el("button", { class: "btn", text: "Check", onclick: function () {
                Sound.click();
                try { if (window.AndroidBridge && window.AndroidBridge.checkUpdate) { window.AndroidBridge.checkUpdate(); toast("Checking for updates…"); return; } } catch (e) {}
                toast("Updates run inside the app on WiFi");
            } })
        ]));
        wrap.appendChild(g4);

        wrap.appendChild(el("div", { class: "section-label", text: "Data" }));
        var g3 = el("div", { class: "settings-group" });
        g3.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#128465;" }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: "Reset high scores" }), el("div", { class: "s-sub", text: "Clear every saved best score" }) ]),
            el("button", { class: "btn", text: "Reset", onclick: function () {
                overlay({ emoji: "&#9888;&#65039;", title: "Reset all scores?", sub: "This can't be undone.",
                    buttons: [ { label: "Cancel" }, { label: "Reset", primary: true, onClick: function () {
                        GAMES.forEach(function (d) { try { LS.removeItem("ba_" + bestKey(d.id)); } catch (e) {} });
                        toast("High scores cleared"); Sound.good();
                    } } ] });
            } })
        ]));
        wrap.appendChild(g3);
        wrap.appendChild(el("div", { class: "small-note", html: "Brain Arcade v" + VERSION + " &#183; " + GAMES.length + " games &#183; Offline &amp; private" }));
        view.appendChild(wrap);
        animateView(); window.scrollTo(0, 0);
        poll();
    }
    function toggleRow(icon, title, sub, key) {
        var input = el("input", { type: "checkbox" });
        input.checked = !!settings[key];
        input.addEventListener("change", function () { settings[key] = input.checked; save("settings", settings); if (settings[key]) { Sound.click(); haptic(10); } });
        var sw = el("label", { class: "switch" }, [input, el("span", { class: "track" }), el("span", { class: "thumb" })]);
        return el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: icon }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: title }), el("div", { class: "s-sub", text: sub }) ]),
            sw
        ]);
    }
    function textRow(icon, title, sub, key, placeholder) {
        var input = el("input", { type: "text", class: "text-input", value: settings[key] || "", placeholder: placeholder || "" });
        input.addEventListener("change", function () { settings[key] = input.value.trim(); save("settings", settings); Sound.click(); if (key === "serverUrl") poll(); });
        return el("div", { class: "setting-row col" }, [
            el("div", { class: "row-head" }, [
                el("div", { class: "s-ico", html: icon }),
                el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: title }), el("div", { class: "s-sub", text: sub }) ])
            ]),
            input
        ]);
    }

    /* ---------- router ---------- */
    function teardown() {
        if (current && current.cleanup) { try { current.cleanup(); } catch (e) {} }
        current = null; clearOverlays(); removeHelpFab();
    }
    function go(where, arg) {
        teardown();
        if (where === "home") renderHome();
        else if (where === "settings") renderSettings();
        else if (where === "game" && arg) openGame(arg);
    }
    function handleBack() {
        if (effLocked()) return true;
        if (document.querySelector(".overlay")) { clearOverlays(); return true; }
        if (route === "game" || route === "settings") { Sound.click(); go("home"); return true; }
        return false;
    }

    /* ---------- orientation / resize re-mount ---------- */
    var lastW = window.innerWidth, lastH = window.innerHeight, resizeTimer = null;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            document.documentElement.classList.toggle("tablet", isTablet());
            var dw = Math.abs(window.innerWidth - lastW), dh = Math.abs(window.innerHeight - lastH);
            lastW = window.innerWidth; lastH = window.innerHeight;
            if (dw < 40 && dh < 40) return;
            if (route === "game" && current && current.def) { var def = current.def; teardown(); openGame(def); }
        }, 220);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", function () { lastW = -999; onResize(); });

    /* ---------- update hook (called from native) ---------- */
    function onUpdate(version) { toast("&#10024; Updated to v" + version + " — enjoy the new games!"); Sound.good(); }

    /* ---------- battery (top-left) ---------- */
    var batteryEl = null;
    function paintBattery() {
        if (!batteryEl) return;
        if (batteryLevel < 0) { batteryEl.style.display = "none"; return; }
        batteryEl.style.display = "inline-flex";
        var ico = batteryLevel > 80 ? "&#128267;" : batteryLevel <= 15 ? "&#129707;" : "&#128267;"; // battery / low-battery
        var color = batteryLevel <= 15 ? "var(--bad)" : batteryLevel <= 35 ? "var(--warn)" : "var(--good)";
        batteryEl.innerHTML = "<span class='bat-ico' style='color:" + color + "'>" + ico + "</span><span class='bat-pct'>" + batteryLevel + "%</span>";
    }
    function readBattery() {
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.getBattery === "function") {
                var v = window.AndroidBridge.getBattery();
                if (typeof v === "number" && v >= 0) { batteryLevel = v; paintBattery(); return; }
            }
        } catch (e) {}
        if (navigator.getBattery) {
            navigator.getBattery().then(function (b) { batteryLevel = Math.round(b.level * 100); paintBattery(); }).catch(function () {});
        }
    }

    /* ---------- update hook (called from native) ---------- */

    /* ---------- boot ---------- */
    function boot() {
        setView();
        var topbar = document.getElementById("topbar");
        batteryEl = el("span", { id: "battery", class: "battery", style: "display:none" });
        topbar.insertBefore(batteryEl, topbar.firstChild);
        readBattery(); setInterval(readBattery, 30000);
        // status dot in brand
        var brand = document.getElementById("title");
        statusDot = el("span", { class: "status-dot off", style: "display:none" });
        brand.appendChild(statusDot);
        document.getElementById("backBtn").addEventListener("click", function () { Sound.click(); haptic(10); go("home"); });
        document.getElementById("settingsBtn").addEventListener("click", function () { Sound.click(); haptic(10); route === "settings" ? go("home") : go("settings"); });
        brand.addEventListener("click", function () { if (route !== "home") go("home"); });
        var unlock = function () { ac(); window.removeEventListener("touchstart", unlock); window.removeEventListener("mousedown", unlock); };
        window.addEventListener("touchstart", unlock);
        window.addEventListener("mousedown", unlock);
        window.addEventListener("online", function () { setDot("online"); poll(); });
        window.addEventListener("offline", function () { setDot("offline"); });
        renderHome();
        renderLock();
        schedulePoll(1500);
    }

    window.BrainGames = {
        register: register, boot: boot, handleBack: handleBack, toast: toast, go: go,
        onUpdate: onUpdate, version: VERSION
    };
})();
