import * as THREE from 'three';
import { CanvasBuffer, PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { CoverageLayer } from './coverageLayer.js';
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

        // Fixed scale by default: the world maps to CSS pixels at PIXELS_PER_UNIT,
        // so a resize crops or reveals paper instead of rescaling the drawing. A
        // demo that instead wants a region kept visible at any size passes `fit`.
        this.buffer = new CanvasBuffer({
            width: this.viewport.pixelWidth,
            height: this.viewport.pixelHeight,
            viewWidth: this.viewport.width,
            viewHeight: this.viewport.height,
            background,
            fit,
            ppu: fit ? null : PIXELS_PER_UNIT,
            samples,
        });

        this._pending = false;
        this._resizeHandlers = [];
        this._preRenders = [];
        // Shared by the draw pass and the board's bake, for marks flagged
        // `userData.coverageLayer`.
        this.coverage = new CoverageLayer();
        this.coverage.resize(this.viewport.pixelWidth, this.viewport.pixelHeight);
        // Applied to every stroke mesh on each draw, so rebuilt and live meshes
        // pick the state up without per-demo bookkeeping.
        this.wireframe = false;

        this.viewport.onResize((width, height) => {
            this.renderer.setSize(width, height, false);
            this.buffer.resize(width, height, this.viewport.width, this.viewport.height);
            this.coverage.resize(width, height);
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

            // Three phases: the scene without layered marks and overlays, then
            // each `coverageLayer` mark through the shared layer (so its
            // self-overlaps keep single coverage), then the overlays
            // (`userData.overlay`) on top.
            const layered = [];
            const overlays = [];
            this.buffer.scene.children.forEach(child => {
                if (!child.visible) return;
                if (child.userData.overlay) overlays.push(child);
                else if (child.isMesh && child.userData.coverageLayer && !child.userData.wireOnly) {
                    layered.push(child);
                } else {
                    child.traverse(c => {
                        if (c.visible && c.isMesh && c.userData.coverageLayer && !c.userData.wireOnly) {
                            layered.push(c);
                        }
                    });
                }
            });

            layered.forEach(m => { m.visible = false; });
            overlays.forEach(o => { o.visible = false; });
            this.buffer.render(this.renderer);
            layered.forEach(m => { m.visible = true; });
            overlays.forEach(o => { o.visible = true; });

            if (layered.length) {
                layered.sort((a, b) => a.getWorldPosition(_wp).z - b.getWorldPosition(_wq).z
                    || 0);
                layered.forEach(mesh => {
                    this.coverage.draw(this.renderer, this.buffer.camera, mesh, this.buffer.target);
                });
            }

            if (overlays.length) {
                const hidden = [];
                this.buffer.scene.children.forEach(child => {
                    if (child.visible && !overlays.includes(child)) {
                        child.visible = false;
                        hidden.push(child);
                    }
                });
                const previousTarget = this.renderer.getRenderTarget();
                this.renderer.setRenderTarget(this.buffer.target);
                this.renderer.render(this.buffer.scene, this.buffer.camera);
                this.renderer.setRenderTarget(previousTarget);
                hidden.forEach(child => { child.visible = true; });
            }

            this.buffer.present(this.renderer);
        });
    }
}

const _wp = new THREE.Vector3();
const _wq = new THREE.Vector3();
