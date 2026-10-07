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

    /** Marks the last record as a release. A sharp turn splits a stroke
     * gesture into several records; only the one the pen lifted after
     * carries this. */
    markRelease() {
        const last = this.records[this.records.length - 1];
        if (last) last.release = true;
    }

    /**
     * Removes and returns the last gesture's records: everything after the
     * previous release, so one step of undo drops exactly one stroke with its
     * split pieces and symmetry copies. The base pieces come first, so the
     * returned array's first entry is the gesture's base.
     */
    undoLast() {
        if (!this.records.length) return [];
        let start = this.records.length - 1;
        while (start > 0 && !this.records[start - 1].release) start--;
        return this.records.splice(start);
    }
}
