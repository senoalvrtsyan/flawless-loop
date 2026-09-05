// B57. `npm start` — the one command. Migrate, seed IF the store is empty, then hand off to the
// dev runner, and print the URL when the cockpit is actually accepting connections.
//
// Plain `.mjs` for the same reason as `dev.mjs`: this is build tooling, outside `tsconfig.json`.
// It imports two `.ts` modules directly (Node 24 strips their types) rather than re-deriving the
// store path or the migration list — `DB_PATH` and `migrate()` must not exist twice.
//
// Two properties, both of which are the difference between "shippable" and "looks broken":
//
//   1. **It never reseeds a non-empty store.** The test is `SELECT COUNT(*) FROM ads`, which is
//      the same test `seedWorld()` refuses on, so the two cannot drift into disagreeing. A second
//      `npm start` on a seeded store is a no-op that starts the app — not a five-minute wait, and
//      not a merge into a world whose `T0` no longer matches its own launches.
//   2. **It prints progress.** The seed measures 5m20s (B34: 249 s generate · 0.3 s sort · 70 s
//      write) and the generate phase writes nothing to stdout at all. Four minutes of silence
//      after `npm start` reads as a hang, and the reviewer's next move is Ctrl-C. So stdout is
//      piped rather than inherited, and a heartbeat fires whenever the child has been quiet.

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { openDb, DB_PATH } from '../src/server/db.ts';
import { migrate } from '../src/server/migrate.ts';

const WEB_PORT = 5173;
const API_PORT = process.env.PORT ?? 8787;
const QUIET_MS = 15_000; // how long the seeder may say nothing before we say something for it

/** Format elapsed ms the way a person waiting reads it. */
const elapsed = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`);

// ── 1. Migrate, and ask the store whether it has a world ────────────────────────────────────────

const db = openDb();
const applied = migrate(db);
const ads = db.prepare('SELECT COUNT(*) AS c FROM ads').get().c;
db.close();

console.log(`[start] store ${DB_PATH}`);
console.log(`[start] ${applied.length ? `applied ${applied.join(', ')}` : 'schema up to date'}`);

// ── 2. Seed, but only into an empty world ───────────────────────────────────────────────────────

if (ads > 0) {
  console.log(`[start] ${ads} ads already exist — not seeding (delete data/ to reset, U8)`);
} else {
  console.log('[start] empty store — seeding the seeded week (SIMULATOR.md §15.2)');
  console.log('[start] measured at B34: ~5m20s wall and ~750 MB on disk, most of it GENERATING');
  console.log('[start] levers: SIM_BACKFILL_DAYS=5 for a shorter week · SIM_SEED=… for a different world');

  const code = await new Promise((resolve) => {
    const started = Date.now();
    let lastOutput = started;

    const child = spawn(process.execPath, ['src/sim/seed-world.ts'], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    // Forwarded verbatim, including the seeder's own `\r` progress line — we add a heartbeat, we
    // do not reformat what it says.
    child.stdout.on('data', (chunk) => {
      lastOutput = Date.now();
      process.stdout.write(chunk);
    });

    const beat = setInterval(() => {
      if (Date.now() - lastOutput < QUIET_MS) return;
      lastOutput = Date.now();
      process.stdout.write(`\n[start] still seeding — ${elapsed(Date.now() - started)} elapsed\n`);
    }, 1_000);

    child.on('exit', (code, signal) => {
      clearInterval(beat);
      console.log(`[start] seed finished in ${elapsed(Date.now() - started)}`);
      resolve(signal ? 1 : (code ?? 1));
    });
    child.on('error', (err) => {
      clearInterval(beat);
      console.error(`[start] seed failed to launch: ${err.message}`);
      resolve(1);
    });
  });

  if (code !== 0) {
    console.error(`[start] seeding exited ${code} — not starting the app on a half-built world`);
    process.exit(code);
  }
}

// ── 3. Hand off to the dev runner ───────────────────────────────────────────────────────────────
//
// `dev.mjs` already owns the three-process lifetime (D32: server, simulator, Vite — a crash in any
// tears the rest down). Spawning it rather than re-implementing it means there is one supervisor,
// not two that can disagree about what a clean exit means. The client is served by Vite's dev
// server, which is D41-A's arrangement and is stated as such in the README.

const runner = spawn(process.execPath, ['scripts/dev.mjs'], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => runner.kill(signal));
}
runner.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0);
});

// ── 4. Say where it is, once it is actually there ───────────────────────────────────────────────
//
// Announcing the URL before the port is listening invites a refresh loop against a connection
// refused. Poll instead, and give up saying it rather than give up waiting.

const listening = (port) =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
      .on('connect', () => (socket.destroy(), resolve(true)))
      .on('error', () => resolve(false));
  });

for (let i = 0; i < 120 && runner.exitCode === null; i++) {
  if (await listening(WEB_PORT)) {
    console.log('');
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log(`  │  cockpit   http://localhost:${WEB_PORT}            │`);
    console.log(`  │  health    http://localhost:${API_PORT}/api/health │`);
    console.log('  └─────────────────────────────────────────────┘');
    console.log('');
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
