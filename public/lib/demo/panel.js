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
