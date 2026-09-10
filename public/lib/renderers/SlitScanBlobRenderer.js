import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';
import { seededRandom } from '../random.js';

/**
 * A fill colored by slit-scanning the canvas. The background is read only
 * along one sampling line: every fragment projects onto that line and takes
 * the color there, so each sample stretches into a band orthogonal to the
 * line, the way a slit-scan photograph stretches one slit over time. The
 * result mixes with a flat base color by `mix`.
 */
export class SlitScanBlobRenderer extends BlobRenderer {
    constructor({
        color = '#46608a',
        background = null,   // the canvas texture the slit reads
        mix = 0.6,           // sample weight; 0 is the flat base color
        linePoint = [0, 0],  // a world point the sampling line passes through
        lineAngle = 0,       // the line's direction, in radians
        ...rest
    } = {}) {
        super({ margin: 0.1, ...rest });
        this.color = color;
        this.background = background;
        this.mix = mix;
        this.linePoint = linePoint;
        this.lineAngle = lineAngle;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uMix: { value: this.mix },
            uLinePoint: { value: new THREE.Vector2(...this.linePoint) },
            uLineDir: { value: new THREE.Vector2(
                Math.cos(this.lineAngle), Math.sin(this.lineAngle)) },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform float uMix;
            uniform vec2 uLinePoint;
            uniform vec2 uLineDir;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-0.006, 0.006, d);
                if (alpha <= 0.003) discard;
                // The projection onto the sampling line, read back on the
                // canvas: constant along the orthogonal, so the line's colors
                // stretch across the whole fill.
                float t = dot(vWorld - uLinePoint, uLineDir);
                vec3 slit = texture2D(uBg, uvAt(uLinePoint + uLineDir * t)).rgb;
                gl_FragColor = vec4(mix(uColor, slit, uMix), alpha);
            }
        `;
    }
}

/** A seeded sampling line for a shape drawn from `a` to `b`: through their
 * midpoint, so it crosses every endpoint shape, at a seeded angle. */
export function slitLineFromEnds(a, b, seed = 1) {
    const rand = seededRandom(seed * 3.7 + 13.1);
    return {
        linePoint: [(a.x + b.x) / 2, (a.y + b.y) / 2],
        lineAngle: rand() * Math.PI,
    };
}
