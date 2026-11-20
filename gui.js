(() => {
    if (window.SkyGUI) {
        window.SkyGUI.open();
        return;
    }

    const BASE = "https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/";
    const STORE = "skyapi.gui.v1";
    const KEY_NAMES = { ShiftRight: "Right Shift", ShiftLeft: "Left Shift", ControlRight: "Right Ctrl", AltRight: "Right Alt" };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const getGame = () => {
        try {
            return Object.values(document.querySelector("#react"))[0].updateQueue.baseState.element.props.game;
        } catch (e) {
            return null;
        }
    };

    const defaults = { enabled: true, preset: "black", size: 2048, overrides: {}, key: "ShiftRight" };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
    const state = Object.assign({}, defaults, saved);
    state.overrides = Object.assign({}, saved.overrides);
    const save = () => {
        try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
    };

    let api = null;
    let presets = [];
    let currentPack = null;
    let customActive = false;
    let loadingId = null;
    let rebinding = false;
    let isOpen = false;

    const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
    --bg: rgba(13, 15, 22, 0.88);
    --panel-border: rgba(255, 255, 255, 0.08);
    --text: #eef0f6;
    --muted: #9097a8;
    --faint: rgba(255, 255, 255, 0.06);
    --accent: #8b7cff;
    --accent-2: #5ec8ff;
    font: 13px/1.4 "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
}
.fab {
    position: fixed; right: 18px; bottom: 18px; width: 46px; height: 46px;
    border-radius: 14px; border: 1px solid var(--panel-border);
    background: var(--bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    color: var(--text); display: grid; place-items: center; cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    transition: transform .15s ease, opacity .2s ease, border-color .2s ease;
}
.fab:hover { transform: translateY(-2px); border-color: rgba(139, 124, 255, 0.6); }
.fab.hidden { opacity: 0; pointer-events: none; transform: translateY(8px); }
.fab svg { width: 22px; height: 22px; }
.fab .dot {
    position: absolute; top: 9px; right: 9px; width: 7px; height: 7px; border-radius: 50%;
    background: #3ddc84; box-shadow: 0 0 8px #3ddc84;
}
.fab .dot.off { background: #6b7080; box-shadow: none; }
.panel {
    position: fixed; top: 16px; right: 16px; width: 360px; max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px); display: flex; flex-direction: column;
    background: var(--bg); backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2);
    border: 1px solid var(--panel-border); border-radius: 18px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    opacity: 0; transform: translateX(16px) scale(0.98); pointer-events: none;
    transition: opacity .18s ease, transform .18s ease;
}
.panel.open { opacity: 1; transform: none; pointer-events: auto; }
.head {
    display: flex; align-items: center; gap: 12px; padding: 16px 16px 14px;
    border-bottom: 1px solid var(--faint);
}
.logo {
    width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: 0 4px 14px rgba(139, 124, 255, 0.45);
}
.logo svg { width: 20px; height: 20px; color: #fff; }
.titles { flex: 1; min-width: 0; }
.title { font-size: 15px; font-weight: 650; letter-spacing: .2px; }
.sub { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
    width: 30px; height: 30px; border-radius: 9px; border: none; background: transparent;
    color: var(--muted); display: grid; place-items: center; cursor: pointer; flex: none;
}
.icon-btn:hover { background: var(--faint); color: var(--text); }
.icon-btn svg { width: 16px; height: 16px; }
.body { overflow-y: auto; padding: 6px 16px 16px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
.section-title {
    margin: 14px 0 10px; font-size: 11px; font-weight: 650; letter-spacing: .9px;
    text-transform: uppercase; color: var(--muted);
}
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card {
    position: relative; aspect-ratio: 16 / 10; border-radius: 12px; overflow: hidden; cursor: pointer;
    border: 1px solid var(--panel-border); background: #1b1e28; padding: 0; color: inherit; font: inherit;
    transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.card:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.22); }
.card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.card .name {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 9px 7px; text-align: left;
    font-size: 12px; font-weight: 600; background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
}
.card.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), 0 6px 20px rgba(139, 124, 255, 0.35); }
.card .check {
    position: absolute; top: 7px; right: 7px; width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); display: none; place-items: center;
}
.card.active .check { display: grid; }
.card .check svg { width: 12px; height: 12px; color: #fff; }
.card .spin {
    position: absolute; inset: 0; display: none; place-items: center; background: rgba(0, 0, 0, 0.45);
}
.card.loading .spin { display: grid; }
.spinner {
    width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.25);
    border-top-color: #fff; animation: rot .8s linear infinite;
}
@keyframes rot { to { transform: rotate(360deg); } }
.card.upload {
    display: grid; place-items: center; background: transparent; border-style: dashed;
    border-color: rgba(255, 255, 255, 0.18); color: var(--muted);
}
.card.upload:hover { color: var(--text); border-color: var(--accent); }
.card.upload .u { display: grid; justify-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
.card.upload svg { width: 22px; height: 22px; }
.row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--faint);
}
.row:last-child { border-bottom: none; }
.row.disabled { opacity: .4; pointer-events: none; }
.label { display: grid; }
.label small { color: var(--muted); font-size: 11.5px; }
.val { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; min-width: 38px; text-align: right; }
.slider-row { display: grid; gap: 7px; padding: 10px 0; border-bottom: 1px solid var(--faint); }
.slider-row.disabled { opacity: .4; pointer-events: none; }
.slider-top { display: flex; justify-content: space-between; align-items: center; }
input[type=range] {
    -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; margin: 0; cursor: pointer;
}
input[type=range]::-webkit-slider-runnable-track {
    height: 5px; border-radius: 5px;
    background: linear-gradient(90deg, var(--accent) 0 var(--p, 50%), rgba(255,255,255,.12) var(--p, 50%) 100%);
}
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; margin-top: -5.5px;
    background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.5);
}
input[type=range]::-moz-range-track { height: 5px; border-radius: 5px; background: rgba(255,255,255,.12); }
input[type=range]::-moz-range-progress { height: 5px; border-radius: 5px; background: var(--accent); }
input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border: none; border-radius: 50%; background: #fff; }
.switch { position: relative; width: 38px; height: 22px; flex: none; cursor: pointer; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.switch .track {
    position: absolute; inset: 0; border-radius: 22px; background: rgba(255, 255, 255, 0.14);
    transition: background .18s ease;
}
.switch .track::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
    background: #fff; transition: transform .18s ease; box-shadow: 0 1px 4px rgba(0,0,0,.4);
}
.switch input:checked + .track { background: var(--accent); }
.switch input:checked + .track::after { transform: translateX(16px); }
.seg { display: inline-flex; background: rgba(255,255,255,.07); border-radius: 9px; padding: 3px; gap: 2px; }
.seg button {
    border: none; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600;
    padding: 5px 10px; border-radius: 7px; cursor: pointer;
}
.seg button:hover { color: var(--text); }
.seg button.on { background: var(--accent); color: #fff; }
.chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--faint); }
.chip {
    border: 1px solid var(--panel-border); background: rgba(255,255,255,.04); color: var(--muted);
    font: inherit; font-size: 11.5px; font-weight: 600; padding: 7px 4px; border-radius: 9px; cursor: pointer;
    display: grid; justify-items: center; gap: 3px;
}
.chip svg { width: 16px; height: 16px; }
.chip:hover { color: var(--text); }
.chip.on { background: rgba(139, 124, 255, 0.18); border-color: rgba(139, 124, 255, 0.55); color: var(--text); }
.btn {
    border: 1px solid var(--panel-border); background: rgba(255,255,255,.06); color: var(--text);
    font: inherit; font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 9px; cursor: pointer;
}
.btn:hover { background: rgba(255,255,255,.1); }
.btn.wide { width: 100%; margin-top: 12px; }
.btn.listening { border-color: var(--accent); color: var(--accent); }
.foot {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 16px; border-top: 1px solid var(--faint); color: var(--muted); font-size: 12px;
}
.toast {
    position: absolute; left: 16px; right: 16px; bottom: 58px; padding: 9px 12px; border-radius: 10px;
    background: rgba(255, 92, 92, 0.16); border: 1px solid rgba(255, 92, 92, 0.4); color: #ffd1d1; font-size: 12px;
    opacity: 0; transform: translateY(6px); transition: opacity .2s ease, transform .2s ease; pointer-events: none;
}
.toast.ok { background: rgba(61, 220, 132, 0.14); border-color: rgba(61, 220, 132, 0.4); color: #c9f7dc; }
.toast.show { opacity: 1; transform: none; }
.empty { color: var(--muted); font-size: 12px; padding: 10px 0; grid-column: 1 / -1; }
`;

    const ICONS = {
        sky: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
        sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
        moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
        stars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z"/></svg>',
        clouds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.5 11a4 4 0 0 1-3 8z"/></svg>',
        reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
    };

    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (k === "class") el.className = v;
            else if (k === "html") el.innerHTML = v;
            else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v);
        }
        for (const c of children.flat()) {
            if (c == null || c === false) continue;
            el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return el;
    }

    const host = h("div", { id: "skyapi-gui" });
    host.style.cssText = "position:fixed;inset:auto;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(h("style", {}, css));
    const root = h("div", { class: "root" });
    shadow.appendChild(root);

    for (const type of ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "dblclick",
        "wheel", "pointerdown", "pointerup", "contextmenu", "touchstart", "touchend"]) {
        host.addEventListener(type, (e) => e.stopPropagation());
    }

    const fabDot = h("span", { class: "dot" });
    const fab = h("button", { class: "fab", title: "Sky settings", html: ICONS.sky, onclick: () => open() });
    fab.appendChild(fabDot);

    const sub = h("div", { class: "sub" }, "Loading…");
    const powerInput = h("input", { type: "checkbox" });
    powerInput.addEventListener("change", () => setEnabled(powerInput.checked));
    const power = h("label", { class: "switch", title: "Custom sky on/off" }, powerInput, h("span", { class: "track" }));

    const head = h("div", { class: "head" },
        h("div", { class: "logo", html: ICONS.sky }),
        h("div", { class: "titles" }, h("div", { class: "title" }, "Sky"), sub),
        power,
        h("button", { class: "icon-btn", title: "Close", html: ICONS.close, onclick: () => close() })
    );

    const grid = h("div", { class: "grid" }, h("div", { class: "empty" }, "Loading skies…"));
    const settings = h("div", {});
    const body = h("div", { class: "body" },
        h("div", { class: "section-title" }, "Skies"), grid,
        h("div", { class: "section-title" }, "Settings"), settings
    );

    const keyBtn = h("button", { class: "btn", onclick: () => startRebind() }, KEY_NAMES[state.key] || state.key);
    const foot = h("div", { class: "foot" }, h("span", {}, "Menu key"), keyBtn);
    const toast = h("div", { class: "toast" });
    const panel = h("div", { class: "panel" }, head, body, foot, toast);
    root.append(fab, panel);

    let toastTimer = 0;
    function notify(msg, ok) {
        toast.textContent = msg;
        toast.classList.toggle("ok", !!ok);
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
    }

    function opts() {
        return api ? api.skyboxOptions : Object.assign({ brightness: 1, rotation: 0, rotationSpeed: 0, dayNight: true, nightBrightness: 0.25, blend: "always" }, state.overrides);
    }

    function setOverride(key, value) {
        state.overrides[key] = value;
        save();
        if (api && state.enabled) api.setSkyboxOptions({ [key]: value });
    }

    function slider({ label, key, min, max, step, fmt, disabled }) {
        const value = Number(opts()[key]);
        const out = h("span", { class: "val" }, fmt(value));
        const input = h("input", { type: "range", min, max, step, value });
        const paint = () => input.style.setProperty("--p", ((input.value - min) / (max - min)) * 100 + "%");
        paint();
        input.addEventListener("input", () => {
            const v = Number(input.value);
            out.textContent = fmt(v);
            paint();
            setOverride(key, v);
        });
        return h("div", { class: "slider-row" + (disabled ? " disabled" : "") },
            h("div", { class: "slider-top" }, h("span", {}, label), out), input);
    }

    function toggleRow({ label, hint, checked, onChange, disabled }) {
        const input = h("input", { type: "checkbox" });
        input.checked = !!checked;
        input.addEventListener("change", () => onChange(input.checked));
        return h("div", { class: "row" + (disabled ? " disabled" : "") },
            h("div", { class: "label" }, h("span", {}, label), hint ? h("small", {}, hint) : null),
            h("label", { class: "switch" }, input, h("span", { class: "track" })));
    }

    function renderSettings() {
        const o = opts();
        const off = !state.enabled;
        settings.innerHTML = "";

        const quality = h("div", { class: "seg" },
            [512, 1024, 2048].map((s) => h("button", {
                class: state.size === s ? "on" : "",
                onclick: () => {
                    state.size = s;
                    save();
                    renderSettings();
                    if (state.enabled && !customActive) applyPreset(state.preset);
                }
            }, s === 2048 ? "High" : s === 1024 ? "Medium" : "Low")));

        const mode = h("div", { class: "seg" },
            [["always", "Always"], ["night", "Night only"]].map(([v, t]) => h("button", {
                class: (o.blend || "always") === v ? "on" : "",
                onclick: () => { setOverride("blend", v); renderSettings(); }
            }, t)));

        const chip = (key, label, icon) => h("button", {
            class: "chip" + (o[key] ? " on" : ""),
            title: (o[key] ? "Show " : "Hide ") + label.toLowerCase(),
            html: icon,
            onclick: () => { setOverride(key, !opts()[key]); renderSettings(); }
        }, label);

        const presetFog = currentPack && currentPack.options && currentPack.options.fogColor;

        settings.append(
            h("div", { class: "row" + (off ? " disabled" : "") },
                h("div", { class: "label" }, h("span", {}, "Quality"), h("small", {}, "Lower it if the game lags")), quality),
            h("div", { class: "row" + (off ? " disabled" : "") },
                h("div", { class: "label" }, h("span", {}, "Show sky")), mode),
            slider({ label: "Brightness", key: "brightness", min: 0.2, max: 2, step: 0.05, fmt: (v) => Math.round(v * 100) + "%", disabled: off }),
            slider({ label: "Rotation", key: "rotation", min: 0, max: 360, step: 1, fmt: (v) => Math.round(v) + "°", disabled: off }),
            slider({ label: "Spin speed", key: "rotationSpeed", min: 0, max: 10, step: 0.1, fmt: (v) => v.toFixed(1) + "°/s", disabled: off }),
            toggleRow({
                label: "Dim at night", hint: "Follows the game's day/night cycle", checked: o.dayNight, disabled: off,
                onChange: (v) => { setOverride("dayNight", v); renderSettings(); }
            }),
            slider({ label: "Night brightness", key: "nightBrightness", min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%", disabled: off || !o.dayNight }),
            toggleRow({
                label: "Match fog to sky", hint: "Distant terrain fades into the sky color", checked: !!o.fogColor, disabled: off || !presetFog,
                onChange: (v) => {
                    if (v) {
                        delete state.overrides.fogColor;
                        save();
                        if (api) api.setSkyboxOptions({ fogColor: presetFog });
                    } else {
                        setOverride("fogColor", null);
                    }
                }
            }),
            h("div", { class: "section-title" }, "Hide"),
            h("div", { class: "chips" + (off ? " disabled" : "") },
                chip("hideSun", "Sun", ICONS.sun), chip("hideMoon", "Moon", ICONS.moon),
                chip("hideStars", "Stars", ICONS.stars), chip("hideClouds", "Clouds", ICONS.clouds)),
            h("button", {
                class: "btn wide",
                html: '<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center"><span style="width:14px;height:14px;display:inline-grid">' + ICONS.reset + "</span>Reset settings</span>",
                onclick: resetSettings
            })
        );
        if (off) settings.querySelector(".chips").style.cssText = "opacity:.4;pointer-events:none";
    }

    function renderGrid() {
        grid.innerHTML = "";
        if (!presets.length) {
            grid.appendChild(h("div", { class: "empty" }, api ? "Couldn't load the sky list." : "Loading skies…"));
        }
        for (const p of presets) {
            const active = state.enabled && !customActive && state.preset === p.id;
            const img = h("img", { src: p.preview, alt: "", loading: "lazy", draggable: "false" });
            const card = h("button", {
                class: "card" + (active ? " active" : "") + (loadingId === p.id ? " loading" : ""),
                title: p.name,
                onclick: () => applyPreset(p.id)
            }, img, h("span", { class: "name" }, p.name),
                h("span", { class: "check", html: ICONS.check }),
                h("span", { class: "spin" }, h("span", { class: "spinner" })));
            grid.appendChild(card);
        }
        grid.appendChild(h("button", {
            class: "card upload" + (customActive && state.enabled ? " active" : "") + (loadingId === "__custom" ? " loading" : ""),
            title: "Use your own images (1 panorama or 6 cube faces)",
            onclick: uploadCustom
        }, h("span", { class: "u", html: ICONS.upload + "<span>Upload your own</span>" }),
            h("span", { class: "check", html: ICONS.check }),
            h("span", { class: "spin" }, h("span", { class: "spinner" }))));
    }

    function renderHead() {
        powerInput.checked = state.enabled;
        fabDot.classList.toggle("off", !state.enabled);
        if (!api) sub.textContent = "Loading…";
        else if (!state.enabled) sub.textContent = "Off · default sky";
        else if (customActive) sub.textContent = "Custom sky";
        else {
            const p = presets.find((x) => x.id === state.preset);
            sub.textContent = p ? p.name : state.preset;
        }
    }

    function render() {
        renderHead();
        renderGrid();
        renderSettings();
    }

    async function applyPreset(id) {
        if (!api || loadingId) return;
        loadingId = id;
        renderGrid();
        try {
            currentPack = await api.loadPreset(id, { size: state.size, options: state.overrides });
            state.preset = id;
            state.enabled = true;
            customActive = false;
            save();
        } catch (e) {
            notify("Couldn't load that sky: " + (e && e.message ? e.message : e));
        } finally {
            loadingId = null;
            render();
        }
    }

    async function uploadCustom() {
        if (!api || loadingId) return;
        loadingId = "__custom";
        renderGrid();
        try {
            await api.pickSkyboxFiles(Object.assign({
                fogColor: null, hideSun: false, hideMoon: false, hideStars: false, hideClouds: false,
                dayNight: true, nightBrightness: 0.25, blend: "always", brightness: 1, rotationSpeed: 0
            }, state.overrides));
            customActive = true;
            currentPack = null;
            state.enabled = true;
            save();
            notify("Custom sky applied", true);
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            if (msg !== "No files picked") notify(msg);
        } finally {
            loadingId = null;
            render();
        }
    }

    function setEnabled(on) {
        if (!api) return;
        if (on) {
            applyPreset(state.preset || "black");
        } else {
            api.removeSkybox();
            customActive = false;
            state.enabled = false;
            save();
            render();
        }
    }

    function resetSettings() {
        state.overrides = {};
        save();
        if (api && state.enabled && !customActive) applyPreset(state.preset);
        else render();
    }

    function startRebind() {
        rebinding = true;
        keyBtn.textContent = "Press a key…";
        keyBtn.classList.add("listening");
    }

    function open() {
        isOpen = true;
        panel.classList.add("open");
        fab.classList.add("hidden");
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        render();
    }

    function close() {
        isOpen = false;
        panel.classList.remove("open");
        rebinding = false;
        keyBtn.classList.remove("listening");
        keyBtn.textContent = KEY_NAMES[state.key] || state.key;
        updateFab();
    }

    function updateFab() {
        fab.classList.toggle("hidden", isOpen || !!document.pointerLockElement);
    }

    window.addEventListener("keydown", (e) => {
        if (rebinding) {
            e.preventDefault();
            e.stopPropagation();
            if (e.code !== "Escape") state.key = e.code;
            rebinding = false;
            keyBtn.classList.remove("listening");
            keyBtn.textContent = KEY_NAMES[state.key] || state.key;
            save();
            return;
        }
        if (e.code !== state.key || e.repeat) return;
        const t = document.activeElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        isOpen ? close() : open();
    }, true);

    document.addEventListener("pointerlockchange", updateFab);

    const mount = () => (document.body || document.documentElement).appendChild(host);
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
    updateFab();
    render();

    window.SkyGUI = { open, close, toggle: () => (isOpen ? close() : open()), state };

    (async () => {
        while (!(getGame() && getGame().gameScene && getGame().gameScene.sky)) await sleep(500);
        if (!(window.SkyAPI && window.SkyAPI.loadPreset)) {
            const code = await fetch(BASE + "installation.js", { cache: "no-cache" }).then((r) => r.text());
            (0, eval)(code + ";window.SkyAPI = SkyAPI;");
        }
        api = window.SkyAPI;
        try {
            presets = await api.listPresets();
        } catch (e) {
            notify("Couldn't load the sky list");
        }
        render();
        if (state.enabled) applyPreset(state.preset || "black");
    })().catch((e) => {
        sub.textContent = "Failed to load";
        notify(String(e && e.message ? e.message : e));
    });
})();
