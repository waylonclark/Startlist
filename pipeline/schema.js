// Canonical event record: shape, defaults, and validation.
// Everything downstream (adapters, enrichment, merge, emit) speaks this shape.

export const PROFILE_KEYS = ['flat', 'rollers', 'lumpy', 'steady', 'bigclimb', 'sawtooth', 'mountain'];
export const TYPES = ['gravel-race', 'gravel-fondo', 'road-race', 'road-century'];
export const TAGS = ['charity', 'ride', 'series'];

// field -> { required, kind, note }
// `kind` drives validation and also tells the enricher what to extract.
//
// `required` means: without this the event cannot be placed on the site at all.
// Everything else is detail. Event pages routinely omit elevation, surface mix,
// registration deadlines, and never state a support or difficulty rating in the
// terms we want — and the enricher is instructed never to invent them. Marking
// those required threw away real races (Chino Grinder over a missing deadline,
// UNBOUND over eight fields) while keeping nothing safer. Detail fields render
// as unknown on the card instead.
export const FIELDS = {
  id:       { required: true,  kind: 'slug',   note: 'stable key; never regenerate for an existing event' },
  name:     { required: true,  kind: 'string' },
  org:      { required: false, kind: 'string' },
  date:     { required: true,  kind: 'date',   note: 'ISO YYYY-MM-DD, first day' },
  endDate:  { required: false, kind: 'date',   note: 'multi-day only' },
  city:     { required: true,  kind: 'string' },
  state:    { required: true,  kind: 'state' },
  lat:      { required: true,  kind: 'number' },
  lon:      { required: true,  kind: 'number' },
  type:     { required: true,  kind: 'enum',   options: TYPES },
  dist:     { required: true,  kind: 'numbers', note: 'route options in miles, ascending' },
  gain:     { required: false, kind: 'number', note: 'feet of climbing on the longest route' },
  profile:  { required: false, kind: 'enum',   options: PROFILE_KEYS, note: 'course character' },
  s:        { required: false, kind: 'surface', note: '[pavement, gravel, dirt] percentages, sum 100' },
  cost:     { required: false, kind: 'numbers', note: '[low, high] USD' },
  deadline: { required: false, kind: 'date' },
  support:  { required: false, kind: 'rating', note: '1-5 overall support level' },
  aid:      { required: false, kind: 'number', note: 'aid station count; 0 for races with none' },
  cutoff:   { required: false, kind: 'string' },
  lodging:  { required: false, kind: 'string' },
  diff:     { required: false, kind: 'rating', note: '1-5 difficulty' },
  url:      { required: true,  kind: 'url' },
  blurb:    { required: true,  kind: 'string', note: '1-3 sentences, factual, no marketing voice' },
  tags:     { required: false, kind: 'tags',   note: "gate classification: 'charity' | 'ride' | 'series'; absent means race" },
  // provenance — written by the pipeline, never by an adapter
  source:     { required: true, kind: 'string', note: 'adapter id that produced this record' },
  lastSeen:   { required: true, kind: 'date' },
  confidence: { required: true, kind: 'number', note: '0-1; below THRESHOLD it stays in review' },
  verified:   { required: false, kind: 'boolean', note: 'true only when a human confirmed it' },
  // Set by geocode() when the city didn't resolve and the record fell back to
  // the state centroid. The map should show these as approximate, not located.
  geoApprox:  { required: false, kind: 'boolean', note: 'coords are a state-level fallback' },
};

export const CONFIDENCE_THRESHOLD = 0.7;

// Fields that make a card feel complete. Not required, but tracked: a record
// with few of these is thin, and `completeness` drives review-queue ordering.
export const DETAIL_FIELDS = ['gain', 'profile', 's', 'cost', 'deadline', 'support', 'aid', 'diff'];

export function completeness(rec) {
  const have = DETAIL_FIELDS.filter((k) => rec[k] !== undefined && rec[k] !== null).length;
  return have / DETAIL_FIELDS.length;
}

// Normalise the shapes a model plausibly returns into the shapes we store.
// The enricher is told the exact types, but "9% pavement, 91% gravel" comes back
// as an object about as often as an array, and a single-price event comes back
// as a number. Coercing beats discarding a true record over its packaging.
// Feed titles arrive HTML-escaped ("Gravel &amp; Grind"). Decode before matching
// so word boundaries work, and so the cleaned name is what reaches the site.
const ENTITIES = { amp: '&', quot: '"', apos: "'", lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', ndash: '\u2013', mdash: '\u2014', nbsp: ' ', lt: '<', gt: '>' };
export function decodeEntities(s) {
  let out = String(s || '');
  // Feed titles are sometimes double-escaped ("&amp;amp;"), so decode to a fixed point.
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Free-text fields, decoded at the one boundary every record crosses before it is
// merged or written — no upstream path can leak an entity into events.js.
const TEXT_FIELDS = ['name', 'blurb', 'city', 'org', 'venue'];

export function coerce(rec) {
  const out = { ...rec };

  for (const f of TEXT_FIELDS) {
    if (typeof out[f] === 'string') out[f] = decodeEntities(out[f]);
  }

  if (out.s && !Array.isArray(out.s) && typeof out.s === 'object') {
    const { pavement = 0, paved = 0, gravel = 0, dirt = 0, singletrack = 0 } = out.s;
    out.s = [pavement || paved, gravel, dirt || singletrack];
  }
  if (Array.isArray(out.s) && out.s.length === 3) {
    const nums = out.s.map((n) => (typeof n === 'number' && !Number.isNaN(n) ? n : 0));
    const sum = nums.reduce((a, b) => a + b, 0);
    // Rescale near-misses (0,91,0 -> 0,100,0). A sum that far off is a bad read.
    if (sum > 0 && Math.abs(sum - 100) > 1) {
      out.s = sum >= 80 ? nums.map((n) => Math.round((n / sum) * 100)) : undefined;
    } else if (sum === 0) {
      out.s = undefined;
    } else {
      out.s = nums;
    }
  } else if (out.s !== undefined && !Array.isArray(out.s)) {
    out.s = undefined;
  }

  // Enrichment returns cost as a scalar, a "$45" string, a "$45-$75" range, or
  // a {min,max} object depending on how the organiser page phrased it.
  if (out.cost && typeof out.cost === 'object' && !Array.isArray(out.cost)) {
    const { min, max, low, high } = out.cost;
    const lo = min ?? low, hi = max ?? high;
    out.cost = lo === undefined && hi === undefined ? undefined : [lo ?? hi, hi ?? lo];
  }
  if (typeof out.cost === 'string') {
    const nums = out.cost.match(/\d+(\.\d+)?/g);
    out.cost = nums?.length ? nums.slice(0, 2).map(Number) : undefined;
  }
  if (typeof out.cost === 'number') out.cost = [out.cost, out.cost];
  if (Array.isArray(out.cost) && out.cost.length === 1) out.cost = [out.cost[0], out.cost[0]];
  // A $0 entry is almost always a free youth/volunteer/spectator category the
  // enricher scraped off the price table, not the real floor — it made El Tour
  // read "$0-300". Keep only positive fees; a genuinely free event carries no
  // cost field rather than a misleading zero.
  if (Array.isArray(out.cost)) {
    const fees = out.cost.map(Number).filter((n) => isFinite(n) && n > 0)
      .map((n) => Math.round(n))
      .sort((a, b) => a - b);
    out.cost = fees.length ? [fees[0], fees[fees.length - 1]] : undefined;
  }

  // aid: 0 means the page never stated an aid-station count, not that the event
  // is unsupported — it read as "support 4, aid 0" on Big Bull Falls. Drop it and
  // let the card omit the figure rather than assert a false zero.
  if (out.aid === 0) out.aid = undefined;

  // The enricher sometimes writes prose for a field it could not find
  // ("lodging: not stated"). An absent field renders as nothing; this renders
  // as a fact. Drop the non-answers.
  // The trailing group catches the qualified forms the model favours —
  // "not stated on page", "not specified on the event website".
  const NON_ANSWER = /^(not stated|not specified|none stated|n\/?a|unknown|not available|not listed|unspecified|not mentioned|not provided|no information|tbd|tba)( (on|in|at|by) (the )?[\w' -]{0,40})?\.?$/i;
  for (const f of ['lodging', 'cutoff', 'blurb', 'profile']) {
    if (typeof out[f] === 'string' && NON_ANSWER.test(out[f].trim())) out[f] = undefined;
  }

  // Float noise from repeated corroboration bumps: 0.5700000000000001.
  if (typeof out.confidence === 'number') out.confidence = Math.round(out.confidence * 100) / 100;
  if (typeof out.dist === 'number') out.dist = [out.dist];
  if (Array.isArray(out.dist)) {
    const nums = out.dist.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b);
    out.dist = nums.length ? nums : undefined;
  }
  if (typeof out.gain === 'string') {
    const n = Number(String(out.gain).replace(/[^\d.]/g, ''));
    out.gain = Number.isFinite(n) && n > 0 ? n : undefined;
  }

  return out;
}

const US_STATES = /^[A-Z]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validate(rec) {
  const errors = [];
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = rec[key];
    if (v === undefined || v === null || v === '') {
      // A weekly series has no single route: rounds change course week to week,
      // so distance is legitimately absent rather than missing.
      const seriesExempt = key === 'dist' && (rec.tags || []).includes('series');
      if (f.required && !seriesExempt) errors.push(`${key}: missing`);
      continue;
    }
    switch (f.kind) {
      case 'date':
        if (!ISO_DATE.test(v)) errors.push(`${key}: expected YYYY-MM-DD, got ${v}`);
        break;
      case 'state':
        if (!US_STATES.test(v)) errors.push(`${key}: expected 2-letter code, got ${v}`);
        break;
      case 'enum':
        if (!f.options.includes(v)) errors.push(`${key}: ${v} not in ${f.options.join('|')}`);
        break;
      case 'numbers':
        if (!Array.isArray(v) || !v.length || v.some((n) => typeof n !== 'number')) errors.push(`${key}: expected number[]`);
        break;
      case 'surface': {
        const sum = Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : 0;
        if (v.length !== 3 || Math.abs(sum - 100) > 1) errors.push(`${key}: must be 3 percentages summing to 100, got ${v}`);
        break;
      }
      case 'rating':
        if (!(v >= 1 && v <= 5)) errors.push(`${key}: expected 1-5, got ${v}`);
        break;
      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${key}: expected number`);
        break;
      case 'url':
        if (!/^https?:\/\//.test(v)) errors.push(`${key}: expected absolute URL`);
        break;
      case 'tags':
        if (!Array.isArray(v) || v.some((t) => !TAGS.includes(t))) errors.push(`${key}: expected subset of ${TAGS.join('|')}`);
        break;
    }
  }
  // cross-field sanity — catches the enricher hallucinating plausible-looking numbers
  if (rec.dist && rec.gain) {
    const ftmi = rec.gain / rec.dist[rec.dist.length - 1];
    if (ftmi > 250) errors.push(`gain: ${ftmi.toFixed(0)} ft/mi is implausible`);
  }
  if (rec.endDate && rec.date && rec.endDate < rec.date) errors.push('endDate: before date');
  if (rec.cost && rec.cost[0] > rec.cost[1]) errors.push('cost: low above high');
  // Dirty Squirrel came back with a 2025 deadline for a 2026 event — a stale
  // page the enricher read literally. A deadline after the event is wrong too.
  if (rec.deadline && rec.date && rec.deadline > rec.date) errors.push(`deadline: ${rec.deadline} is after the event date`);
  if (rec.deadline && rec.date && rec.deadline.slice(0, 4) < rec.date.slice(0, 4)) errors.push(`deadline: ${rec.deadline} predates the event year`);
  return errors;
}

export function slugify(name, state) {
  // Truncate the NAME, then append the state, so a long title can never slice
  // the state off the end and collapse two states' events onto one id.
  const st = String(state || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const base = String(name || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, st ? 45 - st.length : 48)
    .replace(/-$/, '');
  return st ? `${base}-${st}` : base;
}
