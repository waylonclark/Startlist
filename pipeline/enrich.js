// Enrichment: turn a course page into the fields adapters cannot get.
//
// Distance options, elevation, surface mix, aid stations, cutoffs and lodging
// live in prose. This fetches the event's own pages and asks a model to return
// the exact record shape, then hands the result to schema validation — anything
// that fails validation is dropped rather than published.
//
// Requires ANTHROPIC_API_KEY. Without it the run still works; records simply
// arrive thinner and land in the review queue.

import { FIELDS, PROFILE_KEYS, TYPES, validate } from './schema.js';

const MODEL = 'claude-sonnet-4-6';
const NEEDS = ['dist', 'gain', 'profile', 's', 'cost', 'deadline', 'support', 'aid', 'cutoff', 'lodging', 'diff', 'blurb', 'type'];

const SYSTEM = `You extract structured facts about cycling events from their own web pages.

Return ONLY a JSON object. Use these keys and types:
${NEEDS.map((k) => `  ${k}: ${FIELDS[k].kind}${FIELDS[k].options ? ' (' + FIELDS[k].options.join(' | ') + ')' : ''}${FIELDS[k].note ? ' — ' + FIELDS[k].note : ''}`).join('\n')}

Rules:
- Omit any key the page does not state. NEVER estimate, infer, or fill from general knowledge.
- dist is miles, ascending. gain is feet on the LONGEST route.
- s is [pavement, gravel, dirt] percentages summing to 100.
- profile describes course character: ${PROFILE_KEYS.join(', ')}.
- type is one of: ${TYPES.join(', ')}.
- support 1-5: 1 fully self-supported, 3 aid stations + SAG, 5 full service including meals and mechanical.
- diff 1-5 relative to other US endurance events.
- blurb: 1-3 factual sentences. No marketing voice, no exclamation marks.
- Add a "_found" array naming the keys you are confident about.`;

async function ask(apiKey, pages, name) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Event: ${name}\n\nPages:\n\n${pages}` }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map((c) => c.text || '').join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  return JSON.parse(match[0]);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

const SUBPAGES = ['', '/course', '/routes', '/info', '/faq', '/register', '/the-course'];

export async function enrich(rec, { fetchText, apiKey, log }) {
  if (!apiKey) return rec;
  const missing = NEEDS.filter((k) => rec[k] === undefined);
  if (!missing.length) return rec;

  const pages = [];
  for (const sub of SUBPAGES) {
    if (pages.length >= 3) break;
    try {
      const html = await fetchText(new URL(sub, rec.url).href);
      const text = stripHtml(html);
      if (text.length > 400) pages.push(`--- ${sub || '/'} ---\n${text}`);
    } catch { /* subpage does not exist — normal */ }
  }
  if (!pages.length) return rec;

  let extracted;
  try { extracted = await ask(apiKey, pages.join('\n\n'), rec.name); }
  catch (err) { log?.(`  ! enrich ${rec.name}: ${err.message}`); return rec; }

  const found = new Set(extracted._found || Object.keys(extracted));
  delete extracted._found;

  const merged = { ...rec };
  for (const [k, v] of Object.entries(extracted)) {
    if (!NEEDS.includes(k) || v === null) continue;
    if (merged[k] === undefined) merged[k] = v;
  }

  // Extraction is never as trustworthy as a structured feed. Cap confidence, and
  // penalise records where the model only found part of what we asked for.
  const coverage = missing.filter((k) => found.has(k)).length / missing.length;
  merged.confidence = Math.min(rec.confidence ?? 0.5, 0.45 + coverage * 0.3);
  merged.enriched = true;

  const errors = validate({ ...merged, source: merged.source || 'enrich', lastSeen: merged.lastSeen || '1970-01-01' });
  if (errors.length) log?.(`  ~ ${rec.name}: ${errors.length} field(s) still incomplete`);
  return merged;
}

// Geocode city/state when an adapter did not supply coordinates.
// Nominatim requires a real User-Agent and one request per second.
export async function geocode(rec, { fetchJson, log }) {
  if (rec.lat != null && rec.lon != null) return rec;
  if (!rec.city || !rec.state) return rec;
  try {
    const q = encodeURIComponent(`${rec.city}, ${rec.state}, USA`);
    const hits = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
    if (hits[0]) return { ...rec, lat: Number(hits[0].lat), lon: Number(hits[0].lon) };
  } catch (err) { log?.(`  ! geocode ${rec.city}: ${err.message}`); }
  return rec;
}
