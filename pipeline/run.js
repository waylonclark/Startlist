#!/usr/bin/env node
// Orchestrator. Run: node pipeline/run.js [--dry] [--months 18]
//
//   1. every adapter discovers candidates in the window
//   2. geocode + LLM-enrich anything thin
//   3. merge into the store under the sticky-field rules
//   4. emit events.js and write a run report
//
// Exit code is 0 even when adapters fail — a broken scraper must not stop the
// site from rebuilding with the data it already has.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugify, validate } from './schema.js';
import { mergeAll, formatReport } from './merge.js';
import { enrich, geocode } from './enrich.js';
import { emit } from './emit.js';
import { makeFetchers } from './sources/index.js';

import jsonld from './sources/jsonld.js';
import bikereg from './sources/bikereg.js';

const ADAPTERS = [jsonld, bikereg];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STORE = join(HERE, 'data/events.json');
const OUT = join(ROOT, 'events.js');
const REPORTS = join(HERE, 'reports');

const UA = 'StartListBot/1.0 (personal cycling event index; contact: you@example.com)';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const months = Number(args[args.indexOf('--months') + 1]) || 18;

const lines = [];
const log = (m) => { lines.push(m); console.log(m); };

const iso = (d) => d.toISOString().slice(0, 10);

async function main() {
  const today = new Date();
  const until = new Date(today); until.setMonth(until.getMonth() + months);
  const since = iso(today), untilStr = iso(until);

  log(`Start List crawl — ${since} → ${untilStr}${dry ? ' (dry run)' : ''}`);

  const store = JSON.parse(await readFile(STORE, 'utf8'));
  const { fetchText, fetchJson } = makeFetchers({ userAgent: UA });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) log('! ANTHROPIC_API_KEY not set — enrichment disabled, records will land in review');

  // 1. discover
  let candidates = [];
  for (const adapter of ADAPTERS) {
    log(`\n· ${adapter.id}`);
    try {
      const found = await adapter.discover({ fetchText, fetchJson, since, until: untilStr, log });
      log(`  ${found.length} candidate(s)`);
      candidates.push(...found);
    } catch (err) {
      log(`  ! adapter failed: ${err.message}`);
    }
  }

  // de-dupe: same name within 3 days is the same event seen twice
  const seen = new Map();
  for (const c of candidates) {
    if (!c.name || !c.date) continue;
    c.id = c.id || slugify(c.name, c.state);
    const key = `${c.id}`;
    const prev = seen.get(key);
    if (!prev || (c.confidence ?? 0) > (prev.confidence ?? 0)) seen.set(key, { ...prev, ...c });
  }
  candidates = [...seen.values()];
  log(`\n${candidates.length} unique candidate(s) after de-dupe`);

  // 2. enrich
  const enriched = [];
  for (const c of candidates) {
    let rec = await geocode(c, { fetchJson, log });
    rec = await enrich(rec, { fetchText, apiKey, log });
    rec.lastSeen = since;
    rec.confidence = rec.confidence ?? 0.4;
    enriched.push(rec);
  }

  // 3. merge
  const { store: next, report } = mergeAll(store, enriched, { today: since });
  log('\n' + formatReport(report));

  if (dry) { log('\nDry run — nothing written.'); return; }

  // 4. write
  await writeFile(STORE, JSON.stringify(next, null, 2));
  await writeFile(OUT, emit(next));
  await mkdir(REPORTS, { recursive: true });
  await writeFile(join(REPORTS, `${since}.txt`), lines.join('\n'));

  const invalid = next.events.filter((e) => validate(e).length);
  log(`\nWrote ${next.events.length} event(s) to events.js` +
      (report.review.length ? ` · ${report.review.length} awaiting review` : '') +
      (invalid.length ? ` · ${invalid.length} incomplete` : ''));
}

main().catch((err) => { console.error(err); process.exit(1); });
