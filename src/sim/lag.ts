// §11's conversion lag — **D36**, a two-component mixture plus a separate reporting lag. B29.
//
// Two lags, kept apart (§11.1), because L83 conflates them and collapsing them would corrupt our
// own telemetry. Ratified in Seno's words: *"If you collapse them then `received_at − ts` becomes
// the purchase lag, which would make our own transport look like it's hours behind. That field has
// to describe us, not the buyer."*
//
//   purchase lag   click.ts → conversion.ts     the human decided later    → drives RESTATEMENT
//   reporting lag  conversion.ts → received_at  the platform told us later → is what received_at−ts measures
//
// **Keyed by `click_id` and nothing else.** §15.3(b) is explicit: the emitter re-derives each
// backfilled click's schedule from `hash(seed, 'conv_lag', click_id)` *"instead of needing a stored
// queue"*. That is what makes the `T0` handover free — the server can hand over a bare list of
// pending click ids (B31's `GET /api/sim/world`) and the emitter reconstructs every schedule from
// it. So these functions take a `click_id`, never a tick or an index, even though the caller
// generating a live click happens to know both.
//
// **Nothing here emits.** Whether a click converts at all is decided by whoever generated it
// (§10's BetaBinomial over the tick's clicks, `emit.ts`), and *when* a scheduled conversion is
// delivered needs the pending set, which is B31 and B34. This chunk is the schedule and the
// distribution check.

import { draw } from './rng.ts';
import { LAG, P_FAST } from './params.ts';

/**
 * A standard normal by Box–Muller from two keyed uniforms.
 *
 * A second copy of `emit.ts`'s private helper, deliberately not shared: the two draw from
 * different §14 streams and the shared version would have to take the stream as an argument, which
 * is how one module's key parts end up silently colliding with another's. Ten lines is cheaper
 * than that risk.
 */
function normal(seed: string, stream: string, clickId: string, part: string): number {
  const u1 = Math.max(draw(seed, stream, clickId, part, 'n1'), 2 ** -53);
  const u2 = draw(seed, stream, clickId, part, 'n2');
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * §11.1's purchase lag: the time between a click and the purchase it eventually produces.
 *
 * ```
 * with prob p_fast(temperature):  Exponential(mean 12 min)
 * otherwise:                      LogNormal(median 14 h, σ = 1.1)
 * truncated hard at 7 days -- nothing is emitted beyond it
 * ```
 *
 * **Returns `null` past the cutoff, and that is the truncation.** §11.1 says *"nothing is emitted
 * beyond it"* — the conversion does not happen, rather than being squeezed under the boundary.
 * Resampling into range would be the other reading and it is wrong for a reason worth stating: it
 * would inflate the 5–7 day bucket with conversions that the model says never occurred, which is
 * the exact region D13's 72 h horizon and P7's restatement path are judged on. It also means the
 * share of drawn conversions that are emitted at all is slightly under 1 (~1.2% of slow draws are
 * dropped), which the dry run prints rather than hides.
 */
export function purchaseLagMs(seed: string, clickId: string, temperature: string): number | null {
  const pFast = P_FAST[temperature];
  if (pFast === undefined) throw new Error(`no p_fast for ${temperature} — SIMULATOR §6, §11.1`);

  const fast = draw(seed, 'conv_lag', clickId, 'mix') < pFast;
  const lag = fast
    ? // Exponential by inverse CDF. `1 − u` rather than `u` so the draw cannot be 0 and produce
      // `log(0)`; `draw` is in [0, 1), so `1 − u` is in (0, 1].
      -LAG.fastMeanMs * Math.log(1 - draw(seed, 'conv_lag', clickId, 'exp'))
    : LAG.slowMedianMs * Math.exp(LAG.slowSigma * normal(seed, 'conv_lag', clickId, 'slow'));

  return lag > LAG.cutoffMs ? null : lag;
}

/**
 * §11.1's reporting lag: `LogNormal(median 90 s, σ = 0.9)`, plus a 2% chance of a batch straggler
 * at `Uniform(2 h, 9 h)`.
 *
 * The straggler is ADDITIVE, as §11.1 writes it (`+ with prob 0.02: …`), not a replacement — a
 * batch that runs late still carries the row's own reporting delay underneath it.
 *
 * This is the only lag `received_at − ts` can see, which is the whole of **I18**: it describes our
 * transport, not the buyer's deliberation. It is small on purpose, so a reviewer reading
 * `received_at − ts` sees seconds and not days.
 */
export function reportingLagMs(seed: string, clickId: string): number {
  const base =
    LAG.reportMedianMs * Math.exp(LAG.reportSigma * normal(seed, 'report_lag', clickId, 'base'));
  if (draw(seed, 'report_lag', clickId, 'straggler') >= LAG.stragglerProbability) return base;
  const span = LAG.stragglerMaxMs - LAG.stragglerMinMs;
  return base + LAG.stragglerMinMs + span * draw(seed, 'report_lag', clickId, 'batch');
}

export type ConversionSchedule = {
  /** When the purchase happened — the conversion's `ts`, and the minute D27-B credits it to. */
  ts: number;
  /** When we are told — the conversion's `received_at`, and when the emitter must POST it. */
  received_at: number;
  purchase_lag_ms: number;
  reporting_lag_ms: number;
};

/**
 * One click's whole schedule, or `null` if the purchase never happens inside the 7-day cutoff.
 *
 * `clickTsMs` is the click's own `ts`, not the tick that generated it, because that is what a
 * handed-over pending click carries (B31). Under **D27-B** the conversion lands in its *click's*
 * minute — up to seven days back — so `ts` here is what decides which bucket gets rewritten, and
 * `received_at` is what decides whether that bucket was already settled when it happened. §11.3:
 * that is the brief's own L83 sentence describing what our system does.
 */
export function scheduleFor(
  seed: string,
  clickId: string,
  clickTsMs: number,
  temperature: string,
): ConversionSchedule | null {
  const purchase = purchaseLagMs(seed, clickId, temperature);
  if (purchase === null) return null;
  const reporting = reportingLagMs(seed, clickId);
  const ts = clickTsMs + purchase;
  return {
    ts,
    received_at: ts + reporting,
    purchase_lag_ms: purchase,
    reporting_lag_ms: reporting,
  };
}
