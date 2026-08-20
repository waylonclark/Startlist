// Enrichment: turn a course page into the fields adapters cannot get.
//
// Distance options, elevation, surface mix, aid stations, cutoffs and lodging
// live in prose. This fetches the event's own pages and asks a model to return
// the exact record shape, then hands the result to schema validation — anything
// that fails validation is dropped rather than published.
//
// Requires ANTHROPIC_API_KEY. Without it the run still works; records simply
// arrive thinner and land in the review queue.

import { FIELDS, PROFILE_KEYS, TYPES, validate, coerce, completeness } from './schema.js';
import { decodeEntities } from './gate.js';

const MODEL = 'claude-sonnet-4-6';
const NEEDS = ['dist', 'gain', 'profile', 's', 'cost', 'deadline', 'support', 'aid', 'cutoff', 'lodging', 'diff', 'blurb', 'type'];

const SYSTEM = `You extract structured facts about cycling events from their own web pages.

Return ONLY a JSON object. Use these keys and types:
${NEEDS.map((k) => `  ${k}: ${FIELDS[k].kind}${FIELDS[k].options ? ' (' + FIELDS[k].options.join(' | ') + ')' : ''}${FIELDS[k].note ? ' — ' + FIELDS[k].note : ''}`).join('\n')}

Rules:
- Omit any key the page does not state. NEVER estimate, infer, or fill from general knowledge.
- dist is miles, ascending. gain is feet on the LONGEST route.
- s is an ARRAY of exactly 3 numbers summing to 100: [pavement, gravel, dirt]. Not an object.
- cost is an ARRAY [low, high] in USD. A single-price event is [n, n].
- profile describes course character: ${PROFILE_KEYS.join(', ')}.
- type is one of: ${TYPES.join(', ')}.
- support 1-5: 1 fully self-supported, 3 aid stations + SAG, 5 full service including meals and mechanical.
- diff 1-5 relative to other US endurance events.
- blurb: 1-3 factual sentences. No marketing voice, no exclamation marks.
- Every number must be a plain JSON number. No "~", no "50-62" ranges, no units inside the value.
- Add a "_found" array naming the keys you are confident about.`;

// Organiser sites are small and flaky — a single connection reset shouldn't cost
// the record. Two retries with a short backoff clears nearly all of them.
async function withRetry(fn, { tries = 3, delay = 800 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw last;
}


// The model sometimes signs off after the JSON ("...Let me know if"). A greedy
// /\{[\s\S]*\}/ then swallows the prose, so scan for the first BALANCED object
// instead, ignoring braces that live inside strings.
function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;   // unterminated — repairJson can't help either
}

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
  // 429 (rate limit) and 529 (overloaded) are transient and common when several
  // records are enriched at once — the caller retries these rather than losing
  // the record's detail to a momentary capacity blip.
  if (!res.ok) {
    const err = new Error(`anthropic ${res.status}: ${await res.text()}`);
    err.transient = res.status === 429 || res.status === 529 || res.status >= 500;
    throw err;
  }
  const data = await res.json();
  const text = data.content.map((c) => c.text || '').join('');
  const json = firstJsonObject(text);
  if (!json) throw new Error('no JSON in response');
  return JSON.parse(repairJson(json));
}

// The model occasionally hedges numbers it read off a page: `"dist": [~50, ~62]`,
// `50-62`, or a trailing comma before the close. Strip the hedging rather than
// lose the whole record to a parse error.
function repairJson(s) {
  return s
    .replace(/:\s*~\s*/g, ': ')
    .replace(/([[,]\s*)~\s*/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\b(?=\s*[,\]}])/g, '$1, $2')
    .replace(/,(\s*[}\]])/g, '$1');
}

// The model sometimes returns the top of the page instead of writing a summary:
// an ALL-CAPS heading, marketing voice, or a hard-truncated paragraph. Better to
// have no blurb than a page dump on the card.
function cleanBlurb(raw) {
  let b = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  if (!b) return undefined;
  if (/^(about|welcome|home|register|overview)\b/i.test(b)) return undefined;
  // An all-caps run of 3+ words is a scraped heading, not a sentence.
  if (/\b[A-Z]{2,}(\s+[A-Z]{2,}){2,}/.test(b)) return undefined;
  if (!/[.!?]/.test(b)) return undefined;          // no sentence ever ended
  if (b.length > 400) return undefined;            // truncated dump
  const sentences = b.match(/[^.!?]+[.!?]/g);
  if (!sentences) return undefined;
  return sentences.slice(0, 3).join(' ').trim();
}

function stripHtml(html) {
  // Entities have to go before the model sees the text, or "Farmers &amp; Bankers"
  // comes back in the blurb exactly as written.
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
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
      const html = await withRetry(() => fetchText(new URL(sub, rec.url).href));
      const text = stripHtml(html);
      if (text.length > 400) pages.push(`--- ${sub || '/'} ---\n${text}`);
    } catch { /* subpage does not exist — normal */ }
  }
  if (!pages.length) return rec;

  let extracted;
  // Overload/rate-limit responses are worth waiting out — a longer backoff than
  // the page fetches use, since capacity takes seconds not milliseconds to free.
  try { extracted = await withRetry(() => ask(apiKey, pages.join('\n\n'), rec.name), { tries: 4, delay: 3000 }); }
  catch (err) { log?.(`  ! enrich ${rec.name}: ${err.message}`); return rec; }

  const found = new Set(extracted._found || Object.keys(extracted));
  delete extracted._found;
  // The gate's decoded name is authoritative — never let the page override it.
  delete extracted.name;
  delete extracted.id;
  if (typeof extracted.blurb === 'string') extracted.blurb = cleanBlurb(extracted.blurb);

  const merged = coerce({ ...rec, ...Object.fromEntries(
    Object.entries(extracted).filter(([k, v]) => NEEDS.includes(k) && v !== null && rec[k] === undefined)
  ) });

  // Extraction is never as trustworthy as a structured feed, but not every
  // field we ask for matters equally: dist/type/gain/profile are what make a
  // record usable, lodging/cutoff/aid/etc. are flavor. Penalising a real
  // century for not publishing "lodging" was holding back solid records —
  // score the two groups separately and let core coverage dominate.
  const CORE = ['dist', 'gain', 'profile', 'type'];
  const coreMissing = missing.filter((k) => CORE.includes(k));
  const bonusMissing = missing.filter((k) => !CORE.includes(k));
  const coreCoverage = coreMissing.length ? coreMissing.filter((k) => found.has(k)).length / coreMissing.length : 1;
  const bonusCoverage = bonusMissing.length ? bonusMissing.filter((k) => found.has(k)).length / bonusMissing.length : 1;
  merged.confidence = Math.min(rec.confidence ?? 0.5, 0.5 + coreCoverage * 0.35 + bonusCoverage * 0.1);
  merged.enriched = true;

  const errors = validate({ ...merged, source: merged.source || 'enrich', lastSeen: merged.lastSeen || '1970-01-01' });
  if (errors.length) log?.(`  ! ${rec.name}: ${errors.join('; ')}`);
  else {
    const pct = Math.round(completeness(merged) * 100);
    if (pct < 50) log?.(`  ~ ${rec.name}: ${pct}% detail`);
  }
  return merged;
}

// Geocode city/state when an adapter did not supply coordinates.
//
// Nominatim enforces its usage policy at the header level: a User-Agent with a
// placeholder contact (you@example.com) gets a blanket 403 on every request.
// run.js builds UA from STARTLIST_CONTACT for this reason.
export async function geocode(rec, { fetchJson, log }) {
  if (rec.lat != null && rec.lon != null) return rec;
  if (!rec.state) return rec;

  // Try the city as given, then a loosened query — feed data carries typos
  // ("Lester Praire, MN") that a state-level fallback still places usefully.
  // A multi-city tour (PALM crosses Michigan) or a placeholder city has no
  // point location at all: fall straight through to the state centre rather
  // than failing validation on missing lat/lon.
  const vague = !rec.city || /^(tbd|tba|various|multiple|n\/?a)$/i.test(rec.city.trim());
  const attempts = vague
    ? [`${rec.state}, USA`]
    : [`${rec.city}, ${rec.state}, USA`, `${rec.state}, USA`];
  // Nominatim rate-limits and sheds load (429/503) under a long crawl. Those are
  // transient: back off and retry rather than dropping the record's coordinates,
  // which would fail validation and reject an otherwise good event.
  const TRANSIENT = /\b(429|500|502|503|504)\b/;
  const fetchWithRetry = async (url) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchJson(url);
      } catch (err) {
        if (attempt >= 2 || !TRANSIENT.test(err.message)) throw err;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  };

  for (const [i, q] of attempts.entries()) {
    try {
      const hits = await fetchWithRetry(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      if (hits[0]) {
        const loc = { ...rec, lat: Number(hits[0].lat), lon: Number(hits[0].lon) };
        if (i > 0 || vague) {
          log?.(`  ~ geocode ${rec.city}, ${rec.state}: no match, placed at state centre`);
          loc.geoApprox = true;
        }
        return loc;
      }
    } catch (err) {
      const hint = /403/.test(err.message) ? ' — set STARTLIST_CONTACT to a real email or URL' : '';
      log?.(`  ! geocode ${rec.city}: ${err.message}${hint}`);
      // A 403 is a configuration problem — every further query fails the same
      // way. Anything else may still resolve on the looser state-level query.
      if (/403/.test(err.message)) return rec;
    }
  }
  log?.(`  ! geocode ${rec.city}, ${rec.state}: no match`);
  return rec;
}
