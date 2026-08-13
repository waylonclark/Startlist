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

import { slugify, validate, coerce, decodeEntities } from './schema.js';
import { mergeAll, formatReport } from './merge.js';
import { enrich, geocode } from './enrich.js';
import { applyGate, collapseSeries } from './gate.js';
import { emit } from './emit.js';
import { makeFetchers } from './sources/index.js';

import runsignup from './sources/runsignup.js';
import pages from './sources/pages.js';
import jsonld from './sources/jsonld.js';
import bikereg from './sources/bikereg.js';

const ADAPTERS = [runsignup, pages, jsonld, bikereg];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STORE = join(HERE, 'data/events.json');
const OUT = join(ROOT, 'events.js');
const REPORTS = join(HERE, 'reports');

// Nominatim's usage policy requires a User-Agent identifying the application
// with a way to reach whoever runs it — an email address or a URL both count.
// A placeholder or an unreachable address earns a blanket 403 on every request.
const CONTACT = process.env.STARTLIST_CONTACT;
const CONTACT_OK = CONTACT
  && /^([^@\s]+@[^@\s.]+\.[^@\s]+|https?:\/\/\S+)$/.test(CONTACT)
  && !/example\.com|users\.noreply\.github\.com|yourdomain|yourname/i.test(CONTACT);

if (!CONTACT_OK) {
  console.log(`! STARTLIST_CONTACT ${CONTACT ? `is a placeholder (${CONTACT})` : 'not set'} — Nominatim will 403 every geocode.`);
  console.log('  Add to .env — a real email or a URL, either works:');
  console.log('    STARTLIST_CONTACT=you@gmail.com');
  console.log('    STARTLIST_CONTACT=https://github.com/you/startlist');
  console.log('  GitHub noreply addresses do not work; they bounce.');
}
const UA = `StartListBot/1.0 (personal cycling event index; contact: ${CONTACT_OK ? CONTACT : 'unset'})`;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
// --inspect <substring>: dump the raw pre-enrichment record for matching
// candidates and stop. Answers "is this field missing from the feed, or are we
// dropping it?" without spending enrichment tokens.
const inspect = args.includes('--inspect') ? String(args[args.indexOf('--inspect') + 1] || '') : null;
const months = Number(args[args.indexOf('--months') + 1]) || 18;

const traceArg = args.indexOf('--trace');
const trace = traceArg > -1 ? String(args[traceArg + 1] || '').toLowerCase() : null;

const lines = [];
const log = (m) => { lines.push(m); console.log(m); };

const iso = (d) => d.toISOString().slice(0, 10);

// Stage tracer: shows exactly where a name stops being decoded.
function tr(stage, recs) {
  if (!trace) return;
  const list = (Array.isArray(recs) ? recs : [recs]).filter(
    (c) => c && String(c.name || '').toLowerCase().includes(trace));
  for (const c of list) {
    const amp = String(c.name).indexOf('&');
    const region = amp < 0 ? '(no &)' : JSON.stringify(String(c.name).slice(amp, amp + 6)) +
      ' codes ' + [...String(c.name).slice(amp, amp + 6)].map((ch) => ch.charCodeAt(0)).join(' ');
    log(`  [trace ${stage}] id=${c.id || '-'} ${region}`);
  }
  if (!list.length) log(`  [trace ${stage}] no match`);
}

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
      const found = await adapter.discover({ fetchText, fetchJson, apiKey, since, until: untilStr, log });
      log(`  ${found.length} candidate(s)`);
      candidates.push(...found);
    } catch (err) {
      log(`  ! adapter failed: ${err.message}`);
    }
  }

  // Decode entities at INGEST, not at coerce(): the gate summary and the merge
  // report both print candidate records, so decoding later left "&amp;" in every
  // log even though the written record was clean. Slugs are built from the
  // decoded name too, so ids never carry an entity fragment.
  for (const c of candidates) {
    for (const f of ['name', 'blurb', 'city', 'org', 'venue']) {
      if (typeof c[f] === 'string') c[f] = decodeEntities(c[f]);
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

  // Fold weekly-series rounds together before the gate, so one series costs one
  // enrichment call instead of nine and occupies one row instead of nine.
  const beforeCollapse = candidates.length;
  candidates = collapseSeries(candidates, { log });
  if (candidates.length !== beforeCollapse) log(`  ${beforeCollapse - candidates.length} series round(s) folded`);

  // 1b. gate — drop what is plainly not a bike race before it costs an API call
  tr('raw', candidates);
  const { kept } = applyGate(candidates, { log });
  tr('gated', kept);
  candidates = kept;

  if (inspect !== null) {
    const needle = inspect.toLowerCase();
    const hits = candidates.filter((c) => String(c.name || '').toLowerCase().includes(needle));
    log(`\n--- inspect "${inspect}": ${hits.length} match(es) of ${candidates.length} gated candidate(s) ---`);
    for (const h of hits) log(JSON.stringify(h, null, 2));
    if (!hits.length) {
      const near = candidates.map((c) => c.name).filter((n) => needle.split(/\s+/).some((w) => w && String(n).toLowerCase().includes(w)));
      log(near.length ? `Nothing matched. Similar names present:\n  ${near.join('\n  ')}` : 'Nothing matched, and no similar names — it was rejected by the gate or never discovered.');
    }
    return;
  }

  // 2a. geocode — stays serial. Nominatim's usage policy is one request per
  // second from a single client; running these in parallel earns a block, and
  // they are cheap anyway (only records whose adapter gave no coordinates).
  const geocoded = [];
  for (const c of candidates) {
    tr('pre-enrich', c);
    const rec = await geocode(coerce(c), { fetchJson, log });
    tr('coerced', rec);   // decode text before it reaches the model or the logs
    geocoded.push(rec);
  }

  // 2b. enrich — pooled. Each record costs several organiser page fetches plus
  // a model call, all latency and no CPU, so a serial loop spent ~90s per
  // record and over an hour on a full crawl. Four at a time is well inside
  // both the API rate limit and what organiser sites tolerate.
  const POOL = Math.max(1, Number(process.env.STARTLIST_CONCURRENCY || 6));
  const enriched = new Array(geocoded.length);

  // Workers finish out of order, so each one's log lines go to its own buffer
  // and are flushed strictly in record order. Without this the report reads as
  // four interleaved crawls. Flushing on a watermark rather than at the end
  // keeps the output live, which matters on a run this long.
  const buffers = geocoded.map(() => []);
  const done = new Array(geocoded.length).fill(false);
  let flushed = 0;
  const flush = () => {
    while (flushed < done.length && done[flushed]) {
      for (const line of buffers[flushed]) log(line);
      buffers[flushed] = [];
      flushed++;
    }
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < geocoded.length) {
      const i = cursor++;
      let rec = await enrich(geocoded[i], { fetchText, apiKey, log: (m) => buffers[i].push(m) });
      rec = coerce(rec);
      rec.lastSeen = since;
      rec.confidence = rec.confidence ?? 0.4;
      rec = coerce(rec);
      tr('post-enrich', rec);
      enriched[i] = rec;
      done[i] = true;
      flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, geocoded.length) }, worker));
  flush();

  // 3. merge
  tr('to-merge', enriched);
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
