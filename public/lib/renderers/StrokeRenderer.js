import * as THREE from 'three';

/**
 * Base class for stroke renderers.
 *
 * A renderer turns a StrokeDef into a THREE.Object3D. The StrokeDef says where the
 * stroke goes; the renderer decides what it looks like as geometry. One renderer
 * instance can build any number of strokes — it holds style, not state about a
 * particular stroke.
 *
 * ── The contract every renderer honours ──────────────────────────────────────
 *
 * 1. Adaptive sampling. Control points are resampled along the curve at a density
 *    proportional to arc length, clamped to [MIN_SAMPLES, MAX_SAMPLES]. A short
 *    stroke costs few triangles; a long one stays smooth. Renderers expose
 *    `samplesPerUnit` so a demo can trade quality against cost.
 *
 * 2. 2D framing. The normal is the +90° rotation of the tangent in the XY plane.
 *    The tangent's Z component is dropped before framing, so a stroke whose Z ramps
 *    slightly (to order its own overlaps) still produces a flat, camera-facing
 *    ribbon rather than a twisted one.
 *
 * 3. Independent left/right width. Offsets come from `widthLeftAt(t)` and
 *    `widthRightAt(t)` separately. Renderers never assume symmetry.
 *
 * 4. UV convention. `u` runs 0 → 1 along the stroke by arc length; `v` runs 0 on the
 *    left edge to 1 on the right. Caps continue the same frame: `u` is 0 or 1 across
 *    the whole cap, `v` sweeps 0 → 1 from the left offset round to the right.
 *
 * 5. Reported stats. The returned object carries `userData.stats` with
 *    `{ sampleCount, vertexCount, triangleCount }`, and `userData.samples` with the
 *    resampled spine positions, so demos can show what the tessellation is doing.
 *
 * 6. Disposal. `dispose(object)` releases the geometry and material a renderer built.
 */
export class StrokeRenderer {
    /**
     * @param {StrokeDef} def
     * @returns {THREE.Object3D}
     */
    build(def) {
        throw new Error(`${this.constructor.name} must implement build(def).`);
    }

    /** Releases GPU resources held by an object this renderer built. */
    dispose(object) {
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(m => m.dispose());
            }
        });
    }
}

/**
 * How far past the end of the mark a point at lateral position `lateral` may reach,
 * as a fraction of the half-width.
 *
 * The geometry renderers have no fragment shader to carve a cap out of, so they close
 * their ends by extending vertices along the tangent by this profile. A rounded cap
 * becomes a circle, which for a stroke made of lanes or facets means the outer ones stop
 * short of the middle ones. That reads as a rounded end built from the stroke's own
 * parts, which is the point.
 *
 * @param {'square'|'rounded'|'ragged'} cap
 * @param {number} lateral  Signed position across the width, 1 at the edge.
 */
export function capExtent(cap, lateral, seed = 1) {
    if (cap === 'square') return 0;
    const c = Math.min(1, Math.abs(lateral));
    if (cap === 'ragged') {
        const n = Math.abs(Math.sin(lateral * 9.7 + seed * 4.3))
                * 0.65 + Math.abs(Math.sin(lateral * 23.1 + seed * 1.7)) * 0.35;
        return 0.12 + 0.88 * n;
    }
    return Math.sqrt(Math.max(0, 1 - c * c));
}

/**
 * Resamples a stroke's control points into an evenly spaced spine, at a density
 * proportional to arc length. Shared by every renderer so tessellation behaves
 * identically across the group.
 *
 * @returns {{ samples: THREE.Vector3[], normals: THREE.Vector3[],
 *             tangents: THREE.Vector3[], length: number }}
 */
export function resampleSpine(def, samplesPerUnit, minSamples = 8, maxSamples = 2048) {
    const curve = new THREE.CatmullRomCurve3(def.points.map(p => p.clone()), false, 'centripetal');
    // The default 200 divisions make the arc-length mapping coarse on long paths,
    // and a coarse mapping jitters every sample when the curve changes.
    curve.arcLengthDivisions = Math.max(200, def.points.length * 6);
    const length = curve.getLength();

    // Samples sit at fixed arc-length steps from the START, not at even fractions of
    // the whole. The difference only matters while a path is growing: with fractions,
    // every added point moves every sample, and near a sharp corner a small sample
    // shift swings the tangent, so the drawn vertices crawl. With fixed steps the
    // settled part of the path keeps its samples, and only the tip changes.
    let step = 1 / samplesPerUnit;
    if (length / step > maxSamples - 2) step = length / (maxSamples - 2);
    if (length / step < minSamples - 1) step = length / (minSamples - 1);

    const ts = [];
    for (let s = 0; s < length; s += step) ts.push(s / length);
    ts.push(1);
    // Drop a second-to-last sample that landed almost on the end.
    if (ts.length > 2 && (1 - ts[ts.length - 2]) * length < step * 0.25) {
        ts.splice(ts.length - 2, 1);
    }
    const samples = ts.map(t => curve.getPointAt(t));

    const tangents = [];
    const normals  = [];
    let lastNormal = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < samples.length; i++) {
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(samples.length - 1, i + 1)];
        // Drop Z before framing — the depth ramp orders overlaps, it must not tilt the ribbon.
        const tangent = new THREE.Vector3(b.x - a.x, b.y - a.y, 0);

        if (tangent.lengthSq() < 1e-12) {
            normals.push(lastNormal.clone());
            tangents.push(new THREE.Vector3(lastNormal.y, -lastNormal.x, 0));
            continue;
        }
        tangent.normalize();
        const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);
        tangents.push(tangent);
        normals.push(normal);
        lastNormal = normal;
    }

    return { samples, normals, tangents, length, ts };
}
