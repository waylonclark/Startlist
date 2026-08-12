// Adapter contract.
//
// An adapter is: { id, async discover({ since, until, fetchText, fetchJson }) -> Partial<Record>[] }
//
// Return whatever you can extract confidently and leave the rest undefined —
// enrich.js fills gaps and merge.js decides what wins. Always set `confidence`
// honestly: structured feeds ~0.85, JSON-LD ~0.8, HTML scraping ~0.5.
//
// Register adapters in run.js. Order does not matter; merge handles conflicts.

export const SOURCES = [
  { id: 'runsignup', module: './runsignup.js', note: 'open REST feed, no auth — highest yield by far' },
  { id: 'jsonld', module: './jsonld.js', note: 'schema.org Event markup — rare on organiser sites; low yield' },
  { id: 'bikereg', module: './bikereg.js', note: 'registration platform listing (needs a real endpoint or scrape)' },
];

export function makeFetchers({ userAgent, delayMs = 1500 }) {
  let queue = Promise.resolve();
  const throttled = (fn) => {
    queue = queue.then(() => new Promise((r) => setTimeout(r, delayMs)));
    return queue.then(fn);
  };
  const headers = { 'User-Agent': userAgent, Accept: 'text/html,application/json' };
  return {
    fetchText: (url) => throttled(async () => {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.text();
    }),
    fetchJson: (url) => throttled(async () => {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.json();
    }),
  };
}
