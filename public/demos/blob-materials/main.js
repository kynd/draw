import { MaterialBlobRenderer } from '../../lib/renderers/MaterialBlobRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

setupBlobShowcase({
    background: true,
    controls: { bend: 3, relief: 2 },
    makeRow: (i, ctx) => {
        const shared = {
            background: ctx.background,
            bend: ctx.values.bend,
            relief: ctx.values.relief,
        };
        if (i === 0) return new MaterialBlobRenderer({ ...shared, mode: 'metal' });
        if (i === 1) return new MaterialBlobRenderer({ ...shared, mode: 'glass', tint: '#dff0f5' });
        return new MaterialBlobRenderer({ ...shared, mode: 'facet', tint: '#e5eef2', relief: ctx.values.relief * 1.2, facets: 4 });
    },
});
