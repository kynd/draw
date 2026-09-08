// The public contract of the drawing package. The host application depends on
// these shapes only; recordings and live events are opaque to it.

// Parameters = the three dials. Values are dial positions normalized to 0..1;
// the engine reads them as 0..127 integers and may treat them as steps from
// the previous value.
export enum ParameterId {
    COLOR = 'color',
    STROKE_WIDTH = 'strokeWidth',
    TOOL = 'tool',
}

// A recording of a drawing. The host stores it and hands it back for
// playback without reading the contents.
export interface DrawingRecording {
    format: string;
    version: number;
    data: Blob;
}

// One event fired while drawing. The host relays it, unread, to a
// DrawingLiveView.apply on another machine. The contents are resolved
// outcomes (the tool, values, colors, and seeds actually used), not raw
// input, so the applying side rolls no randomness of its own.
export interface DrawingLiveEvent {
    format: string;
    version: number;
    data: unknown;
}

// The engine a person draws with. It attaches its own pen input listeners.
export interface DrawingEngine {
    mount(container: HTMLElement): void;
    clear(): void;
    setParameter(id: ParameterId, value: number): void;
    exportImage(): Promise<Blob>;
    exportRecording(): Promise<DrawingRecording>;
    onLiveEvent(listener: (event: DrawingLiveEvent) => void): () => void;
    destroy(): void;
}

// The live mirror, on another machine. The same drawing code as the engine,
// but it takes no input and runs on applied events alone.
export interface DrawingLiveView {
    mount(container: HTMLElement): void;
    reset(): void;
    apply(event: DrawingLiveEvent): void;
    destroy(): void;
}

// The player that replays a recording.
export interface DrawingPlayer {
    mount(container: HTMLElement): void;
    load(recording: DrawingRecording): Promise<void>;
    play(options?: { speed?: number; loop?: boolean }): void;
    pause(): void;
    seek(progress: number): void;
    onEnded(listener: () => void): () => void;
    destroy(): void;
}
