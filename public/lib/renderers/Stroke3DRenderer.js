import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';

/**
 * Base for strokes built from 3D shapes around the spine.
 *
 * The spine gains depth from a seeded wave of arc length, so the mark reads as an
 * object lying over the canvas rather than a flat fill, and the shape rotates
 * around the spine by an angle that depends on the distance from the stroke's
 * end: as the stroke grows, that distance changes everywhere, so the whole mark
 * visibly turns while it is drawn. Rotation is the one deliberate exception to
 * prefix stability; the depth wave keys on distance from the start and holds
 * still.
 *
 * The frame is the 2D spine normal for the in-plane axis and +z for the
 * out-of-plane axis. Lighting in subclasses follows the site convention: the
 * light's world y is negative, so it reads as shining from the top of the screen.
 */
export class Stroke3DRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.depth]  Amplitude of the spine's depth wave.
     * @param {number} [opts.twist]  Rotation around the spine, radians per unit of
     *                               distance from the end.
     * @param {number} [opts.zBase]  Depth the wave rides on.
     */
    constructor({ samplesPerUnit = 90, depth = 0.14, twist = 5, zBase = 0.35 } = {}) {
        super();
        this.samplesPerUnit = samplesPerUnit;
        this.depth = depth;
        this.twist = twist;
        this.zBase = zBase;
    }

    /** The spine with depth, plus the frame and rotation phase along it. */
    frames(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(def, this.samplesPerUnit, 8, 1024);
        const seed = def.seed ?? 1;
        const zAt = s => this.zBase + this.depth * (
            Math.sin(s * 3.1 + seed * 5.3) * 0.6 +
            Math.sin(s * 6.7 + seed * 9.1) * 0.4
        );
        const phaseAt = s => (length - s) * this.twist + seed * 2.399;
        const centers = samples.map((p, i) => new THREE.Vector3(p.x, p.y, zAt(ts[i] * length)));
        return { centers, normals, tangents, ts, length, phaseAt, seed };
    }
}

/** GLSL every 3D stroke's fragment shader shares: the light and the canvas lookup. */
export const STROKE3D_GLSL = /* glsl */`
    uniform vec2 uScreen;
    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    // The presented frame flips world y; -0.7 reads as light from the top.
    vec3 lightDir() { return normalize(vec3(-0.4, -0.7, 0.6)); }

    float diffuseAt(vec3 n) { return max(dot(n, lightDir()), 0.0); }

    float specularAt(vec3 n, float shininess) {
        vec3 halfVec = normalize(lightDir() + vec3(0.0, 0.0, 1.0));
        return pow(max(dot(n, halfVec), 0.0), shininess);
    }
`;
