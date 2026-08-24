import * as THREE from 'three';

const BLUR_SHADER = {
    vertex: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragment: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform vec2 uDirection;
        void main() {
            vec4 sum = texture2D(uMap, vUv) * 0.227027;
            vec2 off1 = uDirection * 1.3846153846;
            vec2 off2 = uDirection * 3.2307692308;
            sum += texture2D(uMap, vUv + off1) * 0.3162162162;
            sum += texture2D(uMap, vUv - off1) * 0.3162162162;
            sum += texture2D(uMap, vUv + off2) * 0.0702702703;
            sum += texture2D(uMap, vUv - off2) * 0.0702702703;
            gl_FragColor = sum;
        }
    `,
};

/**
 * A blurred silhouette of one or more strokes, presented as a tinted plane.
 *
 * The strokes are rendered into a private low-resolution target and blurred there, so
 * the halo is smooth by construction. Expanding the stroke's own geometry outward was
 * tried first and folds wherever the reach exceeds the curvature radius, which every
 * soft shadow on a wavy path does.
 *
 * Offset and dark beneath a stroke the plane is a drop shadow; wide and bright around
 * one, a glow.
 */
export class StrokeHalo {
    /**
     * @param {object} opts
     * @param {string}  [opts.color]
     * @param {number}  [opts.opacity]
     * @param {number}  [opts.blur]        Blur passes at the target's resolution.
     * @param {number}  [opts.downsample]  Target resolution divisor. Downsampling is
     *                                     most of the blur's width, at a quarter of
     *                                     the cost per doubling.
     * @param {boolean} [opts.additive]
     */
    constructor({ color = '#000000', opacity = 0.5, blur = 3, downsample = 4, additive = false } = {}) {
        this.opacity = opacity;
        this.blur = blur;
        this.downsample = downsample;

        this.scene = new THREE.Scene();
        this._width = 0;
        this._height = 0;
        this._targets = [null, null];

        this._blurScene = new THREE.Scene();
        this._blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._blurMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: null },
                uDirection: { value: new THREE.Vector2(0, 0) },
            },
            vertexShader: BLUR_SHADER.vertex,
            fragmentShader: BLUR_SHADER.fragment,
            depthTest: false,
            depthWrite: false,
        });
        this._blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blurMaterial));

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: null },
                    uColor: { value: new THREE.Color(color) },
                    uOpacity: { value: opacity },
                },
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D uMap;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    void main() {
                        float a = texture2D(uMap, vUv).a * uOpacity;
                        if (a <= 0.002) discard;
                        gl_FragColor = vec4(uColor, a);
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            })
        );
    }

    setColor(color) { this.mesh.material.uniforms.uColor.value.set(color); }
    setOpacity(opacity) { this.mesh.material.uniforms.uOpacity.value = opacity; }

    /** Replaces the silhouette sources. The meshes' own colors do not matter. */
    setSource(meshes) {
        [...this.scene.children].forEach(child => this.scene.remove(child));
        meshes.forEach(m => this.scene.add(m));
    }

    _resize(width, height) {
        const w = Math.max(2, Math.round(width / this.downsample));
        const h = Math.max(2, Math.round(height / this.downsample));
        if (w === this._width && h === this._height) return;
        this._width = w;
        this._height = h;
        this._targets.forEach(t => t?.dispose());
        this._targets = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
        }));
    }

    /**
     * Renders and blurs the silhouette. Call before the frame that uses `mesh`,
     * with the same camera the strokes are drawn with.
     */
    update(renderer, camera, pixelWidth, pixelHeight) {
        this._resize(pixelWidth, pixelHeight);
        const [a, b] = this._targets;
        const previous = renderer.getRenderTarget();
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;

        renderer.setRenderTarget(a);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.render(this.scene, camera);

        for (let i = 0; i < this.blur; i++) {
            this._blurMaterial.uniforms.uMap.value = a.texture;
            this._blurMaterial.uniforms.uDirection.value.set((i + 1) / this._width, 0);
            renderer.setRenderTarget(b);
            renderer.clear(true, false, false);
            renderer.render(this._blurScene, this._blurCamera);

            this._blurMaterial.uniforms.uMap.value = b.texture;
            this._blurMaterial.uniforms.uDirection.value.set(0, (i + 1) / this._height);
            renderer.setRenderTarget(a);
            renderer.clear(true, false, false);
            renderer.render(this._blurScene, this._blurCamera);
        }

        this.mesh.material.uniforms.uMap.value = a.texture;
        // The plane covers exactly what the camera sees, so texel and world align.
        this.mesh.scale.set(camera.right - camera.left, camera.top - camera.bottom, 1);

        renderer.setRenderTarget(previous);
        renderer.autoClear = previousAuto;
    }

    dispose() {
        this._targets.forEach(t => t?.dispose());
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this._blurMaterial.dispose();
    }
}
