// Server entry point. Opens the store once, mounts the routes, listens.
//
// DESIGN.md §11: this process owns every write to SQLite. The simulator is a separate OS process
// (D32) and reaches the store only through HTTP. One `DatabaseSync` handle for the process
// lifetime — `node:sqlite` is synchronous, so a request handler can never observe a half-applied
// transaction.

import { createServer } from 'node:http';
import { openDb, DB_PATH } from './db.ts';
import { createRouter, readBody, sendJson, type Route } from './http.ts';
import { ingest } from './ingest.ts';
import type { IngestResult } from '../shared/types.ts';
import { parseSnapshotQuery, snapshot } from './snapshot.ts';
import { createStream } from './stream.ts';

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
const stream = createStream(db);

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
      const { result, dirty } = ingest(db, parsed, 'live');
      // AFTER the ingest transaction has committed, and before the response: the flush tick will
      // pick these up within FLUSH_MS. Only `result` goes on the wire — the bucket set is internal
      // (B09).
      stream.markDirty(dirty);
      // ANNOTATED on purpose. `sendJson` takes `unknown`, so the response shape is invisible to
      // `tsc`: B09 changed `ingest()`'s return and would have shipped `{result,dirty}` to the
      // emitter with a clean typecheck. The annotation is what makes the next such change an
      // error instead of a rule someone has to remember.
      const responseBody: IngestResult = result;
      sendJson(res, 200, responseBody);
    },
  },
  {
    method: 'GET',
    path: '/api/snapshot',
    handler: (_req, res, url) => {
      // DESIGN §3.1 step 1. The response is the buckets plus the cursor and nothing more: the
      // envelope's other members arrive with the projections that produce them — `ads[]` and
      // `generations[]` with the fold (B12), `decisions[]` with the decision log read (B36),
      // `stream_health` with the telemetry block (B44).
      const parsed = parseSnapshotQuery(url.searchParams);
      if (!parsed.ok) {
        sendJson(res, 400, { error: 'bad_request', message: parsed.error });
        return;
      }
      sendJson(res, 200, snapshot(db, parsed.query));
    },
  },
  {
    method: 'GET',
    path: '/api/stream',
    handler: (_req, res) => {
      // Never returns: the response becomes a long-lived SSE stream (DESIGN §3.1 step 2-4).
      // B09 is the happy path — `Last-Event-ID` resume and the `resnapshot` frame are B10.
      stream.subscribe(res);
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
