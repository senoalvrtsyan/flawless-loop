// Dev runner. Starts the server and the simulator as TWO OS PROCESSES (D32, DESIGN §11) and
// wires their lifetimes together, so `npm run dev` is one Ctrl-C rather than two terminals.
//
// Plain `.mjs`, run by node directly: this is build tooling, not app code, so it is outside
// `tsconfig.json`'s `include` and carries no types.

import { spawn } from 'node:child_process';

// B08 adds the client. Vite is a dev-time process only (D41): it serves `src/web` on :5173 and
// proxies `/api` to the server on :8787, so the client uses relative URLs and needs no CORS.
const PROCS = [
  { name: 'server', entry: 'src/server/index.ts' },
  { name: 'sim', entry: 'src/sim/index.ts' },
  { name: 'web', entry: 'node_modules/vite/bin/vite.js' },
];

const children = [];
let shuttingDown = false;

/** Kill everything still running, then leave with `code`. */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const { name, entry } of PROCS) {
  // `stdio: inherit` — the children's logs are the runner's logs, unprefixed and uninterleaved
  // by us. Node's own `ExperimentalWarning` for `node:sqlite` stays visible on purpose (U9).
  const child = spawn(process.execPath, [entry], { stdio: 'inherit' });
  children.push({ name, child });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.error(`[dev] ${name} killed by ${signal} — stopping the rest`);
      shutdown(1);
    } else if (code !== 0) {
      console.error(`[dev] ${name} exited with ${code} — stopping the rest`);
      shutdown(code ?? 1);
    } else {
      // A clean exit is a process that finished its work, not a failure. Today the simulator
      // is still a B11 placeholder that returns immediately; the server must survive that.
      console.log(`[dev] ${name} exited cleanly`);
      if (children.every(({ child: c }) => c.exitCode !== null)) shutdown(0);
    }
  });

  child.on('error', (err) => {
    console.error(`[dev] ${name} failed to start:`, err.message);
    shutdown(1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[dev] ${signal} — stopping ${children.length} processes`);
    shutdown(0);
  });
}
