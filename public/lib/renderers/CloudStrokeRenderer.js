import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

/**
 * A cloud: large discs scattered along the stroke.
 *
 * The mark is flat and one color, so the discs need no union: overlapping discs of
 * the same color read as one shape, and the outline is just their outer arcs. Each
 * disc is a quad with a soft circular edge, drawn transparent so the coverage of
 * overlapping discs combines, so the boundary is antialiased without any per-fragment
 * search. The discs are placed on the spine with a seeded throw, spaced to a fraction
 * of their radius so density holds for a stroke of any length, and nothing caps the
 * count.
 */
export class CloudStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.blob]    Disc radius, in stroke half-widths.
     * @param {number} [opts.offset]  How far discs stray from the spine, in half-widths.
     */
    constructor({ color = '#46608a', blob = 1.5, offset = 1.3, samplesPerUnit = 90 } = {}) {
        super();
        this.color = color;
        this.blob = blob;
        this.offset = offset;
        this.samplesPerUnit = samplesPerUnit;
    }

    build(def) {
        const { samples, normals, tangents, length } = resampleSpine(def, this.samplesPerUnit, 8, 2048);
        const rand = seededRandom(def.seed);
        const w = Math.max(def.maxWidth(), 1e-6);
        const rBase = w * this.blob;
        const offAmp = w * this.offset;
        // Spacing is fixed to the disc size, so extending the stroke adds discs
        // rather than spreading them, and nothing caps the count.
        const spacing = rBase * 0.65;
        const pad = rBase * 0.06 + 0.01;

        const positions = [];
        const locals = [];
        const radii = [];
        const indices = [];
        let quads = 0;

        // Discs land at jittered arc-length intervals with seeded size. They are
        // thrown mostly to the side, along the spine's normal to either edge, with
        // only a little wander along it, so the cloud bulges out from the center
        // line rather than clumping along it. Every third disc stays near the spine
        // at full radius, so the chain cannot break however the others are scattered.
        let due = 0, acc = 0, k = 0;
        for (let i = 0; i < samples.length; i++) {
            if (i > 0) acc += samples[i].distanceTo(samples[i - 1]);
            if (acc < due) continue;

            const anchored = k % 3 === 0;
            const nrm = normals[i], tan = tangents[i];
            const side = rand() < 0.5 ? 1 : -1;
            const across = (anchored ? offAmp * 0.25 : offAmp) * (0.4 + 0.6 * rand()) * side;
            const along = (rand() - 0.5) * offAmp * 0.5;
            const r = anchored
                ? rBase * (1.0 + 0.4 * rand())
                : rBase * (0.45 + 1.15 * rand());
            const cx = samples[i].x + nrm.x * across + tan.x * along;
            const cy = samples[i].y + nrm.y * across + tan.y * along;
            const z = samples[i].z;
            const h = r + pad;

            const base = quads * 4;
            positions.push(cx - h, cy - h, z, cx + h, cy - h, z, cx + h, cy + h, z, cx - h, cy + h, z);
            locals.push(-h, -h, h, -h, h, h, -h, h);
            for (let c = 0; c < 4; c++) radii.push(r);
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            quads++;

            due += spacing * (0.55 + 0.9 * rand());
            k++;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(locals, 2));
        geometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(this.color) } },
            vertexShader: /* glsl */`
                attribute vec2 aLocal;
                attribute float aRadius;
                varying vec2 vLocal;
                varying float vRadius;
                void main() {
                    vLocal = aLocal;
                    vRadius = aRadius;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                precision highp float;
                uniform vec3 uColor;
                varying vec2 vLocal;
                varying float vRadius;
                void main() {
                    float d = length(vLocal) - vRadius;
                    float alpha = 1.0 - smoothstep(-0.005, 0.005, d);
                    if (alpha <= 0.003) discard;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            // One color and flat, so overlapping discs combine to the same color:
            // the discs blend into one shape without writing depth against each other.
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        }));
        mesh.userData.samples = samples;
        mesh.userData.stats = {
            sampleCount: samples.length,
            vertexCount: positions.length / 3,
            triangleCount: indices.length / 3,
            length,
        };
        return mesh;
    }
}
