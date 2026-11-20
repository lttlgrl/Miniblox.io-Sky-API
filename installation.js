const SkyAPI = (() => {
    const game = Object.values(document.querySelector("#react"))?.[0]
        ?.updateQueue?.baseState?.element?.props?.game;

    if (!game)
        throw new Error("Miniblox game not found.");

    const gameScene = game.gameScene;
    const sky = gameScene.sky;
    const atmosphere = sky.atmosphere;
    const material = atmosphere.material;

    // ------------------------------------------------------------------
    // Three.js classes, borrowed from objects the game already created
    // (Miniblox bundles Three.js, so there is no global THREE).
    // ------------------------------------------------------------------
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

    // Three.js constants (stable across versions)
    const LinearFilter = 1006;
    const ClampToEdgeWrapping = 1001;
    const RepeatWrapping = 1000;
    const CustomBlending = 5;
    const AddEquation = 100;
    const SrcAlphaFactor = 204;
    const OneMinusSrcAlphaFactor = 205;
    const BackSide = 1;

    // ------------------------------------------------------------------
    // Skybox shader. Supports a six-face cube ("cube") or a single
    // equirectangular panorama ("equirect").
    // Face order matches Three.js CubeTextureLoader:
    //   [px, nx, py, ny, pz, nz] = [right, left, top, bottom, front, back]
    // ------------------------------------------------------------------
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
uniform float mode;        // 0 = cube, 1 = equirect
uniform float rotation;    // radians around the Y axis
uniform float brightness;  // final brightness multiplier
uniform vec3 tint;
uniform float opacity;
varying vec3 vDir;

vec3 sampleCube(vec3 d) {
    // Mirror X so faces line up the same way as Three.js scene.background.
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

    // Accepts a URL, data URL, File/Blob, <img>, <canvas>, ImageBitmap.
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

    let skybox = null;          // the Mesh, created on first use
    let skyboxTextures = [];
    let originalUpdate = null;  // sky.update before we wrapped it
    let lastFrame = performance.now();

    const skyboxOptions = {
        rotation: 0,            // degrees
        rotationSpeed: 0,       // degrees per second
        brightness: 1,
        tint: [1, 1, 1],
        dayNight: true,         // dim the skybox at night
        nightBrightness: 0.25,  // brightness at midnight when dayNight is on
        blend: "always",        // "always" | "night" (fade in at night only)
        hideSun: false,
        hideMoon: false,
        hideStars: false,
        hideClouds: false,
        fogColor: null          // [r, g, b] 0-1 to override fog color, or null
    };

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
        // Alpha blending while staying in the opaque render list,
        // so the skybox is still drawn before the world.
        mat.blending = CustomBlending;
        mat.blendEquation = AddEquation;
        mat.blendSrc = SrcAlphaFactor;
        mat.blendDst = OneMinusSrcAlphaFactor;

        skybox = new Mesh(new SphereGeometry(4900, 32, 16), mat);
        skybox.name = "SkyAPI.skybox";
        skybox.renderOrder = -0.5;    // right after the game's atmosphere (-1)
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

    // Runs every frame, right after the game's own sky.update().
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
            // Leave the game's sky as-is and fade the skybox in as night falls.
            skyboxUniforms.opacity.value = 1 - day;
        } else {
            // Replace the game's sky completely.
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
        if (o.fogColor && gameScene.scene.fog)
            gameScene.scene.fog.color.setRGB(o.fogColor[0], o.fogColor[1], o.fogColor[2]);
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
        // Remove our instance override so the prototype method runs again.
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
        if (hadHidden) restoreHidden(); // re-applied next frame if still hidden
    }

    return {
        game,
        atmosphere,
        material,
        uniforms: material.uniforms,

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

        // --------------------------------------------------------------
        // Custom skyboxes
        // --------------------------------------------------------------

        /**
         * Six-face skybox. faces = [right, left, top, bottom, front, back]
         * (px, nx, py, ny, pz, nz) or an object with those keys.
         * Each face can be a URL, data URL, File/Blob, <img> or <canvas>.
         */
        async setSkybox(faces, options) {
            if (!Array.isArray(faces))
                faces = [faces.px, faces.nx, faces.py, faces.ny, faces.pz, faces.nz];
            if (faces.length !== 6 || faces.some((f) => !f))
                throw new Error("setSkybox needs 6 faces: [px, nx, py, ny, pz, nz]");

            const images = await Promise.all(faces.map(loadImage));
            ensureSkyboxMesh();
            disposeTextures();
            skyboxTextures = images.map((img) => makeTexture(img, false));

            ["facePX", "faceNX", "facePY", "faceNY", "facePZ", "faceNZ"]
                .forEach((key, i) => (skyboxUniforms[key].value = skyboxTextures[i]));
            skyboxUniforms.mode.value = 0;

            setOptions(options);
            hookSkyUpdate();
        },

        /**
         * Single equirectangular (360° panorama, 2:1) image.
         */
        async setPanorama(source, options) {
            const img = await loadImage(source);
            ensureSkyboxMesh();
            disposeTextures();
            const tex = makeTexture(img, true);
            skyboxTextures = [tex];

            skyboxUniforms.panorama.value = tex;
            skyboxUniforms.mode.value = 1;

            setOptions(options);
            hookSkyUpdate();
        },

        /**
         * Opens a file picker. Choose 1 image for a panorama,
         * or 6 images for a cube (named px/nx/py/ny/pz/nz,
         * right/left/top/bottom/front/back, or picked in that order).
         */
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
                                ["px", "right", "posx"], ["nx", "left", "negx"],
                                ["py", "top", "up", "posy"], ["ny", "bottom", "down", "negy"],
                                ["pz", "front", "posz"], ["nz", "back", "negz"]
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

        /** Change skybox settings at any time, e.g. { rotationSpeed: 2 }. */
        setSkyboxOptions(options) {
            setOptions(options);
        },

        get skyboxOptions() {
            return skyboxOptions;
        },

        get skybox() {
            return skybox;
        },

        /** Remove the custom skybox and give the game its normal sky back. */
        removeSkybox() {
            unhookSkyUpdate();
            if (skybox) skybox.visible = false;
            disposeTextures();
            restoreHidden();
        }
    };
})();
