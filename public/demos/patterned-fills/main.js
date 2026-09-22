import { PatternedFillRenderer } from '../../lib/renderers/PatternedFillRenderer.js';
import { setupBlobShowcase } from '../../lib/demo/blobShowcase.js';

const PATTERNS = ['dots', 'squares', 'waves'];

setupBlobShowcase({
    scheme: 'vivid-wheel',
    controls: { scale: 2, jitter: 2 },
    makeRow: (i, ctx) => new PatternedFillRenderer({
        pattern: PATTERNS[i],
        colors: ctx.paletteColors,
        background: ctx.paper,
        scale: ctx.values.scale,
        jitter: ctx.values.jitter,
        waveAmp: ctx.values.scale * 0.9,
    }),
});
