import { PaintBlobRenderer } from '../../lib/renderers/PaintBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    controls: { relief: 2, gloss: 2 },
    makeRow: (i, ctx) => {
        const relief = ctx.values.relief;
        const gloss = ctx.values.gloss;
        if (i === 0) {
            return new PaintBlobRenderer({
                color: ctx.color, colorB: ctx.color2, fade: 0.5, relief: relief * 0.15, swell: 0.8,
                gloss: gloss * 0.2, edgeSoft: 0.03, dry: 0.8, noiseFreq: 3.5,
            });
        }
        if (i === 1) {
            return new PaintBlobRenderer({
                color: ctx.color, colorB: ctx.color2, fade: 0.12, relief: relief * 0.4, swell: 0.85,
                gloss: gloss * 0.6, edgeSoft: 0.02, noiseFreq: 3,
            });
        }
        return new PaintBlobRenderer({
            color: ctx.color, colorB: ctx.color2, fade: 0.05, relief, swell: 0.7, ridged: true,
            gloss, edgeSoft: 0.025, noiseFreq: 3.5,
        });
    },
});
