// Orchestrates a single topic page: loads the topic module, wires the
// sandbox inputs, the player controls, and the canvas renderer together.
import { ArrayRenderer } from './engine/renderer.js';
import { Player, drain } from './engine/player.js';
import { createSandbox } from './engine/sandbox.js';

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const topicId = params.get('t');

async function main() {
  if (!topicId) {
    $('t-title').textContent = 'No topic specified';
    $('t-sub').textContent = 'Add ?t=<topic-id> to the URL, e.g. topic.html?t=quicksort';
    return;
  }

  let topicModule;
  try {
    topicModule = await import(`./topics/${topicId}.js`);
  } catch (e) {
    $('t-title').textContent = 'Topic not found';
    $('t-sub').textContent = `Could not load topics/${topicId}.js`;
    return;
  }
  const topic = topicModule.default;

  document.title = `${topic.title} — Algorithms sandbox`;
  $('t-title').textContent = topic.title;
  $('t-sub').textContent = topic.summary.split('. ')[0] + '.';

  renderCode(topic.code, -1);
  renderExplain(topic.summary);
  $('meta-time').textContent = topic.complexity ? `${topic.complexity.time} ${topic.complexity.why}` : '';
  $('meta-where').textContent = `${topic.course} · CLRS: ${topic.clrs}`;

  const canvas = $('algo-canvas');
  const renderer = new ArrayRenderer(canvas);

  let player = null;

  function runTopicWithInput(input) {
    if (player) player.destroy();
    const { frames, result } = drain(topic.run(input));
    const ok = safeCheck(topic, input, result);
    player = new Player({
      frames,
      onFrame: (frame, idx) => {
        renderer.render(frame);
        renderCode(topic.code, frame.line);
        $('caption').textContent = frame.caption || '';
        $('counters').textContent = formatCounters(frame.counters);
        $('scrub').value = String(idx);
      },
      onPlayStateChange: (playing) => {
        $('btn-play').textContent = playing ? 'Pause' : 'Play';
      },
    });
    $('scrub').max = String(Math.max(0, frames.length - 1));
    $('scrub').value = '0';
    player.goTo(0);
    if (!ok) {
      $('caption').textContent += '  (warning: check() did not pass for this input)';
    }
  }

  const sandbox = createSandbox($('sandbox-controls-host'), topic, {
    onChange: (input) => runTopicWithInput(input),
  });

  // Player control wiring.
  $('btn-play').addEventListener('click', () => player && player.toggle());
  $('btn-fwd').addEventListener('click', () => { if (player) { player.pause(); player.stepForward(); } });
  $('btn-back').addEventListener('click', () => { if (player) { player.pause(); player.stepBack(); } });
  $('scrub').addEventListener('input', (e) => {
    if (player) { player.pause(); player.goTo(Number(e.target.value)); }
  });
  $('speed').addEventListener('change', (e) => {
    if (player) player.setSpeed(Number(e.target.value));
  });

  runTopicWithInput(sandbox.getInput());
}

function safeCheck(topic, input, result) {
  try {
    return !!topic.check(input, result);
  } catch (e) {
    return false;
  }
}

function renderCode(code, activeLine) {
  const lines = Array.isArray(code) ? code : String(code).split('\n');
  const el = $('code-block');
  el.innerHTML = '';
  lines.forEach((line, i) => {
    const span = document.createElement('span');
    span.className = 'line' + (i === activeLine ? ' active' : '');
    span.textContent = line;
    el.appendChild(span);
  });
}

function renderExplain(summary) {
  const el = $('explain');
  el.innerHTML = '';
  // Split into sentences for readability; summary is already short, plain
  // sentences with no em dashes, per the course's copy rules.
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
  const p = document.createElement('p');
  p.textContent = sentences.join(' ');
  el.appendChild(p);
}

function formatCounters(counters) {
  if (!counters) return '';
  return Object.entries(counters)
    .map(([k, v]) => `${k}: ${v}`)
    .join('   ');
}

main();
