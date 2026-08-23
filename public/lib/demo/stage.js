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

    add(object) { return this.buffer.add(object); }
    remove(object) { return this.buffer.remove(object); }

    setBackground(color) { this.buffer.background.set(color); }

    draw() {
        if (this._pending) return;
        this._pending = true;
        requestAnimationFrame(() => {
            this._pending = false;
            const screen = new THREE.Vector2(this.viewport.pixelWidth, this.viewport.pixelHeight);
            const worldToUv = new THREE.Vector2(
                1 / (2 * this.buffer.extentX), 1 / (2 * this.buffer.extentY)
            );
            this.buffer.scene.traverse(child => {
                const u = child.material?.uniforms;
                if (u?.uScreen) u.uScreen.value.copy(screen);
                if (u?.uWorldToUv) u.uWorldToUv.value.copy(worldToUv);
            });
            this.buffer.render(this.renderer);
            this.buffer.present(this.renderer);
        });
    }
}
