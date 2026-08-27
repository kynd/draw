import { PaintBlobRenderer } from '../../lib/renderers/PaintBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    controls: { relief: 2, gloss: 2 },
    makeRow: (i, ctx) => {
        const relief = ctx.values.relief;
        const gloss = ctx.values.gloss;
        if (i === 0) {
            return new PaintBlobRenderer({
                color: ctx.color, fade: 0.6, relief: relief * 0.15,
                gloss: gloss * 0.25, edgeSoft: 0.1, noiseFreq: 3.5,
            });
        }
        if (i === 1) {
            return new PaintBlobRenderer({
                color: ctx.color, fade: 0.12, relief: relief * 0.35,
                gloss: gloss * 0.6, edgeSoft: 0.02, noiseFreq: 3,
            });
        }
        return new PaintBlobRenderer({
            color: ctx.color, fade: 0.05, relief, ridged: true,
            gloss, edgeSoft: 0.025, noiseFreq: 4.5,
        });
    },
});
