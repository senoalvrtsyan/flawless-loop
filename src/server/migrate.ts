// Migration runner. Applies every unapplied `migrations/*.sql` in filename order.
//
// Applied-count is tracked in SQLite's built-in `PRAGMA user_version` rather than in a
// bookkeeping table, so the migration machinery leaves NO table behind that DESIGN.md §2 does
// not describe. `.schema` shows exactly the model and nothing else — which matters because
// §2 is the document a reviewer diffs the store against.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, tx, DB_PATH } from './db.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'migrations');

/** Apply pending migrations. Returns the filenames applied, in order. */
export function migrate(db: DatabaseSync): string[] {
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const applied = row.user_version;

  if (applied > all.length) {
    throw new Error(
      `store is at migration ${applied} but only ${all.length} exist — wrong or stale store`,
    );
  }

  const pending = all.slice(applied);
  // Each migration and its version bump commit together, so a failure part-way leaves the store
  // exactly where it was rather than half-migrated.
  pending.forEach((file, i) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    tx(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${applied + i + 1}`);
    });
  });
  return pending;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const applied = migrate(db);
  console.log(`store: ${DB_PATH}`);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date, nothing to apply');
  db.close();
}
