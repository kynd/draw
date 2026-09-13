import { rotatedPaths } from '../../lib/pathEffects.js';
import { setupSymmetryBoard } from '../../lib/demo/symmetryBoard.js';

setupSymmetryBoard({
    toolIds: ['pencil', 'brush', 'watercolor'],
    makeSymmetry: () => {
        const count = 2 + Math.floor(Math.random() * 5);
        return path => rotatedPaths(path, { count });
    },
});
