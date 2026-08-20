// RunSignup — the one genuinely open structured feed in this space.
//
// Public races need no authentication. The API exposes exactly the event types
// we care about (gravel_grinder, bike_race, bike_ride, mountain_bike_race,
// fundraising_ride), filterable by date range, with per-event distances
// attached. That makes it far higher yield than scraping organiser sites, most
// of which publish no Event markup at all.
//
// Docs: https://runsignup.com/API/races/GET
// Rate limits exist; we page politely and stop at MAX_PAGES.

const BASE = 'https://api.runsignup.com/rest/races';

// RunSignup event_type → our discipline. Their taxonomy is coarser than ours;
// enrich.js refines from the course page when it can.
const TYPE_MAP = {
  gravel_grinder: 'gravel-race',
  mountain_bike_race: 'gravel-race',
  bike_race: 'road-race',
  bike_ride: 'road-century',
  fundraising_ride: 'road-century',
};

const EVENT_TYPES = Object.keys(TYPE_MAP);

const MAX_PAGES = 8;
const PER_PAGE = 100;

// Their date fields are inconsistent: sometimes ISO, sometimes M/D/YYYY, and
// start_time carries a trailing clock. Normalise everything to YYYY-MM-DD.
function isoDate(v) {
  if (!v) return undefined;
  const s = String(v).trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? undefined : d.toISOString().slice(0, 10);
}

// The feed's distance_unit is frequently blank, and a blank unit used to mean
// "miles" — which silently turned a 50K road race into a 50-mile one. Sniff the
// unit out of the distance string and the leg name before assuming.
function sniffUnit(...hints) {
  const s = hints.filter(Boolean).join(' ').toLowerCase();
  if (/\bk(m|ms)?\b|kilometer/.test(s) || /\d\s*k\b/.test(s)) return 'K';
  if (/\bmi\b|mile/.test(s)) return 'MI';
  return '';
}

function toMiles(distance, unit, name) {
  const n = parseFloat(distance);
  if (!isFinite(n) || n <= 0) return undefined;
  const u = (String(unit || '').toUpperCase() || sniffUnit(distance, name));
  if (u === 'K' || u === 'KM') return Math.round(n * 0.621371);
  if (u === 'MI' || u === 'M' || u === 'MILES') return Math.round(n);
  // Genuinely unknown unit: report nothing rather than guess. An absent
  // distance is handled by the gate; a wrong one is not.
  return undefined;
}

// Legs that aren't ridden. A race with a 1-mile dog walk shouldn't report a
// 1-mile minimum, and a 5K run leg shouldn't set the range at all.
const NON_BIKE_LEG = /\b(run|walk|5k run|dog|virtual|shadow|supporter|ruck|swim|paddle)\b/i;

// A RunSignup "race" bundles several distance options as child events. Our
// records carry a [min, max] distance range, so collapse them.
function distanceRange(events) {
  const legs = (events || []).filter((e) => !NON_BIKE_LEG.test(String(e.name || '')));
  const miles = (legs.length ? legs : events || [])
    .map((e) => toMiles(e.distance, e.distance_unit ?? e.distance_units, e.name))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!miles.length) return undefined;
  return [miles[0], miles[miles.length - 1]];
}

function pickType(race) {
  const evs = race.events || [];
  for (const t of EVENT_TYPES) {
    if (evs.some((e) => (e.event_type || '').toLowerCase() === t)) return TYPE_MAP[t];
  }
  return undefined;
}

function costRange(events) {
  const legs = (events || []).filter((e) => !NON_BIKE_LEG.test(String(e.name || '')));
  const fees = (legs.length ? legs : events || [])
    .map((e) => parseFloat(e.registration_periods?.[0]?.race_fee ?? e.race_fee))
    .filter((n) => isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!fees.length) return undefined;
  return [Math.round(fees[0]), Math.round(fees[fees.length - 1])];
}

function clean(s, max = 320) {
  if (!s) return undefined;
  return String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
}

export default {
  id: 'runsignup',

  async discover({ fetchJson, since, until, log }) {
    const found = [];

    for (const eventType of EVENT_TYPES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const qs = new URLSearchParams({
          format: 'json',
          events: 'T',
          event_type: eventType,
          start_date: since,
          end_date: until,
          country: 'US',
          results_per_page: String(PER_PAGE),
          page: String(page),
          sort: 'date ASC',
        });

        let data;
        try {
          data = await fetchJson(`${BASE}?${qs}`);
        } catch (err) {
          log?.(`  ! ${eventType} p${page}: ${err.message}`);
          break;
        }

        const rows = data?.races || [];
        if (!rows.length) break;

        for (const row of rows) {
          const race = row.race || row;
          if (race.is_draft_race === 'T' || race.is_private_race === 'T') continue;

          // Debug aid for missing series rounds: a round only surfaces here if its
          // own event_type is one we query for (see EVENT_TYPES above). A round
          // tagged e.g. "running_race" or left untyped by the organiser never
          // enters this loop at all, however it looks on the series' own page.
          if (/series|showme|grvl/i.test(String(race.name || ''))) {
            log?.(`  · series round seen: "${race.name}" [${eventType}] ${race.next_date || race.events?.[0]?.start_time || 'no date'}`);
          }

          const date = isoDate(race.next_date || race.events?.[0]?.start_time);
          if (!date || date < since || date > until) continue;

          const addr = race.address || {};
          const type = pickType(race) || TYPE_MAP[eventType];

          found.push({
            name: clean(race.name, 120),
            date,
            endDate: isoDate(race.last_date) !== date ? isoDate(race.last_date) : undefined,
            city: addr.city || undefined,
            state: addr.state || undefined,
            lat: race.address?.latitude ? Number(race.address.latitude) : undefined,
            lon: race.address?.longitude ? Number(race.address.longitude) : undefined,
            url: race.external_race_url || race.url || undefined,
            org: clean(race.race_headings?.[0]?.name, 80),
            blurb: clean(race.description),
            dist: distanceRange(race.events),
            cost: costRange(race.events),
            type,
            source: 'runsignup',
            confidence: 0.85,
          });
        }

        if (rows.length < PER_PAGE) break;
      }
    }

    // One race can list under several event types; keep the richest copy.
    const byKey = new Map();
    for (const r of found) {
      if (!r.name || !r.date) continue;
      const key = `${r.name.toLowerCase()}|${r.date}`;
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, r);
      else byKey.set(key, { ...prev, ...r, dist: prev.dist || r.dist });
    }

    return [...byKey.values()];
  },
};
