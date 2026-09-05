import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { Palette } from '../Palette.js';
import { oklchToHex, maxChromaAt } from '../color.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { blobOutline } from '../pathEffects.js';
import { StrokeStage } from './stage.js';
import { DrawingBoard } from './drawingBoard.js';
import { setupDrawCycle } from './drawCycle.js';
import { taperByArc, scatterPath } from './strokePaths.js';
import { pressureAlong, pressureResponse, limitWidthSlope, averagePressure, pathArcLength } from './pressure.js';
import { Dial } from './dial.js';
import { FrameLatch } from './latch.js';
import { StrokeRecorder, replayRecords } from './strokeRecorder.js';
import { MidiInput } from './midi.js';
import { randomValues, toolLabel } from './toolRegistry.js';

const PRESSURE_FLOOR = 0.15;

const TEMPLATE = /* html */`
  <div class="dp-overlay-tl">
    <button id="adv-btn" class="dp-icon-btn active" title="Settings">
      <svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
    </button>
  </div>

  <div class="canvas-wrap">
    <canvas id="canvas"></canvas>
    <div class="dp-dials">
      <div id="dial-hue"></div>
      <div id="dial-tool"></div>
    </div>
  </div>

  <div class="dp-panel" id="side-pane">
    <div class="dp-sub-label">Canvas</div>
    <div class="dp-btn-row">
      <button id="clear-btn" class="dp-btn secondary">Clear</button>
      <button id="fullscreen-btn" class="dp-btn secondary">Full screen</button>
    </div>
    <div class="dp-row" id="size-row" style="display:none">
      <span class="dp-label">Size</span>
      <select id="size-select" class="dp-select">
        <option value="">Window</option>
        <option value="1920x1080">Full HD horizontal</option>
        <option value="1080x1920">Full HD vertical</option>
        <option value="1280x1280">Square 1280</option>
        <option value="960x960">Square 960</option>
      </select>
    </div>

    <div class="dp-sub-label">Replay</div>
    <div class="dp-btn-row">
      <button id="replay-btn" class="dp-btn secondary">Replay</button>
      <button id="record-btn" class="dp-btn secondary">Record</button>
      <button id="auto-btn" class="dp-toggle">Auto</button>
    </div>

    <div class="dp-sub-label">Guide image</div>
    <div class="dp-btn-row">
      <button id="guide-btn" class="dp-btn secondary">Choose image</button>
      <button id="guide-toggle" class="dp-toggle active" style="display:none">On</button>
    </div>
    <div class="dp-row" id="guide-row" style="display:none">
      <span class="dp-label">Opacity</span>
      <input id="guide-opacity" class="dp-range" type="range" min="0" max="1" step="0.05" value="0.5" />
    </div>

    <hr class="dp-divider" />

    <div class="dp-sub-label">Color</div>
    <div class="dp-dial-row">
      <div id="dial-h" class="small"></div>
      <div id="dial-c" class="small"></div>
      <div id="dial-l" class="small"></div>
    </div>
    <div class="dp-swatch-row" id="tool-colors" style="margin-top:8px"></div>
    <div class="dp-swatch-grid" id="palette-grid"></div>

    <div class="dp-sub-label">Tool</div>
    <div style="display:flex; gap:8px; align-items:center">
      <div id="dial-tool-adv" class="small"></div>
      <select id="tool-select" class="dp-select"></select>
    </div>

    <div class="dp-sub-label">Parameters</div>
    <div id="tool-params"></div>
  </div>

  <input id="guide-file" type="file" accept="image/*" style="display:none" />
`;

/**
 * The drawing tool: one canvas that mixes any set of tools with the palette,
 * the pen pressure, the MIDI dials, replay, and recording. Independent of the
 * stroke implementations: the client passes a `registry` of tools, each
 * `{ id, kind: 'stroke'|'blob', params, make(values, ctx) }`, and the
 * component builds the whole interface around it.
 *
 * The interface: a settings panel on the left, open by default, holding every
 * control but the two floating dials; the hue dial rotates the palette at full
 * chroma, the tool dial walks a trail of rolled tools; the current tool
 * previews on a wiggle at the bottom left. Everything fades while the pen is
 * down.
 */
export function setupDrawingTool({ registry, root = document.body, square = false }) {
    const layout = document.createElement('div');
    layout.className = 'demo-layout drawing-tool' + (square ? ' square' : '');
    layout.innerHTML = TEMPLATE;
    root.appendChild(layout);
    const $ = id => layout.querySelector('#' + id);

    // ------------------------------------------------------------------
    // State: the current tool and everything a mark needs. `seedOverride` is
    // set while a replayed record drives the cycle, so seeded looks reproduce.
    const state = {
        tool: registry[0], values: {}, widthPx: 24, sens: 1,
        colorA: '#333333', colorB: '#666666', colors: ['#333333'],
        palette: null, seedOverride: null,
    };
    let replaying = false;

    const stage = new StrokeStage($('canvas'));
    const board = new DrawingBoard(stage);
    const recorder = new StrokeRecorder();

    function buildMark(path, points, seed) {
        const useSeed = state.seedOverride ?? seed;
        const ctx = {
            colorA: state.colorA, colorB: state.colorB, colors: state.colors,
            texture: board.texture, seed: useSeed,
            start: path[0], end: path[path.length - 1],
            tintLight: new THREE.Color(state.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        };
        const width = state.widthPx / PIXELS_PER_UNIT;
        const pressureAt = pressureAlong(points);
        if (state.tool.kind === 'blob') {
            const scale = 1 + state.sens * pressureResponse(averagePressure(points), 1, PRESSURE_FLOOR);
            const radius = Math.min(Math.max(width * 1.3 * scale, 0.05), 0.45);
            const contour = blobOutline(path, { span: 0.12, radius });
            if (!contour) return null;
            const renderer = state.tool.make(state.values, ctx);
            const mesh = renderer.build(contour, useSeed);
            mesh.position.z = 0.05;
            return { mesh, renderer };
        }
        const renderer = state.tool.make(state.values, ctx);
        const base = taperByArc(width, pathArcLength(path));
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: limitWidthSlope(path,
                s => base(s) * (1 + state.sens * pressureResponse(pressureAt(s), 1, PRESSURE_FLOOR))),
            renderer,
            seed: useSeed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    }

    // Auto randomize: with the toggle on, the colors and the whole tool (width,
    // parameters, pressure sensitivity) reroll on every release. The tool comes
    // from a step along the trail, so a dialed-back history includes what auto
    // mode used.
    let autoRandom = false;

    function autoReroll() {
        const hueValue = Math.floor(Math.random() * 128);
        dialHue.set(hueValue, false);
        setDialColor(hueValue);
        stepTrail(1);
        refreshPreview();
        syncPane();
    }

    const cycle = setupDrawCycle({
        stage, board,
        canvas: $('canvas'),
        build: buildMark,
        onCommit: (points, seed) => {
            if (replaying) return;
            recorder.add({
                toolId: state.tool.id, values: { ...state.values },
                widthPx: state.widthPx, sens: state.sens,
                colorA: state.colorA, colorB: state.colorB, colors: [...state.colors],
                seed,
            }, points);
        },
        // Once per gesture, after every piece has committed, so the reroll
        // cannot leak into a later piece's record.
        onRelease: () => {
            if (autoRandom && !replaying) autoReroll();
        },
    });

    // ------------------------------------------------------------------
    // Palette. The first hue always follows the color choice; the rest reroll.
    function newPalette(hue, { keepColorA = false } = {}) {
        const hues = [hue, ...Array.from({ length: 3 }, () => Math.random() * 360)];
        state.palette = Palette.fromHues(hues, {
            nLum: 5, lumHigh: 0.9, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3,
        });
        const dark = state.palette.entries.filter(e => e.L < 0.68);
        if (!keepColorA) {
            const firstDark = state.palette.entries.slice(0, 5).filter(e => e.L < 0.68);
            state.colorA = (firstDark[Math.floor(firstDark.length / 2)] ?? dark[0]).hex;
        }
        state.colorB = dark[Math.floor(Math.random() * dark.length)].hex;
        state.colors = dark.map(e => e.hex);
    }

    const toolValues = {};
    let toolIndex = 0;

    // The tool dial walks a trail of rolled tools: the current one with ten
    // remembered on each side, so passing a tool over and dialing back finds
    // the same one, with the width, parameters, and pressure sensitivity it was
    // rolled with. Each step drops the entry on the far end behind and rolls a
    // fresh one onto the end ahead.
    const TRAIL_SIDE = 10;

    function rollEntry() {
        const tool = registry[Math.floor(Math.random() * registry.length)];
        return {
            tool,
            values: randomValues(tool),
            widthPx: 2 + Math.random() * 58,
            // Pressure can widen the stroke by up to three times at full sensitivity.
            sens: Math.random() * 2,
        };
    }

    const trail = Array.from({ length: TRAIL_SIDE * 2 + 1 }, rollEntry);

    function applyRoll(entry) {
        state.tool = entry.tool;
        state.values = entry.values;
        state.widthPx = entry.widthPx;
        state.sens = entry.sens;
        toolIndex = registry.indexOf(entry.tool);
        toolValues[entry.tool.id] = entry.values;
    }

    function stepTrail(steps) {
        // Adjusted width, parameters, and sensitivity stay with the entry, so
        // the trail remembers the tool as it was left, not as it was rolled.
        trail[TRAIL_SIDE] = {
            tool: state.tool, values: state.values,
            widthPx: state.widthPx, sens: state.sens,
        };
        for (let i = 0; i < Math.abs(steps); i++) {
            if (steps > 0) { trail.shift(); trail.push(rollEntry()); }
            else { trail.pop(); trail.unshift(rollEntry()); }
        }
        applyRoll(trail[TRAIL_SIDE]);
    }

    // ------------------------------------------------------------------
    // Preview: a box at the bottom left showing the current tool on a wiggle.
    const preview = new THREE.Group();
    preview.position.z = 0.2;
    stage.add(preview);
    // Semi-transparent black, so drawing behind the preview shows through.
    const previewPaper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }));
    preview.add(previewPaper);
    const PREVIEW_W = 1.1, PREVIEW_H = 0.62;
    previewPaper.scale.set(PREVIEW_W, PREVIEW_H, 1);
    let previewMark = null;

    function previewCenter() {
        return {
            x: -stage.extentX + 0.08 + PREVIEW_W / 2,
            y: -stage.extentY + 0.08 + PREVIEW_H / 2,
        };
    }

    function positionPreview() {
        const c = previewCenter();
        preview.position.x = c.x;
        preview.position.y = c.y;
    }

    function refreshPreview() {
        if (previewMark) {
            stage.remove(previewMark.mesh);
            previewMark.renderer.dispose(previewMark.mesh);
            previewMark = null;
        }
        // The mark is built at its world position rather than inside the offset
        // group: a blob's distance field lives in world space, so a translated
        // parent would separate the quad from its own contour.
        const c = previewCenter();
        const width = Math.min(state.widthPx / PIXELS_PER_UNIT, 0.15);
        const phase = Math.random() * Math.PI * 2;
        const freq = 4 + Math.random() * 4;
        const path = [];
        const n = 28;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            path.push(new THREE.Vector3(
                c.x + (t - 0.5) * PREVIEW_W * 0.72,
                c.y + Math.sin(phase + t * freq) * PREVIEW_H * 0.2,
                0
            ));
        }
        const ctx = {
            colorA: state.colorA, colorB: state.colorB, colors: state.colors,
            texture: board.texture, seed: Math.floor(Math.random() * 1000),
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
            mark.mesh.visible = !uiHidden && !replaying;
            stage.add(mark.mesh);
            previewMark = mark;
        }
        preview.visible = !uiHidden && !replaying;
        stage.draw();
    }

    // ------------------------------------------------------------------
    // Dials, frame-latched: input only stores the value, the update runs once
    // on the next frame. The hue dial sets the color at full chroma; exact
    // chroma and lightness stay on the panel's own dials.
    function setDialColor(hueValue) {
        adv.h = Math.round(hueValue / 127 * 360);
        adv.c = 100;
        dialH.set(adv.h, false);
        dialC.set(100, false);
        applyAdvancedColor();
    }
    const hueLatch = new FrameLatch(v => setDialColor(v));
    // The dial's range is quantized into buckets; crossing into a new bucket
    // steps the trail by the difference, so turning back retraces the same tools.
    const TOOL_STEP = 6;
    let toolBucket = Math.round(48 / TOOL_STEP);
    const toolLatch = new FrameLatch(v => {
        const bucket = Math.round(v / TOOL_STEP);
        if (bucket === toolBucket) return;
        stepTrail(bucket - toolBucket);
        toolBucket = bucket;
        refreshPreview();
        syncPane();
    });

    const dialHue = new Dial($('dial-hue'),
        { label: 'Hue', value: Math.floor(Math.random() * 128), onInput: v => hueLatch.set(v) });
    const dialTool = new Dial($('dial-tool'),
        { label: 'Tool', value: 48, onInput: v => toolLatch.set(v) });

    const midi = new MidiInput({
        onMessage: m => {
            console.log('[midi]', m.type, 'ch', m.channel, m.detail, m.data, m.port);
            if (m.type !== 'control change') return;
            if (m.data[1] === 16) dialHue.set(m.data[2]);
            else if (m.data[1] === 17) dialTool.set(m.data[2]);
        },
        onDevices: inputs => console.log('[midi] inputs:', inputs.map(i => i.name).join(', ') || 'none'),
    });
    midi.start()
        .then(() => console.log('[midi] access granted'))
        .catch(err => console.log('[midi] unavailable:', err.message));

    // ------------------------------------------------------------------
    // Clear: a fresh canvas color and a few scattered marks, all from the
    // palette and all recorded, so a replay reproduces them too.
    function clearAll() {
        // A gradient background, as plain data so the recorder can reproduce
        // it. The two colors come from different hue groups (entries are
        // hue-major, five luminance steps per hue), so the gradient actually
        // reads as one.
        const groupLight = g => {
            const group = state.palette.entries.slice(g * 5, g * 5 + 5).filter(e => e.L > 0.55);
            return (group[Math.floor(Math.random() * group.length)] ?? state.palette.entries[g * 5]).hex;
        };
        const gi = Math.floor(Math.random() * 4);
        const gj = (gi + 1 + Math.floor(Math.random() * 3)) % 4;
        const background = {
            type: Math.random() < 0.5 ? 'linear' : 'radial',
            colorA: groupLight(gi), colorB: groupLight(gj),
            angle: Math.random() * Math.PI * 2,
            center: [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6],
        };
        cycle.disposeGhost();
        board.clear(background);
        recorder.begin(background);
        for (let i = 0; i < 3; i++) {
            applyRoll(rollEntry());
            const dark = state.colors;
            state.colorA = dark[Math.floor(Math.random() * dark.length)];
            state.colorB = dark[Math.floor(Math.random() * dark.length)];
            cycle.feed(scatterPath(stage.extentX, stage.extentY), true);
        }
        // Back to what the dials say: the color from the panel's dials, the
        // tool from the trail's current entry.
        applyAdvancedColor();
        applyRoll(trail[TRAIL_SIDE]);
        refreshPreview();
        syncPane();
    }

    // ------------------------------------------------------------------
    // Replay: everything since the last clear, through the same cycle, with
    // the idle time skipped.
    function applyRecord(record) {
        state.tool = registry.find(r => r.id === record.toolId) ?? registry[0];
        state.values = { ...record.values };
        state.widthPx = record.widthPx;
        state.sens = record.sens;
        state.colorA = record.colorA;
        state.colorB = record.colorB;
        state.colors = [...record.colors];
        state.seedOverride = record.seed;
    }

    const replayBtn = $('replay-btn');
    const clearBtn = $('clear-btn');
    let player = null;

    // While a replay runs the other controls disable, and the preview hides:
    // it lives in the scene, so it would be captured into the replay's canvas,
    // and into a recording of it.
    function setReplayUi(on) {
        replayBtn.textContent = on ? 'Stop' : 'Replay';
        for (const el of [clearBtn, autoBtn, recordBtn, guideBtn, guideToggle, advBtn]) {
            el.disabled = on;
        }
        preview.visible = !on && !uiHidden;
        if (previewMark) previewMark.mesh.visible = !on && !uiHidden;
        updateGuideVisibility();
    }

    function startReplay(onFinished) {
        if (replaying || recorder.records.length === 0) return false;
        replaying = true;
        cycle.input.enabled = false;
        setReplayUi(true);
        const saved = {
            tool: state.tool, values: { ...state.values }, widthPx: state.widthPx,
            sens: state.sens, colorA: state.colorA, colorB: state.colorB, colors: [...state.colors],
        };
        board.clear(recorder.background);
        stage.draw();
        player = replayRecords({
            records: recorder.records,
            applyTool: applyRecord,
            feed: cycle.feed,
            pointsPerFrame: 4,
            onDone: () => {
                Object.assign(state, saved, { seedOverride: null });
                replaying = false;
                player = null;
                cycle.input.enabled = true;
                setReplayUi(false);
                refreshPreview();
                syncPane();
                onFinished?.();
            },
        });
        return true;
    }

    replayBtn.addEventListener('click', () => {
        // While a replay runs the same button reads Stop, and stopping jumps
        // straight to the end state.
        if (replaying) { player?.finish(); return; }
        startReplay();
    });

    clearBtn.addEventListener('click', () => {
        if (replaying) return;
        clearAll();
    });

    const autoBtn = $('auto-btn');
    autoBtn.addEventListener('click', () => {
        autoRandom = !autoRandom;
        autoBtn.classList.toggle('active', autoRandom);
    });

    // ------------------------------------------------------------------
    // The settings panel: exact HCL color by three dials, the tool by dial or
    // dropdown, every parameter of the current tool as sliders, and every
    // button but the floating dials. Open by default; the top left icon
    // toggles it.
    const advBtn = $('adv-btn');
    const sidePane = $('side-pane');
    let panelOpen = true;
    const adv = { h: 0, c: 100, l: 45 };

    function applyAdvancedColor() {
        const L = adv.l / 100;
        const C = maxChromaAt(L, adv.h) * adv.c / 100;
        state.colorA = oklchToHex(L, C, adv.h);
        newPalette(adv.h, { keepColorA: true });
        renderSwatches();
        refreshPreview();
    }

    function selectToolByIndex(index) {
        toolIndex = Math.max(0, Math.min(registry.length - 1, index));
        state.tool = registry[toolIndex];
        state.values = toolValues[state.tool.id] ??= randomValues(state.tool);
        renderParams();
        renderSwatches();
        refreshPreview();
    }

    function renderSwatches() {
        const toolColors = $('tool-colors');
        toolColors.innerHTML = '';
        for (const hex of [state.colorA, state.colorB]) {
            const sw = document.createElement('div');
            sw.className = 'dp-swatch';
            sw.style.background = hex;
            toolColors.appendChild(sw);
        }
        const grid = $('palette-grid');
        grid.innerHTML = '';
        for (const entry of state.palette?.entries ?? []) {
            const cell = document.createElement('div');
            cell.className = 'dp-swatch-cell'
                + (entry.hex === state.colorA || entry.hex === state.colorB ? ' selected' : '');
            cell.style.background = entry.hex;
            grid.appendChild(cell);
        }
    }

    function paramRow(container, label, min, max, step, value, decimals, onInput) {
        const row = document.createElement('div');
        row.className = 'dp-row';
        const lab = document.createElement('span');
        lab.className = 'dp-label';
        lab.textContent = label;
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'dp-range';
        input.min = min; input.max = max; input.step = step; input.value = value;
        const val = document.createElement('span');
        val.className = 'dp-val';
        const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
        show();
        input.addEventListener('input', () => { show(); onInput(parseFloat(input.value)); });
        row.append(lab, input, val);
        container.appendChild(row);
    }

    function renderParams() {
        const container = $('tool-params');
        container.innerHTML = '';
        paramRow(container, 'Width', 2, 60, 1, state.widthPx, 0,
            v => { state.widthPx = v; refreshPreview(); });
        paramRow(container, 'Pressure', 0, 2, 0.05, state.sens, 2,
            v => { state.sens = v; });
        for (const param of state.tool.params) {
            const label = param.key.replace(/^./, c => c.toUpperCase());
            if (param.pick) {
                const row = document.createElement('div');
                row.className = 'dp-row';
                const lab = document.createElement('span');
                lab.className = 'dp-label';
                lab.textContent = label;
                const select = document.createElement('select');
                select.className = 'dp-select';
                for (const option of param.pick) {
                    const o = document.createElement('option');
                    o.value = option;
                    o.textContent = option;
                    select.appendChild(o);
                }
                select.value = state.values[param.key];
                select.addEventListener('change', () => {
                    state.values[param.key] = select.value;
                    refreshPreview();
                });
                row.append(lab, select);
                container.appendChild(row);
                continue;
            }
            const step = param.step ?? (param.max - param.min) / 100;
            const decimals = step >= 1 ? 0 : 2;
            paramRow(container, label, param.min, param.max, step, state.values[param.key], decimals,
                v => { state.values[param.key] = v; refreshPreview(); });
        }
    }

    const dialH = new Dial($('dial-h'),
        { label: 'H', min: 0, max: 360, value: adv.h, onInput: v => { adv.h = v; applyAdvancedColor(); } });
    const dialC = new Dial($('dial-c'),
        { label: 'C', min: 0, max: 100, value: adv.c, onInput: v => { adv.c = v; applyAdvancedColor(); } });
    const dialL = new Dial($('dial-l'),
        { label: 'L', min: 5, max: 95, value: adv.l, onInput: v => { adv.l = v; applyAdvancedColor(); } });

    const toolSelect = $('tool-select');
    registry.forEach((entry, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = toolLabel(entry);
        toolSelect.appendChild(o);
    });
    toolSelect.addEventListener('change', () => {
        selectToolByIndex(parseInt(toolSelect.value, 10));
        dialToolAdv.set(toolIndex, false);
    });
    // The dial is a shortcut through the same order as the dropdown, not a reroll.
    const dialToolAdv = new Dial($('dial-tool-adv'),
        { label: 'Tool', min: 0, max: registry.length - 1, value: 0,
          onInput: i => { selectToolByIndex(i); toolSelect.value = String(toolIndex); } });

    function syncPane() {
        toolSelect.value = String(toolIndex);
        dialToolAdv.set(toolIndex, false);
        renderParams();
        renderSwatches();
    }

    function setPanelOpen(open) {
        panelOpen = open;
        advBtn.classList.toggle('active', open);
        sidePane.style.display = open ? '' : 'none';
        if (open) syncPane();
    }
    advBtn.addEventListener('click', () => {
        if (replaying) return;
        setPanelOpen(!panelOpen);
    });

    // ------------------------------------------------------------------
    // While the pen is down, every overlay fades out of the way — the DOM
    // controls and the preview box in the scene alike.
    let uiHidden = false;
    function setUiHidden(hidden) {
        uiHidden = hidden;
        layout.classList.toggle('dp-ui-hidden', hidden);
        preview.visible = !hidden && !replaying;
        if (previewMark) previewMark.mesh.visible = !hidden && !replaying;
        stage.draw();
    }
    {
        const canvas = $('canvas');
        canvas.addEventListener('pointerdown', () => {
            if (cycle.input.enabled) setUiHidden(true);
        });
        const show = () => setUiHidden(false);
        window.addEventListener('pointerup', show);
        window.addEventListener('pointercancel', show);
    }

    // ------------------------------------------------------------------
    // Record: run the replay while capturing the canvas, then save the video.
    // The file is mp4 where the browser can encode it, webm otherwise.
    const recordBtn = $('record-btn');
    let recording = false;

    recordBtn.addEventListener('click', () => {
        if (recording || replaying || recorder.records.length === 0) return;
        const canvas = $('canvas');
        const stream = canvas.captureStream(60);
        const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            .find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c));
        if (!mime) { console.log('[record] MediaRecorder unavailable'); return; }
        const media = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
        const chunks = [];
        media.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        media.onstop = () => {
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            const blob = new Blob(chunks, { type: mime });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `drawing.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        };
        media.start();
        recording = true;
        recordBtn.classList.add('active');
        const ok = startReplay(() => {
            media.stop();
            recording = false;
            recordBtn.classList.remove('active');
        });
        if (!ok) { media.stop(); recording = false; recordBtn.classList.remove('active'); }
    });

    // ------------------------------------------------------------------
    // Canvas size, offered in full screen: a fixed centered surface, or the
    // window.
    const sizeSelect = $('size-select');
    const sizeRow = $('size-row');
    function applyCanvasSize(value) {
        const wrap = layout.querySelector('.canvas-wrap');
        if (!value) {
            wrap.style.flex = '';
            wrap.style.width = '';
            wrap.style.height = '';
            wrap.style.margin = '';
            return;
        }
        const [w, h] = value.split('x');
        wrap.style.flex = 'none';
        wrap.style.width = `${w}px`;
        wrap.style.height = `${h}px`;
        wrap.style.margin = 'auto';
    }
    sizeSelect.addEventListener('change', () => {
        applyCanvasSize(sizeSelect.value);
        clearOnResize = true;
    });

    // ------------------------------------------------------------------
    // Guide image: an overlay fit to the canvas, with opacity and visibility
    // controls. It is never baked and hides during replay and recording, so
    // the output is exactly as if it did not exist.
    const guideBtn = $('guide-btn');
    const guideRow = $('guide-row');
    const guideFile = $('guide-file');
    const guideToggle = $('guide-toggle');
    let guideMesh = null;
    let guideAspect = 1;
    let guideVisible = true;
    let guideOpacity = 0.5;

    function fitGuide() {
        if (!guideMesh) return;
        const w = Math.min(stage.extentX * 2, stage.extentY * 2 * guideAspect);
        guideMesh.scale.set(w, w / guideAspect, 1);
    }

    function updateGuideVisibility() {
        if (!guideMesh) return;
        guideMesh.visible = guideVisible && !replaying;
        stage.draw();
    }

    guideBtn.addEventListener('click', () => {
        if (replaying) return;
        guideFile.click();
    });
    guideFile.addEventListener('change', () => {
        const file = guideFile.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            guideAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            if (guideMesh) {
                stage.remove(guideMesh);
                guideMesh.material.map?.dispose();
                guideMesh.material.dispose();
                guideMesh.geometry.dispose();
            }
            guideMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({
                    map: texture, transparent: true, opacity: guideOpacity, depthWrite: false,
                })
            );
            guideMesh.position.z = 1.4;
            stage.add(guideMesh);
            fitGuide();
            guideRow.style.display = '';
            guideToggle.style.display = '';
            updateGuideVisibility();
            URL.revokeObjectURL(url);
        };
        image.src = url;
        guideFile.value = '';
    });
    $('guide-opacity').addEventListener('input', e => {
        guideOpacity = parseFloat(e.target.value);
        if (guideMesh) {
            guideMesh.material.opacity = guideOpacity;
            stage.draw();
        }
    });
    guideToggle.addEventListener('click', () => {
        guideVisible = !guideVisible;
        guideToggle.classList.toggle('active', guideVisible);
        guideToggle.textContent = guideVisible ? 'On' : 'Off';
        updateGuideVisibility();
    });

    $('fullscreen-btn').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else layout.requestFullscreen();
    });

    // Toggling full screen restarts the canvas: the clear waits for the
    // resize, so the fresh gradient and scatter land on the new size.
    let clearOnResize = false;
    document.addEventListener('fullscreenchange', () => {
        clearOnResize = true;
        const inFullscreen = Boolean(document.fullscreenElement);
        sizeRow.style.display = inFullscreen ? '' : 'none';
        if (!inFullscreen) {
            sizeSelect.value = '';
            applyCanvasSize('');
        }
    });

    stage.onResize(() => {
        positionPreview();
        refreshPreview();
        fitGuide();
        if (clearOnResize && !replaying) {
            clearOnResize = false;
            clearAll();
        }
    });

    // ------------------------------------------------------------------
    applyRoll(trail[TRAIL_SIDE]);
    setDialColor(dialHue.value);
    setPanelOpen(true);
    positionPreview();
    // The first layout pass can land after init, when the stage still has no
    // size. A scatter drawn then collapses to a point and records a degenerate
    // stroke, so the first clear waits for the resize that sizes the stage.
    if (stage.extentX > 0.01) clearAll();
    else clearOnResize = true;
    requestAnimationFrame(() => { positionPreview(); refreshPreview(); });
}
