import { Dial } from '../dial.js';
import { FrameLatch } from '../latch.js';
import { PALETTE_THEMES } from '../../ThemedPaletteMaker.js';
import { toolLabel } from '../toolRegistry.js';

const TEMPLATE = /* html */`
  <div class="dp-overlay-tr">
    <button id="adv-btn" class="dp-icon-btn active" title="Settings">
      <svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
    </button>
  </div>

  <div class="canvas-wrap">
    <canvas id="canvas"></canvas>
    <div class="dp-dials">
      <div id="dial-hue"></div>
      <div id="dial-width"></div>
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

    <div class="dp-sub-label">Drawing</div>
    <label class="dp-check"><input id="auto-check" type="checkbox" />Randomize tool on release</label>
    <label class="dp-check"><input id="trace-check" type="checkbox" />Show pointer trace</label>

    <div class="dp-sub-label">Replay</div>
    <div class="dp-btn-row">
      <button id="replay-btn" class="dp-btn secondary">Replay</button>
      <button id="record-btn" class="dp-btn secondary">Record</button>
      <button id="download-btn" class="dp-btn secondary">Download</button>
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
    <div style="display:flex; gap:8px; align-items:center">
      <div id="dial-h" class="small"></div>
      <select id="theme-select" class="dp-select"></select>
    </div>
    <div class="dp-btn-row" style="margin-top:8px">
      <button id="palette-reroll" class="dp-btn secondary">Reroll palette</button>
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

/** Injects the drawing tool's layout into `root` and returns it with its canvas. */
export function buildDrawingToolLayout({ root = document.body, square = false } = {}) {
    const layout = document.createElement('div');
    layout.className = 'demo-layout drawing-tool' + (square ? ' square' : '');
    layout.innerHTML = TEMPLATE;
    root.appendChild(layout);
    return { layout, canvas: layout.querySelector('#canvas') };
}

/**
 * The default UI: the settings panel, the three floating dials, and the
 * overlay button, wired as a client of the engine's API. Every handler is an API call
 * and every display update a subscription; nothing in the engine references
 * this file. Returns the floating dials, so an input adapter (MIDI) can drive
 * them.
 */
export function attachDrawingToolUi(tool, layout) {
    const $ = id => layout.querySelector('#' + id);
    const canvas = $('canvas');

    // While a UI handler mutates the tool, its own events skip the re-render:
    // the control being dragged already shows the value.
    let fromUi = false;
    const mutate = fn => { fromUi = true; try { fn(); } finally { fromUi = false; } };

    // ------------------------------------------------------------------
    // Pointer forwarding. The engine attaches no listeners; the UI's adapter
    // hands events over, gating pressure to pens.
    const toLocal = event => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            pressure: event.pointerType === 'pen' ? event.pressure : 0,
        };
    };
    canvas.addEventListener('pointerdown', event => {
        tool.pointerDown(toLocal(event));
        // Capturing an inactive pointer throws (a synthetic event's id is not
        // an active pointer), and the stroke must not depend on it.
        try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    });
    canvas.addEventListener('pointermove', event => tool.pointerMove(toLocal(event)));
    canvas.addEventListener('pointerup', () => tool.pointerUp());
    canvas.addEventListener('pointercancel', () => tool.pointerCancel());

    // Everything overlaid fades while the pen is down.
    tool.on('stroke-start', () => layout.classList.add('dp-ui-hidden'));
    tool.on('stroke-end', () => layout.classList.remove('dp-ui-hidden'));

    // ------------------------------------------------------------------
    // The floating dials, frame-latched. Hue and tool are bucketed: crossing
    // into a new bucket steps by the difference, so turning back retraces.
    // Width maps the dial position onto the width directly.
    const STEP = 6;
    let hueBucket = null;
    const hueLatch = new FrameLatch(v => {
        const bucket = Math.round(v / STEP);
        if (hueBucket === null) hueBucket = bucket;
        if (bucket === hueBucket) return;
        tool.stepPalette(bucket - hueBucket);
        hueBucket = bucket;
    });
    let toolBucket = Math.round(48 / STEP);
    const toolLatch = new FrameLatch(v => {
        const bucket = Math.round(v / STEP);
        if (bucket === toolBucket) return;
        tool.stepTool(bucket - toolBucket);
        toolBucket = bucket;
    });
    const dialHue = new Dial($('dial-hue'),
        { label: 'Hue', value: Math.floor(Math.random() * 128), onInput: v => hueLatch.set(v) });
    hueBucket = Math.round(dialHue.value / STEP);
    const WIDTH_MIN = 2, WIDTH_MAX = 60;
    const widthToDial = w => Math.round((w - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN) * 127);
    const widthLatch = new FrameLatch(v =>
        tool.setParams({ width: Math.round(WIDTH_MIN + (v / 127) * (WIDTH_MAX - WIDTH_MIN)) }));
    const dialWidth = new Dial($('dial-width'),
        { label: 'Width', value: widthToDial(tool.state.values.width),
          onInput: v => widthLatch.set(v) });
    const dialTool = new Dial($('dial-tool'),
        { label: 'Tool', value: 48, onInput: v => toolLatch.set(v) });

    // ------------------------------------------------------------------
    // Canvas section
    const clearBtn = $('clear-btn');
    clearBtn.addEventListener('click', () => {
        if (tool.state.replaying) return;
        tool.clear();
    });

    const autoCheck = $('auto-check');
    autoCheck.addEventListener('change', () => tool.setAutoRandomize(autoCheck.checked));
    const traceCheck = $('trace-check');
    traceCheck.addEventListener('change', () => tool.setPointerTrace(traceCheck.checked));

    // ------------------------------------------------------------------
    // Replay section
    const replayBtn = $('replay-btn');
    const recordBtn = $('record-btn');
    const downloadBtn = $('download-btn');

    replayBtn.addEventListener('click', () => {
        if (tool.state.replaying) { tool.stopReplay(); return; }
        tool.replay();
    });
    recordBtn.addEventListener('click', () => {
        if (tool.recordVideo()) recordBtn.classList.add('active');
    });
    downloadBtn.addEventListener('click', () => tool.downloadDrawing());

    function setReplayUi(on) {
        replayBtn.textContent = on ? 'Stop' : 'Replay';
        for (const el of [clearBtn, autoCheck, traceCheck, recordBtn, downloadBtn,
            guideBtn, guideToggle, advBtn]) {
            el.disabled = on;
        }
    }
    tool.on('replay-start', () => setReplayUi(true));
    tool.on('replay-end', () => setReplayUi(false));
    tool.on('record-start', () => setReplayUi(true));
    tool.on('record-end', () => { setReplayUi(false); recordBtn.classList.remove('active'); });

    // ------------------------------------------------------------------
    // Guide section: the UI decodes the file, the engine takes the image.
    const guideBtn = $('guide-btn');
    const guideRow = $('guide-row');
    const guideFile = $('guide-file');
    const guideToggle = $('guide-toggle');
    let guideVisible = true;

    guideBtn.addEventListener('click', () => {
        if (tool.state.replaying) return;
        guideFile.click();
    });
    guideFile.addEventListener('change', () => {
        const file = guideFile.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            tool.setGuideImage(image);
            guideRow.style.display = '';
            guideToggle.style.display = '';
            URL.revokeObjectURL(url);
        };
        image.src = url;
        guideFile.value = '';
    });
    $('guide-opacity').addEventListener('input', e => {
        tool.setGuideOpacity(parseFloat(e.target.value));
    });
    guideToggle.addEventListener('click', () => {
        guideVisible = !guideVisible;
        guideToggle.classList.toggle('active', guideVisible);
        guideToggle.textContent = guideVisible ? 'On' : 'Off';
        tool.setGuideVisible(guideVisible);
    });

    // ------------------------------------------------------------------
    // Color section
    const dialH = new Dial($('dial-h'),
        { label: 'H', min: 0, max: 360, value: Math.round(tool.state.palette.hue),
          onInput: v => mutate(() => tool.setPalette({ hue: v })) });
    const themeSelect = $('theme-select');
    for (const th of PALETTE_THEMES) {
        const o = document.createElement('option');
        o.value = th.id;
        o.textContent = th.label;
        themeSelect.appendChild(o);
    }
    themeSelect.value = tool.state.palette.theme;
    themeSelect.addEventListener('change', () =>
        mutate(() => tool.setPalette({ theme: themeSelect.value })));
    $('palette-reroll').addEventListener('click', () => tool.rerollPalette());

    function renderSwatches() {
        const { colorA, colorB, colors } = tool.state;
        const toolColors = $('tool-colors');
        toolColors.innerHTML = '';
        for (const hex of [colorA, colorB]) {
            const sw = document.createElement('div');
            sw.className = 'dp-swatch';
            sw.style.background = hex;
            toolColors.appendChild(sw);
        }
        const grid = $('palette-grid');
        grid.innerHTML = '';
        for (const hex of colors) {
            const cell = document.createElement('div');
            cell.className = 'dp-swatch-cell'
                + (hex === colorA || hex === colorB ? ' selected' : '');
            cell.style.background = hex;
            grid.appendChild(cell);
        }
    }

    // ------------------------------------------------------------------
    // Tool section
    const toolSelect = $('tool-select');
    tool.registry.forEach(entry => {
        const o = document.createElement('option');
        o.value = entry.id;
        o.textContent = toolLabel(entry);
        toolSelect.appendChild(o);
    });
    toolSelect.addEventListener('change', () => tool.selectTool(toolSelect.value));
    // The dial is a shortcut through the same order as the dropdown, not a reroll.
    const dialToolAdv = new Dial($('dial-tool-adv'),
        { label: 'Tool', min: 0, max: tool.registry.length - 1, value: 0,
          onInput: i => tool.selectTool(tool.registry[i].id) });

    // ------------------------------------------------------------------
    // Parameters, rendered from the engine's spec: one generic mechanism, no
    // special cases for width or pressure.
    function paramRow(container, spec, value) {
        const label = spec.key.replace(/^./, c => c.toUpperCase());
        const row = document.createElement('div');
        row.className = 'dp-row';
        const lab = document.createElement('span');
        lab.className = 'dp-label';
        lab.textContent = label;
        if (spec.pick) {
            const select = document.createElement('select');
            select.className = 'dp-select';
            for (const option of spec.pick) {
                const o = document.createElement('option');
                o.value = option;
                o.textContent = option;
                select.appendChild(o);
            }
            select.value = value;
            select.addEventListener('change', () =>
                mutate(() => tool.setParams({ [spec.key]: select.value })));
            row.append(lab, select);
        } else {
            const step = spec.step ?? (spec.max - spec.min) / 100;
            const decimals = step >= 1 ? 0 : 2;
            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'dp-range';
            input.min = spec.min; input.max = spec.max; input.step = step; input.value = value;
            const val = document.createElement('span');
            val.className = 'dp-val';
            const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
            show();
            input.addEventListener('input', () => {
                show();
                mutate(() => tool.setParams({ [spec.key]: parseFloat(input.value) }));
            });
            row.append(lab, input, val);
        }
        container.appendChild(row);
    }

    function renderParams() {
        const container = $('tool-params');
        container.innerHTML = '';
        const values = tool.state.values;
        for (const spec of tool.paramSpec) paramRow(container, spec, values[spec.key]);
    }

    // ------------------------------------------------------------------
    // Sync: the engine's events keep the panel truthful whatever moved the
    // state — a dial, MIDI, auto mode, a replay ending.
    function syncPane() {
        const state = tool.state;
        toolSelect.value = state.toolId;
        const index = tool.registry.findIndex(entry => entry.id === state.toolId);
        if (index >= 0) dialToolAdv.set(index, false);
        dialH.set(Math.round(state.palette.hue), false);
        themeSelect.value = state.palette.theme;
        renderParams();
        renderSwatches();
    }
    tool.on('tool', () => {
        dialWidth.set(widthToDial(tool.state.values.width), false);
        if (!fromUi) syncPane();
    });
    tool.on('palette', () => {
        if (fromUi) { renderSwatches(); return; }
        dialH.set(Math.round(tool.state.palette.hue), false);
        themeSelect.value = tool.state.palette.theme;
        renderSwatches();
    });
    tool.on('clear', () => { if (!fromUi) syncPane(); });

    // ------------------------------------------------------------------
    // The panel toggle
    const advBtn = $('adv-btn');
    const sidePane = $('side-pane');
    let panelOpen = true;
    function setPanelOpen(open) {
        panelOpen = open;
        advBtn.classList.toggle('active', open);
        sidePane.style.display = open ? '' : 'none';
        if (open) syncPane();
    }
    advBtn.addEventListener('click', () => {
        if (tool.state.replaying) return;
        setPanelOpen(!panelOpen);
    });

    // ------------------------------------------------------------------
    // Full screen and the canvas size, both layout concerns: the engine only
    // hears the resize, and the fresh clear waits for it.
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
        tool.clearOnNextResize();
    });
    $('fullscreen-btn').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else layout.requestFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
        tool.clearOnNextResize();
        const inFullscreen = Boolean(document.fullscreenElement);
        sizeRow.style.display = inFullscreen ? '' : 'none';
        if (!inFullscreen) {
            sizeSelect.value = '';
            applyCanvasSize('');
        }
    });

    setPanelOpen(true);
    return { dialHue, dialWidth, dialTool, setPanelOpen };
}
