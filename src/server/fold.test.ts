// D43: `node:test`, on the functions whose wrong answer is INVISIBLE. The fold is the first —
// a wrong fold puts A config on screen, and only the decision log knows it is the wrong one.
//
// Run: `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, precondition, type FoldState } from './fold.ts';
import type { AdConfig, DecisionBody } from '../shared/decisions.ts';

const T = (n: number): string => new Date(Date.UTC(2026, 8, 4, 12, n)).toISOString();

const INITIAL = {
  name: 'Autumn video — 25-34 IT',
  video_id: 'vl_04_v1',
  headline_id: 'hl_01_v1',
  audience_id: 'aud_25_34_it',
  channel: 'meta_feed',
  daily_budget_cents: 50_000,
} as const;

/** Fold a whole sequence the way applyDecision will: precondition, then fold, then carry state. */
function run(bodies: readonly DecisionBody[], from: FoldState = null): FoldState {
  let state = from;
  bodies.forEach((body, i) => {
    const error = precondition(state, body);
    assert.equal(error, null, `step ${i} (${body.action}) was rejected: ${error?.message}`);
    state = fold(state, { ts: T(i), body });
  });
  return state;
}

const LIVE: readonly DecisionBody[] = [
  { action: 'create_ad', initial: INITIAL },
  { action: 'launch' },
];

test('the six actions fold to the expected config', () => {
  const state = run([
    ...LIVE,
    { action: 'set_budget', from_cents: 50_000, to_cents: 30_000 },
    { action: 'swap_component', slot: 'video', from_id: 'vl_04_v1', to_id: 'vl_04_v2' },
    { action: 'pause' },
    { action: 'resume' },
  ]);

  const expected: AdConfig = {
    name: 'Autumn video — 25-34 IT',
    created_at: T(0),
    status: 'live',
    video_id: 'vl_04_v2',
    headline_id: 'hl_01_v1',
    audience_id: 'aud_25_34_it',
    channel: 'meta_feed',
    daily_budget_cents: 30_000,
    launched_at: T(1),
  };
  assert.deepEqual(state, expected);
});

test('launch is the only writer of launched_at (G02) — resume does not re-stamp it', () => {
  const state = run([...LIVE, { action: 'pause' }, { action: 'resume' }]);
  assert.equal(state?.launched_at, T(1), 'launched_at moved to the resume');
});

test('create_ad derives created_at from the decision ts and opens in draft', () => {
  const state = fold(null, { ts: T(7), body: { action: 'create_ad', initial: INITIAL } });
  assert.equal(state.created_at, T(7));
  assert.equal(state.status, 'draft');
  assert.equal(state.launched_at, null);
});

test('fold is pure — the input state is never mutated', () => {
  const before = run(LIVE) as AdConfig;
  const snapshot = structuredClone(before);
  fold(before, { ts: T(9), body: { action: 'set_budget', from_cents: 50_000, to_cents: 1 } });
  assert.deepEqual(before, snapshot);
});

test('an action against an ad the log never created is ad_unknown', () => {
  assert.equal(precondition(null, { action: 'launch' })?.code, 'ad_unknown');
  assert.equal(precondition(null, { action: 'pause' })?.code, 'ad_unknown');
});

test('create_ad against an existing ad is ad_exists', () => {
  assert.equal(precondition(run(LIVE), { action: 'create_ad', initial: INITIAL })?.code, 'ad_exists');
});

test('the transition table: draft admits only launch (D5 — draft edits are not in the log)', () => {
  const draft = run([{ action: 'create_ad', initial: INITIAL }]);
  for (const body of [
    { action: 'pause' },
    { action: 'resume' },
    { action: 'set_budget', from_cents: 50_000, to_cents: 1 },
  ] satisfies DecisionBody[]) {
    assert.equal(precondition(draft, body)?.code, 'illegal_transition', body.action);
  }
  assert.equal(precondition(draft, { action: 'launch' }), null);
});

test('the transition table: live and paused admit their own halves', () => {
  const live = run(LIVE);
  const paused = run([...LIVE, { action: 'pause' }]);
  assert.equal(precondition(live, { action: 'launch' })?.code, 'illegal_transition');
  assert.equal(precondition(live, { action: 'resume' })?.code, 'illegal_transition');
  assert.equal(precondition(paused, { action: 'pause' })?.code, 'illegal_transition');
  // A paused ad's budget and components stay adjustable — the lever set does not lock while paused.
  assert.equal(precondition(paused, { action: 'set_budget', from_cents: 50_000, to_cents: 1 }), null);
});

test("F1: the `archived` branch is present, unreachable, and admits nothing", () => {
  // No lever produces this state (SCOPE.md §4 cut #3), so the only way to exercise the branch is
  // to hand it one. Every action is refused; nothing throws. If `archive` is ever reinstated, this
  // test is the thing that fails and says so.
  const archived: AdConfig = { ...(run(LIVE) as AdConfig), status: 'archived' };
  for (const body of [
    { action: 'launch' },
    { action: 'pause' },
    { action: 'resume' },
    { action: 'set_budget', from_cents: 50_000, to_cents: 1 },
    { action: 'swap_component', slot: 'video', from_id: 'vl_04_v1', to_id: 'vl_04_v2' },
  ] satisfies DecisionBody[]) {
    assert.equal(precondition(archived, body)?.code, 'illegal_transition', body.action);
  }
});

test('I13: a stale from_cents is refused, a current one passes', () => {
  const live = run(LIVE);
  const stale = precondition(live, { action: 'set_budget', from_cents: 49_999, to_cents: 1 });
  assert.equal(stale?.code, 'stale_precondition');
  assert.match(stale?.message ?? '', /49999.*50000/);
  assert.equal(precondition(live, { action: 'set_budget', from_cents: 50_000, to_cents: 1 }), null);
});

test('I13: from_id is checked against the named slot, not either slot', () => {
  const live = run(LIVE);
  // `hl_01_v1` IS the current headline — but this is a video swap, so it is stale for this slot.
  const crossed: DecisionBody =
    { action: 'swap_component', slot: 'video', from_id: 'hl_01_v1', to_id: 'vl_04_v2' };
  assert.equal(precondition(live, crossed)?.code, 'stale_precondition');
  assert.equal(
    precondition(live, { action: 'swap_component', slot: 'headline', from_id: 'hl_01_v1', to_id: 'hl_02_v1' }),
    null,
  );
});

test('a swap moves the named slot and leaves the other one alone', () => {
  const state = run([
    ...LIVE,
    { action: 'swap_component', slot: 'headline', from_id: 'hl_01_v1', to_id: 'hl_02_v1' },
  ]);
  assert.equal(state?.headline_id, 'hl_02_v1');
  assert.equal(state?.video_id, 'vl_04_v1');
});
