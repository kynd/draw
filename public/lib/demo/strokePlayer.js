import { replayRecords } from './strokeRecorder.js';

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

/**
 * The standalone playback engine: it receives a drawing's log (the starting
 * background and the records) and plays it through a draw cycle, or records
 * the playback to a video file. It owns no interface; a UI hands it the data
 * and calls `play`, `finish`, and `record`.
 *
 * The engine reaches the surface through three callbacks: `feed` (a draw
 * cycle's feed), `applyRecord` (restores one record's tool and colors before
 * its points), and `clear` (clears the surface to a background spec).
 * `canvas` is captured for the video.
 */
export class StrokePlayer {
    constructor({ feed, applyRecord, clear, canvas }) {
        this.feed = feed;
        this.applyRecord = applyRecord;
        this.clear = clear;
        this.canvas = canvas;
        this.data = null;
        this._player = null;
        this._recording = false;
    }

    /** Receives a drawing: `{ background, records }`. Replaces what it had. */
    setData(data) {
        this.data = {
            background: data.background ?? '#ffffff',
            records: data.records ?? [],
        };
    }

    get hasData() { return (this.data?.records.length ?? 0) > 0; }
    get playing() { return this._player !== null; }
    get recording() { return this._recording; }

    /**
     * Plays the data from its background onward, a few points per frame.
     * Returns whether playback started; `onDone` fires when it ends.
     */
    play({ pointsPerFrame = 4, onDone } = {}) {
        if (this.playing || !this.hasData) return false;
        this.clear(this.data.background);
        this._player = replayRecords({
            records: this.data.records,
            applyTool: this.applyRecord,
            feed: this.feed,
            pointsPerFrame,
            onDone: () => {
                this._player = null;
                onDone?.();
            },
        });
        return true;
    }

    /** Stops a running playback, jumping straight to the end state. */
    finish() { this._player?.finish(); }

    /**
     * Plays while capturing the canvas, then saves the video. The file is mp4
     * where the browser can encode it, webm otherwise. Returns whether the
     * recording started.
     */
    record({ filename = 'drawing', onDone } = {}) {
        if (this.playing || this._recording || !this.hasData) return false;
        const stream = this.canvas.captureStream(60);
        const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            .find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c));
        if (!mime) { console.log('[player] MediaRecorder unavailable'); return false; }
        const media = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
        const chunks = [];
        media.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        media.onstop = () => {
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            downloadBlob(new Blob(chunks, { type: mime }), `${filename}.${ext}`);
        };
        media.start();
        this._recording = true;
        const ok = this.play({
            onDone: () => {
                media.stop();
                this._recording = false;
                onDone?.();
            },
        });
        if (!ok) {
            media.stop();
            this._recording = false;
            return false;
        }
        return true;
    }
}

/** A drawing's log as JSON: the starting background and every record. */
export function serializeDrawing({ background, records }) {
    return JSON.stringify({ version: 1, background, records });
}

/** Saves a drawing's log as a zip holding one JSON file. */
export async function downloadDrawingZip({ background, records }, filename = 'drawing') {
    const { zipSync, strToU8 } = await import(FFLATE);
    const bytes = zipSync(
        { [`${filename}.json`]: strToU8(serializeDrawing({ background, records })) },
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

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
