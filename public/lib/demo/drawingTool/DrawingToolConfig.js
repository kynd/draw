import { toolRegistry, pickTools } from '../toolRegistry.js';

/**
 * Everything a DrawingTool is set up with: the tool set, the defaults, the
 * flags. The engine's constructor signature never changes; what a config can
 * carry does, so adding a setting never touches a construction site. Page
 * configs subclass this with their settings baked in, so a caller constructs
 * them with no arguments.
 */
export class DrawingToolConfig {
    /**
     * @param {object} opts
     * @param {string[]|object[]} [opts.tools]  Ids from the master registry, or
     *                                          registry entries directly. The
     *                                          whole registry when omitted.
     * @param {object}  [opts.palette]      Initial { hue, count, theme, seed }.
     * @param {string}  [opts.toolId]       Initial tool (rolled when omitted).
     * @param {boolean} [opts.preview]      The in-scene preview box.
     * @param {number}  [opts.scatterCount] Random strokes a clear lays down;
     *                                      0 for a blank canvas.
     * @param {boolean} [opts.pointerTrace] The pointer's own line while drawing.
     */
    constructor({
        tools = null,
        palette = null,
        toolId = null,
        preview = true,
        scatterCount = 3,
        pointerTrace = false,
    } = {}) {
        this.registry = tools === null
            ? [...toolRegistry]
            : typeof tools[0] === 'string' ? pickTools(tools) : [...tools];
        if (!this.registry.length) {
            throw new Error('DrawingToolConfig: the tool set is empty');
        }
        if (toolId !== null && !this.registry.some(entry => entry.id === toolId)) {
            throw new Error(`DrawingToolConfig: unknown toolId "${toolId}"`);
        }
        this.palette = palette;
        this.toolId = toolId;
        this.preview = Boolean(preview);
        this.scatterCount = Math.max(0, Math.round(scatterCount));
        this.pointerTrace = Boolean(pointerTrace);
    }
}
