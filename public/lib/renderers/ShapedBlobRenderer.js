import * as THREE from 'three';
import { BlobRenderer, MAX_CONTOUR } from './BlobRenderer.js';

/**
 * A flat fill whose boundary can grow spikes and bumps. With `colorB` and two
 * world points the fill becomes a linear gradient between them, so a caller can
 * run it along the drawn spine or across it.
 *
 * Spikes are displaced into the contour itself before the fill is built, so each tip
 * is a real polygon vertex and the sides do not step across the shader's coarse
 * distance field. An integer count runs around the loop, so the profile meets itself
 * at the seam in a valley; each spike hashes its height and lean from its own index,
 * and only sticks out, so the fill always covers its region. The wobble stays a noise
 * of world position in the shader rather than arc, so it cannot show a seam at all.
 */
export class ShapedBlobRenderer extends BlobRenderer {
    constructor({
        color = '#46608a',
        colorB = null,       // gradient end color; null keeps the fill flat
        gradientFrom = null, // world point where the gradient starts, [x, y]
        gradientTo = null,   // world point where it ends
        spikes = 0,          // spike count around the loop; 0 disables
        spikeAmp = 0.12,
        sharp = 5,
        wobble = 0,          // bump amplitude; 0 disables
        wobbleFreq = 4,
        ...rest
    } = {}) {
        // Spikes ride the contour now, so the bounds already include them; the margin
        // only has to cover the shader's wobble and the edge's antialiasing.
        super({ margin: 0.2 + wobble, ...rest });
        this.color = color;
        this.colorB = colorB;
        this.gradientFrom = gradientFrom;
        this.gradientTo = gradientTo;
        this.spikes = spikes;
        this.spikeAmp = spikeAmp;
        this.sharp = sharp;
        this.wobble = wobble;
        this.wobbleFreq = wobbleFreq;
    }

    build(contour, seed = 1) {
        return super.build(this.spikes > 0.5 ? this._spikeContour(contour, seed) : contour, seed);
    }

    /**
     * Displaces the contour outward by the spike profile, sampled per spike with a
     * vertex at each tip, so the SDF renders the spikes from real geometry.
     */
    _spikeContour(contour, seed) {
        const n = contour.length;
        if (n < 3) return contour;
        // Closed-contour arc table and orientation (for the outward normal).
        const arcAt = new Array(n + 1);
        arcAt[0] = 0;
        let area2 = 0;
        for (let i = 0; i < n; i++) {
            const a = contour[i], b = contour[(i + 1) % n];
            arcAt[i + 1] = arcAt[i] + a.distanceTo(b);
            area2 += a.x * b.y - b.x * a.y;
        }
        const perimeter = arcAt[n];
        if (perimeter < 1e-6) return contour;
        const sign = area2 > 0 ? 1 : -1;   // outward = rot(-90) of the tangent for CCW

        const sampleAt = s => {
            s = ((s % perimeter) + perimeter) % perimeter;
            let ei = 0;
            while (ei < n - 1 && arcAt[ei + 1] <= s) ei++;
            const a = contour[ei], b = contour[(ei + 1) % n];
            const seg = arcAt[ei + 1] - arcAt[ei] || 1;
            const t = (s - arcAt[ei]) / seg;
            let dx = b.x - a.x, dy = b.y - a.y;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            return {
                px: a.x + (b.x - a.x) * t, py: a.y + (b.y - a.y) * t,
                nx: sign * dy, ny: -sign * dx,
            };
        };

        const count = Math.round(this.spikes);
        // Points per spike, kept within the contour budget.
        const per = Math.max(6, Math.min(12, Math.floor(MAX_CONTOUR / count) - 1));
        const hash = (k, salt) => {
            const x = Math.sin(k * 13.7 + seed * 91.0 + salt) * 43758.5453;
            return x - Math.floor(x);
        };
        const out = [];
        for (let k = 0; k < count; k++) {
            const h = 0.2 + 1.4 * hash(k, 3.1);
            const tip = 0.25 + 0.5 * hash(k, 7.7);
            const fs = [];
            for (let m = 0; m < per; m++) fs.push(m / per);
            fs.push(tip);
            fs.sort((p, q) => p - q);
            for (const f of fs) {
                if (f >= 1) continue;
                const tri = f < tip ? f / tip : (1 - f) / (1 - tip);
                const off = this.spikeAmp * h * Math.pow(Math.max(tri, 0), this.sharp);
                const { px, py, nx, ny } = sampleAt(((k + f) / count) * perimeter);
                out.push(new THREE.Vector3(px + nx * off, py + ny * off, 0));
            }
        }
        return out;
    }

    uniforms() {
        const hasGrad = Boolean(this.colorB && this.gradientFrom && this.gradientTo);
        return {
            uColor: { value: new THREE.Color(this.color) },
            uColorB: { value: new THREE.Color(this.colorB ?? this.color) },
            uGradFrom: { value: new THREE.Vector2(...(this.gradientFrom ?? [0, 0])) },
            uGradTo: { value: new THREE.Vector2(...(this.gradientTo ?? [1, 0])) },
            uHasGrad: { value: hasGrad ? 1 : 0 },
            uWobble: { value: this.wobble },
            uWobbleFreq: { value: this.wobbleFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec3 uColorB;
            uniform vec2 uGradFrom;
            uniform vec2 uGradTo;
            uniform int uHasGrad;
            uniform float uWobble;
            uniform float uWobbleFreq;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);

                float offset = 0.0;
                if (uWobble > 0.0) {
                    offset += (fbm(vWorld * uWobbleFreq + uSeed * 11.0) - 0.5) * 2.0 * uWobble;
                }

                float alpha = 1.0 - smoothstep(-0.006, 0.006, d - offset);
                if (alpha <= 0.003) discard;
                // A linear gradient between two world points, so the fill can run
                // along the drawn spine or across it, as the caller lays it out.
                vec3 fill = uColor;
                if (uHasGrad == 1) {
                    vec2 g = uGradTo - uGradFrom;
                    float gt = clamp(dot(vWorld - uGradFrom, g) / max(dot(g, g), 1e-6), 0.0, 1.0);
                    fill = mix(uColor, uColorB, gt);
                }
                gl_FragColor = vec4(fill, alpha);
            }
        `;
    }
}
