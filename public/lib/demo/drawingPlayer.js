import * as THREE from 'three';

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

/**
 * The standalone playback engine: it receives a drawing's log and runs a full
 * transport over it — play, pause, seek, step, rewind, finish — or records the
 * playback to a video file. It owns no interface; a host hands it the data and
 * drives the transport.
 *
 * The callbacks are the wiring, not the data; everything they restore comes
 * out of the log. `feed(points, done)` hands points to whatever cycle the host
 * wires up; `applyRecord(record)` restores one record's tool and colors before
 * its points; `clear(background)` resets the surface to the log's background;
 * `resize(width, height)` (optional) applies the log's canvas size before the
 * first clear; `canvas` is the surface `record` captures its stream from.
 *
 * Seeking is rebuilt, not rewound: strokes are paint on a raster, so moving
 * backward clears and re-feeds from the start, while moving forward feeds only
 * the difference. Each pass is stroke-level (whole paths, no animation), which
 * is also what `finish` does, so jumping to the end stays cheap.
 */
export class DrawingPlayer {
    constructor({ feed, applyRecord, clear, resize = null, canvas, feedGroup = null, simultaneous = null }) {
        this.feed = feed;
        this.applyRecord = applyRecord;
        this.clear = clear;
        this.resize = resize;
        this.canvas = canvas;
        // A gesture whose records were drawn together (a symmetric stroke's copies) is
        // animated in lockstep through `feedGroup`; `simultaneous(records)` decides which
        // gestures those are. Without both, every record animates on its own, as before.
        this.feedGroup = feedGroup;
        this.simultaneous = simultaneous;
        this._group = null;
        this.data = null;
        this._pos = 0;          // committed records
        this._pi = 0;           // points fed of the current record
        this._raf = 0;
        this._playing = false;
        this._recording = false;
        this._waitUntil = 0;
        this._strokeWaitMs = 0;
        this._instantInitial = true;
        // Whether the canvas raster matches the data up to `position`. False
        // until the first reset, and after new data arrives.
        this._primed = false;
        this._onDone = null;
        this._listeners = new Map();
    }

    /** Receives a drawing's log: `{ size?, background, records }`. */
    setData(data) {
        this.pause();
        this.data = {
            size: data.size ?? null,
            background: data.background ?? '#ffffff',
            // Copied: the host's live record list must not grow under a
            // playback that reads it.
            records: [...(data.records ?? [])],
        };
        this._pos = 0;
        this._pi = 0;
        this._primed = false;
    }

    get hasData() { return (this.data?.records.length ?? 0) > 0; }
    get length() { return this.data?.records.length ?? 0; }
    get position() { return this._pos; }
    /** How far playback has come, 0..1 over every record, counting the
     * fed part of the record under way; 1 is the finished drawing. */
    get progress() {
        if (!this.length) return 0;
        if (this._pi === 0) return Math.min(1, this._pos / this.length);
        const span = this._group ? this._group.end - this._pos : 1;
        const total = this._group ? this._group.len : this.data.records[this._pos].points.length;
        const part = total > 0 ? (this._pi / total) * span : 0;
        return Math.min(1, (this._pos + part) / this.length);
    }
    get playing() { return this._playing; }
    get recording() { return this._recording; }

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return this;
    }

    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
        return this;
    }

    _emit(event, payload) {
        this._listeners.get(event)?.forEach(fn => fn(payload));
    }

    _reset() {
        this._waitUntil = 0;
        this._group = null;
        if (this.data.size) this.resize?.(this.data.size[0], this.data.size[1]);
        this.clear(this.data.background);
        this._pos = 0;
        this._pi = 0;
        this._primed = true;
    }

    /** The index one past the last record of the gesture at `pos` (the release). */
    _gestureEnd(pos) {
        let i = pos;
        while (i < this.length && !this.data.records[i].release) i++;
        return Math.min(i + 1, this.length);
    }

    /**
     * Animates from the current position, a few points per frame, resting
     * `strokeWaitMs` after each record marked `release` (a sharp turn splits
     * a stroke gesture into several records; only the last is a release, so
     * the rest falls where the pen actually lifted). With `instantInitial`
     * (the default), records marked `initial` (what the clear's initializer
     * laid down) are placed instantly instead of animated. Returns whether
     * playback started; `onDone` fires when the end is reached.
     */
    play({ pointsPerFrame = 4, strokeWaitMs = 0, instantInitial = true, onDone } = {}) {
        if (this._playing || !this.hasData) return false;
        if (!this._primed || this._pos >= this.length) this._reset();
        this._ppf = pointsPerFrame;
        this._strokeWaitMs = strokeWaitMs;
        this._instantInitial = instantInitial;
        this._onDone = onDone ?? null;
        this._playing = true;
        // Resuming mid-record: the record's state may not be current anymore.
        if (this._pi > 0) this.applyRecord(this.data.records[this._pos]);
        this._emit('play');
        this._frame();
        return true;
    }

    /** Holds a running playback; the canvas keeps what is drawn. */
    pause() {
        if (!this._playing) return;
        cancelAnimationFrame(this._raf);
        this._playing = false;
        this._emit('pause');
    }

    /** Continues a paused playback. */
    resume() { this.play(); }

    _frame() {
        if (!this._playing) return;
        // The rest between records, measured in wall time so a pause during
        // it simply holds.
        if (this._waitUntil && performance.now() < this._waitUntil) {
            this._raf = requestAnimationFrame(() => this._frame());
            return;
        }
        this._waitUntil = 0;
        // Initializer records are placed instantly, whole strokes at once, so
        // playback starts from the drawing itself.
        while (this._instantInitial && this._pi === 0
            && this._pos < this.length && this.data.records[this._pos].initial) {
            const record = this.data.records[this._pos];
            this.applyRecord(record);
            this.feed(toVectors(record.points), true);
            this._pos++;
            this._emit('step');
        }
        if (this._pos >= this.length) {
            this._playing = false;
            this._emit('progress');
            this._emit('end');
            const done = this._onDone;
            this._onDone = null;
            done?.();
            return;
        }
        // A symmetric stroke's records were drawn together, so animate them together:
        // detect the group at its first record, then each frame feed every record in it
        // grown to the same length, until the longest is done.
        if (this._pi === 0 && !this._group && this.feedGroup && this.simultaneous) {
            const end = this._gestureEnd(this._pos);
            const recs = this.data.records.slice(this._pos, end);
            if (end - this._pos > 1 && this.simultaneous(recs)) {
                this._group = { end, len: Math.max(...recs.map(r => r.points.length)) };
            }
        }
        if (this._group) {
            const recs = this.data.records.slice(this._pos, this._group.end);
            this._pi = Math.min(this._pi + this._ppf, this._group.len);
            const groupDone = this._pi >= this._group.len;
            this.feedGroup(recs.map(r => ({
                record: r, points: toVectors(r.points.slice(0, this._pi)),
            })), groupDone);
            if (groupDone) {
                const last = recs[recs.length - 1];
                this._pos = this._group.end;
                this._pi = 0;
                this._group = null;
                this._emit('step');
                if (this._strokeWaitMs > 0 && this._pos < this.length && last.release) {
                    this._waitUntil = performance.now() + this._strokeWaitMs;
                }
            }
            this._emit('progress');
            this._raf = requestAnimationFrame(() => this._frame());
            return;
        }
        const record = this.data.records[this._pos];
        if (this._pi === 0) this.applyRecord(record);
        this._pi = Math.min(this._pi + this._ppf, record.points.length);
        const done = this._pi >= record.points.length;
        this.feed(toVectors(record.points.slice(0, this._pi)), done);
        if (done) {
            this._pos++;
            this._pi = 0;
            this._emit('step');
            if (this._strokeWaitMs > 0 && this._pos < this.length && record.release) {
                this._waitUntil = performance.now() + this._strokeWaitMs;
            }
        }
        this._emit('progress');
        this._raf = requestAnimationFrame(() => this._frame());
    }

    /**
     * Jumps so records 0..index-1 are drawn, instantly. Backward motion
     * rebuilds from the cleared background; forward motion feeds only the
     * difference.
     */
    seek(index) {
        if (!this.data) return;
        const target = Math.max(0, Math.min(this.length, Math.round(index)));
        const wasPlaying = this._playing;
        this.pause();
        this._waitUntil = 0;
        this._group = null;
        if (!this._primed || target < this._pos) this._reset();
        // A partially fed record past the target is undone with an empty feed.
        if (this._pi > 0 && target <= this._pos) {
            this.feed([], false);
            this._pi = 0;
        }
        while (this._pos < target) {
            const record = this.data.records[this._pos];
            this.applyRecord(record);
            this.feed(toVectors(record.points), true);
            this._pos++;
            this._pi = 0;
        }
        this._emit('step');
        this._emit('progress');
        if (wasPlaying && this._pos < this.length) {
            this.play({
                pointsPerFrame: this._ppf, strokeWaitMs: this._strokeWaitMs,
                instantInitial: this._instantInitial, onDone: this._onDone,
            });
        }
    }

    /** One record forward, drawn instantly. */
    next() { this.seek(this._pos + 1); }

    /** One record back. */
    prev() { this.seek(this._pi > 0 ? this._pos : this._pos - 1); }

    /** Back to the cleared background, position 0. */
    rewind() { this.seek(0); }

    /** Jumps to the end, everything drawn. A running playback's onDone fires. */
    finish() {
        const done = this._onDone;
        this._onDone = null;
        this.seek(this.length);
        this._emit('end');
        done?.();
    }

    /**
     * Plays from the start while capturing the canvas, then saves the video.
     * The file is mp4 where the browser can encode it, webm otherwise.
     * Returns whether the recording started.
     */
    record({ filename = 'drawing', onDone } = {}) {
        if (this._playing || this._recording || !this.hasData) return false;
        const stream = this.canvas.captureStream(60);
        // H.264 (mp4) caps the frame size (about 36864 macroblocks, 4096 to a side).
        // A supersampled canvas on a large window exceeds it, and the mp4 encoder then
        // yields an empty file, so past the cap we skip mp4 for webm (VP9 allows far
        // larger). A canvas within the cap still records as mp4.
        const w = this.canvas.width, h = this.canvas.height;
        const h264Fits = w <= 4096 && h <= 4096
            && Math.ceil(w / 16) * Math.ceil(h / 16) <= 36864;
        const candidates = h264Fits
            ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            : ['video/webm;codecs=vp9', 'video/webm'];
        const mime = candidates.find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c));
        if (!mime) { console.log('[player] MediaRecorder unavailable'); return false; }
        const media = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
        const chunks = [];
        media.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        media.onstop = () => {
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            downloadBlob(new Blob(chunks, { type: mime }), `${filename}.${ext}`);
        };
        // A timeslice flushes chunks during the recording rather than only at stop.
        media.start(250);
        this._recording = true;
        this._primed = false;   // recording always starts from the beginning
        this._emit('record-start');
        const finish = () => {
            // Pad a short tail of the finished drawing before stopping: too few frames
            // yield an empty file (the encoder emits nothing), and a brief drawing can
            // replay in under that. requestFrame re-captures the current canvas without
            // a redraw, so the video also ends on the complete drawing.
            const track = stream.getVideoTracks()[0];
            let n = 0;
            const tail = setInterval(() => {
                track?.requestFrame?.();
                if (++n >= 36) {
                    clearInterval(tail);
                    media.stop();
                    this._recording = false;
                    this._emit('record-end');
                    onDone?.();
                }
            }, 1000 / 60);
        };
        const ok = this.play({ onDone: finish });
        if (!ok) {
            media.stop();
            this._recording = false;
            this._emit('record-end');
            return false;
        }
        return true;
    }
}

function toVectors(pts) {
    return pts.map(p => {
        const v = new THREE.Vector3(p.x, p.y, 0);
        v.pressure = p.pressure;
        return v;
    });
}

/** A drawing's log as JSON: the canvas size, the background, every record. */
export function serializeDrawing({ size = null, background, records }) {
    return JSON.stringify({ version: 2, size, background, records });
}

/** Saves a drawing's log as a zip holding one JSON file. */
export async function downloadDrawingZip({ size, background, records }, filename = 'drawing') {
    const { zipSync, strToU8 } = await import(FFLATE);
    const bytes = zipSync(
        { [`${filename}.json`]: strToU8(serializeDrawing({ size, background, records })) },
        { level: 6 }
    );
    downloadBlob(new Blob([bytes], { type: 'application/zip' }), `${filename}.zip`);
}

/** Reads a drawing's log back from a zip (or a bare JSON file). */
export async function readDrawingZip(file) {
    if (file.name.endsWith('.json')) return JSON.parse(await file.text());
    const { unzipSync, strFromU8 } = await import(FFLATE);
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const name = Object.keys(entries).find(n => n.endsWith('.json'));
    if (!name) throw new Error('the zip holds no JSON file');
    return JSON.parse(strFromU8(entries[name]));
}

export function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
