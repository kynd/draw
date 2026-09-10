import { diamondFromEnds, triangleFromEnds } from '../../lib/pathEffects.js';
import { SlitScanBlobRenderer, slitLineFromEnds } from '../../lib/renderers/SlitScanBlobRenderer.js';
import { setupShapeBoard } from '../../lib/demo/shapeBoard.js';

setupShapeBoard({
    theme: 'vivid-wheel',
    controls: { mix: 0.65 },
    shapes: [
        { label: 'Diamond', make: (a, b) => diamondFromEnds(a, b) },
        { label: 'Triangle 30-60-90',
          make: (a, b, seed) => triangleFromEnds(a, b, { angles: [30, 60, 90], seed }) },
        { label: 'Triangle 45-45-90',
          make: (a, b, seed) => triangleFromEnds(a, b, { angles: [45, 45, 90], seed }) },
    ],
    makeRenderer: ctx => new SlitScanBlobRenderer({
        color: ctx.color,
        background: ctx.texture,
        mix: ctx.values.mix,
        ...slitLineFromEnds(ctx.start, ctx.end, ctx.seed),
    }),
});
