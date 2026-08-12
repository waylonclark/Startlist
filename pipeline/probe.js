#!/usr/bin/env node
// Watchlist diagnostic. Run: node pipeline/probe.js [url ...]
//
// For each URL, reports what the crawler actually sees: HTTP status, whether
// any JSON-LD blocks exist, how many are Events, and the dates on them. Use it
// to decide whether a site is worth keeping in the WATCHLIST before spending a
// crawl on it.
//
// Zero Events on a page that looks full of races almost always means the markup
// is injected client-side — this fetches raw HTML, same as the crawler, so it
// cannot see anything React renders after load.

import { WATCHLIST } from './sources/jsonld.js';

const UA = 'StartListBot/1.0 (personal cycling event index; contact: you@example.com)';

const urls = process.argv.slice(2).length ? process.argv.slice(2) : WATCHLIST;
const today = new Date().toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function blocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return out;
}

function events(raw) {
  const out = [];
  for (const b of raw) {
    let parsed;
    try { parsed = JSON.parse(b); } catch { out.push({ broken: true }); continue; }
    const items = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
    for (const it of items) {
      const t = it['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.some((x) => typeof x === 'string' && /Event$/i.test(x))) out.push(it);
    }
  }
  return out;
}

const pad = (s, n) => String(s).padEnd(n);

for (const url of urls) {
  let html, status = 'ok';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
    });
    status = res.status;
    html = await res.text();
    if (!res.ok) { console.log(`✗ ${pad(status, 4)} ${url}`); continue; }
  } catch (err) {
    console.log(`✗ FAIL ${url} — ${err.message}`);
    continue;
  }

  const raw = blocks(html);
  const evs = events(raw);
  const broken = evs.filter((e) => e.broken).length;
  const good = evs.filter((e) => !e.broken);
  const future = good.filter((e) => (e.startDate || '').slice(0, 10) >= today);

  const mark = future.length ? '✓' : good.length ? '~' : '·';
  console.log(`${mark} ${pad(status, 4)} ${url}`);
  console.log(`     ${raw.length} ld+json block(s) · ${good.length} Event(s) · ${future.length} upcoming` +
    (broken ? ` · ${broken} malformed` : ''));

  for (const e of future.slice(0, 8)) {
    const loc = e.location?.address || {};
    console.log(`     · ${pad((e.startDate || '').slice(0, 10), 11)} ${e.name || '(unnamed)'}` +
      (loc.addressRegion ? ` — ${loc.addressLocality || ''} ${loc.addressRegion}` : ''));
  }
  if (future.length > 8) console.log(`     … and ${future.length - 8} more`);

  if (!raw.length) {
    const hint = /__NEXT_DATA__|data-reactroot|ng-version|wix|squarespace/i.exec(html);
    console.log(`     no structured markup${hint ? ` — looks like ${hint[0]}, likely client-rendered` : ''}`);
  }

  await sleep(1500);
}

console.log('\n✓ usable  ~ has Events but none upcoming  · no Event markup  ✗ unreachable');
