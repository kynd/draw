import { WashBlobRenderer } from '../../lib/renderers/WashBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    background: true,
    controls: {},
    makeRow: (i, ctx) => {
        if (i === 0) {
            return new WashBlobRenderer({
                color: ctx.color, background: ctx.blurred,
                pigment: 0.35, feather: 0.1, rim: 0.18, flow: 0.03, wet: 0.85,
            });
        }
        if (i === 1) {
            return new WashBlobRenderer({
                color: ctx.color, background: ctx.blurred,
                pigment: 0.6, feather: 0.045, rim: 0.22, flow: 0.05, wet: 0.5,
            });
        }
        return new WashBlobRenderer({
            color: ctx.color, background: ctx.background,
            pigment: 0.97, feather: 0.012, rim: 0.1, flow: 0.09, wet: 0.12,
        });
    },
});
