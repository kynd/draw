/**
 * Records everything needed to replay a drawing: the background from the last
 * clear (a color or any serializable spec the board's clear accepts), and one
 * record per committed mark. A record carries whatever the demo
 * needs to rebuild the mark (tool, parameter values, colors, seed) plus the
 * drawn points with their pressures. Only drawn points are stored — blank time
 * and frames without movement cost nothing, so a replay skips them by
 * construction.
 */
export class StrokeRecorder {
    constructor() {
        this.background = '#ffffff';
        this.records = [];
    }

    /** Starts a new take, as a clear does. */
    begin(background) {
        this.background = background;
        this.records = [];
    }

    /** Adds one committed mark. `points` are copied as plain {x, y, pressure}. */
    add(record, points) {
        this.records.push({
            ...record,
            points: points.map(p => ({ x: p.x, y: p.y, pressure: p.pressure ?? 0 })),
        });
    }

    /** Marks the last record as a release. A sharp turn splits one gesture
     * into several records; only the one the pen lifted after carries this. */
    markRelease() {
        const last = this.records[this.records.length - 1];
        if (last) last.release = true;
    }
}
