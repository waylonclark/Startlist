// Curated pages — the long tail no feed will ever cover.
//
// Epic Rides, Ironwood Adventure Works and their like self-host registration, so
// they are invisible to RunSignup and publish no Event markup. The only way in
// is to name the URL and read the page.
//
// This is the layer where hand-curation happens. Add a URL to PAGES and the
// crawler will track that event forever — dates, prices and course details
// refresh on every run. Use `node pipeline/add.js <url>` to append one.
//
// Cost is one Anthropic call per URL per run, so keep this list intentional.

const MODEL = 'claude-sonnet-4-6';

export const PAGES = [
  'https://epicrides.com/events/tour/tour-of-the-white-mountains-event-weekend-guide/',
  'https://www.ironwoodadventureworks.com/knobbyrock',
];

const SYSTEM = `You identify cycling events from their own web pages.

Return ONLY a JSON object with these keys:
  name    string  — the event's proper name, no year, no marketing suffix
  date    string  — YYYY-MM-DD, the next running of this event
  endDate string  — YYYY-MM-DD, only for multi-day events
  city    string
  state   string  — two-letter US code
  org     string  — the organising body
  blurb   string  — 1-3 factual sentences, no marketing voice
  type    string  — one of: gravel-race, gravel-fondo, road-race, road-century

Rules:
- Omit any key the page does not state. NEVER guess a date or a location.
- If the page shows several editions, use the soonest future one.
- If the page is not about a specific cycling event, return {}.
- Add "_confident": true only if name, date and location are all explicit.`;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14000);
}

async function identify(apiKey, text, url) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: 'user', content: `URL: ${url}\n\nPage:\n\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const out = data.content.map((c) => c.text || '').join('');
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  return JSON.parse(match[0]);
}

export default {
  id: 'pages',

  async discover({ fetchText, apiKey, since, until, log }) {
    if (!apiKey) {
      if (PAGES.length) log?.('  ! no API key — curated pages skipped');
      return [];
    }

    const found = [];
    for (const url of PAGES) {
      let text;
      try {
        text = stripHtml(await fetchText(url));
      } catch (err) {
        log?.(`  ! ${url}: ${err.message}`);
        continue;
      }
      if (text.length < 400) { log?.(`  ! ${url}: page too thin`); continue; }

      let rec;
      try { rec = await identify(apiKey, text, url); }
      catch (err) { log?.(`  ! ${url}: ${err.message}`); continue; }

      if (!rec?.name || !rec?.date) { log?.(`  ~ ${url}: no event identified`); continue; }
      if (rec.date < since || rec.date > until) {
        log?.(`  ~ ${rec.name}: ${rec.date} outside window`);
        continue;
      }

      const confident = rec._confident === true;
      delete rec._confident;

      log?.(`  · ${rec.name} — ${rec.date}`);
      found.push({
        ...rec,
        url,
        source: 'pages',
        // Hand-picked and read from the event's own site: better than a scrape,
        // short of a structured feed.
        confidence: confident ? 0.75 : 0.6,
      });
    }
    return found;
  },
};
