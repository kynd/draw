/**
 * A listener for every connected MIDI input.
 *
 * `start` requests MIDI access and subscribes to every input port, including ports
 * that appear after the page loads. Each message reaches `onMessage` raw and parsed;
 * `onDevices` receives the current input list whenever it changes. A browser without
 * Web MIDI makes `start` reject, and the caller shows the error.
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The conventional name of a MIDI note number, middle C (60) being C4. */
export function noteName(n) {
    return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

export class MidiInput {
    constructor({ onMessage = () => {}, onDevices = () => {} } = {}) {
        this.onMessage = onMessage;
        this.onDevices = onDevices;
        this.access = null;
    }

    async start() {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI is not available in this browser.');
        }
        this.access = await navigator.requestMIDIAccess();
        this._subscribe();
        this.access.onstatechange = () => this._subscribe();
    }

    _subscribe() {
        const inputs = [...this.access.inputs.values()];
        inputs.forEach(input => {
            input.onmidimessage = event => this.onMessage(MidiInput.parse(event));
        });
        this.onDevices(inputs.map(input => ({
            id: input.id,
            name: input.name || 'unnamed',
            manufacturer: input.manufacturer || '',
        })));
    }

    /**
     * Reads one message event into { time, port, data, type, channel, detail }.
     * `channel` is 1-based, and null for system messages, which have none.
     */
    static parse(event) {
        const data = [...event.data];
        const status = data[0] ?? 0;
        const kind = status >> 4;
        const channel = (status & 0x0f) + 1;
        let type = 'unknown';
        let detail = '';
        if (kind === 0x8 || (kind === 0x9 && data[2] === 0)) {
            type = 'note off'; detail = `${noteName(data[1])} velocity ${data[2]}`;
        } else if (kind === 0x9) {
            type = 'note on'; detail = `${noteName(data[1])} velocity ${data[2]}`;
        } else if (kind === 0xa) {
            type = 'poly aftertouch'; detail = `${noteName(data[1])} pressure ${data[2]}`;
        } else if (kind === 0xb) {
            type = 'control change'; detail = `controller ${data[1]} value ${data[2]}`;
        } else if (kind === 0xc) {
            type = 'program change'; detail = `program ${data[1]}`;
        } else if (kind === 0xd) {
            type = 'channel pressure'; detail = `pressure ${data[1]}`;
        } else if (kind === 0xe) {
            type = 'pitch bend'; detail = `value ${((data[2] << 7) | data[1]) - 8192}`;
        } else if (kind === 0xf) {
            type = 'system'; detail = `status 0x${status.toString(16)}`;
        }
        return {
            time: event.timeStamp,
            port: event.target?.name || '',
            data,
            type,
            channel: kind === 0xf ? null : channel,
            detail,
        };
    }
}
