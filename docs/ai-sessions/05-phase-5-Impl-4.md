 ▐▛███▛█   Claude Code v2.1.259
▝▜██████▀  Opus 5 · Claude Team
  ▝▝ ▝▝    ~/Desktop/Personal/flawless-loop


❯ /clear                                                                        

❯ Read CLAUDE.md and docs/STATUS.md. Then read only the sections of             
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

● I'll start by reading the standing contract and status, then only what B11
  cites.

  Searched for 2 patterns, read 1 file, ran 4 shell commands (ctrl+o to expand)

● Now the design sections B11 cites.

  Searched for 1 pattern, read 2 files, listed 2 directories, ran 9 shell commands (ctrl+o to expand)

● Docs read: STATUS.md, SIMULATOR.md §14/§15.1 (+ §2.3 for the ad, §16 for the
  restart property, §21 for the constant), DESIGN.md §11.

  Announcing B11 — closes stage 1

  Scope, from the plan row and no wider: simulator as a separate OS process. 1 s
  tick, keyed RNG (splitmix64, named streams), a constant impression rate for
  one hard-coded ad, batched POST. Files src/sim/index.ts, src/sim/rng.ts, plus
  the npm run sim script the row's own verification names.

  One thing the plan row implies that no design doc pins down — flagged, not
  decided:

  ASSUMPTION (unratified): the boot catch-up window is 60 s. The row requires
  that a restart's re-emitted events dedupe as duplicate_identical, and §16 says
  "it re-reads and resumes, and duplicate emissions dedupe by construction".
  That only happens if boot re-covers seconds already emitted, so a catch-up
  window is forced; its length is not written anywhere. 60 s = one rollup_minute
  bucket (D28), so a restart re-emits at most the bucket you are watching.
  Blocks nothing. Needs sign-off before B34, where §15.3(b)'s T0 seam makes the
  start max(now − 60 s, T0) rather than now − 60 s, and before B29's
  /api/sim/world, where the alternative (server-derived resume position, no
  duplicates at all) becomes available.

  Building now.

  Ran 1 shell command (ctrl+o to expand)

● Write(src/sim/rng.ts)
  ⎿  Wrote 74 lines to src/sim/rng.ts
       1 // The simulator's randomness. SIMULATOR.md §14, verbatim:
       3 //     u = splitmix64( hash(seed, stream_name, entity_id, tick_i
         ndex) ) / 2^53
       5 // KEYED, not sequential. Every draw is ADDRESSED by (stream, en
         tity, tick) rather than pulled off
         here: a sequential stream means
       7 // pausing one ad shifts every subsequent draw for every other a
       8 // world instead of changing one part of it.
       9 //
         ED — `event_id = hash(seed, 'eid',
     … +85 lines (ctrl+o to expand)

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● Now the emitter.

● Write(src/sim/index.ts)
  ⎿  Added 175 lines, removed 2 lines
        1 -// Simulator entry point. A separate OS process, per D32. Empt
          -y until B11.                                                  
        2 -export {};                                                    
        1 +// The simulator. A separate OS process (D32) whose only chann
          +el into the store is                                          
        2 +// `POST /api/ingest` — it never opens the database, and it ne
          +ver assigns `received_at` or                                  
        3 +// `ingest_seq` (D12). DESIGN §11's top box, minus everything 
          +stage 3 adds.                                                 
        4 +//                                                            
        5 +// B11's scope is stage 1's event source and nothing wider: ON
          +E hard-coded ad, impressions only, a                          
        6 +// CONSTANT rate, a 1 s tick at 1× wall clock (§15.1), one bat
          +ched POST per tick. Everything that                           
        7 +// makes the rate interesting is deliberately absent and named
          + on its own plan item — SIMULATOR §3's                        
        8 +// six factors and the NegBinomial draw (B25-B27), clicks/conv
          +ersions/spend (B28-B31), the                                  
        9 +// `GET /api/sim/world` poll and levers (B29), scenarios (B32)
          +, the injected misbehaviours (B33),                           
       10 +// the 7-day backfill and the T0 seam (B34).                  
       11 +                                                              
       12 +import { draw, derivedId } from './rng.ts';                   
       13 +import type { IngestResult, Signal } from '../shared/types.ts'
          +;                                                             
       14 +                                                              
       15 +/**                                                           
       16 + * The world seed. No design document fixes a VALUE — §14 only
          + fixes the formula — so this is the                           
       17 + * `(seed + decision log + scenario log) → world` claim's firs
          +t term, held as a constant so it is                           
       18 + * stable across restarts, and overridable for a forked run.  
       19 + *                                                            
       20 + * ASSUMPTION (unratified): a code constant rather than a row 
          +in the store. Blocks nothing now;                             
       21 + * needs sign-off at B34, where the seed path makes it load-be
          +aring for reproducibility.                                    
       22 + */                                                           
       23 +const SEED = process.env.SIM_SEED ?? 'flawless-loop';         
       24 +                                                              
       25 +/** `a_12`, `meta_feed`, 20,000 impressions/day — SIMULATOR §2
          +.3. The brief's own pause target. */                          
       26 +const AD_ID = 'a_12';                                         
       27 +const IMPR_PER_DAY = 20_000;                                  
       28 +                                                              
       29 +/**                                                           
       30 + * The constant rate: §3's λ with all six factors held at 1.0 
          +and no stochastic draw. 0.2315/s, so                          
       31 + * ~13.9 impressions a minute — the number on screen climbs a 
          +few times a minute, which is the                              
       32 + * "climbs at the expected rate" the plan item asks to be able
          + to eyeball. B25 replaces this                                
       33 + * line, not the loop around it.                              
       34 + */                                                           
       35 +const RATE_PER_S = IMPR_PER_DAY / 86_400;                     
       36 +                                                              
       37 +/** §15.1: 1 s, one batched POST per tick, 1× wall clock. */  
       38 +const TICK_MS = 1_000;                                        
       39 +                                                              
       40 +/**                                                           
       41 + * How far back boot re-emits. Every whole second in `[now - C
          +ATCHUP_S, now)` is generated on                               
       42 + * start, which is what makes the plan item's restart check wo
          +rk: the ticks the previous process                            
       43 + * already sent are re-derived byte-for-byte and land as `dupl
          +icate_identical` (§14, §16), and the                          
       44 + * seconds it never reached are not lost. A gap there would be
          + indistinguishable from the 0.2%                              
       45 + * emitter-side loss §13 injects on purpose, which is the one 
          +failure the app cannot see (§6).                              
       46 + *                                                            
       47 + * ASSUMPTION (unratified): 60 s. One `rollup_minute` bucket (
          +D28), so a restart re-emits at most                           
       48 + * the minute you are watching. Needs sign-off before B34 — §1
          +5.3(b) makes the start                                        
       49 + * `max(now - CATCHUP_S, T0)` once the seeder owns everything 
          +up to T0 — and before B29, where                              
       50 + * `GET /api/sim/world` could carry a server-derived resume po
          +sition instead.                                               
       51 + */                                                           
       52 +const CATCHUP_S = 60;                                         
       53 +                                                              
       54 +/** Where ingest lives. Same default as the server's own `PORT
          +`, so moving one moves both. */                               
       55 +const INGEST_URL =                                            
       56 +  process.env.SIM_INGEST_URL ?? `http://localhost:${process.en
          +v.PORT ?? 8787}/api/ingest`;                                  
       57 +                                                              
       58 +/** Held batches are bounded. Past this the emitter says out l
          +oud that it dropped events. */                                
       59 +const MAX_PENDING = 10_000;                                   
       60 +                                                              
       61 +/**                                                           
       62 + * The impressions for one whole second, identified by its uni
          +x second — an ABSOLUTE tick index,                            
       63 + * not a count since boot. That is what makes the body re-deri
          +vable: a per-process counter would                            
       64 + * re-derive the same `event_id` with a different `ts` on rest
          +art, which is                                                 
       65 + * `duplicate_conflicting` — a platform correction (§5.1 step 
          +4) — rather than a duplicate.                                 
       66 + */                                                           
       67 +function eventsForTick(tick: number): Signal[] {              
       68 +  const whole = Math.floor(RATE_PER_S);                       
       69 +  const fraction = RATE_PER_S - whole;                        
       70 +  const count = whole + (draw(SEED, 'impr', AD_ID, tick) < fra
          +ction ? 1 : 0);                                               
       71 +                                                              
       72 +  const events: Signal[] = [];                                
       73 +  for (let i = 0; i < count; i++) {                           
       74 +    // Spread evenly inside the second rather than drawn for i
          +t: §14's list of named streams is                             
       75 +    // closed, and inventing one for sub-second jitter would m
          +ake that list a guess. Nothing reads                          
       76 +    // sub-second placement yet — D28 buckets by the minute.  
       77 +    const ms = tick * 1_000 + Math.floor(((i + 0.5) * 1_000) /
          + count);                                                      
       78 +    events.push({                                             
       79 +      event_id: derivedId(SEED, 'eid', AD_ID, tick, i),       
       80 +      // Always the second that has ALREADY closed, so `ts` is
          + in the past and I10's skew clamp                             
       81 +      // never fires. A simulator running its clock ahead woul
          +d have every event clamped to                                 
       82 +      // `received_at` and collapsed into the current minute. 
       83 +      ts: new Date(ms).toISOString(),                         
       84 +      ad_id: AD_ID,                                           
       85 +      event: 'impression',                                    
       86 +    });                                                       
       87 +  }                                                           
       88 +  return events;                                              
       89 +}                                                             
       90 +                                                              
       91 +/** The last whole second NOT yet generated. Boot starts it in
          + the past; see CATCHUP_S. */                                  
       92 +let nextTick = Math.floor(Date.now() / 1_000) - CATCHUP_S;    
       93 +let pending: Signal[] = [];                                   
       94 +let linkUp = true;                                            
       95 +let busy = false;                                             
       96 +                                                              
       97 +async function post(batch: readonly Signal[]): Promise<boolean
          +> {                                                           
       98 +  try {                                                       
       99 +    const res = await fetch(INGEST_URL, {                     
      100 +      method: 'POST',                                         
      101 +      headers: { 'content-type': 'application/json' },        
      102 +      body: JSON.stringify(batch),                            
      103 +    });                                                       
      104 +    const body: unknown = await res.json();                   
      105 +    if (!res.ok) {                                            
      106 +      console.error(`[sim] ingest returned ${res.status}: ${JS
          +ON.stringify(body)}`);                                        
      107 +      return false;                                           
      108 +    }                                                         
      109 +    // ANNOTATED on purpose, for the same reason the server's 
          +handler annotates its response: the                           
      110 +    // wire shape is invisible to `tsc` on both sides of a `fe
          +tch`, so this is the only place a                             
      111 +    // change to `IngestResult` can be made to fail at compile
          + time rather than at a demo.                                  
      112 +    const result: IngestResult = body as IngestResult;        
      113 +    console.log(                                              
      114 +      `[sim] sent ${result.received} · accepted ${result.accep
          +ted}` +                                                       
      115 +        ` · dup ${result.duplicate_identical}/${result.duplica
          +te_conflicting}` +                                            
      116 +        ` · rejected ${result.rejected_invalid} · ingest_seq $
          +{result.ingest_seq}`,                                         
      117 +    );                                                        
      118 +    return true;                                              
      119 +  } catch (err) {                                             
      120 +    console.error(`[sim] POST ${INGEST_URL} failed: ${err inst
          +anceof Error ? err.message : err}`);                          
      121 +    return false;                                             
      122 +  }                                                           
      123 +}                                                             
      124 +                                                              
      125 +/**                                                           
      126 + * One tick: generate every second that has closed since the l
          +ast one, then send them as one batch.                         
      127 + *                                                            
      128 + * Generating up to `now` rather than advancing by one makes c
          +old start, restart and a stalled                              
      129 + * timer (a suspended laptop, a long GC) ONE code path — the s
          +ame consolidation §16 states for                              
      130 + * lever propagation. A failed send holds its batch and coales
          +ces it into the next tick, which is                           
      131 + * DESIGN §11's stated backpressure behaviour: the emitter nev
          +er drops on the floor, because a                              
      132 + * dropped ingest is the one loss the app has no way to see.  
      133 + */                                                           
      134 +async function tick(): Promise<void> {                        
      135 +  if (busy) return; // a slow POST must not overlap the next o
          +ne, or ingest sees them out of order                          
      136 +  busy = true;                                                
      137 +  try {                                                       
      138 +    const now = Math.floor(Date.now() / 1_000);               
      139 +    for (; nextTick < now; nextTick++) pending.push(...eventsF
          +orTick(nextTick));                                            
      140 +    if (pending.length === 0) return;                         
      141 +                                                              
      142 +    const batch = pending;                                    
      143 +    pending = [];                                             
      144 +    if (await post(batch)) {                                  
      145 +      if (!linkUp) console.log('[sim] ingest reachable again')
          +;                                                             
      146 +      linkUp = true;                                          
      147 +      return;                                                 
      148 +    }                                                         
      149 +    if (linkUp) console.error(`[sim] holding ${batch.length} e
          +vents for the next tick`);                                    
      150 +    linkUp = false;                                           
      151 +    pending = [...batch, ...pending];                         
      152 +    if (pending.length > MAX_PENDING) {                       
      153 +      const dropped = pending.length - MAX_PENDING;           
      154 +      pending = pending.slice(dropped);                       
      155 +      console.error(`[sim] DROPPED ${dropped} events — held ba
          +tch over ${MAX_PENDING}`);                                    
      156 +    }                                                         
      157 +  } finally {                                                 
      158 +    busy = false;                                             
      159 +  }                                                           
      160 +}                                                             
      161 +                                                              
      162 +console.log(                                                  
      163 +  `[sim] ${AD_ID} at ${RATE_PER_S.toFixed(4)} impr/s (${IMPR_P
          +ER_DAY}/day) → ${INGEST_URL}` +                               
      164 +    ` · seed '${SEED}' · replaying the last ${CATCHUP_S}s`,   
      165 +);                                                            
      166 +                                                              
      167 +const timer = setInterval(() => void tick(), TICK_MS);        
      168 +                                                              
      169 +for (const signal of ['SIGINT', 'SIGTERM'] as const) {        
      170 +  process.on(signal, () => {                                  
      171 +    console.log(`[sim] ${signal} — stopping with ${pending.len
          +gth} events unsent`);                                         
      172 +    clearInterval(timer);                                     
      173 +    process.exit(0);                                          
      174 +  });                                                         
      175 +}                                                             

  Ran 13 shell commands (ctrl+o to expand)

● B11 built — report

  What changed (3 files, 249 added lines, 124 of them code; the rest is comment,
  in the house style):

  - src/sim/rng.ts (new, 31 code lines) — §14's formula, exactly:
    splitmix64(fnv1a64(seed ∥ stream ∥ parts)), draw() returning u ∈ [0,1) via
    >> 11n / 2**53, and derivedId() rendering the same 64-bit value as 16 hex
    chars. Key parts joined with NUL so ('a_1',2) and ('a_12','') cannot collide
    onto one stream.
  - src/sim/index.ts (was a 2-line placeholder, now 93 code lines) — the
    emitter. a_12 (§2.3's pause target), 20_000/86_400 = 0.2315 impr/s, 1 s
    tick, one batched POST per tick, ts always the closed second so I10 never
    clamps. Tick index is the absolute unix second, which is what makes a
    re-emission byte-identical.
  - package.json — "sim": "node src/sim/index.ts", which the plan row's
    verification names. scripts/dev.mjs is untouched.

  Verified against the real store, not asserted (scratch DB on :8799):

  ┌─────────────────────┬───────────────────────────────────────────────────┐
  │        Check        │                      Result                       │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ Boot catch-up       │ 60 s → 14 events, expected 13.9                   │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ Restart within 60 s │ 18 sent → 14 duplicate_identical, 0 conflicting,  │
  │                     │ 4 accepted (the kill→restart gap)                 │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ Rollup vs raw, per  │ 14/14 · 20/20 · 12/12 — exact on all three        │
  │ bucket              │                                                   │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ Distinct event_ids  │ 46 = 46 after 39 duplicate deliveries             │
  │ vs signals rows     │                                                   │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │                     │ SSE absolute rows 10 → 11 → 12, one frame per sim │
  │ Live path           │  tick; the duplicate batch produced no frame      │
  │                     │ movement                                          │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ Server down 6 s,    │ held 21→23 events, sent all of them on recovery,  │
  │ then up             │ ingest reachable again, process never exited      │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ draw() uniformity,  │ mean 0.499982, deciles within 0.6%, P(u<rate)     │
  │ 1M keys             │ 0.231249 vs 0.231481                              │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ derivedId()         │ 400,000/400,000 distinct over (tick, i)           │
  │ collisions          │                                                   │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ D7 / D32            │ grep finds no node:sqlite, openDb, INSERT or      │
  │                     │ UPDATE in src/sim — HTTP only                     │
  ├─────────────────────┼───────────────────────────────────────────────────┤
  │ npm run typecheck   │ clean                                             │
  └─────────────────────┴───────────────────────────────────────────────────┘

  One thing worth knowing: the 20-impression minute above is 1.87σ on a 
  Bernoulli, not a rate bug — the 1M-key check is what settles that, and it is
  why I ran it rather than eyeballing the bucket.

  Deliberately left out — all named on later items: §3's six factors and the
  NegBinomial draw (B25–B27); clicks, conversions, spend (B28–B31); GET 
  /api/sim/world, so nothing yet stops emitting on a pause (B29 — today a_12
  emits regardless of status, which is correct for a chunk with no ads
  projection); scenarios (B32); the injected misbehaviours (B33); the 7-day
  backfill and the T0 seam (B34). Also out: a 429 path, because the server has
  no rate limit to return one yet — any non-2xx is held and retried, which is
  what DESIGN §11's ingest handler comment already promises the emitter does.

  Two assumptions, both labelled in the source, both blocking nothing: SEED = 
  'flawless-loop' as a code constant (no doc fixes a value; needs sign-off at
  B34 where the seed becomes load-bearing), and CATCHUP_S = 60 (one
  rollup_minute bucket; needs sign-off before B34's T0 seam makes the start
  max(now − 60 s, T0), and before B29 where a server-derived resume position
  becomes an alternative).

  Verify by hand:
  npm run dev
  open http://localhost:5173          # the number climbs ~14/min, no refresh,
  no curl
  # in another terminal:
  sqlite3 data/loop.sqlite "SELECT disposition, COUNT(*) FROM signal_deliveries
  GROUP BY 1;"
  npm run sim                         # a SECOND emitter, or Ctrl-C the runner
  and rerun within 60s
  #   -> duplicate_identical rises, impressions do NOT

  Waiting for "ok" before I commit and tick B11.

✻ Cooked for 9m 18s · done 11:59 AM

❯ ok, commit it and tick B11                                                    

  Ran 3 shell commands (ctrl+o to expand)

● Committed b63a16f, B11 ticked in docs/BUILD_PLAN.md.

  Stage 1 is closed — 12 of 64 chunks. The walking skeleton now runs end to end
  with no curl in it: a separate simulator process emits derived-id impressions
  → ingest stamps and rolls up in one transaction → SSE pushes absolute rows →
  the browser number climbs and survives a refresh and a restart of all three
  processes.

  Stopping here. Two things owed before the next chunk, both yours to call:

  - docs/STATUS.md is due a refresh — it is 3 chunks stale (last written at
    B10b) and its "Next action" still announces B11. Say the word and I'll
    refresh it, then it's safe to /clear.
  - Next is B12 (DecisionBody types and fold()), the first chunk that owes
    automated tests under D43. It has accumulated three named targets rather
    than one: isCanonicalIso (from B05), readCursor (from B10a), and the fold
    itself.

✻ Cooked for 25s · done 12:11 PM

❯ refresh STATUS.md                                                             

  Ran 5 shell commands (ctrl+o to expand)

● Now the edits — header, "Where we are", run instructions, open, build
  progress, traps, verified, owed, next action.

● Update(docs/STATUS.md)
  ⎿  Added 1 line, removed 1 line
      3  Written for someone with no memory of the conversation. That som
         eone is you. Read this plus
      4  `CLAUDE.md`, then the one design doc you need — do not re-read e
         verything.
      5  
      6 -**Last updated:** 2026-09-04 · **Phase 5 in progress · stage 1 a
        -ll but closed · 11 / 64 chunks**                                
      6 +**Last updated:** 2026-09-04 · **Phase 5 in progress · stages 0 
        +and 1 CLOSED · 12 / 64 chunks**                                 
      7  
      8  ---
      9  

● Update(docs/STATUS.md)
  ⎿  Added 14 lines, removed 12 lines
      13  document is provisional.
      14  
      15  **Phase 5 (implementation) is running.** Seno gave the go-ahead
           2026-09-04. **Stage 0 (B01–B03) is
      16 -closed** — the store. **Stage 1 (B04–B11) is seven chunks of ei
         -ght**: B04–B10b are in, and                                    
      17 -**the walking skeleton is complete except for its event source*
         -*. End to end, today:                                          
      16 +closed** — the store. **Stage 1 (B04–B11) is closed as of B11**
         + — **the walking skeleton runs end                             
      17 +to end with no `curl` in it.** Today, from `npm run dev` and no
         +thing else:                                                    
      18  
      19 -`POST /api/ingest` stamps, validates, dedupes, persists and rol
         -ls up an event in one transaction ·                            
      20 -`GET /api/snapshot` returns that bucket's row for a minute-alig
         -ned window plus a cursor, in one                               
      21 -read transaction · `GET /api/stream` pushes the **current absol
         -ute row** of every touched bucket on                           
      22 -a 250 ms tick, and replays from a cursor on connect · a React p
         -age on **:5173** renders one                                   
      23 -server-computed number that **moves without a refresh**, surviv
         -es a refresh, and survives a restart                           
      24 -of both processes.                                             
      19 +a **separate simulator process** (D32) emits impressions for `a
         +_12` on a 1 s tick at 1× wall clock,                           
      20 +ids and bodies **derived** from a keyed RNG · `POST /api/ingest
         +` stamps, validates, dedupes,                                  
      21 +persists and rolls up each event in one transaction · `GET /api
         +/snapshot` returns a bucket row for                            
      22 +a minute-aligned window plus a cursor, in one read transaction 
         +· `GET /api/stream` pushes the                                 
      23 +**current absolute row** of every touched bucket on a 250 ms ti
         +ck, and replays from a cursor on                               
      24 +connect · a React page on **:5173** renders one server-computed
         + number that **climbs on its own                               
      25 +without a refresh**, survives a refresh, and survives a restart
         + of all three processes.                                       
      26  
      26 -**Only B11 remains in stage 1**: replace `curl` with the simula
         -tor process. Eleven commits, one per                           
      27 -chunk, each approved before it landed.                         
      27 +Twelve commits, one per chunk, each approved before it landed. 
         +**Stage 2 (B12–B24) is next**: the                             
      28 +full write path — fold, generations, all four signal kinds, att
         +ribution, orphans, restatement —                               
      29 +verified by `curl` and `sqlite3` only, ending with the P14 agre
         +ement sweep.                                                   
      30  
      29 -**No decision blocks anything from here to B35.** For the first
         - time since Phase 0 the path is                                
      30 -clear. D44/D45 are *deferred* (**F4**) and come back at the sta
         -ge 3 → 4 seam; see "What is open".                             
      31 +**No decision blocks anything from B12 to B35.** D44/D45 are *d
         +eferred* (**F4**) and come back at                             
      32 +the stage 3 → 4 seam; see "What is open", which also carries th
         +e two unratified B11 assumptions.                              
      33  
      34  **One caveat on `DESIGN.md`.** It was approved at the Phase 2 c
          lose and has since been **corrected
      35  in one place and extended in two** by Phase 3 — read it *with* 
          the "What Phase 3 changed in

● Update(docs/STATUS.md)
  ⎿  Error editing file

● Update(docs/STATUS.md)
  ⎿  Added 2 lines, removed 1 line
      73  ```
      74  npm i                 # Node 24+ required; node -v
      75  npm run db:migrate    # creates data/loop.sqlite, applies both 
          migrations
      76 -npm run dev           # THREE processes: server :8787, Vite cli
         -ent :5173, sim (empty until B11)                               
      76 +npm run dev           # THREE processes: server :8787, Vite cli
         +ent :5173, simulator (B11, real)                               
      77 +npm run sim           # the simulator alone, against an already
         +-running server                                                
      78  npm run typecheck     # tsc --noEmit, must be clean
      79  npm test              # node --test — no test files yet (D43), 
          exits 0
      80  

● Update(docs/STATUS.md)
  ⎿  Added 12 lines
       91  curl -sN "localhost:8787/api/stream?cursor=0"           # read
           y frame, then absolute rows per tick
       92  curl -sN -H 'Last-Event-ID: 999999' localhost:8787/api/stream 
              # resnapshot cursor_ahead_of_log
       93  sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impression
           s,max_ingest_seq FROM rollup_minute ORDER BY max_ingest_seq;"
       94 +sqlite3 data/loop.sqlite "SELECT disposition, COUNT(*) FROM si
          +gnal_deliveries GROUP BY 1;"                                  
       95 +#   -> restart the sim within 60s: duplicate_identical rises, 
          +impressions do NOT                                            
       96  ```
       97  
       98 +**The simulator's knobs** (B11, all env vars, all with default
          +s): `SIM_SEED` (`'flawless-loop'`),                           
       99 +`SIM_INGEST_URL` (defaults to `http://localhost:${PORT ?? 8787
          +}/api/ingest`, so moving `PORT` moves                         
      100 +both processes). It emits **`a_12` only**, impressions only, a
          +t a **constant 0.2315/s**                                     
      101 +(20,000/day, `SIMULATOR.md` §2.3) — ~14 a minute. **On boot it
          + re-emits the last 60 s**, which is                           
      102 +what makes the restart check above work and why a fresh store 
          +is never empty.                                               
      103 +                                                              
      104 +**A pause does not stop emission yet.** `GET /api/sim/world` i
          +s **B29**; until then the emitter has                         
      105 +no way to learn an ad's status and emits regardless. That is c
          +orrect for a build with no `ads`                              
      106 +projection, and it is the one part of HR3 that stage 1 does no
          +t yet demonstrate.                                            
      107 +                                                              
      108  **In dev, `StrictMode` runs every effect twice**, so ONE brows
           er tab produces two
      109  `GET /api/snapshot` calls and `stream_subscribers: 2`. Harmles
           s — absolute rows, identical frames —
      110  but it reads as a bug if you are not expecting it.

● Now "What is open", "Build progress", and the traps list.

● Update(docs/STATUS.md)
  ⎿  Added 1 line, removed 1 line
      180  
      181  ## What is open
      182  
      183 -**Nothing blocks any chunk from B11 to B35.**                 
      183 +**Nothing blocks any chunk from B12 to B35.**                 
      184  
      185  | # | Question | Blocks | Status |
      186  |---|---|---|---|
● Update(docs/STATUS.md)
  ⎿  Added 8 lines
      197     installed, nothing hand-rolled that pre-empts the choice. A
            chunk needing styling before B36 uses
      198     unstyled HTML and says so.
      199  
      200 +**Two unratified assumptions from B11**, both labelled in `src
          +/sim/index.ts`, both blocking nothing                         
      201 +now. Neither is a `DECISIONS.md` entry yet, and neither should
          + be settled by drift:                                         
      202 +                                                              
      203 +| What | Current value | Needs sign-off before |              
      204 +|---|---|---|                                                 
      205 +| The world **seed** — §14 fixes the *formula*, no document fi
          +xes a **value**, and it is the first term of `(seed + decision
          + log + scenario log) → world` | `SIM_SEED ?? 'flawless-loop'`,
          + a code constant | **B34**, where the seed path makes it load-
          +bearing for reproducibility. The live alternative is a row in 
          +the store, so a forked run is recorded rather than remembered 
          +|                                                             
      206 +| The emitter's **boot catch-up window** — forced to exist by 
          +B11's own restart property and §16's *"it re-reads and resumes
          +"*, but its **length** is written nowhere | `CATCHUP_S = 60`, 
          +one `rollup_minute` bucket (D28) | **B34**, where §15.3(b)'s `
          +T0` seam makes the start `max(now − CATCHUP_S, T0)`, and **B29
          +**, where `GET /api/sim/world` could carry a server-derived re
          +sume position and remove the duplicates entirely |            
      207 +                                                              
      208  ## Build progress
      209  
      210  | | |

● Update(docs/STATUS.md)
  ⎿  Added 4 lines, removed 4 lines
      209  
      210  | | |
      211  |---|---|
      212 -| **Current stage** | **Stage 1 — the walking skeleton (B04–B1
          -1)**, write half done |                                       
      213 -| **Last completed chunk** | **B10b** — the client subscribes,
          - merges absolute rows, reconnects. Commit `9b15738`. |        
      214 -| **Next chunk** | **B10b** — the client subscribes: `EventSou
          -rce` with **`?cursor=<as_of_ingest_seq>`** (D47 — it cannot se
          -t a header), merge absolute rows by `(ad_id, minute_start)`, *
          -*drop out-of-window rows** (the replay is unwindowed, the snap
          -shot is windowed), handle `resnapshot` by returning to step 1.
          - Files `src/web/stream.ts`, `src/web/store.ts`. |             
      212 +| **Current stage** | **Stage 2 — the full write path (B12–B24
          +)**, not started. Stage 1 closed at B11. |                    
      213 +| **Last completed chunk** | **B11** — the simulator as a sepa
          +rate process: keyed RNG (`splitmix64`, named streams), `a_12` 
          +at a constant 20,000/day, 1 s tick, batched POST, held-and-ret
          +ried on failure. Commit `b63a16f`. |                          
      214 +| **Next chunk** | **B12** — `DecisionBody` types and `fold()`
          +: one pure function, exhaustive over the six actions, includin
          +g the unreachable `archived` branch written to explain itself.
          + Files `src/shared/decisions.ts`, `src/server/fold.ts`. **The 
          +first chunk that owes automated tests (D43), and it has three 
          +named targets, not one** — see "What is owed". |              
      215  | **In flight** | nothing |
      216 -| **Chunks ticked** | **11 / 64** (B01–B09, B10a, B10b) — 64 b
          -ecause **B20a** was added and **B10 was split into B10a/B10b**
          -, see below |                                                 
      216 +| **Chunks ticked** | **12 / 64** (B01–B09, B10a, B10b, B11) —
          + 64 because **B20a** was added and **B10 was split into B10a/B
          +10b**, see below |                                            
      217  | **Cut line status** | nothing cut |
      218  | **Plan edits made during Phase 5** | **B16 split** (2026-09-
           04, Seno's call): B16 was to widen `SUPPORTED` to all three re
           maining kinds while B18 extended `apply()` — so B16 would have
            shipped a server that 500s on its own verify step. B16 now ta
           kes **click + spend, ingest *and* `apply()`**; **conversion in
           gest moved to B18**, with placement, because `ingest()` calls 
           `apply()` for every accepted signal and a no-op branch would b
           e the exact divergence `default: throw` prevents. **B17's `cur
           l` verification is therefore B18's**; B17 is exercised on a fi
           xture. |
      219  | **Plan edits, cont.** | **B10 split into B10a/B10b** (2026-0
           9-04, Seno's call, after B09): B10a is the **server-side** res
           ume (`Last-Event-ID`, store replay, `resnapshot`), B10b the **
           client** (subscribe, merge, reconnect). B09 ran ~230 diff line
           s against the ~150 target and B10 whole would have been worse.
            |

● Now the traps list — B11 found one that fails silently, so it goes in both
  files.

● Update(docs/STATUS.md)
  ⎿  Added 9 lines
      263    `Number.isInteger` inspects the output and passes `0x3`, `+2
           `, `2.0`, `' '`. And a **present-but-
      264    empty** cursor read as *absent* → go live with no replay, wh
           ich is the exact gap B10a exists to
      265    close. `/^\d+$/` on the raw string; absent is the only path 
           to "go live".
      266 +- **The emitter's tick index must be an ABSOLUTE unix second, 
          +never a counter since boot** (B11).                           
      267 +  Derived ids are what let the simulator hold no durable state
          + (§14, DESIGN §3.3) — but the **body**                        
      268 +  has to be derivable too. A per-process counter re-derives th
          +e same `event_id` on restart with a                           
      269 +  **different `ts`**, and a matching id with a differing body 
          +is `duplicate_conflicting`, which                             
      270 +  §5.1 step 4 surfaces as a **platform correction** — a fabric
          +ated misbehaviour on the one channel                          
      271 +  we keep precisely because it is rare. Measured with the abso
          +lute form: 14 `duplicate_identical`,                          
      272 +  **0 conflicting**. Same family: **a failed ingest POST must 
          +be held and retried, never                                    
      273 +  swallowed** — a dropped batch is indistinguishable from the 
          +0.2% emitter-side loss §13 injects on                         
      274 +  purpose, which is the one failure the app cannot see (DESIGN
          + §6).                                                         
      275  - **B24's agreement sweep must be a single whole-log pass**, n
           ot `replay()` called per bucket. The
      276    obvious implementation is O(buckets × N): 4 seconds becomes 
           hours.
      277  - **Settlement is evaluated at the arriving event's `received_
           at`, never at wall-clock `now`**

● Update(docs/STATUS.md)
  ⎿  Added 2 lines, removed 2 lines
      227  ## Traps that will not fail loudly
      228  
      229  `BUILD_PLAN.md` §14 is authoritative; carried here so a cold r
           esume sees them without opening the
      230 -plan. **Each produces wrong or slow output with no error.** Th
          -e last two were found during Phase 5,                         
      231 -against the real store, and are not in any design document.   
      230 +plan. **Each produces wrong or slow output with no error.** Tw
          +elve now — the Phase 5 ones were                              
      231 +found against the real store and are in no design document.   
      232  
      233  - **Nothing writes a projection except `apply()`** (D7). `ads`
           , `config_generations`,
      234    `conversion_attribution`, `rollup_minute`. A chunk that writ
           es one directly breaks the single

● Update(docs/BUILD_PLAN.md)
  ⎿  Added 13 lines
      582    catch it**, because the rollup's counts are correct. `apply(
           )` raises it via `MAX(...)` on every
      583    path today; every future path must too.
      584  
      585 +- **The emitter's tick index must be an ABSOLUTE unix second, 
          +never a counter since boot** (found                           
      586 +  at B11). Derived ids are what let the simulator hold no dura
          +ble state (`SIMULATOR.md` §14,                                
      587 +  `DESIGN.md` §3.3), but the property only holds if the **whol
          +e body** is derivable: a per-process                          
      588 +  counter re-derives the same `event_id` after a restart with 
          +a **different `ts`**, and a matching                          
      589 +  id carrying a differing body is `duplicate_conflicting`, not
          + `duplicate_identical`. §5.1 step 4                           
      590 +  surfaces that as a **platform correction** — so the emitter 
          +would manufacture a misbehaviour on                           
      591 +  the one channel we keep precisely because it is rare, and it
          + would look like the feature working.                         
      592 +  Measured with the absolute form across three restarts: 39 `d
          +uplicate_identical`, **0                                      
      593 +  conflicting**. Same family, same chunk: **a failed ingest PO
          +ST is held and coalesced into the                             
      594 +  next tick, never swallowed** (DESIGN §11 backpressure point 
          +1) — a batch dropped on the floor is                          
      595 +  indistinguishable from the 0.2% emitter-side loss §13 inject
          +s on purpose, which is the one                                
      596 +  failure the app has no way to see (§6).                     
      597 +                                                              
      598  - **No new dependency without a decision** (§3), and no drive-
           by refactors (§5).
      599  - **Every chunk leaves the app runnable.** If a chunk cannot, 
           it is two chunks.
      600  - **If a chunk reveals the design is wrong, stop coding and re
           open the design doc.** Do not patch

● Now the verified table, "What is owed", and "Next action".

● Update(docs/STATUS.md)
  ⎿  Added 6 lines
      397  | **B10a** — Seno's independent re-run: `?cursor=2` → seqs 3,4
           ,5 · `max()` both ways · the 2000/2001 boundary (638,952 B the
           n `too_many_rows`) · `cursor_ahead_of_log` · duplicated-header
            and `Infinity` rejections · resnapshot-then-live-frame · D7 ·
            typecheck | **passes** |
      398  | **B10b** — the SHIPPED client modules driven headlessly (10 
           assertions): double-apply is idempotent · merge assigns, never
            accumulates · a restatement is the same key reassigned · **ou
           t-of-window rows dropped** · half-open window · `ready` frame 
           · a live POST moves the number with no refetch · the target bu
           cket climbs by exactly the 2 events posted · no spurious resna
           pshot · `cursor_ahead_of_log` drives a client resnapshot | **p
           asses** |
      399  | **B10b** — **D47's gap, both directions**: an event ingested
            with no subscriber attached is **replayed** on subscribe with
            `?cursor=`, and is **not delivered at all** without it | **pa
           sses** |
      400 +| **B11** — boot catch-up emits **14 events for 60 s** against
          + 13.9 expected; rollup impressions == raw `COUNT(*)` on **ever
          +y** bucket (14/14, 20/20, 12/12); `COUNT(DISTINCT event_id)` i
          +n deliveries == `signals` rows (46 == 46) after 39 duplicate d
          +eliveries | **passes** |                                      
      401 +| **B11** — **restart within 60 s**: 18 re-derived events → **
          +14 `duplicate_identical`, 0 `duplicate_conflicting`**, and the
          + 4 seconds the killed process never reached accepted. Impressi
          +ons did **not** move on the duplicates | **passes** |         
      402 +| **B11** — live path with no `curl` anywhere: SSE absolute ro
          +ws **10 → 11 → 12**, one frame per sim tick; the duplicate-hea
          +vy boot batch produced no bucket movement | **passes** |      
      403 +| **B11** — **server down 6 s, then up**: 21 → 23 events held 
          +and coalesced, **all sent on recovery**, `ingest reachable aga
          +in` logged once, the sim process never exited (a crash here wo
          +uld take `npm run dev` down with it) | **passes** |           
      404 +| **B11** — the keyed RNG over **1M keys**: mean **0.499982**,
          + all ten deciles within 0.6%, `P(u < 0.231481)` = **0.231249**
          +; `derivedId` gave **400,000/400,000 distinct** ids over `(tic
          +k, i)`. This is why the 20-impression minute above is variance
          + (1.87σ on a Bernoulli), not a rate bug | **measured** |      
      405 +| **B11** — D32/D7: `grep` finds no `node:sqlite`, `openDb`, `
          +INSERT` or `UPDATE` anywhere in `src/sim` — the emitter reache
          +s the store only over HTTP | **passes** |                     
      406  
      407  **Environment note.** `sqlite3` CLI **3.45.1** is installed; `
           node:sqlite` embeds **3.51.2**. Both
      408  read the same file without complaint, but if a `.schema` or a 
           query plan ever looks wrong, that

● Update(docs/STATUS.md)
  ⎿  Added 8 lines
      350    a wrong answer is invisible"*): `isCanonicalIso` (B05), **`r
           eadCursor` (B10a — `Number('1e3')` is
      351    1000, and a present-but-empty cursor read as absent; both we
           re silent)**, and whatever B12 itself
      352    needs for the fold. `readCursor` is exported for this reason
           .
      353 +- **B11's two assumptions owe a decision** — the seed's home a
          +nd the catch-up window's length. Both                         
      354 +  are in "What is open" with the chunk each must be answered b
          +efore (**B34**, **B29**). They are                            
      355 +  labelled in `src/sim/index.ts` so the code and this file can
          +not drift apart on them.                                      
      356 +- **`src/sim/rng.ts` is deliberately NOT in D43's test surface
          +**, and the reason is on the record so                        
      357 +  a later chunk does not add it by reflex: its wrongness is **
          +not** invisible. A biased `draw()`                            
      358 +  shows up as a rate that misses `SIMULATOR.md` §21's measured
          + tables, which is what **B35's**                              
      359 +  calibration check reads, and it was measured directly at B11
          + (1M keys). If a chunk wants a test                           
      360 +  here anyway, it owes the D43 argument.                      
      361  - **B44 also owes the `stream.ts` split** — 273 lines holding 
           two concerns (the flush loop, and
      362    resume/cursor parsing). Agreed with Seno to land it with B44
           's caps, not as a drive-by.
      363  - **B34 owes a flush guard, measured by Seno at B09**: the **s
           eeder must not call

● Update(docs/STATUS.md)
  ⎿  Added 23 lines, removed 17 lines
      418  
      419  ## Next action
      420  
      421 -**Announce B11, build it, report, wait.** Nothing needs decidi
          -ng first.                                                     
      421 +**Announce B12, build it, report, wait.** Nothing needs decidi
          +ng first.                                                     
      422  
      423 -**B11 closes stage 1** — the simulator as a separate OS proces
          -s, replacing `curl` as the event                              
      424 -source. Read **`SIMULATOR.md` §14 and §15.1** and **`DESIGN.md
          -` §11** before writing it. Scope from                         
      425 -the plan row, and no wider: 1 s tick, keyed RNG (`splitmix64`,
          - named streams), **a constant                                 
      426 -impression rate for one hard-coded ad**, batched POST. Files `
          -src/sim/index.ts`, `src/sim/rng.ts`.                          
      423 +**B12 opens stage 2** — the full write path, verified by `curl
          +` and `sqlite3` only, no UI beyond                            
      424 +stage 1's single number until B36. Read **`DESIGN.md` §7 and §
          +2.3** before writing it. Scope from                           
      425 +the plan row and no wider: `DecisionBody` types and **`fold()`
          + — one pure function, exhaustive over                         
      426 +the six actions**, including the **unreachable `archived` bran
          +ch written to explain itself** (F1).                          
      427 +Files `src/shared/decisions.ts`, `src/server/fold.ts`.        
      428  
      429  Three things that are already true and constrain it:
      430  
      430 -- **`src/sim/index.ts` is an empty B01 placeholder that exits 
          -cleanly**, and `scripts/dev.mjs`                              
      431 -  tolerates a clean child exit by design. Filling it in must n
          -ot change the runner.                                         
      432 -- **Event ids are DERIVED, not remembered** — that is the plan
          - row's own verification: kill and                             
      433 -  restart the simulator and the re-emitted events must dedupe 
          -as `duplicate_identical`. This is                             
      434 -  what makes the emitter hold no durable state (§3.3).        
      435 -- **`ts` must be in the past or at `now`.** I10 clamps a futur
          -e `ts` to `received_at`, so a                                 
      436 -  simulator running its clock ahead would collapse every event
          - into the current minute.                                     
      431 +- **B12 is the first chunk that owes automated tests, and it o
          +wes three targets, not one** (D43,                            
      432 +  and the criterion is *"tests only where a wrong answer is in
          +visible"*): `isCanonicalIso` (owed                            
      433 +  from B05 — loosened, the event is accepted, `ts_effective` s
          +ilently takes the later instant, and                          
      434 +  **B24's sweep re-derives from that same column and agrees wi
          +th itself**), `readCursor` (owed from                         
      435 +  B10a, exported for this reason), and the fold itself. `npm t
          +est` is `node --test` with no test                            
      436 +  files yet, so this chunk creates that surface.              
      437 +- **`fold()` must stay pure and must not write anything.** D7:
          + `ads` and `config_generations` are                           
      438 +  projections and `apply()` is their only writer. The fold dec
          +ides *what* the config becomes; B13                           
      439 +  is what persists it.                                        
      440 +- **Widening `SUPPORTED` is not part of this chunk.** `ingest(
          +)` still accepts `impression` only;                           
      441 +  click + spend land at **B16**, conversion at **B18** (the B1
          +6 split — see "Plan edits" above).                            
      442  
      438 -Verify: `npm run dev`, then the browser number climbs at the e
          -xpected rate with no refresh; kill and                        
      439 -restart the simulator and watch the dispositions.             
      443 +Verify: `node --test` on a fixture sequence folding to the exp
          +ected config, and the `archived`                              
      444 +branch present, unreachable and commented.                    
      445  
      441 -**After B11, stage 1 is closed and stage 2 (B12–B24) begins** 
          -— the full write path, verified by                            
      442 -`curl` and `sqlite3` only. B12 is the fold, and it is the firs
          -t chunk that owes automated tests                             
      443 -(D43); see "What is owed" for the three targets that have accu
          -mulated.                                                      
      446 +**Two things to know about the ground B12 stands on.** The sim
          +ulator now emits continuously, so a                           
      447 +store is never quiet while you work — `npm run sim`'s log is t
          +he fastest read on whether ingest is                          
      448 +healthy. And **nothing yet stops emitting on a pause**: `GET /
          +api/sim/world` is B29, so HR3's                               
      449 +*"pausing `a_12` stops its events"* is demonstrated end to end
          + only from that chunk on.                                     
      450  
      451  For reference, the remaining gates in `CLAUDE.md` §4 order:
      452  

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● Update(docs/STATUS.md)
  ⎿  Added 2 lines, removed 1 line
      66  | **`src/web/store.ts`** | B10b. The render cache. `createStore
          ` / `applyRows` / `inWindow` / `latestBucket` / `bucketKey`. **
          The merge is an ASSIGNMENT keyed by `(ad_id, minute_start)`, ne
          ver an addition** — absolute rows (D30) — and **out-of-window r
          ows are dropped**, because the replay is unwindowed while the s
          napshot is windowed. |
      67  | **`src/web/stream.ts`** | B10b. `subscribe(cursor, handlers)`
           → `EventSource('/api/stream?cursor=N')`. **`?cursor=` is manda
          tory (D47)**: `EventSource` cannot set a header, so without it 
          every refresh drops the snapshot-to-subscribe gap. |
      68  | **`src/server/apply.ts`** | B06. **The single projection writ
          er (D7).** `apply()`, `floorMinute()`, D29's upsert. Impression
          s only; B16/B18 widen it. |
      69 -| **`src/sim/index.ts`** | B01 placeholder, still empty — B11 f
         -ills it. Exits cleanly, which the dev runner tolerates by desig
         -n. |                                                           
      69 +| **`src/sim/index.ts`** | B11. The emitter: `a_12` only, impre
         +ssions only, a **constant** 20,000/day (§2.3), 1 s tick at 1× w
         +all clock, one batched POST per tick, `ts` = the second that ha
         +s **closed** so I10 never clamps. The tick index is the **absol
         +ute unix second** — that, not the id alone, is what makes a res
         +tart's re-emission `duplicate_identical`. A failed POST is held
         + and coalesced into the next tick. Env: `SIM_SEED`, `SIM_INGEST
         +_URL`. Never opens the store (D32). |                          
      70 +| **`src/sim/rng.ts`** | B11. `SIMULATOR.md` §14's formula: `sp
         +litmix64(fnv1a64(seed ∥ stream ∥ parts))`, key parts NUL-joined
         + so two entities cannot share one stream. `draw()` → `u ∈ [0,1)
         +`; `derivedId()` → the same 64 bits as 16 hex chars. Keyed, not
         + sequential, so a lever cannot reshuffle another ad's draws. | 
      71  
      72  ## How to run what exists
      73  

● Update(docs/STATUS.md)
  ⎿  Added 1 line, removed 1 line
      56  | **`migrations/002_projections.sql`** | B03. `ads`, `config_ge
          nerations`, `conversion_attribution`, `rollup_minute`, `project
          ion_meta`, `sim_scenarios`. |
      57  | **`src/server/http.ts`** | B04/B09. `createRouter()` (method+
          pathname match, 404, handler error → 500), `sendJson()`, `readB
          ody()`, `openSse()` — plus **`comment()`** (B09: a keepalive th
          at dispatches no event and does not move `Last-Event-ID`). D42:
           no framework. |
      58  | **`src/server/index.ts`** | B04/B05. One `DatabaseSync` for t
          he process; refuses to boot on an unmigrated store; `GET /api/h
          ealth` (log position), `POST /api/ingest`; clean close on SIGIN
          T/SIGTERM. Port **8787**, `PORT` overrides. |
      59 -| **`scripts/dev.mjs`** | B04/B08. **Three** OS processes: serv
         -er, simulator (D32), and Vite on :5173. A crash in any tears th
         -e rest down; a **clean** exit does not — which is what lets the
         - empty B11 simulator placeholder return immediately, and B11 mu
         -st not change that. |                                          
      59 +| **`scripts/dev.mjs`** | B04/B08. **Three** OS processes: serv
         +er, simulator (D32), and Vite on :5173. A crash in any tears th
         +e rest down; a **clean** exit does not. **Unchanged by B11** — 
         +the simulator now runs forever instead of returning immediately
         +, so that tolerance is no longer exercised, but it is what keep
         +s `npm run dev` alive if the emitter is ever stopped alone. |  
      60  | **`src/shared/types.ts`** | B05. The brief's `Signal` (L76) *
          *verbatim**, `event` discriminator and all; `Disposition`, `Sig
          nalSource`, `IngestResult`. |
      61  | **`src/server/ingest.ts`** | B05/B09. `ingest(db, raw, source
          , now)` — DESIGN §5.1 in one transaction. Returns **`IngestOutc
          ome`** = `{ result, dirty }` (B09: the buckets it moved, for th
          e SSE flush; the caller publishes *after* commit). **Also the s
          eeder's entry point** (SIMULATOR §15.2): one writer of `ingest_
          seq`. |
      62  | **`src/server/stream.ts`** | B09/B10a. **273 lines — B44 spli
          ts it** (§14/B44 row). `createStream(db)` — the process-wide di
          rty set (coalesced by `Map`), the **250 ms** flush tick, `subsc
          ribe`/`markDirty`/`shutdown`/`size`. **One frame per tick** car
          rying every touched bucket as an absolute row; `id:` = high-wat
          er `ingest_seq`. Plus B10a: `readCursor()` = `max(?cursor, Last
          -Event-ID)` validated as `/^\d+$/` on the RAW string, the store
           replay (`bucketsSinceReader`, `LIMIT 2001`), and the three `re
          snapshot` conditions. **Subscribes before replaying** — duplica
          tes are free, gaps are not. |

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● docs/STATUS.md refreshed, plus one addition to docs/BUILD_PLAN.md §14. Not
  committed — say the word and I'll commit the docs.

  What changed in STATUS.md:

  - Header + "Where we are" — stages 0 and 1 closed, 12/64; the end-to-end
    paragraph now starts with the simulator process instead of curl.
  - "What exists" — real rows for src/sim/index.ts and src/sim/rng.ts; the
    scripts/dev.mjs row's "empty B11 placeholder" note corrected (unchanged by
    B11, and why the clean-exit tolerance still matters).
  - "How to run what exists" — npm run sim, the disposition query and the
    restart check; the simulator's env knobs and constants; and an explicit note
    that a pause does not stop emission until B29, so HR3 is not yet
    demonstrated end to end.
  - "What is open" — a new table for B11's two unratified assumptions (seed's
    home → B34; catch-up window → B34/B29), marked not-to-be-settled-by-drift.
  - "Build progress" — current stage 2, last chunk B11 b63a16f, next chunk B12.
    (The "Next chunk" cell had been stale, still naming B10b.)
  - Traps — a twelfth: the tick index must be an absolute unix second, not a 
    counter since boot. A counter re-derives the same event_id with a different
    ts, which is duplicate_conflicting → surfaced as a platform correction, i.e.
    the emitter manufacturing a misbehaviour on the rarest channel, and it
    looks like the feature working. Same bullet carries the held-not-dropped
    POST rule. Also added to BUILD_PLAN.md §14, which is the authoritative copy.
  - "What was verified, not assumed" — 7 B11 rows, including the 1M-key RNG
    measurement that settles the 20-impression minute as variance.
  - "What is owed" — B11's two assumptions; plus, on the record, why 
    src/sim/rng.ts is deliberately not in D43's test surface (a biased draw() is
    visible — it misses §21's measured tables at B35), so a later chunk doesn't
    add it by reflex.
  - "Next action" — rewritten for B12: sections to read (DESIGN.md §7, §2.3),
    the three D43 test targets, fold() stays pure (D7), and that widening
    SUPPORTED belongs to B16/B18.

  One staleness B11 introduced that I did not touch, because it is outside the
  chunk: src/web/App.tsx's empty-state text still reads "Nothing is emitting yet
  (the simulator arrives at B11)". It only renders when no buckets are in the
  window, but it is now wrong. One-line fix, your call — as its own micro-chunk
  or folded into B36's styling pass.

  Safe to /clear. STATUS.md plus CLAUDE.md is sufficient to resume cold at B12.

✻ Worked for 3m 40s · done 12:16 PM