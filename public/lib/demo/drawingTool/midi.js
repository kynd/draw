import { MidiInput } from '../midi.js';

const STEP = 6;

/**
 * The MIDI adapter, an input source parallel to the UI: control change 16
 * steps the palette, 17 steps the tool. Given the default UI's floating dials
 * it drives those, so the knobs and the dials stay one control; without them
 * it buckets the controller values itself and calls the engine directly.
 */
export function bindMidi(tool, dials = null) {
    const buckets = new Map();
    const stepFrom = (cc, value, step) => {
        const bucket = Math.round(value / STEP);
        if (!buckets.has(cc)) { buckets.set(cc, bucket); return; }
        const previous = buckets.get(cc);
        if (bucket === previous) return;
        step(bucket - previous);
        buckets.set(cc, bucket);
    };

    const midi = new MidiInput({
        onMessage: m => {
            console.log('[midi]', m.type, 'ch', m.channel, m.detail, m.data, m.port);
            if (m.type !== 'control change') return;
            const [, cc, value] = m.data;
            if (cc === 16) {
                if (dials?.dialHue) dials.dialHue.set(value);
                else stepFrom(cc, value, steps => tool.stepPalette(steps));
            } else if (cc === 17) {
                if (dials?.dialTool) dials.dialTool.set(value);
                else stepFrom(cc, value, steps => tool.stepTool(steps));
            }
        },
        onDevices: inputs => console.log('[midi] inputs:',
            inputs.map(i => i.name).join(', ') || 'none'),
    });
    midi.start()
        .then(() => console.log('[midi] access granted'))
        .catch(err => console.log('[midi] unavailable:', err.message));
    return midi;
}
