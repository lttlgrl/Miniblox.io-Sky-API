const SkyboxGalaxy = (() => {
    const PALETTES = {
        cosmic: [[0.38, 0.10, 0.55], [0.10, 0.22, 0.62], [0.05, 0.45, 0.50], [0.65, 0.15, 0.42]],
        warm:   [[0.65, 0.20, 0.15], [0.55, 0.12, 0.40], [0.70, 0.45, 0.15], [0.30, 0.08, 0.35]],
        ice:    [[0.10, 0.30, 0.60], [0.15, 0.55, 0.65], [0.35, 0.35, 0.70], [0.05, 0.20, 0.40]],
        toxic:  [[0.10, 0.50, 0.20], [0.30, 0.60, 0.10], [0.05, 0.35, 0.40], [0.40, 0.15, 0.50]]
    };

    function makeNoise(seed) {
        const perm = new Uint8Array(512);
        let s = (seed * 2654435761) >>> 0 || 1;
        const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        const p = [...Array(256).keys()];
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
        const vals = new Float32Array(256).map(() => rand());

        const fade = (t) => t * t * (3 - 2 * t);
        const lerp = (a, b, t) => a + (b - a) * t;
        const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];

        function noise(x, y, z) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
            return lerp(
                lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u),
                     lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
                lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u),
                     lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
                w);
        }

        function fbm(x, y, z, octaves) {
            let sum = 0, amp = 0.5, f = 1;
            for (let i = 0; i < octaves; i++) {
                sum += amp * noise(x * f, y * f, z * f);
                f *= 2.03;
                amp *= 0.5;
            }
            return sum;
        }

        return { noise, fbm };
    }

    const FACE_DIRS = [
        (sc, tc) => [-1, -tc, -sc],
        (sc, tc) => [1, -tc, sc],
        (sc, tc) => [-sc, 1, tc],
        (sc, tc) => [-sc, -1, -tc],
        (sc, tc) => [-sc, -tc, 1],
        (sc, tc) => [sc, -tc, -1]
    ];

    function generate(options = {}) {
        const size = options.size || 1024;
        const seed = options.seed ?? 1;
        const palette = PALETTES[options.hue] || options.palette || PALETTES.cosmic;
        const nebulaStrength = options.nebula ?? 1;
        const starDensity = options.stars ?? 1;
        const lowRes = Math.max(64, size >> 2);

        const { fbm } = makeNoise(seed);
        let bs = seed * 97 + 13;
        const brand = () => ((bs = (bs * 1664525 + 1013904223) >>> 0) / 4294967296);
        let bn = [brand() - 0.5, 1.2, brand() - 0.5];
        const bl = Math.hypot(...bn);
        bn = bn.map((v) => v / bl);

        const faces = [];

        for (let f = 0; f < 6; f++) {
            const neb = document.createElement("canvas");
            neb.width = neb.height = lowRes;
            const nctx = neb.getContext("2d");
            const nimg = nctx.createImageData(lowRes, lowRes);

            for (let y = 0; y < lowRes; y++) {
                for (let x = 0; x < lowRes; x++) {
                    const sc = ((x + 0.5) / lowRes) * 2 - 1;
                    const tc = ((y + 0.5) / lowRes) * 2 - 1;
                    let [dx, dy, dz] = FACE_DIRS[f](sc, tc);
                    const l = Math.hypot(dx, dy, dz);
                    dx /= l; dy /= l; dz /= l;

                    const n1 = fbm(dx * 2.2 + 10, dy * 2.2, dz * 2.2, 5);
                    const n2 = fbm(dx * 1.3, dy * 1.3 + 20, dz * 1.3, 3);
                    let cloud = Math.max(0, n1 - 0.42) * 2.6;
                    cloud = cloud * cloud * nebulaStrength;

                    const bd = dx * bn[0] + dy * bn[1] + dz * bn[2];
                    const band = Math.exp(-(bd * bd) / 0.02);
                    const dust = fbm(dx * 6, dy * 6 + 5, dz * 6, 4);
                    const bandGlow = band * (0.35 + 0.65 * fbm(dx * 3, dy * 3, dz * 3 + 7, 4)) *
                        (1 - Math.max(0, dust - 0.45) * 2.2);

                    const ci = Math.min(2.999, Math.max(0, (n2 - 0.25) * 6));
                    const i0 = Math.floor(ci), t = ci - i0;
                    const c0 = palette[i0], c1 = palette[(i0 + 1) % palette.length];

                    let r = 0.008 + 0.012 * (1 - Math.abs(dy));
                    let g = 0.008 + 0.010 * (1 - Math.abs(dy));
                    let b = 0.025 + 0.025 * (1 - Math.abs(dy));
                    r += (c0[0] + (c1[0] - c0[0]) * t) * cloud + bandGlow * 0.32;
                    g += (c0[1] + (c1[1] - c0[1]) * t) * cloud + bandGlow * 0.28;
                    b += (c0[2] + (c1[2] - c0[2]) * t) * cloud + bandGlow * 0.38;

                    const i = (y * lowRes + x) * 4;
                    nimg.data[i] = Math.min(255, r * 255);
                    nimg.data[i + 1] = Math.min(255, g * 255);
                    nimg.data[i + 2] = Math.min(255, b * 255);
                    nimg.data[i + 3] = 255;
                }
            }
            nctx.putImageData(nimg, 0, 0);

            const face = document.createElement("canvas");
            face.width = face.height = size;
            const ctx = face.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(neb, 0, 0, size, size);
            faces.push(face);
        }

        const ctxs = faces.map((c) => {
            const x = c.getContext("2d");
            x.globalCompositeOperation = "lighter";
            return x;
        });
        const k = size / 1024;
        const layers = [
            { count: 14000, radius: 1.1, alpha: 0.55 },
            { count: 3000,  radius: 1.8, alpha: 0.8 },
            { count: 350,   radius: 2.8, alpha: 1.0, halo: true }
        ];

        for (const L of layers) {
            const count = Math.round(L.count * starDensity);
            let drawn = 0, guard = 0;
            while (drawn < count && guard++ < count * 6) {
                const z = brand() * 2 - 1;
                const a = brand() * Math.PI * 2;
                const rr = Math.sqrt(1 - z * z);
                const w = [rr * Math.cos(a), z, rr * Math.sin(a)];

                const bd = w[0] * bn[0] + w[1] * bn[1] + w[2] * bn[2];
                if (brand() > 0.35 + 0.65 * Math.exp(-(bd * bd) / 0.03)) continue;
                drawn++;

                const bright = 0.35 + 0.65 * brand() ** 2;
                const temp = brand();
                const col = temp < 0.25 ? "190,215,255" : temp > 0.85 ? "255,210,150" : "255,255,255";
                const radius = L.radius * k * (0.7 + 0.6 * brand());

                const gx = -w[0], gy = w[1], gz = w[2];
                const proj = [
                    [gx, -gz, -gy], [-gx, gz, -gy],
                    [gy, gx, gz], [-gy, gx, -gz],
                    [gz, gx, -gy], [-gz, -gx, -gy]
                ];
                for (let f = 0; f < 6; f++) {
                    const [ma, sc, tc] = proj[f];
                    if (ma <= 0.3) continue;
                    const x = (sc / ma + 1) / 2 * size;
                    const y = (tc / ma + 1) / 2 * size;
                    const m = radius * 6;
                    if (x < -m || y < -m || x > size + m || y > size + m) continue;

                    const c = ctxs[f];
                    const outer = L.halo ? radius * 5 : radius * 2;
                    const grad = c.createRadialGradient(x, y, 0, x, y, outer);
                    grad.addColorStop(0, `rgba(${col},${L.alpha * bright})`);
                    grad.addColorStop(L.halo ? 0.12 : 0.4, `rgba(${col},${L.alpha * bright * 0.6})`);
                    if (L.halo) grad.addColorStop(0.35, `rgba(${col},${0.12 * bright})`);
                    grad.addColorStop(1, `rgba(${col},0)`);
                    c.fillStyle = grad;
                    c.fillRect(x - outer, y - outer, outer * 2, outer * 2);
                }
            }
        }

        return faces;
    }

    return {
        palettes: Object.keys(PALETTES),

        generate,

        async apply(genOptions = {}, skyOptions = {}) {
            if (typeof SkyAPI === "undefined")
                throw new Error("Load installation.js (SkyAPI) first.");
            const faces = generate(genOptions);
            await SkyAPI.setSkybox(faces, Object.assign({ dayNight: false, hideStars: true }, skyOptions));
            return faces;
        },

        download(faces) {
            ["px", "nx", "py", "ny", "pz", "nz"].forEach((name, i) => {
                const a = document.createElement("a");
                a.download = name + ".png";
                a.href = faces[i].toDataURL("image/png");
                a.click();
            });
        }
    };
})();

window.SkyboxGalaxy = SkyboxGalaxy;
