import { WashBlobRenderer } from '../../lib/renderers/WashBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    background: true,
    controls: {},
    makeRow: (i, ctx) => {
        if (i === 0) {
            return new WashBlobRenderer({
                color: ctx.color, background: ctx.blurred,
                pigment: 0.35, feather: 0.1, rim: 0.5,
            });
        }
        if (i === 1) {
            return new WashBlobRenderer({
                color: ctx.color, background: ctx.blurred,
                pigment: 0.6, feather: 0.045, rim: 0.4,
            });
        }
        return new WashBlobRenderer({
            color: ctx.color, background: ctx.background,
            pigment: 0.94, feather: 0.012, rim: 0.15,
        });
    },
});
