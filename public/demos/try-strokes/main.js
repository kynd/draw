import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'ribbon', 'ribbon-ragged', 'ribbon-square', 'brush', 'watercolor', 'smear',
    'wet-brush', 'oil', 'chrome', 'mirror', 'glass-stroke', 'pixels', 'polygons', 'lanes',
]), square: true });
