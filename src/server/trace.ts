// The trace endpoint — B53, `DESIGN.md` §10.2, and **P12**.
//
// ** READ-ONLY. ** Nothing here writes anything (D7: only `apply()` writes a projection). It reads
// raw `signals` through `replay()` and `rollup_minute` through the ordinary read path, and it
// compares them.
//
// **The two routes have to be different code, and they are.** §10.2:
//
//   "The display reads `rollup_minute`, built incrementally at ingest (D29). The check reads raw
//    and recomputes from zero. They are two independent routes to the same number, which is the
//    only arrangement in which 'and they agree' means anything."
//
// So: `displayed` comes from the rollup, exactly as the snapshot computed it — the same
// `readTotals` path, the same SQL, so it is genuinely the number that was on screen and not a
// second opinion about it. `recomputed` comes from `replay()`, which reads `signals` and nothing
// else and re-derives attribution over the log prefix. `verdict` is the comparison, and it is put
// on screen rather than asserted in a test, because the brief asks us to *demonstrate* the claim.
//
// **Why the descriptor must be verified and not merely parsed.** D34's quarantine is that a client
// cannot mint a descriptor. If this endpoint answered any well-shaped body, a client could ask for
// (and render) a number it had constructed the query for — the signature is what makes "the server
// issued this question" a fact rather than a hope.

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { replayIn, type ReplayContribution, type ReplayCounts } from './replay.ts';
import { narrows, sign, verify } from './descriptor.ts';
import type { TraceDescriptor, TraceEvidence } from '../shared/wire.ts';
import { metricValue, type MetricCounts, type MetricKey } from '../shared/metrics.ts';
import { floorMinute } from '../shared/time.ts';

/** The rollup-side answer: what the screen said, read back by the display path. */
const DISPLAYED_SQL = `
  SELECT COALESCE(SUM(impressions), 0)             AS impressions,
         COALESCE(SUM(clicks), 0)                  AS clicks,
         COALESCE(SUM(click_cost_cents), 0)        AS click_cost_cents,
         COALESCE(SUM(spend_cents), 0)             AS spend_cents,
         COALESCE(SUM(conversions), 0)             AS conversions,
         COALESCE(SUM(value_cents), 0)             AS value_cents,
         COALESCE(SUM(provisional_conversions), 0) AS provisional_conversions,
         COALESCE(SUM(provisional_value_cents), 0) AS provisional_value_cents,
         COUNT(*)                                  AS buckets
    FROM rollup_minute
   WHERE ad_id = ? AND minute_start >= ? AND minute_start < ?`;

/**
 * The events that produced the number, in log order, **with `cents` as an integer** — D34's
 * `TraceEvidence`, the payload type that is summable on purpose.
 *
 * `credited_minute` is read from `conversion_attribution` rather than derived here, and that is
 * deliberate: it is the projection's own answer to "which minute did this land in", so a reviewer
 * comparing the evidence list against the bucket is comparing the two things that must agree. For
 * a non-conversion the credited minute IS the event's own minute (D27-B applies to conversions
 * alone), so it is floored from `ts_effective`.
 */
const EVIDENCE_SQL = `
  SELECT s.event_id, s.ts_effective, s.received_at, s.ad_id, s.kind, s.ingest_seq,
         s.cost_cents, s.amount_cents, s.value_cents, a.credited_minute
    FROM signals s
    LEFT JOIN conversion_attribution a ON a.event_id = s.event_id
   WHERE s.event_id = ?`;

type EvidenceRow = {
  event_id: string;
  ts_effective: string;
  received_at: string;
  ad_id: string;
  kind: string;
  ingest_seq: number;
  cost_cents: number | null;
  amount_cents: number | null;
  value_cents: number | null;
  credited_minute: string | null;
};

/** One grain of the descriptor's window — the rows the panel offers as the next click down. */
export type TraceSlice = {
  from: string;
  to: string;
  /** The displayed value for this slice, from the rollup. `null` where the ratio is undefined. */
  value: number | null;
};

export type TraceResult = {
  /**
   * The descriptor this answer is for. **Re-issued, not echoed**, whenever the request narrowed or
   * moved `as_of` — so the panel's next click is a legal descriptor rather than a hand-edit of the
   * one it arrived with, and the drill-down stays inside the same gate as the headline.
   */
  descriptor: TraceDescriptor;
  /** From `rollup_minute` — the display path. This is the number that was on screen. */
  displayed: number | null;
  /** From `replay()` over raw `signals` — the independent path. */
  recomputed: number | null;
  /** The comparison, and the whole point of the surface. */
  verdict: 'MATCH' | 'MISMATCH';
  /** Both count sets, so a MISMATCH says WHICH term diverged rather than only that one did. */
  displayed_counts: ReplayCounts & { buckets: number };
  recomputed_counts: ReplayCounts;
  /**
   * The events `replay()` counted — **conversions first, then the rest, each tier in log order**,
   * capped. See `sample()` for why the ordering is not simply the log's.
   */
  evidence: TraceEvidence[];
  /** Contributing events beyond the cap — a truncated list must say it is truncated. */
  evidence_omitted: number;
  /** The window broken into the descriptor's own grain, for the next click down (D46). */
  slices: TraceSlice[];
  slices_omitted: number;
};

/**
 * The evidence cap. A 7-day window on the whole portfolio contributes ~1.6M events, and a response
 * that tried to list them would be a denial of service on the browser rather than a walk-back.
 * The count is always reported in full (`evidence_omitted`), so the cap truncates the LIST and
 * never the claim.
 */
const EVIDENCE_CAP = 400;

/**
 * **Conversions first, then everything else — and this was measured, not guessed.**
 *
 * In log order, the first 400 of `a_03`'s 10,481 contributors over a 6-hour window were *all
 * impressions*: not one conversion made the cap. The panel showed a ROAS of 10.2 above a list of
 * events containing nothing that produced any revenue. Every number was correct and the evidence
 * was worthless — which is exactly G14's newest-first sweep sample, in a different surface.
 *
 * So the sample is filled by interest, not by position: conversions (the rows carrying D27-B's
 * whole point — a timestamp in one place and a credited minute in another), then the rest, each
 * tier still in log order. There are at most a few dozen conversions in any window a human clicks
 * on, so this costs nothing and the ordering inside each tier is unchanged.
 */
function sample(contributing: readonly ReplayContribution[]): ReplayContribution[] {
  const conversions = contributing.filter((c) => c.kind === 'conversion');
  const rest = contributing.filter((c) => c.kind !== 'conversion');
  return [...conversions, ...rest].slice(0, EVIDENCE_CAP);
}
/** The window at the minute grain over 7 days is 10,080 slices; the panel shows a page of them. */
const SLICE_CAP = 200;

/** `metricValue` over a count set, for the six with a display unit plus §10.1's other two. */
function valueOf(metric: TraceDescriptor['metric'], counts: MetricCounts): number | null {
  if (metric === 'conversions') return counts.conversions;
  if (metric === 'value_cents') return counts.value_cents;
  return metricValue(metric as MetricKey, counts);
}

const ZERO: ReplayCounts = {
  impressions: 0, clicks: 0, click_cost_cents: 0, spend_cents: 0,
  conversions: 0, value_cents: 0, provisional_conversions: 0, provisional_value_cents: 0,
};

function add(a: ReplayCounts, b: ReplayCounts): ReplayCounts {
  return {
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    click_cost_cents: a.click_cost_cents + b.click_cost_cents,
    spend_cents: a.spend_cents + b.spend_cents,
    conversions: a.conversions + b.conversions,
    value_cents: a.value_cents + b.value_cents,
    provisional_conversions: a.provisional_conversions + b.provisional_conversions,
    provisional_value_cents: a.provisional_value_cents + b.provisional_value_cents,
  };
}

/**
 * Are two values the same number? **Not `===`** — CTR, CPA and ROAS are divisions of integers, and
 * the two paths sum their integers in different orders (SQL's `SUM` per ad, then JS addition here;
 * `replay()`'s per-event accumulation there). IEEE-754 addition is not associative, so two
 * arithmetically identical routes can differ in the last bit, and a strict compare would report
 * MISMATCH on a store that is perfectly correct — the false alarm that destroys the surface's
 * value faster than a missed one would.
 *
 * A relative tolerance of 1e-12 is about four orders of magnitude tighter than any error that
 * could come from a real divergence: one missing conversion out of ten thousand moves CPA by 1e-4.
 * The COUNTS are compared exactly, below, and they are what a real divergence moves first.
 */
function agrees(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  if (a === b) return true;
  return Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b));
}

function countsAgree(a: ReplayCounts, b: ReplayCounts): boolean {
  return (Object.keys(ZERO) as (keyof ReplayCounts)[]).every((k) => a[k] === b[k]);
}

/**
 * Answer one descriptor: read the display path, recompute from raw, compare, and hand back the
 * evidence.
 *
 * Every read is in ONE transaction. The two paths must see one instant, or a conversion landing
 * between them reports a MISMATCH that is a race rather than a divergence — the exact false alarm
 * this surface cannot afford.
 */
export function trace(db: DatabaseSync, descriptor: TraceDescriptor): TraceResult {
  return readTx(db, () => {
    const displayedStmt = db.prepare(DISPLAYED_SQL);
    const evidenceStmt = db.prepare(EVIDENCE_SQL);

    let displayedCounts = ZERO;
    let buckets = 0;
    let recomputedCounts = ZERO;
    const contributing: ReplayContribution[] = [];

    // Per ad, because `replay()` answers one ad at a time (I8/G30 makes the CLICK authoritative,
    // so "this ad's conversions" is a question about clicks and cannot be asked of a set in one
    // pass). Summing per-ad counts and dividing once at the end is D10's order, unchanged: a
    // combined CTR is SUM(clicks)/SUM(impressions), never a mean of per-ad CTRs.
    for (const ad_id of descriptor.ad_ids) {
      const row = displayedStmt.get(ad_id, descriptor.from, descriptor.to) as unknown as
        ReplayCounts & { buckets: number };
      displayedCounts = add(displayedCounts, row);
      buckets += row.buckets;

      // `replayIn`, not `replay`: this whole function is already one read transaction, and the
      // rollup read above and this raw re-derivation must see the same instant.
      const result = replayIn(db, {
        ad_id,
        from: descriptor.from,
        to: descriptor.to,
        as_of_ingest_seq: descriptor.as_of_ingest_seq,
      });
      recomputedCounts = add(recomputedCounts, result.counts);
      contributing.push(...result.contributing);
    }

    const displayed = valueOf(descriptor.metric, displayedCounts);
    const recomputed = valueOf(descriptor.metric, recomputedCounts);

    // **Both tests, and the counts are the strict one.** A ratio can agree while its terms do not
    // (2/4 and 3/6 are both 0.5), so comparing only the displayed metric would let a real
    // divergence through whenever it moved numerator and denominator together. The counts are
    // integers from two independent routes and there is no reason for them to differ at all.
    const verdict =
      agrees(displayed, recomputed) && countsAgree(displayedCounts, recomputedCounts)
        ? 'MATCH'
        : 'MISMATCH';

    const evidence: TraceEvidence[] = [];
    for (const contribution of sample(contributing)) {
      const row = evidenceStmt.get(contribution.event_id) as unknown as EvidenceRow | undefined;
      if (row === undefined) continue;
      evidence.push({
        event_id: row.event_id,
        ts: row.ts_effective,
        received_at: row.received_at,
        ad_id: row.ad_id,
        kind: row.kind,
        cents: row.cost_cents ?? row.amount_cents ?? row.value_cents,
        credited_minute: row.credited_minute ?? floorMinute(row.ts_effective),
        ingest_seq: row.ingest_seq,
      });
    }

    return {
      descriptor,
      displayed,
      recomputed,
      verdict,
      displayed_counts: { ...displayedCounts, buckets },
      recomputed_counts: recomputedCounts,
      evidence,
      evidence_omitted: Math.max(0, contributing.length - evidence.length),
      ...sliceWindow(descriptor, displayedStmt),
    };
  });
}

/**
 * The window at the descriptor's own grain — **the next click down, and the D46 rule made visible**.
 *
 * These are the ranges `narrows()` will accept, computed by the same arithmetic, so the panel
 * cannot offer a slice the endpoint would refuse. Values come from the rollup (the display path);
 * clicking one re-runs the whole comparison narrowed to it, which is what makes "click a bucket's
 * ROAS" a walk-back rather than a second summary.
 *
 * A slice with nothing in it is dropped rather than listed as zero: the list is an index of where
 * the evidence IS, and 10,000 empty minutes between two busy ones would bury it.
 */
function sliceWindow(
  d: TraceDescriptor,
  displayedStmt: ReturnType<DatabaseSync['prepare']>,
): { slices: TraceSlice[]; slices_omitted: number } {
  const grainMs = d.granularity_s * 1_000;
  const fromMs = Date.parse(d.from);
  const toMs = Date.parse(d.to);
  // One grain wide already — there is nothing to narrow into, and offering the window itself as
  // its own slice would be a click that changes nothing.
  if (toMs - fromMs <= grainMs) return { slices: [], slices_omitted: 0 };

  const slices: TraceSlice[] = [];
  let found = 0;
  for (let t = fromMs; t < toMs; t += grainMs) {
    const from = new Date(t).toISOString();
    const to = new Date(Math.min(t + grainMs, toMs)).toISOString();
    // A trailing partial grain cannot be narrowed into (`narrows()` requires exactly one grain),
    // so it is not offered. It can only occur when the window is not a whole number of grains.
    if (Date.parse(to) - t !== grainMs) continue;
    let counts = ZERO;
    let any = false;
    for (const ad_id of d.ad_ids) {
      const row = displayedStmt.get(ad_id, from, to) as unknown as ReplayCounts & { buckets: number };
      if (row.buckets > 0) any = true;
      counts = add(counts, row);
    }
    if (!any) continue;
    found += 1;
    if (slices.length < SLICE_CAP) slices.push({ from, to, value: valueOf(d.metric, counts) });
  }
  return { slices, slices_omitted: found - slices.length };
}

export type TraceRequest =
  | { ok: true; descriptor: TraceDescriptor }
  | { ok: false; status: number; error: string; message: string };

/**
 * Parse and authorise a `POST /api/trace` body: `{ descriptor, from?, to?, as_of_ingest_seq? }`.
 *
 * The two optional moves — narrowing the window, and rewinding the log position (B54) — both
 * produce a **newly signed** descriptor rather than a mutated one. That is the only arrangement in
 * which the client never holds a descriptor the server did not issue, which is D34's whole
 * mechanism; and it means the response's descriptor can be clicked again without a second protocol.
 */
export function parseTraceRequest(body: unknown): TraceRequest {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, error: 'bad_request', message: 'expected a JSON object' };
  }
  const req = body as Record<string, unknown>;
  const descriptor = verify(req['descriptor']);
  if (descriptor === null) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_signature',
      message:
        'this descriptor was not issued by this server (or has been altered). Descriptors are ' +
        'minted per process — after a restart, refresh the page to get current ones.',
    };
  }

  let next = descriptor;

  const from = req['from'];
  const to = req['to'];
  if (from !== undefined || to !== undefined) {
    if (typeof from !== 'string' || typeof to !== 'string') {
      return { ok: false, status: 400, error: 'bad_request', message: 'from and to must be given together, as strings' };
    }
    const why = narrows(descriptor, from, to);
    if (why !== null) {
      // **D46 consequence 3's refusal.** Not a clamp and not a best effort: a narrowing at the
      // wrong grain is a different question, and answering it would produce a real number that
      // fails against the displayed figure for a reason that is not corruption.
      return { ok: false, status: 400, error: 'illegal_narrowing', message: why };
    }
    next = sign({ ...next, from, to });
  }

  const asOf = req['as_of_ingest_seq'];
  if (asOf !== undefined) {
    if (typeof asOf !== 'number' || !Number.isInteger(asOf) || asOf < 0) {
      return { ok: false, status: 400, error: 'bad_request', message: 'as_of_ingest_seq must be a non-negative integer' };
    }
    next = sign({ ...next, as_of_ingest_seq: asOf });
  }

  return { ok: true, descriptor: next };
}
