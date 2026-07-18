const SkyAPI = (() => {
    const game = Object.values(document.querySelector("#react"))?.[0]
        ?.updateQueue?.baseState?.element?.props?.game;

    if (!game)
        throw new Error("Miniblox game not found.");

    const atmosphere = game.gameScene.sky.atmosphere;
    const material = atmosphere.material;

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
        }
    };
})();
