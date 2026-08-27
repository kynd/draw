import * as THREE from 'three';

/**
 * Curve constructions over a list of knots.
 *
 * Each takes points and returns a dense polyline through them. They pair with
 * `resampleEvery`: pick knots from a drawn path at a fixed span, then connect them
 * with one of these, and the wobble of the hand disappears between the knots.
 */

/**
 * Points spaced `span` apart along the polyline, walked by arc length. The first and
 * last points are always kept, so the curve starts and ends where the path did.
 */
export function resampleEvery(points, span) {
    if (points.length < 2) return points.map(p => p.clone());
    // A span of zero means no resampling: every drawn point is a knot.
    if (span <= 1e-4) return points.map(p => p.clone());
    const out = [points[0].clone()];
    let carried = 0;
    for (let i = 1; i < points.length; i++) {
        let prev = points[i - 1];
        const next = points[i];
        let segment = prev.distanceTo(next);
        while (carried + segment >= span) {
            const t = (span - carried) / segment;
            const p = prev.clone().lerp(next, t);
            out.push(p);
            prev = p;
            segment = prev.distanceTo(next);
            carried = 0;
        }
        carried += segment;
    }
    // The endpoint is always a knot, however close the previous one is. A threshold
    // here made a growing path's curve lag the pen and then jump a step at a time;
    // with the endpoint pinned, a new interior knot is born exactly at the pen's
    // position, so the knot list, and the curve through it, evolve continuously.
    const last = points[points.length - 1];
    if (out[out.length - 1].distanceTo(last) > 1e-6) out.push(last.clone());
    return out;
}

/**
 * A natural cubic spline through the knots: C2 continuous, with zero second
 * derivative at the ends. Parameterized by chord length, so uneven knot spacing does
 * not distort the shape. Returns `samplesPerSegment` points per knot interval.
 */
export function naturalSpline(knots, samplesPerSegment = 16) {
    const n = knots.length - 1;
    if (n < 1) return knots.map(p => p.clone());
    if (n === 1) return sampleLine(knots[0], knots[1], samplesPerSegment);

    const t = [0];
    for (let i = 1; i <= n; i++) t[i] = t[i - 1] + Math.max(knots[i].distanceTo(knots[i - 1]), 1e-6);

    const solve = axis => {
        // Tridiagonal system for the second derivatives, natural boundary M0 = Mn = 0.
        const h = i => t[i + 1] - t[i];
        const A = [], B = [], C = [], D = [];
        B[0] = 1; C[0] = 0; D[0] = 0; A[0] = 0;
        for (let i = 1; i < n; i++) {
            A[i] = h(i - 1);
            B[i] = 2 * (h(i - 1) + h(i));
            C[i] = h(i);
            D[i] = 6 * ((knots[i + 1][axis] - knots[i][axis]) / h(i)
                      - (knots[i][axis] - knots[i - 1][axis]) / h(i - 1));
        }
        A[n] = 0; B[n] = 1; C[n] = 0; D[n] = 0;
        return thomas(A, B, C, D);
    };
    const Mx = solve('x');
    const My = solve('y');

    const out = [];
    for (let i = 0; i < n; i++) {
        const h = t[i + 1] - t[i];
        const steps = i === n - 1 ? samplesPerSegment + 1 : samplesPerSegment;
        for (let k = 0; k < steps; k++) {
            const s = t[i] + (k / samplesPerSegment) * h;
            const a = (t[i + 1] - s) / h;
            const b = (s - t[i]) / h;
            const evalAxis = (axis, M) =>
                a * knots[i][axis] + b * knots[i + 1][axis]
                + ((a * a * a - a) * M[i] + (b * b * b - b) * M[i + 1]) * (h * h) / 6;
            out.push(new THREE.Vector3(
                evalAxis('x', Mx),
                evalAxis('y', My),
                THREE.MathUtils.lerp(knots[i].z, knots[i + 1].z, b)
            ));
        }
    }
    return out;
}

/**
 * John Hobby's curve through the knots, the interpolation METAFONT draws paths with:
 * tangent directions come from a mock-curvature system, and control handles from his
 * velocity function. Adapted from Jake Low's implementation (ISC license, 2020).
 *
 * `omega` is the curl at the endpoints; 0 leaves them straightest.
 */
export function hobbyCurve(knots, samplesPerSegment = 16, omega = 0) {
    const n = knots.length - 1;
    if (n < 1) return knots.map(p => p.clone());

    const chords = [], d = [];
    for (let i = 0; i < n; i++) {
        chords[i] = { x: knots[i + 1].x - knots[i].x, y: knots[i + 1].y - knots[i].y };
        d[i] = Math.max(Math.hypot(chords[i].x, chords[i].y), 1e-9);
    }

    const gamma = new Array(n + 1).fill(0);
    for (let i = 1; i < n; i++) {
        const a = chords[i - 1], b = chords[i];
        gamma[i] = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
    }

    const A = [], B = [], C = [], D = [];
    A[0] = 0;
    B[0] = 2 + omega;
    C[0] = 2 * omega + 1;
    D[0] = -C[0] * gamma[1];
    for (let i = 1; i < n; i++) {
        A[i] = 1 / d[i - 1];
        B[i] = (2 * d[i - 1] + 2 * d[i]) / (d[i - 1] * d[i]);
        C[i] = 1 / d[i];
        D[i] = -(2 * gamma[i] * d[i] + gamma[i + 1] * d[i - 1]) / (d[i - 1] * d[i]);
    }
    A[n] = 2 * omega + 1;
    B[n] = 2 + omega;
    C[n] = 0;
    D[n] = 0;

    const alpha = thomas(A, B, C, D);
    const beta = [];
    for (let i = 0; i < n - 1; i++) beta[i] = -gamma[i + 1] - alpha[i + 1];
    beta[n - 1] = -alpha[n];

    const rho = (a, b) => {
        const c = 2 / 3;
        return 2 / (1 + c * Math.cos(b) + (1 - c) * Math.cos(a));
    };
    const rotated = (v, angle) => {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const len = Math.hypot(v.x, v.y);
        return { x: (v.x * cos - v.y * sin) / len, y: (v.x * sin + v.y * cos) / len };
    };

    const out = [];
    for (let i = 0; i < n; i++) {
        const a = rho(alpha[i], beta[i]) * d[i] / 3;
        const b = rho(beta[i], alpha[i]) * d[i] / 3;
        const dir0 = rotated(chords[i], alpha[i]);
        const dir1 = rotated(chords[i], -beta[i]);
        const p0 = knots[i], p3 = knots[i + 1];
        const c0 = { x: p0.x + dir0.x * a, y: p0.y + dir0.y * a };
        const c1 = { x: p3.x - dir1.x * b, y: p3.y - dir1.y * b };

        const steps = i === n - 1 ? samplesPerSegment + 1 : samplesPerSegment;
        for (let k = 0; k < steps; k++) {
            const s = k / samplesPerSegment;
            const u = 1 - s;
            out.push(new THREE.Vector3(
                u * u * u * p0.x + 3 * u * u * s * c0.x + 3 * u * s * s * c1.x + s * s * s * p3.x,
                u * u * u * p0.y + 3 * u * u * s * c0.y + 3 * u * s * s * c1.y + s * s * s * p3.y,
                THREE.MathUtils.lerp(p0.z, p3.z, s)
            ));
        }
    }
    return out;
}

/**
 * A centripetal Catmull-Rom spline through the knots, evaluated segment by segment.
 *
 * Unlike the natural spline and Hobby's curve, which solve one system over every
 * knot, each segment here depends only on its four surrounding knots. Appending a
 * knot therefore changes the last two segments and nothing before them, so a growing
 * path keeps its settled shape exactly. The cost is C1 continuity instead of C2.
 */
export function catmullRomSpline(knots, samplesPerSegment = 16, closed = false) {
    const n = knots.length;
    if (n < 2) return knots.map(p => p.clone());
    if (n === 2) return sampleLine(knots[0], knots[1], samplesPerSegment);

    const alpha = 0.5;
    const out = [];
    const segments = closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
        // Closed: neighbors wrap around, and the extra segment joins the ends with
        // the same construction as everywhere else, which is what closes it smoothly.
        const p0 = closed ? knots[(i - 1 + n) % n] : knots[Math.max(0, i - 1)];
        const p1 = knots[i];
        const p2 = knots[(i + 1) % n];
        const p3 = closed ? knots[(i + 2) % n] : knots[Math.min(n - 1, i + 2)];

        // Centripetal knot intervals, so tight spacing does not create loops.
        const t0 = 0;
        const t1 = t0 + Math.max(Math.pow(p0.distanceTo(p1), alpha), 1e-4);
        const t2 = t1 + Math.max(Math.pow(p1.distanceTo(p2), alpha), 1e-4);
        const t3 = t2 + Math.max(Math.pow(p2.distanceTo(p3), alpha), 1e-4);

        const steps = !closed && i === n - 2 ? samplesPerSegment + 1 : samplesPerSegment;
        for (let k = 0; k < steps; k++) {
            const t = THREE.MathUtils.lerp(t1, t2, k / samplesPerSegment);
            const A1 = p0.clone().multiplyScalar((t1 - t) / (t1 - t0)).add(p1.clone().multiplyScalar((t - t0) / (t1 - t0)));
            const A2 = p1.clone().multiplyScalar((t2 - t) / (t2 - t1)).add(p2.clone().multiplyScalar((t - t1) / (t2 - t1)));
            const A3 = p2.clone().multiplyScalar((t3 - t) / (t3 - t2)).add(p3.clone().multiplyScalar((t - t2) / (t3 - t2)));
            const B1 = A1.multiplyScalar((t2 - t) / (t2 - t0)).add(A2.clone().multiplyScalar((t - t0) / (t2 - t0)));
            const B2 = A2.multiplyScalar((t3 - t) / (t3 - t1)).add(A3.multiplyScalar((t - t1) / (t3 - t1)));
            out.push(B1.multiplyScalar((t2 - t) / (t2 - t1)).add(B2.multiplyScalar((t - t1) / (t2 - t1))));
        }
    }
    return out;
}

/**
 * A uniform cubic B-spline over the knots, with the ends clamped by repetition.
 *
 * Each span depends on four consecutive knots, so like the Catmull-Rom it cannot move
 * the settled part of a growing path. It is C2 continuous, smoother than the knots
 * deserve, and pays for it by approximating them instead of passing through.
 */
export function bSpline(knots, samplesPerSegment = 16, closed = false) {
    const n = knots.length;
    if (n < 2) return knots.map(p => p.clone());
    // Open: repeating the endpoints pins the curve to them. Closed: the spans wrap
    // instead, and the same basis that smooths the middle smooths the join.
    const pts = closed
        ? [...knots, knots[0], knots[1], knots[2 % n]]
        : [knots[0], knots[0], ...knots, knots[n - 1], knots[n - 1]];
    const spans = closed ? n : pts.length - 3;
    const out = [];
    for (let j = 0; j < spans; j++) {
        const p0 = pts[j], p1 = pts[j + 1], p2 = pts[j + 2], p3 = pts[j + 3];
        const steps = !closed && j === spans - 1 ? samplesPerSegment + 1 : samplesPerSegment;
        for (let k = 0; k < steps; k++) {
            const t = k / samplesPerSegment;
            const t2 = t * t, t3 = t2 * t;
            const b0 = (1 - 3 * t + 3 * t2 - t3) / 6;
            const b1 = (4 - 6 * t2 + 3 * t3) / 6;
            const b2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
            const b3 = t3 / 6;
            out.push(new THREE.Vector3(
                b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
                b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
                b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z
            ));
        }
    }
    return out;
}

function sampleLine(a, b, samples) {
    return Array.from({ length: samples + 1 }, (_, k) => a.clone().lerp(b, k / samples));
}

function thomas(A, B, C, D) {
    const n = B.length - 1;
    const Cp = [], Dp = [];
    Cp[0] = C[0] / B[0];
    Dp[0] = D[0] / B[0];
    for (let i = 1; i <= n; i++) {
        const denom = B[i] - Cp[i - 1] * A[i];
        Cp[i] = (C[i] ?? 0) / denom;
        Dp[i] = (D[i] - Dp[i - 1] * A[i]) / denom;
    }
    const X = [];
    X[n] = Dp[n];
    for (let i = n - 1; i >= 0; i--) X[i] = Dp[i] - Cp[i] * X[i + 1];
    return X;
}
