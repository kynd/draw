import { MidiInput } from '../../../lib/demo/midi.js';

const MAX_LINES = 500;

if (new URLSearchParams(location.search).has('embedded')) {
    document.getElementById('layout').classList.add('embedded');
}

const log = document.getElementById('log');
const devicesEl = document.getElementById('devices');

function addLine(text, meta = false) {
    const line = document.createElement('div');
    line.className = meta ? 'line meta' : 'line';
    line.textContent = text;
    log.appendChild(line);
    while (log.childElementCount > MAX_LINES) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
}

function addMessage(m) {
    const bytes = m.data.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const channel = m.channel === null ? '' : ` ch ${m.channel}`;
    const line = document.createElement('div');
    line.className = 'line';
    line.textContent = `${m.time.toFixed(0).padStart(8)}  ${m.type}${channel}  ${m.detail}  `;
    const span = document.createElement('span');
    span.className = 'bytes';
    span.textContent = `[${bytes}]  ${m.port}`;
    line.appendChild(span);
    log.appendChild(line);
    while (log.childElementCount > MAX_LINES) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
}

const midi = new MidiInput({
    onMessage: addMessage,
    onDevices: (inputs) => {
        devicesEl.textContent = inputs.length
            ? inputs.map(i => [i.manufacturer, i.name].filter(Boolean).join(' ')).join(', ')
            : 'No inputs.';
        addLine(`inputs: ${inputs.length ? inputs.map(i => i.name).join(', ') : 'none'}`, true);
    },
});

document.getElementById('clear-btn').addEventListener('click', () => { log.innerHTML = ''; });

midi.start().then(() => {
    addLine('MIDI access granted, listening.', true);
}).catch(err => {
    addLine(err.message, true);
});
