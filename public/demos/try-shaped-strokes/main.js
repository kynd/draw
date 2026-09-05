import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'cloud', 'squares', 'spikes', 'tube-candy', 'tube-wobble', 'tube-metal',
    'tri-facets', 'tri-grain', 'tri-metal',
]), square: true });
