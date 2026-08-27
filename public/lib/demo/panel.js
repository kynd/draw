/**
 * Wires every `.dp-section` in the document so clicking its header collapses it.
 *
 * Shared rather than repeated per demo, so a section behaves the same everywhere.
 * Mark a section `class="dp-section collapsed"` to have it start closed.
 */
export function wireCollapsibles(root = document) {
    root.querySelectorAll('.dp-section-hd').forEach(header => {
        header.addEventListener('click', () => {
            header.closest('.dp-section')?.classList.toggle('collapsed');
        });
    });
}

/**
 * Wires a wireframe toggle button to a stage. The stage applies the state to every
 * stroke mesh on each draw, so rebuilt and live meshes follow it automatically.
 */
export function wireWireframeToggle(button, stage) {
    button.addEventListener('click', () => {
        stage.wireframe = !stage.wireframe;
        button.classList.toggle('active', stage.wireframe);
        stage.draw();
    });
}
