(() => {
    if (window.SkyClient) {
        window.SkyClient.open();
        return;
    }

    const BASE = window.SKY_CLIENT_BASE || "https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/";
    const STORE = "skyclient.v1";
    const OLD_STORE = "skyapi.gui.v1";
    const VERSION = "1.0.0";

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const rand = (a, b) => a + Math.random() * (b - a);
    const getGame = () => {
        try {
            return Object.values(document.querySelector("#react"))[0].updateQueue.baseState.element.props.game;
        } catch (e) {
            return null;
        }
    };
    const hexToRgb = (hex) => {
        const n = parseInt(String(hex).replace("#", ""), 16) || 0;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const stripCodes = (s) => String(s || "").replace(/\\[a-z_]+\\/g, "");
    const fmtTime = (sec) => {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
    };
    const KEY_NAMES = {
        ShiftRight: "Right Shift", ShiftLeft: "Left Shift", ControlRight: "Right Ctrl", ControlLeft: "Left Ctrl",
        AltRight: "Right Alt", AltLeft: "Left Alt", Backquote: "`", Insert: "Insert", Delete: "Delete",
        Home: "Home", End: "End", PageUp: "Page Up", PageDown: "Page Down"
    };
    const keyName = (code) => !code ? "None" : KEY_NAMES[code] || code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
    if (!saved.sky) {
        try {
            const old = JSON.parse(localStorage.getItem(OLD_STORE));
            if (old) saved.sky = { enabled: old.enabled, preset: old.preset, size: old.size, overrides: old.overrides || {} };
            if (old && old.key) saved.binds = { menu: old.key };
        } catch (e) {}
    }
    const store = {
        sky: Object.assign({ enabled: true, preset: "black", custom: null, size: 2048, overrides: {} }, saved.sky),
        mods: saved.mods || {},
        profiles: saved.profiles || {},
        serverProfiles: saved.serverProfiles || {},
        binds: Object.assign({ menu: "ShiftRight" }, saved.binds),
        hud: saved.hud || {},
        tab: saved.tab || "sky",
        music: saved.music || { urls: [], volume: 0.5, shuffle: false }
    };
    store.sky.overrides = Object.assign({}, store.sky.overrides);
    let saveTimer = 0;
    const save = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {}
        }, 150);
    };

    const db = (() => {
        let p = null;
        const open = () => p || (p = new Promise((res, rej) => {
            const r = indexedDB.open("skyclient", 1);
            r.onupgradeneeded = () => {
                const d = r.result;
                if (!d.objectStoreNames.contains("skies")) d.createObjectStore("skies", { keyPath: "id" });
                if (!d.objectStoreNames.contains("music")) d.createObjectStore("music", { keyPath: "id" });
                if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets", { keyPath: "id" });
            };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        }));
        const tx = async (name, mode, fn) => {
            const d = await open();
            return new Promise((res, rej) => {
                const t = d.transaction(name, mode);
                const s = t.objectStore(name);
                const out = fn(s);
                t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
                t.onerror = () => rej(t.error);
            });
        };
        return {
            put: (name, v) => tx(name, "readwrite", (s) => s.put(v)),
            del: (name, id) => tx(name, "readwrite", (s) => s.delete(id)),
            get: (name, id) => tx(name, "readonly", (s) => s.get(id)),
            all: (name) => tx(name, "readonly", (s) => s.getAll())
        };
    })();

    let G = null;
    let api = null;
    let T = null;
    const listeners = [];

    function discoverThree(gs) {
        const atm = gs.sky.atmosphere;
        const stars = gs.stars.stars;
        let Texture = null;
        gs.scene.traverse((o) => { if (!Texture && o.material && o.material.map) Texture = o.material.map.constructor; });
        return {
            Mesh: atm.constructor,
            ShaderMaterial: atm.material.constructor,
            SphereGeometry: atm.geometry.constructor,
            Points: stars.constructor,
            PointsMaterial: stars.material.constructor,
            BufferGeometry: Object.getPrototypeOf(stars.geometry.constructor.prototype) === Object.prototype
                ? stars.geometry.constructor : stars.geometry.constructor,
            BufferAttribute: stars.geometry.attributes.position.constructor,
            Texture,
            Color: gs.sky.uniforms.horizonColor.value.constructor,
            Vector3: gs.sky.uniforms.sunDirection.value.constructor,
            Matrix4: gs.camera.matrix.constructor,
            PerspectiveCamera: gs.camera.constructor
        };
    }

    const hooks = new Map();
    function after(obj, name, fn) {
        if (!obj) return () => {};
        let entry = hooks.get(obj);
        if (!entry) { entry = {}; hooks.set(obj, entry); }
        if (!entry[name]) {
            const list = [];
            const proto = Object.getPrototypeOf(obj)[name];
            const own = Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : null;
            const base = own || proto;
            obj[name] = function () {
                const r = base.apply(this, arguments);
                for (const f of list) { try { f.apply(this, [r].concat([].slice.call(arguments))); } catch (e) {} }
                return r;
            };
            entry[name] = list;
        }
        entry[name].push(fn);
        return () => { const l = entry[name]; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    }

    let audioCtx = null;
    const audio = () => audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    function beep(freq = 880, ms = 120, vol = 0.15) {
        try {
            const a = audio();
            const o = a.createOscillator(), gn = a.createGain();
            o.type = "sine"; o.frequency.value = freq;
            gn.gain.setValueAtTime(vol, a.currentTime);
            gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
            o.connect(gn).connect(a.destination);
            o.start(); o.stop(a.currentTime + ms / 1000 + 0.02);
        } catch (e) {}
    }
    function thunder(delaySec = 0.5, vol = 0.5) {
        try {
            const a = audio();
            const len = a.sampleRate * 3.2;
            const buf = a.createBuffer(1, len, a.sampleRate);
            const d = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < len; i++) {
                last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
                const t = i / a.sampleRate;
                const env = Math.min(1, t * 8) * Math.exp(-t * 1.1) * (0.6 + 0.4 * Math.sin(t * 9) * Math.sin(t * 3.1));
                d[i] = last * env * 9;
            }
            const src = a.createBufferSource();
            src.buffer = buf;
            const lp = a.createBiquadFilter();
            lp.type = "lowpass"; lp.frequency.value = 420;
            const gn = a.createGain();
            gn.gain.value = vol;
            src.connect(lp).connect(gn).connect(a.destination);
            src.start(a.currentTime + delaySec);
        } catch (e) {}
    }

    function makeGlyphTexture(kind) {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const x = c.getContext("2d");
        if (kind === "heart" || kind === "star" || kind === "petal") {
            x.fillStyle = "#fff";
            x.font = "52px serif";
            x.textAlign = "center";
            x.textBaseline = "middle";
            x.shadowColor = "#fff";
            x.shadowBlur = 8;
            x.fillText(kind === "heart" ? "♥" : kind === "star" ? "★" : "❀", 32, 36);
        } else {
            const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, "rgba(255,255,255,1)");
            g.addColorStop(kind === "spark" ? 0.15 : 0.35, "rgba(255,255,255,0.85)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            x.fillStyle = g;
            x.fillRect(0, 0, 64, 64);
        }
        const t = new T.Texture(c);
        t.needsUpdate = true;
        return t;
    }

    class Particles {
        constructor(max, glyph, size, additive = true) {
            this.max = max;
            this.list = [];
            const geo = new T.BufferGeometry();
            this.pos = new Float32Array(max * 3);
            this.col = new Float32Array(max * 3);
            geo.setAttribute("position", new T.BufferAttribute(this.pos, 3));
            geo.setAttribute("color", new T.BufferAttribute(this.col, 3));
            const mat = new T.PointsMaterial({
                size, map: makeGlyphTexture(glyph), vertexColors: true, transparent: true,
                depthWrite: false, sizeAttenuation: true, fog: false, blending: additive ? 2 : 1
            });
            this.points = new T.Points(geo, mat);
            this.points.frustumCulled = false;
            this.points.renderOrder = 5;
            this.geo = geo;
            G.gameScene.ambientMeshes.add(this.points);
        }
        spawn(p) {
            if (this.list.length >= this.max) this.list.shift();
            p.max = p.life;
            this.list.push(p);
        }
        update(dt) {
            const L = this.list;
            let n = 0;
            for (let i = L.length - 1; i >= 0; i--) {
                const p = L[i];
                p.life -= dt;
                if (p.life <= 0) { L.splice(i, 1); continue; }
                p.vy -= (p.gravity || 0) * dt;
                const drag = Math.pow(p.drag || 1, dt * 60);
                p.vx *= drag; p.vy *= drag; p.vz *= drag;
                if (p.wobble) { p.vx += Math.sin(p.life * 3 + p.seed) * p.wobble * dt; p.vz += Math.cos(p.life * 2.3 + p.seed) * p.wobble * dt; }
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            }
            for (const p of L) {
                const f = p.fadeIn ? Math.min(1, (p.max - p.life) / p.fadeIn) : 1;
                const a = Math.min(1, p.life / (p.fadeOut || p.max)) * f * (p.flicker ? 0.55 + 0.45 * Math.sin(performance.now() / 160 + p.seed) : 1);
                this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
                this.col[n * 3] = p.r * a; this.col[n * 3 + 1] = p.g * a; this.col[n * 3 + 2] = p.b * a;
                n++;
            }
            this.geo.setDrawRange(0, n);
            this.geo.attributes.position.needsUpdate = true;
            this.geo.attributes.color.needsUpdate = true;
        }
        clear() { this.list.length = 0; this.update(0); }
    }

    let fx = null;
    function particles() {
        if (fx || !T) return fx;
        fx = {
            spark: new Particles(1500, "spark", 0.22),
            soft: new Particles(1500, "soft", 0.35),
            heart: new Particles(400, "heart", 0.45),
            star: new Particles(400, "star", 0.4),
            petal: new Particles(600, "petal", 0.3),
            sky: new Particles(1200, "soft", 7)
        };
        return fx;
    }

    const playerPos = () => {
        const p = G && G.player && G.player.pos;
        return p ? { x: p.x, y: p.y, z: p.z } : null;
    };
    const camPos = () => {
        const v = new T.Vector3();
        G.gameScene.camera.getWorldPosition(v);
        return v;
    };
    const dayFactor = () => {
        const s = G.gameScene.sun;
        return clamp(s.offset.y / s.sunDist * 2 + 0.5, 0, 1);
    };
    const inWorld = () => !!(G && G._state === 6 && G.player);

    function chatPrint(text) {
        try { G.chat.addChat({ text: "\\aqua\\Client \\gray\\»\\reset\\ " + text }); } catch (e) {}
    }
    function sendChat(text) {
        const C = G.chat;
        const prev = C.inputValue;
        const prevCh = C.channel;
        try {
            if (C.setChannel && C.channel !== "game") C.setChannel("game");
            if (C.setInputValue) C.setInputValue(text); else C.inputValue = text;
            C.isInputCommandMode = false;
            C.isInputWorldEditMode = false;
            ORIG.submit ? ORIG.submit.call(C, G) : C.submit(G);
        } finally {
            if (C.setInputValue) C.setInputValue(prev || ""); else C.inputValue = prev || "";
            if (C.setChannel && prevCh && C.channel !== prevCh) { try { C.setChannel(prevCh); } catch (e) {} }
        }
    }
    const ORIG = {};

    const lastPositions = new Map();
    function trackEntities() {
        const list = G.world && G.world.loadedEntityList;
        if (!list) return;
        const now = performance.now();
        for (const e of list) {
            if (e && e.name && e.pos) lastPositions.set(e.name, { x: e.pos.x, y: e.pos.y, z: e.pos.z, t: now });
        }
    }

    function burst(kind, x, y, z, opts = {}) {
        const P = particles();
        if (!P) return;
        const n = opts.count || 24;
        const color = opts.color || [1, 1, 1];
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, b = Math.acos(rand(-1, 1));
            const sp = rand(opts.speedMin || 1.5, opts.speed || 4);
            const c = opts.rainbow ? hexToRgb("#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")) : color;
            P[kind].spawn({
                x: x + rand(-0.15, 0.15), y: y + rand(-0.15, 0.15), z: z + rand(-0.15, 0.15),
                vx: Math.sin(b) * Math.cos(a) * sp, vy: Math.cos(b) * sp + (opts.up || 0), vz: Math.sin(b) * Math.sin(a) * sp,
                life: rand(opts.lifeMin || 0.5, opts.life || 1.1), gravity: opts.gravity ?? 6, drag: opts.drag ?? 0.94,
                r: c[0], g: c[1], b: c[2], seed: Math.random() * 10
            });
        }
    }

    const strikeLightning = (x, y, z, sound = true, vol = 0.5) => {
        if (!G) return;
        const pp = playerPos();
        if (x == null && pp) {
            const a = Math.random() * Math.PI * 2, d = rand(25, 90);
            x = pp.x + Math.cos(a) * d; z = pp.z + Math.sin(a) * d; y = pp.y - 4;
        }
        try { G.gameScene.weather.addBolt(Math.floor(x), Math.floor(y), Math.floor(z)); } catch (e) {}
        try { api && api.flash(280); } catch (e) {}
        if (sound && pp) {
            const dist = Math.hypot(x - pp.x, z - pp.z);
            thunder(Math.min(3, dist / 343), vol * clamp(1.4 - dist / 140, 0.25, 1));
        }
    };

    const MODULES = [];
    const mod = (m) => { MODULES.push(m); return m; };
    const S = (m) => store.mods[m.id].settings;

    const weatherState = { world: null, origRain: null, origThunder: null, computeWrapped: null };
    mod({
        id: "weather", tab: "world", name: "Weather", desc: "Client-side rain, storms and snow using the game's own weather",
        defaults: { mode: "rain", intensity: 1 },
        settings: [
            { key: "mode", type: "seg", label: "Weather", options: [["server", "Server"], ["clear", "Clear"], ["rain", "Rain"], ["storm", "Storm"], ["snow", "Snow"]] },
            { key: "intensity", type: "slider", label: "Intensity", min: 0.1, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" }
        ],
        install() {
            const w = G.world;
            if (!w || weatherState.world === w) return;
            this.uninstall();
            weatherState.world = w;
            const proto = Object.getPrototypeOf(w);
            const s = () => S(this);
            w.getRainStrength = function (p) {
                const m = s().mode;
                if (m === "server") return proto.getRainStrength.call(this, p);
                if (m === "clear") return 0;
                return s().intensity;
            };
            w.getThunderStrength = function (p) {
                const m = s().mode;
                if (m === "server") return proto.getThunderStrength.call(this, p);
                return m === "storm" ? s().intensity : 0;
            };
            const W = G.gameScene.weather;
            if (!weatherState.computeWrapped) {
                const base = Object.getPrototypeOf(W).computeColumn;
                W.computeColumn = function () {
                    const r = base.apply(this, arguments);
                    const mm = s();
                    if (r && store.mods.weather.enabled) {
                        if (mm.mode === "snow" && r.kind === 1) r.kind = 2;
                        else if ((mm.mode === "rain" || mm.mode === "storm") && r.kind === 2 && mm.forceRain) r.kind = 1;
                    }
                    return r;
                };
                weatherState.computeWrapped = W;
            }
            try { W.columnCache.clear(); } catch (e) {}
        },
        uninstall() {
            const w = weatherState.world;
            if (w) { delete w.getRainStrength; delete w.getThunderStrength; }
            weatherState.world = null;
            if (weatherState.computeWrapped) { delete weatherState.computeWrapped.computeColumn; weatherState.computeWrapped = null; }
            try { G.gameScene.weather.columnCache.clear(); } catch (e) {}
        },
        enable() { this.install(); },
        disable() { this.uninstall(); },
        change() { try { G.gameScene.weather.columnCache.clear(); } catch (e) {} },
        frame() { if (G.world !== weatherState.world) this.install(); }
    });

    let nextStrike = 0;
    mod({
        id: "lightning", tab: "world", name: "Lightning", desc: "Random lightning strikes with thunder",
        defaults: { perMinute: 6, stormOnly: true, sound: true, volume: 0.6, bind: "" },
        settings: [
            { key: "perMinute", type: "slider", label: "Strikes per minute", min: 1, max: 40, step: 1, fmt: (v) => v },
            { key: "stormOnly", type: "toggle", label: "Only during storms" },
            { key: "sound", type: "toggle", label: "Thunder sound" },
            { key: "volume", type: "slider", label: "Thunder volume", min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "bind", type: "key", label: "Strike key", action: "strike" }
        ],
        frame(dt) {
            const s = S(this);
            const now = performance.now();
            if (s.stormOnly) {
                let th = 0;
                try { th = G.world.getThunderStrength(1); } catch (e) {}
                if (th <= 0.05) { nextStrike = 0; return; }
            }
            if (!nextStrike) nextStrike = now + rand(0.3, 1.7) * 60000 / s.perMinute;
            if (now >= nextStrike) {
                strikeLightning(null, null, null, s.sound, s.volume);
                nextStrike = now + rand(0.3, 1.7) * 60000 / s.perMinute;
            }
        }
    });

    const timeState = { world: null, real: 0, clock: 0 };
    const hourToTick = (h) => (((h - 6) % 24 + 24) % 24) * 1000;
    const tickToHour = (t) => ((t / 1000 + 6) % 24 + 24) % 24;
    mod({
        id: "time", tab: "world", name: "Time of Day", desc: "Lock the time or run your own day cycle (only you see it)",
        defaults: { mode: "lock", hour: 21, speed: 4 },
        settings: [
            { key: "mode", type: "seg", label: "Mode", options: [["lock", "Locked"], ["cycle", "Custom cycle"]] },
            { key: "hour", type: "slider", label: "Time", min: 0, max: 23.99, step: 0.05, fmt: (v) => String(Math.floor(v)).padStart(2, "0") + ":" + String(Math.floor((v % 1) * 60)).padStart(2, "0"), show: (s) => s.mode === "lock" },
            { key: "_quick", type: "buttons", label: "", buttons: [["Sunrise", 6], ["Noon", 12], ["Sunset", 18], ["Midnight", 0]], onClick: (m, v) => { S(m).hour = v; S(m).mode = "lock"; }, show: (s) => s.mode === "lock" },
            { key: "speed", type: "slider", label: "Cycle speed", min: 0.1, max: 30, step: 0.1, fmt: (v) => v.toFixed(1) + "×", show: (s) => s.mode === "cycle" }
        ],
        install() {
            const w = G.world;
            if (!w || timeState.world === w) return;
            this.uninstall();
            timeState.world = w;
            timeState.real = w.worldTime || 0;
            timeState.clock = timeState.real;
            let shown = 0;
            const self = this;
            Object.defineProperty(w, "worldTime", {
                configurable: true,
                get() {
                    const s = S(self);
                    shown = s.mode === "cycle" ? Math.floor(timeState.clock) : hourToTick(s.hour);
                    return shown;
                },
                set(v) {
                    if (v === shown + 1) timeState.real += 1;
                    else timeState.real = v;
                }
            });
        },
        uninstall() {
            const w = timeState.world;
            if (w) {
                delete w.worldTime;
                w.worldTime = timeState.real;
            }
            timeState.world = null;
        },
        enable() { this.install(); },
        disable() { this.uninstall(); },
        frame(dt) {
            if (G.world !== timeState.world) this.install();
            const s = S(this);
            if (s.mode === "cycle") timeState.clock += dt * 20 * s.speed;
            else timeState.clock = hourToTick(s.hour);
        },
        currentHour() { return tickToHour(timeState.real); }
    });

    let skyPhase = null;
    mod({
        id: "daynightsky", tab: "sky", name: "Day & Night Skies", desc: "Switch to a different sky when night falls",
        defaults: { day: "overflow-day", night: "black" },
        settings: [
            { key: "day", type: "skyselect", label: "Day sky" },
            { key: "night", type: "skyselect", label: "Night sky" }
        ],
        enable() { skyPhase = null; if (store.mods.playlist.enabled) setModEnabled("playlist", false); },
        frame() {
            if (!api || !store.sky.enabled || skyLoading) return;
            const phase = dayFactor() > 0.5 ? "day" : "night";
            if (phase === skyPhase) return;
            skyPhase = phase;
            const id = S(this)[phase];
            if (id && id !== currentSkyKey()) applySkyKey(id, true);
        }
    });

    let playlistNext = 0;
    mod({
        id: "playlist", tab: "sky", name: "Sky Playlist", desc: "Rotate through skies automatically",
        defaults: { minutes: 5, shuffle: true, include: "all" },
        settings: [
            { key: "minutes", type: "slider", label: "Change every", min: 0.5, max: 60, step: 0.5, fmt: (v) => v + " min" },
            { key: "shuffle", type: "toggle", label: "Shuffle" },
            { key: "include", type: "seg", label: "Use", options: [["all", "All skies"], ["presets", "Presets"], ["mine", "My skies"]] }
        ],
        enable() { playlistNext = performance.now() + S(this).minutes * 60000; if (store.mods.daynightsky.enabled) setModEnabled("daynightsky", false); },
        frame() {
            if (!api || !store.sky.enabled || skyLoading) return;
            const now = performance.now();
            if (now < playlistNext) return;
            const s = S(this);
            playlistNext = now + s.minutes * 60000;
            const keys = [];
            if (s.include !== "mine") presets.forEach((p) => keys.push(p.id));
            if (s.include !== "presets") mySkies.forEach((m) => keys.push("my:" + m.id));
            if (!keys.length) return;
            const cur = currentSkyKey();
            let next;
            if (s.shuffle) { do { next = keys[Math.floor(Math.random() * keys.length)]; } while (keys.length > 1 && next === cur); }
            else next = keys[(keys.indexOf(cur) + 1) % keys.length];
            applySkyKey(next, true);
        }
    });

    const sunState = { orig: null, tex: { sun: null, moon: null } };
    mod({
        id: "sunmoon", tab: "world", name: "Sun & Moon", desc: "Resize and recolor the sun and moon, or use your own images",
        defaults: { sunSize: 1, moonSize: 1, sunColor: "#ffffff", moonColor: "#ffffff" },
        settings: [
            { key: "sunSize", type: "slider", label: "Sun size", min: 0.2, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) + "×" },
            { key: "sunColor", type: "color", label: "Sun color" },
            { key: "moonSize", type: "slider", label: "Moon size", min: 0.2, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) + "×" },
            { key: "moonColor", type: "color", label: "Moon color" },
            { key: "_tex", type: "buttons", label: "Custom image", buttons: [["Sun image", "sun"], ["Moon image", "moon"], ["Reset images", "reset"]], onClick: (m, v) => m.pickTexture(v) }
        ],
        async pickTexture(which) {
            if (which === "reset") {
                await db.del("assets", "sun").catch(() => {});
                await db.del("assets", "moon").catch(() => {});
                this.restoreMaps();
                sunState.tex = { sun: null, moon: null };
                return;
            }
            const f = await pickFiles(false);
            if (!f || !f[0]) return;
            await db.put("assets", { id: which, blob: f[0] });
            await this.loadTex(which, f[0]);
        },
        async loadTex(which, blob) {
            const img = await blobImage(blob);
            const t = new T.Texture(img);
            t.needsUpdate = true;
            sunState.tex[which] = t;
        },
        restoreMaps() {
            if (!sunState.orig) return;
            const s = G.gameScene.sun;
            s.sun.material.map = sunState.orig.sunMap; s.sun.material.needsUpdate = true;
            s.moon.material.map = sunState.orig.moonMap; s.moon.material.needsUpdate = true;
        },
        async enable() {
            const s = G.gameScene.sun;
            if (!sunState.orig) sunState.orig = { sun: s.sun.scale.x, moon: s.moon.scale.x, sunMap: s.sun.material.map, moonMap: s.moon.material.map, sunColor: s.sun.material.color.getHex(), moonColor: s.moon.material.color.getHex() };
            for (const w of ["sun", "moon"]) {
                try { const a = await db.get("assets", w); if (a && a.blob) await this.loadTex(w, a.blob); } catch (e) {}
            }
        },
        disable() {
            if (!sunState.orig) return;
            const s = G.gameScene.sun;
            s.sun.scale.set(sunState.orig.sun, sunState.orig.sun, 1);
            s.moon.scale.set(sunState.orig.moon, sunState.orig.moon, 1);
            s.sun.material.color.setHex(sunState.orig.sunColor);
            s.moon.material.color.setHex(sunState.orig.moonColor);
            this.restoreMaps();
        },
        frame() {
            if (!sunState.orig) return;
            const st = S(this), s = G.gameScene.sun;
            s.sun.scale.set(sunState.orig.sun * st.sunSize, sunState.orig.sun * st.sunSize, 1);
            s.moon.scale.set(sunState.orig.moon * st.moonSize, sunState.orig.moon * st.moonSize, 1);
            s.sun.material.color.setRGB(...hexToRgb(st.sunColor));
            s.moon.material.color.setRGB(...hexToRgb(st.moonColor));
            for (const w of ["sun", "moon"]) {
                const t = sunState.tex[w];
                if (t && s[w].material.map !== t) { s[w].material.map = t; s[w].material.needsUpdate = true; }
            }
        }
    });

    const cloudState = { orig: null, unhook: null };
    mod({
        id: "clouds", tab: "world", name: "Cloud Styler", desc: "Recolor the game's clouds and change coverage, height and speed",
        defaults: { dayColor: "#ffffff", nightColor: "#2a3350", sunsetColor: "#ff9a6b", opacity: 1, coverage: 1, height: 0, speed: 1 },
        settings: [
            { key: "dayColor", type: "color", label: "Day color" },
            { key: "sunsetColor", type: "color", label: "Sunset color" },
            { key: "nightColor", type: "color", label: "Night color" },
            { key: "opacity", type: "slider", label: "Opacity", min: 0.1, max: 1.5, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "coverage", type: "slider", label: "Coverage", min: 0.3, max: 2, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "height", type: "slider", label: "Height offset", min: -60, max: 120, step: 1, fmt: (v) => (v > 0 ? "+" : "") + v },
            { key: "speed", type: "slider", label: "Wind speed", min: 0, max: 6, step: 0.1, fmt: (v) => v.toFixed(1) + "×" }
        ],
        enable() {
            const c = G.gameScene.clouds;
            if (!cloudState.orig) {
                const u = c.material.uniforms;
                cloudState.orig = { day: c._dayColor.clone(), night: c._nightColor.clone(), sunset: c._sunsetColor.clone(), opacity: u.uOpacity.value, coverage: u.uCoverage.value, wind: u.uWind && u.uWind.value && u.uWind.value.clone ? u.uWind.value.clone() : u.uWind && u.uWind.value };
            }
            const self = this;
            let last = performance.now();
            cloudState.unhook = after(c, "update", function () {
                const s = S(self), u = c.material.uniforms, o = cloudState.orig;
                u.uOpacity.value = o.opacity * s.opacity;
                u.uCoverage.value = o.coverage * s.coverage;
                if (s.height) { c.mesh.position.y += s.height; u.uCloudY.value += s.height; }
                const now = performance.now(), dt = (now - last) / 1000; last = now;
                u.uTime.value += 0.016 * (s.speed - 1) * Math.min(4, dt * 60);
            });
        },
        disable() {
            const c = G.gameScene.clouds, o = cloudState.orig;
            if (cloudState.unhook) cloudState.unhook();
            cloudState.unhook = null;
            if (!o) return;
            c._dayColor.copy(o.day); c._nightColor.copy(o.night); c._sunsetColor.copy(o.sunset);
            c.material.uniforms.uOpacity.value = o.opacity;
            c.material.uniforms.uCoverage.value = o.coverage;
        },
        frame() {
            const c = G.gameScene.clouds, s = S(this);
            c._dayColor.setRGB(...hexToRgb(s.dayColor));
            c._nightColor.setRGB(...hexToRgb(s.nightColor));
            c._sunsetColor.setRGB(...hexToRgb(s.sunsetColor));
        }
    });

    const fogState = { unhook: null };
    mod({
        id: "fog", tab: "world", name: "Fog Designer", desc: "Custom fog color and distance",
        defaults: { custom: true, color: "#9fb4d8", start: 0.6, end: 1 },
        settings: [
            { key: "custom", type: "toggle", label: "Custom color" },
            { key: "color", type: "color", label: "Fog color", show: (s) => s.custom },
            { key: "start", type: "slider", label: "Starts at", min: 0, max: 1, step: 0.02, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "end", type: "slider", label: "Fully foggy at", min: 0.2, max: 2, step: 0.02, fmt: (v) => Math.round(v * 100) + "%" }
        ],
        enable() {
            const self = this;
            fogState.unhook = after(G.gameScene.fog, "update", function () {
                const s = S(self), f = G.gameScene.scene.fog;
                if (!f) return;
                const far = f.far;
                f.near = far * s.start;
                f.far = Math.max(f.near + 1, far * s.end);
                if (s.custom) {
                    const c = hexToRgb(s.color);
                    f.color.setRGB(c[0], c[1], c[2]);
                    const sc = G.gameScene.sky.color;
                    if (sc && sc.setRGB) sc.setRGB(c[0], c[1], c[2]);
                }
            });
        },
        disable() { if (fogState.unhook) fogState.unhook(); fogState.unhook = null; }
    });

    const rainState = { unhook: null, speed: null };
    mod({
        id: "rainstyle", tab: "world", name: "Rain Style", desc: "Recolor rain and change how heavy and fast it falls",
        defaults: { color: "#9ec8ff", opacity: 1, speed: 1 },
        settings: [
            { key: "color", type: "color", label: "Rain color" },
            { key: "opacity", type: "slider", label: "Heaviness", min: 0.2, max: 2, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "speed", type: "slider", label: "Fall speed", min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + "×" },
            { key: "_p", type: "buttons", label: "Presets", buttons: [["Normal", "#9ec8ff"], ["Neon", "#00ffd5"], ["Blood", "#ff2a2a"], ["Pink", "#ff7ad9"], ["Gold", "#ffd36b"]], onClick: (m, v) => { S(m).color = v; } }
        ],
        enable() {
            const W = G.gameScene.weather, self = this;
            if (rainState.speed == null) rainState.speed = W.rain.uniforms.uFallSpeed.value;
            rainState.unhook = after(W, "update", function () {
                const s = S(self), u = W.rain.uniforms, c = hexToRgb(s.color);
                const base = u.uTint.value.r;
                u.uTint.value.setRGB(base * c[0] * 1.3, base * c[1] * 1.3, base * c[2] * 1.3);
                u.uOpacity.value = Math.min(1, u.uOpacity.value * s.opacity);
                u.uFallSpeed.value = rainState.speed * s.speed;
            });
        },
        disable() {
            if (rainState.unhook) rainState.unhook();
            rainState.unhook = null;
            if (rainState.speed != null) G.gameScene.weather.rain.uniforms.uFallSpeed.value = rainState.speed;
        }
    });

    let meteorNext = 0;
    const meteors = [];
    mod({
        id: "meteors", tab: "world", name: "Shooting Stars", desc: "Shooting stars and meteor showers at night",
        defaults: { perMinute: 8, nightOnly: true, color: "#ffffff", shower: false },
        settings: [
            { key: "perMinute", type: "slider", label: "Per minute", min: 1, max: 60, step: 1, fmt: (v) => v },
            { key: "shower", type: "toggle", label: "Meteor shower (bursts)" },
            { key: "nightOnly", type: "toggle", label: "Only at night" },
            { key: "color", type: "color", label: "Color" }
        ],
        frame(dt) {
            const s = S(this), P = particles(), now = performance.now();
            if (!P) return;
            const night = 1 - dayFactor();
            if (!s.nightOnly || night > 0.4) {
                if (!meteorNext) meteorNext = now + rand(0.4, 1.6) * 60000 / s.perMinute;
                if (now >= meteorNext) {
                    const n = s.shower ? Math.floor(rand(3, 7)) : 1;
                    for (let i = 0; i < n; i++) {
                        const az = Math.random() * Math.PI * 2, el = rand(0.35, 1.1);
                        const dir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
                        const ta = az + Math.PI / 2;
                        const vel = [Math.cos(ta) * rand(0.6, 1), -rand(0.25, 0.6), Math.sin(ta) * rand(0.6, 1)];
                        meteors.push({ dir, vel, life: rand(0.7, 1.4), delay: i * rand(0.05, 0.4) });
                    }
                    meteorNext = now + rand(0.4, 1.6) * 60000 / s.perMinute;
                }
            }
            const cp = camPos(), R = 420, c = hexToRgb(s.color);
            for (let i = meteors.length - 1; i >= 0; i--) {
                const m = meteors[i];
                if (m.delay > 0) { m.delay -= dt; continue; }
                m.life -= dt;
                if (m.life <= 0) { meteors.splice(i, 1); continue; }
                for (let k = 0; k < 3; k++) {
                    m.dir[0] += m.vel[0] * dt * 0.33 * 0.9; m.dir[1] += m.vel[1] * dt * 0.33 * 0.9; m.dir[2] += m.vel[2] * dt * 0.33 * 0.9;
                    const l = Math.hypot(...m.dir);
                    P.sky.spawn({ x: cp.x + m.dir[0] / l * R, y: cp.y + m.dir[1] / l * R, z: cp.z + m.dir[2] / l * R, vx: 0, vy: 0, vz: 0, life: 0.45, gravity: 0, drag: 1, r: c[0], g: c[1], b: c[2] });
                }
            }
        },
        disable() { meteors.length = 0; }
    });

    let auroraMesh = null;
    mod({
        id: "aurora", tab: "world", name: "Aurora", desc: "Animated northern lights in the night sky",
        defaults: { intensity: 1, color1: "#2bffa8", color2: "#8a5cff", speed: 1, nightOnly: true },
        settings: [
            { key: "intensity", type: "slider", label: "Intensity", min: 0.1, max: 2.5, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "color1", type: "color", label: "Low color" },
            { key: "color2", type: "color", label: "High color" },
            { key: "speed", type: "slider", label: "Speed", min: 0, max: 4, step: 0.1, fmt: (v) => v.toFixed(1) + "×" },
            { key: "nightOnly", type: "toggle", label: "Only at night" }
        ],
        enable() {
            if (auroraMesh) { auroraMesh.visible = true; return; }
            const mat = new T.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uC1: { value: new T.Color(0.2, 1, 0.6) }, uC2: { value: new T.Color(0.5, 0.3, 1) }, uI: { value: 1 } },
                vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
                fragmentShader: [
                    "uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; uniform float uI; varying vec3 vDir;",
                    "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }",
                    "float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }",
                    "float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }",
                    "void main(){ vec3 d = normalize(vDir); float el = d.y; if (el < 0.05) discard;",
                    " float az = atan(d.z, d.x);",
                    " float band = smoothstep(0.08, 0.28, el) * (1.0 - smoothstep(0.5, 0.85, el));",
                    " float w = fbm(vec2(az * 2.0 + uTime * 0.03, uTime * 0.05));",
                    " float curtain = pow(abs(sin((az * 6.0 + w * 6.0 + uTime * 0.06) )), 6.0);",
                    " float rays = fbm(vec2(az * 40.0 + w * 8.0, el * 3.0 - uTime * 0.25));",
                    " float a = band * (0.35 + 0.65 * curtain) * (0.4 + 0.8 * rays) * uI;",
                    " vec3 col = mix(uC1, uC2, smoothstep(0.2, 0.6, el));",
                    " gl_FragColor = vec4(col * a, 1.0); }"
                ].join("\n"),
                side: 1, depthWrite: false, depthTest: false, transparent: false, blending: 2, fog: false
            });
            auroraMesh = new T.Mesh(new T.SphereGeometry(4700, 48, 24), mat);
            auroraMesh.renderOrder = -0.45;
            auroraMesh.frustumCulled = false;
            G.gameScene.ambientMeshes.add(auroraMesh);
        },
        disable() { if (auroraMesh) auroraMesh.visible = false; },
        frame(dt) {
            if (!auroraMesh) return;
            const s = S(this), u = auroraMesh.material.uniforms;
            u.uTime.value += dt * s.speed * 10;
            u.uC1.value.setRGB(...hexToRgb(s.color1));
            u.uC2.value.setRGB(...hexToRgb(s.color2));
            u.uI.value = s.intensity * (s.nightOnly ? clamp((1 - dayFactor()) * 1.6 - 0.3, 0, 1) : 1);
            auroraMesh.visible = u.uI.value > 0.001;
            auroraMesh.position.copy(camPos());
        }
    });

    mod({
        id: "ambient", tab: "world", name: "Ambient Particles", desc: "Fireflies, floating dust, cherry blossom petals or snow flurries around you",
        defaults: { type: "fireflies", density: 1, nightOnly: true },
        settings: [
            { key: "type", type: "seg", label: "Type", options: [["fireflies", "Fireflies"], ["dust", "Dust"], ["petals", "Petals"], ["snow", "Snow"]] },
            { key: "density", type: "slider", label: "Amount", min: 0.2, max: 3, step: 0.1, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "nightOnly", type: "toggle", label: "Fireflies only at night", show: (s) => s.type === "fireflies" }
        ],
        acc: 0,
        frame(dt) {
            const s = S(this), P = particles(), pp = playerPos();
            if (!P || !pp) return;
            if (s.type === "fireflies" && s.nightOnly && dayFactor() > 0.6) return;
            const rate = { fireflies: 6, dust: 14, petals: 7, snow: 30 }[s.type] * s.density;
            this.acc += dt * rate;
            while (this.acc >= 1) {
                this.acc -= 1;
                const a = Math.random() * Math.PI * 2, d = rand(1.5, 16);
                const x = pp.x + Math.cos(a) * d, z = pp.z + Math.sin(a) * d;
                if (s.type === "fireflies") {
                    const c = Math.random() < 0.5 ? [0.85, 1, 0.35] : [1, 0.85, 0.3];
                    P.soft.spawn({ x, y: pp.y + rand(0, 3.5), z, vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.2), vz: rand(-0.3, 0.3), life: rand(4, 8), fadeIn: 1, fadeOut: 1.5, wobble: 0.6, flicker: true, seed: Math.random() * 9, gravity: 0, drag: 1, r: c[0], g: c[1], b: c[2] });
                } else if (s.type === "dust") {
                    P.spark.spawn({ x, y: pp.y + rand(-1, 4), z, vx: rand(-0.15, 0.15), vy: rand(-0.05, 0.08), vz: rand(-0.15, 0.15), life: rand(4, 9), fadeIn: 1.5, fadeOut: 2, wobble: 0.15, seed: Math.random() * 9, gravity: 0, drag: 1, r: 0.55, g: 0.52, b: 0.45 });
                } else if (s.type === "petals") {
                    P.petal.spawn({ x, y: pp.y + rand(4, 9), z, vx: rand(0.2, 0.8), vy: rand(-0.6, -0.9), vz: rand(-0.3, 0.3), life: rand(6, 10), fadeIn: 0.8, fadeOut: 1.5, wobble: 1.2, seed: Math.random() * 9, gravity: 0, drag: 1, r: 1, g: rand(0.55, 0.75), b: rand(0.75, 0.9) });
                } else {
                    P.soft.spawn({ x, y: pp.y + rand(5, 10), z, vx: rand(-0.2, 0.2), vy: rand(-1.2, -2), vz: rand(-0.2, 0.2), life: rand(4, 7), fadeIn: 0.5, fadeOut: 1, wobble: 0.5, seed: Math.random() * 9, gravity: 0, drag: 1, r: 0.9, g: 0.93, b: 1 });
                }
            }
        }
    });

    const FILTERS = {
        vibrant: { saturate: 1.45, contrast: 1.08, brightness: 1.03 },
        cinematic: { contrast: 1.18, saturate: 0.82, sepia: 0.18, brightness: 0.96 },
        noir: { grayscale: 1, contrast: 1.3, brightness: 0.95 },
        warm: { sepia: 0.3, saturate: 1.2, "hue-rotate": -8 },
        cold: { saturate: 0.92, "hue-rotate": 14, brightness: 1.03, contrast: 1.04 },
        vaporwave: { "hue-rotate": -28, saturate: 1.6, contrast: 1.06 },
        dreamy: { brightness: 1.08, contrast: 0.9, saturate: 1.25, blur: 0.3 }
    };
    let gameCanvas = null;
    const findCanvas = () => {
        if (gameCanvas && document.contains(gameCanvas)) return gameCanvas;
        let best = null;
        for (const c of document.querySelectorAll("canvas")) if (c.id !== "canvas-hud" && (!best || c.width * c.height > best.width * best.height)) best = c;
        return (gameCanvas = best);
    };
    mod({
        id: "filter", tab: "visuals", name: "Color Filter", desc: "Recolor the whole game",
        defaults: { preset: "vibrant", strength: 0.8 },
        settings: [
            { key: "preset", type: "select", label: "Look", options: [["vibrant", "Vibrant"], ["cinematic", "Cinematic"], ["noir", "Noir"], ["warm", "Warm"], ["cold", "Cold"], ["vaporwave", "Vaporwave"], ["dreamy", "Dreamy"]] },
            { key: "strength", type: "slider", label: "Strength", min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" }
        ],
        apply() {
            const c = findCanvas();
            if (!c) return;
            const s = S(this), f = FILTERS[s.preset] || {}, k = s.strength;
            const parts = [];
            for (const [name, v] of Object.entries(f)) {
                const id = ["grayscale", "sepia", "blur", "hue-rotate"].includes(name) ? 0 : 1;
                const val = id + (v - id) * k;
                parts.push(name + "(" + (name === "hue-rotate" ? val + "deg" : name === "blur" ? val + "px" : val) + ")");
            }
            c.style.filter = parts.join(" ");
        },
        enable() { this.apply(); },
        change() { this.apply(); },
        disable() { const c = findCanvas(); if (c) c.style.filter = ""; },
        frame() { const c = findCanvas(); if (c && !c.style.filter) this.apply(); }
    });

    let outlineMesh = null;
    mod({
        id: "outline", tab: "visuals", name: "Block Outline", desc: "A glowing outline on the block you're looking at",
        defaults: { color: "#ffffff", thickness: 0.035, glow: 0.6, rainbow: false, fill: 0.06 },
        settings: [
            { key: "color", type: "color", label: "Color" },
            { key: "rainbow", type: "toggle", label: "Rainbow" },
            { key: "thickness", type: "slider", label: "Thickness", min: 0.01, max: 0.12, step: 0.005, fmt: (v) => Math.round(v * 1000) / 10 + "%" },
            { key: "glow", type: "slider", label: "Glow", min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" },
            { key: "fill", type: "slider", label: "Face tint", min: 0, max: 0.4, step: 0.01, fmt: (v) => Math.round(v * 100) + "%" }
        ],
        build() {
            const v = [];
            const f = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
            const p = (x, y, z) => [x - 0.5, y - 0.5, z - 0.5];
            f(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)); f(p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0));
            f(p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)); f(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1));
            f(p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)); f(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0));
            const geo = new T.BufferGeometry();
            geo.setAttribute("position", new T.BufferAttribute(new Float32Array(v), 3));
            const mat = new T.ShaderMaterial({
                uniforms: { uColor: { value: new T.Color(1, 1, 1) }, uW: { value: 0.035 }, uGlow: { value: 0.6 }, uFill: { value: 0.06 } },
                vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.004, 1.0); }",
                fragmentShader: [
                    "uniform vec3 uColor; uniform float uW; uniform float uGlow; uniform float uFill; varying vec3 vP;",
                    "void main(){ vec3 a = 0.5 - abs(vP); float m1 = min(a.x, min(a.y, a.z)); float m2 = a.x + a.y + a.z - m1 - max(a.x, max(a.y, a.z));",
                    " float edge = 1.0 - smoothstep(uW * 0.6, uW, m2);",
                    " float glow = (1.0 - smoothstep(uW, uW * 4.0, m2)) * uGlow * 0.45;",
                    " float alpha = max(edge, max(glow, uFill)); if (alpha < 0.01) discard;",
                    " gl_FragColor = vec4(uColor, alpha); }"
                ].join("\n"),
                transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
            });
            outlineMesh = new T.Mesh(geo, mat);
            outlineMesh.renderOrder = 6;
            outlineMesh.frustumCulled = false;
            G.gameScene.ambientMeshes.add(outlineMesh);
        },
        enable() { if (!outlineMesh) this.build(); },
        disable() { if (outlineMesh) outlineMesh.visible = false; },
        frame() {
            if (!outlineMesh) return;
            const s = S(this), u = outlineMesh.material.uniforms;
            let b = null;
            try {
                const mo = G.controller.objectMouseOver;
                b = mo && mo.block;
                if (b && b.x == null && b.getX) b = { x: b.getX(), y: b.getY(), z: b.getZ() };
            } catch (e) {}
            if (!b || b.x == null) { outlineMesh.visible = false; return; }
            outlineMesh.visible = true;
            outlineMesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
            if (s.rainbow) u.uColor.value.setHSL((performance.now() / 4000) % 1, 0.9, 0.6);
            else u.uColor.value.setRGB(...hexToRgb(s.color));
            u.uW.value = s.thickness; u.uGlow.value = s.glow; u.uFill.value = s.fill;
        }
    });

    const breakState = { orig: null };
    mod({
        id: "breakcolor", tab: "visuals", name: "Break Animation Color", desc: "Recolor the cracks when mining a block",
        defaults: { color: "#ff4fd8", opacity: 1 },
        settings: [
            { key: "color", type: "color", label: "Crack color" },
            { key: "opacity", type: "slider", label: "Opacity", min: 0.1, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%" }
        ],
        frame() {
            const m = G.gameScene.blockDamageRenderer && G.gameScene.blockDamageRenderer.material;
            if (!m) return;
            if (!breakState.orig) breakState.orig = { color: m.color.getHex(), opacity: m.opacity, transparent: m.transparent };
            const s = S(this);
            m.color.setRGB(...hexToRgb(s.color));
            m.opacity = s.opacity;
            m.transparent = true;
        },
        disable() {
            const m = G.gameScene.blockDamageRenderer && G.gameScene.blockDamageRenderer.material;
            if (!m || !breakState.orig) return;
            m.color.setHex(breakState.orig.color);
            m.opacity = breakState.orig.opacity;
            m.transparent = breakState.orig.transparent;
        }
    });

    function playEffect(kind, x, y, z, color, sound) {
        const c = hexToRgb(color || "#ffffff");
        if (kind === "lightning") strikeLightning(x, y - 1, z, sound, 0.6);
        else if (kind === "firework") {
            burst("spark", x, y + 1.5, z, { count: 90, speed: 6, speedMin: 3, gravity: 3, drag: 0.93, life: 1.6, rainbow: !color || color === "rainbow", color: c });
            burst("soft", x, y + 1.5, z, { count: 20, speed: 2, gravity: 1, life: 0.6, color: [1, 1, 1] });
            if (sound) beep(220, 300, 0.12);
        } else if (kind === "hearts") burst("heart", x, y + 1.2, z, { count: 18, speed: 2.2, speedMin: 0.8, gravity: -0.6, drag: 0.95, life: 1.8, color: [1, 0.3, 0.45], up: 1 });
        else if (kind === "smoke") burst("soft", x, y + 1, z, { count: 45, speed: 1.4, gravity: -1.2, drag: 0.96, life: 2, color: [0.35, 0.35, 0.38] });
        else if (kind === "stars") burst("star", x, y + 1, z, { count: 14, speed: 3, gravity: 4, life: 0.9, color: c });
        else if (kind === "crit") burst("spark", x, y + 1, z, { count: 16, speed: 3.5, gravity: 7, life: 0.6, color: [1, 0.85, 0.45] });
        else if (kind === "sparks") burst("spark", x, y + 1, z, { count: 22, speed: 5, gravity: 10, life: 0.5, color: c });
        else if (kind === "flames") burst("soft", x, y + 0.8, z, { count: 18, speed: 1.2, gravity: -3, drag: 0.92, life: 0.7, color: [1, 0.45, 0.1] });
    }

    mod({
        id: "killfx", tab: "visuals", name: "Kill Effects", desc: "An effect where your opponent dies (only you see it)",
        defaults: { effect: "lightning", color: "#ffd36b", sound: true },
        settings: [
            { key: "effect", type: "seg", label: "Effect", options: [["lightning", "Lightning"], ["firework", "Firework"], ["hearts", "Hearts"], ["smoke", "Smoke"]] },
            { key: "color", type: "color", label: "Firework color", show: (s) => s.effect === "firework" },
            { key: "sound", type: "toggle", label: "Sound" },
            { key: "_t", type: "buttons", label: "", buttons: [["Preview", "x"]], onClick: (m) => { const p = playerPos(); if (p) { const c = camPos(), d = new T.Vector3(); G.gameScene.camera.getWorldDirection(d); playEffect(S(m).effect, c.x + d.x * 5, p.y, c.z + d.z * 5, S(m).color, S(m).sound); } } }
        ],
        onKill(victim) {
            const p = lastPositions.get(victim);
            if (!p || performance.now() - p.t > 4000) return;
            const s = S(this);
            playEffect(s.effect, p.x, p.y, p.z, s.color, s.sound);
        }
    });

    let lastClick = 0;
    const hurtSeen = new WeakMap();
    window.addEventListener("mousedown", (e) => { if (e.button === 0) lastClick = performance.now(); }, true);
    mod({
        id: "hitfx", tab: "visuals", name: "Hit Particles", desc: "Particles when you hit someone",
        defaults: { effect: "crit", color: "#7cf7ff" },
        settings: [
            { key: "effect", type: "seg", label: "Effect", options: [["crit", "Crit"], ["stars", "Stars"], ["hearts", "Hearts"], ["sparks", "Sparks"], ["flames", "Flames"]] },
            { key: "color", type: "color", label: "Color", show: (s) => s.effect === "stars" || s.effect === "sparks" }
        ],
        frame() {
            const list = G.world && G.world.loadedEntityList, pp = playerPos();
            if (!list || !pp) return;
            const recent = performance.now() - lastClick < 450;
            for (const e of list) {
                if (!e || e === G.player || !e.pos) continue;
                const h = e.hurtTime || 0, prev = hurtSeen.get(e) || 0;
                hurtSeen.set(e, h);
                if (recent && h > prev && h >= 8) {
                    const d = Math.hypot(e.pos.x - pp.x, e.pos.y - pp.y, e.pos.z - pp.z);
                    if (d < 7) { const s = S(this); playEffect(s.effect === "hearts" ? "hearts" : s.effect, e.pos.x, e.pos.y, e.pos.z, s.color, false); }
                }
            }
        }
    });

    const chatHistory = [];
    const chatState = { wrapped: null, lastKey: "", lastEntry: null, lastAt: 0, count: 1 };
    const mentionColor = (s) => s.color || "gold";
    const highlightText = (text, words, color) => {
        const parts = String(text).split(/(\\[a-z_]+\\)/);
        let current = "reset";
        const lower = words.map((w) => w.toLowerCase());
        return parts.map((p) => {
            if (/^\\[a-z_]+\\$/.test(p)) { current = p.slice(1, -1); return p; }
            if (!p) return p;
            let out = "", i = 0;
            const pl = p.toLowerCase();
            while (i < p.length) {
                let hit = -1, len = 0;
                for (const w of lower) { if (w && pl.startsWith(w, i) && w.length > len) { hit = i; len = w.length; } }
                if (hit >= 0) { out += "\\" + color + "\\\\bold\\" + p.substr(i, len) + "\\reset\\\\" + current + "\\"; i += len; }
                else { out += p[i]; i++; }
            }
            return out;
        }).join("");
    };
    function processIncoming(e) {
        if (!e || e.toast || typeof e.text !== "string") return e;
        const plain = stripCodes(e.text);
        chatHistory.push({ t: Date.now(), text: plain, from: e.from || "" });
        if (chatHistory.length > 1000) chatHistory.shift();
        if (chatHistoryOpen) renderChatHistory();

        if (e.killFeed) {
            const me = G.player && G.player.name;
            if (me && store.mods.killfx.enabled) {
                const idx = plain.indexOf(me);
                if (idx >= 0) {
                    let victim = null, vIdx = Infinity;
                    for (const name of lastPositions.keys()) {
                        if (name === me) continue;
                        const i = plain.indexOf(name);
                        if (i > idx && i < vIdx) { vIdx = i; victim = name; }
                    }
                    if (victim) { try { getMod("killfx").onKill(victim); } catch (err) {} }
                }
            }
        }

        const filt = store.mods.chatfilter;
        if (filt.enabled) {
            const s = filt.settings;
            if (s.joinLeave && / has (joined|left) the server$/.test(plain)) return null;
            const words = (s.words || "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
            if (words.some((w) => plain.toLowerCase().includes(w))) return null;
        }

        const hl = store.mods.mentions;
        if (hl.enabled) {
            const s = hl.settings;
            const words = (s.words || "").split(",").map((w) => w.trim()).filter(Boolean);
            if (s.myName && G.player && G.player.name) words.push(G.player.name);
            const fromMe = G.player && plain.trimStart().startsWith(G.player.name + ":");
            if (words.length && !fromMe && words.some((w) => plain.toLowerCase().includes(w.toLowerCase()))) {
                e = Object.assign({}, e, { text: highlightText(e.text, words, mentionColor(s)) });
                if (s.sound) beep(1046, 140, 0.12);
            }
        }

        const sp = store.mods.spamstack;
        if (sp.enabled) {
            const key = plain + "|" + (e.from || "");
            const now = Date.now();
            const log = G.chat.log;
            const last = log[log.length - 1];
            if (key === chatState.lastKey && last && last === chatState.lastEntry && now - chatState.lastAt < sp.settings.seconds * 1000) {
                chatState.count++;
                chatState.lastAt = now;
                last.text = chatState.baseText + " \\gray\\(×" + chatState.count + ")";
                last.t = now;
                last.timer = 0;
                try { log.splice(log.length - 1, 1, Object.assign({}, last)); chatState.lastEntry = log[log.length - 1]; } catch (err) {}
                return null;
            }
            chatState.lastKey = key;
            chatState.lastAt = now;
            chatState.count = 1;
            chatState.baseText = e.text;
            chatState.pendingTrack = true;
        }
        return e;
    }

    function installChat() {
        const C = G && G.chat;
        if (!C || chatState.wrapped === C) return;
        chatState.wrapped = C;
        const proto = Object.getPrototypeOf(C);
        ORIG.addChat = proto.addChat;
        ORIG.submit = proto.submit;
        C.addChat = function (e) {
            let out = e;
            try { out = processIncoming(e); } catch (err) {}
            if (!out) return;
            const r = ORIG.addChat.call(this, out);
            if (chatState.pendingTrack) { chatState.pendingTrack = false; chatState.lastEntry = this.log[this.log.length - 1]; }
            return r;
        };
        C.submit = function (game) {
            const v = String(this.inputValue || "").trim();
            const cm = store.mods.commands;
            if (cm.enabled && !this.isInputCommandMode && v.startsWith(cm.settings.prefix) && v.length > cm.settings.prefix.length) {
                try { runClientCommand(v.slice(cm.settings.prefix.length)); } catch (err) { chatPrint("\\red\\" + err.message); }
                if (this.inputHistory && this.inputHistory[0] !== v) this.inputHistory.unshift(v);
                if (this.setInputValue) this.setInputValue(""); else this.inputValue = "";
                try { this.closeInput && this.closeInput(); } catch (err) {}
                return;
            }
            return ORIG.submit.apply(this, arguments);
        };
    }

    mod({ id: "mentions", tab: "chat", name: "Highlights", desc: "Highlight keywords in chat and play a ping", defaults: { words: "", myName: true, color: "gold", sound: true },
        settings: [
            { key: "words", type: "text", label: "Keywords (comma separated)", placeholder: "gg, trade, your clan" },
            { key: "myName", type: "toggle", label: "Highlight my name too" },
            { key: "color", type: "seg", label: "Color", options: [["gold", "Gold"], ["aqua", "Aqua"], ["hotpink", "Pink"], ["lime", "Lime"], ["red", "Red"]] },
            { key: "sound", type: "toggle", label: "Ping sound" }
        ] });
    mod({ id: "spamstack", tab: "chat", name: "Spam Stacking", desc: "Repeated messages collapse into one with a ×count", defaults: { seconds: 20 },
        settings: [{ key: "seconds", type: "slider", label: "Stack within", min: 3, max: 120, step: 1, fmt: (v) => v + " s" }] });
    mod({ id: "chatfilter", tab: "chat", name: "Chat Filter", desc: "Hide join/leave lines or messages with certain words", defaults: { joinLeave: true, words: "" },
        settings: [
            { key: "joinLeave", type: "toggle", label: "Hide join/leave messages" },
            { key: "words", type: "text", label: "Hide messages containing", placeholder: "word, another word" }
        ] });
    mod({ id: "commands", tab: "chat", name: "Client Commands", desc: "Type .help in chat. These run on your side and are never sent", defaults: { prefix: "." },
        settings: [{ key: "prefix", type: "text", label: "Prefix" }] });

    let lastSummary = null;
    mod({
        id: "autogg", tab: "chat", name: "Auto GG", desc: "Sends your message when a match ends", defaults: { message: "gg", delay: 1.5 },
        settings: [
            { key: "message", type: "text", label: "Message", placeholder: "gg" },
            { key: "delay", type: "slider", label: "Delay", min: 0, max: 8, step: 0.5, fmt: (v) => v + " s" }
        ],
        enable() { lastSummary = G.info && G.info.lastGameSummary; },
        frame() {
            const s = G.info && G.info.lastGameSummary;
            if (s && s !== lastSummary) {
                lastSummary = s;
                const msg = (S(this).message || "gg").trim();
                if (msg) setTimeout(() => { try { if (inWorld()) sendChat(msg); } catch (e) {} }, S(this).delay * 1000);
            } else if (!s) lastSummary = null;
        }
    });

    const session = { key: null, start: 0 };
    mod({
        id: "session", tab: "hud", name: "Session Timer", desc: "How long you've been in the current server", defaults: { showServer: true, style: "glass" },
        settings: [
            { key: "showServer", type: "toggle", label: "Show server name" },
            { key: "style", type: "seg", label: "Style", options: [["glass", "Glass"], ["minimal", "Minimal"]] }
        ],
        frame() {
            if (!inWorld()) { session.key = null; return; }
            const si = G.serverInfo || {};
            const key = (si.serverId || "") + "|" + (si.inviteCode || "") + "|" + (si.serverName || "");
            if (key !== session.key) { session.key = key; session.start = Date.now(); }
        },
        text() {
            if (!session.key) return null;
            const si = G.serverInfo || {};
            const name = si.serverName || si.serverCategory || "";
            return fmtTime((Date.now() - session.start) / 1000) + (S(this).showServer && name ? "  ·  " + name : "");
        }
    });

    const music = { el: null, list: [], index: -1, playing: false };
    mod({
        id: "music", tab: "client", name: "Music Player", desc: "Your own background playlist", defaults: { widget: true },
        settings: [{ key: "widget", type: "toggle", label: "Show now-playing widget" }],
        enable() { loadMusicList(); },
        disable() { if (music.el) music.el.pause(); music.playing = false; }
    });

    const getMod = (id) => MODULES.find((m) => m.id === id);
    for (const m of MODULES) {
        const cur = store.mods[m.id] || {};
        store.mods[m.id] = { enabled: !!cur.enabled, settings: Object.assign({}, m.defaults, cur.settings) };
    }

    function setModEnabled(id, on) {
        const m = getMod(id), st = store.mods[id];
        if (!m || st.enabled === on) return;
        st.enabled = on;
        save();
        if (!G || !T) return;
        try { on ? m.enable && m.enable() : m.disable && m.disable(); } catch (e) { console.error("[SkyClient]", id, e); }
        renderAll();
    }

    function runClientCommand(raw) {
        const [cmd, ...args] = raw.trim().split(/\s+/);
        const a = (args[0] || "").toLowerCase();
        const c = (cmd || "").toLowerCase();
        if (c === "help") {
            chatPrint("\\gold\\Commands\\reset\\: .sky <name|off|next|list>, .weather <server|clear|rain|storm|snow> [0-100], .time <server|sunrise|noon|sunset|midnight|HH:MM|cycle>, .strike, .profile <name>, .gg, .menu");
        } else if (c === "sky") {
            if (!a || a === "list") chatPrint("Skies: " + presets.map((p) => p.id).concat(mySkies.map((m) => "my:" + m.name)).join(", "));
            else if (a === "off") setSkyEnabled(false);
            else if (a === "next") nextSky(1);
            else {
                const p = presets.find((x) => x.id === a || x.name.toLowerCase() === args.join(" ").toLowerCase());
                const my = mySkies.find((x) => x.name.toLowerCase() === args.join(" ").toLowerCase());
                if (p) applySkyKey(p.id); else if (my) applySkyKey("my:" + my.id); else chatPrint("\\red\\No sky called " + args.join(" "));
            }
        } else if (c === "weather") {
            if (!["server", "clear", "rain", "storm", "snow"].includes(a)) return chatPrint("\\red\\Use: .weather server|clear|rain|storm|snow [0-100]");
            const s = store.mods.weather.settings;
            s.mode = a;
            if (args[1]) s.intensity = clamp(Number(args[1]) / 100, 0.1, 1);
            setModEnabled("weather", true);
            getMod("weather").change();
            save(); renderAll();
            chatPrint("Weather: \\aqua\\" + a);
        } else if (c === "time") {
            const s = store.mods.time.settings;
            if (a === "server") setModEnabled("time", false);
            else if (a === "cycle") { s.mode = "cycle"; if (args[1]) s.speed = clamp(Number(args[1]) || 4, 0.1, 30); setModEnabled("time", true); }
            else {
                const named = { sunrise: 6, noon: 12, day: 12, sunset: 18, night: 22, midnight: 0 };
                let h = named[a];
                if (h == null && /^\d{1,2}(:\d{2})?$/.test(a)) { const [hh, mm] = a.split(":"); h = Number(hh) + (Number(mm) || 0) / 60; }
                if (h == null || h >= 24) return chatPrint("\\red\\Use: .time sunrise|noon|sunset|midnight|HH:MM|cycle|server");
                s.mode = "lock"; s.hour = h; setModEnabled("time", true);
            }
            save(); renderAll();
            chatPrint("Time: \\aqua\\" + a);
        } else if (c === "strike") strikeLightning(null, null, null, true, 0.6);
        else if (c === "profile") {
            const name = args.join(" ");
            if (!name || !store.profiles[name]) chatPrint("Profiles: " + (Object.keys(store.profiles).join(", ") || "none yet"));
            else { applyConfig(store.profiles[name]); chatPrint("Loaded profile \\aqua\\" + name); }
        } else if (c === "gg") sendChat(store.mods.autogg.settings.message || "gg");
        else if (c === "menu") open();
        else chatPrint("\\red\\Unknown command. Try .help");
    }

    let presets = [];
    let mySkies = [];
    let skyLoading = null;
    let currentPack = null;
    const currentSkyKey = () => store.sky.custom ? "my:" + store.sky.custom : store.sky.preset;

    async function loadMySkies() {
        try {
            const all = await db.all("skies");
            for (const m of mySkies) if (m._thumb) URL.revokeObjectURL(m._thumb);
            mySkies = all.sort((a, b) => b.created - a.created).map((m) => Object.assign(m, { _thumb: m.preview ? URL.createObjectURL(m.preview) : null }));
        } catch (e) { mySkies = []; }
    }

    async function applySkyKey(key, quiet) {
        if (!api || skyLoading) return;
        skyLoading = key;
        renderSkyGrid();
        try {
            if (key.startsWith("my:")) {
                const id = key.slice(3);
                const m = mySkies.find((x) => x.id === id) || await db.get("skies", id);
                if (!m) throw new Error("That sky was deleted");
                const opts = Object.assign({ fogColor: null, hideSun: false, hideMoon: false, hideStars: false, hideClouds: false, dayNight: true, nightBrightness: 0.25, blend: "always", brightness: 1, rotationSpeed: 0 }, m.options, store.sky.overrides);
                if (m.type === "panorama") await api.setPanorama(m.image, opts);
                else await api.setSkybox(m.faces, opts);
                currentPack = { options: m.options || {} };
                store.sky.custom = id;
            } else {
                currentPack = await api.loadPreset(key, { size: store.sky.size, options: store.sky.overrides });
                store.sky.preset = key;
                store.sky.custom = null;
            }
            store.sky.enabled = true;
            save();
        } catch (e) {
            if (!quiet) toast("Couldn't load that sky: " + (e && e.message ? e.message : e));
        } finally {
            skyLoading = null;
            renderSky();
        }
    }

    function setSkyEnabled(on) {
        if (!api) return;
        if (on) applySkyKey(currentSkyKey() || "black");
        else { api.removeSkybox(); store.sky.enabled = false; save(); renderSky(); }
    }

    function nextSky(dir) {
        const keys = presets.map((p) => p.id).concat(mySkies.map((m) => "my:" + m.id));
        if (!keys.length) return;
        const i = keys.indexOf(currentSkyKey());
        applySkyKey(keys[((i < 0 ? 0 : i + dir) % keys.length + keys.length) % keys.length]);
    }

    function blobImage(blob) {
        return new Promise((res, rej) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => res(img);
            img.onerror = () => rej(new Error("Couldn't read that image"));
            img.src = url;
        });
    }

    function pickFiles(multiple, accept = "image/*") {
        return new Promise((res) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = accept;
            input.multiple = !!multiple;
            input.addEventListener("cancel", () => res(null));
            input.onchange = () => res([...input.files]);
            input.click();
        });
    }

    async function thumbFromImage(img, w = 320, h = 180) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d");
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const k = Math.max(w / iw, h / ih);
        x.drawImage(img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
        return new Promise((r) => c.toBlob(r, "image/webp", 0.82));
    }

    async function uploadSky() {
        const files = await pickFiles(true);
        if (!files || !files.length) return;
        let rec;
        const id = "s" + Date.now().toString(36);
        if (files.length === 1) {
            const img = await blobImage(files[0]);
            rec = { id, name: files[0].name.replace(/\.[^.]+$/, "").slice(0, 28) || "My sky", type: "panorama", image: files[0], preview: await thumbFromImage(img), created: Date.now(), options: {} };
        } else if (files.length === 6) {
            const order = [["px", "right", "posx", "rt", "cubemap_1"], ["nx", "left", "negx", "lf", "cubemap_3"], ["py", "top", "up", "posy", "cubemap_4"], ["ny", "bottom", "down", "negy", "dn", "cubemap_5"], ["pz", "front", "posz", "ft", "cubemap_0"], ["nz", "back", "negz", "bk", "cubemap_2"]];
            const nm = (f) => f.name.toLowerCase().replace(/\.[^.]+$/, "");
            const matched = order.map((names) => files.find((f) => names.some((n) => nm(f) === n || new RegExp("(^|[^a-z0-9])" + n + "($|[^a-z0-9])").test(nm(f)))));
            const faces = matched.every(Boolean) && new Set(matched).size === 6 ? matched : files;
            const img = await blobImage(faces[4]);
            rec = { id, name: "My sky " + (mySkies.length + 1), type: "cube", faces, preview: await thumbFromImage(img), created: Date.now(), options: {} };
        } else {
            toast("Pick 1 panorama image or 6 cube faces");
            return;
        }
        await db.put("skies", rec);
        await loadMySkies();
        await applySkyKey("my:" + id);
        toast("Saved to My Skies", true);
    }

    async function deleteMySky(id) {
        await db.del("skies", id);
        if (store.sky.custom === id) { store.sky.custom = null; save(); }
        await loadMySkies();
        renderSky();
    }

    async function captureSky(size) {
        if (!inWorld()) { toast("Join a world first"); return; }
        const gs = G.gameScene;
        let renderer = null;
        const sc = gs.scene;
        await new Promise((res) => {
            const old = sc.onBeforeRender;
            sc.onBeforeRender = function (r) { renderer = r; sc.onBeforeRender = old; res(); return old && old.apply(this, arguments); };
            setTimeout(res, 2000);
        });
        if (!renderer) { toast("Couldn't reach the renderer"); return; }
        const cam = new T.PerspectiveCamera(90, 1, 0.1, 1e6);
        const pos = camPos();
        cam.position.copy(pos);
        const sz = { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; return this; } };
        renderer.getSize(sz);
        const pr = renderer.getPixelRatio();
        const target = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
        const dirs = [
            [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 0]],
            [[0, 1, 0], [-1, 0, 0], [0, 0, -1]], [[0, -1, 0], [-1, 0, 0], [0, 0, 1]],
            [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]
        ];
        const faces = [];
        const hud = gs.ambientMeshes.children.filter((o) => o === outlineMesh || (fx && Object.values(fx).some((p) => p.points === o)));
        hud.forEach((o) => (o.userData._v = o.visible, o.visible = false));
        try {
            renderer.setPixelRatio(1);
            renderer.setSize(size, size, false);
            if (renderer.setRenderTarget) renderer.setRenderTarget(null);
            for (const [f, r, u] of dirs) {
                const m = new T.Matrix4();
                const R = new T.Vector3(...r), U = new T.Vector3(...u), B = new T.Vector3(-f[0], -f[1], -f[2]);
                m.makeBasis(R, U, B);
                cam.quaternion.setFromRotationMatrix(m);
                cam.updateMatrixWorld(true);
                renderer.render(sc, cam);
                const c = document.createElement("canvas");
                c.width = c.height = size;
                c.getContext("2d").drawImage(renderer.domElement, 0, 0, size, size, 0, 0, size, size);
                faces.push(await new Promise((r2) => c.toBlob(r2, "image/webp", 0.9)));
            }
        } finally {
            renderer.setPixelRatio(pr);
            renderer.setSize(sz.x, sz.y, false);
            if (renderer.setRenderTarget) renderer.setRenderTarget(target);
            hud.forEach((o) => (o.visible = o.userData._v));
        }
        const id = "c" + Date.now().toString(36);
        const img = await blobImage(faces[4]);
        const rec = { id, name: "Capture " + new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), type: "cube", faces, preview: await thumbFromImage(img), created: Date.now(), options: { dayNight: false } };
        await db.put("skies", rec);
        await loadMySkies();
        toast("Captured! Saved to My Skies", true);
        renderAll();
        return rec;
    }

    async function downloadSky(id) {
        const m = mySkies.find((x) => x.id === id) || await db.get("skies", id);
        if (!m) return;
        const dl = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
        const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sky";
        if (m.type === "panorama") { dl(m.image, slug + "-panorama" + (m.image.type === "image/png" ? ".png" : ".jpg")); return; }
        ["px", "nx", "py", "ny", "pz", "nz"].forEach((n, i) => setTimeout(() => dl(m.faces[i], slug + "-" + n + ".webp"), i * 250));
        const json = { name: m.name, type: "cube", faces: ["px", "nx", "py", "ny", "pz", "nz"].map((n) => n + ".webp"), options: m.options || {} };
        setTimeout(() => dl(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), "sky.json"), 1600);
    }

    const editor = { zenith: "#0b1026", horizon: "#3a2a6b", ground: "#07070d", glow: "#ff7a59", glowSize: 0.35, stars: 0.6, moon: true, moonSize: 6, moonAz: 40, moonEl: 30, moonColor: "#f4f1ff", clouds: 0.35, cloudColor: "#c9b8ff", seed: 7, name: "My sky" };
    function editorSample(o, noise) {
        const z = hexToRgb(o.zenith), hz = hexToRgb(o.horizon), gr = hexToRgb(o.ground), gl = hexToRgb(o.glow), mc = hexToRgb(o.moonColor), cc = hexToRgb(o.cloudColor);
        const mAz = o.moonAz * Math.PI / 180, mEl = o.moonEl * Math.PI / 180;
        const md = [Math.cos(mEl) * Math.cos(mAz), Math.sin(mEl), Math.cos(mEl) * Math.sin(mAz)];
        const mR = Math.sin(o.moonSize * Math.PI / 180);
        const starCut = 1 - o.stars * 0.012;
        return (d) => {
            const y = d[1];
            let c;
            if (y >= 0) {
                const t = Math.pow(1 - y, 2.6);
                c = [z[0] + (hz[0] - z[0]) * t, z[1] + (hz[1] - z[1]) * t, z[2] + (hz[2] - z[2]) * t];
                const gw = Math.exp(-y / Math.max(0.02, o.glowSize * 0.25)) * 0.8;
                c = [c[0] + gl[0] * gw, c[1] + gl[1] * gw, c[2] + gl[2] * gw];
                if (o.stars > 0) {
                    const k = 300;
                    const hsh = Math.abs(Math.sin(Math.floor(d[0] * k) * 12.9898 + Math.floor(d[1] * k) * 78.233 + Math.floor(d[2] * k) * 37.719 + o.seed) * 43758.5453) % 1;
                    if (hsh > starCut) { const b = (hsh - starCut) / (1 - starCut) * Math.min(1, y * 6); c = [c[0] + b, c[1] + b, c[2] + b]; }
                }
                if (o.clouds > 0) {
                    const n = noise(d[0] * 3 / (y + 0.25), d[2] * 3 / (y + 0.25));
                    const cl = Math.max(0, n - (1 - o.clouds)) / Math.max(0.05, o.clouds) * Math.min(1, y * 4);
                    c = [c[0] + (cc[0] - c[0]) * cl * 0.85, c[1] + (cc[1] - c[1]) * cl * 0.85, c[2] + (cc[2] - c[2]) * cl * 0.85];
                }
            } else {
                const t = Math.min(1, -y * 3);
                c = [hz[0] + (gr[0] - hz[0]) * t, hz[1] + (gr[1] - hz[1]) * t, hz[2] + (gr[2] - hz[2]) * t];
            }
            if (o.moon) {
                const dt = d[0] * md[0] + d[1] * md[1] + d[2] * md[2];
                const ang = Math.acos(clamp(dt, -1, 1));
                const r = mR;
                if (ang < r * 5) {
                    const gl2 = Math.exp(-Math.max(0, ang - r) / (r * 0.8)) * 0.35;
                    c = [c[0] + mc[0] * gl2, c[1] + mc[1] * gl2, c[2] + mc[2] * gl2];
                }
                if (ang < r) {
                    const crater = 0.85 + 0.15 * noise(d[0] * 60, d[2] * 60 + d[1] * 60);
                    const edge = clamp((r - ang) / (r * 0.08), 0, 1);
                    c = [c[0] + (mc[0] * crater - c[0]) * edge, c[1] + (mc[1] * crater - c[1]) * edge, c[2] + (mc[2] * crater - c[2]) * edge];
                }
            }
            return c;
        };
    }
    function makeNoise(seed) {
        const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453; return s - Math.floor(s); };
        const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; };
        return (x, y) => { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * n(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; };
    }
    const FACE_DIRS = [(sc, tc) => [-1, -tc, -sc], (sc, tc) => [1, -tc, sc], (sc, tc) => [-sc, 1, tc], (sc, tc) => [-sc, -1, -tc], (sc, tc) => [-sc, -tc, 1], (sc, tc) => [sc, -tc, -1]];
    function renderEditorPreview(canvas) {
        const o = editor, w = canvas.width, h = canvas.height, x = canvas.getContext("2d"), img = x.createImageData(w, h);
        const f = editorSample(o, makeNoise(o.seed));
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const az = (i / w) * Math.PI * 2, el = (0.5 - j / h) * Math.PI;
            const c = f([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
            const p = (j * w + i) * 4;
            img.data[p] = clamp(c[0], 0, 1) * 255; img.data[p + 1] = clamp(c[1], 0, 1) * 255; img.data[p + 2] = clamp(c[2], 0, 1) * 255; img.data[p + 3] = 255;
        }
        x.putImageData(img, 0, 0);
    }
    async function buildEditorSky(size = 768) {
        const f = editorSample(editor, makeNoise(editor.seed));
        const faces = [];
        for (let k = 0; k < 6; k++) {
            const c = document.createElement("canvas");
            c.width = c.height = size;
            const x = c.getContext("2d"), img = x.createImageData(size, size);
            for (let j = 0; j < size; j++) {
                const tc = (j + 0.5) / size * 2 - 1;
                for (let i = 0; i < size; i++) {
                    const sc = (i + 0.5) / size * 2 - 1;
                    const d = FACE_DIRS[k](sc, tc), l = Math.hypot(d[0], d[1], d[2]);
                    const col = f([d[0] / l, d[1] / l, d[2] / l]);
                    const p = (j * size + i) * 4;
                    img.data[p] = clamp(col[0], 0, 1) * 255; img.data[p + 1] = clamp(col[1], 0, 1) * 255; img.data[p + 2] = clamp(col[2], 0, 1) * 255; img.data[p + 3] = 255;
                }
                if (j % 64 === 0) await sleep(0);
            }
            x.putImageData(img, 0, 0);
            faces.push(await new Promise((r) => c.toBlob(r, "image/webp", 0.92)));
        }
        return faces;
    }

    async function loadMusicList() {
        let files = [];
        try { files = await db.all("music"); } catch (e) {}
        music.list = files.map((f) => ({ id: f.id, name: f.name, src: URL.createObjectURL(f.blob), file: true }))
            .concat((store.music.urls || []).map((u, i) => ({ id: "u" + i, name: decodeURIComponent(u.split("/").pop().split("?")[0]) || u, src: u, url: true })));
        renderAll();
    }
    function musicPlay(i) {
        if (!music.list.length) { toast("Add some songs first"); return; }
        if (!music.el) {
            music.el = new Audio();
            music.el.addEventListener("ended", () => musicNext(1));
            music.el.addEventListener("error", () => { toast("Couldn't play that song"); });
        }
        if (i != null) { music.index = i; music.el.src = music.list[i].src; }
        else if (music.index < 0) { music.index = 0; music.el.src = music.list[0].src; }
        music.el.volume = store.music.volume;
        music.el.play().then(() => { music.playing = true; renderAll(); }).catch(() => toast("Click play again to start audio"));
    }
    function musicPause() { if (music.el) music.el.pause(); music.playing = false; renderAll(); }
    function musicNext(dir) {
        if (!music.list.length) return;
        let i = store.music.shuffle && music.list.length > 1 ? Math.floor(Math.random() * music.list.length) : music.index + dir;
        musicPlay(((i % music.list.length) + music.list.length) % music.list.length);
    }

    function snapshot() {
        const mods = {};
        for (const m of MODULES) mods[m.id] = JSON.parse(JSON.stringify(store.mods[m.id]));
        return { v: 1, sky: { enabled: store.sky.enabled, preset: store.sky.preset, size: store.sky.size, overrides: JSON.parse(JSON.stringify(store.sky.overrides)) }, mods };
    }
    function applyConfig(cfg) {
        if (!cfg || !cfg.mods) throw new Error("That isn't a valid config");
        for (const m of MODULES) {
            const c = cfg.mods[m.id];
            if (!c) continue;
            store.mods[m.id].settings = Object.assign({}, m.defaults, c.settings);
            setModEnabled(m.id, !!c.enabled);
            if (store.mods[m.id].enabled && m.change) { try { m.change(); } catch (e) {} }
        }
        if (cfg.sky) {
            store.sky.size = cfg.sky.size || store.sky.size;
            store.sky.overrides = Object.assign({}, cfg.sky.overrides);
            if (cfg.sky.enabled === false) setSkyEnabled(false);
            else if (cfg.sky.preset) applySkyKey(cfg.sky.preset, true);
        }
        save();
        renderAll();
    }
    const exportCode = () => "SKY1:" + btoa(unescape(encodeURIComponent(JSON.stringify(snapshot()))));
    const importCode = (code) => {
        const raw = String(code || "").trim().replace(/^SKY1:/, "");
        applyConfig(JSON.parse(decodeURIComponent(escape(atob(raw)))));
    };
    const serverKey = () => {
        const si = G && G.serverInfo;
        return si ? (si.serverName || si.serverCategory || si.serverId || "") : "";
    };
    let lastServerKey = null;
    function checkServerProfile() {
        if (!inWorld()) { lastServerKey = null; return; }
        const k = serverKey();
        if (!k || k === lastServerKey) return;
        lastServerKey = k;
        const name = store.serverProfiles[k];
        if (name && store.profiles[name]) { applyConfig(store.profiles[name]); toast("Loaded profile \"" + name + "\" for this server", true); }
    }

    const ACTIONS = {
        menu: { label: "Open menu", run: () => toggle() },
        nextSky: { label: "Next sky", run: () => nextSky(1) },
        toggleSky: { label: "Sky on/off", run: () => setSkyEnabled(!store.sky.enabled) },
        cycleWeather: { label: "Cycle weather", run: () => { const o = ["clear", "rain", "storm", "snow"]; const s = store.mods.weather.settings; s.mode = o[(o.indexOf(s.mode) + 1) % o.length]; setModEnabled("weather", true); getMod("weather").change(); save(); toast("Weather: " + s.mode, true); renderAll(); } },
        strike: { label: "Strike lightning", run: () => strikeLightning(null, null, null, true, store.mods.lightning.settings.volume) },
        capture: { label: "Capture sky here", run: () => captureSky(1024) },
        musicToggle: { label: "Music play/pause", run: () => (music.playing ? musicPause() : musicPlay()) },
        musicNext: { label: "Next song", run: () => musicNext(1) }
    };
    for (const m of MODULES) ACTIONS["mod:" + m.id] = { label: "Toggle " + m.name, run: () => { setModEnabled(m.id, !store.mods[m.id].enabled); toast(m.name + (store.mods[m.id].enabled ? " on" : " off"), true); } };

    const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
    --bg: rgba(12, 14, 21, 0.9); --line: rgba(255,255,255,.08); --text: #eef0f6; --muted: #8f96a8; --faint: rgba(255,255,255,.055);
    --accent: #8b7cff; --accent-2: #5ec8ff; --good: #3ddc84;
    font: 13px/1.4 "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: var(--text); -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
.fab { position: fixed; right: 18px; bottom: 18px; width: 46px; height: 46px; border-radius: 14px; border: 1px solid var(--line);
    background: var(--bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: grid; place-items: center; cursor: pointer;
    box-shadow: 0 8px 28px rgba(0,0,0,.45); transition: transform .15s, opacity .2s, border-color .2s; }
.fab:hover { transform: translateY(-2px); border-color: rgba(139,124,255,.6); }
.fab.hidden { opacity: 0; pointer-events: none; transform: translateY(8px); }
.fab svg { width: 22px; height: 22px; }
.fab .dot { position: absolute; top: 9px; right: 9px; width: 7px; height: 7px; border-radius: 50%; background: var(--good); box-shadow: 0 0 8px var(--good); }
.fab .dot.off { background: #6b7080; box-shadow: none; }
.panel { position: fixed; top: 16px; right: 16px; width: 430px; max-width: calc(100vw - 32px); height: calc(100vh - 32px); max-height: 860px;
    display: flex; flex-direction: column; background: var(--bg); backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2);
    border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.55);
    opacity: 0; transform: translateX(16px) scale(.98); pointer-events: none; transition: opacity .18s, transform .18s; }
.panel.open { opacity: 1; transform: none; pointer-events: auto; }
.head { display: flex; align-items: center; gap: 12px; padding: 14px 16px 12px; }
.logo { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 4px 14px rgba(139,124,255,.45); }
.logo svg { width: 20px; height: 20px; color: #fff; }
.titles { flex: 1; min-width: 0; }
.title { font-size: 15px; font-weight: 650; letter-spacing: .2px; }
.sub { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn { width: 30px; height: 30px; border-radius: 9px; border: none; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; flex: none; }
.icon-btn:hover { background: var(--faint); color: var(--text); }
.icon-btn svg { width: 16px; height: 16px; }
.tabs { display: flex; gap: 2px; padding: 0 10px 10px; border-bottom: 1px solid var(--faint); overflow-x: auto; scrollbar-width: none; }
.tab { flex: 1; min-width: 58px; border: none; background: transparent; color: var(--muted); padding: 7px 4px 6px; border-radius: 10px; cursor: pointer;
    display: grid; justify-items: center; gap: 3px; font-size: 11px; font-weight: 600; }
.tab svg { width: 17px; height: 17px; }
.tab:hover { background: var(--faint); color: var(--text); }
.tab.on { background: rgba(139,124,255,.16); color: var(--text); }
.tab.on svg { color: var(--accent); }
.search { margin: 10px 16px 0; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid var(--line); }
.search svg { width: 14px; height: 14px; color: var(--muted); flex: none; }
.search input { flex: 1; background: transparent; border: none; outline: none; font-size: 12.5px; }
.body { flex: 1; overflow-y: auto; padding: 4px 16px 16px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
.section-title { margin: 14px 0 9px; font-size: 11px; font-weight: 650; letter-spacing: .9px; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; justify-content: space-between; }
.section-title .link { text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--accent); cursor: pointer; background: none; border: none; font-size: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.card { position: relative; aspect-ratio: 16/10; border-radius: 12px; overflow: hidden; cursor: pointer; border: 1px solid var(--line); background: #1b1e28; padding: 0;
    transition: transform .15s, border-color .15s, box-shadow .15s; }
.card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.22); }
.card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.card .name { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 9px 7px; text-align: left; font-size: 12px; font-weight: 600; background: linear-gradient(transparent, rgba(0,0,0,.8)); }
.card.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), 0 6px 20px rgba(139,124,255,.35); }
.card .check { position: absolute; top: 7px; right: 7px; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); display: none; place-items: center; }
.card.active .check { display: grid; }
.card .check svg { width: 12px; height: 12px; color: #fff; }
.card .del { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 7px; background: rgba(0,0,0,.55); border: none; color: #fff; display: none; place-items: center; cursor: pointer; }
.card .dl { left: 32px; }
.card:hover .del { display: grid; }
.card .del svg { width: 12px; height: 12px; }
.card .spin { position: absolute; inset: 0; display: none; place-items: center; background: rgba(0,0,0,.45); }
.card.loading .spin { display: grid; }
.spinner { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.25); border-top-color: #fff; animation: rot .8s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
.card.upload { display: grid; place-items: center; background: transparent; border-style: dashed; border-color: rgba(255,255,255,.18); color: var(--muted); }
.card.upload:hover { color: var(--text); border-color: var(--accent); }
.card.upload .u { display: grid; justify-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
.card.upload svg { width: 22px; height: 22px; }
.mod { border: 1px solid var(--line); border-radius: 13px; background: rgba(255,255,255,.025); margin-bottom: 9px; overflow: hidden; transition: border-color .15s; }
.mod.on { border-color: rgba(139,124,255,.35); background: rgba(139,124,255,.05); }
.mod-head { display: flex; align-items: center; gap: 10px; padding: 11px 12px; cursor: pointer; }
.mod-head .txt { flex: 1; min-width: 0; }
.mod-name { font-weight: 650; font-size: 13.5px; }
.mod-desc { color: var(--muted); font-size: 11.5px; margin-top: 1px; }
.chev { width: 16px; height: 16px; color: var(--muted); transition: transform .15s; flex: none; }
.mod.open .chev { transform: rotate(180deg); }
.mod-body { display: none; padding: 0 12px 6px; border-top: 1px solid var(--faint); }
.mod.open .mod-body { display: block; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--faint); }
.row:last-child { border-bottom: none; }
.row.col { flex-direction: column; align-items: stretch; gap: 7px; }
.row.disabled { opacity: .4; pointer-events: none; }
.label { display: grid; }
.label small { color: var(--muted); font-size: 11.5px; }
.val { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.slider-top { display: flex; justify-content: space-between; align-items: center; }
input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; margin: 0; cursor: pointer; }
input[type=range]::-webkit-slider-runnable-track { height: 5px; border-radius: 5px; background: linear-gradient(90deg, var(--accent) 0 var(--p, 50%), rgba(255,255,255,.12) var(--p, 50%) 100%); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; margin-top: -5.5px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
input[type=range]::-moz-range-track { height: 5px; border-radius: 5px; background: rgba(255,255,255,.12); }
input[type=range]::-moz-range-progress { height: 5px; border-radius: 5px; background: var(--accent); }
input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border: none; border-radius: 50%; background: #fff; }
.switch { position: relative; width: 38px; height: 22px; flex: none; cursor: pointer; display: inline-block; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.switch .track { position: absolute; inset: 0; border-radius: 22px; background: rgba(255,255,255,.14); transition: background .18s; }
.switch .track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .18s; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.switch input:checked + .track { background: var(--accent); }
.switch input:checked + .track::after { transform: translateX(16px); }
.seg { display: inline-flex; flex-wrap: wrap; background: rgba(255,255,255,.07); border-radius: 9px; padding: 3px; gap: 2px; }
.seg button { border: none; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; padding: 5px 9px; border-radius: 7px; cursor: pointer; }
.seg button:hover { color: var(--text); }
.seg button.on { background: var(--accent); color: #fff; }
.chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--faint); }
.chip { border: 1px solid var(--line); background: rgba(255,255,255,.04); color: var(--muted); font-size: 11.5px; font-weight: 600; padding: 7px 4px; border-radius: 9px; cursor: pointer; display: grid; justify-items: center; gap: 3px; }
.chip svg { width: 16px; height: 16px; }
.chip:hover { color: var(--text); }
.chip.on { background: rgba(139,124,255,.18); border-color: rgba(139,124,255,.55); color: var(--text); }
.btn { border: 1px solid var(--line); background: rgba(255,255,255,.06); font-size: 12px; font-weight: 600; padding: 7px 11px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
.btn:hover { background: rgba(255,255,255,.1); }
.btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
.btn.primary:hover { filter: brightness(1.1); }
.btn.wide { width: 100%; margin-top: 10px; }
.btn.danger:hover { background: rgba(255,80,80,.2); border-color: rgba(255,80,80,.5); }
.btn.listening { border-color: var(--accent); color: var(--accent); }
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
input[type=text], textarea, select { background: rgba(255,255,255,.06); border: 1px solid var(--line); border-radius: 9px; padding: 7px 10px; outline: none; font-size: 12.5px; width: 100%; }
input[type=text]:focus, textarea:focus { border-color: var(--accent); }
select { cursor: pointer; }
select option { background: #1a1d27; }
textarea { resize: vertical; min-height: 64px; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
input[type=color] { -webkit-appearance: none; appearance: none; width: 34px; height: 24px; border: 1px solid var(--line); border-radius: 7px; padding: 0; background: none; cursor: pointer; }
input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
input[type=color]::-webkit-color-swatch { border: none; border-radius: 5px; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 16px; border-top: 1px solid var(--faint); color: var(--muted); font-size: 12px; }
.toast { position: absolute; left: 16px; right: 16px; bottom: 56px; padding: 9px 12px; border-radius: 10px; background: rgba(255,92,92,.16); border: 1px solid rgba(255,92,92,.4); color: #ffd1d1; font-size: 12px;
    opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s; pointer-events: none; }
.toast.ok { background: rgba(61,220,132,.14); border-color: rgba(61,220,132,.4); color: #c9f7dc; }
.toast.show { opacity: 1; transform: none; }
.empty { color: var(--muted); font-size: 12px; padding: 10px 0; grid-column: 1 / -1; }
.hint { color: var(--muted); font-size: 11.5px; padding: 6px 0 2px; }
.list { display: grid; gap: 6px; padding: 6px 0; }
.item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.item .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item.on { border-color: rgba(139,124,255,.5); }
.msgs { max-height: 300px; overflow-y: auto; display: grid; gap: 2px; padding: 6px 0; scrollbar-width: thin; }
.msg { text-align: left; border: none; background: transparent; padding: 5px 8px; border-radius: 7px; cursor: pointer; font-size: 12px; display: flex; gap: 8px; }
.msg:hover { background: rgba(255,255,255,.06); }
.msg .tm { color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
.preview { width: 100%; border-radius: 10px; display: block; border: 1px solid var(--line); image-rendering: auto; }
.hud { position: fixed; pointer-events: none; }
.widget { position: fixed; pointer-events: none; padding: 7px 12px; border-radius: 11px; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    background: rgba(12,14,21,.62); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.widget svg { width: 14px; height: 14px; color: var(--accent-2); }
.widget.minimal { background: none; border: none; backdrop-filter: none; box-shadow: none; text-shadow: 0 1px 3px rgba(0,0,0,.8); padding: 2px 4px; }
.widget.drag { pointer-events: auto; cursor: move; outline: 1px dashed rgba(139,124,255,.7); }
`;

    const ICONS = {
        sky: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
        world: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.5 11a4 4 0 0 1-3 8z"/><path d="M9 22l1-2M13 22l1-2"/></svg>',
        visuals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.8L19 9.6l-4.2 3.2 1.4 5.2L12 15l-4.2 3 1.4-5.2L5 9.6l5.2-1.8z"/></svg>',
        chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        capture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
        hud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
        client: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
        chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
        sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
        stars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z"/></svg>',
        clouds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.5 11a4 4 0 0 1-3 8z"/></svg>',
        music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
        timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>'
    };

    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") el.className = v;
            else if (k === "html") el.innerHTML = v;
            else if (k === "style") el.style.cssText = v;
            else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
            else if (k === "value") el.value = v;
            else el.setAttribute(k, v === true ? "" : v);
        }
        for (const c of children.flat()) {
            if (c == null || c === false) continue;
            el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
        }
        return el;
    }

    const host = h("div", { id: "skyclient" });
    host.style.cssText = "position:fixed;inset:auto;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(h("style", {}, css));
    const root = h("div", { class: "root" });
    shadow.appendChild(root);
    for (const type of ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "dblclick", "wheel", "pointerdown", "pointerup", "contextmenu", "touchstart", "touchend", "input", "paste", "copy"]) {
        host.addEventListener(type, (e) => e.stopPropagation());
    }

    const fabDot = h("span", { class: "dot" });
    const fab = h("button", { class: "fab", title: "Client menu", html: ICONS.sky, onclick: () => open() });
    fab.appendChild(fabDot);
    const sub = h("div", { class: "sub" }, "Loading…");
    const powerInput = h("input", { type: "checkbox" });
    powerInput.addEventListener("change", () => setSkyEnabled(powerInput.checked));
    const TABS = [["sky", "Sky", ICONS.sky], ["world", "World", ICONS.world], ["visuals", "Visuals", ICONS.visuals], ["chat", "Chat", ICONS.chat], ["capture", "Create", ICONS.capture], ["hud", "HUD", ICONS.hud], ["client", "Client", ICONS.client]];
    const tabsEl = h("div", { class: "tabs" });
    const searchInput = h("input", { type: "text", placeholder: "Search features…" });
    searchInput.style.cssText = "background:transparent;border:none;padding:0;";
    searchInput.addEventListener("input", () => renderBody());
    const body = h("div", { class: "body" });
    const keyBtn = h("button", { class: "btn", onclick: () => startRebind("menu", keyBtn) }, keyName(store.binds.menu));
    const toastEl = h("div", { class: "toast" });
    const panel = h("div", { class: "panel" },
        h("div", { class: "head" }, h("div", { class: "logo", html: ICONS.sky }), h("div", { class: "titles" }, h("div", { class: "title" }, "Sky Client"), sub),
            h("label", { class: "switch", title: "Custom sky on/off" }, powerInput, h("span", { class: "track" })),
            h("button", { class: "icon-btn", title: "Close", html: ICONS.close, onclick: () => close() })),
        tabsEl,
        h("div", { class: "search", html: ICONS.search }, searchInput),
        body,
        h("div", { class: "foot" }, h("span", {}, "Menu key · v" + VERSION), keyBtn),
        toastEl
    );
    const hudLayer = h("div", { class: "hud" });
    root.append(hudLayer, fab, panel);

    let toastTimer = 0;
    function toast(msg, ok) {
        toastEl.textContent = msg;
        toastEl.classList.toggle("ok", !!ok);
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
    }

    let rebinding = null;
    function startRebind(action, btn) {
        rebinding = { action, btn };
        btn.textContent = "Press a key…";
        btn.classList.add("listening");
    }

    function control(m, def) {
        const st = store.mods[m.id].settings;
        const set = (v, rerender) => {
            st[def.key] = v;
            save();
            if (store.mods[m.id].enabled && m.change) { try { m.change(); } catch (e) {} }
            if (rerender) renderBody();
        };
        if (def.show && !def.show(st)) return null;
        if (def.type === "toggle") {
            const inp = h("input", { type: "checkbox" });
            inp.checked = !!st[def.key];
            inp.addEventListener("change", () => set(inp.checked, true));
            return h("div", { class: "row" }, h("div", { class: "label" }, h("span", {}, def.label), def.hint ? h("small", {}, def.hint) : null), h("label", { class: "switch" }, inp, h("span", { class: "track" })));
        }
        if (def.type === "slider") {
            const out = h("span", { class: "val" }, def.fmt(Number(st[def.key])));
            const inp = h("input", { type: "range", min: def.min, max: def.max, step: def.step, value: st[def.key] });
            const paint = () => inp.style.setProperty("--p", ((inp.value - def.min) / (def.max - def.min)) * 100 + "%");
            paint();
            inp.addEventListener("input", () => { out.textContent = def.fmt(Number(inp.value)); paint(); set(Number(inp.value)); });
            return h("div", { class: "row col" }, h("div", { class: "slider-top" }, h("span", {}, def.label), out), inp);
        }
        if (def.type === "seg") {
            return h("div", { class: "row col" }, h("span", {}, def.label),
                h("div", { class: "seg" }, def.options.map(([v, t]) => h("button", { class: st[def.key] === v ? "on" : "", onclick: () => set(v, true) }, t))));
        }
        if (def.type === "select" || def.type === "skyselect") {
            const opts = def.type === "skyselect" ? presets.map((p) => [p.id, p.name]).concat(mySkies.map((x) => ["my:" + x.id, "★ " + x.name])) : def.options;
            const sel = h("select", {}, opts.map(([v, t]) => { const o = h("option", { value: v }, t); if (st[def.key] === v) o.selected = true; return o; }));
            sel.addEventListener("change", () => set(sel.value));
            sel.style.width = "auto";
            sel.style.maxWidth = "60%";
            return h("div", { class: "row" }, h("span", {}, def.label), sel);
        }
        if (def.type === "color") {
            const inp = h("input", { type: "color", value: st[def.key] });
            inp.addEventListener("input", () => set(inp.value));
            return h("div", { class: "row" }, h("span", {}, def.label), inp);
        }
        if (def.type === "text") {
            const inp = h("input", { type: "text", value: st[def.key] || "", placeholder: def.placeholder || "" });
            inp.addEventListener("change", () => set(inp.value));
            return h("div", { class: "row col" }, h("span", {}, def.label), inp);
        }
        if (def.type === "key") {
            const action = def.action || "mod:" + m.id;
            const b = h("button", { class: "btn" }, keyName(store.binds[action]));
            b.addEventListener("click", () => startRebind(action, b));
            return h("div", { class: "row" }, h("span", {}, def.label), b);
        }
        if (def.type === "buttons") {
            return h("div", { class: "row col" }, def.label ? h("span", {}, def.label) : null,
                h("div", { class: "btns" }, def.buttons.map(([t, v]) => h("button", { class: "btn", onclick: () => { def.onClick(m, v); save(); if (store.mods[m.id].enabled && m.change) m.change(); renderBody(); } }, t))));
        }
        return null;
    }

    const openMods = new Set();
    function modCard(m) {
        const st = store.mods[m.id];
        const inp = h("input", { type: "checkbox" });
        inp.checked = st.enabled;
        inp.addEventListener("change", () => setModEnabled(m.id, inp.checked));
        const sw = h("label", { class: "switch", onclick: (e) => e.stopPropagation() }, inp, h("span", { class: "track" }));
        const isOpen = openMods.has(m.id);
        const card = h("div", { class: "mod" + (st.enabled ? " on" : "") + (isOpen ? " open" : "") },
            h("div", { class: "mod-head", onclick: () => { openMods.has(m.id) ? openMods.delete(m.id) : openMods.add(m.id); card.classList.toggle("open"); } },
                h("div", { class: "txt" }, h("div", { class: "mod-name" }, m.name), h("div", { class: "mod-desc" }, m.desc)),
                m.settings && m.settings.length ? h("span", { html: ICONS.chev }) : null, sw));
        if (m.settings && m.settings.length) {
            const bodyEl = h("div", { class: "mod-body" }, m.settings.map((d) => control(m, d)));
            if (!m.settings.some((d) => d.type === "key")) bodyEl.appendChild(control(m, { type: "key", label: "Toggle key" }));
            card.appendChild(bodyEl);
        }
        return card;
    }

    function renderTabs() {
        tabsEl.innerHTML = "";
        for (const [id, label, icon] of TABS) {
            tabsEl.appendChild(h("button", { class: "tab" + (store.tab === id ? " on" : ""), html: icon, onclick: () => { store.tab = id; save(); searchInput.value = ""; renderTabs(); renderBody(); } }, label));
        }
    }

    function renderSkyGrid() {
        const grid = body.querySelector("[data-grid=presets]");
        const mine = body.querySelector("[data-grid=mine]");
        if (!grid) return;
        grid.innerHTML = "";
        const card = (key, name, img, extra) => h("button", {
            class: "card" + (store.sky.enabled && currentSkyKey() === key ? " active" : "") + (skyLoading === key ? " loading" : ""),
            title: name, onclick: () => applySkyKey(key)
        }, img ? h("img", { src: img, alt: "", loading: "lazy", draggable: "false" }) : null, h("span", { class: "name" }, name),
            h("span", { class: "check", html: ICONS.check }), h("span", { class: "spin" }, h("span", { class: "spinner" })), extra || null);
        if (!presets.length) grid.appendChild(h("div", { class: "empty" }, api ? "Couldn't load the sky list." : "Loading skies…"));
        for (const p of presets) grid.appendChild(card(p.id, p.name, p.preview));
        if (mine) {
            mine.innerHTML = "";
            for (const m of mySkies) {
                const del = h("button", { class: "del", title: "Delete", html: ICONS.trash, onclick: (e) => { e.stopPropagation(); if (confirm("Delete \"" + m.name + "\"?")) deleteMySky(m.id); } });
                const dl = h("button", { class: "del dl", title: "Download", html: ICONS.download, onclick: (e) => { e.stopPropagation(); downloadSky(m.id); } });
                const c = card("my:" + m.id, m.name, m._thumb, del);
                c.appendChild(dl);
                mine.appendChild(c);
            }
            mine.appendChild(h("button", { class: "card upload", title: "Upload 1 panorama or 6 cube faces", onclick: uploadSky },
                h("span", { class: "u", html: ICONS.upload + "<span>Upload your own</span>" })));
        }
    }

    function skySettings() {
        const o = api ? api.skyboxOptions : Object.assign({ brightness: 1, rotation: 0, rotationSpeed: 0, dayNight: true, nightBrightness: 0.25, blend: "always" }, store.sky.overrides);
        const off = !store.sky.enabled;
        const setO = (k, v, rr) => { store.sky.overrides[k] = v; save(); if (api && store.sky.enabled) api.setSkyboxOptions({ [k]: v }); if (rr) renderBody(); };
        const slider = (label, k, min, max, step, fmt, dis) => {
            const out = h("span", { class: "val" }, fmt(Number(o[k])));
            const inp = h("input", { type: "range", min, max, step, value: o[k] });
            const paint = () => inp.style.setProperty("--p", ((inp.value - min) / (max - min)) * 100 + "%");
            paint();
            inp.addEventListener("input", () => { out.textContent = fmt(Number(inp.value)); paint(); setO(k, Number(inp.value)); });
            return h("div", { class: "row col" + (dis ? " disabled" : "") }, h("div", { class: "slider-top" }, h("span", {}, label), out), inp);
        };
        const tog = (label, k, hint, dis) => {
            const inp = h("input", { type: "checkbox" });
            inp.checked = !!o[k];
            inp.addEventListener("change", () => setO(k, inp.checked, true));
            return h("div", { class: "row" + (dis ? " disabled" : "") }, h("div", { class: "label" }, h("span", {}, label), hint ? h("small", {}, hint) : null), h("label", { class: "switch" }, inp, h("span", { class: "track" })));
        };
        const chip = (k, label, icon) => h("button", { class: "chip" + (o[k] ? " on" : ""), html: icon, onclick: () => setO(k, !o[k], true) }, label);
        const presetFog = currentPack && currentPack.options && currentPack.options.fogColor;
        const wrap = h("div", { class: off ? "" : "" },
            h("div", { class: "row" + (off ? " disabled" : "") }, h("div", { class: "label" }, h("span", {}, "Quality"), h("small", {}, "Lower it if the game lags")),
                h("div", { class: "seg" }, [512, 1024, 2048].map((s) => h("button", { class: store.sky.size === s ? "on" : "", onclick: () => { store.sky.size = s; save(); if (store.sky.enabled && !store.sky.custom) applySkyKey(store.sky.preset); renderBody(); } }, s === 2048 ? "High" : s === 1024 ? "Medium" : "Low")))),
            h("div", { class: "row" + (off ? " disabled" : "") }, h("span", {}, "Show sky"),
                h("div", { class: "seg" }, [["always", "Always"], ["night", "Night only"]].map(([v, t]) => h("button", { class: (o.blend || "always") === v ? "on" : "", onclick: () => setO("blend", v, true) }, t)))),
            slider("Brightness", "brightness", 0.2, 2, 0.05, (v) => Math.round(v * 100) + "%", off),
            slider("Rotation", "rotation", 0, 360, 1, (v) => Math.round(v) + "°", off),
            slider("Spin speed", "rotationSpeed", 0, 10, 0.1, (v) => v.toFixed(1) + "°/s", off),
            tog("Dim at night", "dayNight", "Follows the day/night cycle", off),
            slider("Night brightness", "nightBrightness", 0, 1, 0.05, (v) => Math.round(v * 100) + "%", off || !o.dayNight),
            tog("Darken during rain", "weatherDim", null, off),
            (() => {
                const inp = h("input", { type: "checkbox" });
                inp.checked = !!o.fogColor;
                inp.addEventListener("change", () => { if (inp.checked) { delete store.sky.overrides.fogColor; save(); if (api) api.setSkyboxOptions({ fogColor: presetFog }); } else setO("fogColor", null); });
                return h("div", { class: "row" + (off || !presetFog ? " disabled" : "") }, h("div", { class: "label" }, h("span", {}, "Match fog to sky"), h("small", {}, "Distant terrain fades into the sky")), h("label", { class: "switch" }, inp, h("span", { class: "track" })));
            })(),
            h("div", { class: "section-title" }, "Hide"),
            h("div", { class: "chips", style: off ? "opacity:.4;pointer-events:none" : "" }, chip("hideSun", "Sun", ICONS.sun), chip("hideMoon", "Moon", ICONS.sky), chip("hideStars", "Stars", ICONS.stars), chip("hideClouds", "Clouds", ICONS.clouds)),
            h("button", { class: "btn wide", onclick: () => { store.sky.overrides = {}; save(); if (store.sky.enabled) applySkyKey(currentSkyKey()); else renderBody(); } }, "Reset sky settings")
        );
        return wrap;
    }

    let chatHistoryOpen = false;
    let chatQuery = "";
    function renderChatHistory() {
        const list = body.querySelector("[data-msgs]");
        if (!list) return;
        list.innerHTML = "";
        const q = chatQuery.toLowerCase();
        const items = chatHistory.filter((m) => !q || m.text.toLowerCase().includes(q)).slice(-200).reverse();
        if (!items.length) list.appendChild(h("div", { class: "empty" }, q ? "No messages match." : "Messages show up here as they arrive."));
        for (const m of items) {
            const d = new Date(m.t);
            list.appendChild(h("button", { class: "msg", title: "Click to copy", onclick: () => { navigator.clipboard.writeText(m.text).then(() => toast("Copied", true)).catch(() => toast("Couldn't copy")); } },
                h("span", { class: "tm" }, String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")), h("span", {}, m.text)));
        }
    }

    function editorPanel() {
        const prev = h("canvas", { class: "preview", width: 360, height: 180 });
        let pending = 0;
        const redraw = () => { clearTimeout(pending); pending = setTimeout(() => renderEditorPreview(prev), 60); };
        const col = (label, k) => { const i = h("input", { type: "color", value: editor[k] }); i.addEventListener("input", () => { editor[k] = i.value; redraw(); }); return h("div", { class: "row" }, h("span", {}, label), i); };
        const sl = (label, k, min, max, step, fmt) => {
            const out = h("span", { class: "val" }, fmt(editor[k]));
            const i = h("input", { type: "range", min, max, step, value: editor[k] });
            const paint = () => i.style.setProperty("--p", ((i.value - min) / (max - min)) * 100 + "%");
            paint();
            i.addEventListener("input", () => { editor[k] = Number(i.value); out.textContent = fmt(editor[k]); paint(); redraw(); });
            return h("div", { class: "row col" }, h("div", { class: "slider-top" }, h("span", {}, label), out), i);
        };
        const moonT = h("input", { type: "checkbox" });
        moonT.checked = editor.moon;
        moonT.addEventListener("change", () => { editor.moon = moonT.checked; redraw(); });
        const nameI = h("input", { type: "text", value: editor.name, placeholder: "Sky name" });
        nameI.addEventListener("input", () => (editor.name = nameI.value));
        const saveBtn = h("button", { class: "btn primary wide" }, "Save & use this sky");
        saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = "Building…";
            try {
                const faces = await buildEditorSky(768);
                const id = "e" + Date.now().toString(36);
                const c = document.createElement("canvas"); c.width = 320; c.height = 160; renderEditorPreview(c);
                const preview = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
                await db.put("skies", { id, name: (editor.name || "My sky").slice(0, 28), type: "cube", faces, preview, created: Date.now(), options: { fogColor: hexToRgb(editor.horizon) } });
                await loadMySkies();
                await applySkyKey("my:" + id);
                toast("Saved to My Skies", true);
            } catch (e) { toast("Couldn't build: " + e.message); }
            saveBtn.disabled = false;
            saveBtn.textContent = "Save & use this sky";
        });
        setTimeout(() => renderEditorPreview(prev), 0);
        return h("div", {}, prev,
            h("div", { class: "row col" }, h("span", {}, "Name"), nameI),
            col("Top of sky", "zenith"), col("Horizon", "horizon"), col("Below horizon", "ground"), col("Horizon glow", "glow"),
            sl("Glow height", "glowSize", 0, 1, 0.01, (v) => Math.round(v * 100) + "%"),
            sl("Stars", "stars", 0, 1, 0.01, (v) => Math.round(v * 100) + "%"),
            sl("Clouds", "clouds", 0, 1, 0.01, (v) => Math.round(v * 100) + "%"), col("Cloud color", "cloudColor"),
            h("div", { class: "row" }, h("span", {}, "Moon"), h("label", { class: "switch" }, moonT, h("span", { class: "track" }))),
            col("Moon color", "moonColor"),
            sl("Moon size", "moonSize", 1, 20, 0.5, (v) => v + "°"),
            sl("Moon direction", "moonAz", 0, 360, 1, (v) => v + "°"),
            sl("Moon height", "moonEl", 2, 85, 1, (v) => v + "°"),
            sl("Random seed", "seed", 1, 99, 1, (v) => v),
            saveBtn);
    }

    function renderBody() {
        const keep = body.scrollTop;
        body.innerHTML = "";
        const q = searchInput.value.trim().toLowerCase();
        if (q) {
            const hits = MODULES.filter((m) => (m.name + " " + m.desc).toLowerCase().includes(q));
            body.appendChild(h("div", { class: "section-title" }, hits.length + " result" + (hits.length === 1 ? "" : "s")));
            hits.forEach((m) => body.appendChild(modCard(m)));
            return;
        }
        const tab = store.tab;
        const mods = (t) => MODULES.filter((m) => m.tab === t).map(modCard);
        if (tab === "sky") {
            body.append(h("div", { class: "section-title" }, "Skies"), h("div", { class: "grid", "data-grid": "presets" }),
                h("div", { class: "section-title" }, "My skies"), h("div", { class: "grid", "data-grid": "mine" }));
            renderSkyGrid();
            body.append(h("div", { class: "section-title" }, "Automation"), ...mods("sky"), h("div", { class: "section-title" }, "Sky settings"), skySettings());
        } else if (tab === "world") {
            body.append(h("div", { class: "hint" }, "Everything here is client-side: only you see it."), ...mods("world"));
        } else if (tab === "visuals") {
            body.append(...mods("visuals"));
        } else if (tab === "chat") {
            body.append(...mods("chat"));
            const qi = h("input", { type: "text", placeholder: "Search chat…", value: chatQuery });
            qi.addEventListener("input", () => { chatQuery = qi.value; renderChatHistory(); });
            body.append(h("div", { class: "section-title" }, "Chat history", h("button", { class: "link", onclick: () => { chatHistory.length = 0; renderChatHistory(); } }, "Clear")),
                h("div", { class: "hint" }, "Click a message to copy it."), qi, h("div", { class: "msgs", "data-msgs": "1" }));
            chatHistoryOpen = true;
            renderChatHistory();
        } else if (tab === "capture") {
            const res = h("div", { class: "seg" }, [512, 1024, 2048].map((s) => h("button", { class: (store.captureSize || 1024) === s ? "on" : "", onclick: () => { store.captureSize = s; save(); renderBody(); } }, s + "px")));
            const capBtn = h("button", { class: "btn primary wide" }, "Capture sky from here");
            capBtn.addEventListener("click", async () => { capBtn.disabled = true; capBtn.textContent = "Capturing…"; try { const r = await captureSky(store.captureSize || 1024); if (r) applySkyKey("my:" + r.id); } catch (e) { toast("Capture failed: " + e.message); } capBtn.disabled = false; capBtn.textContent = "Capture sky from here"; });
            body.append(
                h("div", { class: "section-title" }, "Skybox from your build"),
                h("div", { class: "hint" }, "Stand somewhere cool and capture a full 360° view. It's saved to My Skies, so you can use it as a sky or download it as a sky pack."),
                h("div", { class: "row" }, h("span", {}, "Resolution"), res), capBtn,
                h("div", { class: "section-title" }, "Sky editor"), editorPanel());
        } else if (tab === "hud") {
            body.append(h("div", { class: "hint" }, "Drag widgets around while this menu is open."), ...mods("hud"));
        } else if (tab === "client") {
            body.append(clientPanel());
        }
        body.scrollTop = keep;
    }

    function clientPanel() {
        const wrap = h("div", {});
        const nameI = h("input", { type: "text", placeholder: "Profile name, e.g. PvP" });
        const saveP = h("button", { class: "btn primary", onclick: () => { const n = nameI.value.trim(); if (!n) return toast("Give the profile a name"); store.profiles[n] = snapshot(); save(); toast("Saved profile " + n, true); renderBody(); } }, "Save current");
        const list = h("div", { class: "list" });
        const sk = serverKey();
        for (const name of Object.keys(store.profiles)) {
            const isServer = sk && store.serverProfiles[sk] === name;
            list.appendChild(h("div", { class: "item" + (isServer ? " on" : "") },
                h("span", { class: "grow" }, name + (isServer ? "  · auto on this server" : "")),
                h("button", { class: "btn", onclick: () => { applyConfig(store.profiles[name]); toast("Loaded " + name, true); } }, "Load"),
                sk ? h("button", { class: "btn", title: "Load this profile automatically on this server", onclick: () => { if (isServer) delete store.serverProfiles[sk]; else store.serverProfiles[sk] = name; save(); renderBody(); } }, isServer ? "Unlink" : "Use here") : null,
                h("button", { class: "btn danger", onclick: () => { delete store.profiles[name]; for (const k in store.serverProfiles) if (store.serverProfiles[k] === name) delete store.serverProfiles[k]; save(); renderBody(); } }, "✕")));
        }
        if (!Object.keys(store.profiles).length) list.appendChild(h("div", { class: "empty" }, "No profiles yet. Set things up the way you like, then save."));
        wrap.append(h("div", { class: "section-title" }, "Profiles"), h("div", { class: "row", style: "gap:8px" }, nameI, saveP), list,
            h("div", { class: "hint" }, sk ? "Current server: " + sk : "Join a server to link a profile to it."));

        const codeOut = h("textarea", { readonly: true, placeholder: "Your share code appears here" });
        const codeIn = h("textarea", { placeholder: "Paste a friend's code here" });
        wrap.append(h("div", { class: "section-title" }, "Share codes"),
            h("div", { class: "btns" }, h("button", { class: "btn primary", onclick: () => { codeOut.value = exportCode(); codeOut.select(); navigator.clipboard.writeText(codeOut.value).then(() => toast("Code copied", true)).catch(() => {}); } }, "Copy my setup")), codeOut,
            codeIn, h("button", { class: "btn wide", onclick: () => { try { importCode(codeIn.value); toast("Setup loaded", true); } catch (e) { toast("That code didn't work"); } } }, "Load code"));

        const binds = h("div", { class: "list" });
        for (const [id, a] of Object.entries(ACTIONS)) {
            if (id.startsWith("mod:") && !store.binds[id]) continue;
            const b = h("button", { class: "btn" }, keyName(store.binds[id]));
            b.addEventListener("click", () => startRebind(id, b));
            binds.appendChild(h("div", { class: "item" }, h("span", { class: "grow" }, a.label), b,
                store.binds[id] && id !== "menu" ? h("button", { class: "btn", onclick: () => { delete store.binds[id]; save(); renderBody(); } }, "✕") : null));
        }
        wrap.append(h("div", { class: "section-title" }, "Keybinds"), h("div", { class: "hint" }, "Module toggle keys are set inside each module. Press Esc while binding to clear."), binds);

        const mm = store.mods.music;
        wrap.append(h("div", { class: "section-title" }, "Music"), modCard(getMod("music")));
        if (mm.enabled) {
            const urlI = h("input", { type: "text", placeholder: "Paste a direct audio link (.mp3)" });
            const now = music.list[music.index];
            const vol = h("input", { type: "range", min: 0, max: 1, step: 0.02, value: store.music.volume });
            vol.style.setProperty("--p", store.music.volume * 100 + "%");
            vol.addEventListener("input", () => { store.music.volume = Number(vol.value); vol.style.setProperty("--p", vol.value * 100 + "%"); if (music.el) music.el.volume = store.music.volume; save(); });
            const songs = h("div", { class: "list" });
            music.list.forEach((s, i) => songs.appendChild(h("div", { class: "item" + (i === music.index ? " on" : "") },
                h("span", { class: "grow" }, (i === music.index && music.playing ? "▶ " : "") + s.name),
                h("button", { class: "btn", onclick: () => musicPlay(i) }, "Play"),
                h("button", { class: "btn danger", onclick: async () => { if (s.file) await db.del("music", s.id); else store.music.urls = store.music.urls.filter((u) => u !== s.src); save(); if (i === music.index) musicPause(); loadMusicList(); } }, "✕"))));
            if (!music.list.length) songs.appendChild(h("div", { class: "empty" }, "No songs yet."));
            const sh = h("input", { type: "checkbox" });
            sh.checked = !!store.music.shuffle;
            sh.addEventListener("change", () => { store.music.shuffle = sh.checked; save(); });
            wrap.append(
                h("div", { class: "row" }, h("span", { class: "grow" }, now ? now.name : "Nothing playing"),
                    h("div", { class: "btns" }, h("button", { class: "btn", onclick: () => musicNext(-1) }, "⏮"), h("button", { class: "btn primary", onclick: () => (music.playing ? musicPause() : musicPlay()) }, music.playing ? "⏸" : "▶"), h("button", { class: "btn", onclick: () => musicNext(1) }, "⏭"))),
                h("div", { class: "row col" }, h("span", {}, "Volume"), vol),
                h("div", { class: "row" }, h("span", {}, "Shuffle"), h("label", { class: "switch" }, sh, h("span", { class: "track" }))),
                songs,
                h("div", { class: "btns" }, h("button", { class: "btn", onclick: async () => { const f = await pickFiles(true, "audio/*"); if (!f) return; for (const file of f) await db.put("music", { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name.replace(/\.[^.]+$/, ""), blob: file }); loadMusicList(); } }, "Add files")),
                h("div", { class: "row", style: "gap:8px" }, urlI, h("button", { class: "btn", onclick: () => { const u = urlI.value.trim(); if (!/^https?:\/\//.test(u)) return toast("Use a full https:// link"); store.music.urls.push(u); save(); loadMusicList(); } }, "Add link")));
        }

        wrap.append(h("div", { class: "section-title" }, "Reset"), h("button", { class: "btn danger wide", onclick: () => {
            if (!confirm("Turn off every module and reset all settings? Profiles and your skies are kept.")) return;
            for (const m of MODULES) { setModEnabled(m.id, false); store.mods[m.id].settings = Object.assign({}, m.defaults); }
            save(); renderBody();
        } }, "Reset all modules"));
        return wrap;
    }

    function renderSky() {
        renderHead();
        if (store.tab === "sky" && !searchInput.value) renderBody();
    }
    function renderHead() {
        powerInput.checked = store.sky.enabled;
        fabDot.classList.toggle("off", !store.sky.enabled);
        const on = MODULES.filter((m) => store.mods[m.id].enabled).length;
        let skyName = "Off";
        if (store.sky.enabled) {
            if (store.sky.custom) { const m = mySkies.find((x) => x.id === store.sky.custom); skyName = m ? m.name : "Custom"; }
            else { const p = presets.find((x) => x.id === store.sky.preset); skyName = p ? p.name : store.sky.preset; }
        }
        sub.textContent = !api ? "Loading…" : "Sky: " + skyName + "  ·  " + on + " module" + (on === 1 ? "" : "s") + " on";
    }
    let isOpen = false;
    function renderAll() {
        renderHead();
        if (isOpen) renderBody();
        renderHud();
    }

    const widgets = {};
    function widget(id, text, icon, style) {
        let w = widgets[id];
        if (!text) { if (w) { w.el.remove(); delete widgets[id]; } return; }
        if (!w) {
            const el = h("div", { class: "widget" });
            const pos = store.hud[id] || { x: 16, y: 16 + Object.keys(widgets).length * 44 };
            el.style.left = pos.x + "px";
            el.style.top = pos.y + "px";
            el.addEventListener("pointerdown", (e) => {
                if (!isOpen) return;
                const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
                const move = (ev) => { el.style.left = clamp(ox + ev.clientX - sx, 0, innerWidth - 40) + "px"; el.style.top = clamp(oy + ev.clientY - sy, 0, innerHeight - 20) + "px"; };
                const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); store.hud[id] = { x: el.offsetLeft, y: el.offsetTop }; save(); };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
            });
            const ic = h("span", { html: icon });
            const tx = h("span", {});
            el.append(ic, tx);
            hudLayer.appendChild(el);
            w = widgets[id] = { el, tx };
        }
        w.el.className = "widget" + (style === "minimal" ? " minimal" : "") + (isOpen ? " drag" : "");
        if (w.tx.textContent !== text) w.tx.textContent = text;
    }
    function renderHud() {
        const sm = store.mods.session;
        widget("session", sm.enabled && inWorld() ? getMod("session").text() : null, ICONS.timer, sm.settings.style);
        const mm = store.mods.music;
        const now = music.list[music.index];
        widget("music", mm.enabled && mm.settings.widget && music.playing && now ? now.name : null, ICONS.music, "glass");
    }

    function open() {
        isOpen = true;
        panel.classList.add("open");
        fab.classList.add("hidden");
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        renderTabs();
        renderHead();
        renderBody();
        renderHud();
    }
    function close() {
        isOpen = false;
        chatHistoryOpen = false;
        panel.classList.remove("open");
        if (rebinding) { rebinding.btn.classList.remove("listening"); rebinding = null; }
        keyBtn.textContent = keyName(store.binds.menu);
        updateFab();
        renderHud();
    }
    const toggle = () => (isOpen ? close() : open());
    function updateFab() { fab.classList.toggle("hidden", isOpen || !!document.pointerLockElement); }

    window.addEventListener("keydown", (e) => {
        if (rebinding) {
            e.preventDefault();
            e.stopPropagation();
            const { action, btn } = rebinding;
            rebinding = null;
            if (e.code === "Escape") { if (action !== "menu") delete store.binds[action]; }
            else {
                for (const k of Object.keys(store.binds)) if (store.binds[k] === e.code && k !== action) delete store.binds[k];
                store.binds[action] = e.code;
            }
            btn.classList.remove("listening");
            btn.textContent = keyName(store.binds[action]);
            keyBtn.textContent = keyName(store.binds.menu);
            save();
            return;
        }
        if (e.repeat) return;
        const path = e.composedPath ? e.composedPath() : [];
        const t = path[0] || document.activeElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        if (G && G.chat && G.chat.showInput) return;
        for (const [action, code] of Object.entries(store.binds)) {
            if (code === e.code && ACTIONS[action]) { try { ACTIONS[action].run(); } catch (err) {} return; }
        }
    }, true);
    document.addEventListener("pointerlockchange", updateFab);

    const mount = () => (document.body || document.documentElement).appendChild(host);
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
    updateFab();
    renderHead();

    let lastFrame = performance.now();
    let hudTick = 0;
    function loop() {
        requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        if (!G || !T) return;
        try {
            installChat();
            if (inWorld()) trackEntities();
            checkServerProfile();
        } catch (e) {}
        for (const m of MODULES) {
            if (!store.mods[m.id].enabled || !m.frame) continue;
            try { m.frame(dt); } catch (e) {}
        }
        if (fx) for (const p of Object.values(fx)) { try { p.update(dt); } catch (e) {} }
        if (now - hudTick > 500) { hudTick = now; renderHud(); }
    }

    window.SkyClient = { open, close, toggle, store, modules: MODULES, setModEnabled, runCommand: runClientCommand, applySky: applySkyKey, captureSky, version: VERSION };
    window.SkyGUI = window.SkyClient;

    (async () => {
        while (!(getGame() && getGame().gameScene && getGame().gameScene.sky)) await sleep(500);
        G = getGame();
        if (!(window.SkyAPI && window.SkyAPI.loadPreset && window.SkyAPI.flash)) {
            if (window.SkyAPI && window.SkyAPI.removeSkybox) { try { window.SkyAPI.removeSkybox(); } catch (e) {} delete window.SkyAPI; }
            const code = await fetch(BASE + "installation.js", { cache: "no-cache" }).then((r) => r.text());
            (0, eval)(code + ";window.SkyAPI = SkyAPI;");
        }
        api = window.SkyAPI;
        T = discoverThree(G.gameScene);
        await loadMySkies();
        try { presets = await api.listPresets(); } catch (e) { toast("Couldn't load the sky list"); }
        for (const m of MODULES) {
            if (store.mods[m.id].enabled && m.enable) { try { await m.enable(); } catch (e) { console.error("[SkyClient]", m.id, e); } }
        }
        requestAnimationFrame(loop);
        renderAll();
        if (store.sky.enabled) applySkyKey(currentSkyKey() || "black", true);
    })().catch((e) => {
        sub.textContent = "Failed to load";
        toast(String(e && e.message ? e.message : e));
    });
})();
