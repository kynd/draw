// One config class per page, each a DrawingToolConfig subclass constructed
// with no arguments: everything unique to the page lives inside the class, so
// a caller never assembles details.

import { DrawingToolConfig } from './drawingTool/DrawingToolConfig.js';

export class StrokesDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'ribbon', 'ribbon-ragged', 'ribbon-square', 'brush', 'brush-rounded', 'brush-square',
            'dry-brush-fine', 'dry-brush-medium', 'dry-brush-coarse',
            'shadow', 'deboss', 'glow',
        ] });
    }
}

export class WetStrokesDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'watercolor', 'smear', 'wet-brush', 'oil', 'oil-square', 'oil-ragged',
            'chrome', 'frosted-glass', 'glass-stroke',
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
            'tetrahedra', 'boxes', 'cones',
        ] });
    }
}

export class PatternedDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'pattern-dashes', 'pattern-dots', 'pattern-strips',
            'wet-dashes', 'wet-dots', 'wet-strips', 'feather', 'leaves', 'fringe', 'wet-fringe',
            'pixels', 'polygons', 'lanes',
        ] });
    }
}

export class AroundDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'around-spiral', 'around-entangled', 'around-scattered',
            'around-wiggle', 'around-wiggle-even', 'around-wiggle-u',
        ] });
    }
}

export class PaintingDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'flat-blob', 'wobbly-blob', 'spiky-blob', 'polka-dots', 'grid-squares', 'riley-waves',
            'dry-brush', 'flat-paint', 'knife-oil',
            'wash', 'watery-wash', 'gouache', 'metal', 'glass-blob', 'facet-glass',
            'rock', 'marble', 'sand',
        ] });
    }
}

export class ShapeFillsDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'circle-fill', 'oval-fill', 'rect-fill',
            'diamond-fill', 'triangle-30-60', 'triangle-45',
        ] });
    }
}

export class SymmetricDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ tools: [
            'mirror-brush', 'rotation-pencil', 'screen-ribbon',
        ] });
    }
}

/** The combined instrument: the whole master registry, and a clear that
 * picks from every initializer. */
export class DrawingToolDemoConfig extends DrawingToolConfig {
    constructor() {
        super({ initializers: ['scatter', 'pattern', 'split', 'fills'] });
    }
}

/** Playback only: any log's tools resolve, and nothing draws over the replay. */
export class PlaybackConfig extends DrawingToolConfig {
    constructor() {
        super({ preview: false, initializers: [] });
    }
}
