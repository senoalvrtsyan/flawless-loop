// Server entry point. Opens the store once, mounts the routes, listens.
//
// DESIGN.md §11: this process owns every write to SQLite. The simulator is a separate OS process
// (D32) and reaches the store only through HTTP. One `DatabaseSync` handle for the process
// lifetime — `node:sqlite` is synchronous, so a request handler can never observe a half-applied
// transaction.

import { createServer } from 'node:http';
import { openDb, DB_PATH } from './db.ts';
import { createRouter, readBody, sendJson, type Route } from './http.ts';
import { markScenariosConsumed, simWorld } from './sim-world.ts';
import { verify, type VerifyResult } from './verify.ts';
import { ingest } from './ingest.ts';
import type { IngestResult } from '../shared/types.ts';
import { parseSnapshotQuery, snapshot, totalsOnly, type Snapshot, type TotalsResponse } from './snapshot.ts';
import { restatements, type RestatementEntry } from './restatements.ts';
import { fatigueReport, type FatigueReport } from './fatigue-flag.ts';
import { createStream } from './stream.ts';
import { createTail } from './tail.ts';
import { listDecisions, postDecision, type PostResult } from './decisions.ts';
import { componentUsage, listComponents, type ComponentRow, type LineageUsage } from './components.ts';
import { HORIZON_CHOICES_H, sweep, type SweepResult } from './sweep.ts';
import { listScenarios, postScenario, type ScenarioResult, type ScenarioRow } from './sim-scenario.ts';
import { scoreDecisions, type DecisionScore } from './scoring.ts';
import { parseTraceRequest, trace, traceEvent, type EventTrace, type TraceResult } from './trace.ts';
import { HORIZON_MS } from '../shared/config.ts';

const PORT = Number(process.env.PORT ?? 8787);

const db = openDb();

// The store is migrated by `npm run db:migrate`, never by the server: a process that migrates on
// boot would apply a schema change during a demo. Fail with the instruction instead of with
// `no such table: signals` three lines later.
const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
if (version === 0) {
  throw new Error(`${DB_PATH}: store is not migrated — run \`npm run db:migrate\` first`);
}

// The two authoritative logs (DESIGN §2.2, §2.3). `ingest_seq` is also the SSE cursor (D12/E2),
// so this number is the one a reconnecting client resumes from — which is why health reports it.
const logPosition = db.prepare(`
  SELECT (SELECT COALESCE(MAX(ingest_seq),   0) FROM signals)   AS ingest_seq,
         (SELECT COALESCE(MAX(decision_seq), 0) FROM decisions) AS decision_seq
`);

const startedAt = Date.now();

// One stream for the process: one flush tick, one dirty set, N subscribers (DESIGN §11). A timer
// per connection would multiply the reads by the number of open browser tabs.
/**
 * **B44** — the raw tail's ring, fed at the ingest boundary and sampled by the flush tick (§11).
 *
 * Created here rather than inside `createStream` because the INGEST route is what feeds it: a
 * delivery that was rejected never became a `signals` row, and the tail is the only surface it is
 * ever visible on. Reading the store instead would show only accepted events, and §13's injected
 * faults would be invisible on the one screen built to show them.
 */
const tail = createTail();
const stream = createStream(db, tail);

const routes: readonly Route[] = [
  {
    method: 'POST',
    path: '/api/ingest',
    handler: async (req, res) => {
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        // No parseable structure means no per-event attribution, so there is nothing to record
        // a delivery AGAINST. Failing the whole POST is the honest answer: the emitter still
        // holds the batch and retries, rather than us dropping it (DESIGN §5.1).
        sendJson(res, 400, { error: 'malformed_json' });
        return;
      }
      if (!Array.isArray(parsed)) {
        sendJson(res, 400, { error: 'expected_array_of_signals' });
        return;
      }
      // `source` is server-assigned (E15/D38): the wire cannot set it. Live POSTs are 'live';
      // 'backfill' belongs to the in-process seeder alone.
      // The SAME clock the ingest transaction stamps `received_at` with, threaded so the tail
      // cannot show a second, slightly different arrival time for the same delivery.
      const receivedAt = new Date().toISOString();
      const { result, dirty } = ingest(db, parsed, 'live', () => receivedAt);
      // AFTER the ingest transaction has committed, and before the response: the flush tick will
      // pick these up within FLUSH_MS. Only `result` goes on the wire — the bucket set is internal
      // (B09).
      stream.markDirty(dirty);
      // B44: every delivery, accepted or not, in the posted order. After the commit, like the
      // dirty set — a tail entry for a transaction that rolled back would be a fact that never
      // happened.
      tail.record({ events: parsed, outcomes: result.outcomes, source: 'live', received_at: receivedAt });
      // ANNOTATED on purpose. `sendJson` takes `unknown`, so the response shape is invisible to
      // `tsc`: B09 changed `ingest()`'s return and would have shipped `{result,dirty}` to the
      // emitter with a clean typecheck. The annotation is what makes the next such change an
      // error instead of a rule someone has to remember.
      const responseBody: IngestResult = result;
      sendJson(res, 200, responseBody);
    },
  },
  {
    method: 'POST',
    path: '/api/decisions',
    handler: async (req, res) => {
      // The lever. DESIGN §11: folds, opens the generation, writes `ads` and returns the NEW
      // state in one transaction — so the console never shows an optimistic value that could
      // then be rejected. `ts` and `actor` are ours (U7, U2); the wire cannot set either.
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'malformed_json' });
        return;
      }
      // Annotated for the same reason the ingest response is: `sendJson` hides the shape from tsc.
      const result: PostResult = postDecision(db, parsed);
      sendJson(res, result.status, result.body);
    },
  },
  {
    method: 'GET',
    path: '/api/decisions',
    handler: (_req, res, url) => {
      // In fold order. B47's console reverses it; this endpoint answers "what produced this
      // config", which is a question with exactly one correct order.
      sendJson(res, 200, { decisions: listDecisions(db, url.searchParams.get('ad_id')) });
    },
  },
  {
    method: 'GET',
    /**
     * **B46 — the swap picker's candidates.** Static reference data: no lever writes `components`
     * (`SCOPE.md` §4 cut #7), so this takes no window, no selection and no cursor. Its own endpoint
     * rather than a member of the snapshot because §3.1 fixes that envelope and because re-sending
     * a constant on every window roll would be four copies a minute of something that never moves.
     */
    path: '/api/components',
    handler: (_req, res) => {
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: { components: ComponentRow[] } = { components: listComponents(db) };
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    /**
     * **B56 / P15 — the Workbench's one read-only screen** (`DESIGN.md` §8, D1).
     *
     * `/api/components` above is the swap picker's flat candidate list; this is the same table
     * joined against `ads`. Two endpoints rather than one payload with an optional join, because
     * the picker is asked for on every page load and never changes, while this one is a read of
     * the FOLD and changes every time a lever is pulled.
     */
    path: '/api/components/usage',
    handler: (_req, res) => {
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: { lineages: LineageUsage[] } = { lineages: componentUsage(db) };
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    /**
     * **B50a / P18 — decision scoring** (`SCOPE.md` §4 cut #1, taken back by D68; window by D70).
     *
     * `?horizon_h=` because the withholding rule is the horizon's: a score is withheld until both
     * windows are past it (D19/D13), so **B49's control is what makes a score producible live** —
     * shorten the horizon and the withholding releases. That pairing is D19's own recommendation
     * and it is the reason these two endpoints take the same parameter.
     *
     * Read-only. There is no score column and there must not be: a score is a function of the log,
     * the rollups, the horizon and the read clock, and three of those four move.
     */
    path: '/api/scores',
    handler: (_req, res, url) => {
      const raw = url.searchParams.get('horizon_h');
      let horizonMs = HORIZON_MS;
      if (raw !== null) {
        const hours = Number(raw);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
          sendJson(res, 400, { error: 'bad_request', message: `horizon_h: '${raw}' must be in (0, 168]` });
          return;
        }
        horizonMs = hours * 3_600_000;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: { horizon_h: number; window_h: number; scores: DecisionScore[] } = {
        horizon_h: horizonMs / 3_600_000,
        window_h: 6,
        scores: scoreDecisions(db, new Date().toISOString(), horizonMs),
      };
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    path: '/api/snapshot',
    handler: (_req, res, url) => {
      // DESIGN §3.1 step 1. **The envelope is complete as of B47/B48**: `ads[]` landed at B36,
      // `generations[]` and `decisions[]` land here with the surfaces that read them, and
      // `stream_health` rides the stream's own frames (B44) rather than this response. Every
      // member is read in ONE transaction, which is what makes a chart annotated with a
      // generation boundary and a log explaining it describe the same instant.
      const parsed = parseSnapshotQuery(url.searchParams);
      if (!parsed.ok) {
        sendJson(res, 400, { error: 'bad_request', message: parsed.error });
        return;
      }
      // **B38 / D66: `?include=totals` serves the totals alone** — the same window, the same read
      // transaction, no buckets and no portfolio. Measured on the seeded week: 20 ms and ~2 KB
      // against 449 ms and 24 MB for the full snapshot, which is what makes a rolling window (D65)
      // able to keep its headline current without re-fetching what it already holds.
      //
      // Both bodies are annotated at the CALL SITE on purpose (§14, found at B09): `sendJson` takes
      // `unknown`, so without these two declarations a change to either return shape typechecks
      // clean and silently changes what the client receives.
      if (parsed.totalsOnly) {
        const body: TotalsResponse = totalsOnly(db, parsed.query);
        sendJson(res, 200, body);
        return;
      }
      const body: Snapshot = snapshot(db, parsed.query);
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    /**
     * **B43 — the restatement timeline** (`DESIGN.md` §5.6). Its own endpoint rather than a member
     * of the snapshot, because it answers a different question over the same window: the snapshot
     * says what the numbers ARE, this says which of them moved after they had settled and by how
     * much. It takes the same `?from&to&ads`, so the two cannot describe different portfolios.
     */
    path: '/api/restatements',
    handler: (_req, res, url) => {
      const parsed = parseSnapshotQuery(url.searchParams);
      if (!parsed.ok) {
        sendJson(res, 400, { error: 'bad_request', message: parsed.error });
        return;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: { query: typeof parsed.query; entries: RestatementEntry[] } = {
        query: parsed.query,
        entries: restatements(db, parsed.query),
      };
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    /**
     * **B45 — the fatigue flag** (`SIMULATOR.md` §19). Per `(lineage × audience)` pair, both slots.
     *
     * No window parameter, deliberately: the PEAK is a property of the pair's whole life, so a
     * windowed version of this question would report a different answer for the same pair depending
     * on what was on screen. It is a display flag and never a recommendation (D26 cut #6).
     */
    path: '/api/fatigue',
    handler: (_req, res) => {
      const body: FatigueReport = fatigueReport(db);
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    /**
     * **B49 / P16 — the settlement sweep** (`DESIGN.md` §5.7, F2).
     *
     * `?to_horizon_h=2` re-evaluates settlement across the band whose state actually changes, and
     * reports what flipped and which of those had already moved by the time the new horizon says
     * they were settled. **Read-only**: it writes no `restated_at`, because that column is
     * `apply()`'s (D7) and a sweep that wrote it would make `/api/verify` diverge on a correct
     * store. `?from_horizon_h=` defaults to D13's 72 h.
     */
    path: '/api/settlement/sweep',
    handler: (_req, res, url) => {
      const parse = (name: string, fallback: number): number | null => {
        const raw = url.searchParams.get(name);
        if (raw === null) return fallback;
        const hours = Number(raw);
        return Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours * 3_600_000 : null;
      };
      const from = parse('from_horizon_h', HORIZON_MS);
      const to = parse('to_horizon_h', HORIZON_MS);
      if (from === null || to === null) {
        sendJson(res, 400, {
          error: 'bad_request',
          message: `from_horizon_h / to_horizon_h must be a number of hours in (0, 168]; the control offers ${HORIZON_CHOICES_H.join(', ')}`,
        });
        return;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: SweepResult = sweep(db, from, to);
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    path: '/api/stream',
    handler: (req, res, url) => {
      // Never returns: the response becomes a long-lived SSE stream (DESIGN §3.1 steps 2-4).
      // B10a added resume — the cursor is `max(?cursor=N, Last-Event-ID)` per D47.
      stream.subscribe(req, res, url);
    },
  },
  {
    method: 'POST',
    /**
     * **B53 / P12 — the drill-down** (`DESIGN.md` §10.2). *"Can you trace any number on screen back
     * to the raw events beneath it — and do they agree?"*
     *
     * POST rather than GET because the body is a signed descriptor — a query object, not a set of
     * parameters, and one that must arrive byte-identical to how it was issued or the HMAC fails.
     *
     * **Read-only** (D7): it reads `rollup_minute` by the display path and raw `signals` by
     * `replay()`, and compares them. It writes nothing, so it is safe to hit repeatedly in front of
     * a reviewer, including while the simulator is running.
     *
     * 200 for MATCH **and** for MISMATCH: a divergence is a successful answer to the question this
     * endpoint was asked, and the verdict is in the body. A 4xx here means the REQUEST was wrong —
     * an unissued descriptor, or a narrowing at the wrong grain (D46).
     */
    path: '/api/trace',
    handler: async (req, res) => {
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'malformed_json' });
        return;
      }
      const request = parseTraceRequest(parsed);
      if (!request.ok) {
        sendJson(res, request.status, { error: request.error, message: request.message });
        return;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const result: TraceResult = trace(db, request.descriptor);
      sendJson(res, 200, result);
    },
  },
  {
    method: 'GET',
    /**
     * **B55 / P13 — `trace <event_id>`** (`DESIGN.md` §10.4). The "life of one event" deliverable,
     * executable: paste any id off the raw tail and read all eight steps as rows.
     *
     * A GET with one parameter, unlike `/api/trace`: this takes an identifier, not a signed query,
     * because an `event_id` is not a number on screen and there is nothing to quarantine. It ENDS
     * in a descriptor, so the last step hands the reviewer back to the drill-down.
     */
    path: '/api/trace/event',
    handler: (_req, res, url) => {
      const event_id = url.searchParams.get('event_id');
      if (event_id === null || event_id.trim() === '') {
        sendJson(res, 400, { error: 'bad_request', message: 'event_id is required' });
        return;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const body: EventTrace = traceEvent(db, event_id.trim());
      // 200 even with no deliveries: "this store never saw that id" is an answer to the question,
      // and a 404 would make a mistyped id look like a broken endpoint.
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    path: '/api/verify',
    handler: (_req, res) => {
      // B22/§7. Rebuilds every projection from the logs into shadow tables and diffs them against
      // the live ones. Read-only with respect to `main` — the rebuild lands in `temp` (D55) — so
      // it is safe to hit at any time, including while the simulator is running.
      const result: VerifyResult = verify(db);
      // 200 for a clean bill, 409 for a divergence: a reviewer refreshing this should not have to
      // read the body to know the answer, and a script should not have to either.
      sendJson(res, result.ok ? 200 : 409, result);
    },
  },
  {
    method: 'POST',
    /**
     * **B50 / P17 — the scenario trigger** (`SIMULATOR.md` §17). *"I need to be able to cause the
     * interesting thing to happen live rather than wait for it."*
     *
     * Persists a row and returns; **no second control channel** — the simulator picks it up on the
     * `GET /api/sim/world` poll it is already making once a second. The row is what makes §14's
     * determinism claim true: `(seed + decision log + sim_scenarios) -> world` (D40).
     */
    path: '/api/sim/scenario',
    handler: async (req, res) => {
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'malformed_json' });
        return;
      }
      // Annotated at the call site (§14, B09): `sendJson` takes `unknown`.
      const result: ScenarioResult = postScenario(db, parsed);
      sendJson(res, result.status, result.body);
    },
  },
  {
    method: 'GET',
    /** The replayable record itself — every trigger fired, and whether the simulator has it yet. */
    path: '/api/sim/scenario',
    handler: (_req, res) => {
      const body: { scenarios: (ScenarioRow & { consumed_at: string | null })[] } = {
        scenarios: listScenarios(db),
      };
      sendJson(res, 200, body);
    },
  },
  {
    method: 'GET',
    path: '/api/sim/world',
    handler: (req, res) => {
      // B31a / D40-A. The simulator's one window onto the world, polled once per tick: config and
      // status, the fold's high-water mark, §7's F per pair recomputed from the log,
      // `spend_so_far_today` on the account-local day and pending scenarios — all in one read
      // transaction, because the emitter acts on all of it at once.
      //
      // A GET the Workbench half-wants anyway (DESIGN §8): cumulative delivery per
      // (lineage, audience) is the temporal reverse join, not a simulator-only query.
      //
      // **B35a: `?include=pending` adds §15.3(b)'s pending set, and nothing else does.** It is a
      // boot-time handover rather than a per-tick fact — fixed at `T0`, only shrinking — and it was
      // 99.8% of this response. Opt-IN rather than opt-out, so the 1 Hz path is small by default.
      // Unrecognised `include` values are ignored rather than rejected: this endpoint has one
      // caller and a 400 here stalls the emitter, which is the worse failure.
      const include = new URL(req.url ?? '/', 'http://localhost').searchParams.get('include');
      const world = simWorld(db, Date.now(), include === 'pending');
      sendJson(res, 200, world);
      // B50: after the read transaction and after the response is on the wire. Serve-and-mark, and
      // the ASSUMPTION that this is the right delivery semantic is written out in `sim-world.ts`.
      markScenariosConsumed(db, world.pending_scenarios.map((s) => s.scenario_id));
    },
  },
  {
    method: 'GET',
    path: '/api/health',
    handler: (_req, res) => {
      sendJson(res, 200, {
        status: 'ok',
        db_path: DB_PATH,
        schema_version: version,
        log_position: logPosition.get(),
        stream_subscribers: stream.size(),
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
      });
    },
  },
];

const server = createServer(createRouter(routes));

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} — store ${DB_PATH}`);
});

// Ctrl-C must close the store, or WAL recovery runs on the next open. Harmless, but it makes a
// clean restart look like a crash recovery in the logs, and HR1 is a claim about restarts.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal} — closing`);
    // SSE connections MUST be closed first. `server.close()` waits for open connections to end,
    // and a subscriber never ends on its own — so without this, Ctrl-C hangs forever with a
    // browser tab open, which is a regression of B04's verified clean shutdown.
    stream.shutdown();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
