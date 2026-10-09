// Headless runs: node test.js [days]. Zero tokens, no browser.
const assert = require('assert');
const { Sim, SURFACE, DAY } = require('./sim.js');

const days = +process.argv[2] || 150;

function run(mode, seed, days) {
  const s = new Sim(seed, mode), t0 = Date.now();
  for (let d = 1; d <= days; d++) {
    s.advance(d * DAY - s.t, Infinity);
    if (d % 25 === 0) {
      const cols = s.colonies.map(c => `${c.name} ${c.phase} w${c.workers.toFixed(0)} ch${s.chambersOf(c).length} leaves${c.stats.leaves} lost${c.stats.deaths.toFixed(0)}`).join(' | ');
      const food = s.plants.map(p => Math.round(100 * p.leaves / p.max) + '%').join(' ');
      console.log(`[${mode}] day ${String(d).padStart(3)}  ${cols}  plants ${food}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  }
  return s;
}

function common(s) {
  for (const c of s.colonies) {
    const evs = re => s.log.findIndex(e => e.col === c.id && re.test(e.msg));
    const order = [/starts digging/, /plugs the shaft/, /first workers/, /digging up through the plug/, /nest is open/].map(evs);
    assert(order.every((k, n) => k >= 0 && (n === 0 || k > order[n - 1])), `${c.name}: founding events missing or out of order: ${order}`);
    const qc = s.chambers[c.queenChamber];
    assert(qc && qc.cy - SURFACE > 150 && qc.cy - SURFACE < 300, `${c.name}: founding chamber should sit ~15-30 cm down`);
    assert(c.firstWorkerDay >= 40 && c.firstWorkerDay <= 60, `${c.name}: first workers on day ${c.firstWorkerDay}`);
    const entrances = s.log.filter(e => e.col === c.id && /new entrance/.test(e.msg)).length;
    assert(entrances <= 2 + c.workers / 300, `${c.name}: ${entrances} entrances for ${c.workers | 0} workers`);
    // Soil is conserved: everything dug is on the mound, packed into walls, or in a jaw right now.
    const carried = s.agents.filter(a => a.col === c.id).reduce((n, a) => n + a.load, 0);
    assert.strictEqual(c.stats.dug, c.stats.dumped + c.stats.packed + carried, `${c.name}: soil not conserved`);
    assert(c.stats.leaves > 0, `${c.name}: no leaves brought in`);
  }
  for (const p of s.plants) assert(p.leaves >= 0 && p.leaves <= p.max, 'plant leaves out of range');
  const s2 = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.strictEqual(Buffer.compare(Buffer.from(s.cell), Buffer.from(s2.cell)), 0, 'cells differ after reload');
  s2.advance(DAY, Infinity);
}

const t0 = Date.now();
const solo = run('solo', 42, days);
common(solo);
assert(solo.chambers.length >= 3, 'an open colony should keep digging new chambers');
assert(solo.plants.some(p => p.leaves < p.max * 0.95), 'foraging should visibly strip the plants');

const war = run('war', 7, days);
common(war);
const kills = war.colonies.reduce((n, c) => n + c.stats.kills, 0);
assert(war.warStarted && kills > 0, 'rival colonies sharing plants should fight');

console.log('\nwar diary:'); for (const e of war.log.slice(-12)) console.log(`  day ${(e.t / DAY).toFixed(2).padStart(6)}  ${e.msg}`);
console.log(`\nPASS: solo + war, ${days} days each, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
