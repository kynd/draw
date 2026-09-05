import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'pattern-dashes', 'pattern-dots', 'pattern-strips',
    'wet-dashes', 'wet-dots', 'wet-strips', 'feather', 'leaves', 'fringe', 'wet-fringe',
    'around-spiral', 'around-entangled', 'around-scattered', 'pixels', 'polygons', 'lanes',
]), square: true });
