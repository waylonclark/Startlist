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
`robots.txt` before adding a site, and put a real contact address in the `UA`
constant in `run.js`.
