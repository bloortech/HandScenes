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

  wirePrevNext(topicId);

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
        // Some topics (e.g. recursion-stack) switch between a few different
        // pseudocode listings depending on the input, so a frame can carry
        // its own `code` to show instead of the topic's default.
        renderCode(frame.code || topic.code, frame.line);
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

// prev/next links in U of T course order: syllabus.json's modules are
// already listed in that order (m01 first-year basics through m11's P vs
// NP), and each module's topics are listed in teaching order, so the flat
// concatenation of every built topic, in file order, IS the U of T order.
async function wirePrevNext(currentId) {
  const nav = $('prev-next');
  if (!nav) return;
  try {
    const res = await fetch('./syllabus.json');
    const syllabus = await res.json();
    const ordered = [];
    for (const mod of syllabus.modules) {
      for (const t of mod.topics) {
        if (t.status === 'built') ordered.push({ id: t.id, title: t.title, module: mod.id });
      }
    }
    const idx = ordered.findIndex((t) => t.id === currentId);
    if (idx === -1) return;
    const prev = ordered[idx - 1];
    const next = ordered[idx + 1];
    nav.innerHTML = '';
    const mkLink = (t, label) => {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = `./topic.html?t=${encodeURIComponent(t.id)}`;
      a.textContent = label;
      return a;
    };
    if (prev) nav.appendChild(mkLink(prev, `◀ ${prev.title}`));
    else nav.appendChild(document.createElement('span'));
    const pos = document.createElement('span');
    pos.className = 'prev-next-pos';
    pos.textContent = `${idx + 1} / ${ordered.length}`;
    nav.appendChild(pos);
    if (next) nav.appendChild(mkLink(next, `${next.title} ▶`));
  } catch (e) {
    // Non-fatal: the course map and this page's own content still work
    // without prev/next navigation.
  }
}

function formatCounters(counters) {
  if (!counters) return '';
  return Object.entries(counters)
    .map(([k, v]) => `${k}: ${v}`)
    .join('   ');
}

main();
