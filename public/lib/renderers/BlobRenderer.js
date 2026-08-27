import * as THREE from 'three';

export const MAX_CONTOUR = 160;

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

        const geometry = new THREE.PlaneGeometry(maxX - minX, maxY - minY);
        geometry.translate((minX + maxX) / 2, (minY + maxY) / 2, 0);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uContour: { value: contourArr },
                uArc: { value: arc },
                uCount: { value: n },
                uPerimeter: { value: Math.max(perimeter, 1e-6) },
                uSeed: { value: seed },
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
    void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

const PRELUDE = /* glsl */`
    precision highp float;
    varying vec2 vWorld;
    uniform vec2 uContour[${MAX_CONTOUR}];
    uniform float uArc[${MAX_CONTOUR}];
    uniform int uCount;
    uniform float uPerimeter;
    uniform float uSeed;
    uniform vec2 uScreen;

    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

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
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                   mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * valueNoise(p); p *= 2.0; a *= 0.5; }
        return v;
    }

    // Signed distance to the contour polygon: negative inside. Also reports the arc
    // position of the nearest boundary point and the outward unit direction.
    float sdBlob(vec2 p, out float arc, out vec2 outward) {
        float best = 1e18;
        arc = 0.0;
        outward = vec2(1.0, 0.0);
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
                outward = q;
            }
            if ((a.y > p.y) != (b.y > p.y)) {
                float xint = a.x + (p.y - a.y) * e.x / e.y;
                if (p.x < xint) inside = !inside;
            }
        }
        float d = sqrt(best);
        outward = d > 1e-6 ? outward / d : vec2(1.0, 0.0);
        if (inside) {
            d = -d;
            outward = -outward;
        }
        return d;
    }
`;
