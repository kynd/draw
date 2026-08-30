import * as THREE from 'three';
import { Stroke3DRenderer, STROKE3D_GLSL, shadowMaterial } from './Stroke3DRenderer.js';

const RADIAL = 14;
const CAP_LAT = 5;

/**
 * A 3D tube around the spine, closed by rounded caps, in one of three looks.
 *
 *   candy   diagonal stripes wrapping the tube from a list of colors, with a
 *           shiny highlight.
 *   wobble  the radius swells and thins on a seeded wave, and the color runs a
 *           gradient driven by both the wobble and the position along the stroke.
 *   metal   the tube reflects the current canvas: the reflected direction offsets
 *           a lookup into the background texture, tinted by `tint`.
 */
export class TubeStrokeRenderer extends Stroke3DRenderer {
    /** @param {'candy'|'wobble'|'metal'} [opts.mode] */
    constructor({
        mode = 'candy',
        colors = ['#c22a4a', '#f0e6da', '#2a7a5a', '#f0c040'],
        colorA = '#803050',
        colorB = '#2a5080',
        tint = '#e8d8c8',
        background = null,
        stripes = 5,       // stripe bands per unit of arc length
        wobbleFreq = 12,
        bend = 0.4,        // how far the reflection displaces the canvas lookup
        ...rest
    } = {}) {
        super(rest);
        this.mode = mode;
        this.colors = colors;
        this.colorA = colorA;
        this.colorB = colorB;
        this.tint = tint;
        this.background = background;
        this.stripes = stripes;
        this.wobbleFreq = wobbleFreq;
        this.bend = bend;
    }

    _radiusAt(def, t, s, seed) {
        const base = def.widthLeftAt(t);
        if (this.mode !== 'wobble') return { r: Math.max(base, 1e-4), wob: 0.5 };
        // Two bands, the second faster, so the width changes often and by a lot.
        const wob = 0.5 + 0.32 * Math.sin(s * this.wobbleFreq + seed * 7.7)
                        + 0.18 * Math.sin(s * this.wobbleFreq * 2.33 + seed * 3.1);
        return { r: Math.max(base * (0.3 + 1.1 * wob), 1e-4), wob };
    }

    build(def) {
        const { centers, normals, ts, length, phaseAt, seed } = this.frames(def);
        const n = centers.length;
        const B = new THREE.Vector3(0, 0, 1);

        const positions = [], normalsA = [], along = [], around = [], wobs = [];
        const indices = [];
        const dir = new THREE.Vector3();

        const pushRing = (center, N, phase, r, t, wob) => {
            const base = positions.length / 3;
            for (let j = 0; j <= RADIAL; j++) {
                const a = j / RADIAL;
                const theta = a * Math.PI * 2 + phase;
                dir.copy(N).multiplyScalar(Math.cos(theta))
                    .addScaledVector(B, Math.sin(theta));
                positions.push(center.x + dir.x * r, center.y + dir.y * r, center.z + dir.z * r);
                normalsA.push(dir.x, dir.y, dir.z);
                along.push(t);
                around.push(a);
                wobs.push(wob);
            }
            return base;
        };

        let prevBase = -1;
        for (let i = 0; i < n; i++) {
            const s = ts[i] * length;
            const { r, wob } = this._radiusAt(def, ts[i], s, seed);
            const base = pushRing(centers[i], normals[i], phaseAt(s), r, ts[i], wob);
            if (prevBase >= 0) {
                for (let j = 0; j < RADIAL; j++) {
                    indices.push(prevBase + j, base + j, base + j + 1);
                    indices.push(prevBase + j, base + j + 1, prevBase + j + 1);
                }
            }
            prevBase = base;
        }

        // Rounded caps: latitude rings shrinking to a pole, bulging along the
        // spine direction so the tube ends in a hemisphere.
        const T = new THREE.Vector3();
        for (const end of [0, 1]) {
            const i = end === 0 ? 0 : n - 1;
            const iNext = end === 0 ? Math.min(1, n - 1) : Math.max(n - 2, 0);
            T.copy(centers[i]).sub(centers[iNext]);
            if (T.lengthSq() < 1e-12) T.set(1, 0, 0);
            T.normalize();
            const s = ts[i] * length;
            const { r, wob } = this._radiusAt(def, ts[i], s, seed);
            const phase = phaseAt(s);
            let prev = -1;
            for (let k = 1; k <= CAP_LAT; k++) {
                const phi = (k / CAP_LAT) * Math.PI * 0.5;
                const ringR = r * Math.cos(phi);
                const lift = r * Math.sin(phi);
                // The along parameter keeps accumulating over the cap's arc, so a
                // pattern on u flows over the end instead of freezing at it.
                const tCap = ts[i] + (end === 0 ? -lift : lift) / Math.max(length, 1e-6);
                const base = positions.length / 3;
                for (let j = 0; j <= RADIAL; j++) {
                    const a = j / RADIAL;
                    const theta = a * Math.PI * 2 + phase;
                    dir.copy(normals[i]).multiplyScalar(Math.cos(theta))
                        .addScaledVector(B, Math.sin(theta));
                    const nx = dir.x * Math.cos(phi) + T.x * Math.sin(phi);
                    const ny = dir.y * Math.cos(phi) + T.y * Math.sin(phi);
                    const nz = dir.z * Math.cos(phi) + T.z * Math.sin(phi);
                    positions.push(
                        centers[i].x + dir.x * ringR + T.x * lift,
                        centers[i].y + dir.y * ringR + T.y * lift,
                        centers[i].z + dir.z * ringR + T.z * lift
                    );
                    normalsA.push(nx, ny, nz);
                    along.push(tCap);
                    around.push(a);
                    wobs.push(wob);
                }
                const from = prev >= 0 ? prev
                    : (end === 0 ? 0 : (n - 1) * (RADIAL + 1));
                for (let j = 0; j < RADIAL; j++) {
                    // The start cap's rings run against the spine direction, so
                    // its winding flips to keep the faces outward.
                    if (end === 0) {
                        indices.push(from + j, base + j + 1, base + j);
                        indices.push(from + j, from + j + 1, base + j + 1);
                    } else {
                        indices.push(from + j, base + j, base + j + 1);
                        indices.push(from + j, base + j + 1, from + j + 1);
                    }
                }
                prev = base;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalsA, 3));
        geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
        geometry.setAttribute('aAround', new THREE.Float32BufferAttribute(around, 1));
        geometry.setAttribute('aWob', new THREE.Float32BufferAttribute(wobs, 1));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, this._material(length, seed));
        mesh.userData.wire = true;

        // Drop shadow: the tube's silhouette as a flat ribbon on the canvas,
        // shifted down the screen by the spine's height at each sample.
        const sPos = [], sIdx = [];
        for (let i = 0; i < n; i++) {
            const s = ts[i] * length;
            const { r } = this._radiusAt(def, ts[i], s, seed);
            const cx = centers[i].x, cy = centers[i].y - centers[i].z * 0.577;
            const nx = normals[i].x, ny = normals[i].y;
            sPos.push(cx + nx * r, cy + ny * r, 0.001);
            sPos.push(cx - nx * r, cy - ny * r, 0.001);
            if (i > 0) {
                const b = i * 2;
                sIdx.push(b - 2, b - 1, b + 1);
                sIdx.push(b - 2, b + 1, b);
            }
        }
        const sGeometry = new THREE.BufferGeometry();
        sGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
        sGeometry.setIndex(sIdx);
        sGeometry.computeBoundingSphere();
        const shadow = new THREE.Mesh(sGeometry, shadowMaterial());

        const group = new THREE.Group();
        group.add(shadow, mesh);
        group.userData.samples = centers;
        group.userData.stats = {
            sampleCount: n,
            vertexCount: (positions.length + sPos.length) / 3,
            triangleCount: (indices.length + sIdx.length) / 3,
            length,
        };
        return group;
    }

    _material(length, seed) {
        const modes = { candy: 0, wobble: 1, metal: 2 };
        const cs = this.colors.map(c => new THREE.Color(c));
        while (cs.length < 4) cs.push(cs[cs.length - 1] ?? new THREE.Color('#888888'));
        return new THREE.ShaderMaterial({
            uniforms: {
                uMode: { value: modes[this.mode] ?? 0 },
                uC0: { value: cs[0] }, uC1: { value: cs[1] },
                uC2: { value: cs[2] }, uC3: { value: cs[3] },
                uColorA: { value: new THREE.Color(this.colorA) },
                uColorB: { value: new THREE.Color(this.colorB) },
                uTint: { value: new THREE.Color(this.tint) },
                uBg: { value: this.background },
                uStripes: { value: this.stripes },
                uBend: { value: this.bend },
                uLength: { value: length },
                uSeed: { value: seed },
                uScreen: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: /* glsl */`
                attribute float aAlong;
                attribute float aAround;
                attribute float aWob;
                varying vec3 vNormal;
                varying float vAlong;
                varying float vAround;
                varying float vWob;
                void main() {
                    vNormal = normal;
                    vAlong = aAlong;
                    vAround = aAround;
                    vWob = aWob;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform int uMode;
                uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
                uniform vec3 uColorA;
                uniform vec3 uColorB;
                uniform vec3 uTint;
                uniform sampler2D uBg;
                uniform float uStripes;
                uniform float uBend;
                uniform float uLength;
                uniform float uSeed;
                varying vec3 vNormal;
                varying float vAlong;
                varying float vAround;
                varying float vWob;
                ${STROKE3D_GLSL}
                void main() {
                    vec3 n = normalize(vNormal);
                    float diff = diffuseAt(n);
                    vec3 color;
                    if (uMode == 0) {
                        // Candy: diagonal stripes, wrapping with the tube's angle.
                        float k = fract(vAlong * uLength * uStripes + vAround + uSeed * 0.37);
                        int ci = int(floor(k * 4.0));
                        vec3 base = ci == 0 ? uC0 : ci == 1 ? uC1 : ci == 2 ? uC2 : uC3;
                        color = base * (0.35 + 0.75 * diff) + vec3(specularAt(n, 70.0)) * 0.9;
                    } else if (uMode == 1) {
                        // Wobble: the gradient runs along the stroke and the wobble
                        // brightens the swells and darkens the waists.
                        vec3 g = mix(uColorA, uColorB, vAlong);
                        g = mix(g * 0.5, g * 1.35, vWob);
                        color = g * (0.35 + 0.75 * diff) + vec3(specularAt(n, 24.0)) * 0.3;
                    } else {
                        // Metal: the canvas is the environment map.
                        vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
                        vec2 suv = clamp(screenUv() + r.xy * uBend, 0.001, 0.999);
                        vec3 env = texture2D(uBg, suv).rgb;
                        color = env * uTint * (0.45 + 0.65 * diff)
                              + vec3(specularAt(n, 80.0)) * 1.1;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
    }
}
