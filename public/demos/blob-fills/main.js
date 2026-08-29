import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    controls: { spikeAmp: 2, sharp: 1, wobble: 3 },
    makeRow: (i, ctx) => {
        if (i === 0) return new ShapedBlobRenderer({ color: ctx.color });
        if (i === 1) {
            return new ShapedBlobRenderer({
                color: ctx.color, spikes: 14,
                spikeAmp: ctx.values.spikeAmp, sharp: ctx.values.sharp,
            });
        }
        return new ShapedBlobRenderer({
            color: ctx.color, wobble: ctx.values.wobble, wobbleFreq: 5,
        });
    },
});
