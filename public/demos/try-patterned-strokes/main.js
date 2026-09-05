import { setupDrawingTool } from '../../lib/demo/drawingTool.js';
import { pickTools } from '../../lib/demo/toolRegistry.js';

setupDrawingTool({ registry: pickTools(['pattern-dashes', 'pattern-dots', 'pattern-strips']), square: true });
