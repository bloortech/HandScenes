// Races five growth functions against each other, as *actual counted
// elementary steps* from a tiny simulated loop (not the closed-form
// formula), as n grows from 1 up to the chosen n. No DOM access.

const CODE = [
  'for n = 1 to N:',
  '  constant:   steps = 1',
  '  logarithmic: steps = count of halvings of n until it reaches 1',
  '  linear:     steps = loop n times',
  '  linearithmic: steps = (loop n times) * (halvings of n)',
  '  quadratic:  steps = loop n times, inner loop n times',
];

const LABELS = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)'];

function countHalvings(n) {
  let steps = 0;
  let k = n;
  while (k > 1) {
    k = Math.floor(k / 2);
    steps++;
  }
  return steps;
}

function countsAt(n) {
  const constant = 1;
  const logn = countHalvings(n);
  const linear = n;
  const nlogn = n * logn;
  const quadratic = n * n;
  return [constant, logn, linear, nlogn, quadratic];
}

function* run(input) {
  const maxN = Math.max(1, input.n || 1);
  let lastCounts = countsAt(1);

  for (let n = 1; n <= maxN; n++) {
    lastCounts = countsAt(n);
    yield {
      line: 0,
      caption: `At n = ${n}: O(1) takes ${lastCounts[0]} step${lastCounts[0] === 1 ? '' : 's'}, O(log n) takes ${lastCounts[1]}, O(n) takes ${lastCounts[2]}, O(n log n) takes ${lastCounts[3]}, O(n^2) takes ${lastCounts[4]}.`,
      array: lastCounts.slice(),
      labels: LABELS,
      activeIdx: [4],
      counters: { n },
    };
  }

  return { n: maxN, counts: lastCounts };
}

export default {
  id: 'big-o-race',
  title: 'Big-O race',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Growth of Functions',
  summary:
    'Big-O describes how the number of steps an algorithm takes grows as the input size n grows, ignoring constant factors and lower-order terms. ' +
    'This race runs five tiny simulated loops side by side (O(1), O(log n), O(n), O(n log n), O(n^2)) and counts their actual steps as n increases, instead of just showing the formula. ' +
    'At small n the order barely matters, O(n^2) can even look fine. As n grows, the gaps explode: O(n^2) overtakes every other curve and keeps pulling away. ' +
    'O(log n) barely grows at all, which is why halving-based algorithms like binary search stay fast even on huge inputs. ' +
    'CLRS introduces this notation formally in its Growth of Functions chapter, as the standard way to describe an algorithm\'s running time independent of any specific machine or input.',
  code: CODE,
  complexity: {
    time: 'Watching the race itself is O(N) in the chosen max n (one frame per n). The curves being raced range from O(1) to O(n^2).',
    why: 'Five independent step-counters are recomputed once per value of n from 1 to the chosen maximum, so producing the race takes time proportional to the max n itself, regardless of how fast or slow the curves being compared grow.',
  },
  makeInput(rng, size) {
    return { n: Math.max(1, size) };
  },
  run,
  check(input, result) {
    const maxN = Math.max(1, input.n || 1);
    if (!result || result.n !== maxN) return false;
    const expected = countsAt(maxN);
    return Array.isArray(result.counts) && expected.every((v, i) => v === result.counts[i]);
  },
  sandbox: { type: 'n', min: 1, max: 40, default: 12, label: 'max n' },
};
