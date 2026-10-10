#!/usr/bin/env node
// Plain node test runner, no dependencies. Run from anywhere:
//   node lab/courses/algorithms/test.mjs
// Imports every topic file whose status is "built" in syllabus.json, runs it
// on many seeded-random inputs across several sizes plus edge cases, drains
// the generator, and checks the result with the topic's own check().

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mulberry32 } from './engine/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const syllabus = JSON.parse(readFileSync(path.join(HERE, 'syllabus.json'), 'utf8'));

export const TESTED_IDS = [];
for (const mod of syllabus.modules) {
  for (const topic of mod.topics) {
    if (topic.status === 'built') TESTED_IDS.push(topic.id);
  }
}

const SIZES = [0, 1, 2, 3, 5, 8, 16, 31];
const RUNS_PER_SIZE = 3; // >= 20 random inputs per topic across sizes, plus edge cases below
const EDGE_SIZES = [0, 1, 2];

let failures = 0;
let ran = 0;

async function testTopic(id) {
  const mod = await import(`./topics/${id}.js`);
  const topic = mod.default;
  if (!topic || typeof topic.run !== 'function') {
    console.error(`FAIL [${id}] does not export a default with a run() function`);
    failures++;
    return;
  }

  let seed = 1;
  let caseCount = 0;

  const checkOne = (input, label) => {
    caseCount++;
    ran++;
    let gen;
    try {
      gen = topic.run(input);
    } catch (e) {
      console.error(`FAIL [${id}] (${label}) run() threw: ${e.message}`);
      failures++;
      return;
    }
    let frameCount = 0;
    let result;
    try {
      let next = gen.next();
      while (!next.done) {
        frameCount++;
        if (next.value == null || typeof next.value !== 'object') {
          throw new Error('frame is not a plain object');
        }
        next = gen.next();
      }
      result = next.value;
    } catch (e) {
      console.error(`FAIL [${id}] (${label}) generator threw while draining: ${e.message}`);
      failures++;
      return;
    }

    let ok;
    try {
      ok = topic.check(input, result);
    } catch (e) {
      console.error(`FAIL [${id}] (${label}) check() threw: ${e.message}`);
      failures++;
      return;
    }
    if (!ok) {
      console.error(`FAIL [${id}] (${label}) check() returned false. input=${JSON.stringify(input)} result=${JSON.stringify(result)}`);
      failures++;
      return;
    }
    // Any input with at least one element of "work" should produce frames.
    if (frameCount === 0 && inputHasWork(input)) {
      console.error(`FAIL [${id}] (${label}) produced no frames for non-trivial input`);
      failures++;
    }
  };

  const inputHasWork = (input) => {
    const arr = input && input.array;
    return Array.isArray(arr) && arr.length > 0;
  };

  // Random inputs across several sizes.
  for (const size of SIZES) {
    for (let r = 0; r < RUNS_PER_SIZE; r++) {
      seed++;
      const rng = mulberry32(seed * 2654435761 + size);
      const input = topic.makeInput(rng, size);
      checkOne(input, `random size=${size} run=${r}`);
    }
  }

  // Edge cases beyond the small sizes already covered above.
  for (const size of EDGE_SIZES) {
    seed++;
    const rng = mulberry32(seed);
    const input = topic.makeInput(rng, size);
    checkOne(input, `edge size=${size}`);
  }

  // Extra structured edge cases. The array-sorted sandbox type (binary
  // search) has a precondition that the array must already be sorted
  // ascending, so it gets its own set of structured cases instead of
  // reverse-sorted/arbitrary-duplicate arrays that would break that
  // precondition.
  if (topic.sandbox && topic.sandbox.type === 'array-sorted') {
    const base = topic.makeInput(mulberry32(999), 10);
    const sortedArray = Array.from({ length: 10 }, (_, i) => i * 2);

    checkOne({ array: sortedArray, target: sortedArray[0] }, 'sorted-target-first');
    checkOne({ array: sortedArray, target: sortedArray[sortedArray.length - 1] }, 'sorted-target-last');
    checkOne({ array: sortedArray, target: -999 }, 'sorted-target-absent');

    const dupSorted = [1, 1, 1, 3, 3, 5, 5, 5, 5, 9];
    checkOne({ array: dupSorted, target: 5 }, 'sorted-duplicates-present');
    checkOne({ array: dupSorted, target: 4 }, 'sorted-duplicates-absent');
    void base;
  } else {
    // Duplicates-heavy input.
    {
      const dupArray = Array(10).fill(7);
      const input = { ...topic.makeInput(mulberry32(999), 10), array: dupArray };
      checkOne(input, 'all-duplicates');
    }

    // Already sorted ascending.
    {
      const sortedArray = Array.from({ length: 10 }, (_, i) => i);
      const input = { ...topic.makeInput(mulberry32(1000), 10), array: sortedArray };
      checkOne(input, 'already-sorted');
    }

    // Reverse sorted.
    {
      const reverseArray = Array.from({ length: 10 }, (_, i) => 9 - i);
      const input = { ...topic.makeInput(mulberry32(1001), 10), array: reverseArray };
      checkOne(input, 'reverse-sorted');
    }
  }

  console.log(`ok   [${id}] ${caseCount} cases`);
}

async function main() {
  console.log(`Testing ${TESTED_IDS.length} built topic(s): ${TESTED_IDS.join(', ')}`);
  for (const id of TESTED_IDS) {
    await testTopic(id);
  }
  console.log(`\n${ran} total cases run, ${failures} failure(s).`);
  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed.');
    process.exit(0);
  }
}

// Only run the suite when this file is executed directly (e.g.
// `node test.mjs`), not when it is imported by coverage.mjs just to read
// TESTED_IDS.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
