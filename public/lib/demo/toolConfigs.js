// One config class per page, each a DrawingToolConfig subclass constructed
// with no arguments: everything unique to the page lives inside the class, so
// a caller never assembles details.

import { DrawingToolConfig } from './drawingTool/DrawingToolConfig.js';

export class StrokesDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'ribbon', 'ribbon-ragged', 'ribbon-square', 'brush', 'brush-rounded', 'brush-square',
            'shadow', 'deboss', 'glow',
        ] });
    }
}

export class WetStrokesDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'watercolor', 'smear', 'wet-brush', 'oil', 'oil-square', 'oil-ragged',
            'chrome', 'mirror', 'glass-stroke',
        ] });
    }
}

export class DryMediaDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'pencil', 'charcoal', 'pastel',
            'pencil-rainbow', 'charcoal-multi', 'pastel-multi',
        ] });
    }
}

export class ShapedDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'cloud', 'squares', 'spikes', 'tube-candy', 'tube-wobble', 'tube-metal',
            'tri-facets', 'tri-grain', 'tri-metal',
        ] });
    }
}

export class PatternedDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'pattern-dashes', 'pattern-dots', 'pattern-strips',
            'wet-dashes', 'wet-dots', 'wet-strips', 'feather', 'leaves', 'fringe', 'wet-fringe',
            'around-spiral', 'around-entangled', 'around-scattered', 'pixels', 'polygons', 'lanes',
        ] });
    }
}

export class PaintingDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'flat-blob', 'wobbly-blob', 'spiky-blob', 'dry-brush', 'flat-paint', 'knife-oil',
            'wash', 'watery-wash', 'gouache', 'metal', 'glass-blob', 'facet-glass',
            'rock', 'marble', 'sand',
        ] });
    }
}

/** The combined instrument: the whole master registry. */
export class DrawingToolDemoConfig extends DrawingToolConfig {
    constructor() {
        super();
    }
}

/** Playback only: any log's tools resolve, and nothing draws over the replay. */
export class PlaybackConfig extends DrawingToolConfig {
    constructor() {
        super({ preview: false, scatterCount: 0 });
    }
}
