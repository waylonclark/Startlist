# Deploying The Start List — local + VS Code

Everything lives at the **project root** — there is no build output folder and
no `dist/`. What you download is exactly what gets served:

```
start-list/
├─ index.html                    ← Pages entry point (forwards to the design)
├─ Start List.dc.html            ← the actual page
├─ Start List (standalone).html  ← frozen single-file snapshot (not auto-updated)
├─ support.js                    ← rendering runtime
├─ events.js                     ← GENERATED event data — the pipeline rewrites this
├─ MapView.jsx                   ← US map, transpiled in the browser
├─ image-slot.js                 ← image placeholder component
├─ package.json                  ← "type": "module" — required for the pipeline
├─ DEPLOY.md                     ← this file
├─ .github/
│  └─ workflows/
│     └─ discover.yml            ← the weekly crawl
└─ pipeline/
   ├─ README.md
   ├─ run.js                     ← orchestrator (contains the UA contact string)
   ├─ schema.js  merge.js  enrich.js  emit.js
   ├─ data/events.json           ← SOURCE OF TRUTH — 36 seeded events
   ├─ reports/                   ← run logs, created on first real run
   └─ sources/
      ├─ index.js
      ├─ jsonld.js               ← the WATCHLIST lives here
      └─ bikereg.js              ← stub
```

Two independent systems:

1. **The site** — the static files above. GitHub Pages serves them as-is.
2. **The pipeline** — `pipeline/*`, run by GitHub Actions on a schedule. It
   rewrites `events.js` and opens a pull request. Merging that PR redeploys the
   site automatically.

The site never calls the pipeline. It only loads whatever `events.js` says, so
either can be set up — or broken — without affecting the other.

---

## Part 1 — Get the files onto your machine

Use the download button in the chat to grab the whole project as a zip. Unzip it
somewhere sensible (`~/Projects/start-list`), then in VS Code: **File → Open
Folder…** and pick that folder.

Check the zip preserved the dot-folder: in the VS Code Explorer you should see
`.github/workflows/discover.yml`. Some unzip tools hide dotfiles — if it's
missing, create the folders and file by hand; the contents are in this project.

Recommended extensions, none required: **GitHub Pull Requests and Issues** (adds
PR review inside the editor, which is where you'll live once the crawl is
running) and **GitHub Actions** (workflow logs in the sidebar).

---

## Part 2 — Publish it with VS Code

### 2.1 Add a `.gitignore` first

Create it at the root before the first commit:

```
node_modules/
.DS_Store
.env
```

`.env` matters — it's where you'll keep your API key for local runs, and it must
never reach GitHub.

### 2.2 Publish the repo

VS Code does the whole thing without a terminal:

1. **Source Control** panel (the branch icon, or `Ctrl/Cmd+Shift+G`)
2. **Initialize Repository**
3. Type a commit message — "The Start List" — and **✓ Commit**. If it asks
   whether to stage all changes, say yes.
4. **Publish Branch** → choose **Publish to GitHub public repository**

Public matters: Pages on a private repo requires GitHub Pro or an org plan. Name
it `start-list`.

If VS Code hasn't been signed in before, it opens a browser to authorise —
accept and it'll come back on its own.

**Confirm `package.json` and `pipeline/data/events.json` are in the commit.**
`package.json` is not optional: it contains `"type": "module"`, without which
Node refuses the pipeline's `import` statements and the very first crawl dies
with a syntax error.

### 2.3 Turn Pages on

This part is browser-only — VS Code has no UI for repo settings. On
github.com → your repo → **Settings** → **Pages** → *Build and deployment*:

- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)` → **Save**

No build step, no Pages workflow, no Jekyll config — it's all plain static
files. After a minute the URL appears at the top of that same page:
`https://<you>.github.io/start-list/`.

### 2.4 What loads what

`index.html` is a one-line forwarder to `Start List.dc.html`, which is the real
page. It exists because Pages serves `index.html` at the directory root, and
keeping the design in one file means never syncing two copies.

`Start List.dc.html` pulls in `support.js`, `events.js`, `MapView.jsx`, and
`image-slot.js` by relative path. d3 and topojson come from unpkg over HTTPS
with SRI hashes; everything else is local.

`Start List (standalone).html` is the frozen, fully-inlined copy — one file you
can email, with `events.js` baked in. The pipeline does **not** update it. Treat
it as a snapshot.

**Previewing locally:** double-clicking `index.html` will *not* work — `file://`
blocks the module and `.jsx` fetches. Use the **Live Server** extension (right
click `index.html` → *Open with Live Server*), or in the VS Code terminal:

```bash
npx serve .
```

### 2.5 Custom domain (optional)

Settings → Pages → *Custom domain*, enter e.g. `startlist.cc`, and at your DNS
provider add `CNAME startlist.cc → <you>.github.io`. GitHub commits a `CNAME`
file into the repo — pull it down in VS Code afterwards so your local copy
matches. Tick **Enforce HTTPS** once the certificate provisions.

---

## Part 3 — Turn on continuous discovery

### 3.1 Put a real contact address in the User-Agent

In VS Code open `pipeline/run.js`, around line 33:

```js
const UA = 'StartListBot/1.0 (personal cycling event index; contact: you@example.com)';
```

Replace `you@example.com` with an address you read. This is the convention for
crawlers, and it's what a race organiser will use to ask you to stop rather than
just blocking you. Do it before the first live run. Commit and sync.

### 3.2 Add the Anthropic API key as a repository secret

Browser again: repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**:

- **Name:** `ANTHROPIC_API_KEY` (exact spelling — the workflow reads this name)
- **Value:** your key from console.anthropic.com

Nothing else to wire up; `discover.yml` already passes it through as an env var.
Without the key the crawl still runs, but `enrich.js` is skipped, records arrive
thin, score below the 0.7 confidence threshold, and land in the review queue
instead of on the site. Nothing breaks — you just get less.

Cost is small: enrichment is one call per *newly discovered or changed* event,
not per event in the store. A typical weekly run is a handful of calls.

### 3.3 Allow Actions to open pull requests

Repo → **Settings** → **Actions** → **General** → *Workflow permissions*:

- **Read and write permissions**
- ✅ **Allow GitHub Actions to create and approve pull requests**

That second checkbox is off by default and is the most common reason
`peter-evans/create-pull-request` fails with a 403. The workflow's own
`permissions:` block grants the token what it needs, but the repo-level setting
still has to permit PR creation.

### 3.4 Test it locally first — much faster than Actions

You have Node and a terminal right there; use them before burning CI runs.
Requires **Node 20+** (`node -v`).

Make a `.env` at the root (already gitignored from 2.1):

```
ANTHROPIC_API_KEY=sk-ant-…
```

Then in the VS Code terminal (`` Ctrl+` ``):

```bash
node --env-file=.env pipeline/run.js --dry --months 18
```

`--dry` crawls and reports but writes nothing. There are no dependencies to
install — the pipeline uses only Node builtins and the global `fetch`.

What you want to see:

```
· jsonld
  N candidate(s)
· bikereg
  0 candidate(s)          ← expected; it is a stub
```

then the merge report, then `Dry run — nothing written.`

Common outcomes:

- **`! <url>: 403` / `404`** — that site blocks bots or moved. Remove it from
  the watchlist.
- **`0 candidate(s)` from jsonld everywhere** — the watchlist sites don't
  publish schema.org markup, or publish it client-side (the crawler reads raw
  HTML, not rendered pages). See 3.6.
- **Syntax error on `import`** — `package.json` is missing or lacks
  `"type": "module"`.

To test the full write path locally, drop `--dry`. It rewrites `events.js` and
`pipeline/data/events.json` in your working copy — which you can then inspect in
VS Code's diff view and **Discard Changes** if you don't like it. That's the
safest place to iterate on the watchlist and enrichment prompts.

### 3.5 First run on Actions

Repo → **Actions** → **Discover races** → **Run workflow**, `dry` unticked.

It opens a PR titled *Crawl N — event index update*, with the full run log as
the PR body and a diff touching `events.js`, `pipeline/data/events.json`, and
`pipeline/reports/`. With the GitHub Pull Requests extension installed, that PR
shows up in your VS Code sidebar and you can review the diff without leaving the
editor.

**Review the diff, not the log.** The log says what it did; the diff says what
it got wrong. Read `pipeline/data/events.json` — it's the source of truth and
it's readable JSON. Watch for: dates off by a year (a common JSON-LD failure
where a site left last edition's markup up), costs read from the wrong ticket
tier, and elevation or surface numbers that appeared from nowhere.

Merge the PR, then **Sync Changes** in VS Code to pull it into your local copy.
Pages redeploys within a minute or two.

After that the cron runs **Mondays, 11:00 UTC**. Change it in
`.github/workflows/discover.yml`:

```yaml
    - cron: '0 11 * * 1'    # min hour day-of-month month day-of-week
```

GitHub disables scheduled workflows in repos with no activity for 60 days; it
emails first, and any push or manual run re-arms it.

### 3.6 Growing coverage — the part that actually matters

Everything above is one-time setup. This is the ongoing work.

`pipeline/sources/jsonld.js` has a `WATCHLIST` array, currently seeded with
seven URLs. Adding good URLs to it is the highest-leverage thing you can do —
the adapter is generic, reading `schema.org/Event` markup with no site-specific
selectors, so it survives redesigns.

**Before adding a site, check two things:**

1. **Does it publish JSON-LD?** Open an event page, View Source (not Inspect —
   you need the raw HTML the server sends), and search for
   `application/ld+json`. If that block exists and contains `"@type": "Event"`,
   the adapter will read it. If it only shows in the Inspector, it's rendered by
   JavaScript and this crawler can't see it.
2. **Does `robots.txt` allow it?** `https://<site>/robots.txt`. Respect it.
   Requests are already throttled to one every 1.5s.

Prefer **calendar and series pages** over single event pages — one URL yielding
twenty events beats twenty yielding one each. Registration platforms and
regional gravel series pages are usually richest.

Add a URL, save, and re-run the dry crawl locally. The loop is seconds long.

For a site with no JSON-LD that you really want, write a new adapter: a module
in `pipeline/sources/` exporting
`{ id, discover({ fetchText, fetchJson, since, until, log }) }` returning
partial records, registered in the `ADAPTERS` array in `run.js`. Set
`confidence` honestly — `merge.js` uses it to resolve conflicts. `bikereg.js` is
a stub waiting for exactly this; BikeReg has no public API, so it needs
search-page parsing or a feed arrangement with them.

### 3.7 Correcting records so they stay corrected

Never edit `events.js` — it's regenerated and your edit vanishes on the next
run. Edit `pipeline/data/events.json` and add the field name to that record's
`pinned` array:

```json
{ "id": "unbound", "cost": [190, 340], "pinned": ["cost", "cutoff"] }
```

Pinned fields are never overwritten by any source at any confidence.

`"verified": true` is the softer version: a human confirmed it, so the crawler
will only update `date`, `deadline`, `cost`, and `url` on that record — never
the course details.

Records below 0.7 confidence get `needsReview: true` and are excluded from
`events.js` entirely. To publish one, confirm it by hand, raise its confidence
or set `verified: true`, and clear `needsReview`.

### 3.8 What to expect, honestly

Reliable at **finding new events and catching changed dates and prices** on
sites with structured markup. Unreliable at **elevation, surface mix, aid
stations, and cutoffs** — those live in prose, and the enricher is instructed to
omit rather than guess, so you'll see gaps rather than fiction. That's
deliberate: a blank field is recoverable, a confident wrong number isn't.

Budget ten minutes a week on the PR. The realistic split is most of discovery
automated, final course details confirmed by hand.

---

## Everyday VS Code loop

| Task | Where |
| --- | --- |
| Edit the design | `Start List.dc.html` |
| Fix an event permanently | `pipeline/data/events.json` + `pinned` |
| Add a source site | `WATCHLIST` in `pipeline/sources/jsonld.js` |
| Test a crawl | `node --env-file=.env pipeline/run.js --dry` |
| Publish an edit | Source Control → Commit → **Sync Changes** |
| Review a crawl | PR in the GitHub sidebar, or on github.com |

Every push to `main` redeploys Pages automatically. There's no deploy command.

---

## Checklist

- [ ] Project downloaded, unzipped, opened as a folder in VS Code
- [ ] `.github/workflows/discover.yml` present in the Explorer
- [ ] `.gitignore` created
- [ ] Initialize Repository → Commit → Publish to GitHub **public** repository
- [ ] `package.json` in the commit (`"type": "module"`)
- [ ] Settings → Pages → `main` / root; site loads at the Pages URL
- [ ] Real contact address in `UA` in `pipeline/run.js`
- [ ] `ANTHROPIC_API_KEY` added as an Actions secret
- [ ] Settings → Actions → read/write + allow PR creation
- [ ] Local dry run passes and jsonld returns candidates
- [ ] First Actions run reviewed and merged
- [ ] Watchlist grown past the seed set
