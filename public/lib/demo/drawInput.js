import * as THREE from 'three';

/**
 * Freehand pointer input over a stage.
 *
 * Captures pointer events on the canvas, converts them to world coordinates through
 * the stage's extents, and keeps the drawn points. A new press replaces the previous
 * drawing. Points closer than `minDistance` to the last one are dropped, so slow
 * movement does not pile up duplicates.
 */
export class DrawInput {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {StrokeStage} stage
     * @param {object}   opts
     * @param {number}   [opts.minDistance]
     * @param {function} opts.onChange  Called with (points, done) on every change.
     */
    constructor(canvas, stage, { minDistance = 0.008, onChange }) {
        this.points = [];
        this._drawing = false;
        // Mutable, so a demo can tune how far the pen must travel before a new
        // point is recorded.
        this.minDistance = minDistance;
        // Off while something else drives the drawing, such as a replay.
        this.enabled = true;

        const toWorld = event => {
            const rect = canvas.getBoundingClientRect();
            const nx = (event.clientX - rect.left) / rect.width * 2 - 1;
            const ny = 1 - (event.clientY - rect.top) / rect.height * 2;
            const p = new THREE.Vector3(nx * stage.extentX, ny * stage.extentY, 0);
            // Pen pressure rides on the point. A mouse reports a constant while
            // pressed, so it records zero and pressure effects leave it alone.
            p.pressure = event.pointerType === 'pen' ? event.pressure : 0;
            return p;
        };

        canvas.addEventListener('pointerdown', event => {
            if (!this.enabled) return;
            this._drawing = true;
            this.points = [toWorld(event)];
            onChange(this.points, false);
            // Capturing an inactive pointer throws (a synthetic event's id is not
            // an active pointer), and the reset above must not depend on it.
            try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
        });
        canvas.addEventListener('pointermove', event => {
            if (!this._drawing) return;
            const p = toWorld(event);
            if (this.points.length === 0
                || p.distanceTo(this.points[this.points.length - 1]) >= this.minDistance) {
                this.points.push(p);
                onChange(this.points, false);
            }
        });
        const stop = () => {
            if (!this._drawing) return;
            this._drawing = false;
            onChange(this.points, true);
        };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
    }

    /** Replaces the drawing programmatically, for a starting line. */
    set(points) {
        this.points = points;
    }
}
