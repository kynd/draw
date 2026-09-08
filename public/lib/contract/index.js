// The packaging layer: the drawing engine, the live view, and the player
// behind a minimal interface, for embedding in another application. Each
// factory returns a thin wrapper around the tool; only this surface is
// exposed, so the internals stay free to change.
//
// The live view shares the engine's drawing code and applies the engine's
// 'live' events verbatim (they carry resolved outcomes — the tool, values,
// colors, and seeds actually used — so two instances stay identical despite
// the engine's internal randomness). Events and recordings are opaque to the
// host: it stores and transports them without reading the contents.

import { DrawingTool } from '../demo/drawingTool/DrawingTool.js';
import { DrawingToolConfig } from '../demo/drawingTool/DrawingToolConfig.js';

export const ParameterId = {
    COLOR: 'color',
    STROKE_WIDTH: 'strokeWidth',
    TOOL: 'tool',
};

const FORMAT = 'kynd-draw-strokes';
const VERSION = 2;
// Dial values arrive as 0..1 positions; they are read as 0..127 integers
// (one MIDI controller's range) and stepped by the difference, the same
// bucketing the tool's own dials use.
const DIAL_MAX = 127;
const DIAL_STEP = 6;
const WIDTH_MIN = 2;
const WIDTH_MAX = 60;

class ProductionConfig extends DrawingToolConfig {
    constructor() {
        super();
    }
}

/** A view that never draws on its own: no preview, no scatter, no input. */
class ViewConfig extends DrawingToolConfig {
    constructor() {
        super({ preview: false, scatterCount: 0 });
    }
}

function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    return canvas;
}

function envelope(data) {
    return { format: FORMAT, version: VERSION, data };
}

// ---------------------------------------------------------------------------

class DrawingEngineWrapper {
    constructor() {
        this._canvas = null;
        this._tool = null;
        this._listeners = new Set();
        this._buckets = {};
        this._unbind = null;
    }

    /** Adds the canvas to `container`. Later mounts re-append the same
     * canvas, so the drawing survives screen changes. */
    mount(container) {
        if (!this._canvas) this._canvas = makeCanvas();
        container.appendChild(this._canvas);
        if (this._tool) return;
        this._tool = new DrawingTool(this._canvas, new ProductionConfig());
        this._tool.on('live', data => {
            const event = envelope(data);
            this._listeners.forEach(fn => fn(event));
        });
        this._bindPointer();
    }

    _bindPointer() {
        const canvas = this._canvas;
        const toLocal = event => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                pressure: event.pointerType === 'pen' ? event.pressure : 0,
            };
        };
        const down = event => {
            this._tool.pointerDown(toLocal(event));
            try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
        };
        const move = event => this._tool.pointerMove(toLocal(event));
        const up = () => this._tool.pointerUp();
        const cancel = () => this._tool.pointerCancel();
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', cancel);
        this._unbind = () => {
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', cancel);
        };
    }

    clear() { this._tool.clear(); }

    /** `value` is a dial position, 0..1. */
    setParameter(id, value) {
        const v = Math.round(Math.min(Math.max(value, 0), 1) * DIAL_MAX);
        if (id === ParameterId.STROKE_WIDTH) {
            this._tool.setParams({ width: WIDTH_MIN + (v / DIAL_MAX) * (WIDTH_MAX - WIDTH_MIN) });
            return;
        }
        const bucket = Math.round(v / DIAL_STEP);
        const previous = this._buckets[id];
        this._buckets[id] = bucket;
        if (previous === undefined || bucket === previous) return;
        if (id === ParameterId.COLOR) this._tool.stepPalette(bucket - previous);
        else if (id === ParameterId.TOOL) this._tool.stepTool(bucket - previous);
    }

    /** @returns {Promise<Blob>} the drawing as a PNG. */
    exportImage() { return this._tool.snapshot(); }

    /** @returns {Promise<{format, version, data: Blob}>} the recording. */
    async exportRecording() {
        const log = this._tool.getDrawingData();
        return envelope(new Blob([JSON.stringify(log)], { type: 'application/json' }));
    }

    /** Fires on every input the drawing uses. Returns the unsubscribe. */
    onLiveEvent(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    destroy() {
        this._unbind?.();
        this._listeners.clear();
        this._tool?.dispose();
        this._canvas?.remove();
        this._tool = null;
        this._canvas = null;
    }
}

// ---------------------------------------------------------------------------

class DrawingLiveViewWrapper {
    constructor() {
        this._canvas = null;
        this._tool = null;
    }

    mount(container) {
        if (!this._canvas) this._canvas = makeCanvas();
        container.appendChild(this._canvas);
        if (this._tool) return;
        this._tool = new DrawingTool(this._canvas, new ViewConfig());
        this.reset();
    }

    /** Back to a blank page, for the next drawing. */
    reset() {
        this._tool.applyLive({ type: 'clear', background: '#ffffff' });
    }

    /** Applies one engine event; events arrive in the order they fired. */
    apply(event) {
        this._tool.applyLive(event.data);
    }

    destroy() {
        this._tool?.dispose();
        this._canvas?.remove();
        this._tool = null;
        this._canvas = null;
    }
}

// ---------------------------------------------------------------------------

class DrawingPlayerWrapper {
    constructor() {
        this._canvas = null;
        this._tool = null;
        this._loop = false;
        this._speed = 1;
        this._ended = new Set();
    }

    mount(container) {
        if (!this._canvas) this._canvas = makeCanvas();
        container.appendChild(this._canvas);
        if (this._tool) return;
        this._tool = new DrawingTool(this._canvas, new ViewConfig());
        this._tool.applyLive({ type: 'clear', background: '#ffffff' });
        this._tool.player.on('end', () => {
            if (this._loop) {
                this._tool.player.rewind();
                this._tool.player.play({ pointsPerFrame: this._pointsPerFrame() });
                return;
            }
            this._ended.forEach(fn => fn());
        });
    }

    /** Loads a recording, ready to play from the start. */
    async load(recording) {
        const log = JSON.parse(await recording.data.text());
        this._tool.setDrawingData(log);
        this._tool.player.setData(log);
    }

    _pointsPerFrame() {
        return Math.max(1, Math.round(4 * this._speed));
    }

    play({ speed = 1, loop = false } = {}) {
        this._speed = speed;
        this._loop = loop;
        this._tool.player.play({ pointsPerFrame: this._pointsPerFrame() });
    }

    pause() { this._tool.player.pause(); }

    /** Shows the state at `progress` (0..1); 1 is the finished drawing. */
    seek(progress) {
        const player = this._tool.player;
        player.seek(Math.round(Math.min(Math.max(progress, 0), 1) * player.length));
    }

    /** Fires when playback reaches the end (not on loop restarts). */
    onEnded(listener) {
        this._ended.add(listener);
        return () => this._ended.delete(listener);
    }

    destroy() {
        this._ended.clear();
        this._tool?.dispose();
        this._canvas?.remove();
        this._tool = null;
        this._canvas = null;
    }
}

// ---------------------------------------------------------------------------

export const createDrawingEngine = () => new DrawingEngineWrapper();
export const createDrawingLiveView = () => new DrawingLiveViewWrapper();
export const createDrawingPlayer = () => new DrawingPlayerWrapper();
