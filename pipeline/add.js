#!/usr/bin/env node
// Add one event by hand. Run: node pipeline/add.js <url> [more urls...]
//
// The counterpart to the feed: when you find a race the crawler will never see
// — self-hosted registration, no structured markup — point this at its page and
// it appends the URL to sources/pages.js so every future run tracks it.
//
// Use --check to read the page and print what would be extracted without
// editing anything.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pages, { PAGES } from './sources/pages.js';
import { makeFetchers } from './sources/index.js';
import { gate } from './gate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'sources/pages.js');

const UA = 'StartListBot/1.0 (personal cycling event index; contact: you@example.com)';

const args = process.argv.slice(2);
const check = args.includes('--check');
const urls = args.filter((a) => a.startsWith('http'));

if (!urls.length) {
  console.log('Usage: node pipeline/add.js <url> [--check]');
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log('! ANTHROPIC_API_KEY not set — cannot read the page.');
  process.exit(1);
}

const { fetchText, fetchJson } = makeFetchers({ userAgent: UA });
const today = new Date().toISOString().slice(0, 10);
const until = new Date(); until.setMonth(until.getMonth() + 24);

const fresh = urls.filter((u) => {
  if (PAGES.includes(u)) { console.log(`· already tracked: ${u}`); return false; }
  return true;
});
if (!fresh.length) process.exit(0);

// Reuse the adapter itself so what you see here is exactly what a run will get.
const saved = PAGES.slice();
PAGES.length = 0;
PAGES.push(...fresh);

const found = await pages.discover({
  fetchText, fetchJson, apiKey,
  since: today, until: until.toISOString().slice(0, 10),
  log: (m) => console.log(m),
});

PAGES.length = 0;
PAGES.push(...saved);

if (!found.length) {
  console.log('\nNothing identified. The page may not name a date, or may render client-side.');
  process.exit(1);
}

for (const rec of found) {
  const reason = gate(rec);
  console.log(`\n${rec.name}`);
  console.log(`  ${rec.date}${rec.endDate ? ` → ${rec.endDate}` : ''} · ${rec.city || '?'}, ${rec.state || '?'}`);
  console.log(`  ${rec.type} · confidence ${rec.confidence}`);
  if (rec.blurb) console.log(`  ${rec.blurb}`);
  if (reason) console.log(`  ⚠ the gate would reject this: ${reason}`);
}

if (check) {
  console.log('\n--check — sources/pages.js not modified.');
  process.exit(0);
}

const keep = found.filter((r) => !gate(r)).map((r) => r.url);
if (!keep.length) {
  console.log('\nAll candidates rejected by the gate. Not added.');
  process.exit(1);
}

let src = await readFile(FILE, 'utf8');
const additions = keep.map((u) => `  '${u}',`).join('\n');
src = src.replace(/(export const PAGES = \[\n)/, `$1${additions}\n`);
await writeFile(FILE, src);

console.log(`\nAdded ${keep.length} URL(s) to sources/pages.js. Commit the change to track them.`);
