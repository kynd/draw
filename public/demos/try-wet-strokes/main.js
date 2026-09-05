import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'watercolor', 'smear', 'wet-brush', 'oil', 'oil-square', 'oil-ragged',
    'chrome', 'mirror', 'glass-stroke',
]), square: true });
