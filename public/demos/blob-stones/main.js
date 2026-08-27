import { StoneBlobRenderer } from '../../lib/renderers/StoneBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    controls: { relief: 2 },
    makeRow: (i, ctx) => {
        const relief = ctx.values.relief;
        if (i === 0) {
            return new StoneBlobRenderer({
                mode: 'rock', color: ctx.color, colorB: ctx.color2, relief,
            });
        }
        if (i === 1) {
            return new StoneBlobRenderer({
                mode: 'marble', color: ctx.color, colorB: ctx.color2, relief,
            });
        }
        return new StoneBlobRenderer({
            mode: 'sand', color: ctx.color, colorB: ctx.color2, relief,
        });
    },
});
