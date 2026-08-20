# The Start List

A directory of gravel and road bike races across the United States — browsable by
month, region, distance, elevation, and surface. Built to read like a race
poster rather than a search results page.

**Live:** `https://waylonclark.github.io/Startlist/`

The event index maintains itself. A scheduled crawler reads `schema.org/Event`
markup from organiser and calendar sites, fills gaps with an LLM extraction pass,
merges the result under conservative sticky-field rules, and opens a pull request
for review. Nothing reaches the site until you merge it.

---

## Four views of the same data

| View | What it's for |
| --- | --- |
| **Cards** | Browse. Each event gets generated cover art — terrain profile, ground texture, and seasonal palette all derived from that event's own numbers. |
| **Map** | Where the season actually is. Events plotted on a US projection, coloured by discipline. |
| **Season** | The calendar as a horizontal band. Find the gaps and the pile-ups. |
| **Plot** | Distance against elevation gain. Where the hard ones live. |

Filtering is state-aware and stacks across all four: discipline, date range,
distance, elevation, surface mix, and support level.

## Stack

None, essentially. Static HTML, inline styles, a small rendering runtime, d3 and
topojson from a CDN for the map projection. No framework, no bundler, no build
step. The pipeline is plain Node 20 with no dependencies — builtins and the
global `fetch`.

---

## Layout

```
start-list/
├─ index.html                    Pages entry point (forwards to the design)
├─ Start List.dc.html            the actual page — all four views
├─ Start List (standalone).html  frozen single-file snapshot, not auto-updated
├─ support.js                    rendering runtime
├─ events.js                     GENERATED — do not edit by hand
├─ MapView.jsx                   US map, transpiled in the browser
├─ image-slot.js                 image placeholder component
├─ package.json                  "type": "module" — required by the pipeline
├─ DEPLOY.md                     setup, hosting, and operations
├─ .github/workflows/discover.yml   the weekly crawl
└─ pipeline/
   ├─ README.md                  pipeline internals
   ├─ run.js                     orchestrator
   ├─ schema.js merge.js enrich.js emit.js
   ├─ data/events.json           SOURCE OF TRUTH
   └─ sources/jsonld.js bikereg.js index.js
```

Two independent systems: the static site, and the pipeline that regenerates
`events.js`. The site never calls the pipeline — it loads whatever `events.js`
says, so either can break without touching the other.

---

## Working on it

Requires **Node 20+**. Nothing to install.

```bash
npx serve .                                        # preview the site
node --env-file=.env pipeline/run.js --dry         # crawl, report, write nothing
node --env-file=.env pipeline/run.js --months 18   # crawl and rewrite events.js
```

`file://` won't work for previewing — the module and `.jsx` fetches are blocked.
Use a server or the Live Server extension.

`.env` holds `ANTHROPIC_API_KEY=…` and is gitignored. Without a key the crawl
still runs; records just arrive thin and land in the review queue.

Every push to `main` redeploys Pages. There is no deploy command.

## Fixing an event

`events.js` is generated output — edits to it vanish on the next run. Edit
`pipeline/data/events.json` and add the field name to that record's `pinned`
array so the crawler stops overwriting it:

```json
{ "id": "unbound", "cost": [190, 340], "pinned": ["cost", "cutoff"] }
```

## Adding a source

`WATCHLIST` in `pipeline/sources/jsonld.js` is the main dial for coverage. Before
adding a URL, View Source on one of its event pages and confirm an
`application/ld+json` block containing `"@type": "Event"` — if it only appears in
the Inspector it's client-side rendered and this crawler can't see it. Check
`robots.txt` too. Calendar and series pages beat single event pages.

---

## What the automation does and doesn't do

It reliably catches **new events and changed dates and prices** on sites with
structured markup. It is unreliable at **elevation, surface mix, aid stations,
and cutoffs** — those live in prose, and the enricher is instructed to omit
rather than guess. Expect gaps rather than fiction; a blank field is
recoverable, a confident wrong number isn't.

Records scoring below 0.7 confidence are held back with `needsReview: true` and
never reach the site. Records marked `verified: true` only accept updates to
date, deadline, cost, and url.

Realistic split: most of discovery automated, final course details confirmed by
hand, about ten minutes a week reviewing the PR.

Crawling is throttled to one request every 1.5s with an identifying User-Agent
and a contact address. Please keep it that way.

---

**Setup and hosting:** [`DEPLOY.md`](DEPLOY.md)
**Pipeline internals:** [`pipeline/README.md`](pipeline/README.md)
