// Headless run: node test.js [days]. Zero tokens, no browser.
const assert = require('assert');
const { Sim, SURFACE, DAY } = require('./sim.js');

const days = +process.argv[2] || 150;
const s = new Sim(42);
const t0 = Date.now();
const seen = new Set();
for (let d = 1; d <= days; d++) {
  s.advance(d * DAY - s.t, Infinity);
  seen.add(s.col.phase);
  if (d % 10 === 0 || d === 1) {
    const deepest = Math.max(0, ...s.chambers.map(c => c.cy - SURFACE)) / 10;
    console.log(`day ${String(d).padStart(3)}  ${s.col.phase.padEnd(9)} workers ${s.col.workers.toFixed(0).padStart(5)}  dots ${String(s.agents.length).padStart(4)}` +
      `  chambers ${s.chambers.length}  deepest ${deepest.toFixed(0)}cm  dug ${(s.stats.dug / 100).toFixed(0)}cm²  garden ${s.stats.garden}  leaves ${s.stats.leaves}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}

// The founding story happened in order.
const order = [/starts digging/, /plugs the shaft/, /first workers/, /digging up through the plug/, /nest is open/]
  .map(re => s.log.findIndex(e => re.test(e.msg)));
assert(order.every((k, n) => k >= 0 && (n === 0 || k > order[n - 1])), `founding events missing or out of order: ${order}`);
assert(seen.has('open'), 'colony never opened');
const qc = s.chambers[s.col.queenChamber];
assert(qc && qc.cy - SURFACE > 150 && qc.cy - SURFACE < 300, 'founding chamber should sit ~15-30 cm down');
const firstEvent = re => s.log.find(e => re.test(e.msg));
const shaftDone = firstEvent(/Shaft finished/);
assert(shaftDone && shaftDone.t < 2 * DAY, 'queen should finish her shaft within the first day or so');
assert(s.col.firstWorkerDay >= 40 && s.col.firstWorkerDay <= 60, `first workers on day ${s.col.firstWorkerDay}`);
const entrances = s.log.filter(e => /new entrance/.test(e.msg)).length;
assert(entrances <= 2 + s.col.workers / 300, `${entrances} entrances dug for ${s.col.workers | 0} workers: entrances are getting buried`);
if (days >= 150) {
  assert(s.chambers.length >= 3, 'an open colony should keep digging new chambers');
  assert(s.stats.leaves > 0, 'foragers should bring leaves in');
}

// Soil is conserved: everything dug is on the mound, packed into walls, or in a jaw right now.
const carried = s.agents.reduce((n, a) => n + a.load, 0);
assert.strictEqual(s.stats.dug, s.stats.dumped + s.stats.packed + carried, 'soil not conserved');

// Save/load round trip keeps the world identical.
const s2 = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
assert.strictEqual(Buffer.compare(Buffer.from(s.cell), Buffer.from(s2.cell)), 0, 'cells differ after reload');
s2.advance(DAY, Infinity);

console.log('\nevents:'); for (const e of s.log) console.log(`  day ${(e.t / DAY).toFixed(2).padStart(6)}  ${e.msg}`);
console.log(`\nPASS: ${days} days in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
