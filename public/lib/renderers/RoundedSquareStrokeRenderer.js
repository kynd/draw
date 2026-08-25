import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';
import { resampleSpine } from './StrokeRenderer.js';

const MAX_CELLS = 220;

/**
 * The mark as rounded squares on a fixed grid, drawn as one smoothly blended union.
 *
 * Cells are stamped from the spine like the pixel renderer, but the fragment shader
 * evaluates a smooth-minimum over every cell's rounded-box distance, so adding a
 * square reshapes the outline around it instead of overlapping it: the boundary is
 * recomputed as a whole every time.
 */
export class RoundedSquareStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.cell]     Grid cell size in world units.
     * @param {number} [opts.corner]   Corner radius, as a fraction of the cell.
     * @param {number} [opts.blend]    Smooth-union radius, as a fraction of the cell.
     */
    constructor({ color = '#7a4a2f', cell = 0.14, corner = 0.3, blend = 0.35, samplesPerUnit = 140, ...rest } = {}) {
        super({ cap: 'rounded', samplesPerUnit, ...rest });
        this.color = color;
        this.cell = cell;
        this.corner = corner;
        this.blend = blend;
    }

    build(def) {
        const { samples, normals } = resampleSpine(def, this.samplesPerUnit, 8, 4096);
        const n = samples.length;
        const cell = this.cell;

        const filled = new Map();
        for (let i = 0; i < n && filled.size < MAX_CELLS; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const wL = def.widthLeftAt(t);
            const wR = def.widthRightAt(t);
            const p = samples[i], nrm = normals[i];
            const reach = Math.ceil(Math.max(wL, wR) / cell) + 1;
            const cx = Math.round(p.x / cell), cy = Math.round(p.y / cell);
            for (let gx = cx - reach; gx <= cx + reach; gx++) {
                for (let gy = cy - reach; gy <= cy + reach; gy++) {
                    const key = `${gx},${gy}`;
                    if (filled.has(key)) continue;
                    const dx = gx * cell - p.x, dy = gy * cell - p.y;
                    const side = dx * nrm.x + dy * nrm.y;
                    // A cell is kept when it can cover part of the mark, so the tiles
                    // reach the stroke's edge instead of hugging the spine.
                    const limit = (side >= 0 ? wL : wR) + cell * 0.55;
                    if (dx * dx + dy * dy <= limit * limit) {
                        filled.set(key, new THREE.Vector2(gx * cell, gy * cell));
                        if (filled.size >= MAX_CELLS) break;
                    }
                }
                if (filled.size >= MAX_CELLS) break;
            }
        }
        this._cells = [...filled.values()];
        this.inflate = (def.maxWidth() + cell * (1 + this.blend)) / Math.max(def.maxWidth(), 1e-6);
        return super.build(def);
    }

    uniforms() {
        const arr = Array.from({ length: MAX_CELLS }, (_, i) =>
            this._cells[i] ?? new THREE.Vector2(1e6, 1e6));
        return {
            uColor: { value: new THREE.Color(this.color) },
            uCells: { value: arr },
            uCellCount: { value: this._cells.length },
            uCellSize: { value: this.cell },
            uCorner: { value: this.corner },
            uBlend: { value: this.blend },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec2 uCells[${MAX_CELLS}];
            uniform int uCellCount;
            uniform float uCellSize;
            uniform float uCorner;
            uniform float uBlend;

            float sdRoundBox(vec2 p, float half_, float r) {
                vec2 q = abs(p) - vec2(half_ - r);
                return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
            }
            float smin(float a, float b, float k) {
                float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                return mix(b, a, h) - k * h * (1.0 - h);
            }

            void main() {
                float k = uCellSize * uBlend;
                float d = 1e6;
                for (int i = 0; i < ${MAX_CELLS}; i++) {
                    if (i >= uCellCount) break;
                    float box = sdRoundBox(vWorld.xy - uCells[i], uCellSize * 0.5, uCellSize * uCorner);
                    d = smin(d, box, k);
                }
                float alpha = 1.0 - smoothstep(-0.004, 0.004, d);
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
