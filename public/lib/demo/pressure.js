/**
 * Pen pressure helpers.
 *
 * DrawInput records a pressure on every drawn point. These read it back: as a
 * function along the stroke, as one average, and through a response curve.
 */

/**
 * The response curve applied before pressure drives anything: pressure raised to
 * `gamma`. Raw tablet pressure feels front-loaded (a light touch already reports a
 * substantial value), so a gamma above 1 spreads the low end out and a gamma below
 * 1 compresses it. 1 is linear.
 */
export function pressureResponse(pressure, gamma = 1) {
    return Math.pow(Math.min(Math.max(pressure, 0), 1), gamma);
}

/**
 * Samples the pressures recorded on drawn points by normalized position, so a
 * value survives the resampling and smoothing of the path it came from. A short
 * moving average (`smooth` points to each side) removes sensor jitter first.
 * @returns {function(number): number} t in 0..1 to pressure.
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
    return t => {
        if (values.length === 0) return 0;
        const f = t * (values.length - 1);
        const i = Math.floor(f);
        const a = values[i] ?? 0;
        const b = values[Math.min(i + 1, values.length - 1)] ?? 0;
        return a + (b - a) * (f - i);
    };
}

/**
 * Caps how fast a width profile can rise or fall per unit of arc length. The
 * profile is sampled along the path and clamped in a forward and a backward pass,
 * so a pressure spike becomes a swell and a quick release a tapered exit instead
 * of a cliff. At `limit` 1 the outline flares at most 45 degrees, which is also
 * about where the ribbon geometry would start to fold.
 * @returns {function(number): number} t in 0..1 to width.
 */
export function limitWidthSlope(path, widthFn, limit = 1, samples = 128) {
    let length = 0;
    for (let i = 1; i < path.length; i++) {
        length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    const ds = (length || 1) / (samples - 1);
    const w = Array.from({ length: samples }, (_, j) => widthFn(j / (samples - 1)));
    for (let j = 1; j < samples; j++) w[j] = Math.min(w[j], w[j - 1] + limit * ds);
    for (let j = samples - 2; j >= 0; j--) w[j] = Math.min(w[j], w[j + 1] + limit * ds);
    return t => {
        const f = Math.min(Math.max(t, 0), 1) * (samples - 1);
        const j = Math.floor(f);
        const a = w[j];
        const b = w[Math.min(j + 1, samples - 1)];
        return a + (b - a) * (f - j);
    };
}

/** The mean recorded pressure, for marks that take one value for the whole. */
export function averagePressure(points) {
    if (points.length === 0) return 0;
    return points.reduce((s, p) => s + (p.pressure ?? 0), 0) / points.length;
}
