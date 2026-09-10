import { diamondFromEnds, triangleFromEnds } from '../../lib/pathEffects.js';
import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';
import { seededSegment } from '../../lib/demo/strokePaths.js';

const MAKERS = [
    (a, b) => diamondFromEnds(a, b),
    (a, b, seed) => triangleFromEnds(a, b, { angles: [30, 60, 90], seed }),
    (a, b, seed) => triangleFromEnds(a, b, { angles: [45, 45, 90], seed }),
];

setupBlobShowcase({
    theme: 'vivid-wheel',
    makeShape: (i, seed, { cx, cy }) => {
        const [a, b] = seededSegment(seed, { cx, cy, r: 0.72 });
        const contour = MAKERS[i](a, b, seed);
        return contour && { contour, start: a, end: b };
    },
    makeRow: (i, ctx) => new ShapedBlobRenderer({ color: ctx.color }),
});
