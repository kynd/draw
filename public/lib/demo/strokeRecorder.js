import * as THREE from 'three';

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
}

/**
 * Replays records through a draw cycle's `feed`, a few points per frame, so each
 * mark grows live the way it was drawn but with the idle time removed.
 * `applyTool(record)` runs before a record's first points, to restore the tool,
 * colors, and parameters it was drawn with.
 * @returns {{finish: function}} `finish` stops the animation and jumps straight
 *          to the end state: every remaining record is committed at once, and
 *          `onDone` still fires.
 */
export function replayRecords({ records, applyTool, feed, pointsPerFrame = 4, onDone }) {
    let ri = 0, pi = 0, raf = 0, ended = false;
    const toVectors = pts => pts.map(p => {
        const v = new THREE.Vector3(p.x, p.y, 0);
        v.pressure = p.pressure;
        return v;
    });
    function end() {
        if (ended) return;
        ended = true;
        onDone?.();
    }
    function frame() {
        if (ended) return;
        if (ri >= records.length) { end(); return; }
        const record = records[ri];
        if (pi === 0) applyTool(record);
        pi = Math.min(pi + pointsPerFrame, record.points.length);
        const done = pi >= record.points.length;
        feed(toVectors(record.points.slice(0, pi)), done);
        if (done) { ri++; pi = 0; }
        raf = requestAnimationFrame(frame);
    }
    function finish() {
        if (ended) return;
        cancelAnimationFrame(raf);
        while (ri < records.length) {
            const record = records[ri];
            applyTool(record);
            feed(toVectors(record.points), true);
            ri++;
        }
        end();
    }
    frame();
    return { finish };
}
