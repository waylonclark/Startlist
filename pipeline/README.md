# Discovery pipeline

Rewrites `events.js` on a schedule. The site never talks to the pipeline — it
just loads whatever `events.js` says.

```
sources/*  →  enrich.js  →  merge.js  →  emit.js  →  events.js
 discover     fill gaps     decide       serialise
```

## Run it

```bash
node pipeline/run.js --dry          # crawl and report, write nothing
node pipeline/run.js --months 18    # crawl, merge, rewrite events.js
```

Set `ANTHROPIC_API_KEY` to enable enrichment. Without it the crawl still runs;
records just arrive thin and land in the review queue instead of on the site.

Set `STARTLIST_CONTACT` to a real email address. It goes into the User-Agent,
and Nominatim returns 403 on every geocode without one — which shows up as every
record missing `lat`/`lon`.

```
ANTHROPIC_API_KEY=sk-ant-...
STARTLIST_CONTACT=you@yourdomain.com
```

Scheduled runs live in `.github/workflows/discover.yml` (Mondays). They open a
PR rather than committing to main, so you approve changes before they publish.

## The store

`data/events.json` is the source of truth — the 36 current events are seeded in
it. `events.js` is generated output; never edit it by hand.

Two provenance fields decide what reaches the site:

- `confidence` (0–1). Below 0.7 a record is held back with `needsReview: true`.
  Structured feeds score ~0.85, JSON-LD ~0.8, LLM extraction ~0.45–0.75.
  Corroboration from a second source raises it.
- `verified: true` means a human confirmed it. Verified records only accept
  updates to date, deadline, cost, and url.

**To correct a record permanently:** edit it in `data/events.json` and add the
field name to that record's `pinned` array. Pinned fields are never overwritten.

```json
{ "id": "unbound", "cost": [190, 340], "pinned": ["cost", "cutoff"] }
```

## The gate

`gate.js` runs between discovery and enrichment, because every candidate that
gets past it costs an API call. It does two things:

**Rejects** what is not a destination cycling event: running distances, walks,
triathlons, expos, virtual events, anything under the 40-mile floor, and
recurring club/social/training rides (including the ones that name themselves by
date or start time, like `Sept 3 - Social Ride Blodgett 5:30 pm`).

**Tags** what survives, rather than judging it:

- no tag — reads as a race
- `ride` — untimed, no competitive signal
- `charity` — fundraiser framing without competitive signal

Tags reach the site via `events.js` so they can be filtered there. A charity
century is a real ride someone might travel for; it just isn't a race, and the
site says which it is instead of pretending.

The gate re-derives tags every run. To override one permanently, pin it:
`"pinned": ["tags"]`.

Tuning: `MIN_MILES` is the blunt instrument. `NEVER` and `SOCIAL` reject,
`CHARITY` and `COMPETITIVE` only classify — a name matching both `CHARITY` and
`COMPETITIVE` stays untagged, which is how a race with a cause keeps its race
framing.

## What counts as complete

`required` in `schema.js` means: without this the event cannot be placed on the
site. That is name, date, city/state, coordinates, discipline, distances, URL and
blurb — nothing else.

Elevation, surface mix, price, registration deadline, support rating, aid station
count and difficulty are **detail**. Organiser pages routinely omit them, and the
enricher is instructed never to invent a number. Requiring them threw away real
races — Chino Grinder over a missing deadline, UNBOUND over eight fields — while
making nothing more accurate. They now render as "Not listed" on the card.

`completeness(rec)` reports the share of detail fields present. Use it to order
the review queue: a 20% record is the one worth a manual pass.

## Adding a source

Drop a module in `sources/` exporting `{ id, discover({ fetchText, fetchJson, since, until, log }) }`,
return partial records, and register it in the `ADAPTERS` array in `run.js`.
Set `confidence` honestly — merge.js uses it to resolve conflicts.

`jsonld.js` is the one worth investing in: it reads schema.org `Event` markup,
so it works on any site that publishes it and survives redesigns. Growing
coverage is mostly a matter of adding URLs to its `WATCHLIST`.

`bikereg.js` is a stub. BikeReg has no public API; either parse their search
pages or ask them for feed access.

## What this will and won't do

It reliably catches **new events and changed dates/prices** on sites with
structured markup. It is unreliable at **elevation, surface mix, aid stations,
and cutoffs** — those live in prose, and the enricher is instructed to omit
rather than guess, so expect gaps. Budget for reviewing the PR each week; the
realistic split is most discovery automated, final details confirmed by hand.

Requests are throttled to one every 1.5s with an identifying User-Agent. Check
`robots.txt` before adding a site, and set `STARTLIST_CONTACT` so the User-Agent
carries a real address.
