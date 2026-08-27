import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';
import { resampleSpine } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

const MAX_BLOBS = 80;

/**
 * A cloud: large discs scattered along the stroke, drawn as one union.
 *
 * The discs are seeded offsets from the spine with big radii, and the fragment shader
 * evaluates the signed distance to their union. A union has one well-defined outline
 * whatever the placement, which is what keeps the boundary from ever crossing itself,
 * however far the blobs are thrown.
 */
export class CloudStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.blob]    Disc radius, in stroke half-widths.
     * @param {number} [opts.offset]  How far discs stray from the spine, in half-widths.
     */
    constructor({ color = '#46608a', blob = 1.5, offset = 1.3, samplesPerUnit = 90, ...rest } = {}) {
        super({ cap: 'rounded', samplesPerUnit, ...rest });
        this.color = color;
        this.blob = blob;
        this.offset = offset;
    }

    build(def) {
        const { samples, normals, length } = resampleSpine(def, this.samplesPerUnit, 8, 2048);
        const rand = seededRandom(def.seed);
        const w = Math.max(def.maxWidth(), 1e-6);
        const rBase = w * this.blob;
        const offAmp = w * this.offset;

        // Discs land at jittered arc-length intervals, thrown in any direction with
        // seeded size. Every third disc stays near the spine with at least the base
        // radius, so the chain cannot break however the others are scattered.
        const spacing = Math.max(rBase * 0.65, length / MAX_BLOBS);
        const blobs = [];
        let due = 0, acc = 0, k = 0;
        for (let i = 0; i < samples.length; i++) {
            if (i > 0) acc += samples[i].distanceTo(samples[i - 1]);
            if (acc >= due && blobs.length < MAX_BLOBS) {
                const anchored = k % 3 === 0;
                const angle = rand() * Math.PI * 2;
                const mag = rand() * (anchored ? offAmp * 0.25 : offAmp);
                const r = anchored
                    ? rBase * (1.0 + 0.4 * rand())
                    : rBase * (0.45 + 1.15 * rand());
                blobs.push(new THREE.Vector4(
                    samples[i].x + Math.cos(angle) * mag,
                    samples[i].y + Math.sin(angle) * mag,
                    r, 0
                ));
                due += spacing * (0.55 + 0.9 * rand());
                k++;
            }
        }
        this._blobs = blobs;
        this.inflate = (offAmp + rBase * 1.65) / w + 0.5;
        return super.build(def);
    }

    uniforms() {
        const arr = Array.from({ length: MAX_BLOBS }, (_, i) =>
            this._blobs[i] ?? new THREE.Vector4(0, 0, -1, 0));
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBlobs: { value: arr },
            uBlobCount: { value: this._blobs.length },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec4 uBlobs[${MAX_BLOBS}];
            uniform int uBlobCount;

            void main() {
                float d = 1e6;
                for (int i = 0; i < ${MAX_BLOBS}; i++) {
                    if (i >= uBlobCount) break;
                    vec4 b = uBlobs[i];
                    if (b.z <= 0.0) continue;
                    d = min(d, length(vWorld.xy - b.xy) - b.z);
                }
                float alpha = 1.0 - smoothstep(-0.004, 0.004, d);
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
