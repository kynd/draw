import { DrawingTool } from '../../lib/demo/drawingTool/DrawingTool.js';
import { PlaybackConfig } from '../../lib/demo/toolConfigs.js';
import { readDrawingZip } from '../../lib/demo/drawingPlayer.js';

// The headless engine is the playback host: no UI attached, nothing calls the
// pointer API, and the transport is driven through `tool.player`.
const tool = new DrawingTool(document.getElementById('canvas'), new PlaybackConfig());
const player = tool.player;

const loadBtn = document.getElementById('load-btn');
const loadFile = document.getElementById('load-file');
const loadInfo = document.getElementById('load-info');
const controls = document.getElementById('player-controls');
const transport = document.getElementById('player-transport');
const playBtn = document.getElementById('play-btn');
const recordBtn = document.getElementById('record-btn');
const rewindBtn = document.getElementById('rewind-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const endBtn = document.getElementById('end-btn');

loadBtn.addEventListener('click', () => {
    if (player.playing || player.recording) return;
    loadFile.click();
});
loadFile.addEventListener('change', async () => {
    const file = loadFile.files?.[0];
    loadFile.value = '';
    if (!file) return;
    try {
        const data = await readDrawingZip(file);
        tool.setDrawingData(data);
        player.setData(data);
        controls.style.display = player.hasData ? '' : 'none';
        transport.style.display = player.hasData ? '' : 'none';
        syncInfo();
    } catch (e) {
        loadInfo.textContent = `Could not read the file: ${e.message}`;
    }
});

function syncInfo() {
    if (!player.hasData) return;
    loadInfo.textContent = `${player.position} / ${player.length} marks`;
}

function syncButtons() {
    playBtn.textContent = player.playing ? 'Pause' : 'Play';
    recordBtn.disabled = player.playing;
    loadBtn.disabled = player.playing || player.recording;
    for (const btn of [rewindBtn, prevBtn, nextBtn, endBtn]) {
        btn.disabled = player.recording;
    }
}

playBtn.addEventListener('click', () => {
    if (player.playing) player.pause();
    else player.play();
});
rewindBtn.addEventListener('click', () => player.rewind());
prevBtn.addEventListener('click', () => player.prev());
nextBtn.addEventListener('click', () => player.next());
endBtn.addEventListener('click', () => player.finish());

recordBtn.addEventListener('click', () => {
    if (player.record()) recordBtn.classList.add('active');
});

for (const event of ['play', 'pause', 'end', 'step']) {
    player.on(event, () => { syncButtons(); syncInfo(); });
}
player.on('record-end', () => {
    recordBtn.classList.remove('active');
    syncButtons();
});
