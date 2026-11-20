const SkyAPI = (() => {
    const game = Object.values(document.querySelector("#react"))?.[0]
        ?.updateQueue?.baseState?.element?.props?.game;

    if (!game)
        throw new Error("Miniblox game not found.");

    if (window.SkyAPI && window.SkyAPI.game === game && window.SkyAPI.loadPreset)
        return window.SkyAPI;

    const PRESET_BASE = "https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/skies/";

    const gameScene = game.gameScene;
    const sky = gameScene.sky;
    const atmosphere = sky.atmosphere;
    const material = atmosphere.material;

    const Mesh = atmosphere.constructor;
    const ShaderMaterial = material.constructor;
    const SphereGeometry = atmosphere.geometry.constructor;
    const Vector3 = material.uniforms.sunDirection.value.constructor;
    const Color = material.uniforms.horizonColor.value.constructor;

    let Texture = null;
    gameScene.scene.traverse((o) => {
        if (!Texture && o.material && o.material.map)
            Texture = o.material.map.constructor;
    });

    const LinearFilter = 1006;
    const ClampToEdgeWrapping = 1001;
    const RepeatWrapping = 1000;
    const CustomBlending = 5;
    const AddEquation = 100;
    const SrcAlphaFactor = 204;
    const OneMinusSrcAlphaFactor = 205;
    const BackSide = 1;

    const skyboxVertex = `
varying vec3 vDir;

void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

    const skyboxFragment = `
uniform sampler2D facePX;
uniform sampler2D faceNX;
uniform sampler2D facePY;
uniform sampler2D faceNY;
uniform sampler2D facePZ;
uniform sampler2D faceNZ;
uniform sampler2D panorama;
uniform float mode;
uniform float rotation;
uniform float brightness;
uniform vec3 tint;
uniform float opacity;
varying vec3 vDir;

vec3 sampleCube(vec3 d) {
    d.x = -d.x;
    vec3 a = abs(d);
    vec2 uv;

    if (a.x >= a.y && a.x >= a.z) {
        if (d.x > 0.0) {
            uv = vec2(-d.z, -d.y) / a.x;
            uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
            return texture2D(facePX, uv).rgb;
        }
        uv = vec2(d.z, -d.y) / a.x;
        uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        return texture2D(faceNX, uv).rgb;
    }

    if (a.y >= a.z) {
        if (d.y > 0.0) {
            uv = vec2(d.x, d.z) / a.y;
            uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
            return texture2D(facePY, uv).rgb;
        }
        uv = vec2(d.x, -d.z) / a.y;
        uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        return texture2D(faceNY, uv).rgb;
    }

    if (d.z > 0.0) {
        uv = vec2(d.x, -d.y) / a.z;
        uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        return texture2D(facePZ, uv).rgb;
    }
    uv = vec2(-d.x, -d.y) / a.z;
    uv = uv * 0.5 + 0.5; uv.y = 1.0 - uv.y;
    return texture2D(faceNZ, uv).rgb;
}

vec3 samplePanorama(vec3 d) {
    float u = atan(d.z, d.x) * 0.15915494 + 0.5;
    float v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    return texture2D(panorama, vec2(u, v)).rgb;
}

void main() {
    vec3 d = normalize(vDir);

    float c = cos(rotation);
    float s = sin(rotation);
    d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);

    vec3 color = mode < 0.5 ? sampleCube(d) : samplePanorama(d);
    gl_FragColor = vec4(color * tint * brightness, opacity);
}
`;

    const blankTexture = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        return makeTexture(canvas, false);
    };

    function makeTexture(image, repeatX) {
        const tex = new Texture(image);
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = repeatX ? RepeatWrapping : ClampToEdgeWrapping;
        tex.wrapT = ClampToEdgeWrapping;
        tex.needsUpdate = true;
        return tex;
    }

    function loadImage(source) {
        if (source instanceof HTMLCanvasElement ||
            (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap))
            return Promise.resolve(source);

        if (source instanceof HTMLImageElement && source.complete)
            return Promise.resolve(source);

        return new Promise((resolve, reject) => {
            let url = source;
            let revoke = false;

            if (source instanceof Blob) {
                url = URL.createObjectURL(source);
                revoke = true;
            } else if (source instanceof HTMLImageElement) {
                url = source.src;
            }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                if (revoke) URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                if (revoke) URL.revokeObjectURL(url);
                reject(new Error(
                    "Could not load skybox image: " + String(source).slice(0, 120) +
                    " (the host must allow CORS, or use a data URL / local file)"
                ));
            };
            img.src = url;
        });
    }

    function downscale(img, maxSize) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!maxSize || (w <= maxSize && h <= maxSize)) return img;
        const k = maxSize / Math.max(w, h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    const skyboxUniforms = {
        facePX: { value: null },
        faceNX: { value: null },
        facePY: { value: null },
        faceNY: { value: null },
        facePZ: { value: null },
        faceNZ: { value: null },
        panorama: { value: null },
        mode: { value: 0 },
        rotation: { value: 0 },
        brightness: { value: 1 },
        tint: { value: new Color(1, 1, 1) },
        opacity: { value: 1 }
    };

    let skybox = null;
    let skyboxTextures = [];
    let originalUpdate = null;
    let lastFrame = performance.now();
    let currentPreset = null;

    const defaultOptions = {
        rotation: 0,
        rotationSpeed: 0,
        brightness: 1,
        tint: [1, 1, 1],
        dayNight: true,
        nightBrightness: 0.25,
        blend: "always",
        hideSun: false,
        hideMoon: false,
        hideStars: false,
        hideClouds: false,
        fogColor: null
    };

    const skyboxOptions = Object.assign({}, defaultOptions);

    function ensureSkyboxMesh() {
        if (skybox) return skybox;
        if (!Texture)
            throw new Error("SkyAPI: couldn't find Three.js Texture. Join a world first, then load the API.");

        const blank = blankTexture();
        for (const key of ["facePX", "faceNX", "facePY", "faceNY", "facePZ", "faceNZ", "panorama"])
            skyboxUniforms[key].value = blank;

        const mat = new ShaderMaterial({
            uniforms: skyboxUniforms,
            vertexShader: skyboxVertex,
            fragmentShader: skyboxFragment,
            side: BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: false
        });
        mat.blending = CustomBlending;
        mat.blendEquation = AddEquation;
        mat.blendSrc = SrcAlphaFactor;
        mat.blendDst = OneMinusSrcAlphaFactor;

        skybox = new Mesh(new SphereGeometry(4900, 32, 16), mat);
        skybox.name = "SkyAPI.skybox";
        skybox.renderOrder = -0.5;
        skybox.frustumCulled = false;
        skybox.visible = false;
        gameScene.ambientMeshes.add(skybox);
        return skybox;
    }

    function dayFactor() {
        const sun = sky.sun;
        const f = sun.offset.y / sun.sunDist * 2 + 0.5;
        return Math.min(1, Math.max(0, f));
    }

    const camPos = new Vector3();

    function applySkybox() {
        const now = performance.now();
        const dt = Math.min(0.25, (now - lastFrame) / 1000);
        lastFrame = now;

        const o = skyboxOptions;
        const day = dayFactor();

        o.rotation = (o.rotation + o.rotationSpeed * dt) % 360;

        let brightness = o.brightness;
        if (o.dayNight)
            brightness *= o.nightBrightness + (1 - o.nightBrightness) * day;

        skyboxUniforms.rotation.value = o.rotation * Math.PI / 180;
        skyboxUniforms.brightness.value = brightness;
        skyboxUniforms.tint.value.setRGB(o.tint[0], o.tint[1], o.tint[2]);

        if (o.blend === "night") {
            skyboxUniforms.opacity.value = 1 - day;
        } else {
            skyboxUniforms.opacity.value = 1;
            atmosphere.visible = false;
            gameScene.scene.background = null;
        }

        gameScene.camera.getWorldPosition(camPos);
        skybox.position.copy(camPos);
        skybox.visible = true;

        if (o.hideSun && sky.sun.sun) sky.sun.sun.visible = false;
        if (o.hideMoon && sky.sun.moon) sky.sun.moon.visible = false;
        if (o.hideStars && gameScene.stars?.stars) gameScene.stars.stars.visible = false;
        if (o.hideClouds && gameScene.clouds?.mesh) gameScene.clouds.mesh.visible = false;
        if (o.fogColor) {
            if (sky.color && sky.color.setRGB) sky.color.setRGB(o.fogColor[0], o.fogColor[1], o.fogColor[2]);
            if (gameScene.scene.fog) gameScene.scene.fog.color.setRGB(o.fogColor[0], o.fogColor[1], o.fogColor[2]);
        }
    }

    function hookSkyUpdate() {
        if (originalUpdate) return;
        originalUpdate = sky.update;
        sky.update = function () {
            const result = originalUpdate.apply(this, arguments);
            try {
                applySkybox();
            } catch (err) {
                console.error("[SkyAPI] skybox update failed:", err);
            }
            return result;
        };
    }

    function unhookSkyUpdate() {
        if (!originalUpdate) return;
        if (Object.prototype.hasOwnProperty.call(sky, "update")) delete sky.update;
        if (sky.update !== originalUpdate) sky.update = originalUpdate;
        originalUpdate = null;
    }

    function restoreHidden() {
        if (sky.sun.sun) sky.sun.sun.visible = true;
        if (sky.sun.moon) sky.sun.moon.visible = true;
        if (gameScene.stars?.stars) gameScene.stars.stars.visible = true;
        if (gameScene.clouds?.mesh) gameScene.clouds.mesh.visible = true;
    }

    function disposeTextures() {
        for (const t of skyboxTextures) t.dispose();
        skyboxTextures = [];
    }

    function setOptions(options) {
        if (!options) return;
        const hadHidden = skyboxOptions.hideSun || skyboxOptions.hideMoon ||
            skyboxOptions.hideStars || skyboxOptions.hideClouds;
        Object.assign(skyboxOptions, options);
        if (options.tint && !Array.isArray(options.tint))
            skyboxOptions.tint = [options.tint.r, options.tint.g, options.tint.b];
        if (hadHidden) restoreHidden();
    }

    function resetOptions(options) {
        const rotation = skyboxOptions.rotation;
        Object.assign(skyboxOptions, defaultOptions, { rotation });
        restoreHidden();
        setOptions(options);
    }

    async function applyCube(images, options) {
        ensureSkyboxMesh();
        disposeTextures();
        skyboxTextures = images.map((img) => makeTexture(img, false));
        ["facePX", "faceNX", "facePY", "faceNY", "facePZ", "faceNZ"]
            .forEach((key, i) => (skyboxUniforms[key].value = skyboxTextures[i]));
        skyboxUniforms.mode.value = 0;
        setOptions(options);
        hookSkyUpdate();
    }

    async function applyPanorama(img, options) {
        ensureSkyboxMesh();
        disposeTextures();
        const tex = makeTexture(img, true);
        skyboxTextures = [tex];
        skyboxUniforms.panorama.value = tex;
        skyboxUniforms.mode.value = 1;
        setOptions(options);
        hookSkyUpdate();
    }

    async function loadPack(baseUrl, settings = {}) {
        if (!baseUrl.endsWith("/")) baseUrl += "/";
        const res = await fetch(baseUrl + "sky.json", { cache: "no-cache" });
        if (!res.ok) throw new Error("SkyAPI: no sky.json at " + baseUrl);
        const pack = await res.json();
        const maxSize = settings.size || 0;
        const options = Object.assign({}, pack.options, settings.options);

        if (pack.type === "panorama" || pack.type === "equirect") {
            const img = downscale(await loadImage(baseUrl + pack.image), maxSize * 4);
            resetOptions();
            await applyPanorama(img, options);
        } else {
            const names = pack.faces || ["px", "nx", "py", "ny", "pz", "nz"].map((f) => f + ".webp");
            const images = await Promise.all(names.map((n) => loadImage(baseUrl + n)));
            resetOptions();
            await applyCube(images.map((img) => downscale(img, maxSize)), options);
        }

        return pack;
    }

    return {
        game,
        atmosphere,
        material,
        uniforms: material.uniforms,
        presetBase: PRESET_BASE,

        get shader() {
            return material;
        },

        setZenith(r, g, b) {
            material.uniforms.zenithColor.value.setRGB(r, g, b);
        },

        setHorizon(r, g, b) {
            material.uniforms.horizonColor.value.setRGB(r, g, b);
        },

        setSunGlow(r, g, b) {
            material.uniforms.sunGlowColor.value.setRGB(r, g, b);
        },

        setDayFactor(value) {
            material.uniforms.dayFactor.value = value;
        },

        setHorizonDip(value) {
            material.uniforms.horizonDip.value = value;
        },

        setSunDirection(x, y, z) {
            material.uniforms.sunDirection.value.set(x, y, z);
        },

        replaceFragmentShader(source) {
            material.fragmentShader = source;
            material.needsUpdate = true;
        },

        replaceVertexShader(source) {
            material.vertexShader = source;
            material.needsUpdate = true;
        },

        patchFragment(find, replace) {
            material.fragmentShader =
                material.fragmentShader.replace(find, replace);

            material.needsUpdate = true;
        },

        patchVertex(find, replace) {
            material.vertexShader =
                material.vertexShader.replace(find, replace);

            material.needsUpdate = true;
        },

        async setSkybox(faces, options) {
            if (!Array.isArray(faces))
                faces = [faces.px, faces.nx, faces.py, faces.ny, faces.pz, faces.nz];
            if (faces.length !== 6 || faces.some((f) => !f))
                throw new Error("setSkybox needs 6 faces: [px, nx, py, ny, pz, nz]");

            const images = await Promise.all(faces.map(loadImage));
            currentPreset = null;
            await applyCube(images, options);
        },

        async setPanorama(source, options) {
            const img = await loadImage(source);
            currentPreset = null;
            await applyPanorama(img, options);
        },

        pickSkyboxFiles(options) {
            return new Promise((resolve, reject) => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.multiple = true;
                input.onchange = async () => {
                    try {
                        const files = [...input.files];
                        if (files.length === 1) {
                            await this.setPanorama(files[0], options);
                        } else if (files.length === 6) {
                            const order = [
                                ["px", "right", "posx", "rt"], ["nx", "left", "negx", "lf"],
                                ["py", "top", "up", "posy"], ["ny", "bottom", "down", "negy", "dn"],
                                ["pz", "front", "posz", "ft"], ["nz", "back", "negz", "bk"]
                            ];
                            const name = (f) => f.name.toLowerCase().replace(/\.[^.]+$/, "");
                            const matched = order.map((names) =>
                                files.find((f) => names.some((n) =>
                                    new RegExp("(^|[^a-z])" + n + "($|[^a-z])").test(name(f)))));
                            const faces = matched.every(Boolean) &&
                                new Set(matched).size === 6 ? matched : files;
                            await this.setSkybox(faces, options);
                        } else {
                            throw new Error("Pick 1 panorama image or 6 cube faces (got " + files.length + ")");
                        }
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                input.click();
            });
        },

        async listPresets() {
            const res = await fetch(PRESET_BASE + "index.json", { cache: "no-cache" });
            if (!res.ok) throw new Error("SkyAPI: couldn't load the preset list");
            const list = await res.json();
            return list.map((p) => Object.assign({}, p, { preview: PRESET_BASE + p.preview }));
        },

        async loadPreset(id, settings) {
            const pack = await loadPack(PRESET_BASE + id + "/", settings);
            currentPreset = id;
            return pack;
        },

        async loadSkyPack(url, settings) {
            const pack = await loadPack(url, settings);
            currentPreset = url;
            return pack;
        },

        get currentPreset() {
            return currentPreset;
        },

        setSkyboxOptions(options) {
            setOptions(options);
        },

        get skyboxOptions() {
            return skyboxOptions;
        },

        get skybox() {
            return skybox;
        },

        removeSkybox() {
            unhookSkyUpdate();
            if (skybox) skybox.visible = false;
            disposeTextures();
            restoreHidden();
            currentPreset = null;
        }
    };
})();

window.SkyAPI = SkyAPI;
