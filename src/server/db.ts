// The store. DESIGN.md §2: SQLite via built-in `node:sqlite` (D8), Node 24 floor.
// No new dependency; the transaction wrapper below is the "~10 lines" that decision bought.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Where the store lives. Not specified by any design document — see the ASSUMPTION note in
 * the B02 report. One env var to move it; the simulator and server must agree, which they do
 * by both importing this.
 */
export const DB_PATH = resolve(process.env.DB_PATH ?? 'data/loop.sqlite');

/**
 * Open the store and apply the four pragmas DESIGN.md §2 specifies, in that order.
 *
 * `synchronous = NORMAL` is the deliberate line: WAL + NORMAL survives the simulator or the
 * server being killed mid-demo, which is hard requirement #1. It does not survive a host power
 * cut, which nothing in the brief asks for.
 */
export function openDb(path: string = DB_PATH): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');

  // WAL is a persistent property of the file, and a filesystem that cannot provide it (a network
  // mount, most notably) refuses SILENTLY and leaves the store in `delete` mode. HR1 would then
  // degrade with no error anywhere. Fail loudly at open instead.
  const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string } | undefined;
  if (mode?.journal_mode !== 'wal') {
    throw new Error(`${path}: journal_mode is '${mode?.journal_mode}', expected 'wal' (DESIGN §2)`);
  }
  return db;
}

/**
 * Run `fn` inside one write transaction. BEGIN IMMEDIATE takes the write lock up front, so a
 * busy store waits out `busy_timeout` here rather than failing halfway through on upgrade.
 *
 * Does NOT nest — SQLite has no nested transactions and savepoints are not needed here, because
 * DESIGN.md §11 makes each ingest batch and each lever write exactly one transaction.
 */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
