// schema.org/Event adapter — the highest-yield, lowest-maintenance source.
// Most event platforms (and many organiser sites) embed JSON-LD. This reads it
// without any site-specific selectors, so it does not break on redesigns.
//
// WATCHLIST is the seed set: organiser sites and calendar pages to poll.
// Add URLs here; that is the main dial for coverage.

export const WATCHLIST = [
  'https://gravel-worlds.com',
  'https://www.unboundgravel.com',
  'https://sbtgrvl.com',
  'https://belgianwaffleride.bike',
  'https://www.theridecollective.com',
  // calendar pages worth polling
  'https://gravelcyclist.com/events/',
  'https://www.bikereg.com/events',
];

const TYPE_HINTS = [
  [/gravel|dirt|unpaved|chunk/i, 'gravel-race'],
  [/fondo|rally|festival|tour/i, 'gravel-fondo'],
  [/crit|criterium|stage race|road race|classic/i, 'road-race'],
  [/century|charity|ride for|metric/i, 'road-century'],
];

function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
      for (const it of items) {
        const t = it['@type'];
        const types = Array.isArray(t) ? t : [t];
        if (types.some((x) => typeof x === 'string' && /Event$/i.test(x))) out.push(it);
      }
    } catch { /* malformed block — skip it, do not fail the run */ }
  }
  return out;
}

function guessType(name, description) {
  const hay = `${name} ${description || ''}`;
  for (const [re, type] of TYPE_HINTS) if (re.test(hay)) return type;
  return 'gravel-race';
}

function offersToCost(offers) {
  if (!offers) return undefined;
  const list = Array.isArray(offers) ? offers : [offers];
  const prices = list.map((o) => Number(o.price)).filter((n) => n > 0);
  if (!prices.length) return undefined;
  return [Math.min(...prices), Math.max(...prices)];
}

export default {
  id: 'jsonld',
  async discover({ fetchText, since, until, log }) {
    const found = [];
    for (const url of WATCHLIST) {
      let html;
      try { html = await fetchText(url); }
      catch (err) { log?.(`  ! ${url}: ${err.message}`); continue; }

      for (const ev of extractJsonLd(html)) {
        const date = (ev.startDate || '').slice(0, 10);
        if (!date || date < since || date > until) continue;

        const loc = ev.location || {};
        const addr = loc.address || {};
        const geo = loc.geo || {};

        found.push({
          name: ev.name,
          date,
          endDate: ev.endDate ? ev.endDate.slice(0, 10) : undefined,
          city: addr.addressLocality,
          state: addr.addressRegion,
          lat: geo.latitude ? Number(geo.latitude) : undefined,
          lon: geo.longitude ? Number(geo.longitude) : undefined,
          url: ev.url || url,
          org: ev.organizer?.name,
          blurb: ev.description ? String(ev.description).replace(/\s+/g, ' ').slice(0, 320) : undefined,
          cost: offersToCost(ev.offers),
          type: guessType(ev.name, ev.description),
          source: 'jsonld',
          confidence: 0.8,
        });
      }
    }
    return found;
  },
};
