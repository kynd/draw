import { Palette } from '../../lib/Palette.js';
import { hueSwatchColor } from '../../lib/color.js';
import { applyEmbeddedLayout } from '../../lib/demo/viewport.js';

applyEmbeddedLayout();

const state = {
    hues: [24, 114, 204, 294],
    nLum: 5,
    lumHigh: 0.88,
    lumLow: 0.28,
    vibHigh: 0.95,
    vibLow: 0.30,
};

const gridEl = document.getElementById('grid');
const readout = document.getElementById('readout');
const toast = document.getElementById('toast');

const ctrl = {
    nhues: document.getElementById('nhues'),
    nlum: document.getElementById('nlum'),
    'lum-high': document.getElementById('lum-high'),
    'lum-low': document.getElementById('lum-low'),
    'vib-high': document.getElementById('vib-high'),
    'vib-low': document.getElementById('vib-low'),
};

// ── Hue ring ─────────────────────────────────────────────────────────────────

const ring = document.getElementById('ring');
const ringCtx = ring.getContext('2d');
const RW = ring.width, RH = ring.height;
const RCX = RW / 2, RCY = RH / 2;
const R_OUT = RW / 2 - 4;
const R_IN = R_OUT - 30;
const R_MID = (R_OUT + R_IN) / 2;

// hueSwatchColor runs a gamut search per hue; 360 of them is worth caching.
const RING_SWATCH = new Array(360).fill(null);
function ringColor(h) {
    const i = ((Math.round(h) % 360) + 360) % 360;
    if (!RING_SWATCH[i]) RING_SWATCH[i] = hueSwatchColor(i);
    return RING_SWATCH[i];
}

function hueToAngle(h) { return (h / 360) * Math.PI * 2 - Math.PI / 2; }
function handleXY(h) {
    const a = hueToAngle(h);
    return { x: RCX + Math.cos(a) * R_MID, y: RCY + Math.sin(a) * R_MID };
}

function drawRing() {
    ringCtx.clearRect(0, 0, RW, RH);

    for (let i = 0; i < 360; i++) {
        const a0 = (i / 360) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1.5) / 360) * Math.PI * 2 - Math.PI / 2;
        ringCtx.beginPath();
        ringCtx.moveTo(RCX + Math.cos(a0) * R_IN, RCY + Math.sin(a0) * R_IN);
        ringCtx.arc(RCX, RCY, R_OUT, a0, a1);
        ringCtx.arc(RCX, RCY, R_IN, a1, a0, true);
        ringCtx.closePath();
        ringCtx.fillStyle = ringColor(i);
        ringCtx.fill();
    }

    state.hues.forEach((hue, idx) => {
        const { x, y } = handleXY(hue);
        ringCtx.beginPath();
        ringCtx.arc(x, y, 11, 0, Math.PI * 2);
        ringCtx.fillStyle = ringColor(hue);
        ringCtx.fill();
        ringCtx.strokeStyle = '#ffffff';
        ringCtx.lineWidth = 2.5;
        ringCtx.stroke();
        ringCtx.fillStyle = '#111111';
        ringCtx.font = 'bold 9px Sora, sans-serif';
        ringCtx.textAlign = 'center';
        ringCtx.textBaseline = 'middle';
        ringCtx.fillText(String(idx + 1), x, y);
    });
}

function ringPoint(e) {
    const rect = ring.getBoundingClientRect();
    const scale = RW / rect.width;
    const src = e.touches ? e.touches[0] : e;
    return {
        x: (src.clientX - rect.left) * scale,
        y: (src.clientY - rect.top) * scale,
    };
}

function pointerHue(e) {
    const { x, y } = ringPoint(e);
    return ((Math.atan2(y - RCY, x - RCX) + Math.PI / 2) / (Math.PI * 2) * 360 + 360) % 360;
}

function nearestHandle(e) {
    const { x, y } = ringPoint(e);
    let best = -1, bestD = Infinity;
    state.hues.forEach((h, idx) => {
        const p = handleXY(h);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestD) { bestD = d; best = idx; }
    });
    return bestD < 18 ? best : -1;
}

let dragIdx = -1;

function startDrag(e) {
    dragIdx = nearestHandle(e);
    if (dragIdx < 0) return;
    state.hues[dragIdx] = pointerHue(e);
    generate();
}
function moveDrag(e) {
    if (dragIdx < 0) return;
    state.hues[dragIdx] = pointerHue(e);
    generate();
}
function endDrag() { dragIdx = -1; }

ring.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);
ring.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e); }, { passive: false });
window.addEventListener('touchmove', e => {
    if (dragIdx < 0) return;
    e.preventDefault();
    moveDrag(e);
}, { passive: false });
window.addEventListener('touchend', endDrag);

// ── Hue count ────────────────────────────────────────────────────────────────

/** Adds new hues into the widest gap, so raising the count never stacks two together. */
function setHueCount(n) {
    while (state.hues.length < n) {
        const sorted = state.hues.slice().sort((a, b) => a - b);
        let gapStart = sorted[0], maxGap = 0;
        for (let i = 0; i < sorted.length; i++) {
            const a = sorted[i];
            const b = sorted[(i + 1) % sorted.length] + (i === sorted.length - 1 ? 360 : 0);
            if (b - a > maxGap) { maxGap = b - a; gapStart = a; }
        }
        state.hues.push((gapStart + maxGap / 2) % 360);
    }
    state.hues.length = n;
}

// ── Palette grid ─────────────────────────────────────────────────────────────

let palette = null;

function generate() {
    palette = Palette.fromHues(state.hues, {
        nLum: state.nLum,
        lumHigh: state.lumHigh,
        lumLow: state.lumLow,
        vibHigh: state.vibHigh,
        vibLow: state.vibLow,
    });

    // fromHues emits hues in order, all steps of one hue before the next, so the flat
    // list drops straight into a grid of one row per hue.
    gridEl.style.gridTemplateColumns = `repeat(${state.nLum}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${state.hues.length}, 1fr)`;
    gridEl.innerHTML = palette.entries.map(e => {
        const ink = e.L > 0.58 ? '#111111' : '#ffffff';
        const lch = `L ${e.L.toFixed(3)}  C ${e.C.toFixed(3)}  H ${Math.round(e.H)}`;
        return `<div class="pm-cell" style="background:${e.hex};color:${ink}" data-hex="${e.hex}">`
            + `<span>${e.hex}</span><span class="pm-lch">${lch}</span></div>`;
    }).join('');

    readout.innerHTML =
        `<span>hues<strong>${state.hues.length}</strong></span>` +
        `<span>steps<strong>${state.nLum}</strong></span>` +
        `<span>colors<strong>${palette.length}</strong></span>`;

    drawRing();
}

let toastTimer = null;
gridEl.addEventListener('click', e => {
    const cell = e.target.closest('.pm-cell');
    if (!cell) return;
    const hex = cell.dataset.hex;
    navigator.clipboard?.writeText(hex).catch(() => {});
    toast.textContent = `${hex} copied`;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1100);
});

// ── Controls ─────────────────────────────────────────────────────────────────

const decimals = id => (id.startsWith('lum') || id.startsWith('vib') ? 2 : 0);

function syncLabel(el) {
    const label = document.getElementById(`${el.id}-val`);
    if (label) label.textContent = parseFloat(el.value).toFixed(decimals(el.id));
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        switch (el.id) {
            case 'nhues': setHueCount(v); break;
            case 'nlum': state.nLum = v; break;
            case 'lum-high':
                state.lumHigh = Math.max(v, state.lumLow + 0.05);
                ctrl['lum-high'].value = String(state.lumHigh);
                break;
            case 'lum-low':
                state.lumLow = Math.min(v, state.lumHigh - 0.05);
                ctrl['lum-low'].value = String(state.lumLow);
                break;
            case 'vib-high':
                state.vibHigh = Math.max(v, state.vibLow);
                ctrl['vib-high'].value = String(state.vibHigh);
                break;
            case 'vib-low':
                state.vibLow = Math.min(v, state.vibHigh);
                ctrl['vib-low'].value = String(state.vibLow);
                break;
        }
        Object.values(ctrl).forEach(syncLabel);
        generate();
    });
});

document.getElementById('even-btn').addEventListener('click', () => {
    const n = state.hues.length;
    const base = state.hues[0];
    state.hues = Array.from({ length: n }, (_, i) => (base + (i * 360) / n) % 360);
    generate();
});

Object.values(ctrl).forEach(syncLabel);
generate();
