# MiniBlox Atmospheric Sky API

The Atmospheric Sky API provides access to Miniblox's atmospheric sky renderer, allowing developers to modify the sky shader, colors, uniforms, and create custom visual effects at runtime.

> **Note:** This API currently only supports **Atmospheric Sky = ON** <img width="895" height="62" alt="image" src="https://github.com/user-attachments/assets/43b093bd-c0e3-4373-aeab-2a572605d982" />


---

## Getting Started

After loading the API, a global `SkyAPI` object becomes available.

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

## Uniforms

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

---

## Planned Features

- ⏳ Custom six-face skyboxes
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

The Atmospheric Sky API is built directly on top of MiniBlox's internal Three.js `ShaderMaterial`, allowing runtime modification of the sky without modifying the game's source code.

Support for the legacy sky renderer (Atmospheric Sky disabled) is planned for a future release.

## Reach Out

Send me a DM on Discord @trustisover, or you can join our community server https://dsc.gg/unverifiedv2

There's still a lot left to discover about Miniblox.io's sky renderer.

If you find something interesting, whether it's support for cubemaps, the legacy (Atmospheric Sky OFF) renderer, hidden shader features, or anything else—feel free to contribute!

Open a pull request, submit an issue, or share your findings with me so they can be added to the API for everyone to use!
