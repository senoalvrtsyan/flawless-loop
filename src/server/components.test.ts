// B46. Two properties, and both are about the console's swap list rather than about SQL.
//
// D43 says a test earns its place when being wrong is invisible. A component list that came back
// in the wrong order is visible; a list whose `kind` values do not match the two slot names is
// NOT — the console would filter `kind === 'video'` against rows saying something else and render
// an empty picker, which looks exactly like a store with no components in it.
//
// **Measured against the real store rather than assumed, and the first version of this test was
// wrong.** It asserted that the only two kinds ARE `video` and `headline`; the seeded store holds
// sixteen components across FOUR kinds — `body_copy`, `headline`, `image`, `video` — because the
// component library is richer than the two slots `DecisionBody` can swap (§2.3). The fixture below
// now carries a third kind for that reason, and the property under test is the one the console
// actually depends on: filtering by the slot name yields exactly the swappable rows and drops the
// rest. A fixture that agreed with the code and disagreed with the store would have passed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listComponents } from './components.ts';

function store(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE components (
      component_id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL, lineage_id TEXT NOT NULL, version INTEGER NOT NULL,
      parent_id TEXT
    ) STRICT;
    INSERT INTO components VALUES
      ('h_01','headline','Free shipping','2026-08-27T00:00:00.000Z','hl_01',1,NULL),
      ('v_05','video','Unboxing hook, recut','2026-08-27T00:00:00.000Z','vl_01',2,'v_01'),
      ('v_01','video','Unboxing hook, 15s','2026-08-27T00:00:00.000Z','vl_01',1,NULL),
      ('b_01','body_copy','30 days free','2026-08-27T00:00:00.000Z','bl_01',1,NULL);
  `);
  return db;
}

test('filtering by slot name yields the swappable rows and drops every other kind', () => {
  const all = listComponents(store());
  // `ComponentSlot` is 'video' | 'headline' (shared/decisions.ts), and the library holds more
  // kinds than that. Both slot names must MATCH something — a seed that spelled a kind
  // differently would empty the picker with no error — and nothing else may leak into it.
  assert.deepEqual(all.filter((c) => c.kind === 'video').map((c) => c.component_id), ['v_01', 'v_05']);
  assert.deepEqual(all.filter((c) => c.kind === 'headline').map((c) => c.component_id), ['h_01']);
  assert.equal(all.length, 4, 'the un-swappable kinds are still returned — B56 reads the library');
});

test('a lineage keeps its versions adjacent and in order — the recut follows its parent', () => {
  const ids = listComponents(store()).map((c) => c.component_id);
  assert.deepEqual(ids, ['b_01', 'h_01', 'v_01', 'v_05']);
  const recut = listComponents(store()).find((c) => c.component_id === 'v_05');
  assert.equal(recut?.parent_id, 'v_01');
  assert.equal(recut?.version, 2);
});
