import * as THREE from 'three';
import { CanvasBuffer } from '../CanvasBuffer.js';
import { Viewport } from './viewport.js';

/**
 * The common setup every stroke demo needs: a sized canvas, a renderer, a CanvasBuffer
 * to draw into, and a throttled draw call.
 *
 * Shader-based strokes need the frame's pixel size to turn `gl_FragCoord` into a
 * background lookup, so the stage writes `uScreen` on every material that declares it
 * before each render. A demo never has to remember to do that.
 */
export class StrokeStage {
    constructor(canvas, { fit, background = '#ffffff', samples = 4 } = {}) {
        this.viewport = new Viewport(canvas);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(this.viewport.pixelWidth, this.viewport.pixelHeight, false);
        this.renderer.autoClear = false;

        this.buffer = new CanvasBuffer({
            width: this.viewport.pixelWidth,
            height: this.viewport.pixelHeight,
            background,
            fit,
            samples,
        });

        this._pending = false;
        this._resizeHandlers = [];
        this._preRenders = [];
        // Applied to every stroke mesh on each draw, so rebuilt and live meshes
        // pick the state up without per-demo bookkeeping.
        this.wireframe = false;

        this.viewport.onResize((width, height) => {
            this.renderer.setSize(width, height, false);
            this.buffer.resize(width, height);
            this._resizeHandlers.forEach(fn => fn(width, height));
            this.draw();
        });
    }

    /** Half-height of the visible world region. Demos lay out against this. */
    get extentY() { return this.buffer.extentY; }
    get extentX() { return this.buffer.extentX; }

    onResize(fn) { this._resizeHandlers.push(fn); return this; }

    /** Runs before each frame render: fn(renderer, camera, pixelWidth, pixelHeight). */
    addPreRender(fn) { this._preRenders.push(fn); return this; }

    add(object) { return this.buffer.add(object); }
    remove(object) { return this.buffer.remove(object); }

    setBackground(color) { this.buffer.background.set(color); }

    /**
     * Writes the screen-dependent uniforms every shader stroke declares. The stage
     * does this for its own scene on each draw; anything rendering stroke meshes
     * outside the scene, such as a bake pass, must call it itself, or the mesh
     * samples the background through a 1×1 screen.
     */
    syncScreenUniforms(root) {
        const screen = new THREE.Vector2(this.viewport.pixelWidth, this.viewport.pixelHeight);
        const worldToUv = new THREE.Vector2(
            1 / (2 * this.buffer.extentX), 1 / (2 * this.buffer.extentY)
        );
        root.traverse(child => {
            const u = child.material?.uniforms;
            if (u?.uScreen) u.uScreen.value.copy(screen);
            if (u?.uWorldToUv) u.uWorldToUv.value.copy(worldToUv);
        });
    }

    draw() {
        if (this._pending) return;
        this._pending = true;
        requestAnimationFrame(() => {
            this._pending = false;
            this.syncScreenUniforms(this.buffer.scene);
            this.buffer.scene.traverse(child => {
                if (!child.isMesh) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                // A wire-only mesh is an overlay: always wireframe, visible only
                // while the flag is on.
                if (child.userData.wireOnly) {
                    child.visible = this.wireframe;
                    materials.forEach(m => { if (m) m.wireframe = true; });
                    return;
                }
                if (!(child.userData.stats || child.userData.wire)) return;
                materials.forEach(m => { if (m) m.wireframe = this.wireframe; });
            });
            this._preRenders.forEach(fn => fn(
                this.renderer, this.buffer.camera,
                this.viewport.pixelWidth, this.viewport.pixelHeight
            ));
            this.buffer.render(this.renderer);
            this.buffer.present(this.renderer);
        });
    }
}
