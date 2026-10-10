// Renders the course map (index.html) in two views: by U of T course, and
// by CLRS chapter. Fetches syllabus.json and builds the DOM; no framework.

const mapEl = document.getElementById('course-map');
const toggleEl = document.getElementById('view-toggle');

let syllabus = null;
let view = 'year';

async function load() {
  const res = await fetch('./syllabus.json');
  syllabus = await res.json();
  render();
}

function topicCard(topic) {
  const built = topic.status === 'built';
  const el = document.createElement(built ? 'a' : 'div');
  el.className = `topic-card ${built ? 'built' : 'todo'}`;
  if (built) el.href = `./topic.html?t=${encodeURIComponent(topic.id)}`;
  const title = document.createElement('p');
  title.className = 't-title';
  title.textContent = topic.title;
  const tag = document.createElement('p');
  tag.className = 't-tag';
  tag.textContent = built ? 'Live' : 'Tonight';
  el.append(title, tag);
  return el;
}

// Groups modules by their approximate U of T program year (syllabus.json's
// own module order is already the U of T teaching order within and across
// years, so modules simply keep that order inside each year group too).
function renderByYear() {
  mapEl.innerHTML = '';
  const years = new Map();
  for (const mod of syllabus.modules) {
    const y = mod.year || 'Year ?';
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(mod);
  }
  for (const [year, mods] of years) {
    const yearSection = document.createElement('section');
    yearSection.className = 'year-group';
    const yh = document.createElement('h1');
    yh.className = 'year-title';
    yh.textContent = year;
    yearSection.appendChild(yh);
    for (const mod of mods) {
      const group = document.createElement('section');
      group.className = 'module-group';
      const h2 = document.createElement('h2');
      h2.textContent = `${mod.id.toUpperCase()}. ${mod.title}`;
      const meta = document.createElement('p');
      meta.className = 'module-meta';
      meta.textContent = `${mod.course} · CLRS: ${mod.clrs}`;
      const grid = document.createElement('div');
      grid.className = 'topic-grid';
      for (const topic of mod.topics) grid.appendChild(topicCard(topic));
      group.append(h2, meta, grid);
      yearSection.appendChild(group);
    }
    mapEl.appendChild(yearSection);
  }
}

function renderByClrs() {
  mapEl.innerHTML = '';
  // Group topics by their own clrs label when present, else the module's.
  const groups = new Map();
  for (const mod of syllabus.modules) {
    for (const topic of mod.topics) {
      const label = topic.clrs || mod.clrs;
      if (!groups.has(label)) groups.set(label, { label, topics: [] });
      groups.get(label).topics.push({ topic, mod });
    }
  }
  for (const { label, topics } of groups.values()) {
    const group = document.createElement('section');
    group.className = 'module-group';
    const h2 = document.createElement('h2');
    h2.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'topic-grid';
    for (const { topic } of topics) grid.appendChild(topicCard(topic));
    group.append(h2, grid);
    mapEl.appendChild(group);
  }
}

function render() {
  if (view === 'year') renderByYear();
  else renderByClrs();
}

toggleEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  view = btn.dataset.view;
  for (const b of toggleEl.querySelectorAll('button')) b.classList.toggle('on', b === btn);
  render();
});

load();
