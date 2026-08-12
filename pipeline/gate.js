// Quality gate — runs after discovery, before enrichment.
//
// Open feeds are indiscriminate: RunSignup's cycling event types are attached to
// turkey trots, charity walks, expos, and triathlon festivals because those
// events happen to include a bike component. Letting them through wastes an
// Anthropic call each and buries the real races in the review queue.
//
// The gate does two jobs:
//   1. REJECT what is not a destination cycling event at all
//   2. TAG what passes, so the site can filter (charity rides stay, but labelled)
//
// It is deliberately blunt on rejection. Cheaper to drop a real event and re-add
// it by hand (see add.js) than to hand-remove a hundred 5Ks every week.

// Races clear 40. Non-competitive rides have to be a real destination distance
// before they earn a slot — a 40mi charity tour is a local Sunday, a metric
// century is something you drive to.
const MIN_MILES = 40;
const NONRACE_MIN_MILES = 62;

// decodeEntities now lives in schema.js so coerce() can use it too.
import { decodeEntities } from './schema.js';
export { decodeEntities };

// Names that are never a bike race, whatever the feed says.
const NEVER = [
  /\b\d+\s?[kK]\b/,                      // 5K, 10K — running distances
  /\bhalf marathon\b|\bmarathon\b/i,
  /\bturkey trot\b|\bfun run\b|\bcolor run\b/i,
  /\bbuddy walk\b|\bmemory walk\b|\bwalk-?a-?thon\b/i,
  /\btransportation\b|\bshuttle\b|\bparking\b|\bpacket pick/i,
  /\btest page\b|\bdemo\b|\bsandbox\b/i,
  /\bexpo\b|\bfestival\b(?!.*\bgravel\b)/i,
  /\btriathlon\b|\bduathlon\b|\baquabike\b|\bmultisport\b/i,
  /\btraining program\b|\bclinic\b|\btraining camp\b|\bbike camp\b|\bskills camp\b/i,
  /\bvirtual\b/i,
  /\bkid'?s?\b|\bkiddie\b|\btot trot\b/i,
  /\brow\b|\bpaddle\b|\bswim\b/i,
  /\bpostponed\b|\bcancell?ed\b/i,
  /\bolympics\b|\bsenior games\b|\bstate games\b/i,
  /\btrail race\b|\btrail run\b|\bultra\b|\btrek\b/i,
  // Any event that also walks. A ride with a walk leg is a fundraiser day out,
  // not a bike event, however far the long route goes.
  /\bwalk\b|\bstroll\b|\bruck\b/i,
  // Novelty and skills events that carry "race" in the name but aren't distance
  // events: slow races, bike rodeos, kids' events, poker runs.
  /\bslow (bike )?race\b|\brodeo\b|\bparade\b|\bkids?\b|\bfun race\b|\bpoker run\b/i,
];

// A run leg is only disqualifying when nothing else says bike race — plenty of
// legitimate gravel weekends bolt a trail run onto the same weekend.
const RUN_LEG = /\brun\b|\bfoot race\b|\b(5|10)k\b/i;

// Recurring club nights, training rides, and social spins. These are calendar
// entries for locals, not events anyone travels to. The date/time patterns catch
// the series listings that name themselves by when they happen.
const SOCIAL = [
  /\b(social|club|group|training|shop|weekly|monthly|no-?drop|coffee|taco|donut|beer)\s+ride\b/i,
  /\bride\s+(night|series)\b/i,
  /\bgroup\s+(run|ride|spin)\b/i,
  /\bopen\s+shop\b|\bbike\s+night\b|\bladies'?\s+night\b/i,
  // "Sept 3 - Social Ride Blodgett 5:30 pm", "• August 23 Training Ride •"
  /^\W*\d{1,2}\/\d{1,2}\b/,
  /^\W*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i,
  /\bevery\s+(mon|tue|wed|thu|fri|sat|sun)/i,
];

// Positive signals — a name that reads like cycling.
const CYCLING = /\b(gravel|grinder|fondo|granfondo|century|double century|cyclo|crit|criterium|classic|omnium|road race|stage race|bike|bicycle|cycling|cycle|ride|tour|pedal|spin|dirty|chunky|grind)\b/i;

// Weak cycling words that alone do not qualify.
const WEAK = /^(ride|tour|pedal|spin|cycle|bike)\b/i;

const STRONG = /\b(gravel|grinder|fondo|granfondo|century|cyclo|crit|criterium|omnium|stage race|road race|double)\b/i;

// Fundraiser signals. These no longer reject — they tag. A charity century is a
// real ride someone might travel for; it just isn't a race, and the site should
// say so rather than pretend otherwise.
const CHARITY = /\b(benefit|benefitting|charity|fundrais\w*|pledge|donation|cure|cancer|hospice|awareness|memorial|in memory|tour de cure|pelotonia|velosano|rotary|lions club|kiwanis|foundation|for a cause|ride for|pedal for|cycling for|bike to (cure|hope)|st\.? jude|mda|als|ms\b)/i;

// Competitive signals — timing, results, categories. A charity event carrying
// these is a race with a cause attached, and keeps the race framing.
const COMPETITIVE = /\b(race|racing|championship|champs|series|omnium|crit|criterium|time trial|\btt\b|category|cat \d|usac|usa cycling|podium|results|timed|chip[- ]timed|state champ)\b/i;

// A weekly series lists every round as its own entry ("Wednesday Night Mountain
// Bike Race Series #1..#9"). They are one event to a rider deciding where to
// travel, so keep the first round and fold the rest into it.
const SERIES_ROUND = /\s*[-–—:]?\s*(?:#|no\.?\s*|round\s*|race\s*|week\s*|event\s*|stage\s*)\d+\s*$/i;

export function seriesKey(name) {
  const base = String(name || '').trim();
  return SERIES_ROUND.test(base) ? base.replace(SERIES_ROUND, '').trim() : null;
}

export function collapseSeries(records, { log } = {}) {
  const out = [], byKey = new Map();
  for (const rec of records) {
    const key = seriesKey(rec.name);
    if (!key) { out.push(rec); continue; }
    const seen = byKey.get(`${key}|${rec.state}`);
    if (!seen) {
      const first = { ...rec, name: key, seriesRounds: 1 };
      byKey.set(`${key}|${rec.state}`, first);
      out.push(first);
    } else {
      seen.seriesRounds++;
      // The series runs until its last round; that is the useful end date.
      if (rec.date && (!seen.endDate || rec.date > seen.endDate)) seen.endDate = rec.date;
      if (rec.date && rec.date < seen.date) seen.date = rec.date;
    }
  }
  for (const rec of byKey.values()) {
    if (rec.seriesRounds > 1) {
      rec.tags = [...new Set([...(rec.tags || []), 'series'])];
      log?.(`  · collapsed ${rec.seriesRounds} rounds into "${rec.name}"`);
    } else delete rec.seriesRounds;
  }
  return out;
}

export function gate(rec) {
  const name = decodeEntities(rec.name);
  if (!name) return { reject: 'no name' };

  for (const re of NEVER) {
    if (re.test(name)) return { reject: `name matches ${re}` };
  }
  for (const re of SOCIAL) {
    if (re.test(name)) return { reject: `club or social ride` };
  }

  if (!rec.type) return { reject: 'no discipline' };
  if (!rec.date) return { reject: 'no date' };

  // Distance is the single best filter we have from the feed.
  const longest = Array.isArray(rec.dist) ? Math.max(...rec.dist) : undefined;
  if (longest !== undefined && longest < MIN_MILES) {
    return { reject: `${longest}mi under ${MIN_MILES}mi floor` };
  }

  if (!CYCLING.test(name)) return { reject: 'no cycling signal in name' };

  if (RUN_LEG.test(name) && !STRONG.test(name)) {
    return { reject: 'multi-sport, no race signal' };
  }

  // A weak name with no distance evidence is almost always a charity ride, and
  // without a distance we can't even tell if it clears the floor.
  if (WEAK.test(name) && !STRONG.test(name) && longest === undefined) {
    return { reject: 'weak signal, no distance' };
  }

  const haystack = `${name} ${rec.blurb || ''} ${rec.org || ''}`;
  // One classification per event, most specific first.
  const tags = [];
  if (CHARITY.test(haystack) && !COMPETITIVE.test(haystack)) tags.push('charity');
  else if (!STRONG.test(name) && !COMPETITIVE.test(haystack)) tags.push('ride');

  // Non-race entries carry the higher bar, and must prove their distance:
  // an unstated distance on a charity tour is nearly always a short one.
  if (tags.length) {
    if (longest === undefined) return { reject: 'non-race, no distance' };
    if (longest < NONRACE_MIN_MILES) {
      return { reject: `${longest}mi under ${NONRACE_MIN_MILES}mi non-race floor` };
    }
  }

  return { reject: null, tags, name };
}

export function applyGate(records, { log } = {}) {
  const kept = [];
  const rejected = [];
  for (const r of records) {
    const { reject, tags, name } = gate(r);
    if (reject) rejected.push({ name: r.name, reason: reject });
    else kept.push({ ...r, name, ...(tags?.length ? { tags } : {}) });
  }

  if (log) {
    log(`\nGATE — kept ${kept.length}, rejected ${rejected.length}`);
    const byReason = {};
    for (const r of rejected) {
      const k = r.reason.replace(/\d+mi under \d+mi non-race floor/, 'under non-race distance floor')
                        .replace(/\d+mi under \d+mi floor/, 'under distance floor')
                        .replace(/name matches .*/, 'name pattern');
      byReason[k] = (byReason[k] || 0) + 1;
    }
    for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      log(`  ${String(n).padStart(4)} × ${reason}`);
    }
    const charity = kept.filter((r) => r.tags?.includes('charity')).length;
    const ride = kept.filter((r) => r.tags?.includes('ride')).length;
    log(`  kept breakdown: ${kept.length - charity - ride} race, ${ride} ride, ${charity} charity`);
  }

  return { kept, rejected };
}
