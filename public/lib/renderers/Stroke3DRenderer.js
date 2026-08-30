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
     * @param {number} [opts.zBase]  Height the wave rides on, above the canvas.
     *                               The default holds the spine about 100 CSS
     *                               pixels over it.
     */
    constructor({ samplesPerUnit = 90, depth = 0.14, twist = 5, zBase = 0.5 } = {}) {
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

/**
 * The drop shadow's material: flat black at low opacity. The shadow geometry is
 * the mark flattened onto the canvas, each vertex pushed down the screen (world
 * -y) by tan(30) of its own height, which is where the light throws it.
 */
export function shadowMaterial() {
    // Writing depth with a strict less-than test makes overlapping shadow
    // triangles draw once: the fill stays one flat tenth of black however many
    // parts of the mark cover the same spot.
    return new THREE.MeshBasicMaterial({
        color: '#000000', transparent: true, opacity: 0.1,
        depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide,
    });
}

/** GLSL every 3D stroke's fragment shader shares: the light and the canvas lookup. */
export const STROKE3D_GLSL = /* glsl */`
    uniform vec2 uScreen;
    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    // From the top of the screen, 30 degrees above the camera. The 3D strokes
    // carry true normals, and on screen +y is up, so the light's y is positive;
    // the 2D shaders' negative-y convention compensates for their inverted
    // dome normals and does not apply here.
    vec3 lightDir() { return normalize(vec3(0.0, 0.5, 0.866)); }

    float diffuseAt(vec3 n) { return max(dot(n, lightDir()), 0.0); }

    float specularAt(vec3 n, float shininess) {
        vec3 halfVec = normalize(lightDir() + vec3(0.0, 0.0, 1.0));
        return pow(max(dot(n, halfVec), 0.0), shininess);
    }
`;
