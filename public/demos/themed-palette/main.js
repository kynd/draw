import { ThemedPaletteMaker, PALETTE_THEMES } from '../../lib/ThemedPaletteMaker.js';
import { hueSwatchColor } from '../../lib/color.js';
import { applyEmbeddedLayout } from '../../lib/demo/viewport.js';

applyEmbeddedLayout();

const state = { hue: 24, count: 5, theme: 'mono', seed: 1 };

const gridEl = document.getElementById('grid');
const readout = document.getElementById('readout');
const toast = document.getElementById('toast');
const countEl = document.getElementById('count');
const themeEl = document.getElementById('theme');

themeEl.innerHTML = PALETTE_THEMES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');

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

    const { x, y } = handleXY(state.hue);
    ringCtx.beginPath();
    ringCtx.arc(x, y, 11, 0, Math.PI * 2);
    ringCtx.fillStyle = ringColor(state.hue);
    ringCtx.fill();
    ringCtx.strokeStyle = '#ffffff';
    ringCtx.lineWidth = 2.5;
    ringCtx.stroke();
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

let dragging = false;

function startDrag(e) {
    const { x, y } = ringPoint(e);
    const p = handleXY(state.hue);
    const onRing = Math.hypot(x - RCX, y - RCY) > R_IN - 10;
    if (!onRing && Math.hypot(x - p.x, y - p.y) > 18) return;
    dragging = true;
    state.hue = pointerHue(e);
    generate();
}
function moveDrag(e) {
    if (!dragging) return;
    state.hue = pointerHue(e);
    generate();
}
function endDrag() { dragging = false; }

ring.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);
ring.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e); }, { passive: false });
window.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    moveDrag(e);
}, { passive: false });
window.addEventListener('touchend', endDrag);

// ── Palette grid ─────────────────────────────────────────────────────────────

function generate() {
    const palette = new ThemedPaletteMaker(state).generate();

    gridEl.style.gridTemplateColumns = `repeat(${palette.length}, 1fr)`;
    gridEl.style.gridTemplateRows = '1fr';
    gridEl.innerHTML = palette.entries.map(e => {
        const ink = e.L > 0.58 ? '#111111' : '#ffffff';
        const lch = `L ${e.L.toFixed(3)}  C ${e.C.toFixed(3)}  H ${Math.round(e.H)}`;
        return `<div class="pm-cell" style="background:${e.hex};color:${ink}" data-hex="${e.hex}">`
            + `<span>${e.hex}</span><span class="pm-lch">${lch}</span></div>`;
    }).join('');

    readout.innerHTML =
        `<span>hue<strong>${Math.round(state.hue)}</strong></span>` +
        `<span>colors<strong>${palette.length}</strong></span>` +
        `<span>theme<strong>${state.theme}</strong></span>` +
        `<span>seed<strong>${state.seed}</strong></span>`;

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

countEl.addEventListener('input', () => {
    state.count = parseInt(countEl.value, 10);
    document.getElementById('count-val').textContent = countEl.value;
    generate();
});

themeEl.addEventListener('change', () => {
    state.theme = themeEl.value;
    generate();
});

document.getElementById('reroll').addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 1e9);
    generate();
});

generate();
