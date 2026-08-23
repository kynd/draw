/**
 * Sizes a demo's drawing surface.
 *
 * A demo has two lives. Embedded in a page it sits in a fixed 960×540 iframe, because
 * the page layout reserves exactly that. Opened full size it fills the browser window
 * and keeps filling it as the window changes.
 *
 * Either way the surface is not the window: the control panel takes a fixed strip on
 * the right, so the canvas is whatever the stage is left with. This observes the stage
 * element rather than the window, which makes both cases the same measurement.
 *
 * `?embedded` in the URL selects the fixed size.
 */

/**
 * Pins the demo layout to the embedded size when the URL asks for it.
 *
 * Demos that draw with WebGL get this from `Viewport`. Demos with no canvas at all —
 * a palette grid, a DOM-only stage — call it directly, so both kinds respond to
 * `?embedded` the same way.
 *
 * @returns {boolean} whether the demo is embedded.
 */
export function applyEmbeddedLayout() {
    const embedded = new URLSearchParams(location.search).has('embedded');
    if (embedded) document.querySelector('.demo-layout')?.classList.add('embedded');
    return embedded;
}

export class Viewport {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object}  [opts]
     * @param {number}  [opts.maxPixelRatio]  Cap on devicePixelRatio, to bound cost.
     */
    constructor(canvas, { maxPixelRatio = 2 } = {}) {
        this.canvas = canvas;
        this.wrap = canvas.closest('.canvas-wrap') ?? canvas.parentElement;
        this.layout = canvas.closest('.demo-layout');
        this.maxPixelRatio = maxPixelRatio;
        this._listeners = [];
        this.embedded = applyEmbeddedLayout();
        this._measure();

        new ResizeObserver(() => {
            if (this._measure()) {
                this._listeners.forEach(fn => fn(this.pixelWidth, this.pixelHeight));
            }
        }).observe(this.wrap);
    }

    /** CSS width of the stage. */
    get width() { return this._width; }
    /** CSS height of the stage. */
    get height() { return this._height; }
    /** Backing-store scale actually in use. */
    get pixelRatio() { return this._pixelRatio; }
    /** Backing-store pixel dimensions — what a renderer should be sized to. */
    get pixelWidth() { return Math.round(this._width * this._pixelRatio); }
    get pixelHeight() { return Math.round(this._height * this._pixelRatio); }

    /** Registers a callback fired after each size change. */
    onResize(fn) { this._listeners.push(fn); return this; }

    /** @returns {boolean} whether anything actually changed. */
    _measure() {
        const width = Math.max(1, Math.round(this.wrap.clientWidth));
        const height = Math.max(1, Math.round(this.wrap.clientHeight));
        const pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);

        if (width === this._width && height === this._height && pixelRatio === this._pixelRatio) {
            return false;
        }
        this._width = width;
        this._height = height;
        this._pixelRatio = pixelRatio;
        return true;
    }
}
