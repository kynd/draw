import * as THREE from 'three';

/**
 * An accumulating canvas for freehand drawing demos.
 *
 * Finished strokes are baked into a render target and shown through a plane in the
 * stage's scene, so the live stroke draws over the accumulation and the scene never
 * re-renders what is already committed.
 *
 * Baking ping-pongs between two targets: the pass reads the current accumulation and
 * writes the composite to the other target. Strokes that sample the background read
 * the same texture they are being composited over, and a texture cannot be read and
 * written in one pass, so the copy is not an optimization but the correctness.
 *
 * Alpha stays opaque throughout. The clear writes alpha one, and every baked material
 * is forced to blend color by alpha while leaving the destination alpha untouched, so
 * no pixel of the accumulation is ever transparent.
 */
export class DrawingBoard {
    constructor(stage, { background = '#f3efe6' } = {}) {
        this.stage = stage;
        this._clearColor = new THREE.Color(background);

        this._targets = [0, 1].map(() => this._makeTarget());
        this._front = 0;

        this.plane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ depthWrite: false })
        );
        this.plane.position.z = 0;
        stage.add(this.plane);

        this._copyPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false })
        );
        this._copyPlane.renderOrder = -1;
        this._clearPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false })
        );
        // Under the copy when both are in one pass, as the resize blit needs.
        this._clearPlane.renderOrder = -2;
        // A two-color gradient fill, for clears that take a spec instead of a color.
        this._gradPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.ShaderMaterial({
                depthTest: false, depthWrite: false,
                uniforms: {
                    uA: { value: new THREE.Color('#ffffff') },
                    uB: { value: new THREE.Color('#000000') },
                    uDir: { value: new THREE.Vector2(1, 0) },
                    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
                    uRadial: { value: 0 },
                },
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    varying vec2 vUv;
                    uniform vec3 uA;
                    uniform vec3 uB;
                    uniform vec2 uDir;
                    uniform vec2 uCenter;
                    uniform float uRadial;
                    void main() {
                        float t = uRadial > 0.5
                            ? length(vUv - uCenter) * 1.3
                            : dot(vUv - 0.5, uDir) + 0.5;
                        gl_FragColor = vec4(mix(uA, uB, clamp(t, 0.0, 1.0)), 1.0);
                    }
                `,
            })
        );
        this._gradPlane.renderOrder = -2;
        this._bakeScene = new THREE.Scene();

        this._fit();
        this.clear(background);
        // The world scale is fixed, so a resize crops or reveals paper: the new
        // target is filled with the clear color, and the old accumulation is drawn
        // back into the world rectangle it covered, pixel for pixel.
        stage.onResize(() => {
            const oldTargets = this._targets;
            const oldTexture = oldTargets[this._front].texture;
            const covered = this._covered;
            this._targets = [0, 1].map(() => this._makeTarget());
            this._front = 0;
            this._fit();

            const renderer = this.stage.renderer;
            const previous = renderer.getRenderTarget();
            const previousAuto = renderer.autoClear;
            renderer.autoClear = false;
            this._copyPlane.material.map = oldTexture;
            this._copyPlane.material.needsUpdate = true;
            this._copyPlane.scale.set(covered.x * 2, covered.y * 2, 1);
            this._bakeScene.clear();
            this._bakeScene.add(this._backgroundPlane());
            this._bakeScene.add(this._copyPlane);
            renderer.setRenderTarget(this._targets[this._front]);
            renderer.clear(true, true, false);
            renderer.render(this._bakeScene, this.stage.buffer.camera);
            renderer.setRenderTarget(previous);
            renderer.autoClear = previousAuto;
            this._bakeScene.clear();

            oldTargets.forEach(t => t.dispose());
            this._fit();
            this._covered = { x: this.stage.extentX, y: this.stage.extentY };
            this.plane.material.map = this.texture;
            this.plane.material.needsUpdate = true;
        });
    }

    _makeTarget() {
        const target = new THREE.WebGLRenderTarget(
            this.stage.viewport.pixelWidth, this.stage.viewport.pixelHeight,
            { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: 4 }
        );
        target.texture.colorSpace = THREE.SRGBColorSpace;
        return target;
    }

    _fit() {
        const camera = this.stage.buffer.camera;
        const w = camera.right - camera.left, h = camera.top - camera.bottom;
        this.plane.scale.set(w, h, 1);
        this._copyPlane.scale.set(w, h, 1);
        this._clearPlane.scale.set(w, h, 1);
        this._gradPlane.scale.set(w, h, 1);
        this._covered = { x: this.stage.extentX, y: this.stage.extentY };
    }

    /** The current accumulation, for strokes that sample the background. */
    get texture() { return this._targets[this._front].texture; }

    /**
     * The quad that paints the current background: the flat plane for a color,
     * the gradient plane for a spec `{ type: 'linear'|'radial', colorA, colorB,
     * angle, center: [x, y] }`. The spec is plain data, so a recorder can store
     * it and a replay reproduce the same fill.
     */
    _backgroundPlane() {
        const spec = this._clearSpec;
        if (typeof spec === 'string' || spec.isColor) {
            this._clearPlane.material.color.set(spec);
            return this._clearPlane;
        }
        const u = this._gradPlane.material.uniforms;
        u.uA.value.set(spec.colorA);
        u.uB.value.set(spec.colorB);
        const angle = spec.angle ?? 0;
        u.uDir.value.set(Math.cos(angle), Math.sin(angle));
        u.uCenter.value.set(spec.center?.[0] ?? 0.5, spec.center?.[1] ?? 0.5);
        u.uRadial.value = spec.type === 'radial' ? 1 : 0;
        return this._gradPlane;
    }

    /**
     * Fills the whole canvas: with one opaque color, or with a two-color gradient
     * when given a spec (see `_backgroundPlane`).
     *
     * The fill is a rendered quad rather than a plain clear: the targets are
     * multisampled, and only a render resolves the multisample buffer into the
     * texture. A bare clear leaves the texture untouched, and it shows black.
     */
    clear(background) {
        this._clearSpec = background;
        this._clearColor.set(typeof background === 'string' || background.isColor
            ? background : background.colorA);
        const renderer = this.stage.renderer;
        const previous = renderer.getRenderTarget();
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;

        this._bakeScene.clear();
        this._bakeScene.add(this._backgroundPlane());
        renderer.setRenderTarget(this._targets[this._front]);
        renderer.setClearColor(this._clearColor, 1);
        renderer.clear(true, true, false);
        renderer.render(this._bakeScene, this.stage.buffer.camera);
        this._bakeScene.clear();

        renderer.setRenderTarget(previous);
        renderer.autoClear = previousAuto;
        this.plane.material.map = this.texture;
        this.plane.material.needsUpdate = true;
    }

    /**
     * Composites the meshes over the accumulation, permanently. The meshes stay
     * untouched in whatever scene they came from; only their materials are switched
     * to destination-preserving alpha blending.
     */
    bake(meshes) {
        const renderer = this.stage.renderer;
        const camera = this.stage.buffer.camera;
        const back = this._targets[1 - this._front];

        this._copyPlane.material.map = this.texture;
        this._copyPlane.material.needsUpdate = true;

        this._bakeScene.clear();
        this._bakeScene.add(this._copyPlane);
        const layered = [];
        meshes.forEach(mesh => {
            // A mesh baked straight from input may never have been through a stage
            // draw, so its screen uniforms are still the defaults.
            this.stage.syncScreenUniforms(mesh);
            mesh.traverse(child => {
                if (child.isMesh && child.userData.coverageLayer) {
                    layered.push(child);
                    return;
                }
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(m => {
                    if (!m || !m.transparent) return;
                    m.blending = THREE.CustomBlending;
                    m.blendEquation = THREE.AddEquation;
                    m.blendSrc = THREE.SrcAlphaFactor;
                    m.blendDst = THREE.OneMinusSrcAlphaFactor;
                    m.blendSrcAlpha = THREE.ZeroFactor;
                    m.blendDstAlpha = THREE.OneFactor;
                });
            });
            this._bakeScene.add(mesh);
        });
        layered.forEach(child => { child.visible = false; });

        const previous = renderer.getRenderTarget();
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(back);
        renderer.clear(true, true, false);
        renderer.render(this._bakeScene, camera);

        // Coverage-layer marks bake one at a time through the shared layer,
        // so their self-overlaps keep single coverage in the bake too.
        layered.forEach(child => {
            child.visible = true;
            this.stage.coverage.draw(renderer, camera, child, back);
        });

        renderer.setRenderTarget(previous);
        renderer.autoClear = previousAuto;

        this._bakeScene.clear();
        this._front = 1 - this._front;
        this.plane.material.map = this.texture;
        this.plane.material.needsUpdate = true;
    }
}
