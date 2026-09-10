import * as THREE from 'three';
import { StrokeDef } from '../../StrokeDef.js';
import { ThemedPaletteMaker, PALETTE_THEMES } from '../../ThemedPaletteMaker.js';
import { oklchToHex, maxChromaAt } from '../../color.js';
import { PIXELS_PER_UNIT } from '../../CanvasBuffer.js';
import { blobOutline } from '../../pathEffects.js';
import { StrokeStage } from '../stage.js';
import { DrawingBoard } from '../drawingBoard.js';
import { setupDrawCycle } from '../drawCycle.js';
import { taperByArc, scatterPath } from '../strokePaths.js';
import { pathArcLength } from '../pressure.js';
import { StrokeRecorder } from '../strokeRecorder.js';
import { DrawingPlayer, downloadDrawingZip } from '../drawingPlayer.js';
import { makeMarkBuilder, applyRecordTo } from '../markBuilder.js';
import { randomValues } from '../toolRegistry.js';
import { DrawingToolConfig } from './DrawingToolConfig.js';

const TRAIL_SIDE = 10;

function plainPoint(p) {
    return { x: p.x, y: p.y, pressure: p.pressure ?? 0 };
}
const MIN_DISTANCE = 0.008;
const DEFAULT_WIDTH_RANGE = [2, 64];
const PRESSURE_SPEC = { key: 'pressure', min: 0, max: 2, step: 0.05 };

/** A tool's canonical width range, from its registry entry. */
function widthRangeOf(tool) {
    return tool.width ?? DEFAULT_WIDTH_RANGE;
}

/**
 * The drawing tool engine: state, strokes, palette, and playback behind a
 * public API, with no DOM but the canvas it renders into. A UI is a client of
 * this API — it forwards pointer events, calls the control methods, and stays
 * in sync by listening — and any number of UIs can be written against it.
 *
 * Events, fired for every mutation whatever its source: 'tool' (tool or any
 * parameter), 'palette' (config or colors), 'stroke-start' / 'stroke-end',
 * 'clear' (with the background), 'replay-start' / 'replay-end',
 * 'record-start' / 'record-end', 'resize' (with { width, height }).
 *
 * 'live' streams the drawing as resolved outcomes for a mirror: the engine
 * rolls randomness internally (per-stroke seeds, palette rerolls, clear's
 * background and scatter), so a mirror fed raw input would diverge. Each
 * event instead carries what was actually used — the tool, values, colors,
 * and the cycle seed — and `applyLive` on another instance uses them
 * verbatim, rolling no randomness of its own.
 */
export class DrawingTool {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DrawingToolConfig} [config]
     */
    constructor(canvas, config = new DrawingToolConfig()) {
        this.canvas = canvas;
        this.config = config;
        this._registry = config.registry;
        this._listeners = new Map();

        // The live selection, in the shape the mark builder and the records
        // share. `seedOverride` is set while a replayed record drives the
        // cycle, so seeded looks reproduce.
        this._state = {
            tool: this._registry[0], values: {}, widthPx: 24, sens: 1,
            colorA: '#333333', colorB: '#666666', colors: ['#333333'],
            palette: null, seedOverride: null,
        };
        this._replaying = false;
        this._autoRandom = false;
        this._inputEnabled = true;
        this._drawing = false;
        this._points = [];
        this._uiHidden = false;
        this._clearOnResize = false;
        this._applyingLive = false;
        this._livePoints = [];
        // The preview's wiggle and mark seed, held so color and parameter
        // changes redraw the same shape; a tool change rolls a fresh one.
        this._previewShape = null;

        this.stage = new StrokeStage(canvas);
        this.board = new DrawingBoard(this.stage);
        this.recorder = new StrokeRecorder();

        this.cycle = setupDrawCycle({
            stage: this.stage, board: this.board, canvas,
            build: makeMarkBuilder({ state: this._state, board: this.board }),
            widthFor: () => this._state.widthPx / PIXELS_PER_UNIT,
            bindInput: false,
            onCommit: (points, seed) => {
                if (this._replaying || this._playerFeeding || this._applyingLive) return;
                this.recorder.add({
                    toolId: this._state.tool.id, values: { ...this._state.values },
                    widthPx: this._state.widthPx, sens: this._state.sens,
                    colorA: this._state.colorA, colorB: this._state.colorB,
                    colors: [...this._state.colors],
                    seed,
                }, points);
            },
            // Once per gesture, after every piece has committed, so the reroll
            // cannot leak into a later piece's record. Every release rerolls
            // the palette's jitter under the same hue and theme; auto mode
            // also rolls the tool.
            onRelease: () => {
                if (this._replaying || this._playerFeeding || this._applyingLive) return;
                this.recorder.markRelease();
                if (this._autoRandom) {
                    this.stepPalette(Math.random() < 0.5 ? -1 : 1);
                    this._stepTrail(1);
                    this._emit('tool');
                } else {
                    this.rerollPalette();
                }
            },
            pointerTrace: config.pointerTrace,
        });

        // Palette config. Black stays a direct choice, never a roll.
        this._rollThemes = PALETTE_THEMES.filter(th => th.id !== 'black').map(th => th.id);
        this._paletteCfg = {
            hue: Math.random() * 360, count: 5,
            theme: this._rollThemes[Math.floor(Math.random() * this._rollThemes.length)],
            seed: Math.floor(Math.random() * 1e9),
            ...(config.palette ?? {}),
        };
        // The palette trail mirrors the tool trail: the current config with
        // ten remembered on each side, so dialing back retrieves the exact
        // palette (hue, theme, and seed) that was there.
        this._paletteTrail = this._buildPaletteTrail();

        // The tool trail: the current entry with ten remembered on each side,
        // so dialing past a tool and back finds it as it was left.
        this._toolValues = {};
        this._trail = Array.from({ length: TRAIL_SIDE * 2 + 1 }, () => this._rollEntry());
        this._applyRoll(this._trail[TRAIL_SIDE]);
        if (config.toolId) this._selectToolSilent(config.toolId);

        this._buildPreview();

        this._guideMesh = null;
        this._guideAspect = 1;
        this._guideVisible = true;
        this._guideOpacity = 0.5;

        // Whatever drives the transport — replay(), or the player's own seek
        // and play — its feeds must not re-record, so the guard sits on the
        // feed itself rather than on the replay flow.
        this._playerFeeding = false;
        this.player = new DrawingPlayer({
            feed: (points, done) => {
                this._playerFeeding = true;
                try { this.cycle.feed(points, done); } finally { this._playerFeeding = false; }
            },
            applyRecord: record => applyRecordTo(this._state, record, this._registry),
            clear: background => {
                this.cycle.disposeGhost();
                this.board.clear(background);
                this.stage.draw();
            },
            canvas,
        });

        this.stage.onResize((width, height) => {
            this._positionPreview();
            this._refreshPreview();
            this._fitGuide();
            if (this._clearOnResize && !this._replaying) {
                this._clearOnResize = false;
                this.clear();
            }
            this._emit('resize', { width, height });
        });

        this._regenPalette();
        this._positionPreview();
        // The first layout pass can land after construction, when the stage
        // still has no size. A scatter drawn then collapses to a point and
        // records a degenerate stroke, so the first clear waits for the
        // resize that sizes the stage.
        if (this.stage.extentX > 0.01) this.clear();
        else this._clearOnResize = true;
        requestAnimationFrame(() => { this._positionPreview(); this._refreshPreview(); });
    }

    // ------------------------------------------------------------------
    // Events

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return this;
    }

    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
        return this;
    }

    _emit(event, payload) {
        this._listeners.get(event)?.forEach(fn => fn(payload));
        if ((event === 'tool' || event === 'palette') && !this._applyingLive) {
            this._emitLiveState();
        }
    }

    _liveActive() { return (this._listeners.get('live')?.size ?? 0) > 0; }

    _emitLive(type, data = {}) {
        if (this._liveActive()) this._emit('live', { type, ...data });
    }

    // The resolved selection, everything a mirror needs to build the same
    // marks from the same points.
    _emitLiveState() {
        if (!this._liveActive()) return;
        const s = this._state;
        this._emitLive('state', {
            toolId: s.tool.id, values: { ...s.values },
            widthPx: s.widthPx, sens: s.sens,
            colorA: s.colorA, colorB: s.colorB, colors: [...s.colors],
            cycleSeed: this.cycle.getSeed(),
        });
    }

    // ------------------------------------------------------------------
    // State

    get registry() { return this._registry; }

    /** The current tool's adjustable parameters, width and pressure first.
     * The width spec carries the tool's canonical range. */
    get paramSpec() {
        const [min, max] = widthRangeOf(this._state.tool);
        return [{ key: 'width', min, max, step: 1 }, PRESSURE_SPEC, ...this._state.tool.params];
    }

    /** A read-only snapshot of the live selection. */
    get state() {
        return {
            toolId: this._state.tool.id,
            values: {
                width: this._state.widthPx,
                pressure: this._state.sens,
                ...this._state.values,
            },
            palette: { ...this._paletteCfg },
            colorA: this._state.colorA,
            colorB: this._state.colorB,
            colors: [...this._state.colors],
            replaying: this._replaying,
            recording: this.player.recording,
        };
    }

    // ------------------------------------------------------------------
    // Pointer input. Coordinates are CSS pixels relative to the canvas;
    // pressure is 0..1, 0 meaning none. The engine attaches no listeners of
    // its own: a UI forwards events through these.

    _toWorld(x, y, pressure) {
        const nx = (x / this.stage.viewport.width) * 2 - 1;
        const ny = 1 - (y / this.stage.viewport.height) * 2;
        const p = new THREE.Vector3(nx * this.stage.extentX, ny * this.stage.extentY, 0);
        p.pressure = pressure;
        return p;
    }

    pointerDown({ x, y, pressure = 0 }) {
        if (!this._inputEnabled || this._drawing) return;
        this._drawing = true;
        this._setUiHidden(true);
        this._emit('stroke-start');
        const p = this._toWorld(x, y, pressure);
        this._points = [p];
        this._emitLiveState();
        this._emitLive('points', { points: [plainPoint(p)] });
        this.cycle.feed(this._points, false);
    }

    pointerMove({ x, y, pressure = 0 }) {
        if (!this._drawing) return;
        const p = this._toWorld(x, y, pressure);
        const last = this._points[this._points.length - 1];
        if (!last || p.distanceTo(last) >= MIN_DISTANCE) {
            this._points.push(p);
            this._emitLive('points', { points: [plainPoint(p)] });
            this.cycle.feed(this._points, false);
        }
    }

    pointerUp() {
        if (!this._drawing) return;
        this._drawing = false;
        this._emitLive('end');
        this.cycle.feed(this._points, true);
        this._setUiHidden(false);
        this._emit('stroke-end');
    }

    pointerCancel() { this.pointerUp(); }

    /**
     * Applies one 'live' event from another instance, verbatim: the resolved
     * state replaces this instance's dice, so the two drawings stay
     * identical. Nothing applied here records or rerolls.
     */
    applyLive(event) {
        this._applyingLive = true;
        try {
            switch (event.type) {
                case 'state': {
                    const tool = this._registry.find(entry => entry.id === event.toolId);
                    if (tool) this._state.tool = tool;
                    this._state.values = { ...event.values };
                    this._state.widthPx = event.widthPx;
                    this._state.sens = event.sens;
                    this._state.colorA = event.colorA;
                    this._state.colorB = event.colorB;
                    this._state.colors = [...event.colors];
                    if (event.cycleSeed != null) this.cycle.setSeed(event.cycleSeed);
                    break;
                }
                case 'points': {
                    for (const q of event.points) {
                        const p = new THREE.Vector3(q.x, q.y, 0);
                        p.pressure = q.pressure ?? 0;
                        this._livePoints.push(p);
                    }
                    this.cycle.feed(this._livePoints, false);
                    break;
                }
                case 'end':
                    if (this._livePoints.length) this.cycle.feed(this._livePoints, true);
                    this._livePoints = [];
                    break;
                case 'clear':
                    this._livePoints = [];
                    this.cycle.disposeGhost();
                    this.board.clear(event.background);
                    this.stage.draw();
                    break;
            }
        } finally {
            this._applyingLive = false;
        }
    }

    // ------------------------------------------------------------------
    // Dial control: the two relative steps.

    /** ±n along the rolled-tool trail; memory kept ten entries each way. */
    stepTool(steps) {
        if (!steps) return;
        this._stepTrail(steps);
        this.rerollPalette();
        this._emit('tool');
    }

    /**
     * ±n along the palette trail: each new entry moves the key hue by about
     * ten degrees and rolls a fresh theme and seed, and ten entries stay
     * remembered on each side, so stepping back retrieves the exact palette.
     */
    stepPalette(steps) {
        if (!steps) return;
        // The current config, rerolls and panel edits included, stays with
        // its trail slot.
        this._paletteTrail[TRAIL_SIDE] = { ...this._paletteCfg };
        for (let i = 0; i < Math.abs(steps); i++) {
            if (steps > 0) {
                this._paletteTrail.shift();
                this._paletteTrail.push(this._rollPaletteStep(
                    this._paletteTrail[this._paletteTrail.length - 1].hue, 1));
            } else {
                this._paletteTrail.pop();
                this._paletteTrail.unshift(this._rollPaletteStep(this._paletteTrail[0].hue, -1));
            }
        }
        Object.assign(this._paletteCfg, this._paletteTrail[TRAIL_SIDE]);
        this._regenPalette();
    }

    _rollPaletteStep(fromHue, direction) {
        return {
            hue: (fromHue + direction * (7 + Math.random() * 7) + 360) % 360,
            theme: this._rollThemes[Math.floor(Math.random() * this._rollThemes.length)],
            seed: Math.floor(Math.random() * 1e9),
        };
    }

    _buildPaletteTrail() {
        const trail = new Array(TRAIL_SIDE * 2 + 1);
        trail[TRAIL_SIDE] = { ...this._paletteCfg };
        for (let i = TRAIL_SIDE + 1; i < trail.length; i++) {
            trail[i] = this._rollPaletteStep(trail[i - 1].hue, 1);
        }
        for (let i = TRAIL_SIDE - 1; i >= 0; i--) {
            trail[i] = this._rollPaletteStep(trail[i + 1].hue, -1);
        }
        return trail;
    }

    // ------------------------------------------------------------------
    // Direct control

    /** Exact tool by id; its params roll once, then stick per tool. */
    selectTool(id) {
        this.rerollPalette();
        this._selectToolSilent(id);
        this._refreshPreview();
        this._emit('tool');
    }

    _selectToolSilent(id) {
        const tool = this._registry.find(entry => entry.id === id);
        if (!tool) return;
        if (tool !== this._state.tool) this._previewShape = null;
        this._state.tool = tool;
        this._state.values = this._toolValues[tool.id] ??= randomValues(tool);
        const [min, max] = widthRangeOf(tool);
        this._state.widthPx = Math.min(Math.max(this._state.widthPx, min), max);
    }

    /** Partial parameter update; `width` and `pressure` are reserved keys. */
    setParams(partial) {
        for (const [key, value] of Object.entries(partial)) {
            if (key === 'width') {
                const [min, max] = widthRangeOf(this._state.tool);
                this._state.widthPx = Math.min(Math.max(value, min), max);
            }
            else if (key === 'pressure') this._state.sens = value;
            else this._state.values[key] = value;
        }
        this._refreshPreview();
        this._emit('tool');
    }

    /** Partial palette update: any of hue, theme, seed, count. Regenerates. */
    setPalette(partial) {
        Object.assign(this._paletteCfg, partial);
        this._regenPalette();
    }

    /** New seed, same hue, count, and theme. */
    rerollPalette() {
        this._paletteCfg.seed = Math.floor(Math.random() * 1e9);
        this._regenPalette();
    }

    /** Explicit colors; they hold until the next palette change. */
    setColors({ colorA, colorB, colors } = {}) {
        if (colorA !== undefined) this._state.colorA = colorA;
        if (colorB !== undefined) this._state.colorB = colorB;
        if (colors !== undefined) this._state.colors = [...colors];
        this._refreshPreview();
        this._emit('palette');
    }

    setAutoRandomize(on) { this._autoRandom = Boolean(on); }

    setPointerTrace(on) { this.cycle.setPointerTrace(Boolean(on)); }

    // ------------------------------------------------------------------
    // Canvas

    /**
     * A fresh canvas: the background (rolled from the palette when omitted),
     * the configured scatter strokes, and a new take for the recorder.
     */
    clear({ background = null } = {}) {
        const bg = background ?? this._rollBackground();
        this.cycle.disposeGhost();
        this.board.clear(bg);
        this.recorder.begin(bg);
        this._emitLive('clear', { background: bg });
        for (let i = 0; i < this.config.scatterCount; i++) {
            this._applyRoll(this._rollEntry());
            const colors = this._state.colors;
            this._state.colorA = colors[Math.floor(Math.random() * colors.length)];
            this._state.colorB = colors[Math.floor(Math.random() * colors.length)];
            const points = scatterPath(this.stage.extentX, this.stage.extentY);
            this._emitLiveState();
            this._emitLive('points', { points: points.map(plainPoint) });
            // 'end' goes out before the feed: the feed's release rerolls the
            // palette, which streams a fresh state, and that state must not
            // land on a mirror before this stroke has committed.
            this._emitLive('end');
            this.cycle.feed(points, true);
        }
        // Back to the live selection: the palette from its config, the tool
        // from the trail's current entry.
        this._regenPalette();
        this._applyRoll(this._trail[TRAIL_SIDE]);
        this._refreshPreview();
        this._emit('clear', { background: bg });
        this._emit('tool');
    }

    _rollBackground() {
        // Paper-light tints of two palette hues, so any theme (a dark cluster
        // included) clears to a drawable ground. Plain data, so the recorder
        // reproduces it.
        const paperTint = entry => {
            const L = 0.86 + Math.random() * 0.08;
            return oklchToHex(L,
                Math.min(maxChromaAt(L, entry.H) * 0.5, 0.03 + Math.random() * 0.04), entry.H);
        };
        const es = this._state.palette.entries;
        return {
            type: Math.random() < 0.5 ? 'linear' : 'radial',
            colorA: paperTint(es[Math.floor(Math.random() * es.length)]),
            colorB: paperTint(es[Math.floor(Math.random() * es.length)]),
            angle: Math.random() * Math.PI * 2,
            center: [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6],
        };
    }

    /** Decoded image, or null to keep none. The file picking is a UI concern. */
    setGuideImage(image) {
        if (this._guideMesh) {
            this.stage.remove(this._guideMesh);
            this._guideMesh.material.map?.dispose();
            this._guideMesh.material.dispose();
            this._guideMesh.geometry.dispose();
            this._guideMesh = null;
        }
        if (!image) { this.stage.draw(); return; }
        this._guideAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        this._guideMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: texture, transparent: true, opacity: this._guideOpacity, depthWrite: false,
            })
        );
        this._guideMesh.position.z = 1.4;
        this._guideMesh.userData.overlay = true;
        this.stage.add(this._guideMesh);
        this._fitGuide();
        this._updateGuideVisibility();
    }

    setGuideOpacity(v) {
        this._guideOpacity = v;
        if (this._guideMesh) {
            this._guideMesh.material.opacity = v;
            this.stage.draw();
        }
    }

    setGuideVisible(on) {
        this._guideVisible = Boolean(on);
        this._updateGuideVisibility();
    }

    /** A fresh canvas on the next stage resize, for a layout change under way. */
    clearOnNextResize() { this._clearOnResize = true; }

    // ------------------------------------------------------------------
    // Playback and data

    /** Replays everything since the last clear. Fires replay-start/-end. */
    replay() {
        return this._runPlayer('play');
    }

    /** Jumps a running replay to its end state. */
    stopReplay() { this.player.finish(); }

    /** Replays while capturing the canvas; saves the video when done. */
    recordVideo() {
        return this._runPlayer('record');
    }

    /** The serialized log: `{ version, size, background, records }`. */
    getDrawingData() {
        return {
            version: 2,
            size: [this.stage.viewport.width, this.stage.viewport.height],
            background: this.recorder.background,
            records: [...this.recorder.records],
        };
    }

    /** Loads a log, replacing the take, and clears to its background. */
    setDrawingData(data) {
        this.recorder.begin(data.background ?? '#ffffff');
        this.recorder.records = [...(data.records ?? [])];
        this.cycle.disposeGhost();
        this.board.clear(this.recorder.background);
        this.stage.draw();
        this._emit('clear', { background: this.recorder.background });
    }

    /** The log zipped and saved, as the Player page reads it. */
    downloadDrawing(filename = 'drawing') {
        if (this._replaying || this.recorder.records.length === 0) return;
        downloadDrawingZip(this.getDrawingData(), filename);
    }

    /**
     * A PNG of the drawing, without the preview, trace, or guide — the same
     * view a recording captures.
     * @returns {Promise<Blob>}
     */
    snapshot() {
        const restore = [];
        const hide = object => {
            if (!object) return;
            restore.push([object, object.visible]);
            object.visible = false;
        };
        hide(this._preview);
        hide(this._previewMark?.mesh);
        hide(this._guideMesh);
        // The canvas must be read in the same task as the render, so this
        // draws immediately and copies before yielding.
        this.stage.drawNow();
        const copy = document.createElement('canvas');
        copy.width = this.canvas.width;
        copy.height = this.canvas.height;
        copy.getContext('2d').drawImage(this.canvas, 0, 0);
        restore.forEach(([object, visible]) => { object.visible = visible; });
        this.stage.draw();
        return new Promise(resolve => copy.toBlob(resolve, 'image/png'));
    }

    _runPlayer(mode) {
        if (this._replaying || this.recorder.records.length === 0) return false;
        this._replaying = true;
        this._inputEnabled = false;
        this._setSceneFurnitureVisible(false);
        this._emit(mode === 'record' ? 'record-start' : 'replay-start');
        const saved = {
            tool: this._state.tool, values: { ...this._state.values },
            widthPx: this._state.widthPx, sens: this._state.sens,
            colorA: this._state.colorA, colorB: this._state.colorB,
            colors: [...this._state.colors],
        };
        this.player.setData(this.getDrawingData());
        const done = () => {
            Object.assign(this._state, saved, { seedOverride: null });
            this._replaying = false;
            this._inputEnabled = true;
            this._setSceneFurnitureVisible(true);
            this._refreshPreview();
            this._emit(mode === 'record' ? 'record-end' : 'replay-end');
            this._emit('tool');
        };
        const ok = mode === 'record'
            ? this.player.record({ onDone: done })
            : this.player.play({ onDone: done });
        if (!ok) done();
        return ok;
    }

    // The preview and the guide would be captured into a replay's canvas and
    // its recording, so both hide while one runs.
    _setSceneFurnitureVisible(on) {
        if (this._preview) this._preview.visible = on && !this._uiHidden;
        if (this._previewMark) this._previewMark.mesh.visible = on && !this._uiHidden;
        this._updateGuideVisibility();
    }

    dispose() {
        this.player.pause();
        this._listeners.clear();
        this.stage.renderer.dispose();
    }

    // ------------------------------------------------------------------
    // Palette internals

    _regenPalette() {
        this._state.palette = new ThemedPaletteMaker(this._paletteCfg).generate();
        const entries = this._state.palette.entries;
        this._state.colorA = entries[0].hex;
        const rest = entries.slice(1);
        this._state.colorB = (rest[Math.floor(Math.random() * rest.length)] ?? entries[0]).hex;
        this._state.colors = entries.map(e => e.hex);
        this._refreshPreview();
        this._emit('palette');
    }

    // ------------------------------------------------------------------
    // Trail internals

    _rollEntry() {
        const tool = this._registry[Math.floor(Math.random() * this._registry.length)];
        const [min, max] = widthRangeOf(tool);
        return {
            tool,
            values: randomValues(tool),
            widthPx: min + Math.random() * (max - min),
            // Sensitivity scales the tool's pressure swing around the width.
            sens: Math.random() * 2,
            // Rolled lazily on the first preview, then remembered with the
            // entry, so stepping back shows the exact same preview.
            previewShape: null,
        };
    }

    _applyRoll(entry) {
        this._state.tool = entry.tool;
        this._state.values = entry.values;
        this._state.widthPx = entry.widthPx;
        this._state.sens = entry.sens;
        this._previewShape = entry.previewShape ?? null;
        this._toolValues[entry.tool.id] = entry.values;
    }

    _stepTrail(steps) {
        // Adjusted width, parameters, and sensitivity stay with the entry, so
        // the trail remembers the tool as it was left, not as it was rolled.
        this._trail[TRAIL_SIDE] = {
            tool: this._state.tool, values: this._state.values,
            widthPx: this._state.widthPx, sens: this._state.sens,
            previewShape: this._previewShape,
        };
        for (let i = 0; i < Math.abs(steps); i++) {
            if (steps > 0) { this._trail.shift(); this._trail.push(this._rollEntry()); }
            else { this._trail.pop(); this._trail.unshift(this._rollEntry()); }
        }
        this._applyRoll(this._trail[TRAIL_SIDE]);
        this._refreshPreview();
    }

    // ------------------------------------------------------------------
    // Preview internals: a box at the bottom left showing the current tool on
    // a wiggle, drawn in the scene with the real renderers.

    _buildPreview() {
        this._preview = null;
        this._previewMark = null;
        if (!this.config.preview) return;
        this._preview = new THREE.Group();
        this._preview.position.z = 0.2;
        // Overlays render above the coverage-layer composites.
        this._preview.userData.overlay = true;
        this.stage.add(this._preview);
        // Semi-transparent black, so drawing behind the preview shows through.
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }));
        this._preview.add(paper);
        this._previewSize = { w: 1.1, h: 0.62 };
        paper.scale.set(this._previewSize.w, this._previewSize.h, 1);
    }

    _previewCenter() {
        return {
            x: -this.stage.extentX + 0.08 + this._previewSize.w / 2,
            y: -this.stage.extentY + 0.08 + this._previewSize.h / 2,
        };
    }

    _positionPreview() {
        if (!this._preview) return;
        const c = this._previewCenter();
        this._preview.position.x = c.x;
        this._preview.position.y = c.y;
    }

    _refreshPreview() {
        if (!this._preview) return;
        if (this._previewMark) {
            this.stage.remove(this._previewMark.mesh);
            this._previewMark.renderer.dispose(this._previewMark.mesh);
            this._previewMark = null;
        }
        // The mark is built at its world position rather than inside the
        // offset group: a blob's distance field lives in world space, so a
        // translated parent would separate the quad from its own contour.
        const c = this._previewCenter();
        const state = this._state;
        const width = Math.min(state.widthPx / PIXELS_PER_UNIT, 0.15);
        this._previewShape ??= {
            phase: Math.random() * Math.PI * 2,
            freq: 4 + Math.random() * 4,
            seed: Math.floor(Math.random() * 1000),
        };
        const { phase, freq, seed } = this._previewShape;
        const path = [];
        const n = 28;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            path.push(new THREE.Vector3(
                c.x + (t - 0.5) * this._previewSize.w * 0.72,
                c.y + Math.sin(phase + t * freq) * this._previewSize.h * 0.2,
                0
            ));
        }
        const ctx = {
            colorA: state.colorA, colorB: state.colorB, colors: state.colors,
            texture: this.board.texture, seed,
            start: path[0], end: path[path.length - 1],
            tintLight: new THREE.Color(state.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        };
        let mark = null;
        if (state.tool.kind === 'blob') {
            const contour = blobOutline(path, { span: 0.1, radius: Math.min(Math.max(width * 1.3, 0.06), 0.16) });
            if (contour) {
                const renderer = state.tool.make(state.values, ctx);
                mark = { mesh: renderer.build(contour, ctx.seed), renderer };
            }
        } else if (state.tool.kind === 'shape') {
            // Short endpoints, so even the circle (whose radius is their full
            // span, drawn around the first) stays inside the preview paper.
            const a = new THREE.Vector3(c.x - 0.08, c.y - 0.06, 0);
            const b = new THREE.Vector3(c.x + 0.1, c.y + 0.08, 0);
            const contour = state.tool.contour(a, b, ctx.seed);
            if (contour) {
                const renderer = state.tool.make(state.values, { ...ctx, start: a, end: b });
                mark = { mesh: renderer.build(contour, ctx.seed), renderer };
            }
        } else {
            const renderer = state.tool.make(state.values, ctx);
            const def = new StrokeDef({
                points: path, widthLeft: taperByArc(width, pathArcLength(path)),
                renderer, seed: ctx.seed,
            });
            mark = { mesh: def.build(), renderer };
        }
        if (mark) {
            mark.mesh.position.z = 0.21;
            mark.mesh.visible = !this._uiHidden && !this._replaying;
            mark.mesh.userData.overlay = true;
            this.stage.add(mark.mesh);
            this._previewMark = mark;
        }
        this._preview.visible = !this._uiHidden && !this._replaying;
        this.stage.draw();
    }

    _setUiHidden(hidden) {
        this._uiHidden = hidden;
        if (this._preview) this._preview.visible = !hidden && !this._replaying;
        if (this._previewMark) this._previewMark.mesh.visible = !hidden && !this._replaying;
        this.stage.draw();
    }

    // ------------------------------------------------------------------
    // Guide internals

    _fitGuide() {
        if (!this._guideMesh) return;
        const w = Math.min(this.stage.extentX * 2, this.stage.extentY * 2 * this._guideAspect);
        this._guideMesh.scale.set(w, w / this._guideAspect, 1);
    }

    _updateGuideVisibility() {
        if (!this._guideMesh) return;
        this._guideMesh.visible = this._guideVisible && !this._replaying;
        this.stage.draw();
    }
}
