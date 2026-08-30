import * as THREE from 'three';

/**
 * Records everything needed to replay a drawing: the canvas color from the last
 * clear, and one record per committed mark. A record carries whatever the demo
 * needs to rebuild the mark (tool, parameter values, colors, seed) plus the
 * drawn points with their pressures. Only drawn points are stored — blank time
 * and frames without movement cost nothing, so a replay skips them by
 * construction.
 */
export class StrokeRecorder {
    constructor() {
        this.canvasColor = '#ffffff';
        this.records = [];
    }

    /** Starts a new take, as a clear does. */
    begin(canvasColor) {
        this.canvasColor = canvasColor;
        this.records = [];
    }

    /** Adds one committed mark. `points` are copied as plain {x, y, pressure}. */
    add(record, points) {
        this.records.push({
            ...record,
            points: points.map(p => ({ x: p.x, y: p.y, pressure: p.pressure ?? 0 })),
        });
    }
}

/**
 * Replays records through a draw cycle's `feed`, a few points per frame, so each
 * mark grows live the way it was drawn but with the idle time removed.
 * `applyTool(record)` runs before a record's first points, to restore the tool,
 * colors, and parameters it was drawn with.
 * @returns {function} cancel.
 */
export function replayRecords({ records, applyTool, feed, pointsPerFrame = 4, onDone }) {
    let ri = 0, pi = 0, raf = 0;
    function frame() {
        if (ri >= records.length) { onDone?.(); return; }
        const record = records[ri];
        if (pi === 0) applyTool(record);
        pi = Math.min(pi + pointsPerFrame, record.points.length);
        const points = record.points.slice(0, pi).map(p => {
            const v = new THREE.Vector3(p.x, p.y, 0);
            v.pressure = p.pressure;
            return v;
        });
        const done = pi >= record.points.length;
        feed(points, done);
        if (done) { ri++; pi = 0; }
        raf = requestAnimationFrame(frame);
    }
    frame();
    return () => cancelAnimationFrame(raf);
}
