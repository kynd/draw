import * as THREE from 'three';

/**
 * Single coverage for translucent marks, through an offscreen layer.
 *
 * A translucent mark whose geometry covers a pixel more than once (a bend
 * folding the ribbon over itself) would composite that pixel more than once
 * and darken into creases. The layer removes the question: the mark renders
 * alone into an offscreen target with MAX blending, so any number of coverings
 * leaves the strongest single one, and the target then composites into the
 * canvas exactly once. No thresholds, so there is nothing for a seam to form
 * along.
 *
 * One layer is reused for any number of marks in sequence: clear, render,
 * composite, per mark. Marks opt in with `userData.coverageLayer = true`,
 * which the stage's draw pass and the board's bake both honor.
 */
export class CoverageLayer {
    constructor() {
        this.target = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
        });
        this.target.texture.colorSpace = THREE.SRGBColorSpace;

        this._scene = new THREE.Scene();
        this._compositeScene = new THREE.Scene();
        this._compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const material = new THREE.MeshBasicMaterial({
            map: this.target.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        // Straight alpha over, leaving the destination's alpha untouched, so
        // compositing into an opaque canvas keeps it opaque.
        material.blending = THREE.CustomBlending;
        material.blendEquation = THREE.AddEquation;
        material.blendSrc = THREE.SrcAlphaFactor;
        material.blendDst = THREE.OneMinusSrcAlphaFactor;
        material.blendSrcAlpha = THREE.ZeroFactor;
        material.blendDstAlpha = THREE.OneFactor;
        this._compositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        this._compositeScene.add(this._compositeMesh);
    }

    resize(width, height) {
        if (this.target.width === width && this.target.height === height) return;
        this.target.setSize(width, height);
    }

    /**
     * Draws one mark through the layer into `outputTarget` (null for the
     * default framebuffer). The mark keeps its scene parent and materials;
     * blending and depth flags are swapped for the layer pass and restored.
     */
    draw(renderer, camera, mesh, outputTarget) {
        const previousTarget = renderer.getRenderTarget();
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;

        // The mark alone, with MAX blending: overlaps keep single coverage.
        const parent = mesh.parent;
        this._scene.add(mesh);
        const saved = [];
        mesh.traverse(child => {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(m => {
                if (!m) return;
                saved.push({
                    m,
                    blending: m.blending, blendEquation: m.blendEquation,
                    blendEquationAlpha: m.blendEquationAlpha,
                    blendSrc: m.blendSrc, blendDst: m.blendDst,
                    blendSrcAlpha: m.blendSrcAlpha, blendDstAlpha: m.blendDstAlpha,
                    depthTest: m.depthTest, depthWrite: m.depthWrite,
                });
                m.blending = THREE.CustomBlending;
                m.blendEquation = THREE.MaxEquation;
                m.blendEquationAlpha = THREE.MaxEquation;
                m.blendSrc = THREE.OneFactor;
                m.blendDst = THREE.OneFactor;
                m.blendSrcAlpha = THREE.OneFactor;
                m.blendDstAlpha = THREE.OneFactor;
                m.depthTest = false;
                m.depthWrite = false;
            });
        });

        renderer.setRenderTarget(this.target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.render(this._scene, camera);

        saved.forEach(s => {
            Object.assign(s.m, {
                blending: s.blending, blendEquation: s.blendEquation,
                blendEquationAlpha: s.blendEquationAlpha,
                blendSrc: s.blendSrc, blendDst: s.blendDst,
                blendSrcAlpha: s.blendSrcAlpha, blendDstAlpha: s.blendDstAlpha,
                depthTest: s.depthTest, depthWrite: s.depthWrite,
            });
        });
        if (parent) parent.add(mesh);
        else this._scene.remove(mesh);

        // The layer composites into the output exactly once.
        renderer.setRenderTarget(outputTarget);
        renderer.render(this._compositeScene, this._compositeCamera);

        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAuto;
    }

    dispose() {
        this.target.dispose();
        this._compositeMesh.geometry.dispose();
        this._compositeMesh.material.dispose();
    }
}
