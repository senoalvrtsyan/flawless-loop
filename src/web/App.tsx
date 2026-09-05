// The client shell. B08 fetched the snapshot and rendered one number; B10b makes it LIVE —
// snapshot, then subscribe from its cursor, then merge absolute rows as they arrive (§3.1 1-4).
//
// **The number is a bucket's own `impressions`, taken verbatim from the server. It is not a sum.**
// Not because client arithmetic is forbidden — **D46** permits it — but because of what a total
// would have to be attached to: §10.1's `TraceDescriptor` rides on values the SERVER sends, so a
// total invented in this file would carry no descriptor, and B52's `<Metric>` is structurally
// unable to render an undescribed number (D34's quarantine). B07 puts no total on the wire; B38
// adds server-computed, signed totals and ratios, and from then on the client may re-bucket them
// to display granularity **under the same server-issued descriptor**. Until then a row is the only
// honest number to show.
//
// (§10.2's "the walk-back would compare the client to itself" is NOT the argument here. It is
// about the rejected **D30-A** — the client aggregating RAW events. Reading it as a ban on all
// client arithmetic is the misreading D46 exists to settle.)
//
// **B36 gives it a shell and a stylesheet** (D45 option A: one plain `app.css`, semantic custom
// properties, one theme). The viewport — window, granularity, selected ads — lives HERE and nowhere
// durable: `DESIGN.md` §3's persistence boundary puts it in column 1, so closing the browser loses
// exactly which ads were selected and nothing else. No `localStorage`, deliberately.

import { useCallback, useEffect, useRef, useState } from 'react';
// Type-only, therefore erased at build time — no server module, and no `node:sqlite`, reaches the
// bundle. The wire types' permanent home is `src/shared/wire.ts`, which B44/B51 create; importing
// them across the boundary until then beats moving an approved file in a chunk about the client.
import type { AdRow, GenerationRow, Snapshot, TotalsResponse } from '../server/snapshot.ts';
import type { RestatementEntry } from '../server/restatements.ts';
import type { TailFrame, TraceDescriptor } from '../shared/wire.ts';
import type { FatigueReport } from '../server/fatigue-flag.ts';
import type { ComponentRow } from '../server/components.ts';
import type { Decision } from '../shared/decisions.ts';
import {
  applyRows,
  createStore,
  latestBucket,
  minutesRolled,
  rollWindow,
  type BucketStore,
} from './store.ts';
import { subscribe } from './stream.ts';
import { planChart, rungLabel } from './gate.ts';
import { METRIC_GLOSSARY, METRIC_LABELS, glossFor } from './metrics.ts';
import { RATIO_METRICS, type MetricKey } from '../shared/metrics.ts';
import {
  METRIC_NOTES_SHORT,
  combined,
  fetchFatigue,
  fetchRestatements,
  fetchScores,
  fetchSweep,
  fetchTotals,
  formatCents,
  formatCount,
  perAd,
} from './metrics.ts';
import { Drilldown } from './Drilldown.tsx';
import { EventTrace } from './EventTrace.tsx';
import { Metric, MetricCell } from './Metric.tsx';
import { Portfolio } from './Portfolio.tsx';
import { Chart } from './Chart.tsx';
import { Maturity } from './Maturity.tsx';
import { Timeline } from './Timeline.tsx';
import { Tail } from './Tail.tsx';
import { FatigueFlag } from './FatigueFlag.tsx';
import { Components } from './Components.tsx';
import { Console, fetchComponents } from './Console.tsx';
import { DecisionLog } from './DecisionLog.tsx';
import { boundariesIn } from './generations.ts';
import { Horizon } from './Horizon.tsx';
import { Scenarios, fetchScenarios } from './Scenarios.tsx';
import type { ScenarioRow } from '../server/sim-scenario.ts';
// Runtime import, and it must stay importable in the browser: `settlement.ts` is deliberately free
// of `node:sqlite` so the client can re-derive a streamed row's state at a swept horizon with the
// SAME function the server stamps with, rather than a second copy of the rule (B49).
import { bucketState } from '../server/settlement.ts';
import { HORIZON_MS, SCORING_WINDOW_H, WINDOW_CHOICES_H } from '../shared/config.ts';
import type { SweepResult } from '../server/sweep.ts';
import type { DecisionScore } from '../server/scoring.ts';
import type { ScoresResponse } from './metrics.ts';
import './app.css';

/** The window choices. Minutes, because that is the bucket unit the store speaks (D28). */
/** One allocation, so a render with no scores yet does not mint a new empty Map every pass. */
const EMPTY_SCORES: ReadonlyMap<string, DecisionScore> = new Map();

const WINDOWS = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1_440 },
  { label: '7d', minutes: 10_080 },
] as const;

/**
 * Display granularity — **viewport state only until B37, and it changes nothing on screen yet.**
 *
 * It is here rather than at B37 because `DESIGN.md` §3 puts granularity in the client's column and
 * B36 is the chunk that builds the viewport. What it must NOT become is a client that re-buckets
 * whatever it likes: **D46** allows re-bucketing only at the granularity the server's own
 * `TraceDescriptor` names, and those arrive at B51. So this control picks a REQUEST, and B37/B38
 * are where the request means something. D20's ladder can still override it — the chart refuses to
 * draw a ratio below its sample-size gate and coarsens, capped at the hour, showing which it chose.
 */
const GRANULARITIES = [
  { label: 'minute', seconds: 60 },
  { label: 'hour', seconds: 3_600 },
] as const;

/**
 * The window to ask for: `minutes` back, ending now.
 *
 * `toISOString()` always carries `Z`, which is what B07's boundary requires — it rejects a bound
 * with no explicit offset, because JS would parse it as local time and give a different answer on
 * a different machine. The bounds are NOT rounded here: the server snaps `from` down and `to` up
 * to whole minutes and echoes what it used, so the client displays the server's window, never its
 * own idea of it.
 */
function windowEndingNow(minutes: number): { from: string; to: string } {
  const now = Date.now();
  return {
    from: new Date(now - minutes * 60_000).toISOString(),
    to: new Date(now).toISOString(),
  };
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      store: BucketStore;
      cursor: number;
      ads: AdRow[];
      /**
       * **B47 / B48** — the fold's two other projections, from the SAME read transaction as `ads`
       * and the buckets (§3.1's envelope). They are held here rather than fetched separately so
       * that the chart's boundary at 18:04, the generation named on it, and the decision that
       * opened it are all facts about one instant.
       */
      generations: GenerationRow[];
      decisions: Decision[];
    };

/** Why the stream is not currently feeding us, if it is not. */
type Link = 'connecting' | 'live' | 'down';

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [link, setLink] = useState<Link>('connecting');
  const [windowMinutes, setWindowMinutes] = useState<number>(60);
  const [granularity, setGranularity] = useState<number>(60);
  /**
   * Which metric the CHART draws. The headline shows all six at once; the chart shows one, because
   * a ratio and a count share no y axis and D20's gate is a per-metric question.
   */
  const [metric, setMetric] = useState<MetricKey>('impressions');
  /** `null` is "all ads" — the same convention as an absent `?ads=`, so no translation is needed. */
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  /**
   * **B38 / D66 — the server's totals, as a whole response**, window and log position included.
   *
   * Held as the response rather than as three numbers on purpose: a total whose window and `as_of`
   * have been discarded is the undescribed figure D34's quarantine refuses, and B51 signs exactly
   * this envelope.
   */
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  /** Whether the last totals refresh landed. A silently stale headline is the failure to avoid. */
  const [totalsFresh, setTotalsFresh] = useState(true);
  /**
   * **B43** — the restatement timeline for the window on screen.
   *
   * Fetched alongside the snapshot rather than streamed: a restatement is a rare, historical event
   * (ten in the seeded week), and the live path already tells the chart that a bucket moved. It is
   * re-read on the same 5-second tick as the totals, so a restatement arriving live appears without
   * a refresh, one tick late.
   */
  const [entries, setEntries] = useState<readonly RestatementEntry[]>([]);
  /**
   * **B44** — the newest tail frame. Replaced wholesale rather than accumulated: the server already
   * keeps the ring and says how much of it this frame is a sample of, and a client-side buffer
   * would be a second, differently-sized ring nobody could reason about.
   */
  const [tail, setTail] = useState<TailFrame | null>(null);
  /**
   * **B45** — the fatigue flag, per component pair. Read once per snapshot rather than on the
   * 5-second tick: it is a 6-hour EWMA against a lifetime peak, so it cannot move meaningfully
   * inside a tick, and it costs two whole-store joins (114 ms measured).
   */
  const [fatigue, setFatigue] = useState<FatigueReport | null>(null);
  /**
   * **B46** — the swap picker's candidates. Fetched ONCE, on mount, and never again: `components`
   * is seeded reference data that no lever writes (`SCOPE.md` §4 cut #7), so re-reading it on a
   * window roll would be four copies a minute of a constant.
   */
  const [components, setComponents] = useState<readonly ComponentRow[]>([]);
  /**
   * **B49 / P16 — the lateness horizon this surface is answered at**, in hours.
   *
   * Viewport state, like the window and the selection: `DESIGN.md` §3's boundary table puts it in
   * column 1, and it is a READ parameter everywhere it goes. Changing it re-runs §3.1 from step 1,
   * because every settlement fact on the page — bucket state, the dashed rule, maturity, the
   * restatement timeline — is derived from it server-side.
   */
  const [horizonH, setHorizonH] = useState<number>(HORIZON_MS / 3_600_000);
  const [sweepResult, setSweepResult] = useState<SweepResult | null>(null);
  const [sweeping, setSweeping] = useState(false);
  /**
   * **B50 / P17** — the scenario record, refreshed on the same 5-second tick as the totals.
   *
   * On that tick and not on the stream, because the interesting transition is the one the stream
   * cannot show: a trigger going from `pending` to picked-up is a handover between two processes
   * that share no memory, and watching `consumed_at` fill in is how a reviewer sees the poll happen.
   */
  const [scenarioLog, setScenarioLog] = useState<readonly (ScenarioRow & { consumed_at: string | null })[]>([]);
  /**
   * **B50a / P18** — the score per decision, keyed by `decision_id`.
   *
   * Re-read on the same tick as the totals AND on every horizon change, because the withholding
   * rule is the horizon's: sweeping to 2 h releases scores that were withheld at 72 h, and a log
   * still saying "scoring in 68 h" beside a chart drawn as settled would be the disagreement P16
   * exists to avoid, moved one section down the page.
   *
   * **D71** — the whole envelope is held, not just the map, because the ratification requires the
   * caption to name **the window the server answered at**. Printing `windowH` (the control) instead
   * of `scores.window_h` (the answer) would misstate the claim for one tick after every change,
   * which is exactly the tick a reader is looking at it.
   */
  const [scores, setScores] = useState<ScoresResponse | null>(null);

  /**
   * **D71 / P18** — the half-width of the scoring window, in hours. **D70's 6 h is the default and
   * the documented figure**; this control shifts a read and writes nothing.
   *
   * A sibling of `horizonH` above and deliberately NOT merged with it: the horizon governs *when* a
   * score may be shown, the window governs *what it is measured over*. One control doing both would
   * make the two indistinguishable in the one place the difference matters.
   */
  const [windowH, setWindowH] = useState<number>(SCORING_WINDOW_H);

  /**
   * Toggling from "all" selects that ad ALONE rather than deselecting it out of twelve.
   *
   * The alternative reads as a bug the first time it is tried: clicking one ad in an all-selected
   * list to say "just this one" would leave the other eleven charted. Emptying the set returns to
   * all, because a chart of nothing is never what the click meant.
   */
  const toggle = useCallback((ad_id: string) => {
    setSelected((prev) => {
      if (prev === null) return new Set([ad_id]);
      const next = new Set(prev);
      if (next.has(ad_id)) next.delete(ad_id);
      else next.add(ad_id);
      return next.size === 0 ? null : next;
    });
  }, []);
  /** Bumped to force step 1 again — a `resnapshot`, per §3.1's "the client returns to step 1". */
  /**
   * **B53 / P12** — the descriptor currently being walked back, or `null` when the panel is closed.
   *
   * The DESCRIPTOR is the state, not a value and not an "open" boolean: the panel's whole job is to
   * re-ask one question, so what it is showing IS which question was clicked. Clicking a second
   * number replaces it, which is why `Drilldown` keys its fetch on the descriptor.
   */
  const [drilling, setDrilling] = useState<TraceDescriptor | null>(null);

  const [generation, setGeneration] = useState(0);

  const resnapshot = useCallback((reason: string) => {
    console.warn(`[stream] server asked for a resnapshot: ${reason}`);
    setGeneration((n) => n + 1);
  }, []);

  /**
   * **B46** — re-run §3.1 from step 1 after a lever landed.
   *
   * Deliberately the SAME path as a refresh and as a `resnapshot`, and deliberately NOT a patch of
   * local state from the POST's response. A decision changes `ads`, opens a `config_generations`
   * row and appends to the log, all inside one transaction; a client that applied the returned
   * `ad` to its own array would be holding a config the chart's boundaries and the log's rows had
   * not caught up with, and the three would disagree until the next unrelated fetch. One re-read is
   * cheap (the window is 60 minutes by default) and it cannot drift.
   */
  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  /**
   * **B49 / P16.** Sweep first, then re-anchor: the sweep is what says *what changed* — a bare
   * re-fetch at the new horizon would show a different screen with no account of the difference,
   * which is precisely the "built, correct and invisible" failure F2 describes. Changing `horizonH`
   * re-runs §3.1 from step 1 through the effect's dependency, so this function does not fetch.
   */
  const changeHorizon = useCallback(
    (hours: number) => {
      if (hours === horizonH) return;
      const controller = new AbortController();
      setSweeping(true);
      fetchSweep(horizonH, hours, controller.signal)
        .then(setSweepResult)
        .catch((err: unknown) => {
          console.warn('[sweep] failed', err);
          // The sweep is the EXPLANATION, not the mechanism. Losing it must not strand the surface
          // at a horizon the caption cannot account for, so the horizon still moves and the
          // account is simply absent.
          setSweepResult(null);
        })
        .finally(() => {
          setSweeping(false);
          setHorizonH(hours);
        });
    },
    [horizonH],
  );

  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | null = null;
    const { from, to } = windowEndingNow(windowMinutes);
    // `?ads=` is omitted entirely for "all", never sent empty: B07 rejects `ads=` as given-but-empty
    // rather than silently reading it as all, which is the correct strictness and the reason this
    // builds the parameter conditionally instead of joining a possibly-empty set.
    const url =
      `/api/snapshot?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
      `&horizon_h=${horizonH}&granularity_s=${grainRef.current}` +
      (selected === null ? '' : `&ads=${encodeURIComponent([...selected].join(','))}`);

    setLink('connecting');

    // Step 1: the snapshot. Step 2 only starts once it has landed, because its
    // `as_of_ingest_seq` IS the cursor — subscribing first would mean subscribing from a cursor we
    // do not have yet.
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          const detail =
            typeof body === 'object' && body !== null && 'message' in body
              ? String((body as { message: unknown }).message)
              : res.statusText;
          throw new Error(`${res.status} — ${detail}`);
        }
        const snapshot = body as Snapshot;
        setState({
          phase: 'ready',
          // The window is the one the SERVER resolved and echoed (snapped to whole minutes), not
          // the one we asked for. The store drops rows outside it, so using our own bounds here
          // would disagree with the server's on the boundary minute.
          store: createStore(snapshot.query, snapshot.buckets),
          cursor: snapshot.as_of_ingest_seq,
          generations: snapshot.generations,
          decisions: snapshot.decisions,
          // The WHOLE portfolio, not the selection — a list that hid the ads you are not looking
          // at would make selecting them impossible.
          ads: snapshot.ads,
        });
        // Step 1 already carries them, so the headline is populated before the first refresh tick.
        setTotals({
          query: snapshot.query,
          totals: snapshot.totals,
          maturity: snapshot.maturity,
          as_of_ingest_seq: snapshot.as_of_ingest_seq,
        });
        setTotalsFresh(true);
        // The timeline for the same window, in the same pass as step 1 — so a refresh shows the
        // restatements of the window it just read, not of the one before it.
        void fetchRestatements(snapshot.query, selected, controller.signal, horizonH)
          .then((response) => setEntries(response.entries))
          .catch(() => setEntries([]));
        void fetchFatigue(controller.signal)
          .then(setFatigue)
          .catch(() => setFatigue(null));
        void fetchScenarios(controller.signal)
          .then(setScenarioLog)
          .catch(() => setScenarioLog([]));
        void fetchScores(controller.signal, horizonH, windowH)
          .then(setScores)
          .catch(() => setScores(null));

        // Steps 2-4. The cursor closes the snapshot-to-subscribe gap: anything ingested between
        // the read transaction above and this line is replayed by B10a.
        unsubscribe = subscribe(snapshot.as_of_ingest_seq, {
          onReady: () => setLink('live'),
          onBuckets: (rows, as_of) => {
            setLink('live');
            setState((prev) =>
              prev.phase === 'ready'
                ? { ...prev, store: applyRows(prev.store, rows), cursor: as_of }
                : prev,
            );
          },
          onTail: setTail,
          onResnapshot: resnapshot,
          onError: () => setLink('down'),
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      controller.abort();
      unsubscribe?.();
    };
    // Window and selection are dependencies, so changing either re-runs §3.1 from step 1: new
    // snapshot, new cursor, new subscription. That is deliberately the SAME path as a refresh and
    // a `resnapshot` — D30's absolute rows are what make one path enough, and a second "adjust the
    // existing store" path is where a stale row would survive a window change.
  }, [generation, resnapshot, windowMinutes, selected, horizonH]);

  /**
   * **B38a / D65 — walk the frame forward.** Without this the surface is live for at most the tail
   * of one minute: `to` is `ceilToMinute(now)` at fetch time, so once that minute closes every
   * arriving bucket is outside the window and `store.ts` drops it. Measured before D65 was asked.
   *
   * A 5-second tick, not a minute-aligned timer: `rollWindow` returns the SAME store unless the
   * minute actually changed, so this costs one string comparison for 55 of every 60 seconds and
   * re-renders on the minute. An aligned timer would have to survive tab throttling and clock
   * drift to earn the difference.
   *
   * It does NOT re-snapshot. Step 1 stays the only path that talks to `/api/snapshot` for buckets,
   * so the resume contract (D47) and the anchor are both untouched by the roll.
   */
  useEffect(() => {
    const controller = new AbortController();
    fetchComponents(controller.signal)
      .then(setComponents)
      // An empty list leaves the swap picker empty and says so on screen; it does not break the
      // other three levers, which need no candidates.
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn('[components] read failed', err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        const store = rollWindow(prev.store, Date.now());
        return store === prev.store ? prev : { ...prev, store };
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  /**
   * The frame currently on screen, for the totals refresh to ask about. A ref rather than a
   * dependency so a moving cursor does not tear down and rebuild the interval four times a second
   * (`Chart.tsx`'s `labelsRef` is the same pattern for the same reason).
   */
  const viewRef = useRef<{ from: string; to: string } | null>(null);
  viewRef.current = state.phase === 'ready' ? state.store.window : null;

  /**
   * **B51 / D46 — the grain the descriptors must be issued at.**
   *
   * `plan.granularity_s` is the rung the GATE picked, which is known only after the data has been
   * seen, so it cannot be a dependency of the fetch that produced the data. A ref written during
   * render, exactly like `viewRef` above: the snapshot asks at whatever the last render drew at,
   * and the 5-second totals refresh corrects it if the gate has since coarsened.
   *
   * The window between the two is not swept under the rug. A descriptor at the wrong grain does
   * not produce a wrong number — `POST /api/trace` refuses the narrowing outright (`narrows()`) —
   * so the failure mode of this ref being one tick stale is a drill-down that says why, not a
   * figure that quietly answers a different question.
   */
  const grainRef = useRef<number>(60);

  /**
   * **B38 / D66 — re-ask the server for the totals of the window on screen.**
   *
   * A 5-second THROTTLE, not a debounce: the stream moves the cursor up to four times a second, and
   * a trailing debounce keyed on the cursor would therefore never fire at all. So this asks on a
   * fixed tick and the headline lags the chart by at most 5 s — visibly, because both carry
   * `as_of_ingest_seq` and the two are printed side by side.
   *
   * A failed refresh is NOT swallowed: `totalsFresh` goes false and the surface says the headline
   * is stale. A quietly frozen number that still looks current is the exact failure D66 chose the
   * server-computed option to avoid.
   */
  useEffect(() => {
    const controller = new AbortController();
    const id = setInterval(() => {
      const view = viewRef.current;
      if (view === null) return;
      fetchTotals(view, selected, controller.signal, horizonH, grainRef.current)
        .then((response) => {
          setTotals(response);
          setTotalsFresh(true);
        })
        .then(() => fetchRestatements(view, selected, controller.signal, horizonH))
        .then((response) => setEntries(response.entries))
        .then(() => fetchScenarios(controller.signal))
        .then(setScenarioLog)
        .then(() => fetchScores(controller.signal, horizonH, windowH))
        .then(setScores)
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          console.warn('[totals] refresh failed', err);
          setTotalsFresh(false);
        });
    }, 5_000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [selected, horizonH]);

  if (state.phase === 'loading') return <p>Loading snapshot…</p>;
  if (state.phase === 'error') {
    return (
      <div>
        <h1>Cannot read the snapshot</h1>
        <p>{state.message}</p>
        <p>Is the API up? <code>curl -s localhost:8787/api/health</code></p>
      </div>
    );
  }

  const { store, cursor, ads, generations, decisions } = state;
  const latest = latestBucket(store);
  // "All" resolved to a concrete list, in the portfolio's own order, so the chart's series order
  // and the list's row order are the same thing and a colour means one ad in both.
  const charted = selected === null ? ads : ads.filter((ad) => selected.has(ad.ad_id));
  // The selection's combined row, found by `ad_id === null` — a position lookup would silently
  // return an ad's totals the first time the server's ordering changed.
  const total = totals === null ? null : combined(totals.totals);
  const chartedIds = new Set(charted.map((ad) => ad.ad_id));

  /**
   * **B49 — the one place a swept horizon has to be reconciled.**
   *
   * The snapshot's rows were stamped at `horizonH`; rows that arrived on the STREAM since were
   * stamped at the account horizon, because one flush tick serves every subscriber and cannot know
   * what any of them is sweeping (§11). At the default horizon the two agree and this is identity.
   * Away from it, every row is re-derived with `bucketState` — the SAME function the server stamps
   * with, imported from `settlement.ts`, which is why that file is kept free of `node:sqlite`.
   * A second copy of the settlement rule in the browser is what this avoids.
   */
  const horizonMs = horizonH * 3_600_000;
  const nowIso = new Date().toISOString();
  const allRows = [...store.rows.values()];
  const viewRows =
    horizonMs === HORIZON_MS
      ? allRows
      : allRows.map((row) => ({ ...row, state: bucketState(row, nowIso, horizonMs) }));
  /**
   * **B39 — the gate decides the granularity, the ads and the suppression** (D20/D67), from the
   * same rows the chart draws. Computed here rather than inside `Chart.tsx` because the surface has
   * to say what it decided, and the sentence belongs next to the chart, not inside the canvas.
   *
   * Over `viewRows`, so the gate and the chart see one row set — B49's re-derivation changes only
   * `state`, never a count, so it cannot move a rung; passing two different arrays would still be
   * the kind of split that goes wrong silently later.
   */
  const plan = planChart(viewRows, store.window, charted, metric, granularity);
  // Written during render (see `grainRef`): the next snapshot and the next totals refresh ask for
  // descriptors at the rung this chart is actually drawn at.
  grainRef.current = plan.granularity_s;
  // B42's counts, over the rows that are actually charted. Selection, not arithmetic: `state` and
  // `restated_at` were both derived (B21, and B49 at a swept horizon); this only tallies them.
  const inView = viewRows.filter((row) => chartedIds.has(row.ad_id));
  const restatedInView = inView
    .filter((row) => row.restated_at !== null)
    .sort((a, b) => (a.minute_start < b.minute_start ? -1 : 1));
  const settledInView = inView.filter((row) => row.state === 'settled').length;
  const liveInView = inView.filter((row) => row.state === 'live').length;

  // B48. Charted ads only, inside the frame on screen, generation 2 and up — the arithmetic and
  // the "what changed" label are `generations.ts`'s, with tests, because a boundary drawn at the
  // wrong instant produces a chart that looks entirely normal.
  const boundaries = boundariesIn(generations, store.window, chartedIds);
  const decisionById = new Map(decisions.map((d) => [d.decision_id, d]));

  return (
    <div className="shell">
      <Portfolio ads={ads} selected={selected} onToggle={toggle} />

      <main className="shell__main">
        <h1>Signal</h1>

        <div className="controls">
          <div className="controls__group">
            <span className="controls__label">Window</span>
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                type="button"
                aria-pressed={windowMinutes === w.minutes}
                onClick={() => setWindowMinutes(w.minutes)}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Granularity</span>
            {GRANULARITIES.map((g) => (
              <button
                key={g.label}
                type="button"
                aria-pressed={granularity === g.seconds}
                onClick={() => setGranularity(g.seconds)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Metric</span>
            {(['impressions', 'clicks', 'spend', 'ctr', 'cpa', 'roas'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                // The three that lag are marked in the control itself, not only beside the number.
                // Every metric gets the gloss, not just the three that lag: the selector is where
                // a reader meets `CPA` for the first time, and `isRatio` was gating the caveat
                // rather than the definition.
                title={glossFor(key)}
              >
                {METRIC_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Charting</span>
            <span>{selected === null ? `all ${ads.length}` : `${selected.size} of ${ads.length}`}</span>
          </div>
        </div>

        {/* **B49 / P16.** Above the chart, because it changes what every mark on it means. */}
        <Horizon
          horizonH={horizonH}
          defaultH={HORIZON_MS / 3_600_000}
          onChange={changeHorizon}
          result={sweepResult}
          pending={sweeping}
        />

        {/* B37/B39. One series per selected ad, drawn from the SAME bucket rows the headline is
            summed from — so a reviewer comparing the two is comparing one source to itself, and
            B53's drill-down is what compares either of them to raw events. */}
        <Chart
          rows={viewRows}
          window={store.window}
          plan={plan}
          boundaries={boundaries}
          horizonMs={horizonMs}
        />

        {/* **D20 requires the chart to say which rung it picked, and D67 requires the gated count
            and its reason to be on screen.** Both live here. A chart that had quietly coarsened, or
            quietly dropped two thirds of its points, would look exactly like a chart that had not. */}
        <p className="gate">
          drawn at <strong>{rungLabel(plan.granularity_s)}</strong>
          {plan.coarsened ? (
            <> — the gate coarsened from {rungLabel(granularity)} to clear its bar</>
          ) : null}
          {plan.bar === null ? (
            <> · counts are their own evidence, so no bar applies</>
          ) : (
            <>
              {' '}· bar {plan.bar.min} {plan.bar.basis} per point ·{' '}
              <strong>
                {plan.gated} of {plan.gated + plan.plotted} points gated
              </strong>{' '}
              ({plan.bar.reason})
            </>
          )}
        </p>
        {/* B42 — the marks are only self-explanatory if the surface names them, and this line is
            what makes the treatment persistent in the second sense: it is still true after a
            repaint, a refresh, or a week. `state` and `restated_at` are server-derived (B21). */}
        <p className="gate">
          settlement: <strong>{restatedInView.length}</strong> restated bucket
          {restatedInView.length === 1 ? '' : 's'} in view, marked with a square and a hairline ·{' '}
          {settledInView} settled · {liveInView} live · the dashed vertical rule is the 72 h horizon
          {restatedInView.length > 0 ? (
            <>
              {' '}· oldest restated: <code>{restatedInView[0]?.minute_start}</code> (ad{' '}
              <code>{restatedInView[0]?.ad_id}</code>)
            </>
          ) : null}
        </p>

        {/* **B48 — the boundaries in words, beside the same boundaries as rules on the chart.**
            The chart can only carry `a_03 g4`; the step it explains is only explained once the
            reader can see WHAT changed and WHY a human changed it. The rationale is the decision's
            own, joined through `config_generations.opened_by_decision` — so the annotation and the
            log below are the same fact reached from two directions. */}
        {boundaries.length === 0 ? (
          <p className="gate">
            no config changes in this window for the charted ads — every step in these series is the
            world moving, not a lever
          </p>
        ) : (
          <ul className="boundaries">
            {boundaries.map((b) => {
              const decision = decisionById.get(b.opened_by_decision);
              return (
                <li key={b.generation_id} className="boundaries__item">
                  <span className="boundaries__mark">▼</span>{' '}
                  <code>{b.ad_id}</code> gen {b.seq_in_ad} at <code>{b.at}</code> ·{' '}
                  <strong>{b.changes.join(' · ')}</strong>
                  {decision === undefined ? (
                    // The FK is `NOT NULL REFERENCES decisions(decision_id)`, so this is
                    // unreachable while the two arrive in one transaction — said rather than
                    // rendered blank, because a silently missing rationale reads as "none given".
                    <span className="boundaries__meta"> · opening decision not in this response</span>
                  ) : (
                    <span className="boundaries__meta">
                      {' '}
                      · decision #{decision.decision_seq} by <code>{decision.actor}</code>:{' '}
                      &ldquo;{decision.rationale}&rdquo;
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {plan.dropped.length > 0 ? (
          <p className="gate gate--dropped">
            shown as counts, not as {METRIC_LABELS[metric]} — no rung up to the hour clears the bar:{' '}
            {plan.dropped.map((d, i) => (
              <span key={d.ad_id}>
                {i > 0 ? ' · ' : ''}
                <code>{d.ad_id}</code> ({d.reason})
              </span>
            ))}
          </p>
        ) : null}

        {/* B38 — the headline. EVERY figure here was computed by the server: counts summed in
            SQL, the three ratios divided after (D10), and the whole envelope re-asked over
            `?include=totals` every 5 s (D66). Nothing in this block does arithmetic. */}
        {totals === null || total === null ? (
          <p>Totals not read yet.</p>
        ) : (
          <>
            {/* **B52 — every one of these renders through `<Metric>`, which will not compile
                without a server-issued descriptor.** The values are the server's, verbatim; the
                descriptors are the queries that produced them, and clicking one opens the
                walk-back (B53). Spend's sub-line keeps its two disjoint parts (L79-80) as the
                note, so the figure and its decomposition stay one thought. */}
            <div className="metrics">
              <Metric
                metric="impressions"
                label="Impressions"
                value={total.impressions}
                descriptor={total.descriptors.impressions}
                onDrill={setDrilling}
              />
              <Metric
                metric="clicks"
                label="Clicks"
                value={total.clicks}
                descriptor={total.descriptors.clicks}
                onDrill={setDrilling}
              />
              <Metric
                metric="spend"
                label="Spend"
                value={total.spend_total_cents}
                descriptor={total.descriptors.spend}
                note={`${formatCents(total.click_cost_cents)} clicks + ${formatCents(total.spend_cents)} CPM/fees`}
              />
              <Metric
                metric="ctr"
                label="CTR"
                value={total.ctr}
                descriptor={total.descriptors.ctr}
                note={METRIC_NOTES_SHORT.ctr}
                onDrill={setDrilling}
              />
              <Metric
                metric="cpa"
                label="CPA"
                value={total.cpa_cents}
                descriptor={total.descriptors.cpa}
                note={METRIC_NOTES_SHORT.cpa}
                onDrill={setDrilling}
              />
              <Metric
                metric="roas"
                label="ROAS"
                value={total.roas}
                descriptor={total.descriptors.roas}
                note={METRIC_NOTES_SHORT.roas}
                onDrill={setDrilling}
              />
            </div>

            {/* **B53 / P12 — the walk-back, in place.** Directly under the figures rather than in a
                modal: the number and the events beneath it belong on one screen, and a reviewer
                comparing them should not have to remember what the page said. */}
            {/* **The three abbreviations, expanded, on the page rather than only on hover.** A
                tooltip is not a label: it does not exist on a touch device, it does not survive a
                screenshot, and a reviewer reading `ROAS 2.4` cannot check it against the raw
                events without knowing which division produced it. `formula` here is the same
                string the hover text uses, from one map, so the two cannot drift. */}
            <p className="glossary">
              {RATIO_METRICS.map((key, i) => (
                <span key={key}>
                  {i > 0 ? <span className="glossary__sep"> · </span> : null}
                  <strong>{METRIC_LABELS[key]}</strong> {METRIC_GLOSSARY[key].term}{' '}
                  <span className="glossary__formula">({METRIC_GLOSSARY[key].formula})</span>
                </span>
              ))}
            </p>

            <Drilldown descriptor={drilling} onClose={() => setDrilling(null)} />

            {/* **Held apart, never added in** (§14, and it bites exactly here): a provisional
                conversion is an orphan whose click has not arrived, so its ad is a guess and its
                placement is temporary. Summing the two columns would put unattributed revenue into
                ROAS and unattributed cost into CPA, and every number would stay plausible. */}
            <p className="portfolio__meta">
              {formatCount(total.conversions)} settled conversions ·{' '}
              {formatCents(total.value_cents)} value
              {total.provisional_conversions > 0 ? (
                <>
                  {' '}· <strong>{formatCount(total.provisional_conversions)} provisional</strong>{' '}
                  ({formatCents(total.provisional_value_cents)}), orphans held at their own minute
                  and <em>excluded</em> from CPA and ROAS
                </>
              ) : null}
            </p>

            {/* B41 — D33's maturity indicator. It sits BETWEEN the numbers and the chart, because
                it qualifies both, and it is worded so it cannot be read as the gate's message. */}
            <Maturity data={totals.maturity} />

            {/* Per ad, so the portfolio is comparable rather than only aggregated. Same envelope,
                same read transaction — these rows sum to the headline above by construction. */}
            <table className="totals">
              <thead>
                <tr>
                  <th>Ad</th><th>Impr</th><th>Clicks</th><th>Spend</th>
                  <th>CTR</th><th>CPA</th><th>ROAS</th><th>Conv</th>
                </tr>
              </thead>
              <tbody>
                {/* Same gate, same descriptors, one scope narrower: a per-ad row's descriptors
                    name that ad alone, so drilling `a_03`'s CPA re-asks `a_03`'s question and not
                    the selection's. */}
                {perAd(totals.totals).map((row) => (
                  <tr key={row.ad_id}>
                    <td><code>{row.ad_id}</code></td>
                    <MetricCell metric="impressions" value={row.impressions} descriptor={row.descriptors.impressions} onDrill={setDrilling} />
                    <MetricCell metric="clicks" value={row.clicks} descriptor={row.descriptors.clicks} onDrill={setDrilling} />
                    <MetricCell metric="spend" value={row.spend_total_cents} descriptor={row.descriptors.spend} onDrill={setDrilling} />
                    <MetricCell metric="ctr" value={row.ctr} descriptor={row.descriptors.ctr} onDrill={setDrilling} />
                    <MetricCell metric="cpa" value={row.cpa_cents} descriptor={row.descriptors.cpa} onDrill={setDrilling} />
                    <MetricCell metric="roas" value={row.roas} descriptor={row.descriptors.roas} onDrill={setDrilling} />
                    <MetricCell metric="conversions" value={row.conversions} descriptor={row.descriptors.conversions} onDrill={setDrilling} />
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="telemetry">
              totals over {totals.query.from} → {totals.query.to} · {total.buckets} buckets · as of
              ingest_seq {totals.as_of_ingest_seq}
              {totalsFresh ? null : <> · <strong>STALE — the last refresh failed</strong></>}
            </p>
          </>
        )}

        {latest === null ? (
          <p>
            No buckets in this window for this selection. Widen the window, or select an ad that is
            live — a paused ad stops producing impressions within one simulator tick.
          </p>
        ) : (
          <p className="portfolio__meta">
            newest bucket in view: ad <code>{latest.ad_id}</code> · minute{' '}
            <code>{latest.minute_start}</code> · {latest.impressions} impressions · as of
            ingest_seq <code>{latest.max_ingest_seq}</code>
            {latest.restated_at !== null ? <> · <strong>restated</strong></> : null}
          </p>
        )}

        {/* **B46 — the loop closes here.** Above the decision log, because the log is the record of
            what this console did; below the numbers, because a lever is pulled in response to them.
            The world responds within one simulator tick: pause `a_12` and its impressions stop
            arriving, which is visible on the chart above without touching anything else. */}
        <h2 className="section">
          Decision loop
          <span className="section__sub">pull a lever; the world responds within a second</span>
        </h2>
        <Console ads={ads} components={components} onApplied={reload} />

        {/* B47 — the authoritative log, and the config on the left is its fold. */}
        <h2 className="section">
          Decision log
          <span className="section__sub">what produced the config on the left</span>
        </h2>

        {/* **D71 / P18 — the scoring window, beside the log it annotates.** Two knobs, and the
            caption below says which does what: the HORIZON (above the chart) decides when a score
            may be shown at all; this decides what it is measured over. Both are read parameters and
            neither writes anything — a score is a function of the log, the rollups, the horizon,
            this window and the read clock, and four of those five move. */}
        <div className="controls">
          <div className="controls__group">
            <span className="controls__label">Scoring window (±)</span>
            {WINDOW_CHOICES_H.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={windowH === h}
                onClick={() => setWindowH(h)}
              >
                {h >= 1 ? `${h}h` : `${h * 60}m`}
                {h === SCORING_WINDOW_H ? ' (D70)' : ''}
              </button>
            ))}
          </div>
        </div>
        {scores === null ? (
          <p className="gate">scores not read yet.</p>
        ) : scores.window_h === scores.default_window_h ? (
          /* **D75.** D71 consequence 3 requires the caption to NAME the window each score was
             answered at, so that stays; the reason a score is withheld moved into the collapsed
             limits below the log. */
          <p className="gate">
            scored over <strong>±{scores.window_h} h</strong> (D70), withheld until both windows pass
            the <strong>{scores.horizon_h} h</strong> horizon ·{' '}
            <strong>shorten the window to score a lever you just pulled</strong>
          </p>
        ) : (
          <p className="gate gate--dropped">
            <strong>
              scored over ±{scores.window_h >= 1 ? `${scores.window_h} h` : `${scores.window_h * 60} min`},
              not D70&rsquo;s ±{scores.default_window_h} h
            </strong>{' '}
            — a <em>different claim</em>, not a sharper one: less delivery either side, so it is
            noisier. Answered at the <strong>{scores.horizon_h} h</strong> horizon.{' '}
            <strong>Nothing was written.</strong>
          </p>
        )}

        <DecisionLog
          decisions={decisions}
          generations={generations}
          scores={scores?.byDecision ?? EMPTY_SCORES}
          windowH={scores?.window_h ?? SCORING_WINDOW_H}
          selected={selected}
        />

        {/* **B50 / P17.** Below the decision loop and under its own heading, because a scenario is
            NOT a lever: it changes what the world does, never what the advertiser decided. Keeping
            the two apart on the surface is the same rule the model keeps them apart by. */}
        <h2 className="section">
          Scenario control
          <span className="section__sub">the simulator, not the advertiser</span>
        </h2>
        <Scenarios
          ads={ads}
          log={scenarioLog}
          onFired={() => {
            // Refresh the record immediately so the row appears as `pending`, before the poll that
            // consumes it — the transition is the thing worth watching.
            const controller = new AbortController();
            void fetchScenarios(controller.signal).then(setScenarioLog).catch(() => undefined);
          }}
        />

        {/* B43 — §5.6's timeline. Below the chart, because an entry explains a mark on it. */}
        <h2 className="section">
          Restatements
          <span className="section__sub">settled buckets that moved</span>
        </h2>
        <Timeline entries={entries} />

        {/* **B56 / P15 — the Workbench's one screen.** Below the decision log and above fatigue,
            because it is the join between the two: the log says which levers moved config, this
            says what that config is currently made of, and the fatigue flag below reads the same
            component pairs. `generation` is the SAME counter that re-runs §3.1, so a lever pulled
            in the console above lands here in the same pass as everywhere else. */}
        <h2 className="section">
          Workbench
          <span className="section__sub">the component library, and what is using it</span>
        </h2>
        <Components generation={generation} />

        {/* B45 — §19's one heuristic, with its four limits underneath it rather than in the
            README only. Above the tail, below the numbers it interprets. */}
        <h2 className="section">
          Fatigue
          <span className="section__sub">component pairs losing their click-through rate</span>
        </h2>
        <FatigueFlag report={fatigue} />

        {/* **B55 / P13 — the life of one event.** Directly ABOVE the raw tail, because the tail is
            where a reviewer gets an `event_id` to paste: the two are one gesture, and putting the
            trace at the top of the page would mean scrolling for the input to it. */}
        <h2 className="section">
          Trace one event
          <span className="section__sub">emission to pixel, eight steps</span>
        </h2>
        <EventTrace onDrill={setDrilling} />

        {/* B44 — the raw tail and, in its own treatment, the transport telemetry (D34's named
            exception). Last on the page, below every performance number, so the quarantine is
            spatial as well as structural. */}
        <h2 className="section">
          Raw event tail
          <span className="section__sub">the feed itself</span>
        </h2>
        <Tail frame={tail} />

        {/* §11's stream telemetry, quarantined by treatment (D45) so it can never be misread as a
            performance metric. B44 gives it its three counters; this is the same treatment. */}
        {/* D65's amendment: the client's frame AND the anchor the server resolved, side by side,
            so how far the frame has walked is visible rather than inferable. A refresh re-anchors,
            which is the fastest way to see that the two are different facts. */}
        <p className="telemetry">
          window {store.window.from} → {store.window.to} · anchored at {store.anchor.from} →{' '}
          {store.anchor.to} (+{minutesRolled(store)}m) · {store.rows.size} bucket rows · cursor{' '}
          {cursor} · stream {link}
        </p>

        {/* A hand-verification aid, not the traceability surface — that is B52/B55. */}
        <details>
          <summary>Rows in the store</summary>
          <pre>{JSON.stringify([...store.rows.values()], null, 2)}</pre>
        </details>
      </main>
    </div>
  );
}
