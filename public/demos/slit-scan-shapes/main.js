import { circleFromEnds, ovalFromEnds, rectFromEnds } from '../../lib/pathEffects.js';
import { SlitScanBlobRenderer, slitLineFromEnds } from '../../lib/renderers/SlitScanBlobRenderer.js';
import { setupShapeBoard } from '../../lib/demo/shapeBoard.js';

setupShapeBoard({
    theme: 'vivid-dark',
    controls: { mix: 0.65 },
    shapes: [
        { label: 'Circle', make: (a, b) => circleFromEnds(a, b) },
        { label: 'Oval', make: (a, b) => ovalFromEnds(a, b) },
        { label: 'Rectangle', make: (a, b) => rectFromEnds(a, b) },
    ],
    makeRenderer: ctx => new SlitScanBlobRenderer({
        color: ctx.color,
        background: ctx.texture,
        mix: ctx.values.mix,
        ...slitLineFromEnds(ctx.start, ctx.end, ctx.seed),
    }),
});
