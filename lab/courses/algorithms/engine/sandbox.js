// Sandbox input widgets: array editor, randomize button, size slider,
// and (for binary-search-style topics) a target field. DOM-facing.
// Reads a topic's `sandbox` descriptor to decide what to show.
import { mulberry32, randInt } from './rng.js';

export function createSandbox(container, topic, { onChange }) {
  const desc = topic.sandbox || { type: 'array', min: 1, max: 40, default: 12 };
  if (desc.type === 'n') return createNSandbox(container, topic, desc, onChange);
  if (desc.type === 'string') return createStringSandbox(container, topic, desc, onChange);

  let seedCounter = Date.now() % 100000;
  let size = desc.default;
  let array = [];
  let target = null;
  // Extra fields a topic's makeInput() returns beyond `array`/`target`
  // (e.g. bst's searchValue/insertValue/deleteValue, linked-list's
  // insertValue/insertPos/deleteValue). Preserved across manual array edits
  // so those params stay valid instead of silently disappearing.
  let extra = {};

  const wrap = document.createElement('div');
  wrap.className = 'sandbox-controls';

  const sizeRow = document.createElement('div');
  sizeRow.className = 'sandbox-row';
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = `Size: ${size}`;
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = String(desc.min);
  sizeSlider.max = String(desc.max);
  sizeSlider.value = String(size);
  sizeSlider.addEventListener('input', () => {
    size = Number(sizeSlider.value);
    sizeLabel.textContent = `Size: ${size}`;
    randomize();
  });
  sizeRow.append(sizeLabel, sizeSlider);

  const randomizeBtn = document.createElement('button');
  randomizeBtn.type = 'button';
  randomizeBtn.className = 'btn';
  randomizeBtn.textContent = 'Randomize';
  randomizeBtn.addEventListener('click', randomize);

  const arrayRow = document.createElement('div');
  arrayRow.className = 'sandbox-row sandbox-array-row';
  const arrayLabel = document.createElement('label');
  arrayLabel.textContent = 'Array (comma separated):';
  const arrayInput = document.createElement('input');
  arrayInput.type = 'text';
  arrayInput.className = 'sandbox-array-input';
  arrayInput.addEventListener('change', () => {
    const parsed = arrayInput.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (desc.type === 'array-sorted') {
      parsed.sort((a, b) => a - b);
    }
    array = parsed;
    size = array.length;
    sizeSlider.value = String(Math.max(desc.min, Math.min(desc.max, size || 1)));
    sizeLabel.textContent = `Size: ${size}`;
    arrayInput.value = array.join(', ');
    emit();
  });
  arrayRow.append(arrayLabel, arrayInput);

  wrap.append(sizeRow, randomizeBtn, arrayRow);

  let targetInput = null;
  if (desc.type === 'array-sorted') {
    const targetRow = document.createElement('div');
    targetRow.className = 'sandbox-row';
    const targetLabel = document.createElement('label');
    targetLabel.textContent = 'Target:';
    targetInput = document.createElement('input');
    targetInput.type = 'number';
    targetInput.className = 'sandbox-target-input';
    targetInput.addEventListener('change', () => {
      target = Number(targetInput.value);
      emit();
    });
    targetRow.append(targetLabel, targetInput);
    wrap.append(targetRow);
  }

  container.appendChild(wrap);

  function randomize() {
    seedCounter += 1;
    const rng = mulberry32(seedCounter);
    const made = topic.makeInput(rng, size);
    array = made.array;
    target = made.target ?? null;
    const { array: _a, target: _t, ...rest } = made;
    extra = rest;
    arrayInput.value = array.join(', ');
    if (targetInput) targetInput.value = target ?? '';
    emit();
  }

  function buildInput() {
    const base = desc.type === 'array-sorted' ? { array: array.slice(), target } : { array: array.slice() };
    return { ...extra, ...base };
  }

  function emit() {
    onChange(buildInput());
  }

  function getInput() {
    return buildInput();
  }

  randomize();

  return { getInput, randomize, element: wrap };
}

// A sandbox for topics whose input is just a single size-like number `n`
// (big-o-race's max n, recursion-stack's n, hanoi's disk count), with no
// array to edit. Everything else about the input (e.g. which recursion mode
// to demo) is chosen by the topic's own makeInput() from the rng, same as
// test.mjs does, so the sandbox and the test suite agree on what a "size"
// means for that topic.
function createNSandbox(container, topic, desc, onChange) {
  let seedCounter = Date.now() % 100000;
  let n = desc.default;
  let input = null;

  const wrap = document.createElement('div');
  wrap.className = 'sandbox-controls';

  const sizeRow = document.createElement('div');
  sizeRow.className = 'sandbox-row';
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = `${desc.label || 'n'}: ${n}`;
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = String(desc.min);
  sizeSlider.max = String(desc.max);
  sizeSlider.value = String(n);
  sizeSlider.addEventListener('input', () => {
    n = Number(sizeSlider.value);
    sizeLabel.textContent = `${desc.label || 'n'}: ${n}`;
    randomize();
  });
  sizeRow.append(sizeLabel, sizeSlider);

  const randomizeBtn = document.createElement('button');
  randomizeBtn.type = 'button';
  randomizeBtn.className = 'btn';
  randomizeBtn.textContent = 'Randomize';
  randomizeBtn.addEventListener('click', randomize);

  wrap.append(sizeRow, randomizeBtn);
  container.appendChild(wrap);

  function randomize() {
    seedCounter += 1;
    const rng = mulberry32(seedCounter);
    input = topic.makeInput(rng, n);
    onChange(input);
  }

  function getInput() {
    return input;
  }

  randomize();

  return { getInput, randomize, element: wrap };
}

// A sandbox for topics whose user-editable input is a single text string
// (dfa/nfa-subset's test string, regex-nfa's regex), with everything else
// about the instance (the random automaton, or the random test strings used
// to check a regex's NFA) regenerated by the topic's own makeInput() and
// preserved across edits, the same "extra fields" pattern the array sandbox
// uses for bst/linked-list's non-array params. `desc.field` names which key
// in makeInput's return value is the editable string (defaults to
// `"string"`); `desc.min`/`max` size the random string/regex length.
function createStringSandbox(container, topic, desc, onChange) {
  const field = desc.field || 'string';
  let seedCounter = Date.now() % 100000;
  let len = desc.default;
  let value = '';
  let extra = {};

  const wrap = document.createElement('div');
  wrap.className = 'sandbox-controls';

  const sizeRow = document.createElement('div');
  sizeRow.className = 'sandbox-row';
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = `${desc.label || 'length'}: ${len}`;
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = String(desc.min);
  sizeSlider.max = String(desc.max);
  sizeSlider.value = String(len);
  sizeSlider.addEventListener('input', () => {
    len = Number(sizeSlider.value);
    sizeLabel.textContent = `${desc.label || 'length'}: ${len}`;
    randomize();
  });
  sizeRow.append(sizeLabel, sizeSlider);

  const randomizeBtn = document.createElement('button');
  randomizeBtn.type = 'button';
  randomizeBtn.className = 'btn';
  randomizeBtn.textContent = 'Randomize';
  randomizeBtn.addEventListener('click', randomize);

  const strRow = document.createElement('div');
  strRow.className = 'sandbox-row sandbox-array-row';
  const strLabel = document.createElement('label');
  strLabel.textContent = `${desc.fieldLabel || field} (${(desc.alphabet || []).join('/') || 'text'}):`;
  const strInput = document.createElement('input');
  strInput.type = 'text';
  strInput.className = 'sandbox-array-input';
  strInput.addEventListener('change', () => {
    value = strInput.value;
    emit();
  });
  strRow.append(strLabel, strInput);

  wrap.append(sizeRow, randomizeBtn, strRow);
  container.appendChild(wrap);

  function randomize() {
    seedCounter += 1;
    const rng = mulberry32(seedCounter);
    const made = topic.makeInput(rng, len);
    value = made[field] ?? '';
    const rest = { ...made };
    delete rest[field];
    extra = rest;
    strInput.value = value;
    emit();
  }

  function buildInput() {
    return { ...extra, [field]: value };
  }

  function emit() {
    onChange(buildInput());
  }

  function getInput() {
    return buildInput();
  }

  randomize();

  return { getInput, randomize, element: wrap };
}

export { randInt };
