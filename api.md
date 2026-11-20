# MiniBlox Atmospheric Sky API

The Atmospheric Sky API provides access to Miniblox's atmospheric sky renderer, allowing developers to modify the sky shader, colors, uniforms, and create custom visual effects at runtime.

> **Note:** This API currently only supports **Atmospheric Sky = ON** <img width="895" height="62" alt="image" src="https://github.com/user-attachments/assets/43b093bd-c0e3-4373-aeab-2a572605d982" />


---

## In-Game Menu (easiest)

Open miniblox.io, press **Ctrl+Shift+J** to open the console, and paste:

```js
fetch("https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/gui.js").then(r => r.text()).then(eval);
```

- Press **Right Shift** (or click the sky button in the bottom-right corner while your mouse is free) to open the menu.
- Click a sky to apply it, or **Upload your own** (1 panorama or 6 cube faces).
- The switch at the top turns the custom sky on and off.
- Settings: quality, always / night only, brightness, rotation, spin speed, dim at night, night brightness, match fog, and hide sun / moon / stars / clouds.
- Your sky and settings are saved and come back automatically next time you load the menu.
- Change the menu key at the bottom of the menu.

### Load it automatically (Tampermonkey)

Install the Tampermonkey extension, create a new script, and paste:

```js
// ==UserScript==
// @name         Miniblox Sky
// @match        https://miniblox.io/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
fetch("https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/gui.js").then(r => r.text()).then(eval);
```

The menu also exposes `SkyGUI.open()`, `SkyGUI.close()` and `SkyGUI.toggle()`.

---

## Getting Started

Open miniblox.io, press **F12** (or **Ctrl+Shift+J**) to open the console, and paste:

```js
fetch("https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/installation.js").then(r => r.text()).then(eval);
```

After loading the [API](https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/refs/heads/main/installation.js), a global `SkyAPI` object becomes available. Running the loader again is safe; it reuses the loaded API.

```js
console.log(SkyAPI);
```

---

## Structure

The API exposes the following objects:

```js
SkyAPI.game
SkyAPI.atmosphere
SkyAPI.material
SkyAPI.uniforms
SkyAPI.shader
```

### `SkyAPI.game`

The current MiniBlox game instance.

```js
const game = SkyAPI.game;
```

---

### `SkyAPI.atmosphere`

The Three.js mesh responsible for rendering the atmospheric sky.

```js
console.log(SkyAPI.atmosphere);
```

---

### `SkyAPI.material`

The ShaderMaterial used by the atmospheric sky.

```js
console.log(SkyAPI.material);
```

---

### `SkyAPI.uniforms`

Returns the shader uniforms.

```js
console.log(SkyAPI.uniforms);
```

Current uniforms:

- `horizonColor`
- `zenithColor`
- `sunGlowColor`
- `sunDirection`
- `dayFactor`
- `horizonDip`

---

## Sky Colors

### `SkyAPI.setZenith(r, g, b)`

Sets the zenith (top) sky color.

```js
SkyAPI.setZenith(1, 0, 0);
```

---

### `SkyAPI.setHorizon(r, g, b)`

Sets the horizon color.

```js
SkyAPI.setHorizon(0.2, 0.4, 1);
```

---

### `SkyAPI.setSunGlow(r, g, b)`

Changes the sun glow color.

```js
SkyAPI.setSunGlow(1, 0.8, 0.3);
```

---

## Lighting

### `SkyAPI.setDayFactor(value)`

Changes the day/night interpolation.

Typical values:

- `1` = Day
- `0` = Night

```js
SkyAPI.setDayFactor(0);
```

---

### `SkyAPI.setSunDirection(x, y, z)`

Changes the sun direction.

```js
SkyAPI.setSunDirection(0, 1, 0);
```

---

### `SkyAPI.setHorizonDip(value)`

Moves the horizon lower or higher.

```js
SkyAPI.setHorizonDip(0.15);
```

---

## Shader Editing

### `SkyAPI.shader`

Returns the current ShaderMaterial.

```js
const shader = SkyAPI.shader;
```

---

### `SkyAPI.replaceFragmentShader(source)`

Replaces the fragment shader.

```js
SkyAPI.replaceFragmentShader(`
varying vec3 vDir;

void main() {
    gl_FragColor = vec4(1.0,0.0,1.0,1.0);
}
`);
```

---

### `SkyAPI.replaceVertexShader(source)`

Replaces the vertex shader.

```js
SkyAPI.replaceVertexShader(`
varying vec3 vDir;

void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}
`);
```

---

### `SkyAPI.patchFragment(find, replace)`

Replaces part of the fragment shader without replacing the whole shader.

```js
SkyAPI.patchFragment(
    "gl_FragColor = vec4(color, 1.0);",
    `
    color = vec3(1.0,0.0,0.0);
    gl_FragColor = vec4(color,1.0);
    `
);
```

---

### `SkyAPI.patchVertex(find, replace)`

Replaces part of the vertex shader.

```js
SkyAPI.patchVertex(
    "vDir = position;",
    "vDir = normalize(position);"
);
```

---

## Sky Presets

Ready-made skies live in the [`skies/`](skies) folder and load with one line.

```js
await SkyAPI.loadPreset("black");
```

| Preset | Look |
|--------|------|
| `black` | Black & white night, giant moon, mountain silhouettes |
| `red` | Blood-red night, red moon, rocky desert |
| `antarctica` | Endless snow plain, icy blue sky |
| `tokyo-dark` | Neon city skyline at night |
| `tokyo-light` | Pastel city skyline |
| `midnight` | Deep blue starry sky |
| `moonrise` | Blue-hour sky with a rising moon |
| `anime-night` | Purple anime-style night, bright moon |

### `SkyAPI.listPresets()`

Returns every preset with its name and a preview image URL.

```js
const presets = await SkyAPI.listPresets();
// [{ id: "black", name: "Black", preview: "https://..." }, ...]
```

### `SkyAPI.loadPreset(id, settings?)`

Loads a preset. Each preset brings its own options (fog color, hidden sun/moon, etc.).

| Setting | Description |
|---------|-------------|
| `size` | Max face size in pixels. Presets are 2048px; use `1024` or `512` on weaker devices |
| `options` | Override any skybox option, e.g. `{ rotationSpeed: 1 }` |

```js
await SkyAPI.loadPreset("tokyo-dark", { size: 1024 });
await SkyAPI.loadPreset("antarctica", { options: { hideClouds: true } });
```

### `SkyAPI.loadSkyPack(url, settings?)`

Loads a sky pack from any folder URL (must allow CORS, e.g. GitHub raw).

```js
await SkyAPI.loadSkyPack("https://raw.githubusercontent.com/you/your-repo/main/my-sky/");
```

### `SkyAPI.currentPreset`

The id (or URL) of the loaded preset, or `null`.

---

## Sky Pack Format

A sky pack is a folder with a `sky.json` and its images:

```
my-sky/
  sky.json
  px.webp  nx.webp  py.webp  ny.webp  pz.webp  nz.webp
  preview.webp
```

```json
{
  "name": "My Sky",
  "type": "cube",
  "faces": ["px.webp", "nx.webp", "py.webp", "ny.webp", "pz.webp", "nz.webp"],
  "preview": "preview.webp",
  "license": "CC0",
  "options": { "dayNight": false, "hideStars": true, "fogColor": [0.1, 0.1, 0.12] }
}
```

- **Cube:** `"type": "cube"` with six square faces in the order right, left, top, bottom, front, back.
- **Panorama:** `"type": "panorama"` with `"image": "sky.webp"` (a 2:1 360° image).
- `options` takes anything [`setSkyboxOptions`](#skyapisetskyboxoptionsoptions) accepts.
- Recommended face size: 2048px (1024px for lighter packs). WebP keeps downloads small.

---

## Custom Skyboxes

Replace the sky with your own images. The skybox follows the camera, the sun, moon, stars and clouds still render on top, and it dims at night so the day/night cycle still reads. It works with **Atmospheric Sky ON or OFF**.

> Images must come from a host that allows CORS (GitHub raw, imgur and most CDNs do), or be a data URL / local file.

### `SkyAPI.setSkybox(faces, options?)`

Six-face cube skybox. Face order is the same as Three.js `CubeTextureLoader`:
`[px, nx, py, ny, pz, nz]` = `[right, left, top, bottom, front, back]`.
Each face can be a URL, data URL, `File`/`Blob`, `<img>` or `<canvas>`.

```js
await SkyAPI.setSkybox([
    "https://example.com/sky/px.png",
    "https://example.com/sky/nx.png",
    "https://example.com/sky/py.png",
    "https://example.com/sky/ny.png",
    "https://example.com/sky/pz.png",
    "https://example.com/sky/nz.png"
]);

// or with named faces
await SkyAPI.setSkybox({ px, nx, py, ny, pz, nz });
```

---

### `SkyAPI.setPanorama(source, options?)`

A single 360° equirectangular image (2:1, like most HDRI / "360 sky" images).

```js
await SkyAPI.setPanorama("https://example.com/sky_360.jpg");
```

---

### `SkyAPI.pickSkyboxFiles(options?)`

Opens a file picker so you can use images from your computer.
Pick **1 image** for a panorama, or **6 images** for a cube. Files named `px/nx/py/ny/pz/nz`, `right/left/top/bottom/front/back` or `posx/negx/...` are sorted automatically; otherwise they're used in the order picked.

```js
SkyAPI.pickSkyboxFiles();
```

---

### `SkyAPI.setSkyboxOptions(options)`

Change skybox settings at any time. All options can also be passed as the second argument to `setSkybox` / `setPanorama` / `pickSkyboxFiles`.

| Option | Default | Description |
|--------|---------|-------------|
| `rotation` | `0` | Rotation around the vertical axis, in degrees |
| `rotationSpeed` | `0` | Degrees per second (slowly spinning sky) |
| `brightness` | `1` | Brightness multiplier |
| `tint` | `[1, 1, 1]` | RGB color multiplier (0–1) |
| `dayNight` | `true` | Dim the skybox at night |
| `nightBrightness` | `0.25` | Brightness at midnight when `dayNight` is on |
| `blend` | `"always"` | `"always"` replaces the sky; `"night"` keeps the normal sky by day and fades the skybox in at night (great for star/galaxy skyboxes) |
| `hideSun` | `false` | Hide the sun sprite |
| `hideMoon` | `false` | Hide the moon sprite |
| `hideStars` | `false` | Hide the game's stars |
| `hideClouds` | `false` | Hide the clouds |
| `fogColor` | `null` | `[r, g, b]` (0–1) to override fog so distant terrain blends into your skybox |

```js
SkyAPI.setSkyboxOptions({ rotationSpeed: 1, hideStars: true });
SkyAPI.setSkyboxOptions({ blend: "night" });
```

---

### `SkyAPI.removeSkybox()`

Removes the custom skybox and gives the game its normal sky back.

```js
SkyAPI.removeSkybox();
```

---

### `SkyAPI.skybox` / `SkyAPI.skyboxOptions`

The skybox Three.js mesh (or `null` before one is set) and the live options object.

---

### Built-in skybox: Galaxy (`skyboxes/galaxy.js`)

A procedurally generated nebula + Milky Way + star field. No images needed: it's drawn in your browser in under a second. Load `installation.js` first, then [`skyboxes/galaxy.js`](skyboxes/galaxy.js).

```js
SkyboxGalaxy.apply();                                  // default "cosmic" galaxy
SkyboxGalaxy.apply({ seed: 42 });                      // a different galaxy
SkyboxGalaxy.apply({ hue: "warm" });                   // "cosmic" | "warm" | "ice" | "toxic"
SkyboxGalaxy.apply({ nebula: 1.5, stars: 2 });         // stronger clouds, more stars
SkyboxGalaxy.apply({}, { blend: "night" });            // galaxy only at night
SkyboxGalaxy.apply({}, { rotationSpeed: 0.5 });        // slowly turning sky

const faces = SkyboxGalaxy.generate({ seed: 7, size: 2048 });
SkyboxGalaxy.download(faces);                          // save px.png ... nz.png
```

---

## Uniforms

> **Note:** the game recomputes these uniforms every frame (from the time of day, weather and altitude), so values you set with `setZenith`, `setDayFactor`, etc. only last one frame unless you set them again each frame. Shader edits (`replaceFragmentShader`, `patchFragment`, ...) do persist.

Uniforms can also be modified directly.

```js
SkyAPI.uniforms.zenithColor.value.setRGB(1, 0, 0);

SkyAPI.uniforms.dayFactor.value = 0;

SkyAPI.material.needsUpdate = true;
```

---

## Example

```js
SkyAPI.setZenith(0.1, 0.25, 0.8);
SkyAPI.setHorizon(1.0, 0.5, 0.2);
SkyAPI.setSunGlow(1.0, 0.9, 0.4);
SkyAPI.setDayFactor(1);
```

---

## Current Features

- ✅ Access atmospheric sky mesh
- ✅ Access ShaderMaterial
- ✅ Read shader source
- ✅ Modify shader uniforms
- ✅ Replace fragment shader
- ✅ Replace vertex shader
- ✅ Patch shaders at runtime
- ✅ Modify sun direction
- ✅ Modify sky colors
- ✅ Custom six-face skyboxes
- ✅ 360° panorama skyboxes
- ✅ Skyboxes work with Atmospheric Sky ON and OFF
- ✅ Sky presets and sky packs

---

## Planned Features

- ⏳ Automatic Atmospheric Sky detection
- ⏳ Legacy Sky support (Atmospheric Sky OFF)
- ⏳ Dynamic fog coloring
- ⏳ Weather API
- ⏳ Cloud API
- ⏳ Aurora rendering
- ⏳ Galaxy rendering
- ⏳ Shader plugin system
- ⏳ Custom star rendering

---

## Compatibility

| Feature | Status |
|---------|--------|
| Atmospheric Sky | ✅ Supported |
| Legacy Sky | ❌ NOT Supported (yet) |

---

## Notes

The Atmospheric Sky API is built directly on top of Miniblox's internal Three.js `ShaderMaterial`, allowing runtime modification of the sky without modifying the game's source code.

Support for the legacy sky renderer (Atmospheric Sky disabled) is planned for a future release.

## Reach Out

Send me a Friend Request and DM on Discord @hackclient, or you can join our community server https://dsc.gg/unverifiedv2

There's still a lot left to discover about Miniblox.io's sky renderer.

If you find something interesting, whether it's support for cubemaps, the legacy (Atmospheric Sky OFF) renderer, hidden shader features, or anything else, feel free to contribute!

Open a pull request, submit an issue, or share your findings with me so they can be added to the API for everyone to use!
