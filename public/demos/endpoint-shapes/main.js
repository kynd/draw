import { circleFromEnds, ovalFromEnds, rectFromEnds } from '../../lib/pathEffects.js';
import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';
import { seededSegment } from '../../lib/demo/strokePaths.js';

const MAKERS = [
    (a, b) => circleFromEnds(a, b),
    (a, b) => ovalFromEnds(a, b),
    (a, b) => rectFromEnds(a, b),
];

setupBlobShowcase({
    theme: 'vivid-dark',
    makeShape: (i, seed, { cx, cy }) => {
        const [a, b] = seededSegment(seed, { cx, cy, r: i === 0 ? 0.58 : 0.72 });
        // The circle runs center to edge, so its start is the slot's center.
        const start = i === 0 ? a.clone().lerp(b, 0.5) : a;
        const contour = MAKERS[i](start, b, seed);
        return contour && { contour, start, end: b };
    },
    makeRow: (i, ctx) => new ShapedBlobRenderer({ color: ctx.color }),
});
