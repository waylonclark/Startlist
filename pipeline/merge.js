// Merge discovered records into the existing store.
// Rules, in priority order:
//   1. Human edits are sticky. A field listed in `pinned` on an existing record is
//      never overwritten by an adapter, ever.
//   2. A verified record only accepts updates to date, deadline, cost, and url —
//      the things that genuinely change year to year.
//   3. Otherwise a field is replaced only when the incoming value has confidence
//      at least as high as what produced the current one.
//   4. Nothing is ever silently deleted. Events past their date move to `archive`.

import { validate, CONFIDENCE_THRESHOLD } from './schema.js';

const VOLATILE = ['date', 'endDate', 'deadline', 'cost', 'url'];

// A record you curated by hand outranks any feed, permanently. Matching a feed
// entry to it should refresh the things that change each year and touch nothing
// else — the alternative is a crawl that overwrites your work with a page dump.
function isCurated(rec) {
  return rec.verified === true || String(rec.source || '').startsWith('manual:');
}

export function mergeRecord(existing, incoming) {
  if (!existing) return { record: incoming, changes: ['new'] };

  const pinned = new Set(existing.pinned || []);
  const out = { ...existing };
  const changes = [];
  const curated = isCurated(existing);

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'id' || key === 'pinned' || value === undefined) continue;
    if (pinned.has(key)) continue;
    // Identity, never updated. "43rd El Tour de Tucson" is not a better name.
    if (key === 'name' || key === 'source') continue;
    if (curated && !VOLATILE.includes(key)) continue;
    if ((incoming.confidence ?? 0) < (existing.confidence ?? 0) && existing[key] !== undefined) continue;

    const before = JSON.stringify(existing[key]);
    const after = JSON.stringify(value);
    if (before !== after) {
      out[key] = value;
      changes.push(`${key}: ${before ?? '—'} → ${after}`);
    }
  }

  out.lastSeen = incoming.lastSeen || existing.lastSeen;
  // A curated record keeps its own confidence — a feed sighting is corroboration,
  // not a reassessment.
  if (curated) out.confidence = existing.confidence;
  // Seeing the same value from a second independent source raises confidence.
  if (incoming.source && incoming.source !== existing.source && !changes.length) {
    out.confidence = Math.min(1, (existing.confidence ?? 0.5) + 0.15);
    out.corroborated = [...new Set([...(existing.corroborated || []), incoming.source])];
  }
  return { record: out, changes };
}

// Match an incoming record to one already in the store even when the feed
// dresses the name up: "43rd El Tour de Tucson" and "2027 CKF UNBOUND Gravel"
// are the same events as "El Tour de Tucson" and "Unbound Gravel". Without this
// the crawl adds a second copy of every curated race it rediscovers.
export function canonicalName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // leading edition markers: "43rd", "2027", "2nd annual", "the"
    .replace(/^\s*(the\s+)?(\d{4}\s+)?(\d+(st|nd|rd|th)\s+)?(annual\s+)?/g, '')
    .replace(/\b\d+(st|nd|rd|th)\b|\bannual\b|\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalKey(rec) {
  const n = canonicalName(rec.name);
  return rec.state ? `${n}|${String(rec.state).toLowerCase()}` : n;
}

// Whole-word containment, same state, at least two words on the stored side so
// "gravel" alone can never swallow an unrelated event.
function findContained(byCanon, inc) {
  const incName = canonicalName(inc.name);
  const incState = String(inc.state || '').toLowerCase();
  if (!incName || !incState) return undefined;
  for (const [key, id] of byCanon) {
    const [name, state] = key.split('|');
    if (state !== incState) continue;
    if (name.split(' ').length < 2) continue;
    if (new RegExp(`(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(incName)) return id;
  }
  return undefined;
}

export function mergeAll(store, discovered, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const byId = new Map(store.events.map((e) => [e.id, e]));
  // Secondary index so a redressed name resolves to the existing record's id.
  const byCanon = new Map();
  for (const e of store.events) {
    const k = canonicalKey(e);
    if (k) byCanon.set(k, e.id);
  }
  const report = { added: [], updated: [], rejected: [], review: [], archived: [], aliased: [] };

  for (let inc of discovered) {
    const errors = validate(inc);
    if (errors.length) {
      report.rejected.push({ id: inc.id, name: inc.name, errors });
      continue;
    }

    // Exact canonical match first, then containment: a feed that prefixes a
    // sponsor ("2027 CKF UNBOUND Gravel") still has the real name inside it.
    if (!byId.has(inc.id)) {
      let hit = byCanon.get(canonicalKey(inc));
      if (!hit) hit = findContained(byCanon, inc);
      if (hit && hit !== inc.id) {
        report.aliased.push({ name: `${inc.name} → ${hit}` });
        inc = { ...inc, id: hit };
      }
    }
    const { record, changes } = mergeRecord(byId.get(inc.id), inc);
    if (!changes.length) continue;

    // Never demote a record that is already published. A thin feed sighting of
    // an event you curated must not pull it off the site.
    const wasLive = byId.has(record.id) && !byId.get(record.id).needsReview;
    if (record.confidence < CONFIDENCE_THRESHOLD && !wasLive) {
      record.needsReview = true;
      report.review.push({ id: record.id, name: record.name, changes });
    } else {
      delete record.needsReview;
    }
    byId.set(record.id, record);
    const k = canonicalKey(record);
    if (k) byCanon.set(k, record.id);
    (changes[0] === 'new' ? report.added : report.updated).push({ id: record.id, name: record.name, changes });
  }

  const live = [], archive = [...(store.archive || [])];
  for (const e of byId.values()) {
    const end = e.endDate || e.date;
    if (end < today) { archive.push(e); report.archived.push(e.id); }
    else live.push(e);
  }
  live.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    store: { ...store, generated: new Date().toISOString(), events: live, archive },
    report,
  };
}

export function formatReport(r) {
  const line = (label, list) => (list.length ? `${label} (${list.length})\n` + list.map((x) => `  · ${x.name || x}${x.changes ? '\n      ' + x.changes.join('\n      ') : ''}${x.errors ? '\n      ! ' + x.errors.join('\n      ! ') : ''}`).join('\n') : '');
  return [
    line('MATCHED TO EXISTING', r.aliased || []),
    line('ADDED', r.added),
    line('UPDATED', r.updated),
    line('NEEDS REVIEW', r.review),
    line('REJECTED', r.rejected),
    r.archived.length ? `ARCHIVED (${r.archived.length})` : '',
  ].filter(Boolean).join('\n\n') || 'No changes.';
}
