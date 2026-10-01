import * as THREE from 'three';
import { seedOffset } from '../random.js';

export const MAX_CONTOUR = 200;

/**
 * Base for renderers that fill a closed region.
 *
 * The input is a closed contour, counterclockwise. The geometry is only a quad over
 * the contour's bounds; the shape itself lives in the fragment shader as the signed
 * distance to the contour polygon, so a subclass can push the boundary around, texture
 * the interior, or shade it as a surface without touching geometry.
 *
 * ── What every subclass shader receives ──────────────────────────────────────
 *
 *   sdBlob(p, arc, outward)  signed distance at world point p, negative inside,
 *                            with the arc position of the nearest boundary point
 *                            and the outward unit direction.
 *   localInset(p, d, outward)  the local half-width, so an edge dome can flatten by
 *                            the middle of a narrow region instead of creasing there.
 *   uvAt(p)                  the background uv of an arbitrary world point, not
 *                            just this fragment's own.
 *   uPerimeter, uCount, uSeed, uScreen (synced by the stage), fbm and hashes.
 */
export class BlobRenderer {
    /** @param {number} [margin]  How far past the contour the quad reaches. */
    constructor({ margin = 0.3 } = {}) {
        this.margin = margin;
    }

    uniforms() { return {}; }

    fragmentShader() {
        throw new Error(`${this.constructor.name} must implement fragmentShader().`);
    }

    /** @param {THREE.Vector3[]} contour  Closed, counterclockwise. */
    build(contour, seed = 1) {
        const n = Math.min(contour.length, MAX_CONTOUR);
        const pts = [];
        // Downsample by stride if the contour is denser than the uniform budget.
        for (let i = 0; i < n; i++) {
            pts.push(contour[Math.floor(i * contour.length / n)]);
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        minX -= this.margin; minY -= this.margin;
        maxX += this.margin; maxY += this.margin;

        const contourArr = Array.from({ length: MAX_CONTOUR }, (_, i) =>
            i < n ? new THREE.Vector2(pts[i].x, pts[i].y) : new THREE.Vector2(1e6, 1e6));
        const arc = new Float32Array(MAX_CONTOUR);
        let perimeter = 0;
        for (let i = 0; i < n; i++) {
            arc[i] = perimeter;
            const next = pts[(i + 1) % n];
            perimeter += Math.hypot(next.x - pts[i].x, next.y - pts[i].y);
        }

        // A smooth outward normal per vertex, the average of the two edges meeting there.
        // sdBlob interpolates these along an edge, so the rim's outward direction turns
        // continuously around the boundary instead of stepping per polygon edge (which the
        // dome's slope, and the metal reflection reading it, break into radial streaks).
        let area2 = 0;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            area2 += a.x * b.y - b.x * a.y;
        }
        const wind = area2 >= 0 ? 1 : -1;
        const edgeN = [];
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            const nx = (b.y - a.y) * wind, ny = -(b.x - a.x) * wind;
            const L = Math.hypot(nx, ny) || 1;
            edgeN.push([nx / L, ny / L]);
        }
        const normalArr = Array.from({ length: MAX_CONTOUR }, (_, i) => {
            if (i >= n) return new THREE.Vector2(1, 0);
            const prev = edgeN[(i - 1 + n) % n], cur = edgeN[i];
            const nx = prev[0] + cur[0], ny = prev[1] + cur[1];
            const L = Math.hypot(nx, ny) || 1;
            return new THREE.Vector2(nx / L, ny / L);
        });

        const geometry = new THREE.PlaneGeometry(maxX - minX, maxY - minY);
        geometry.translate((minX + maxX) / 2, (minY + maxY) / 2, 0);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uContour: { value: contourArr },
                uNormal: { value: normalArr },
                uArc: { value: arc },
                uCount: { value: n },
                uPerimeter: { value: Math.max(perimeter, 1e-6) },
                uSeed: { value: seedOffset(seed) },
                uScreen: { value: new THREE.Vector2(1, 1) },
                ...this.uniforms(),
            },
            vertexShader: VERTEX,
            fragmentShader: PRELUDE + this.fragmentShader(),
            side: THREE.DoubleSide,
            transparent: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.stats = {
            sampleCount: n,
            vertexCount: 4,
            triangleCount: 2,
            length: perimeter,
        };
        return mesh;
    }

    dispose(mesh) {
        mesh.geometry.dispose();
        mesh.material.dispose();
    }
}

const VERTEX = /* glsl */`
    varying vec2 vWorld;
    varying vec2 vUvPerWorld;
    void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xy;
        // The orthographic projection's scale, so the fragment shader can turn
        // a world offset into a background uv offset.
        vUvPerWorld = 0.5 * vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

const PRELUDE = /* glsl */`
    precision highp float;
    varying vec2 vWorld;
    uniform vec2 uContour[${MAX_CONTOUR}];
    uniform vec2 uNormal[${MAX_CONTOUR}];
    uniform float uArc[${MAX_CONTOUR}];
    uniform int uCount;
    uniform float uPerimeter;
    uniform float uSeed;
    uniform vec2 uScreen;

    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    varying vec2 vUvPerWorld;
    // The background uv of an arbitrary world point, so a shader can read the
    // canvas somewhere other than under its own fragment.
    vec2 uvAt(vec2 p) { return screenUv() + (p - vWorld) * vUvPerWorld; }

    float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        return fract(p * (p + p));
    }
    float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    vec2 hash22(vec2 p) {
        return vec2(hash21(p), hash21(p + 17.17));
    }
    float valueNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        // Quintic smootherstep, not cubic smoothstep: it is C2, so the noise's slope is
        // continuous across cell boundaries. Cubic leaves a slope kink at every boundary,
        // which a finite-difference normal or a warped pattern reads as a grid of cells.
        f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                   mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        // Each octave is rotated by an irrational angle before it is sampled, so no octave's
        // value-noise lattice lines up with the axes or with another octave. Without this the
        // shared lattice reads as a square grid across the material, worst where the grain is
        // fine or high-contrast; the rotation keeps the same noise character with no grid.
        mat2 rot = mat2(0.7373688, -0.6754903, 0.6754903, 0.7373688);
        for (int i = 0; i < 4; i++) { p = rot * p; v += a * valueNoise(p); p *= 2.0; a *= 0.5; }
        return v;
    }

    // A triangle id on a regular triangular lattice, facets cells across a unit, so a
    // shader can flat-shade or color per triangular pane. The .x carries which of the two
    // triangles in each rhombus the point falls in.
    vec2 triangleId(vec2 p, float facets) {
        vec2 g = vec2(p.x - p.y * 0.57735, p.y * 1.1547) * facets;
        vec2 cell = floor(g);
        float upper = step(1.0, fract(g).x + fract(g).y);
        return cell * 2.0 + vec2(upper, 0.0);
    }

    // A triangle id on a jittered triangular lattice: each lattice vertex is offset by a
    // per-vertex hash, and a point takes the jittered triangle that contains it, found by
    // testing the triangles in the cells around it. The panes stay triangular with
    // straight edges; only their vertices move. The id (the three vertex indices summed)
    // is the same for every point in a triangle, so a shader flat-shades per pane.
    vec2 triFacetId(vec2 p, float facets, float jitter) {
        float F = 0.3660254;   // position -> lattice skew, (sqrt(3)-1)/2
        float G = 0.2113249;   // lattice -> position unskew, (3-sqrt(3))/6
        vec2 s = p * facets;
        vec2 hc = floor(s + (s.x + s.y) * F);
        vec2 id = 3.0 * hc + 1.0;
        for (int cj = -1; cj <= 1; cj++) {
            for (int ci = -1; ci <= 1; ci++) {
                vec2 c = hc + vec2(float(ci), float(cj));
                for (int t = 0; t < 2; t++) {
                    // Split each cell along the main diagonal, so unskewing gives
                    // equilateral (60-degree) triangles rather than skewed ones.
                    vec2 iA = c, iB = c + vec2(1.0, 0.0), iC = c + vec2(1.0, 1.0);
                    if (t == 1) { iB = c + vec2(0.0, 1.0); }
                    vec2 a = iA - (iA.x + iA.y) * G + (hash22(iA) - 0.5) * jitter;
                    vec2 b = iB - (iB.x + iB.y) * G + (hash22(iB) - 0.5) * jitter;
                    vec2 cc = iC - (iC.x + iC.y) * G + (hash22(iC) - 0.5) * jitter;
                    float d1 = (s.x - a.x) * (b.y - a.y) - (s.y - a.y) * (b.x - a.x);
                    float d2 = (s.x - b.x) * (cc.y - b.y) - (s.y - b.y) * (cc.x - b.x);
                    float d3 = (s.x - cc.x) * (a.y - cc.y) - (s.y - cc.y) * (a.x - cc.x);
                    bool neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
                    bool pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
                    if (!(neg && pos)) id = iA + iB + iC;
                }
            }
        }
        return id;
    }

    // Signed distance to the contour polygon: negative inside. Also reports the arc
    // position of the nearest boundary point and the outward unit direction.
    float sdBlob(vec2 p, out float arc, out vec2 outward) {
        float best = 1e18;
        arc = 0.0;
        vec2 bn0 = vec2(1.0, 0.0), bn1 = vec2(1.0, 0.0);
        float bt = 0.0;
        bool inside = false;
        for (int i = 0; i < ${MAX_CONTOUR}; i++) {
            if (i >= uCount) break;
            int j = i + 1 == uCount ? 0 : i + 1;
            vec2 a = uContour[i];
            vec2 b = uContour[j];
            vec2 e = b - a;
            vec2 w = p - a;
            float t = clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
            vec2 q = w - e * t;
            float d2 = dot(q, q);
            if (d2 < best) {
                best = d2;
                arc = uArc[i] + length(e) * t;
                // Capture the nearest edge's endpoint normals and the projection along it,
                // so the outward direction can be the smooth boundary normal interpolated
                // across the edge rather than the faceted edge-perpendicular.
                bn0 = uNormal[i];
                bn1 = uNormal[j];
                bt = t;
            }
            if ((a.y > p.y) != (b.y > p.y)) {
                float xint = a.x + (p.y - a.y) * e.x / e.y;
                if (p.x < xint) inside = !inside;
            }
        }
        outward = normalize(mix(bn0, bn1, bt));
        return inside ? -sqrt(best) : sqrt(best);
    }

    // The local half-width, marched inward from a point along its inward normal at a
    // few fixed steps. An edge dome sized to this reaches its flat top by the middle of
    // a narrow region, so the two rims meet with no slope there instead of creasing into
    // a ridge; wide regions saturate the search and fall back to the dome's full width.
    // Only the range a dome spans (~0.3) is searched, and it never over-reports, so it
    // errs toward a flatter center rather than a sharper one.
    float localInset(vec2 p, float d, vec2 outward) {
        float best = -d;
        for (int i = 1; i <= 4; i++) {
            float a; vec2 o;
            best = max(best, -sdBlob(p - outward * (float(i) * 0.075), a, o));
        }
        return best;
    }
`;
