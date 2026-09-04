 ▐▛███▛█   Claude Code v2.1.259
▝▜██████▀  Opus 5 · Claude Team
  ▝▝ ▝▝    ~/Desktop/Personal/flawless-loop


❯ /clear                                                                        

❯ Read CLAUDE.md and docs/STATUS.md. Then read only the one section of          
  docs/BUILD_PLAN.md and docs/DESIGN.md that the next chunk cites — do not      
  read anything else to "get oriented".                                         
                                                                                
  We are mid-Phase 5. B06 is committed and ticked, 6 of 62 chunks done.         
  Next chunk is B07 (GET /api/snapshot?from&to&ads). Nothing is blocking it.    
                                                                                
  Phase 5 rules from CLAUDE.md §5 apply strictly:                               
                                                                                
  - One plan item at a time. Announce what you're about to do and which item    
    it closes, BEFORE touching anything. Build it. Report what changed, how I   
    verify it by hand, and what you deliberately left out. Then stop.           
  - Wait for my "ok" before committing. On approval: commit referencing the     
    item, tick it in docs/BUILD_PLAN.md, then stop again and wait.              
  - No batching multiple items. No drive-by refactors, renames or               
    reformatting. No new dependencies without a DECISION.                       
  - If implementation reveals the design was wrong, stop coding, tell me, and   
    we reopen DESIGN.md. Do not patch around a design flaw.                     
  - Surface decisions, don't take them (§3). Record ratified ones in            
    docs/DECISIONS.md with my wording verbatim before building on them.         
  - Test claims against the real store rather than trusting them; anything      
    that fails silently goes in BUILD_PLAN.md §14 and the STATUS.md traps list. 
  - Migrations are append-only now — a schema change is a new numbered file.    
  - Every ~3 chunks, refresh docs/STATUS.md and tell me it's safe to /clear.    

● I'll start by reading the standing contract and status.

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● Now the two sections B07 cites — its plan row and DESIGN.md §3.1.

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● Now the code B07 must plug into, plus the rollup_minute DDL it reads.

  Searched for 2 patterns, read 1 file, ran 3 shell commands (ctrl+o to expand)

● Read the two cited sections and the code B07 plugs into. Here's the
  announcement.

  Chunk B07 — GET /api/snapshot?from&to&ads

  Closes BUILD_PLAN.md B07 (line 115). Spec DESIGN.md §3.1. Flag HR2.

  The first read path: one read transaction, returns the rollup_minute rows for
  a window plus as_of_ingest_seq. New file src/server/snapshot.ts + the route
  wiring in index.ts. Nothing else.

  Building now.

  Read 1 file (ctrl+o to expand)

● Now snapshot.ts.

  Ran 1 shell command (ctrl+o to expand)

● Now the route wiring.

  Ran 1 shell command (ctrl+o to expand)

● Now testing it against the real store rather than trusting it.

  Ran 8 shell commands (ctrl+o to expand)

● B07 report — GET /api/snapshot?from&to&ads

  Files: src/server/snapshot.ts (new, 145 lines, heavily commented),
  src/server/db.ts (+24: readTx), src/server/index.ts (+17: the route).
  Typecheck clean, npm test still 0 tests, /api/health and the 404 path
  unchanged.

  The contract it implements

  GET /api/snapshot?from=<iso>&to=<iso>[&ads=a_12,a_07]
  → { query: {from,to,ads}, buckets: [ …rollup_minute rows… ], as_of_ingest_seq
  }

  Four calls I made inside the chunk, each with a reason you may want to
  overturn:

  1. Bucket rows are 1:1 with the table — all 14 columns, no renaming, no
     reshaping. The plan's verification is "diff the JSON against sqlite3 by
     hand", and any translation here would make that a translation exercise. It
     also means B16/B18 widen apply() without touching the read path.
  2. from/to are canonicalised, not rejected — the opposite of ingest's B05
     rule, deliberately: ts on a signal is a received fact that must be stored
     unaltered; a window bound is a query, and normalising it is lossless. The
     resolved window is echoed back so nothing is silent. See the finding below
     — this is not a convenience.
  3. Half-open [from, to) on minute_start, matching
     config_generations.[valid_from, valid_to), so adjacent windows tile.
  4. as_of_ingest_seq is the global MAX(signals.ingest_seq), read inside the 
     same read transaction — not the max over returned buckets. It is what the
     client hands back as Last-Event-ID (§3.1 step 2, D18), so read after the
     transaction it would sit ahead of the data and the client would never learn
     about the events in between. No error, just a number that stops moving.
     That is the whole reason the transaction exists, and it's why readTx is a
     named function rather than a tx() flag — tx()'s BEGIN IMMEDIATE would take
     the write lock for a read.

  One finding, measured against the real store

  A window bound without milliseconds silently drops the minute it names.
  minute_start is TEXT, so the comparison is lexicographic, and 'Z' (0x5A) sorts
  after '.' (0x2E):

  from='…T12:00:00Z'  vs stored '…T12:00:00.000Z'  →  '…00Z' > '…00.000Z'  = 1
  buckets a naive bound would have returned: 1 of 3

  Both 12:00 buckets vanish. This is the B05 MIN(ts, received_at) trap on the
  read side — same root cause, silent in the same way. Canonicalising disarms it
  here, but the class recurs at B21's horizon sweep and every later window
  query, so I'd like to add one line to BUILD_PLAN.md §14 with the commit: every
  timestamp reaching a SQL comparison must be canonical ISO — the write side 
  rejects (B05), the read side canonicalises (B07); a same-shape string is what 
  makes byte order chronological order.

  How to verify by hand

  rm -rf data && npm run db:migrate && npm run dev     # or: node
  --experimental-strip-types src/server/index.ts
  S=localhost:8787; D=2026-09-03
  curl -s -X POST -H 'content-type: application/json' $S/api/ingest -d '[
   {"event_id":"i1","ts":"'$D'T12:00:10.000Z","ad_id":"a_12","event":"impression
  "},
   {"event_id":"i2","ts":"'$D'T12:00:50.500Z","ad_id":"a_12","event":"impression
  "},
   {"event_id":"i3","ts":"'$D'T12:01:05.000Z","ad_id":"a_12","event":"impression
  "},
   {"event_id":"i4","ts":"'$D'T12:00:30.000Z","ad_id":"a_07","event":"impression
  "}]'

  curl -s "$S/api/snapshot?from=${D}T12:00:00.000Z&to=${D}T13:00:00.000Z"      #
  3 buckets: a_07/12:00=1, a_12/12:00=2, a_12/12:01=1
  sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impressions,max_ingest_seq
  FROM rollup_minute ORDER BY ad_id,minute_start;"
  curl -s "$S/api/snapshot?from=${D}T12:00:00Z&to=${D}T12:01:00Z"              #
  no millis: still both 12:00 buckets; query echoes .000Z
  curl -s "$S/api/snapshot?from=${D}T12:01:00Z&to=${D}T12:02:00Z"              #
  half-open: only the 12:01 bucket
  curl -s "$S/api/snapshot?from=${D}T12:00:00Z&to=${D}T13:00:00Z&ads=a_07,%20a_1
  2%20,a_07"   # dedupes, trims, sorts
  curl -s "$S/api/snapshot?from=${D}T13:00:00Z&to=${D}T12:00:00Z"              #
  400 inverted; also: missing from, 'nonsense', ads=

  What I ran and got: the API JSON and the sqlite3 JSON for the same window were
  byte-identical; rollup impressions 4 == raw COUNT(*) WHERE kind='impression'
  4; kill the server, restart, same snapshot and same as_of (HR1); a write after
  a snapshot still commits (BEGIN DEFERRED released); grep -E 
  'INSERT|UPDATE|DELETE' over snapshot.ts is empty (D7).

  Access paths (§2.4, re-checked with the real 14-column list): per-ad is SEARCH
  rollup_minute USING PRIMARY KEY (ad_id=? AND minute_start>? AND 
  minute_start<?) — the verified hot read. The portfolio window is SEARCH … 
  USING INDEX ix_rollup_time plus USE TEMP B-TREE FOR ORDER BY — the sort is the
  price of ordering both paths identically by (ad_id, minute_start); ORDER BY 
  minute_start alone is index-ordered and needs no sort. ~120k rows at full
  portfolio size, so it's worth knowing about but not worth pre-optimising.

  Deliberately left out

  - The rest of §3.1's envelope, each with the chunk that produces it:
    ads[]/generations[] (the fold, B12), decisions[] (B36), stream_health (B44 —
    it is named in §3.1 and defined nowhere in DESIGN.md; B44's telemetry block
    is the definition). Noted in the route comment so B08's client knows the
    envelope grows.
  - Settlement state (B21), ratios (B38), TraceDescriptor (B51), granularity
    (B36), SSE (B09).
  - No row cap and no granularity. A 7-day all-ads window is ~120,960 minute
    rows ≈ tens of MB of JSON. I couldn't measure it — data/ is a fresh empty
    store, the B06 seed is gone. Nothing before B36 asks for a window that wide,
    and B36 is where granularity is chosen, so I'd rather raise it there than
    cap it here on a guess. Flagging it now so it isn't discovered at B36.

  Stopped. Nothing committed, BUILD_PLAN.md not ticked — waiting on your ok.

✻ Brewed for 6m 5s · done 10:00 AM

❯ ok, B07 approved, §14 line goes in. Three things:                             
  1. Snap bounds to the minute, echo the snapped values. Measured: [12:00:00Z,  
  12:00:30Z) returns the whole 12:00 bucket including an impression at          
  12:00:50; [12:00:20Z, 13:00:00Z) drops that same impression. Over-counts at   
  to, under-counts at from, nothing says so. Bites at B53 — the drill-down      
  re-sums raw over [from,to) and would print FAIL for a reason that isn't       
  corruption.                                                                   
  2. Require an explicit offset on from/to. ?from=2026-09-03T12:00:00 parses as 
  local time — resolved to 08:00:00.000Z here, zero buckets, and a different    
  answer on another laptop.                                                     
  3. Separate chunk before B21: src/shared/time.ts — isCanonicalIso /           
  toCanonicalIso / floorMinute. That invariant now has three implementations    
  (ingest's Date round-trip, apply's regex, snapshot's inline canonicalise)     
  linked only by a §14 note. B21's horizon sweep is the fourth.                 
     Add to §14: …window bounds must additionally be minute-aligned, because a  
  bound inside a minute resolves to whole buckets in opposite directions at the 
  two ends.                                                                     
     Row cap and the temp b-tree: agreed, leave both to B36.                    

● B07 approved with two corrections and a new chunk. Let me settle the parsing
  questions against the real engine first.

  Ran 1 shell command (ctrl+o to expand)

● Both confirmed on the real engine: 2026-09-03T12:00:00 → 08:00:00.000Z here
  (Asia/Yerevan), and V8 returns NaN for hour-only offsets like +02, so the
  accepted forms are Z, ±HH:MM, ±HHMM. Applying items 1 and 2.

  Ran 1 shell command (ctrl+o to expand)

● Now re-verify, using your two measured cases as the test.

  Ran 1 shell command (ctrl+o to expand)

● One more: the property the fix exists for — raw events re-summed over the
  resolved window must equal the buckets.

  Ran 3 shell commands (ctrl+o to expand)

● Now the docs: §14 line, B07 tick, and the new chunk before B21.

  Ran 4 shell commands (ctrl+o to expand)

● Now STATUS.md — traps list, progress, plan edits.

  Ran 1 shell command (ctrl+o to expand)

● A few prose spots still read pre-B07. Fixing those.

  Ran 1 shell command (ctrl+o to expand)

● Docs consistent. Committing.

  Ran 1 shell command (ctrl+o to expand)

● B07 committed as e45723c, ticked in BUILD_PLAN.md.

  What changed from your three items

  1. Bounds snapped to the minute, snapped values echoed. from snaps down, to
  snaps up — that direction rather than down/down, for three reasons:
  floor(from) < ceil(to) holds for every from < to, so there is no zero-width
  case to reject; the resolved window never loses data; and a live window ending
  at now mid-minute keeps its in-progress bucket instead of hiding the newest
  number for up to 59 seconds. Your two cases now resolve and say so:

  [12:00:00Z, 12:00:30Z)  ->  window 12:00:00.000Z .. 12:01:00.000Z   buckets=3
  raw=3  AGREE
  [12:00:20Z, 13:00:00Z)  ->  window 12:00:00.000Z .. 13:00:00.000Z   buckets=5
  raw=5  AGREE

  The third column is B53's assertion run early — raw signals re-summed over the
  resolved window against the buckets' counts. Aligned bounds are untouched;
  ceil is a no-op on an already-aligned to, so adjacent windows still tile.

  2. Explicit offset required. Accepted: Z, ±HH:MM, ±HHMM — verified all three
  resolve to the same instant. Rejected with a message that names the fix: no
  offset (your case — 08:00:00.000Z here, Asia/Yerevan), date-only,
  space-separated, and hour-only +02 (which V8 parses as NaN regardless). The
  regex fixes shape only, so 25:00:00Z still falls to the parse check.

  One thing I found and deliberately did not fix: 2026-02-30T00:00:00Z silently
  rolls over to March 2. Same class — answers a different question without
  saying so — but it is toCanonicalIso's job, so it is written onto B20a's row
  rather than added here.

  3. B20a added — src/shared/time.ts, immediately before B21, with the
  four-implementations argument in the plan. Lettered rather than renumbered
  because B21–B62 are cited by id across four documents and §11's coverage
  table. Snapshot's snapping stays inline for now (epoch math, not a fourth
  regex) — unifying it mid-chunk would be the drive-by refactor B20a exists to
  do properly.

  §14 gained the read-side bullet with your wording verbatim, plus the three
  measured failure rows, and it points at B20a. Row cap and the temp b-tree are
  recorded as B36's, per your call.

  STATUS.md refreshed: 7 / 63, last chunk B07, next B08, the new trap in the
  traps list, the B20a plan edit alongside the B16 split. Safe to /clear.

  Next is B08 — client shell, one number on screen, unstyled (D45 deferred).
  Waiting for your go.

✻ Baked for 5m 16s · done 10:11 AM
❯ lets not clear for now and do one more build step. move on                    

● B08 next. Checking what the client toolchain already has before announcing
  scope.

  Ran 3 shell commands (ctrl+o to expand)

● D41 option A ratifies the /api proxy, so that's settled. One thing I need to
  check before writing a client that puts a number on screen: who is allowed to
  compute a window total.

  Ran 2 shell commands (ctrl+o to expand)

● That check mattered — DESIGN.md §10.2 rules out the obvious implementation.
  Reading the last two things I need.

  Ran 1 shell command (ctrl+o to expand)

● Both checked. D41 option A already ratifies the /api proxy, and DESIGN.md
  §10.2 settles who computes a number — which changes what B08 can put on
  screen.

  Chunk B08 — client shell, one number

  Closes BUILD_PLAN.md B08. Spec DESIGN.md §3, §3.1. Flags HR1 HR8.

  Files: index.html, vite.config.ts, src/web/main.tsx, src/web/App.tsx, plus
  Vite as a third process in scripts/dev.mjs — the last two beyond the plan's
  file list, because without them nothing reaches a browser. Unstyled: D45 is
  deferred, and settling it by drift is forbidden by §2.

  The number will be a bucket's own impressions, verbatim from the server — not
  a sum across the window. §10.2 is the reason, and there's a decision for you
  in the report. Building now.

  Ran 2 shell commands (ctrl+o to expand)

● Now Vite into the dev runner, then verify in a real browser.

  Ran 2 shell commands (ctrl+o to expand)

● All three processes up. Ingesting events inside the client's window, then
  checking the proxy.

  Ran 1 shell command (ctrl+o to expand)

● Proxy verified identical. Expected on screen: 2, ad a_12, minute 06:14 (a tie
  on the minute with a_07, so it exercises the tie-break). Checking Vite
  actually transforms the modules, then looking at it in a real browser.

  Ran 1 shell command (ctrl+o to expand)

● Modules compile and the type-only server import is erased. Now the actual
  claim — "number appears in the browser".

● Skill(claude-in-chrome)
  ⎿  Successfully loaded skill

● No browser tools available, so the render itself needs your eyes. Doing the
  strongest headless check I can instead — a real client build.

  Ran 3 shell commands (ctrl+o to expand)

● B08 report — client shell, one number on screen

  Files: index.html, vite.config.ts, src/web/App.tsx (new), src/web/main.tsx
  (was a placeholder), scripts/dev.mjs (+5: Vite as a third process). Typecheck
  clean. Two files beyond the plan's list — vite.config.ts and the runner entry
  — because without them no client reaches a browser; both are ratified by D41
  option A, which specifies "Vite dev-serves and builds src/web alone, proxying
  /api", so neither is a new decision.

  The number is a bucket's count, not a window total

  This is the one thing in the chunk I could have got wrong silently, so I
  checked the design before writing it. DESIGN.md §10.2: "If the client did the 
  arithmetic (D30-A), the walk-back would compare the client to itself." And
  §10.1's TraceDescriptor is itself a window aggregate — metric + ad_ids +
  from/to + granularity_s — issued by the server with the value. A client-summed
  total is a number the server never sent, so it can carry no descriptor and
  B53 could never drill into it.

  So the client displays one bucket's impressions, verbatim, with its ad, its
  minute and its max_ingest_seq. The only computation is selecting the latest
  bucket — string compares on minute_start, then ad_id to break a tie. Confirmed
  in the production bundle: impressions appears only as a read, and the single
  reduce is that selection.

  That leaves a real question about the read side's shape, below.

  How to verify by hand

  npm run dev is running right now (server :8787, Vite :5173, sim exits
  immediately as the B11 placeholder), and there are events in the window, so
  you can open it directly:

  open http://localhost:5173        # expect: 2 impressions · ad a_12 · minute
  …T06:14:00.000Z

  That 2 is a tie case worth having: a_07 also has a bucket at 06:14, so it
  exercises the tie-break rather than just the happy path. Expand Raw snapshot 
  response on the page and compare against:

  sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impressions,max_ingest_seq
  FROM rollup_minute
    WHERE minute_start >= strftime('%Y-%m-%dT%H:%M:00.000Z','now','-60 minutes')
  ORDER BY minute_start DESC, ad_id DESC LIMIT 3;"

  Then the HR1 tests, and fresh events if the hour has rolled past:

  # refresh the browser                          -> same number
  # Ctrl-C the dev runner, npm run dev, refresh   -> still there (the store is
  the world)
  T=$(node -e "console.log(new Date(Date.now()-60e3).toISOString())")
  curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest
  \
    -d '[{"event_id":"n1","ts":"'$T'","ad_id":"a_12","event":"impression"}]'
  # refresh -> the number moves to the new minute (no SSE yet; B09/B10 make it
  live)

  What I verified myself: Vite transforms both modules and npx vite build
  succeeds (28 modules); the type-only import type from ../server/snapshot.ts is
  erased — no server module and no node:sqlite in the bundle; the proxy's
  response is byte-identical to hitting :8787 directly; yesterday's test events
  are correctly outside the rolling hour.

  Two things I could not verify and am not claiming. The browser render itself —
  no browser tools in this session, so "a number appears on screen" is yours to
  confirm. And the three-process Ctrl-C teardown: B04 verified it with two
  processes, the command I wrote to re-test it with Vite was denied, so please
  watch that Ctrl-C leaves no bound port. One expected wrinkle: StrictMode
  double-invokes the effect in dev, so you will see two GET /api/snapshot in the
  log per load. Harmless — idempotent GET, aborted on cleanup — but it looks
  like a bug if you aren't expecting it.

  Deliberately left out

  Unstyled — no stylesheet, no font, no reset, and index.html says why: D45 is 
  deferred to B36 and §2 forbids settling it by drift. It is meant to look
  unfinished. Also out: SSE (B09/B10), window and ad-selection controls (B36),
  ratios (B38), the traceability surfaces (the <details> raw-response block is a
  verification aid, not B52/B55), and anything durable in the client — no
  localStorage, per §3's boundary table.

  One decision for you

  DECISION #46 — Where window aggregation lives: who computes a displayed total
  Blocking: nothing today — B08 ships a per-bucket number under any answer.
            Blocks B38 (ratios); shapes B36 (portfolio list, granularity) and
  B51 (descriptors).

  Context
    §10.1's TraceDescriptor IS a window aggregate (metric + ad_ids + from/to +
  granularity_s), and
    §10.2 forbids the client doing the arithmetic — so a drillable number must
  be server-issued.
    But B38's file list puts `src/web/metrics.ts` on the client, which reads as
  client-side CTR/CPA/
    ROAS. Both cannot be true. Today the wire carries per-bucket counts and no
  total at all.

  Options
    A) Server computes every displayed aggregate. The snapshot grows a
  totals/series block per
       requested metric and granularity; B51 hangs a descriptor on each.
  `web/metrics.ts` becomes
       formatting only.
       Forecloses: nothing. Costs one SQL SUM per metric in the existing read
  transaction.
       Reversal cost: low now, high after B38 and B51 are built on the other
  answer.
    B) Client aggregates from server bucket counts. Drill-down is offered on
  buckets only, and
       totals are explicitly not drillable.
       Forecloses: HR5 on every headline number the strategist actually reads.
       Reversal cost: medium — B38, B51 and B53 all move.
    C) Hybrid: server computes window totals and ratios (drillable); the client
  re-buckets only for
       coarser chart granularity, labelled as not drillable.
       Forecloses: little, but it puts two aggregation rules on screen at once.
       Reversal cost: low.

  Recommendation
    A. The brief's traceability requirement is about the numbers a strategist
  reads, and those are
       window totals and ratios, not one minute's impression count — so B's
  foreclosure lands
       exactly on HR5's demo. A also keeps §10.2's claim structurally true
  rather than
       conventionally true: with one arithmetic implementation on the server,
  the check path
       (replay over raw) is genuinely independent, and "and they agree" means
  something. It costs
       a SUM inside a read transaction that already exists.

  What I need from you
    Do displayed window totals and ratios come from the server (A) — making
  `src/web/metrics.ts`
    formatting-only when B38 lands — or do you want the hybrid (C)?

  Nothing committed, BUILD_PLAN.md not ticked, #46 not written to DECISIONS.md.
  Waiting on your ok — and on the browser check, since that is B08's actual pass
  condition.

✻ Crunched for 5m 39s · done 10:23 AM

❯ ok, B08 approved, browser confirmed. Commit and tick.                         
  #46 — option D, an amendment to your three. Two corrections: §10.2's "compare 
  the client to itself" is about the rejected D30-A (client aggregates raw),    
  so B doesn't fail on that argument; it fails on §10.1 — the descriptor rides  
  on values the server sends, so a client-computed total has no descriptor and  
  B52's <Metric> can't render it. And none of A/B/C answers the live path,      
  which is B09/B10 — next up. Under strict A the post-SSE total either gets     
  recomputed on the client anyway, or SSE carries display-granularity rows and  
  breaks D30 consequence 2's idempotent resume.                                 
  D(essentially C with one change): the descriptor is the query, not the answer 
  (§10.1's words, granularity_s included). Server computes and signs totals     
  and ratios in the snapshot; SSE keeps per-minute absolute rows unchanged; the 
  client's re-bucketing to display granularity carries the same server-issued   
  descriptor, so the quarantine holds and B53 checks it against raw — a client  
  aggregation bug reads as FAIL in the drill-down. Stays inside D10: counts     
  aggregate, the division comes after. Trade vs A: A makes client arithmetic    
  bugs impossible, D makes them caught on click. Worth it to avoid paying in    
  B09.                                                                          

● Committing B08 — but one thing goes in first: my App.tsx comment cites §10.2
  for exactly the misreading you just corrected, and that file is what B36/B38
  build on.

  Ran 2 shell commands (ctrl+o to expand)

● Now recording D46. Checking the file's format so the entry matches.

  Ran 4 shell commands (ctrl+o to expand)

● Now the D46 record. Full option analysis into OPEN_QUESTIONS.md Wave 8,
  compressed entry in DECISIONS.md — the §3 allowance.

  Ran 3 shell commands (ctrl+o to expand)

● Now the §14 rule D46 leaves behind, and STATUS.

  Ran 2 shell commands (ctrl+o to expand)

● Two prose spots still read pre-B08.

  Ran 2 shell commands (ctrl+o to expand)

● B08 committed (f050dae), ticked. D46 recorded (b0cd38f) as option D, yours,
  with your rationale quoted in full.

  What went in, and where

  DECISIONS.md Wave 8 carries D46 with the options compressed to a line each and
  the full table in OPEN_QUESTIONS.md Wave 8 — the §3 allowance. Your rationale
  is quoted verbatim rather than summarised, because unlike the Wave 7
  one-liners it is the analysis.

  Both corrections are recorded in their own section, separate from the
  rationale, since they change what the decision defends rather than just how it
  was reached:

  - §10.2 is about D30-A — the client aggregating raw — so B survives that
    argument and fails on §10.1 instead: no descriptor, so <Metric> can't render
    it. Same conclusion, different reason, and the reason is what gets tested.
  - The live path was absent from all three of my options. A decision that
    strict A would have violated two chunks later, at B09, wasn't a decision.

  That second one also fixed a live error in the code you just approved: App.tsx
  cited §10.2 as its reason for not summing. Corrected before the commit — it
  now cites §10.1 and D46, and carries the D30-A distinction explicitly so the
  next reader doesn't repeat my misreading. Cheaper than landing it and
  unpicking it at B38.

  BUILD_PLAN.md §14 gained the rule D46 leaves behind, which is the one part of
  D that can fail quietly:

  ▎ A re-bucketing client aggregates at the descriptor's own granularity_s and 
  ▎ forwards the descriptor byte-for-byte. Re-bucketing to a granularity the 
  ▎ descriptor doesn't name makes the drill-down replay a different question — 
  ▎ and it can pass by coincidence when the totals happen to agree. The HMAC 
  ▎ catches a client-minted descriptor; nothing catches this.

  Which is really a note about B53: under A it was a nice-to-have, under D it's
  the mechanism that makes the trade pay. Recorded in D46's consequences as such
  — if a re-bucketing bug ships and nobody clicks, D is the option that let it
  through.

  Consequences now carried forward

  ┌─────────┬────────────────────────────────────────────────────────────────┐
  │  Chunk  │                         What D46 fixes                         │
  ├─────────┼────────────────────────────────────────────────────────────────┤
  │ B09/B10 │ Per-minute absolute rows on the wire, unchanged. No            │
  │         │ display-granularity variant — that's the thing D46 rejected    │
  ├─────────┼────────────────────────────────────────────────────────────────┤
  │         │ snapshot() grows server-computed totals and ratios;            │
  │ B38     │ web/metrics.ts survives as re-bucketing + formatting under a   │
  │         │ descriptor, never an independent number                        │
  ├─────────┼────────────────────────────────────────────────────────────────┤
  │ B51     │ Signs a descriptor per server-sent metric; client forwards it  │
  │         │ byte-for-byte                                                  │
  ├─────────┼────────────────────────────────────────────────────────────────┤
  │ B53     │ Becomes the check on client aggregation too — a re-bucketing   │
  │         │ bug reads FAIL                                                 │
  └─────────┴────────────────────────────────────────────────────────────────┘

  STATUS.md refreshed: 8 / 63, stage 1 five of eight chunks in, D46 in both the
  ratified list and the traps list, and the next-action section written against
  B09 with the three constraints it must respect. Also noted that npm run dev is
  three processes now and that StrictMode makes two GET /api/snapshot per load
  — so that doesn't look like a bug next time.

  Next is B09 — GET /api/stream, SSE. openSse() has been sitting unused in
  http.ts since B04 and apply() already returns the BucketKey it moved, so the
  dirty set needs no new plumbing. One thing I'd want your call on when I
  announce it: whether the resnapshot frame for a too-old cursor lands in B09 or
  B10.

✻ Cogitated for 4m 15s · done 10:38 AM

❯ resnapshot goes in B10, B09 just the happy path. move on                      

  Ran 3 shell commands (ctrl+o to expand)

● Spec read. Checking how the dirty set gets out of ingest today.

  Ran 2 shell commands (ctrl+o to expand)

● Spec clear, and one thing checked: apply()'s returned BucketKey is currently
  discarded by ingest(), so the dirty set has no route out. That's the plumbing
  this chunk adds.

  Chunk B09 — SSE GET /api/stream, happy path

  Closes BUILD_PLAN.md B09. Spec DESIGN.md §5.5, §11. Flag HR2.

  Process-wide dirty set fed by ingest, a 250 ms flush tick, one frame per tick
  carrying the absolute current row for every touched bucket, id: = high-water
  ingest_seq. resnapshot and Last-Event-ID resume are B10's, per your call.
  Files: src/server/stream.ts (new), plus the dirty-set route out of ingest.ts,
  a shared bucket reader in snapshot.ts, and wiring in index.ts.
  Ran 3 shell commands (ctrl+o to expand)

● Typecheck passes — which is itself a finding: sendJson(body: unknown) means
  the changed ingest return would have silently altered the API response. Fixing
  that in the wiring now.

  Ran 1 shell command (ctrl+o to expand)

● openSse (written at B04, unused until now) has no comment channel — adding
  one, since a comment is the keepalive that can't be mistaken for data.

  Ran 1 shell command (ctrl+o to expand)

● Now the wiring — including the ingest response shape that tsc couldn't catch,
  and the shutdown path.

  Ran 1 shell command (ctrl+o to expand)

● Now testing it — including the shutdown regression and whether SSE survives
  Vite's proxy.

  Ran 1 shell command (ctrl+o to expand)

● Coalescing confirmed: 3 events → one frame → 2 rows, a_12 at impressions: 2.
  Now absolute-not-delta, the proxy, and multiple subscribers.

  Ran 1 shell command (ctrl+o to expand)

● Absolute rows confirmed (3 → 4 → 5, not repeated deltas), and Vite's proxy
  streams SSE without mangling it. Now the 15 s keepalive and the shutdown
  regression.

  Ran 2 shell commands (ctrl+o to expand)

● 14 ms with a subscriber attached. Proving that guard is load-bearing rather
  than assuming it, without touching repo code:

  Ran 3 shell commands (ctrl+o to expand)

● B09 report — SSE GET /api/stream, happy path

  Files: src/server/stream.ts (new, 146 lines), ingest.ts (+35, dirty-set
  collection), index.ts (+26, route/publish/shutdown), snapshot.ts (+19, shared
  bucket reader), http.ts (+12, comment()). Typecheck clean. npm run dev is
  running now, so you can curl -N straight away.

  The wire

  event: ready
  data: {"as_of_ingest_seq":9,"flush_ms":250}

  id: 12
  event: buckets
  data: {"rows":[{...a_12 impressions:2...},{...a_07
  impressions:1...}],"as_of_ingest_seq":12}

  One frame per tick, carrying every touched bucket — not one frame per row. N
  frames would all have to share the flush's high-water id:, so a connection
  dropping mid-flush leaves the client holding that id while missing rows; B10's
  resume then asks for ingest_seq > id and never resends them. Silent, and the
  affected buckets stay stale until they happen to move again. One frame makes a
  flush atomic: you got it or you didn't.

  Three additions beyond the plan's file list, each needed by this chunk:
  bucketReader() in snapshot.ts so BUCKET_COLUMNS has one reader and the stream
  can't drift into a differently-shaped row than the snapshot (the client merges
  both by (ad_id, minute_start) at B10, so a mismatched column would read as a
  field that intermittently goes undefined, not as an error); comment() on the
  SSE helper, because a keepalive sent as a real event would need a client
  handler, and with an id would advance the resume cursor past rows never
  received; and the IngestOutcome return shape.

  Two things worth flagging

  1. sendJson(body: unknown) means a changed response shape is invisible to tsc.
  Making ingest() return { result, dirty } typechecked clean while silently
  changing what POST /api/ingest returns to the simulator. I caught it by
  reading, not by compiling. Fixed — the route destructures and sends result
  only, verified against the live endpoint (response keys are the seven
  IngestResult fields, no dirty). I'd suggest a §14 line, since every future
  route touches this.

  2. Adding SSE breaks B04's verified clean shutdown unless connections are 
  closed first. server.close() waits for open connections and a subscriber never
  ends on its own. Measured in isolation: with the response left open,
  server.close()'s callback had still not fired after 1000 ms. With
  stream.shutdown() closing subscribers first, the real server released the port
  in 14 ms with a subscriber attached. (The isolated repro's second line is
  inconclusive — fetch holds the socket in a keep-alive pool — so the 14 ms on
  the real server is the authoritative number.) Also a §14 candidate: it would
  have shown up as "Ctrl-C hangs sometimes", only ever with a browser tab open.

  The dirty set is in memory, deliberately not a store query, and the reason is
  worth having in the file: a WHERE max_ingest_seq > cursor query would have to
  scan all of rollup_minute every tick, because the case that matters most — a
  late conversion restating a settled bucket — touches an arbitrarily old
  minute, so the scan couldn't be bounded by time without missing exactly that.
  §11 specifies in-memory for this reason; B10's resume is where the store query
  belongs, once per connect rather than four times a second.

  How to verify by hand

  # terminal 1
  curl -N localhost:8787/api/stream
  # terminal 2
  T=$(node -e "console.log(new Date(Date.now()-30e3).toISOString())")
  curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest
  -d '[
   {"event_id":"v1","ts":"'$T'","ad_id":"a_12","event":"impression"},
   {"event_id":"v2","ts":"'$T'","ad_id":"a_12","event":"impression"},
   {"event_id":"v3","ts":"'$T'","ad_id":"a_07","event":"impression"}]'
  # repeat the POST with new ids and watch impressions CLIMB, not repeat
  curl -s -X POST ... -d '[{"event_id":"v1", ...}]'      # duplicate: no frame
  at all
  curl -s localhost:8787/api/health                       # stream_subscribers
  # Ctrl-C the runner with curl still attached -> exits immediately, port free

  What I measured: 3 events → one frame with 2 rows, a_12 coalesced to
  impressions: 2; repeated POSTs gave 3 → 4 → 5, absolute and cumulative, never
  a repeated 1; ids monotonic 13, 14, 15; a duplicate produced no frame (only
  accepted signals reach apply(), so only they dirty a bucket); 20 s idle gave 0
  bucket frames, 2 keepalive comments and 0 id: lines, confirming a comment
  doesn't move Last-Event-ID; two subscribers counted, one of them through 
  Vite's proxy, which delivered an identical frame count and identical values —
  so SSE survives the dev proxy, which was not obvious.

  Rollback safety is by construction rather than measured: dirty is returned
  after tx() commits, and tx() rethrows on failure, so a rolled-back batch can
  never publish. I didn't force a mid-batch throw here — that needs code
  injection, and B05 already covers the rollback itself.

  Deliberately left out

  Last-Event-ID resume and the resnapshot frame — B10, your call, so the
  reconnect story gets verified in one chunk rather than half-built across two.
  Also out: per-connection ad filtering (B36 if ever), the raw tail sample that
  §11 puts in the same flush (B44, and TailFrame doesn't exist yet), and §11's
  hard buffer cap that closes a hopeless connection (B44) — for now a full
  socket logs and keeps buffering, since absolute rows are coalesced but never
  dropped and a discarded bucket that never changes again would stay wrong
  forever. Nothing on screen moves yet; the client doesn't subscribe until B10.

  One note for B10's sizing: it now carries the client and the server-side
  resume query and resnapshot. That may want splitting when we get there — your
  call at announce time.

  Nothing committed, B09 not ticked. Waiting on your ok.

✻ Sautéed for 7m 23s · done 10:48 AM

❯ B09: ok to commit, with the two fixes below folded in — both are              
  comments/one-liners, no behaviour change. Verified independently: coalescing  
  across batches in one tick, duplicate/rejected/mixed batches, the old-minute  
  restatement frame, ready and keepalive carrying no id:, subscriber            
  accounting, D7, and shutdown (23 ms with 4 subscribers attached here).        
                                                                                
  1. Fix the dirty-drop comment before you commit. It cites §3.1 step 1 — but   
  the snapshot is taken before the subscribe, so it cannot cover events landing 
  in the gap. What makes the drop safe is step 3: replay every bucket with      
  ingest_seq > cursor from the store. I measured the gap: an event posted with  
  no subscriber attached is never pushed once one connects; only the snapshot   
  has it. Cite step 3.                                                          
  2. Write that onto B10's row as a constraint, in these words: resume is a     
  store query over rollup_minute (max_ingest_seq > cursor), not a replay of     
  buffered frames — there is no index on max_ingest_seq, so it is a full scan,  
  which is fine once per connect and is exactly why it can't be per-tick. If it 
  is ever built from memory, the bucket it loses is a late conversion           
  restating an old minute that never moves again: wrong on screen, forever, no  
  error. §14 line.                                                              
  3. Take your sendJson(body: unknown) §14 line — and the cheaper fix with it:  
  annotate the call site (const body: IngestResult = result;) so tsc catches    
  the next one instead of a rule you have to remember.                          
  4. One line noting dirty sits outside tx() safely because tx() has no retry   
  loop — if it ever gains one, the array double-accumulates.                    
                                                                                
  Two things for later rows, not for this chunk. B35/B44: the flush has no cap  
  on rows per frame — I measured one batch across 20,000 minutes producing a    
  6.20 MiB frame and a 142 ms event-loop stall after ingest returned; at 56,160 
  seeded buckets that is ~17 MiB / ~400 ms. The seeder must not markDirty, and  
  B44 should cap rows per frame and spill to the next tick — B44's              
  socket-buffer cap does not cover this. And: [stream] subscriber socket is     
  full fired for a curl client that was reading normally — res.write returns    
  false for any frame over the socket high-water mark, so log it once per       
  connection or make it a counter.                                              
                                                                                
  Split B10. B10a: server-side resume — read Last-Event-ID, replay from the     
  store, resnapshot when the cursor is too old. Verify by hand with curl -N -H  
  'Last-Event-ID: <n>' localhost:8787/api/stream and check the rows against     
  sqlite3. B10b: client subscribe, merge by (ad_id, minute_start), reconnect.   
  B09 ran ~230 diff lines against the ~150 target; B10 whole would be worse.    
  Also: restart npm run dev — I killed the :8787 server during a shutdown test, 
  and there were three stale runners alive besides.                             

● All four folded in. Starting with the three code/comment fixes.

  Ran 1 shell command (ctrl+o to expand)

● body already exists in that handler from readBody. Renaming mine.

  Ran 1 shell command (ctrl+o to expand)

● Now the docs: three §14 lines, the B10 split, and the B35/B44 notes.

  Ran 4 shell commands (ctrl+o to expand)

● Now STATUS, then the process cleanup and a clean restart.

  Ran 1 shell command (ctrl+o to expand)

● Now the process cleanup — the stale runners, then one clean npm run dev.

  Ran 1 shell command (ctrl+o to expand)

● The vite/bin pattern matched my own shell. Bracketing all of them.

  Ran 1 shell command (ctrl+o to expand)

● All clear. One clean runner, then commit.

  Ran 2 shell commands (ctrl+o to expand)

● One clean runner tree (sh -c → dev.mjs → server 2962257 + vite 2962259), no
  strays. Committing.

  Ran 1 shell command (ctrl+o to expand)

● B09 committed (ffb068f), ticked, with all four fixes folded in.

  The fixes

  1. The dirty-drop comment now cites §3.1 step 3, with your measurement in it —
     the store replay on connect is what closes the gap, and the comment says
     explicitly that dropping here is only safe for as long as B10a exists. You
     were right that step 1 can't cover it: the snapshot is taken before the
     subscribe.
  2. B10a's row carries the constraint in your words, and it's also a §14 line —
     including the consequence, that a memory-built resume loses a late
     conversion restating an old minute that never moves again: wrong on screen,
     forever, no error.
  3. sendJson §14 line taken, with the mechanism rather than just the rule —
     const responseBody: IngestResult = result; at the call site (renamed from
     body, which already existed in that handler from readBody). Re-verified:
     the ingest response is the seven IngestResult fields, no dirty.
  4. The tx() retry note sits on the dirty declaration: safe only because tx()
     has no retry loop; if it gains one, the array double-accumulates.

  B10 split, as you asked

  B10a — server-side resume: Last-Event-ID, store replay, resnapshot, verified
  by curl -N -H 'Last-Event-ID: <n>' against sqlite3. B10b — client subscribe,
  merge by (ad_id, minute_start), reconnect. Chunk count is 64 now (B20a plus
  this split), and STATUS records the reason: B09 ran ~230 diff lines against
  the ~150 target.

  Your two later-row findings, recorded where they'll be read

  B34 owes the seeder must not call stream.markDirty() — 6.20 MiB frame, 142 ms
  stall at 20,000 minutes; ~17 MiB / ~400 ms at 56,160 buckets. B44 owes both
  items: cap rows per frame and spill to the next tick, with the note that B44's
  socket-buffer cap does not cover this because the frame is built before any
  socket is written to; and the false socket is full warning,
  log-once-per-connection or a counter. Both are on the plan rows and in
  STATUS's owed list.

  Worth saying plainly: your 20,000-minute measurement is a bound I didn't think
  to test — I checked coalescing within a minute and never across a wide
  received_at span, which is exactly the seeder's shape.

  Processes

  Cleaned up: there were three stale runner trees plus a stray vite --port 5199.
  All gone, ports free, and one clean npm run dev is up — server pid 2962257,
  Vite 2962259, health reporting ingest_seq: 16, and a re-run confirms one frame
  per accepted event.

  Next is B10a. One thing I'll need to settle at announce time: §3.1 says a
  cursor the server "cannot serve cheaply" gets resnapshot, which isn't a number
  — I'll propose one rather than leave it to a timeout.

✻ Crunched for 3m 43s · done 11:04 AM

❯ B10a — propose the resnapshot threshold with your reasoning                   

● DECISION #47 — the resnapshot threshold

  DECISION #47 — When the server refuses to replay and sends `resnapshot`
  Blocking: B10a. Nothing else.

  Context
    §3.1: "If the cursor is older than the server can serve cheaply, the server
  responds with a
    `resnapshot` frame and the client returns to step 1. Stated rather than left
  to a timeout."
    "Cheaply" is not a number, and the shape of the threshold matters more than
  its value.
    The replay is `rollup_minute WHERE max_ingest_seq > cursor` — unbounded in
  both ads and time,
    where the snapshot the client would fall back to is window-scoped. So past
  some size the
    replay is doing strictly more work than the thing it exists to avoid.

  The shape first, because it rules out the obvious answers.

  Threshold on: Seq distance (current - cursor > K)
  Why not: Mispredicts by orders of magnitude in both directions. 100,000
  impressions in one minute dirty one bucket; 20,000 late conversions spread
  over 20,000 minutes dirty 20,000 — same seq distance. It would resnapshot
  when the replay is trivial and replay when it is 6 MiB
  ────────────────────────────────────────
  Threshold on: Wall-clock age of the cursor
  Why not: Same defect, with less information — it doesn't know how much
  happened
  ────────────────────────────────────────
  Threshold on: Log floor / retention
  Why not: D11 builds no compaction and retention is unbounded, so there is no
  floor and this can never fire. It becomes a necessary extra condition only if
   compaction is ever added
  ────────────────────────────────────────
  Threshold on: Row count of the replay
  Why not: The thing that actually costs. And it's free to measure: LIMIT N+1 on

  the query you must run anyway — get N+1 rows back, send resnapshot instead.
  No COUNT(*) pass, and with no ORDER BY SQLite stops scanning as soon as it
  has them, so it bails earliest in exactly the expensive  case

  Then the value, anchored on your measurement — 6.20 MiB / 20,000 rows = 325 
  B/row, 142 ms / 20,000 = 7.1 µs/row:

  ┌─────────────┬──────────┬────────────┬───────────────────────────────┐
  │ Replay size │  Frame   │ Stringify  │          What it is           │
  ├─────────────┼──────────┼────────────┼───────────────────────────────┤
  │ ~12 rows    │ 4 KB     │ negligible │ a 1-second blip               │
  ├─────────────┼──────────┼────────────┼───────────────────────────────┤
  │ 720 rows    │ 0.23 MiB │ 5 ms       │ 12 ads × a full hour offline  │
  ├─────────────┼──────────┼────────────┼───────────────────────────────┤
  │ 2,000 rows  │ 0.65 MiB │ 14 ms      │ proposed threshold            │
  ├─────────────┼──────────┼────────────┼───────────────────────────────┤
  │ 5,000 rows  │ 1.6 MiB  │ 35 ms      │                               │
  ├─────────────┼──────────┼────────────┼───────────────────────────────┤
  │ 56,160 rows │ ~17 MiB  │ ~400 ms    │ a cursor from before the seed │
  └─────────────┴──────────┴────────────┴───────────────────────────────┘

  Recommendation: LIMIT 2001, resnapshot at 2,000+ rows. The principled
  crossover isn't a comfort threshold, it's the point where the replay exceeds
  the snapshot it's avoiding: the client's fallback fetches its visible window,
  which portfolio-wide at B36 is 12 ads × 60 minutes = 720 rows. Anything above
  that and the replay is transferring more than a fresh snapshot would, while
  also being unbounded in time — so the constant belongs just above a
  full-portfolio hour, with headroom for a normal reconnect never tripping it.
  2,000 gives 2.8× that headroom at 0.65 MiB and 14 ms, one-off, on connect.
  5,000 is the defensible alternative; it buys tolerance for a genuine
  late-conversion cascade being replayed rather than resnapshotted, at 1.6 MiB,
  and I'd take it if you'd rather the late_cascade scenario survive a reconnect
  intact.

  Two conditions that are not about cost at all, and I'd like both in the same
  chunk:

  1. cursor > current high-water seq → resnapshot, unconditionally. This is the
     one that fails silently. Delete data/, re-migrate, restart — the browser
     reconnects with Last-Event-ID: 500 against a store at seq 3, max_ingest_seq
     > 500 matches nothing, and the client sits on stale numbers forever, 
     believing it is current. No error at any layer. It's the same reset path
     STATUS calls supported, so it's reachable by ordinary use, not just by
     accident.
  2. Non-numeric Last-Event-ID → resnapshot. Ours are always integers, so this
     only arrives hand-crafted, but the alternative is NaN in a comparison that
     then matches nothing — silent again.

  Absent Last-Event-ID is neither: no replay, just go live. The client has just
  snapshotted (§3.1 steps 1→2), which is B10b's normal path.

  One ordering point I'll build in regardless of your answer: subscribe first,
  then replay. Reversed, an event landing between the replay and the subscribe
  is lost — the dirty set is flushed to the other subscribers and gone.
  Subscribing first can duplicate a row across the replay and the first live
  frame, and duplication is free: absolute rows are idempotent, which is the
  whole reason D30 chose them. And the replay reads the high-water seq inside
  the same read transaction as the rows, for B07's reason — a cursor ahead of
  its own rows is a client that never learns about the gap.

  What I need from you
    2,000 rows as the resnapshot threshold — or 5,000 to keep a late-conversion
  cascade replayable?

✻ Crunched for 1m 31s · done 11:06 AM

❯ 2,000 — but first fix "absent → go live": EventSource can't set the header on 
  first connect (measured), so accept ?cursor=N too and use max(header,         
  query), or every refresh silently drops the snapshot-to-subscribe gap.        
● max is right, and for a sharper reason than "newer wins": both values are true
  lower bounds on what the client holds, so the max is the tightest true one —
  min would replay redundantly and, worse, could trip the 2,000-row threshold on
  a long-lived session and force a pointless resnapshot. Recording D47 before
  building on it.

  Ran 2 shell commands (ctrl+o to expand)

● D47 recorded. Building B10a on it.

  Chunk B10a — server-side SSE resume

  Closes BUILD_PLAN.md B10a. Spec DESIGN.md §3.1 steps 2–4, §5.5; D47. Flags HR1
  HR2.

  max(?cursor=N, Last-Event-ID), replay from the store with LIMIT 2001,
  resnapshot on 2,001 rows / a cursor above high-water / a non-numeric cursor.
  Subscribe before replaying. One file, src/server/stream.ts.

  Ran 1 shell command (ctrl+o to expand)

● Two problems in that: the template escaped wrong, and BUCKET_COLUMNS isn't
  exported. Putting the reader next to bucketReader instead, for the same drift
  reason.

  Ran 1 shell command (ctrl+o to expand)

● Now the subscribe body itself — replay, resnapshot, and the
  subscribe-before-replay ordering.

  Ran 2 shell commands (ctrl+o to expand)

● Replay matches sqlite3 exactly. Now the header, max(), and the two non-cost
  conditions.

  Ran 1 shell command (ctrl+o to expand)

● Quoting through the function broke it. Doing it directly.

  Ran 1 shell command (ctrl+o to expand)

● All conditions correct, max() both ways. Now the threshold boundary itself, on
  a scratch store so the main one stays clean.

  Ran 1 shell command (ctrl+o to expand)

● Boundary exact: 2000 → replay (638,934 bytes ≈ 0.61 MiB, 319 B/row — your 325
  B/row measurement held), 2001 → resnapshot. Cleaning up and running the
  regression pass.

  Ran 3 shell commands (ctrl+o to expand)

● B10a report — server-side SSE resume

  Files: src/server/stream.ts (+139), snapshot.ts (+24, the resume reader),
  index.ts (+8, passes req/url through). Typecheck clean, npm run dev up.

  What it does

  Cursor = max(?cursor=N, Last-Event-ID) per D47. On connect: subscribe, send
  ready, then replay rollup_minute WHERE max_ingest_seq > cursor LIMIT 2001
  inside one read transaction, as one buckets frame. resnapshot on any of the
  three conditions.

  readCursor() is exported and pure — worth noting because it's the one piece
  here whose wrongness would be invisible, and it's a candidate for D43's test
  criterion when B12 lands.

  Subscribe before replay, as flagged: reversed, an event landing between the
  replay and the subscribe is handed to whatever subscribers exist and cleared.
  This way the worst case is a row arriving twice, which costs nothing — the
  whole reason D30 chose absolute rows. That showed up live during the threshold
  test: a client got its resnapshot, then the flush pushed a bucket dirtied
  ~100 ms earlier, because it had already attached. Correct, and it confirms
  resnapshot doesn't disconnect anyone — live frames stay valid for a client
  that hasn't re-snapshotted yet, just incomplete.

  Number() not parseInt() for the cursor: parseInt('12abc') is 12, so a
  corrupted cursor would be silently truncated into a plausible one. Integers ≥
  0 only.

  Measured

  ┌──────────────────────────┬──────────────────────────────────────────────┐
  │           Case           │                    Result                    │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ ?cursor=14               │ buckets with seqs 15, 16, 17 — exactly the   │
  │                          │ rows sqlite3 lists above 14                  │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ Last-Event-ID: 16 alone  │ 1 row, seq 17                                │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ header 16 + ?cursor=2    │ resumed_from 16                              │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ header 2 + ?cursor=16    │ resumed_from 16 — max() both directions      │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ no cursor                │ ready only, no replay                        │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ ?cursor=17 (caught up)   │ ready only, no empty frame                   │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ Last-Event-ID: 500, log  │ RESNAPSHOT cursor_ahead_of_log {cursor: 500, │
  │ at 17                    │  log_position: 17}                           │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ abc · 12abc · -1 · 1.5   │ all RESNAPSHOT cursor_not_a_number           │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ exactly 2000 dirty       │ replays, 2000 rows, 638,934 bytes = 0.61 MiB │
  │ buckets                  │  (319 B/row — your 325 held)                 │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ 2001 dirty buckets       │ RESNAPSHOT too_many_rows {cursor: 0,         │
  │                          │ exceeded: 2000}                              │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ Resume through Vite's    │ resumed_from=15, 2 rows, seqs 16/17          │
  │ proxy                    │                                              │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ Shutdown with a          │ port released in 16 ms                       │
  │ subscriber mid-replay    │                                              │
  ├──────────────────────────┼──────────────────────────────────────────────┤
  │ D7 grep on stream.ts +   │ no write statement                           │
  │ snapshot.ts              │                                              │
  └──────────────────────────┴──────────────────────────────────────────────┘

  The threshold test ran on a scratch store (DB_PATH + port 8799), torn down
  after — the main store is still at its 10 buckets, so your re-run starts from
  the same state I described.

  How to verify by hand

  sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impressions,max_ingest_seq
  FROM rollup_minute ORDER BY max_ingest_seq;"
  curl -sN "localhost:8787/api/stream?cursor=14"              # rows with
  max_ingest_seq > 14, and only those
  curl -sN -H 'Last-Event-ID: 2' "localhost:8787/api/stream?cursor=16"   #
  resumed_from 16 — max wins
  curl -sN -H 'Last-Event-ID: 500' localhost:8787/api/stream  # resnapshot
  cursor_ahead_of_log
  curl -sN "localhost:8787/api/stream?cursor=abc"             # resnapshot
  cursor_not_a_number

  # the real rm -rf case, end to end:
  #   note the current log position, then: rm -rf data && npm run db:migrate &&
  npm run dev
  #   curl -sN -H 'Last-Event-ID: <old position>' localhost:8787/api/stream  ->
  resnapshot, not silence

  # the threshold, on a scratch store so yours stays clean:
  DB_PATH=/tmp/x.sqlite node src/server/migrate.ts
  PORT=8799 DB_PATH=/tmp/x.sqlite node src/server/index.ts &
  # POST 2000 events across 2000 distinct minutes -> ?cursor=0 replays; one more
  -> resnapshot

  Deliberately left out

  The client (B10b — it must build the URL with ?cursor=<as_of_ingest_seq>,
  already on its row). Per-frame row caps and the spill-to-next-tick (B44) —
  note the interaction: a 2000-row replay is a 0.61 MiB frame and ~14 ms of
  stringify, so the resume path benefits from B44's cap too, and B44 should
  treat the replay frame as another producer of oversized frames, not just the
  flush. RESNAPSHOT_ROWS stays a local constant until B21 builds
  src/shared/config.ts.

  One thing I want to flag rather than fix: stream.ts is now 273 lines, over
  half of it commentary, and it holds two distinct concerns — the flush loop and
  the resume/cursor logic. It's within the spirit of one reviewable concern for
  this chunk, but if B44 adds caps and telemetry to the same file it will need
  splitting. I'd rather raise that now than do it as a drive-by.

  Nothing committed, B10a not ticked. Waiting on your ok.

✻ Cogitated for 6m 27s · done 11:16 AM

❯ B10a: one change, then commit. In readCursor, replace the length > 0 guard    
  and Number.isInteger check with /^\d+$/ on the raw string before Number(). It 
  fixes both things I found, which are the same bug:                            
                                                                                
  - Number() reintroduces the hazard you rejected parseInt for. On a store at   
  log position 2001, ?cursor=1e3 gives resumed_from=1000 and replays 1001 rows  
  — byte-identical to a legitimate ?cursor=1000, silently skipping buckets      
  1–1000. 0x3→3, +2→2, 2.0→2, %20→0 all pass too: isInteger checks the result,  
  not the input.                                                                
  - A present-but-empty cursor (?cursor=, last-event-id: '') currently reads as 
  absent → go live, no replay — the exact gap this chunk exists to close, one   
  ?cursor=${''} away in B10b. The regex rejects it as invalid → resnapshot.     
                                                                                
  Everything else checks out, independently re-run: replay rows match sqlite3   
  (?cursor=2 → seqs 3,4,5), max() both directions, the 2000/2001 boundary       
  (638,952 bytes then too_many_rows), cursor_ahead_of_log, duplicated-header    
  and Infinity rejections, resnapshot-then-live-frame, D7 grep, typecheck.      
                                                                                
  Fold two one-liners into the same commit, no extra work: §14 — max_ingest_seq 
  is now the resume contract, so any future projection write that changes a     
  bucket without raising it (B18's restatement touching only restated_at) is    
  invisible to every resuming client, and B24's sweep won't catch it because    
  the rollup is correct. B10b's row — the replay is unwindowed while the        
  snapshot is windowed, so drop out-of-window rows rather than merge them.      
                                                                                
  stream.ts at 273 lines: agreed, split it at B44 with the caps, not now — put  
  it on B44's row. Then straight on to B10b.                                    
                                                                                
  Also restart the :8787 dev server; I killed it during cleanup.                

● Both are the same bug — validating the result instead of the input. Fixing it.

  Ran 2 shell commands (ctrl+o to expand)

● All six hazards rejected; 007 → 7 (unambiguous decimal, 6 rows — matches
  ?cursor=7). Now the three doc lines.

  Ran 1 shell command (ctrl+o to expand)

● B10a committed (4bf1990), ticked. Your /^\d+$/ fix is in, and it does close
  both: 1e3, 0x3, +2, 2.0, %20, '' and an empty Last-Event-ID all resnapshot
  now; 007 → 7, same 6 rows as ?cursor=7. Absent is the only remaining path to
  "go live".

  One addition inside the same fix, same principle — an array-valued header now
  reads as invalid rather than absent. Not reachable for last-event-id (Node
  joins duplicates into one string, which is why your duplicated-header test hit
  the regex), but present-and-unusable falling through to the absent branch is
  the bug you just found, and I didn't want the one remaining door left open.

  Three doc lines in: §14's max_ingest_seq resume contract with B18's
  restated_at as the concrete case and the note that B24 can't catch it; B10b's
  unwindowed-replay-vs-windowed-snapshot rule; B44's stream.ts split, landing
  with the caps. Dev restarted — server :8787, Vite :5173, log position 17.

  Now B10b.

  Chunk B10b — client subscribes

  Closes BUILD_PLAN.md B10b. Spec DESIGN.md §3.1, §5.5; D47. Flags HR1 HR2.

  EventSource on /api/stream?cursor=<as_of_ingest_seq>, merge absolute rows by
  (ad_id, minute_start), drop out-of-window rows, resnapshot → back to step 1.
  Files src/web/stream.ts, src/web/store.ts, and App.tsx switches from a
  one-shot fetch to the live store.

  Ran 3 shell commands (ctrl+o to expand)

● Now App.tsx moves from a one-shot fetch to the live store.

  Searched for 1 pattern, ran 6 shell commands (ctrl+o to expand)

● No browser, but store.ts and stream.ts are JSX-free — so the real client logic
  can be driven headlessly. Checking whether Node exposes EventSource:

  Ran 2 shell commands (ctrl+o to expand)

● --experimental-eventsource gives a real EventSource, so the actual client
  modules can be driven end to end without a browser.

  Ran 1 shell command (ctrl+o to expand)

● Offline merge rule all passes. The EventSource failure is the harness, not the
  code — Node's EventSource needs an absolute URL where a browser resolves the
  relative one against the page origin. Shimming that in the test only.

  Ran 1 shell command (ctrl+o to expand)

● That FAIL is my assertion, not the code: before was the previous latest bucket
  (a different minute) while after is a brand-new bucket holding exactly the 2
  events I posted. Comparing across two different buckets. Fixing the test to
  track the specific key.

  Ran 1 shell command (ctrl+o to expand)

● All ten pass. Now the one test that matters most — that D47's ?cursor=
  actually closes the snapshot-to-subscribe gap.

  Ran 2 shell commands (ctrl+o to expand)

● B10b report — client subscribes, merges, reconnects

  Files: src/web/store.ts (new, 76), src/web/stream.ts (new, 60),
  src/web/App.tsx (+65/−35). Typecheck clean, vite build clean, no server code
  in the bundle, still no stylesheet anywhere (D45 stays unsettled).

  What it does

  Snapshot → EventSource('/api/stream?cursor=<as_of_ingest_seq>') → merge
  absolute rows by (ad_id, minute_start). resnapshot bumps a generation counter,
  which re-runs the whole effect: §3.1's "the client returns to step 1" is
  literally a re-mount, so there is no second resume path on this side either.

  Three points where I made the reasoning explicit in the code rather than
  leaving it implicit:

  - The window comes from snapshot.query, not from what the client asked for.
    The server snaps bounds to whole minutes and echoes them; using our own
    bounds would disagree on the boundary minute by one bucket, and the store's
    window filter would then drop or keep the wrong row.
  - Out-of-window rows are dropped, per your rule. Without it a "last hour" view
    silently widens as late conversions restate old minutes, and the row count
    stops matching the window label.
  - The subscription starts only after the snapshot resolves, because its
    as_of_ingest_seq is the cursor — subscribing first would mean subscribing
    from a cursor we don't have.

  Verified — the real client modules, driven headlessly

  store.ts and stream.ts are JSX-free, and node --experimental-eventsource gives
  a real EventSource, so the shipped modules were exercised against the running
  server without a browser. Ten assertions, all passing:

  PASS  absolute row applied twice is idempotent — 1 -> 8 -> still 8
  PASS  merge assigns, never accumulates
  PASS  a restatement is just the same key reassigned
  PASS  out-of-window row is DROPPED, not merged (B10b rule)
  PASS  inWindow is half-open [from,to)
  PASS  subscribe() got a ready frame — as_of=19
  PASS  a live POST moved the number with no refetch — 2 frame(s)
  PASS  that bucket climbed by exactly the 2 events posted — 07:34: 2 -> 4
  PASS  no resnapshot on a healthy cursor
  PASS  a cursor ahead of the log makes the client resnapshot —
  cursor_ahead_of_log

  And the one that matters most — D47's gap, tested both ways:

  PASS  the gap event is REPLAYED on subscribe (D47 ?cursor=) — 0 -> 1, 1 frame
  PASS  without a cursor, the same gap event is NOT pushed — 0 frames

  An event ingested while no subscriber was attached (dirty set dropped by the
  flush) is recovered by the replay with ?cursor=, and is never delivered
  without it. That second line is the code you stopped me shipping.

  Two honest notes on that suite. One assertion failed first time and it was my 
  test, not the code — I compared "latest bucket" before and after, which is a
  different bucket once a new minute opens; fixed to track the one key. And the
  harness shims EventSource to absolutize the URL, because Node has no page
  origin to resolve /api/stream against — the relative URL is deliberate (it
  works behind Vite's proxy and behind the Node server in a build), and it's
  already confirmed by the browser and the proxy tests.

  How to verify by hand

  open http://localhost:5173          # number appears; "stream live"; cursor
  shown
  T=$(node -e "console.log(new Date(Date.now()-20e3).toISOString())")
  curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest
  \
    -d '[{"event_id":"h1","ts":"'$T'","ad_id":"a_12","event":"impression"}]'
  #   -> the number moves within ~250 ms, NO refresh

  # HR1, and the reconnect that must not double-count:
  #   Ctrl-C the runner mid-stream, npm run dev -> "stream down" then
  reconnects, number unchanged
  #   refresh -> same number
  # the gap:
  #   stop the runner, POST an event, start it, refresh -> the event is there
  (replayed, not lost)

  In dev, StrictMode opens two subscriptions per tab (the effect runs twice), so
  /api/health will show stream_subscribers: 2 for one browser tab. Harmless —
  absolute rows, and both get identical frames — but it looks wrong if you
  aren't expecting it, same as the double snapshot fetch at B08.

  Deliberately left out

  Ad selection and window controls (B36) — the window is still a hard-coded
  rolling hour. The resnapshot path re-snapshots but shows no notice to the
  user; that's a UI concern for B36/B42 and I'd rather not invent a treatment
  now. Reconnect backoff is EventSource's default, not ours. And the number is
  still one bucket's impressions, not a total — D46's server-computed totals
  arrive at B38.

  Stage 1 closes with B11, the simulator, which replaces curl as the event
  source.

  Nothing committed, B10b not ticked. Waiting on your ok.

✻ Worked for 6m 19s · done 11:36 AM

❯ okay, commit, update states, docs as i want to clear this session and start a 
  fresh one with 0 context.                                                     
  Also privide the kickoff promt for next session so you can start and move on  
  to next impl item                                                             
● Committing, then a full cold-resume refresh of the docs.

  Ran 2 shell commands (ctrl+o to expand)

● CHEATSHEET.md is the revise-from sheet and it's now two passes behind, so I'll
  fold the Phase-5 decisions in as compact rows rather than seven new ones —
  the one-page limit is the point of the file.

  Ran 1 shell command (ctrl+o to expand)

● Now the full cold-resume refresh of STATUS.md.

  Ran 2 shell commands (ctrl+o to expand)

● One stale row I caught in that sweep — dev.mjs still described as two
  processes.

  Ran 1 shell command (ctrl+o to expand)

● All committed and consistent — working tree clean, f4e3a0d. 11 / 64 chunks,
  stage 1 is seven of eight, and the only thing left in the walking skeleton is
  its event source.

  One process note before you clear: npm run dev is still running (server :8787,
  Vite :5173). Leave it or Ctrl-C it — the store is the world, so nothing is
  lost either way.

  ---

  Kickoff prompt for the next session

  Read CLAUDE.md and docs/STATUS.md. Then read only the sections of
  docs/SIMULATOR.md and docs/DESIGN.md that the next chunk cites — do not
  read anything else to "get oriented".

  We are mid-Phase 5. B10b is committed and ticked, 11 of 64 chunks done.
  Next chunk is B11 (simulator as a separate process) and it closes stage 1.
  Nothing is blocking it.

  Phase 5 rules from CLAUDE.md §5 apply strictly:

  - One plan item at a time. Announce what you're about to do and which item
    it closes, BEFORE touching anything. Build it. Report what changed, how I
    verify it by hand, and what you deliberately left out. Then stop.
  - Wait for my "ok" before committing. On approval: commit referencing the
    item, tick it in docs/BUILD_PLAN.md, then stop again and wait.
  - No batching multiple items. No drive-by refactors, renames or
    reformatting. No new dependencies without a DECISION.
  - If implementation reveals the design was wrong, stop coding, tell me, and
    we reopen the design doc. Do not patch around a design flaw.
  - Surface decisions, don't take them (§3). Record ratified ones in
    docs/DECISIONS.md with my wording verbatim before building on them.
    D1–D47 are ratified; D44/D45 are deferred to B36 and must not be settled
    by drift before then.
  - Test claims against the real store rather than trusting them; anything
    that fails silently goes in BUILD_PLAN.md §14 and the STATUS.md traps
    list. There are 11 traps there already — read them, they are all
    failures with no error message.
  - Migrations are append-only — a schema change is a new numbered file.
  - Nothing writes a projection except apply() (D7).
  - Every ~3 chunks, refresh docs/STATUS.md and tell me it's safe to /clear.

  Note I re-run every verification independently, so make the steps
  reproducible and don't claim what you haven't measured.

  Two things worth knowing about that next chunk, both already in STATUS.md's
  next-action section so the fresh session will find them: event ids must be
  derived rather than remembered, because B11's own verification is that killing
  and restarting the simulator makes the re-emitted events dedupe as
  duplicate_identical; and the simulator's ts must never run ahead of the wall
  clock, or I10's clamp collapses every event into the current minute.

✻ Worked for 2m 37s · done 11:40 AM