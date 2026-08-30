/**
 * Pen pressure helpers.
 *
 * DrawInput records a pressure on every drawn point. These read it back: as a
 * profile over arc length, as one average, and through a response curve.
 *
 * Everything here is parameterized by absolute arc length from the start, not by
 * a fraction of the whole, so a value at a settled position holds still while the
 * stroke grows. Only a bounded zone near the tip changes.
 */

/** Total arc length of a run of points. */
export function pathArcLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return length;
}

/**
 * The response curve applied before pressure drives anything. `floor` is a dead
 * zone: pressure below it counts as zero, and the remainder is stretched back to
 * the full range, so the pen resting on the tablet reads like a mouse rather than
 * already pressing. The result is then raised to `gamma`: raw tablet pressure
 * feels front-loaded (a light touch already reports a substantial value), so a
 * gamma above 1 spreads the low end out and a gamma below 1 compresses it.
 */
export function pressureResponse(pressure, gamma = 1, floor = 0) {
    const p = Math.min(Math.max(pressure, 0), 1);
    const lifted = floor < 1 ? Math.max(p - floor, 0) / (1 - floor) : 0;
    return Math.pow(lifted, gamma);
}

/**
 * The pressures recorded on drawn points, as a function of arc length along them.
 * A short moving average (`smooth` points to each side) removes sensor jitter
 * first; it reaches back only that many points, so past values stay put.
 * @returns {function(number): number} arc length to pressure.
 */
export function pressureAlong(points, smooth = 2) {
    const raw = points.map(p => p.pressure ?? 0);
    let values = raw;
    if (smooth > 0 && raw.length > 2) {
        values = raw.map((_, i) => {
            let sum = 0, count = 0;
            for (let j = -smooth; j <= smooth; j++) {
                if (raw[i + j] !== undefined) { sum += raw[i + j]; count++; }
            }
            return sum / count;
        });
    }
    const s = [0];
    for (let i = 1; i < points.length; i++) {
        s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const total = s[s.length - 1] || 0;
    return arc => {
        if (values.length === 0) return 0;
        if (values.length === 1 || total === 0) return values[0];
        const a = Math.min(Math.max(arc, 0), total);
        let lo = 0, hi = s.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (s[mid] <= a) lo = mid; else hi = mid;
        }
        const span = s[hi] - s[lo] || 1;
        const f = (a - s[lo]) / span;
        return values[lo] + (values[hi] - values[lo]) * f;
    };
}

/** The mean recorded pressure, for marks that take one value for the whole. */
export function averagePressure(points) {
    if (points.length === 0) return 0;
    return points.reduce((s, p) => s + (p.pressure ?? 0), 0) / points.length;
}

/**
 * Caps how fast a width profile can rise or fall per unit of arc length. The
 * profile is a function of arc length; it is sampled at fixed steps anchored at
 * the start (so the settled part of a growing stroke keeps its samples) and
 * clamped in a forward and a backward pass. A pressure spike becomes a swell and
 * a quick release a tapered exit instead of a cliff. At `limit` 1 the outline
 * flares at most 45 degrees, which is also about where the ribbon geometry would
 * start to fold.
 * @param {function(number): number} widthFn  Arc length to width.
 * @returns {function(number): number} t in 0..1 of the path, to width, the form
 *          a renderer's `widthLeft` takes.
 */
export function limitWidthSlope(path, widthFn, limit = 1) {
    const length = pathArcLength(path);
    const STEP = 0.02;
    const count = Math.max(2, Math.ceil((length || STEP) / STEP) + 1);
    const pos = Array.from({ length: count }, (_, j) => Math.min(j * STEP, length));
    const w = pos.map(s => widthFn(s));
    for (let j = 1; j < count; j++) w[j] = Math.min(w[j], w[j - 1] + limit * (pos[j] - pos[j - 1]));
    for (let j = count - 2; j >= 0; j--) w[j] = Math.min(w[j], w[j + 1] + limit * (pos[j + 1] - pos[j]));
    return t => {
        const s = Math.min(Math.max(t, 0), 1) * length;
        const j = Math.min(Math.floor(s / STEP), count - 2);
        const span = pos[j + 1] - pos[j] || 1;
        const f = Math.min(Math.max((s - pos[j]) / span, 0), 1);
        return w[j] + (w[j + 1] - w[j]) * f;
    };
}
