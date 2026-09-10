import { diamondFromEnds, triangleFromEnds } from '../../lib/pathEffects.js';
import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { setupShapeBoard } from '../../lib/demo/shapeBoard.js';

setupShapeBoard({
    theme: 'vivid-wheel',
    shapes: [
        { label: 'Diamond', make: (a, b) => diamondFromEnds(a, b) },
        { label: 'Triangle 30-60-90',
          make: (a, b, seed) => triangleFromEnds(a, b, { angles: [30, 60, 90], seed }) },
        { label: 'Triangle 45-45-90',
          make: (a, b, seed) => triangleFromEnds(a, b, { angles: [45, 45, 90], seed }) },
    ],
    makeRenderer: ctx => new ShapedBlobRenderer({ color: ctx.color }),
});
