/**
 * Applies the newest value once per animation frame. A dial drag or a MIDI
 * stream can deliver many values between frames; the latch keeps only the
 * latest and applies it on the next frame, so an update never runs more than
 * once per frame and never at input time.
 */
export class FrameLatch {
    constructor(apply) {
        this.apply = apply;
        this._pending = undefined;
        this._raf = 0;
    }

    set(value) {
        this._pending = value;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            const value = this._pending;
            this._pending = undefined;
            this.apply(value);
        });
    }
}
