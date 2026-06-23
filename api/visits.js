// All-time visitor counter, backed by Upstash Redis (Vercel KV / Marketplace).
// Edge function, zero dependencies: it just calls the Upstash REST API.
// The browser only ever talks to this same-origin route; the Redis call is
// server to server, so nothing about a visitor leaves our domain.
//
// Needs env vars from a connected KV store (either naming works):
//   KV_REST_API_URL      / KV_REST_API_TOKEN          (Vercel KV)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash direct)
// With no store connected it returns { count: null } and the UI stays hidden,
// so this can ship before the store exists.

export const config = { runtime: 'edge' };

const KEY = 'handscenes_visits_total';

export default async function handler(req) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) {
    return new Response(JSON.stringify({ count: null }), { status: 200, headers });
  }
  try {
    const inc = new URL(req.url).searchParams.get('inc') === '1';
    const cmd = inc ? `incr/${KEY}` : `get/${KEY}`;
    const res = await fetch(`${base}/${cmd}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();              // Upstash -> { result: <value|null> }
    const n = data && data.result != null ? Number(data.result) : 0;
    return new Response(JSON.stringify({ count: Number.isFinite(n) ? n : 0 }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ count: null }), { status: 200, headers });
  }
}
