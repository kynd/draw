import { circleFromEnds, ovalFromEnds, rectFromEnds } from '../../lib/pathEffects.js';
import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { setupShapeBoard } from '../../lib/demo/shapeBoard.js';

setupShapeBoard({
    theme: 'vivid-dark',
    shapes: [
        { label: 'Circle', make: (a, b) => circleFromEnds(a, b) },
        { label: 'Oval', make: (a, b) => ovalFromEnds(a, b) },
        { label: 'Rectangle', make: (a, b) => rectFromEnds(a, b) },
    ],
    makeRenderer: ctx => new ShapedBlobRenderer({ color: ctx.color }),
});
