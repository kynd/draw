import * as THREE from 'three';
import { resampleEvery, catmullRomSpline } from '../curves.js';
import { DrawInput } from './drawInput.js';

/**
 * The draw-then-bake cycle every freehand demo shares.
 *
 * Wires a DrawInput to a stage and a DrawingBoard: the drawn points are lightly
 * smoothed, `build` turns them into a mesh, the pointer's own path shows as a one
 * pixel black line while drawing, and the finished mark bakes into the board. While
 * the stage's wireframe overlay is on, the last baked mark keeps its wireframe, as
 * plain black lines, until the next mark starts.
 *
 * `build(path, points, seed)` receives the smoothed path, the raw points (which
 * carry pressure), and the mark's seed, and returns `{ mesh, renderer }` or null.
 *
 * The pointer is one source of strokes, not the only one: the returned `feed`
 * takes (points, done) exactly as the pointer produces them, so a replay or a
 * generated stroke runs through the same cycle. `onCommit(points, seed)` fires
 * after a mark bakes, with the raw points that made it.
 */
export function setupDrawCycle({ stage, board, canvas, build, minDistance, onCommit }) {
    let seed = 1;

    let live = null;
    function disposeLive() {
        if (!live) return;
        stage.remove(live.mesh);
        live.renderer.dispose(live.mesh);
        live = null;
    }

    // The last baked mark, kept as a wire-only overlay so the wireframe stays
    // readable over the bake. The mark's own shader would redraw the baked pixels
    // in place, so the overlay swaps in plain black lines.
    let ghost = null;
    function makeWireOnly(mesh) {
        // Flag the meshes themselves: the stage's wireframe pass walks meshes,
        // and a mark may be a group, which it would skip.
        mesh.traverse(child => {
            if (!child.isMesh) return;
            child.userData.wireOnly = true;
            child.userData.origMaterial = child.material;
            child.material = new THREE.MeshBasicMaterial({ color: '#000000', wireframe: true });
        });
    }
    function disposeGhost() {
        if (!ghost) return;
        stage.remove(ghost.mesh);
        ghost.mesh.traverse(child => {
            if (!child.isMesh || !child.userData.origMaterial) return;
            child.material.dispose();
            child.material = child.userData.origMaterial;
            delete child.userData.origMaterial;
        });
        ghost.renderer.dispose(ghost.mesh);
        ghost = null;
    }

    // The pointer's own path, shown over the live mark while drawing and gone on
    // release. THREE.Line stays one pixel wide at any scale.
    const pointerLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#000000' })
    );
    pointerLine.position.z = 0.06;
    pointerLine.frustumCulled = false;
    stage.add(pointerLine);

    function setPointerLine(points) {
        pointerLine.geometry.dispose();
        const geometry = new THREE.BufferGeometry();
        const array = new Float32Array(points.length * 3);
        points.forEach((p, i) => {
            array[i * 3] = p.x;
            array[i * 3 + 1] = p.y;
            array[i * 3 + 2] = 0;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
        pointerLine.geometry = geometry;
    }

    function buildFromPoints(points) {
        if (points.length < 2) return null;
        // Light smoothing, so the mark follows the hand without recording its
        // jitter. The spline is local: a new point reshapes only the last few
        // segments, so the drawn part holds still while the stroke grows.
        const knots = resampleEvery(points, 0.06);
        const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : points;
        if (path.length < 2) return null;
        return build(path, points, seed);
    }

    function feed(points, done) {
        disposeGhost();
        disposeLive();
        live = buildFromPoints(points);
        if (live) stage.add(live.mesh);
        setPointerLine(done ? [] : points);
        if (done && live) {
            board.bake([live.mesh]);
            ghost = live;
            makeWireOnly(ghost.mesh);
            // The bake scene borrowed the mesh; the overlay needs it back.
            stage.add(ghost.mesh);
            live = null;
            onCommit?.(points, seed);
            seed++;
        }
        stage.draw();
    }

    const input = new DrawInput(canvas, stage, { minDistance, onChange: feed });

    return { disposeGhost, input, feed };
}
