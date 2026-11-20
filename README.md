# Miniblox.io Sky API
A lightweight runtime API for accessing and modifying Miniblox.io's sky shader


## Quick Start

Open miniblox.io, press **Ctrl+Shift+J**, paste this, then press **Right Shift** in game:

```js
fetch("https://raw.githubusercontent.com/lttlgrl/Miniblox.io-Sky-API/main/gui.js").then(r => r.text()).then(eval);
```

See [api.md](api.md) for the full API and auto-loading with Tampermonkey.


## Features
- In-game sky menu: presets, upload your own, on/off switch and settings
- Access the game's sky ShaderMaterial
- Read and modify shader uniforms
- Change sky colors in real time
- Replace or patch the sky shader
- Custom skyboxes: 6-face cube or 360° panorama, from URLs or your own files
- 16 ready-made sky presets: `SkyAPI.loadPreset("black")`
- Built-in procedural galaxy skybox (`skyboxes/galaxy.js`), no images needed
- Foundation for custom skyboxes, auroras, stars, weather effects, etc.


## Sky Credits

Preset skies are built from CC0 HDRIs by [Poly Haven](https://polyhaven.com) and the public-domain [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720). Each preset's `sky.json` lists its source.

Resource-pack skies, credited to their packs and makers:
- **Grunge**: GRUNGE pack
- **Bluey Night**: Dynamic Duo Revamp by kenopacks; Bluey Nightfals pink recolor by Marb, ported by numb, recolored by krystal/mop
- **Lightberry**: Lightberry pack by Ohmqr
- **Dayylt**: Dayylt 2k pack by dqisyruth
- **Overflow Day / Night**: Overflow pack by Yuruze, port by Reqolour
- **Stain**: Stain pack
- **Tokyo V2**: Tokyo pack by Yari


## Attribution

If you use this project in your own Miniblox mod / script, attribution is appreciated:

Created by trust ❤️
