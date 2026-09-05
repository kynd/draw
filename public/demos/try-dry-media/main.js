import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'pencil', 'charcoal', 'pastel',
    'pencil-rainbow', 'charcoal-multi', 'pastel-multi',
]), square: true });
