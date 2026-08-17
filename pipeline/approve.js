#!/usr/bin/env node
// Approve held-back events so they reach the site.
//
//   node pipeline/approve.js                 list everything awaiting review
//   node pipeline/approve.js <id> [id...]    approve those records
//   node pipeline/approve.js --all           approve every held-back record
//   node pipeline/approve.js --revoke <id>   send one back to review
//
// Why this exists: a record below the confidence threshold never climbs above it
// on its own. Without an explicit human yes, anything the scorer doubts is
// held back forever. Approval sets `approved: true`, which emit.js treats the
// same as a hand-entered record, and merge.js's "never demote a published
// record" guard keeps it live on later runs.
//
// This only writes pipeline/data/events.json. Run the pipeline (or `--emit`) to
// regenerate events.js afterwards.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emit } from './emit.js';
import { CONFIDENCE_THRESHOLD } from './schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = join(HERE, 'data/events.json');
const SITE = join(HERE, '../events.js');

const args = process.argv.slice(2);
const all = args.includes('--all');
const revoke = args.includes('--revoke');
const alsoEmit = args.includes('--emit') || all || revoke || args.some((a) => !a.startsWith('--'));
const ids = args.filter((a) => !a.startsWith('--'));

const store = JSON.parse(await readFile(STORE, 'utf8'));

// A record is held back if it is flagged, or if it would fail emit's own filter.
const heldBack = (e) =>
  e.needsReview === true ||
  !(e.approved === true ||
    String(e.source || '').startsWith('manual:') ||
    (e.confidence ?? 1) >= CONFIDENCE_THRESHOLD);

const held = store.events.filter(heldBack);

if (revoke) {
  if (!ids.length) {
    console.log('! --revoke needs at least one id.');
    process.exit(1);
  }
  let n = 0;
  for (const e of store.events) {
    if (!ids.includes(e.id)) continue;
    delete e.approved;
    e.needsReview = true;
    n++;
    console.log(`  \u2212 ${e.name}`);
  }
  if (!n) {
    console.log('No matching ids. Nothing written.');
    process.exit(1);
  }
  await save(`Sent ${n} record(s) back to review`);
} else if (all || ids.length) {
  const targets = all ? held : store.events.filter((e) => ids.includes(e.id));

  if (!targets.length) {
    console.log(all ? 'Nothing is awaiting review.' : 'No matching ids. Nothing written.');
    process.exit(all ? 0 : 1);
  }

  const missing = ids.filter((id) => !store.events.some((e) => e.id === id));
  if (missing.length) console.log(`! unknown id(s): ${missing.join(', ')}\n`);

  for (const e of targets) {
    e.approved = true;
    delete e.needsReview;
    console.log(`  + ${e.name}  ${pct(e.confidence)}`);
  }
  await save(`Approved ${targets.length} record(s)`);
} else {
  // Bare invocation: report only. Approving 57 records unseen is not a default.
  if (!held.length) {
    console.log('Nothing is awaiting review \u2014 every record is published.');
  } else {
    console.log(`${held.length} event(s) awaiting review \u2014 threshold is ${pct(CONFIDENCE_THRESHOLD)}\n`);
    for (const e of held.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      console.log(`  ${pct(e.confidence).padStart(4)}  ${e.id}`);
      console.log(`        ${e.name} \u2014 ${e.city || '?'}, ${e.state || '?'} \u00b7 ${e.date || 'no date'}`);
      if (e.url) console.log(`        ${e.url}`);
    }
    console.log(`\n${store.events.length} in store \u00b7 ${store.events.length - held.length} published`);
    console.log('\nApprove with:  node pipeline/approve.js <id> [id...]');
    console.log('Or all of them: node pipeline/approve.js --all');
  }
}

function pct(c) {
  return c === undefined || c === null ? '\u2014' : `${Math.round(c * 100)}%`;
}

async function save(msg) {
  await writeFile(STORE, `${JSON.stringify(store, null, 2)}\n`);
  let note = '';
  if (alsoEmit) {
    store.generated = new Date().toISOString();
    const js = emit(store);
    await writeFile(SITE, js);
    const count = js.match(/\. (\d+) events\./);
    note = ` \u00b7 events.js now carries ${count ? count[1] : '?'} event(s)`;
  }
  console.log(`\n${msg}${note}`);
  console.log('Commit events.js and pipeline/data/events.json to publish.');
}
