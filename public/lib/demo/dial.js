/**
 * A minimal rotary control: a circle and a line. The sweep runs from the bottom
 * left (0) clockwise over the top to the bottom right (127), like a MIDI control.
 * Dragging vertically from the dial changes the value; `set` moves it
 * programmatically, as a MIDI message does. Both fire `onInput` with the integer
 * value.
 */
export class Dial {
    constructor(element, { label = '', value = 0, onInput = () => {} } = {}) {
        this.onInput = onInput;
        this.label = label;
        this.value = -1;

        element.classList.add('dp-dial');
        element.innerHTML = `
            <svg viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="rgba(0,0,0,0.45)" />
                <line x1="28" y1="28" x2="28" y2="7" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
            </svg>
            <div class="dp-dial-label"></div>`;
        this._line = element.querySelector('line');
        this._labelEl = element.querySelector('.dp-dial-label');

        let startY = 0, startValue = 0, dragging = false;
        element.addEventListener('pointerdown', event => {
            dragging = true;
            startY = event.clientY;
            startValue = this.value;
            try { element.setPointerCapture(event.pointerId); } catch (e) {}
            event.preventDefault();
        });
        element.addEventListener('pointermove', event => {
            if (!dragging) return;
            this.set(Math.round(startValue + (startY - event.clientY) * 0.75));
        });
        const stop = () => { dragging = false; };
        element.addEventListener('pointerup', stop);
        element.addEventListener('pointercancel', stop);

        this.set(value, false);
    }

    /** Sets the value (clamped integer 0..127) and fires onInput unless told not to. */
    set(value, fire = true) {
        const v = Math.max(0, Math.min(127, Math.round(value)));
        if (v === this.value) return;
        this.value = v;
        const phi = (v / 127 * 270 - 135) * Math.PI / 180;
        this._line.setAttribute('x2', (28 + 21 * Math.sin(phi)).toFixed(2));
        this._line.setAttribute('y2', (28 - 21 * Math.cos(phi)).toFixed(2));
        this._labelEl.textContent = `${this.label} ${v}`;
        if (fire) this.onInput(v);
    }
}
