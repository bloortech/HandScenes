#!/usr/bin/env node
// Plain node script, no dependencies. Run from anywhere:
//   node lab/courses/algorithms/coverage.mjs m01
// Exits non-zero unless every topic belonging to the given module id has
// status "built", has a real file at topics/<id>.js, and is exercised by
// test.mjs (via its exported TESTED_IDS list).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const moduleId = process.argv[2];

if (!moduleId) {
  console.error('Usage: node coverage.mjs <module-id>  (e.g. m01)');
  process.exit(1);
}

const syllabus = JSON.parse(readFileSync(path.join(HERE, 'syllabus.json'), 'utf8'));
const mod = syllabus.modules.find((m) => m.id === moduleId);

if (!mod) {
  console.error(`No module with id "${moduleId}" in syllabus.json`);
  process.exit(1);
}

// test.mjs guards its own main() to only run when executed directly, so
// importing it here just gives us TESTED_IDS without running the suite.
const { TESTED_IDS } = await import('./test.mjs');

let failures = [];

for (const topic of mod.topics) {
  if (topic.status !== 'built') {
    failures.push(`${topic.id}: status is "${topic.status}", expected "built"`);
    continue;
  }
  const filePath = path.join(HERE, 'topics', `${topic.id}.js`);
  if (!existsSync(filePath)) {
    failures.push(`${topic.id}: missing file topics/${topic.id}.js`);
    continue;
  }
  if (!TESTED_IDS.includes(topic.id)) {
    failures.push(`${topic.id}: not exercised by test.mjs (TESTED_IDS)`);
  }
}

if (failures.length > 0) {
  console.error(`Module ${moduleId} ("${mod.title}") is NOT fully covered:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`Module ${moduleId} ("${mod.title}") is fully covered: ${mod.topics.length} topic(s) built, filed, and tested.`);
process.exit(0);
