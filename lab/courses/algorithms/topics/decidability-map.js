// A map of the four buckets a decision problem can fall into:
//   decidable           an algorithm always halts with the right yes/no
//   recognisable        an algorithm halts and says "yes" on every yes
//                        instance, but may run forever on a "no" (so you
//                        can never conclude "no" just by waiting)
//   co-recognisable     the mirror image: halts and says "no" on every no
//                        instance, may run forever on a "yes"
//   neither              not even half-decidable in either direction
// decidable = recognisable AND co-recognisable (run both semi-deciders in
// parallel, one of them is guaranteed to halt and tell you which).
// This sandbox runs real instances for the three bucket that something can
// actually be run for, using the same bounded-machine simulator as the rest
// of this module, and labels "neither" with its standard citation (EQ_TM):
// nothing to brute-force there, since by definition no algorithm, however
// generous its step budget, can even semi-decide it. No DOM access.
import { parseRules, simulate, ACCEPT, REJECT } from '../engine/turing.js';
import { DEFAULT_RULES } from './turing-machine.js';

const CODE = [
  'decidable: algorithm always halts, correctly, both ways',
  'recognisable: halts and says yes on every yes-instance (may hang on no)',
  'co-recognisable: halts and says no on every no-instance (may hang on yes)',
  'decidable = recognisable AND co-recognisable (run both racers, one wins)',
];

const EXAMPLES = {
  decidable: 'bounded halting: does M halt within N steps?',
  recognisable: 'A_TM: does M accept w? (semi-decide: simulate and wait)',
  coRecognisable: 'complement of A_TM: does M reject or loop on w?',
  neither: 'EQ_TM: do M1 and M2 accept the same language?',
};

const SHORT_LABEL = { decidable: 'bounded halting', recognisable: 'A_TM', coRecognisable: 'co-A_TM', neither: 'EQ_TM' };

function boxFrame(regions, caption, line, activeKey) {
  const positions = { decidable: [50, 22], recognisable: [18, 55], coRecognisable: [82, 55], neither: [50, 88] };
  const nodes = Object.entries(positions).map(([key, [x, y]]) => ({
    id: key, label: SHORT_LABEL[key], x, y, w: 26, h: 16, active: key === activeKey,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [] };
}

function* run(input) {
  const { bound, w } = input;
  const { rules } = parseRules(DEFAULT_RULES);
  const tape = w.length ? w.split('') : ['_'];

  yield boxFrame({}, 'Four buckets for any decision problem: decidable, recognisable, co-recognisable, and (rarely) neither. Watch three of them get a real concrete instance.', 0, null);

  // Decidable example: bounded halting is genuinely decidable, because the
  // bound itself guarantees an answer either way.
  const bounded = simulate(rules, { start: 'qcheck0', accept: ACCEPT, reject: REJECT, tape, maxSteps: bound });
  const haltsWithinBound = bounded.halted || bounded.looped; // looped => provably never halts, which is also a decided "no"
  yield boxFrame({}, `Decidable: "does M halt within ${bound} steps on w = '${w}'?" Just run it for ${bound} steps. Answer: ${haltsWithinBound ? 'yes, it halted (or we proved a loop) within the bound' : 'no evidence either way yet, but the bound itself always terminates the check'}. This always halts because WE chose the stopping point.`, 1, 'decidable');

  // Recognisable example: A_TM. If w is actually accepted, simulating finds
  // that out (eventually); here we run with generous steps as the "wait".
  const semiDecide = simulate(rules, { start: 'qcheck0', accept: ACCEPT, reject: REJECT, tape, maxSteps: 2000 });
  yield boxFrame({}, `Recognisable: "does M accept w?" Semi-decide by simulating: if w is accepted, this run finds it (${semiDecide.accept ? 'it did: ACCEPT' : 'this particular w was not accepted, so the semi-decider either rejects or, on a harder machine, could hang forever instead'}). A semi-decider is only required to halt on the yes-instances.`, 2, 'recognisable');

  // Co-recognisable example: complement of A_TM (does M NOT accept w).
  const notAccepted = !semiDecide.accept && (semiDecide.halted || semiDecide.looped);
  yield boxFrame({}, `Co-recognisable: "does M reject or provably loop on w?" (the complement question). Here: ${notAccepted ? 'yes, confirmed (M did not accept w)' : 'M accepted w, so this is the co-recognisable side that is NOT guaranteed to halt'}.`, 3, 'coRecognisable');

  yield boxFrame({}, `Neither: ${EXAMPLES.neither}. No algorithm can even semi-decide this in either direction: you cannot always confirm "yes, same language" by running examples (two machines can agree on every string you ever try and still be unequal in general), and you cannot always confirm "no, different" either. This bucket is stated here, not executed: that is the whole point of "neither".`, 3, 'neither');

  return { haltsWithinBound, semiDecideAccept: semiDecide.accept, notAccepted, bound };
}

export default {
  id: 'decidability-map',
  title: 'Map of decidable and undecidable problems',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: Decidability and Turing Recognizability)',
  summary:
    'Every decision problem lands in one of four buckets. Decidable means some algorithm always halts and gives the right yes or no answer, for every instance. Turing-recognisable (also called semi-decidable, or r.e.) means an algorithm halts and says "yes" on every yes-instance, but is allowed to run forever on a no-instance, so waiting for it never proves "no". ' +
    'Co-recognisable is the mirror image, guaranteed to halt and say "no" on every no-instance, with no promise on yes. A language is decidable exactly when it is BOTH recognisable and co-recognisable: run a recogniser for it and a recogniser for its complement side by side, and whichever one halts first gives you the real answer. ' +
    'A rare few problems (the classic example is "do these two Turing machines recognise the same language") are neither: no algorithm can even semi-decide them in either direction, which is strictly worse than merely being undecidable. ' +
    'This sandbox runs real instances for bounded halting (decidable by construction, since the step bound forces termination), A_TM (recognisable: simulate and wait, which finds every accepted string eventually), and its complement (co-recognisable), then states the "neither" bucket\'s standard example without pretending to execute something no algorithm can run. ' +
    'The halting problem from two topics ago is exactly the recognisable-but-not-co-recognisable example: you can confirm "yes, it halts" by waiting, but you can never conclude "no, it never halts" just because it has not halted yet.',
  code: CODE,
  complexity: {
    time: 'Decidable bucket: O(bound). Recognisable/co-recognisable: unbounded in general, bounded here only because this sandbox caps the simulation.',
    why: 'A semi-decider\'s whole definition is "no promised running time on the instances it is allowed to never finish", which this sandbox makes visible by capping the step budget rather than actually waiting forever.',
  },
  makeInput(rng, size) {
    const bound = 5 + Math.floor(rng() * 20);
    const len = Math.max(0, Math.min(10, size));
    let w = '';
    for (let i = 0; i < len; i++) w += rng() < 0.5 ? '0' : '1';
    return { bound, w };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { w, bound } = input;
    const m = w.match(/^(0*)(1*)$/);
    const expectedAccept = !!m && m[1].length === m[2].length;
    if (result.bound !== bound) return false;
    if (result.semiDecideAccept !== expectedAccept) return false;
    if (result.notAccepted !== !expectedAccept) return false;
    return true;
  },
  sandbox: { type: 'string', field: 'w', fieldLabel: 'w', alphabet: ['0', '1'], min: 0, max: 10, default: 4, label: 'length' },
};
