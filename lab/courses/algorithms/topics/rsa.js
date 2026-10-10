// RSA with small numbers: pick two primes p, q, let n = p*q and
// phi = (p-1)(q-1), pick an encryption exponent e coprime to phi, find the
// decryption exponent d = e^-1 mod phi via extended Euclid, then encrypt a
// message m as c = m^e mod n and decrypt it back as c^d mod n. No DOM
// access. CLRS: Number-Theoretic Algorithms (RSA).
import { gcd, extendedEuclid, modPow, isPrimeTrial } from '../engine/numtheory.js';

const CODE = [
  'Pick two primes p, q. n = p*q. phi = (p-1)*(q-1).',
  'Pick e with 1 < e < phi and gcd(e, phi) = 1   // public key: (n, e)',
  'd = e^-1 mod phi, via extended Euclid           // private key: (n, d)',
  'encrypt(m) = m^e mod n',
  'decrypt(c) = c^d mod n',
];

function keyFrame(p, q, n, phi, e, d, caption, line) {
  const rows = [
    p != null && { label: `p = ${p}` },
    q != null && { label: `q = ${q}` },
    n != null && { label: `n = p*q = ${n}` },
    phi != null && { label: `phi(n) = ${phi}` },
    e != null && { label: `e = ${e}  (public)` },
    d != null && { label: `d = ${d}  (private)` },
  ].filter(Boolean);
  const nodes = rows.map((r, i) => ({ id: i, label: r.label, x: 50, y: 10 + i * (80 / Math.max(1, rows.length)), w: 70, h: 60 / Math.max(1, rows.length), active: i === rows.length - 1 }));
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [], emptyText: '(no keys yet)' };
}

function messageFrame(label, value, modN, caption, line) {
  const nodes = [{ id: 0, label: `${label} = ${value} mod ${modN}`, x: 50, y: 40, w: 70, h: 30, active: true }];
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [] };
}

function* run(input) {
  const { p, q, e, message } = input;
  const n = p * q;
  const phi = (p - 1) * (q - 1);

  yield keyFrame(null, null, null, null, null, null, `Pick two primes p = ${p}, q = ${q}.`, 0);
  yield keyFrame(p, q, n, null, null, null, `n = p*q = ${n}.`, 0);
  yield keyFrame(p, q, n, phi, null, null, `phi(n) = (p-1)(q-1) = ${phi}: the count of numbers in [1, n] coprime to n.`, 0);
  yield keyFrame(p, q, n, phi, e, null, `Chose e = ${e}, with gcd(e, phi) = ${gcd(e, phi)} = 1, so e has an inverse mod phi.`, 1);

  const { x } = extendedEuclid(e, phi);
  const d = ((x % phi) + phi) % phi;
  yield keyFrame(p, q, n, phi, e, d, `Extended Euclid gives d = e^-1 mod phi = ${d}. Public key (n, e) = (${n}, ${e}); private key (n, d) = (${n}, ${d}).`, 2);

  const m = ((message % n) + n) % n;
  const c = modPow(m, e, n).result;
  yield messageFrame('m', m, n, `Encrypt message m = ${m}: c = m^e mod n = ${m}^${e} mod ${n} = ${c}.`, 3);

  const decrypted = modPow(c, d, n).result;
  yield messageFrame('c', c, n, `Decrypt c = ${c}: m' = c^d mod n = ${c}^${d} mod ${n} = ${decrypted}. ${decrypted === m ? 'Matches the original message.' : 'Does not match (should never happen with a valid key).'}`, 4);

  return { n, phi, e, d, m, c, decrypted };
}

export default {
  id: 'rsa',
  title: 'RSA: key generation, encryption, decryption',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Number-Theoretic Algorithms',
  summary:
    'RSA\'s public key is a pair (n, e): n = p*q for two secret primes p and q, and e is any exponent coprime to phi(n) = (p-1)(q-1), the count of numbers mod n with an inverse. ' +
    'The private key is d, the modular inverse of e mod phi(n), found with extended Euclid since gcd(e, phi) = 1 guarantees one exists. ' +
    'Encrypting a message m (treated as a number mod n) is just c = m^e mod n; decrypting is m = c^d mod n, and Euler\'s theorem (via Fermat-Euler, since gcd(m,n)=1 for almost every message) guarantees that m^(ed) mod n = m, because ed = 1 mod phi(n) by construction. ' +
    "Security relies on factoring n back into p and q being hard: anyone who could factor n could recompute phi(n) and then d, exactly as key generation did, but with p and q genuinely large (hundreds of digits) no known efficient factoring algorithm can do that. " +
    'This sandbox uses deliberately tiny primes so the arithmetic is readable: real RSA keys use primes with hundreds of digits, where this exact same modular exponentiation is the only operation either side ever runs.',
  code: CODE,
  complexity: {
    time: 'O(log phi) extended-Euclid steps for key generation; O(log e) and O(log d) modular multiplications for encrypt/decrypt.',
    why: 'Key generation runs extended Euclid once, O(log(min(e, phi))) divisions (same bound as the euclid topic). Encryption and decryption are each one modular-exponentiation call, O(log exponent) modular multiplications, the same subroutine and bound as the modular-exponentiation topic.',
  },
  makeInput(rng, size) {
    const smallPrimes = [5, 7, 11, 13, 17, 19, 23];
    const p = smallPrimes[Math.floor(rng() * smallPrimes.length)];
    let q = smallPrimes[Math.floor(rng() * smallPrimes.length)];
    if (q === p) q = smallPrimes[(smallPrimes.indexOf(q) + 1) % smallPrimes.length];
    const n = p * q;
    const phi = (p - 1) * (q - 1);
    let e;
    do { e = 2 + Math.floor(rng() * (phi - 2)); } while (gcd(e, phi) !== 1);
    const message = Math.floor(rng() * Math.max(2, Math.min(n, 2 + size)));
    return { p, q, e, message };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { p, q } = input;
    if (!isPrimeTrial(p) || !isPrimeTrial(q)) return false;
    if (result.n !== p * q) return false;
    if (result.phi !== (p - 1) * (q - 1)) return false;
    if (gcd(result.e, result.phi) !== 1) return false;
    if (((result.e * result.d) % result.phi + result.phi) % result.phi !== 1) return false;
    return result.decrypted === result.m;
  },
  sandbox: { type: 'n', min: 0, max: 20, default: 6, label: 'size' },
};
