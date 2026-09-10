import { diamondFromEnds, triangleFromEnds } from '../../lib/pathEffects.js';
import { SlitScanBlobRenderer, slitLineFromEnds } from '../../lib/renderers/SlitScanBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';
import { seededSegment } from '../../lib/demo/strokePaths.js';

const MAKERS = [
    (a, b) => diamondFromEnds(a, b),
    (a, b, seed) => triangleFromEnds(a, b, { angles: [30, 60, 90], seed }),
    (a, b, seed) => triangleFromEnds(a, b, { angles: [45, 45, 90], seed }),
];

setupBlobShowcase({
    theme: 'vivid-wheel',
    background: true,
    controls: { mix: 2 },
    makeShape: (i, seed, { cx, cy }) => {
        const [a, b] = seededSegment(seed, { cx, cy, r: 0.72 });
        const contour = MAKERS[i](a, b, seed);
        return contour && { contour, start: a, end: b };
    },
    makeRow: (i, ctx) => new SlitScanBlobRenderer({
        color: ctx.color,
        background: ctx.background,
        mix: ctx.values.mix,
        ...slitLineFromEnds(ctx.start, ctx.end, ctx.seed),
    }),
});
