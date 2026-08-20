// BikeReg adapter — STUB.
//
// BikeReg has no documented public API. Two viable routes:
//   a) Their search pages render server-side HTML; parse the result rows.
//      Check robots.txt and throttle hard (the shared fetcher already does).
//   b) Ask them for feed access. Organiser-facing platforms often grant it.
//
// Fill in `discover` and it plugs into the run with no other changes.
// Set confidence around 0.85 — platform listings have reliable dates and prices
// but rarely carry elevation, surface mix, or aid-station detail.

export default {
  id: 'bikereg',
  async discover({ fetchText, since, until, log }) {
    log?.('  bikereg adapter is a stub — no records returned');
    return [];

    /* Sketch of the real implementation:

    const url = `https://www.bikereg.com/events?StartDate=${since}&EndDate=${until}&EventTypeID=...`;
    const html = await fetchText(url);
    const rows = [...html.matchAll(/<div class="event-row"[\s\S]*?<\/div>/g)];
    return rows.map((r) => ({
      name: pick(r, /class="event-name">([^<]+)/),
      date: iso(pick(r, /class="event-date">([^<]+)/)),
      city: ..., state: ..., url: ...,
      source: 'bikereg',
      confidence: 0.85,
    }));
    */
  },
};
