// Canonical event record: shape, defaults, and validation.
// Everything downstream (adapters, enrichment, merge, emit) speaks this shape.

export const PROFILE_KEYS = ['flat', 'rollers', 'lumpy', 'steady', 'bigclimb', 'sawtooth', 'mountain'];
export const TYPES = ['gravel-race', 'gravel-fondo', 'road-race', 'road-century'];

// field -> { required, kind, note }
// `kind` drives validation and also tells the enricher what to extract.
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
  gain:     { required: true,  kind: 'number', note: 'feet of climbing on the longest route' },
  profile:  { required: true,  kind: 'enum',   options: PROFILE_KEYS, note: 'course character' },
  s:        { required: true,  kind: 'surface', note: '[pavement, gravel, dirt] percentages, sum 100' },
  cost:     { required: true,  kind: 'numbers', note: '[low, high] USD' },
  deadline: { required: true,  kind: 'date' },
  support:  { required: true,  kind: 'rating', note: '1-5 overall support level' },
  aid:      { required: true,  kind: 'number', note: 'aid station count; 0 for races with none' },
  cutoff:   { required: false, kind: 'string' },
  lodging:  { required: false, kind: 'string' },
  diff:     { required: true,  kind: 'rating', note: '1-5 difficulty' },
  url:      { required: true,  kind: 'url' },
  blurb:    { required: true,  kind: 'string', note: '1-3 sentences, factual, no marketing voice' },
  // provenance — written by the pipeline, never by an adapter
  source:     { required: true, kind: 'string', note: 'adapter id that produced this record' },
  lastSeen:   { required: true, kind: 'date' },
  confidence: { required: true, kind: 'number', note: '0-1; below THRESHOLD it stays in review' },
  verified:   { required: false, kind: 'boolean', note: 'true only when a human confirmed it' },
};

export const CONFIDENCE_THRESHOLD = 0.7;

const US_STATES = /^[A-Z]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validate(rec) {
  const errors = [];
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = rec[key];
    if (v === undefined || v === null || v === '') {
      if (f.required) errors.push(`${key}: missing`);
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
    }
  }
  // cross-field sanity — catches the enricher hallucinating plausible-looking numbers
  if (rec.dist && rec.gain) {
    const ftmi = rec.gain / rec.dist[rec.dist.length - 1];
    if (ftmi > 250) errors.push(`gain: ${ftmi.toFixed(0)} ft/mi is implausible`);
  }
  if (rec.endDate && rec.date && rec.endDate < rec.date) errors.push('endDate: before date');
  if (rec.cost && rec.cost[0] > rec.cost[1]) errors.push('cost: low above high');
  return errors;
}

export function slugify(name, state) {
  return (name + '-' + (state || ''))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}
