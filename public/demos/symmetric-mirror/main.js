import { mirroredPath } from '../../lib/pathEffects.js';
import { setupSymmetryBoard } from '../../lib/demo/symmetryBoard.js';

setupSymmetryBoard({
    toolIds: ['pencil', 'brush', 'watercolor'],
    makeSymmetry: () => path => [mirroredPath(path)],
});
