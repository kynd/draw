/**
 * Robust pen and mouse input for a DrawingTool. Forwards pointer events to the
 * tool's pointerDown/Move/Up, and guarantees a gesture ends even when its
 * release is missed.
 *
 * A missed release matters: the tool bakes a stroke on pointerUp, so a release
 * that never arrives leaves the stroke uncommitted and the tool mid-gesture,
 * where a later parameter change (a dial turned) rewrites that "finished"
 * stroke. A pen lifted out of the digitizer's range, a lost pointer capture, or
 * the canvas moving in the DOM mid-stroke can all drop the release, so this
 * catches it several ways rather than trusting one event.
 *
 * One pointer draws at a time, tracked by id, so a second touch (a resting palm)
 * cannot end or disturb the stroke. Only the primary button starts one. The
 * release is taken from whichever of these comes first: the canvas
 * pointerup/pointercancel, a window-level pointerup/pointercancel (a release
 * that landed off the canvas), lostpointercapture, a move that arrives with no
 * button held, or the next pointerdown (which commits a stranded stroke before
 * starting the new one).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{pointerDown:Function, pointerMove:Function, pointerUp:Function}} tool
 * @returns {() => void} unbind
 */
export function bindToolInput(canvas, tool) {
    const toLocal = event => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            // Pen pressure rides on the point; a mouse reports a constant while
            // pressed, so it records zero and pressure effects leave it alone.
            pressure: event.pointerType === 'pen' ? event.pressure : 0,
        };
    };

    // The pointer currently drawing, or null. The one source of truth for
    // whether a gesture is in progress, so the canvas and window listeners agree.
    let activeId = null;

    const end = () => {
        if (activeId === null) return;
        const id = activeId;
        activeId = null;        // cleared first, so a cascading release event is a no-op
        try { canvas.releasePointerCapture(id); } catch (e) {}
        tool.pointerUp();
    };

    const down = event => {
        // Only the primary button draws; a right or middle click leaves the
        // canvas alone so its context menu (save image, and so on) still opens.
        if (event.button !== 0) return;
        // A pointerdown while a stroke is still active means the previous
        // release was missed; commit that stranded stroke before starting here.
        if (activeId !== null) end();
        activeId = event.pointerId;
        tool.pointerDown(toLocal(event));
        // Capturing an inactive pointer throws (a synthetic event's id is not an
        // active pointer), and the stroke must not depend on it.
        try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    };
    const move = event => {
        if (event.pointerId !== activeId) return;
        // A move with no button held means the press ended without a pointerup
        // reaching us (a pen lifted out of range, say); take it as the release.
        if (event.buttons === 0) { end(); return; }
        tool.pointerMove(toLocal(event));
    };
    const release = event => { if (event.pointerId === activeId) end(); };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    // A release can land off the canvas when capture is lost; the window catches
    // it. Both may fire for one release, but end() is idempotent.
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    return () => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', release);
        canvas.removeEventListener('pointercancel', release);
        canvas.removeEventListener('lostpointercapture', release);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
    };
}
