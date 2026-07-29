/* ============================================================
   Brain Arcade — core framework
   Registry, router, settings, sound, storage, UI helpers,
   responsive sizing, animations, WiFi update + remote control.
   ============================================================ */
(function () {
    "use strict";

    var VERSION = "1.7.1";
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
    if (settings.tvMode == null) settings.tvMode = "auto"; // "auto" | "on" | "off"

    /* ---------- native bridge helpers ---------- */
    function bridgeCall(name, dflt, arg) {
        try {
            var b = window.AndroidBridge;
            if (b && typeof b[name] === "function") return (arg === undefined ? b[name]() : b[name](arg));
        } catch (e) {}
        return dflt;
    }
    function hasBridge() { return bridgeCall("isTV", null) !== null || !!(window.AndroidBridge && window.AndroidBridge.vibrate); }

    /* ---------- TV / big-screen mode ---------- */
    var tvDetected = (function () {
        if (bridgeCall("isTV", false) === true) return true;
        try { if (/\btv\b|smarttv|googletv|appletv|hbbtv|netcast|webos|tizen|bravia|crkey|aft[bmst]/i.test(navigator.userAgent)) return true; } catch (e) {}
        try { if (location.search.indexOf("tv=1") > -1) return true; } catch (e) {}
        return false;
    })();
    function tvActive() {
        if (settings.tvMode === "on") return true;
        if (settings.tvMode === "off") return false;
        return tvDetected;
    }
    function applyTvClass() { document.documentElement.classList.toggle("tv", tvActive()); }

    // Prefer a stable hardware id so scores can be restored after a reinstall.
    var deviceId = load("deviceId", null);
    try {
        if (window.AndroidBridge && typeof window.AndroidBridge.getDeviceId === "function") {
            var hw = window.AndroidBridge.getDeviceId();
            if (hw && String(hw).length >= 6) deviceId = "and_" + hw;
        }
    } catch (e) {}
    if (!deviceId) { deviceId = "dev_" + Math.random().toString(36).slice(2, 10); }
    save("deviceId", deviceId);

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
        var tv = tvActive();
        // room for topbar + stat tiles + control buttons (TV chrome is taller).
        // fitExtra is added when a game turned out taller than the screen — see
        // fitGameToScreen(), which keeps everything visible without scrolling.
        var reserve = (tv ? 380 : tab ? 300 : 250) + fitExtra;
        var h = Math.max(240, window.innerHeight - reserve);
        var board = Math.min(w, h);
        // let bigger screens use bigger boards but keep it comfortable
        if (tv) board = Math.min(board, 760);
        else if (tab) board = Math.min(board, 560);
        return { w: w, h: h, board: board, isTablet: tab, isTV: tv, unit: tv ? 1.3 : tab ? 1.15 : 1 };
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

    /* ============================================================
       D-pad / remote navigation
       Lets a TV remote, arrow keys or a game controller drive the whole
       UI. Deliberately inactive during gameplay so the arrow keys still
       belong to Snake, Tetris, 2048 and friends.
       ============================================================ */
    var NAV_SEL = ".game-card, .btn, .icon-btn, .diff-card, .pin-key, .seg button, .switch, .text-input, .help-fab";
    var navFocused = null;

    // Modal overlays capture navigation so focus can't wander behind them.
    function navScope() {
        var ovs = document.querySelectorAll(".overlay");
        if (ovs.length) return ovs[ovs.length - 1];
        return document;
    }
    function isVisible(e) {
        var r = e.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
    }
    function navCandidates() {
        var out = [], els = navScope().querySelectorAll(NAV_SEL);
        for (var i = 0; i < els.length; i++) {
            var e = els[i];
            if (e.disabled || e.hasAttribute("hidden")) continue;
            if (!isVisible(e)) continue;
            out.push(e);
        }
        return out;
    }
    function isNavCandidate(e) { return !!e && navCandidates().indexOf(e) > -1; }
    function ensureFocusable() {
        var els = document.querySelectorAll(NAV_SEL);
        for (var i = 0; i < els.length; i++) {
            if (!els[i].hasAttribute("tabindex") && els[i].tagName !== "BUTTON" && els[i].tagName !== "INPUT" && els[i].tagName !== "A") {
                els[i].setAttribute("tabindex", "0");
            }
        }
    }
    function focusEl(e) {
        if (!e) return;
        if (navFocused && navFocused !== e) navFocused.classList.remove("nav-focus");
        navFocused = e;
        e.classList.add("nav-focus");
        try { e.focus({ preventScroll: true }); } catch (err) { try { e.focus(); } catch (e2) {} }
        try { e.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch (err) {}
    }
    function focusFirst() {
        var list = navCandidates();
        if (!list.length) return false;
        // Prefer the first real content control over the top-bar icons.
        var pick = list[0];
        for (var i = 0; i < list.length; i++) {
            if (!list[i].classList.contains("icon-btn")) { pick = list[i]; break; }
        }
        focusEl(pick);
        return true;
    }
    function pickInDirection(from, dir) {
        var list = navCandidates();
        if (!from || list.indexOf(from) < 0) return list[0] || null;
        var a = from.getBoundingClientRect();
        var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        var best = null, bestScore = Infinity;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e === from) continue;
            var b = e.getBoundingClientRect();
            var dx = (b.left + b.width / 2) - ax, dy = (b.top + b.height / 2) - ay;
            var along, across;
            if (dir === "left") { along = -dx; across = Math.abs(dy); }
            else if (dir === "right") { along = dx; across = Math.abs(dy); }
            else if (dir === "up") { along = -dy; across = Math.abs(dx); }
            else { along = dy; across = Math.abs(dx); }
            if (along <= 2) continue;                  // must lie in that direction
            var score = along + across * 2.2;          // strongly prefer aligned neighbours
            if (score < bestScore) { bestScore = score; best = e; }
        }
        return best;
    }
    // Navigation is off mid-game (arrows belong to the game) but on for
    // menus, choosers and any overlay — including a game-over panel.
    function navEnabled() {
        if (document.querySelector(".overlay")) return true;
        if (document.querySelector(".chooser")) return true;
        return route !== "game";
    }
    function isTyping(e) { return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA"); }

    function onNavKey(ev) {
        var k = ev.key;
        var dir = k === "ArrowLeft" ? "left" : k === "ArrowRight" ? "right"
                : k === "ArrowUp" ? "up" : k === "ArrowDown" ? "down" : null;
        var active = document.activeElement;
        if (dir) {
            if (!navEnabled() || isTyping(active)) return;
            ensureFocusable();
            if (!isNavCandidate(active)) { if (focusFirst()) ev.preventDefault(); return; }
            var next = pickInDirection(active, dir);
            if (next) { focusEl(next); ev.preventDefault(); }
            return;
        }
        if (k === "Enter" || k === " " || k === "Spacebar") {
            if (!navEnabled() || isTyping(active)) return;
            if (isNavCandidate(active)) {
                // Labels/divs don't fire a click from Enter on their own.
                if (active.tagName !== "BUTTON" && active.tagName !== "A") { active.click(); ev.preventDefault(); }
            }
            return;
        }
        if (k === "Escape" || k === "Backspace" || k === "BrowserBack") {
            if (isTyping(active)) return;
            if (handleBack()) ev.preventDefault();
        }
    }

    var navRefreshTimer = null;
    function startNavWatcher() {
        try {
            var obs = new MutationObserver(function () {
                clearTimeout(navRefreshTimer);
                navRefreshTimer = setTimeout(function () {
                    ensureFocusable();
                    // On a TV there is no touch, so always keep something selected.
                    if (tvActive() && navEnabled() && !isNavCandidate(document.activeElement)) focusFirst();
                }, 60);
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
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

    /* ============================================================
       Kiosk mode — built in (replaces the separate "Kiosk Lock" app)
       ============================================================ */
    function kioskSupported() { return bridgeCall("isKiosk", null) !== null; }
    function kioskOn() { return bridgeCall("isKiosk", false) === true; }
    function setKiosk(on) {
        if (!kioskSupported()) { toast("Kiosk mode needs the installed app"); return false; }
        bridgeCall("setKiosk", null, !!on);
        document.documentElement.classList.toggle("kiosk", !!on);
        toast(on ? "&#128274; Kiosk mode ON" : "&#128275; Kiosk mode OFF");
        Sound.good(); haptic(20);
        // Report the new state right away instead of waiting for the next
        // 15s heartbeat, so the dashboard badge updates promptly.
        setTimeout(function () { schedulePoll(300); }, 60);
        return true;
    }
    function openKioskAdmin() {
        var supported = kioskSupported();
        var on = kioskOn();
        var owner = bridgeCall("isDeviceOwner", false) === true;
        var home = bridgeCall("isHomeApp", false) === true;
        var ov = el("div", { class: "overlay" });
        var panel = el("div", { class: "panel pop", style: "max-width:380px;text-align:left" });
        panel.appendChild(el("div", { class: "big", style: "text-align:center", html: on ? "&#128274;" : "&#128275;" }));
        panel.appendChild(el("h2", { style: "text-align:center", text: "Kiosk admin" }));
        var status = on
            ? (owner ? "Locked to Brain Arcade. No exit gesture (device owner)."
                     : "Locked to Brain Arcade using screen pinning.")
            : "Kiosk mode is off. The tablet works normally.";
        panel.appendChild(el("p", { class: "small-note", style: "text-align:left;margin:0 0 10px", text: status }));
        if (supported) {
            panel.appendChild(el("p", { class: "small-note", style: "text-align:left;margin:0 0 14px",
                html: "Home app: <b>" + (home ? "Brain Arcade" : "not set") + "</b>" +
                      (home ? "" : " &middot; set it so the Home button stays in the app.") }));
        } else {
            panel.appendChild(el("p", { class: "small-note", style: "text-align:left;margin:0 0 14px",
                text: "Install the Brain Arcade app to use kiosk mode." }));
        }
        var btns = el("div", { class: "btn-row", style: "flex-direction:column;gap:10px" });
        if (supported) {
            btns.appendChild(el("button", { class: "btn " + (on ? "" : "primary"), style: "width:100%",
                html: on ? "&#128275; Turn kiosk OFF" : "&#128274; Turn kiosk ON",
                onclick: function () { close(); setKiosk(!on); } }));
            if (!home) {
                btns.appendChild(el("button", { class: "btn", style: "width:100%", text: "Set as Home app",
                    onclick: function () { close(); bridgeCall("openHomeSettings", null); } }));
            }
        }
        btns.appendChild(el("button", { class: "btn ghost", style: "width:100%", text: "Close", onclick: function () { close(); } }));
        panel.appendChild(btns);
        ov.appendChild(panel); document.body.appendChild(ov);
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    }
    // Hidden escape hatch: 7 quick taps in the top-left corner, then the PIN.
    // Mirrors the old Kiosk Lock app's admin gesture.
    function installCornerGesture() {
        var taps = 0, timer = null;
        document.addEventListener("pointerdown", function (ev) {
            if (ev.clientX > 96 || ev.clientY > 96) { taps = 0; clearTimeout(timer); return; }
            taps++;
            clearTimeout(timer);
            timer = setTimeout(function () { taps = 0; }, 2500);
            if (taps >= 7) { taps = 0; openPin(openKioskAdmin); }
        }, true);
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
    var liveState = null; // latest in-progress state for resume (set via api.saveState)
    function makeApi(def, difficulty, resumeState) {
        return {
            el: el, sound: Sound, haptic: haptic, toast: toast, overlay: overlay,
            space: space, isTablet: isTablet,
            difficulty: difficulty || "medium",
            resumeState: resumeState || null,
            saveState: function (s) { liveState = s; },
            clearState: function () { liveState = null; try { LS.removeItem("ba_resume_" + def.id); } catch (e) {} },
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
    var pendingClearScores = false;
    function schedulePoll(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms || 15000); }
    function setGovern(v) { if (serverGoverns !== v) { serverGoverns = v; refreshPolicyUI(); } }
    // Current best scores, so the server can back them up (survives reinstall).
    function currentScores() {
        var out = {};
        GAMES.forEach(function (g) { var b = getBest(g.id); if (b != null) out[g.id] = b; });
        return out;
    }
    // Merge a server backup into local bests, respecting each game's scoring mode.
    function mergeBackup(backup) {
        if (!backup || typeof backup !== "object") return;
        var changed = false;
        GAMES.forEach(function (g) {
            if (!(g.id in backup)) return;
            var remote = backup[g.id], localBest = getBest(g.id), mode = g.best || "high";
            var better = localBest == null || (mode === "low" ? remote < localBest : remote > localBest);
            if (better) { save(bestKey(g.id), remote); changed = true; }
        });
        if (changed && route === "home") renderHome();
    }
    function poll() {
        if (!serverUrl()) { setDot("off"); setGovern(false); stopStream(); return schedulePoll(30000); }
        if (!online()) { setDot("offline"); setGovern(false); stopStream(); return schedulePoll(12000); }
        var ctrl = "timeout" in AbortSignal ? AbortSignal.timeout(8000) : undefined;
        var body = {
            deviceId: deviceId, name: settings.deviceName || "Tablet", app: VERSION, battery: batteryLevel,
            games: GAMES.map(function (g) { return { id: g.id, name: g.name }; }),
            scores: currentScores(),
            canStream: canCapture(),   // true only in the installed app (needs native screen capture)
            canKiosk: kioskSupported(),
            kiosk: kioskOn(),
            tv: tvActive()
        };
        if (pendingClearScores) { body.clearScores = true; pendingClearScores = false; }
        fetch(serverUrl() + "/api/heartbeat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl
        }).then(function (r) { return r.json(); }).then(function (data) {
            setDot("online");
            applyPolicy(data || {});
        }).catch(function () { setDot("offline"); setGovern(false); stopStream(); }).finally(function () { schedulePoll(streaming ? 4000 : 15000); });
    }
    function applyPolicy(data) {
        var newLocked = !!data.locked;
        var newAllowed = Array.isArray(data.allowedGames) ? data.allowedGames.slice() : null;
        var newGoverns = newLocked || newAllowed != null;
        // Only touch the UI when the policy actually changed — otherwise the home
        // screen would re-render (flash) on every 15s heartbeat.
        var changed = newLocked !== policy.locked
            || newGoverns !== serverGoverns
            || JSON.stringify(newAllowed) !== JSON.stringify(policy.allowedGames);
        policy.locked = newLocked; policy.allowedGames = newAllowed; serverGoverns = newGoverns;
        // Remote "update the app" command from the dashboard.
        if (data.appUpdate && data.appUpdate !== load("lastAppUpdate", null)) {
            save("lastAppUpdate", data.appUpdate);
            try { if (window.AndroidBridge && window.AndroidBridge.checkUpdate) { window.AndroidBridge.checkUpdate(); toast("Checking for an app update…"); } } catch (e) {}
        }
        // Restore/merge any backed-up scores (e.g. after a reinstall).
        if (data.scoresBackup) mergeBackup(data.scoresBackup);
        // Remote pop-up message from the dashboard.
        if (data.popup && data.popup.ts && data.popup.ts !== load("lastPopup", null)) {
            save("lastPopup", data.popup.ts);
            showMessage(data.popup.text || "");
        }
        // Remote kiosk on/off from the dashboard.
        if (data.kiosk && data.kiosk.ts && data.kiosk.ts !== load("lastKiosk", null)) {
            save("lastKiosk", data.kiosk.ts);
            if (kioskSupported() && kioskOn() !== !!data.kiosk.on) setKiosk(!!data.kiosk.on);
        }
        // On-demand screen streaming (only while the dashboard asks for it).
        if (data.stream) startStream(); else stopStream();
        // Replay any remote taps queued by the dashboard.
        if (Array.isArray(data.input) && data.input.length) data.input.forEach(applyRemoteTap);
        if (changed) refreshPolicyUI();
    }

    /* ---------- remote pop-up message ---------- */
    function showMessage(text) {
        if (!text) return;
        overlay({ emoji: "&#128172;", title: "Message", sub: esc(text),
            buttons: [ { label: "OK", primary: true } ] });
        Sound.pop(); haptic(20);
    }
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

    /* ---------- on-demand screen streaming + remote taps ---------- */
    var streaming = false, streamTimer = null;
    function canCapture() { try { return !!(window.AndroidBridge && typeof window.AndroidBridge.captureScreen === "function"); } catch (e) { return false; } }
    function startStream() {
        if (streaming) return;
        if (!canCapture()) return; // only the installed app can capture its own screen
        streaming = true;
        clearTimeout(streamTimer);
        (function loop() {
            if (!streaming) return;
            try {
                var b64 = window.AndroidBridge.captureScreen();
                if (b64 && serverUrl()) {
                    fetch(serverUrl() + "/api/frame", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ deviceId: deviceId, data: b64 })
                    }).catch(function () {});
                }
            } catch (e) {}
            streamTimer = setTimeout(loop, 1200);
        })();
    }
    function stopStream() { streaming = false; clearTimeout(streamTimer); }
    function applyRemoteTap(t) {
        if (!t || typeof t.x !== "number" || typeof t.y !== "number") return;
        var cx = Math.round(t.x * window.innerWidth), cy = Math.round(t.y * window.innerHeight);
        var target = document.elementFromPoint(cx, cy);
        if (!target) return;
        var opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window };
        try { target.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch (e) {}
        try { target.dispatchEvent(new MouseEvent("mousedown", opts)); } catch (e) {}
        try { target.dispatchEvent(new MouseEvent("mouseup", opts)); } catch (e) {}
        try { target.dispatchEvent(new PointerEvent("pointerup", opts)); } catch (e) {}
        try { target.dispatchEvent(new MouseEvent("click", opts)); } catch (e) {}
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
            var bestStr = best == null ? (tvActive() ? "Press OK to play" : "Tap to play")
                                       : (def.bestLabel || "Best") + ": " + best + (def.bestSuffix || "");
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

    // Extra board reserve for games whose controls make them taller than the
    // screen (e.g. Block Blast's piece tray on a 720p TV). Measured after mount.
    var fitExtra = 0, fitAttempts = 0;

    var RESUME_WINDOW = 30000; // 30s: offer to continue if you come back this quickly
    var DIFFS = [
        { id: "easy", label: "Easy", sub: "Ages ~6–8", emoji: "&#128522;" },
        { id: "medium", label: "Medium", sub: "Ages ~9–12", emoji: "&#128513;" },
        { id: "hard", label: "Hard", sub: "Ages ~12–16", emoji: "&#128526;" }
    ];

    function openGame(def) {
        if (effLocked()) return;
        if (!allowed(def.id)) { toast("This game is turned off"); return; }
        route = "game"; routeArg = def;
        fitExtra = 0; fitAttempts = 0;   // each game gets its own fit budget
        clearOverlays(); removeHelpFab();
        document.getElementById("backBtn").hidden = false;
        view.innerHTML = "";
        var saved = def.resumable ? load("resume_" + def.id, null) : null;
        if (saved && saved.ts && (Date.now() - saved.ts) < RESUME_WINDOW && saved.state) {
            renderResumePrompt(def, saved);
        } else if (def.difficulties) {
            renderDifficulty(def, null);
        } else {
            launchGame(def, load("diff_" + def.id, "medium"), null);
        }
        window.scrollTo(0, 0);
    }

    function renderResumePrompt(def, saved) {
        current = { def: def, cleanup: null, difficulty: saved.difficulty || "medium" };
        var wrap = el("div", { class: "chooser fade-in" }, [
            el("div", { class: "chooser-ico", html: def.icon || "&#127918;" }),
            el("h2", { text: "Welcome back!" }),
            el("p", { class: "small-note", text: "You have a " + def.name + " game in progress." }),
            el("div", { class: "btn-row", style: "flex-direction:column;gap:10px;width:100%;max-width:300px" }, [
                el("button", { class: "btn primary", style: "width:100%", html: "&#9654;&#65039; Continue game", onclick: function () {
                    Sound.click(); launchGame(def, saved.difficulty || "medium", saved.state);
                } }),
                el("button", { class: "btn", style: "width:100%", text: "Start new game", onclick: function () {
                    Sound.click(); try { LS.removeItem("ba_resume_" + def.id); } catch (e) {} liveState = null;
                    view.innerHTML = ""; if (def.difficulties) renderDifficulty(def, null); else launchGame(def, load("diff_" + def.id, "medium"), null);
                } })
            ])
        ]);
        view.appendChild(wrap); animateView();
    }

    function renderDifficulty(def, _u) {
        current = { def: def, cleanup: null, difficulty: null };
        var last = load("diff_" + def.id, "medium");
        var wrap = el("div", { class: "chooser fade-in" });
        wrap.appendChild(el("div", { class: "chooser-ico", html: def.icon || "&#127918;" }));
        wrap.appendChild(el("h2", { text: def.name }));
        wrap.appendChild(el("p", { class: "small-note", text: "Choose a difficulty" }));
        var list = el("div", { class: "diff-list" });
        DIFFS.forEach(function (d) {
            var card = el("button", { class: "diff-card" + (d.id === last ? " sel" : "") }, [
                el("span", { class: "diff-emoji", html: d.emoji }),
                el("span", { class: "diff-main" }, [ el("span", { class: "diff-label", text: d.label }), el("span", { class: "diff-sub", text: d.sub }) ])
            ]);
            card.addEventListener("click", function () { Sound.click(); haptic(10); save("diff_" + def.id, d.id); launchGame(def, d.id, null); });
            list.appendChild(card);
        });
        wrap.appendChild(list);
        view.appendChild(wrap); animateView();
    }

    function launchGame(def, difficulty, resumeState) {
        view.innerHTML = "";
        liveState = null;
        var host = el("div", { class: "game-host fade-in" });
        view.appendChild(host);
        var api = makeApi(def, difficulty, resumeState);
        var cleanup = null;
        try { cleanup = def.mount(host, api); } catch (e) { toast("Game failed to load"); console.error(e); }
        current = { def: def, cleanup: typeof cleanup === "function" ? cleanup : null, difficulty: difficulty };
        showHelpFab(def);
        animateView(); window.scrollTo(0, 0);
        // On a TV nobody wants to scroll with a remote: if the game came out
        // taller than the screen, shrink the board once and re-mount.
        if (tvActive()) requestAnimationFrame(function () { fitGameToScreen(def, difficulty, resumeState); });
    }

    function fitGameToScreen(def, difficulty, resumeState) {
        var host = view.querySelector(".game-host");
        if (!host || route !== "game" || fitAttempts >= 2) return;
        var over = Math.round(host.getBoundingClientRect().bottom - window.innerHeight);
        if (over <= 8) return;
        fitAttempts++;
        fitExtra += over + 16;
        if (current && current.cleanup) { try { current.cleanup(); } catch (e) {} }
        launchGame(def, difficulty, resumeState);
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
        g1.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#128250;" }),
            el("div", { class: "s-text" }, [
                el("div", { class: "s-title", text: "TV mode" }),
                el("div", { class: "s-sub", text: "Big text and remote-friendly layout for a TV" })
            ])
        ]));
        var tvSeg = el("div", { class: "seg", style: "margin:0 16px 15px" });
        [["auto", "Auto"], ["on", "On"], ["off", "Off"]].forEach(function (m) {
            var b = el("button", { class: settings.tvMode === m[0] ? "active" : "", text: m[1] });
            b.addEventListener("click", function () {
                settings.tvMode = m[0]; save("settings", settings);
                applyTvClass();
                tvSeg.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
                b.classList.add("active"); Sound.click(); haptic(10);
            });
            tvSeg.appendChild(b);
        });
        g1.appendChild(tvSeg);
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
        g4.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: "&#127760;" }),
            el("div", { class: "s-text" }, [ el("div", { class: "s-title", text: "Web browser (PIN)" }), el("div", { class: "s-sub", text: "Open an in-app browser" }) ]),
            el("button", { class: "btn", text: "Open", onclick: function () { Sound.click(); openPin(function () {
                try { if (window.AndroidBridge && window.AndroidBridge.openBrowser) { window.AndroidBridge.openBrowser(); return; } } catch (e) {}
                // Not the installed app (e.g. played from the dashboard): open a normal browser tab.
                var w = null; try { w = window.open("https://www.google.com", "_blank"); } catch (e) {}
                if (!w) toast("Update to the latest app to use the built-in browser");
            }); } })
        ]));
        g4.appendChild(el("div", { class: "setting-row" }, [
            el("div", { class: "s-ico", html: kioskOn() ? "&#128274;" : "&#128275;" }),
            el("div", { class: "s-text" }, [
                el("div", { class: "s-title", text: "Kiosk mode (PIN)" }),
                el("div", { class: "s-sub", text: kioskSupported()
                    ? (kioskOn()
                        ? (tvActive() ? "ON — locked to Brain Arcade. Unlock here with the PIN."
                                      : "ON — locked to Brain Arcade. 7 taps top-left, or unlock here.")
                        : "Lock the device to Brain Arcade only")
                    : "Needs the installed app" })
            ]),
            el("button", { class: "btn", text: "Open", onclick: function () { Sound.click(); openPin(openKioskAdmin); } })
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
                        pendingClearScores = true; poll(); // also wipe the server backup
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
        // If leaving a resumable game mid-play, remember the state so we can offer Continue.
        if (current && current.def && current.def.resumable && liveState != null) {
            save("resume_" + current.def.id, { state: liveState, difficulty: current.difficulty || "medium", ts: Date.now() });
        }
        liveState = null;
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
        applyTvClass();
        document.documentElement.classList.toggle("kiosk", kioskOn());
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
        // Remote / D-pad navigation + the hidden kiosk escape gesture.
        document.addEventListener("keydown", onNavKey, false);
        installCornerGesture();
        ensureFocusable();
        startNavWatcher();
        if (tvActive()) setTimeout(focusFirst, 120);
        schedulePoll(1500);
    }

    window.BrainGames = {
        register: register, boot: boot, handleBack: handleBack, toast: toast, go: go,
        onUpdate: onUpdate, version: VERSION
    };
})();
