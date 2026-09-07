import { DrawingTool } from './DrawingTool.js';
import { DrawingToolConfig } from './DrawingToolConfig.js';
import { buildDrawingToolLayout, attachDrawingToolUi } from './ui.js';
import { bindMidi } from './midi.js';

export { DrawingTool, DrawingToolConfig, bindMidi, buildDrawingToolLayout, attachDrawingToolUi };

/**
 * The whole instrument in one call: the layout, the engine, the default UI,
 * and MIDI. This is what every try-drawing demo uses; a custom UI skips it
 * and builds against the engine directly.
 */
export function setupDrawingTool(config = new DrawingToolConfig(),
    { root = document.body, square = false } = {}) {
    const { layout, canvas } = buildDrawingToolLayout({ root, square });
    const tool = new DrawingTool(canvas, config);
    const dials = attachDrawingToolUi(tool, layout);
    bindMidi(tool, dials);
    return tool;
}
