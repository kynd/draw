import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { StrokePlayer, readDrawingZip } from '../../lib/demo/strokePlayer.js';
import { makeMarkBuilder, applyRecordTo } from '../../lib/demo/markBuilder.js';
import { toolRegistry } from '../../lib/demo/toolRegistry.js';

// The player owns no tools of its own: the records name their tools, and the
// state exists only for them to write into.
const state = {
    tool: toolRegistry[0], values: {}, widthPx: 24, sens: 1,
    colorA: '#333333', colorB: '#666666', colors: ['#333333'],
    palette: null, seedOverride: null,
};

const canvas = document.getElementById('canvas');
const stage = new StrokeStage(canvas);
const board = new DrawingBoard(stage);
const cycle = setupDrawCycle({
    stage, board, canvas,
    build: makeMarkBuilder({ state, board }),
    pointerTrace: false,
});
cycle.input.enabled = false;

const player = new StrokePlayer({
    feed: cycle.feed,
    applyRecord: record => applyRecordTo(state, record, toolRegistry),
    clear: background => { cycle.disposeGhost(); board.clear(background); stage.draw(); },
    canvas,
});

const loadBtn = document.getElementById('load-btn');
const loadFile = document.getElementById('load-file');
const loadInfo = document.getElementById('load-info');
const controls = document.getElementById('player-controls');
const playBtn = document.getElementById('play-btn');
const recordBtn = document.getElementById('record-btn');

loadBtn.addEventListener('click', () => {
    if (player.playing) return;
    loadFile.click();
});
loadFile.addEventListener('change', async () => {
    const file = loadFile.files?.[0];
    loadFile.value = '';
    if (!file) return;
    try {
        const data = await readDrawingZip(file);
        player.setData(data);
        cycle.disposeGhost();
        board.clear(player.data.background);
        stage.draw();
        controls.style.display = player.hasData ? '' : 'none';
        loadInfo.textContent = `${player.data.records.length} marks loaded.`;
    } catch (e) {
        loadInfo.textContent = `Could not read the file: ${e.message}`;
    }
});

function setBusy(on) {
    playBtn.textContent = on ? 'Stop' : 'Play';
    recordBtn.disabled = on;
    loadBtn.disabled = on;
}

playBtn.addEventListener('click', () => {
    if (player.playing) { player.finish(); return; }
    if (player.play({ onDone: () => setBusy(false) })) setBusy(true);
});

recordBtn.addEventListener('click', () => {
    if (player.record({ onDone: () => { setBusy(false); recordBtn.classList.remove('active'); } })) {
        setBusy(true);
        recordBtn.classList.add('active');
    }
});
