import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';

// The half-width (world units) at which the undulation rates match the
// originals; wider strokes undulate proportionally more slowly.
const WIDTH_REF = 0.08;

/**
 * Base for strokes built from 3D shapes around the spine.
 *
 * The spine gains depth from a seeded wave of arc length, so the mark reads as an
 * object lying over the canvas rather than a flat fill, and the shape rotates
 * around the spine by an angle that depends on the distance from one end. A seeded
 * offset also pushes the shape slightly off the spine, in a direction that rotates
 * with the same angle, so the mark orbits the spine along its length. By default
 * the angle keys on distance from the start, so the drawn part holds still as the
 * stroke grows; with `spinFromTip` it keys on distance from the end, so the whole
 * mark turns while it is drawn.
 *
 * The frame is the 2D spine normal for the in-plane axis and +z for the
 * out-of-plane axis. The 3D strokes carry true normals, so their shared light
 * in STROKE3D_GLSL has positive y; the 2D shaders' negative-y convention does
 * not apply here.
 */
export class Stroke3DRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.depth]  Amplitude of the spine's depth wave.
     * @param {number} [opts.twist]  Rotation around the spine, radians per unit of
     *                               distance from the reference end.
     * @param {number} [opts.zBase]  Height the wave rides on, above the canvas.
     *                               The default holds the spine about 100 CSS
     *                               pixels over it.
     * @param {number} [opts.wander] Amplitude of the offset from the spine.
     * @param {boolean} [opts.spinFromTip]  Key the rotation on distance from the
     *                               end rather than the start, so the whole mark
     *                               turns as the stroke grows instead of holding
     *                               still. Off by default.
     */
    constructor({ samplesPerUnit = 90, depth = 0.14, twist = 5, zBase = 0.5, wander = 0.1,
        spinFromTip = false, showNormals = false } = {}) {
        super();
        this.samplesPerUnit = samplesPerUnit;
        this.depth = depth;
        this.twist = twist;
        this.zBase = zBase;
        this.wander = wander;
        this.spinFromTip = spinFromTip;
        // Debug view: paint the surface with its normals (xyz as rgb), and tint
        // back-facing pixels red, so winding and normal problems show themselves.
        this.showNormals = showNormals;
    }

    /** The spine with depth, plus the frame and rotation phase along it. */
    frames(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(def, this.samplesPerUnit, 8, 1024);
        const seed = def.seed ?? 1;
        // The depth and wander undulations advance by arc measured in widths,
        // so their wavelength tracks the stroke's thickness: a wide tube
        // snakes as gently as a thin one instead of rippling faster than it is
        // thick. WIDTH_REF is the width at which the rates match the originals.
        const wscale = WIDTH_REF / Math.max(def.widthLeftAt(0.5), 1e-4);
        const zAt = s => this.zBase + this.depth * (
            Math.sin(s * wscale * 3.1 + seed * 5.3) * 0.6 +
            Math.sin(s * wscale * 6.7 + seed * 9.1) * 0.4
        );
        const phaseAt = s => (this.spinFromTip ? length - s : s) * this.twist + seed * 2.399;
        // The offset from the spine: a seeded wave of arc length sets how far,
        // and the twist phase sets which way around the spine, so the offset's
        // direction rotates with the mark while it is drawn.
        const offAt = s => this.wander * (
            Math.sin(s * wscale * 2.1 + seed * 4.7) * 0.6 +
            Math.sin(s * wscale * 4.3 + seed * 8.3) * 0.4
        );
        const centers = samples.map((p, i) => {
            const s = ts[i] * length;
            const off = offAt(s);
            const ang = phaseAt(s);
            const nrm = normals[i];
            return new THREE.Vector3(
                p.x + nrm.x * Math.cos(ang) * off,
                p.y + nrm.y * Math.cos(ang) * off,
                zAt(s) + Math.sin(ang) * off
            );
        });
        return { centers, normals, tangents, ts, length, phaseAt, seed };
    }
}

/** The normals debug view: rgb from xyz, back faces tinted red. */
export const SHOW_NORMALS_GLSL = /* glsl */`
    vec4 normalDebug(vec3 rawNormal) {
        vec3 c = normalize(rawNormal) * 0.5 + 0.5;
        if (!gl_FrontFacing) c = mix(c, vec3(1.0, 0.0, 0.0), 0.6);
        return vec4(c, 1.0);
    }
`;

/** GLSL every 3D stroke's fragment shader shares: the light and the canvas lookup. */
export const STROKE3D_GLSL = /* glsl */`
    uniform vec2 uScreen;
    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    // From the upper left: 60 degrees down from the screen's up axis, swung 30
    // degrees to the left of the camera. The 3D strokes carry true normals, and
    // on screen +y is up, so the light's y is positive; the 2D shaders'
    // negative-y convention compensates for their inverted dome normals and
    // does not apply here.
    vec3 lightDir() { return normalize(vec3(-0.433, 0.5, 0.75)); }

    float diffuseAt(vec3 n) { return max(dot(n, lightDir()), 0.0); }

    float specularAt(vec3 n, float shininess) {
        vec3 halfVec = normalize(lightDir() + vec3(0.0, 0.0, 1.0));
        return pow(max(dot(n, halfVec), 0.0), shininess);
    }
`;
