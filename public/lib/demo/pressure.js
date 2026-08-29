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
 * value survives the resampling and smoothing of the path it came from.
 * @returns {function(number): number} t in 0..1 to pressure.
 */
export function pressureAlong(points) {
    return t => {
        if (points.length === 0) return 0;
        const f = t * (points.length - 1);
        const i = Math.floor(f);
        const a = points[i]?.pressure ?? 0;
        const b = points[Math.min(i + 1, points.length - 1)]?.pressure ?? 0;
        return a + (b - a) * (f - i);
    };
}

/** The mean recorded pressure, for marks that take one value for the whole. */
export function averagePressure(points) {
    if (points.length === 0) return 0;
    return points.reduce((s, p) => s + (p.pressure ?? 0), 0) / points.length;
}
