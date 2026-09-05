import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools([
    'flat-blob', 'wobbly-blob', 'spiky-blob', 'dry-brush', 'flat-paint', 'knife-oil',
    'wash', 'gouache', 'metal', 'glass-blob', 'facet-glass', 'rock', 'marble', 'sand',
]), square: true });
