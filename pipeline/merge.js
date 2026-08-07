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

export function mergeRecord(existing, incoming) {
  if (!existing) return { record: incoming, changes: ['new'] };

  const pinned = new Set(existing.pinned || []);
  const out = { ...existing };
  const changes = [];

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'id' || key === 'pinned' || value === undefined) continue;
    if (pinned.has(key)) continue;
    if (existing.verified && !VOLATILE.includes(key)) continue;
    if ((incoming.confidence ?? 0) < (existing.confidence ?? 0) && existing[key] !== undefined) continue;

    const before = JSON.stringify(existing[key]);
    const after = JSON.stringify(value);
    if (before !== after) {
      out[key] = value;
      changes.push(`${key}: ${before ?? '—'} → ${after}`);
    }
  }

  out.lastSeen = incoming.lastSeen || existing.lastSeen;
  // Seeing the same value from a second independent source raises confidence.
  if (incoming.source && incoming.source !== existing.source && !changes.length) {
    out.confidence = Math.min(1, (existing.confidence ?? 0.5) + 0.15);
    out.corroborated = [...new Set([...(existing.corroborated || []), incoming.source])];
  }
  return { record: out, changes };
}

export function mergeAll(store, discovered, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const byId = new Map(store.events.map((e) => [e.id, e]));
  const report = { added: [], updated: [], rejected: [], review: [], archived: [] };

  for (const inc of discovered) {
    const errors = validate(inc);
    if (errors.length) {
      report.rejected.push({ id: inc.id, name: inc.name, errors });
      continue;
    }
    const { record, changes } = mergeRecord(byId.get(inc.id), inc);
    if (!changes.length) continue;

    if (record.confidence < CONFIDENCE_THRESHOLD) {
      record.needsReview = true;
      report.review.push({ id: record.id, name: record.name, changes });
    } else {
      delete record.needsReview;
    }
    byId.set(record.id, record);
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
    line('ADDED', r.added),
    line('UPDATED', r.updated),
    line('NEEDS REVIEW', r.review),
    line('REJECTED', r.rejected),
    r.archived.length ? `ARCHIVED (${r.archived.length})` : '',
  ].filter(Boolean).join('\n\n') || 'No changes.';
}
