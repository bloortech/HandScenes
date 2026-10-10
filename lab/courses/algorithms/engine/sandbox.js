// Sandbox input widgets: array editor, randomize button, size slider,
// and (for binary-search-style topics) a target field. DOM-facing.
// Reads a topic's `sandbox` descriptor to decide what to show.
import { mulberry32, randInt } from './rng.js';

export function createSandbox(container, topic, { onChange }) {
  const desc = topic.sandbox || { type: 'array', min: 1, max: 40, default: 12 };
  let seedCounter = Date.now() % 100000;
  let size = desc.default;
  let array = [];
  let target = null;

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
    arrayInput.value = array.join(', ');
    if (targetInput) targetInput.value = target ?? '';
    emit();
  }

  function emit() {
    const input = desc.type === 'array-sorted' ? { array: array.slice(), target } : { array: array.slice() };
    onChange(input);
  }

  function getInput() {
    return desc.type === 'array-sorted' ? { array: array.slice(), target } : { array: array.slice() };
  }

  randomize();

  return { getInput, randomize, element: wrap };
}

export { randInt };
