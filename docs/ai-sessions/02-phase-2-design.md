 ▐▛███▛█   Claude Code v2.1.259
▝▜██████▀  Opus 5 · Claude Team
  ▝▝ ▝▝    ~/Desktop/Personal/flawless-loop


❯ /clear                                                                        

❯ Read CLAUDE.md, docs/BRIEF.md, docs/SCOPE.md, docs/DECISIONS.md,              
  docs/BRIEF_GAPS.md. Still no code.                                            
                                                                                
  Phase 2: design. Produce docs/DESIGN.md. Work through it as a sequence of     
  DECISIONs and stop for my answers before writing the doc — don't write the    
  doc                                                                           
  around your own preferences and then ask me to rubber-stamp it.               
                                                                                
  docs/DESIGN.md must cover, and each of these has at least one decision in it: 
                                                                                
  1. The three-way split. How configs, signals and levers are kept distinct in  
     storage and in code. Which are mutable, which are append-only, which are   
     derived.                                                                   
  2. Storage model. What is a table, what is a log, what is derived, what is    
     cached. Exact schemas/DDL in the doc (as text, not files). Include the     
     dedupe key and the index that makes the hot read path fast.                
  3. The persistence boundary. What lives in the client, what lives in the      
  store,                                                                        
     what is recomputable from the event log — and the reasoning. Include what  
     happens on a cold start with an empty client and a populated store.        
  4. Aggregation strategy. Raw forever vs minute/hour rollups vs hybrid.        
  Write-time                                                                    
     vs read-time vs cached metrics. For each option: cost, refresh behaviour   
  under                                                                         
     late events, and what question it forecloses. I want a real pros/cons      
  table                                                                         
     here — this is one I need to be able to defend in detail.                  
  5. Late-arriving conversions, end to end. The full path: arrival → dedupe →   
     attribution to a click → which time bucket it lands in (event time, not    
     arrival time) → how affected rollups are restated → how the UI learns the  
     number changed → what the strategist sees when a "closed" period moves.    
     Include the lateness horizon and what happens beyond it.                   
  6. The other misbehaviours: duplicates, out-of-order, orphaned conversions,   
     clock skew, bursts, gaps, retractions. For each: tolerated / degrades /    
  breaks,                                                                       
     with one line of why. This becomes a README table.                         
  7. Config as a fold over the decision log. Whether we store the fold, the     
  log,                                                                          
     or both; which the UI reads; how we detect divergence if both.             
  8. The read path for the Workbench reverse join ("used in twelve ads"), kept  
     current as ads launch and die — even if Workbench is sketched, the model   
  has                                                                           
     to be defensible.                                                          
  9. Component versioning, with the defence written out.                        
  10. Traceability. The concrete mechanism by which I can take any number on    
      screen during the demo and show the raw events behind it, and show they   
      agree. Design this as a product feature, not a debug log.                 
  11. The event flow diagram: simulator → ingest → store → aggregate →          
  transport →                                                                   
      UI, with what's synchronous, what's batched, and where backpressure would 
  hit.                                                                          
  12. Extensions to the brief's contracts, with the exact new/changed types and 
  a                                                                             
      pointer to the BRIEF_GAPS entry justifying each.                          
                                                                                
  Where a decision is cheap to reverse, say so and default to the simple        
  option.                                                                       
  Where it's expensive to reverse, slow down and make me choose properly.       

● I'll read the standing docs first.

  Searched for 2 patterns, read 3 files, listed 1 directory, ran 13 shell commands (ctrl+o to expand)

● I've read CLAUDE.md, docs/BRIEF.md, docs/SCOPE.md, docs/DECISIONS.md,
  docs/BRIEF_GAPS.md (legend + all six passes' relevant findings), plus
  STATUS.md, CHEATSHEET.md and OPEN_QUESTIONS.md §B/§C. No code written.

  Here is the Phase 2 decision pass. Nothing of DESIGN.md is written yet.

  How I've split it. Six decisions are genuinely new and genuinely branch the
  design — those get the full §3 treatment (Part 1). Nine decisions are already
  open in OPEN_QUESTIONS.md §B with full analysis written; re-presenting them
  would waste your pass, so they get one line each (Part 2). Seven items are
  cheap-to-reverse and I'm defaulting to simple unless you object (Part 3).
  Seven assumptions need sign-off before the doc finalises (Part 4).

  ---

  Part 1 — New decisions

  ---

  DECISION #27 — Which time bucket a conversion's value lands in
  Blocking: the rollup schema, the restatement path (P7), what "a closed period
            moved" means, and every ROAS/CPA number on screen.

  Context

  D14 settled which config generation credits a late conversion — the one live
  at the attributed click's ts. It did not settle which minute bucket the
  conversion's count and value_cents are added to; those are separable, and I'm
  not going to assume D14 decided both. Brief L83: a conversion "may land hours 
  or days after its click, retroactively changing periods you thought were 
  closed." Impressions, clicks and spend ticks obviously bucket at their own ts.
  A conversion has two candidate times: its own, and its click's.

  Options

  A) Recognition-time — bucket at the conversion's own ts.
  - How it works: conversions += 1, value_cents += v in the minute of the
    conversion's ts.
  - Pros: one rule for all four event types; "revenue booked today" is a rollup
    read; the current window never looks empty.
  - Cons: ROAS(T) = revenue recognised in T ÷ spend in T — numerator and
    denominator describe different populations, so the ratio is not a
    measurement of anything. "Did the swap help?" is unanswerable from rollups.
    And the restatement it produces only reaches back by the reporting delay
    (hours), not the click-to-conversion delay (days) — which means the brief's
    own sentence at L83 doesn't parse: the period that gets rewritten is a
    recent one, not one you thought was closed.
  - Forecloses: cohort analysis, per-generation ROAS, and the dramatic version
    of the restatement demo.
  - Reversal cost: high — changing it later means a schema change plus a re-fold
    plus new restatement semantics.

  B) Cohort-time — bucket at the attributed click's ts.
  - How it works: on resolution, the conversion is credited to the minute
    containing the click's ts. The bucket becomes "activity at time T, and
    everything it eventually earned."
  - Pros: numerator and denominator match — CPA(T) and ROAS(T) are real cohort
    ratios. Same anchor as D14, so one sentence ("the click is the anchor")
    explains both generation credit and bucket placement. A conversion arriving
    now rewrites a bucket from three days ago, which is exactly L83's scenario
    and the best available restatement demo. conversions ≤ clicks holds within a
    settled bucket.
  - Cons: the current window shows ~0 conversions and near-zero ROAS because
    those clicks haven't converted yet — honest, but needs the live/settled
    badge (D13) to not read as broken. An orphan (D16) has no click and
    therefore no bucket, so orphan handling gets more complex — see below.
    "Revenue booked today" stops being a rollup read.
  - Forecloses: recognition-time as a pre-aggregated view. Not as a view at all
    — raw is retained forever (D9), so it stays a scan away.
  - Reversal cost: high, same as A.

  C) Dual — store both placements side by side.
  - How it works: rollup carries conv_by_click_minute and conv_by_conv_minute as
    separate count/value column pairs.
  - Pros: both questions answerable; a cohort/recognised toggle is a good
    product moment.
  - Cons: two sets of counts to restate on every late arrival, so the
    restatement surface doubles and the agreement test (P14) has to check both;
    real risk of the UI showing the wrong one unlabelled.
  - Forecloses: nothing.
  - Reversal cost: low — adding the second pair later is additive and
    re-foldable from retained raw.

  Recommendation

  B. For a slice whose two graded highlights are late conversions handled end to
  end and every number traceable, cohort placement is the one that makes both
  work: it is the only placement under which the restatement the reviewer
  watches on camera is the restatement the brief describes — a conversion
  landing today and rewriting Tuesday — and the only one under which the ratio
  it moves was arithmetically meaningful in the first place. C is the tempting
  hedge, but it doubles the restatement surface, which is the single most
  delicate code path in the build, to answer a question ("what did we book
  today") that the slice isn't graded on and that raw events can answer on
  demand. B's real cost is a near-empty current window, and D13's settlement
  badge already exists to explain it.

  Consequence I want on the record before you answer: under B, an orphaned
  conversion (D16) has no click and therefore no legitimate bucket. It must be
  counted provisionally somewhere, and the only time it has is its own. So
  resolution moves it between two buckets — decrement the provisional one,
  credit the click's — which means the restatement path must be generic ("a fact
  changed, recompute affected buckets") rather than lateness-specific. That's
  the same genericity D25 said was nearly free; under B it stops being optional.

  What I need from you

  Cohort placement — conversions bucket at the attributed click's minute,
  recognition-time available only as a raw scan — approved, or do you want the
  dual columns?

  ---

  DECISION #28 — What the minute rollup is keyed by
  Blocking: the rollup DDL, the hot-path index, and whether per-generation
            numbers are exact or approximate.

  Context

  D9 fixed minute as the base bucket; D10 fixed additive counts only. Neither
  fixed the key. T1 trimmed G18 (stamping config_generation_id onto events at
  ingest) to SPECIFY to save a plan item, on the ground that component-level
  metrics become a read-time join over config_generations by (ad_id, ts). That
  join has to land somewhere, and where it lands is this decision.

  Options

  A) (ad_id, minute_start).
  - How it works: one row per ad-minute. Per-generation numbers come from
    joining buckets to config_generations validity intervals by time.
  - Pros: smallest table; the hot read (Signal screen, last N minutes × 8–12
    ads) is one index range scan; restatement touches one row.
  - Cons: a swap at 14:03:27 splits minute 14:03 across two generations, and the
    join has to assign the whole minute to one of them. One minute of one ad
    per swap, and it is an approximation that must be stated.
  - Forecloses: exact per-generation totals from rollups alone. Not from raw.
  - Reversal cost: low by construction — rollups are a rebuildable projection
    (D7), so re-keying is a schema change plus a re-fold, not a migration.

  B) (ad_id, config_generation_id, minute_start).
  - How it works: ingest resolves each event's generation; a straddled minute
    produces two rows.
  - Pros: exact per-generation totals by summation; the swap boundary is
    representable.
  - Cons: partially reinstates the work T1 explicitly trimmed — every ingested
    event needs a generation lookup, and a late event must resolve against the
    generation valid at its ts, not at received_at. Row count multiplies by
    generations per minute. Hot read becomes a sum over 1–2 rows instead of a
    lookup (negligible here, but it is no longer a plain range scan).
  - Forecloses: nothing.
  - Reversal cost: low, same re-fold argument.

  C) A keyed by ad-minute, plus a second generation-keyed rollup for the 
  component screen.
  - Two tables, two restatement paths, two things P14 must check. Listed for
    completeness; I don't recommend it.

  Recommendation

  A — and I want to flag that this looks like the expensive decision and isn't,
  which is itself the defence. Because D7 makes rollups disposable, choosing the
  small key is not a bet: if the straddled-minute approximation ever bites, we
  re-key and re-fold. What makes A the right default now is that the surface
  consuming exact per-generation numbers is the sketched Workbench (D1), the
  component screen is read-only over ~12 ads, and exactness there is a raw-event
  scan away. So A buys the fastest hot path for the surface that is built deep,
  and gives up precision only on the surface that is sketched — with the
  fallback already retained.

  What I need from you

  Rollups keyed (ad_id, minute_start), per-generation numbers by time-join with
  the straddled-minute approximation stated in the README — approved?

  ---

  DECISION #29 — When the rollup counts are maintained
  Blocking: the ingest write path (P1, P6), read latency, and whether the
            restatement path is separate code.

  Context

  D9 says rollups exist as a rebuildable projection. It doesn't say when they're
  written. This is the "write-time vs read-time vs cached" half of the brief's
  L121 question, for the counts — D10 already answered it for the ratios (read
  time, always).

  Options

  A) Ingest-time incremental. Each accepted event, in the same transaction as
  its canonical insert, does INSERT … ON CONFLICT DO UPDATE on its bucket. Reads
  are lookups. A late event is the identical code path — it just updates an
  older bucket and sets restated_at. Cons: every write touches ≥1 rollup row.
  Reversal: free.

  B) Lazy materialisation with invalidation. Buckets computed on first read of a
  window, cached, invalidated when a late event touches them. Cons: cache
  invalidation is the restatement problem again, solved a second way. Reversal:
  free.

  C) Periodic batch sweep. A tick every N seconds folds new raw rows into
  buckets. Cons: a visible lag between "event arrived" and "number moved" —
  which is precisely the thing the pause demo needs to be instant — and it makes
  the agreement test (P14) racy. Reversal: free.

  Recommendation

  A. Cheap to reverse, so per your instruction I'm defaulting to the simple
  option — and here simple is also the one that collapses normal ingest and
  restatement into a single code path, which is what makes P7 small and P14
  meaningful. C's lag would make "pause a_12 and watch it stop" feel broken,
  which is the one closable decision the deliverable requires.

  What I need from you

  Ingest-time incremental — approved? (I'll say no more about it in the doc than
  a paragraph unless you want the full table.)

  ---

  DECISION #30 — What crosses the wire: the snapshot + stream contract
  Blocking: the Signal read path (P9), cold start, reconnect, restatement
            delivery, and where backpressure hits.

  Context

  D18 (still open, recommended SSE with Last-Event-ID = ingest_seq) fixes the
  transport, not the payload. Your §3 asks what happens on a cold start with an
  empty client and a populated store, and your §5 asks how the UI learns a
  number changed. Both are this. Volume: 8–12 ads at diurnal peak is plausibly a
  few hundred events/sec.

  Options

  A) Raw events only; the client aggregates.
  - Pros: the purest reading of L117 ("everything derived from the stream").
  - Cons: the client re-implements bucketing, so there are two implementations
    of the arithmetic and the one on screen is the client's. A disagreement
    between them would be invisible — which is a direct hit on the criterion the
    whole build is organised around. High frame volume; a long disconnect
    replays everything.
  - Forecloses: a single authoritative implementation of the numbers.
  - Reversal cost: low (one client module), but the damage is to the demo's
    central claim.

  B) Server-computed bucket rows only.
  - How it works: frames are absolute bucket rows {ad_id, minute_start, 
    impressions, clicks, spend_cents, conversions, value_cents, settlement, 
    restated_at, as_of_ingest_seq}. Restatement is just another row for an older
    minute. Cold start: GET /snapshot returns the visible window's buckets plus
    the current ingest_seq; SSE resumes from that cursor.
  - Pros: one implementation of the arithmetic, on the server. Absolute rows are
    idempotent — a delta replayed after a reconnect double-counts, an absolute
    row doesn't, which matters because the reviewer will refresh mid-demo. Low,
    coalescible volume.
  - Cons: no live raw event ticker unless we add one; drill-down becomes a
    request rather than something already in the client (fine — P12 specifies a
    re-fetch and re-sum anyway).
  - Reversal cost: low.

  C) B, plus a bounded raw tail on a second frame type.
  - How it works: bucket rows drive every displayed number; a capped tail of
    recent raw events (last N, dropped under burst with a visible "N not shown")
    drives a live event feed element and nothing else. Never summed for
    display.
  - Pros: keeps B's single-implementation guarantee while giving Signal the
    thing that makes it feel like a live stream — events visibly ticking.
    Backpressure has an explicit, honest answer: the tail drops and says so;
    bucket rows coalesce per (ad_id, minute) on a ~250–500 ms flush tick and
    never drop.
  - Cons: two frame types.
  - Reversal cost: low.

  Recommendation

  C. B is the correctness core and A is disqualified by it: the moment the
  client owns the arithmetic, "can you trace this number back and do they agree"
  compares the client to itself. The raw tail is added back deliberately and
  quarantined — it is a display of events, never a source of numbers — which
  also gives the honest backpressure story the doc's §11 needs. Cold start falls
  out: empty client → snapshot at cursor → stream from cursor; a refresh is the
  same path, which is why the mandatory mid-demo refresh is uneventful.

  What I need from you

  Absolute bucket rows as the only source of displayed numbers, plus a capped
  raw tail for the live feed — approved?

  ---

  DECISION #31 — The traceability anchor
  Blocking: P12 (drill-down), P13 (trace endpoint), P14 (agreement test) — and
            whether traceability is a product feature or a debug affordance.

  Context

  D26 fixed traceability at D24 level D: drill-down, trace <event_id>, agreement
  test. It did not fix the mechanism by which a number on screen names the
  events behind it. Hard requirement #5 says "any number on screen can be walked
  back to the raw events underneath it, and the two must agree" and that we
  must demonstrate it, not claim it.

  Options

  A) The client builds the drill-down query from its own UI state.
  - Pros: zero server work.
  - Cons: nothing binds the drill-down query to the query that produced the
    displayed number. If display and drill-down ever disagree about, say,
    conversion placement (D27), they just quietly differ — and the demo's
    headline claim is unproven at exactly the moment it's being made.
  - Forecloses: the assertion. Reversal cost: low.

  B) A server-issued trace descriptor on every number.
  - How it works: every metric value the server sends carries {metric, ad_id, 
    from, to, placement_rule, generation_scope, as_of_ingest_seq}. Clicking it
    posts the descriptor back; the server replays from raw under exactly that
    descriptor and returns the recomputed figure plus the contributing
    event_ids. The UI displays both and asserts equality with a visible
    pass/fail. trace <event_id> (P13) is the same function run backwards. P14 is
    the same function swept over every bucket.
  - Pros: turns the grading criterion into an on-screen assertion. Three plan
    items collapse into one mechanism instead of three. as_of_ingest_seq is what
    makes "the number moved" demonstrable — re-run the same descriptor later,
    get a different figure, with the difference attributable to named late
    events.
  - Cons: a small descriptor rides on every metric payload; one replay function
    to write.
  - Forecloses: nothing. Reversal cost: low mechanically — but the demo value is
    lost if it isn't built now.

  C) A named server-side query registry. Between the two; the binding is
  convention rather than construction, so it degrades to A the first time
  someone adds a chart.

  Recommendation

  B. It is the difference the item asks for: a debug log proves the number to
  me, an assertion rendered next to the number proves it to the reviewer, live,
  on a figure they picked. And it isn't extra work — the descriptor→raw replay
  function is the one P14 needs regardless, so building it as a product surface
  costs the descriptor plumbing and nothing else.

  What I need from you

  Server-issued trace descriptors with an on-screen recomputed-vs-displayed
  assertion — approved?

  ---

  DECISION #32 — Simulator topology, and therefore where the ingest boundary
  sits
  Blocking: the §11 flow diagram, P1's shape, and the honesty of `received_at`.

  Context

  This is a narrow slice of D17, pulled forward because P1's ingest boundary is
  designed in DESIGN.md and D12 requires received_at/ingest_seq to be assigned
  at our ingest boundary, never by the emitter. The rest of D17 stays for Phase
  3. Note SCOPE.md §2 already promises state survives "the simulator process 
  being killed and restarted mid-demo" — a promise only option B keeps.

  Options

  A) In-process. Simulator is a timer inside the server calling ingest()
  directly. One process, no transport, trivial backpressure. Cons: the ingest
  boundary is a function call, so received_at measures nothing external; and
  killing the simulator means killing the server, which contradicts a SCOPE.md
  §2 promise that is README-verbatim. Reversal: low.

  B) Separate process → HTTP POST /ingest in batches. Pros: a real boundary
  where validation, dedupe, received_at and ingest_seq are owned by one writer;
  killing it mid-demo is a genuine moment (stream stalls, UI says so, restart
  backfills late); backpressure is real and demonstrable. Cons: two processes —
  kept to one command by a small zero-dependency spawner script. Reversal: low.

  C) Separate process writing to the same SQLite file. Two writers, WAL
  contention, and ingest_seq loses its single owner. Rejected.

  Recommendation

  B. Cheap to reverse in either direction behind one ingest() function, so I'd
  normally default to the simplest — but A isn't simpler here, it's a scope
  change: SCOPE.md §2 already commits to the simulator being killable
  independently, and that block is copied verbatim into the README. B also makes
  received_at an honest measurement rather than a same-tick constant.

  What I need from you

  Separate simulator process posting batches to an HTTP ingest endpoint, both
  launched by one command — approved?

  ---

  Part 2 — Carried over from OPEN_QUESTIONS.md §B

  Full options and analysis already written for each; I'm not re-typing them.
  Ratify, or name the option you want instead.

  #: D3
  Recommendation as written: Copy-on-write with lineage_id / version / parent_id
  Note: Prose-only per D1. One extra question: ship the three columns anyway,
  seeded so one component has two versions? Costs three columns, makes the
  component screen's "per version or per lineage?" answer concrete instead of
  hypothetical. I recommend yes.
  ────────────────────────────────────────
  #: D4
  Recommendation as written: Ad = unit of action, component = unit of analysis
  Note: README paragraph per D1.
  ────────────────────────────────────────
  #: D15
  Recommendation as written: First-write-wins for aggregates; every delivery
  persisted; conflicts surfaced
  Note: Feeds §2's DDL and §6's table.
  ────────────────────────────────────────
  #: D16
  Recommendation as written: Provisional counting, visible re-attribution,
  orphan
  health counter
  Note: Changes under D27-B: provisional placement is the conversion's own
  minute, and resolution moves it to the click's minute — a two-bucket
  restatement.
  ────────────────────────────────────────
  #: D18
  Recommendation as written: SSE with Last-Event-ID = ingest_seq
  Note: D30 presumes this.
  ────────────────────────────────────────
  #: D20
  Recommendation as written: Sample-size gate + smoothed series, raw available
  Note: Needs constants. I propose: suppress CTR below 500 impressions in the
  window, CPA/ROAS below 25 clicks; EWMA with a 15-minute half-life; toggle to
  raw. Amend freely.
  ────────────────────────────────────────
  #: D21
  Recommendation as written: Two stores, shared envelope {id, ts, received_at, 
  ingest_seq}, merged at read
  Note: This is §1's answer — configs/signals/levers distinct in storage.
  ────────────────────────────────────────
  #: D23
  Recommendation as written: Keep two slots; image/body_copy are library-only,
  called out
  Note: Follows D1 (Workbench sketched).
  ────────────────────────────────────────
  #: D25
  Recommendation as written: Retractions out of scope; conversion_void specified

  in README
  Note: D27's orphan consequence strengthens the "build restatement generically"

  argument.
  ────────────────────────────────────────
  #: D19
  Recommendation as written: Cut by D26
  Note: Ratify as "cut, stated".

  The one that needs a real choice, not a ratification:

  D22 — account timezone. Blocks P6; bucketing is undefined without it. Pacing
  is settled as P11 (soft pacing, not a hard cap). The open half is which
  timezone. I recommend America/New_York over UTC: a zero-offset account
  timezone makes the whole G04 gap invisible — the point of fixing it is that
  the day boundary is a choice, and UTC hides that a choice was made. Buckets
  stay UTC; only the day boundary is account-local, computed with built-in Intl
  (no dependency). Cost is DST, and no DST transition falls inside a September
  7-day window, so it's correct-by-construction and untested-in-demo — which I'd
  state as a limit rather than hide.

  What I need: UTC or America/New_York?

  ---

  Part 3 — Cheap, defaulting to simple unless you object

  Each is low-cost to reverse. I'll write these into DESIGN.md as stated
  defaults; say the word on any one and I'll change it.

  1. Reverse join (G38) — current-state only (already fixed by D1), computed by
     scanning the ads projection on read. At 8–12 ads a maintained index is
     dress-up.
  2. Delivery storage — signal_deliveries (every delivery, PK delivery_seq) +
     signals (canonical, PK event_id, first write wins). Two tables, not one
     with a flag.
  3. Orphan storage — attribution_state + nullable resolved_click_event_id
     columns on the canonical conversion row; no separate pending table.
  4. Clock skew (G44) — clamp future-dated ts to received_at, count it, never
     reject.
  5. Events for non-live ads (G48) — never reject on ad status; count arrivals
     that shouldn't exist as a self-check (under our own simulator they should
     be zero).
  6. Funnel violations (G46) — show unclamped with an "unsettled" marker and the
     orphan count beside it; never clamp.
  7. Divergence detection (D7's "both") — a /verify endpoint that rebuilds
     projections into temp tables and diffs, run at boot in dev. This is P14
     extended from rollups to the fold.
  8. Ad.created_at and Ad.name (G03) — add both; two fields, and a stable name
     matters precisely because components swap underneath it.

  ---

  Part 4 — Assumptions needing sign-off

  U1 is gated on DESIGN.md finalising and is due now; the rest are due at build
  items in this design's scope. Full text in OPEN_QUESTIONS.md §C.

  ┌─────┬────────────────────────────────────────────────────────────────────┐
  │  #  │                             Assumption                             │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U1  │ USD only, no currency field, no FX                                 │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U2  │ Single user; actor is a hard-coded human: string                   │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U3  │ Audiences and channels are static reference data; no lever changes │
  │     │  them                                                              │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U4  │ One conversion kind; value_cents is gross revenue                  │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U5  │ Decisions exactly-once, idempotent on decision_id                  │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U6  │ Money fields non-negative integers, enforced at ingest             │
  ├─────┼────────────────────────────────────────────────────────────────────┤
  │ U7  │ Decision.ts is request time; effects immediate; backdating         │
  │     │ rejected                                                           │
  └─────┴────────────────────────────────────────────────────────────────────┘

  Ratify as a block, or name the ones you want to change.

  ---

  What happens after you answer

  1. Append every answer to docs/DECISIONS.md in your words.
  2. Write the owed extensions section into docs/BRIEF_GAPS.md — it now has to
     cover the new extensions this pass creates (trace descriptor,
     Ad.created_at/name, and any lineage columns), so it's better written after
     your answers than before.
  3. Then write docs/DESIGN.md against decisions, not preferences.

  The two I'd most like you to slow down on are D27 and D30 — D27 because it's
  expensive to reverse and it decides what every ratio on screen means, and D30
  because option A is the intuitive one and it quietly undermines the
  traceability claim the whole slice is built to demonstrate. The rest are
  either cheap or already analysed.

✻ Worked for 7m 5s · done 2:38 PM

❯ D27 — go with B. But settlement being on/off doesn't explain why the current  
  window looks half-empty, so add a maturity indicator per bucket, something    
  like what fraction of the conversion window has elapsed. And put it in        
  DESIGN.md that CTR is live while CPA and ROAS lag by cohort — that's a real   
  product consequence, not a footnote.                                          
                                                                                
  D28 — A. Worth noting it composes with D27-B: the click's minute already      
  carries the click's generation, so the only precision we lose is on a         
  straddled minute.                                                             
                                                                                
  D29 — A. D31 — B, yes.                                                        
                                                                                
  D30 — C. But how is "the raw tail is never summed" actually enforced?         
  Convention will erode. I want it structural.                                  
                                                                                
  D32 — B, but not for the SCOPE.md reason. That promise was written on a       
  recommendation I hadn't ratified yet, so citing it is circular. The reason is 
  that received_at means nothing if the emitter and consumer share a tick.      
                                                                                
  D22 — America/New_York. The audiences are US, so a UTC day rolls the budget   
  mid-peak and we'd spend the demo explaining a pacing artifact. State the DST  
  path as untested.                                                             
                                                                                
  D20 — the gate has to scale with the window or be a rate. 500 impressions     
  would suppress everything in a one-minute view. Constants are otherwise fine. 
                                                                                
  Part 2 as written. D3, yes to the seeded lineage columns. Part 3 all fine.    
  Part 4 as a block — but U2 means D24's compare-and-swap concurrency is        
  hypothetical, so don't present it as a live feature                           

● Answers recorded. Before I write DESIGN.md, let me persist the ratifications —
  three items in your reply open small residues that I need answered, and I
  don't want the ratified set living only in this conversation.

  Read 2 files, ran 1 shell command (ctrl+o to expand)

● Ratifications are written: DECISIONS.md has D27–D32 as full entries plus the
  Phase-2 ratification block (the nine, the eight defaults, U1–U7), with your
  wording verbatim in a wording-of-record table; full option analysis for
  D27–D32 went into OPEN_QUESTIONS.md § Wave 5 per the §3 compression rule.

  Two notes on things you said that changed the record rather than just
  confirming it:

  - D32. You're right that the citation was circular, and it's recorded as such.
    SCOPE.md §2's kill-the-simulator promise was written on an unratified
    recommendation, so it's now ratified after the fact rather than before it —
    I've flagged that as a provenance note, since §2 is README-verbatim and a
    forward-committed promise in that block is worth being able to spot.
  - U2. The compare-and-swap is G24's (the from_* precondition), not D24's — D24
    is traceability. It ships, because it catches the failure that can happen
    with one actor: a stale tab or a retried POST applying a lever against
    config it no longer describes. What's recorded as not-claimable is the
    multi-actor story. It's written up as "a staleness guard, not a concurrency
    feature."

  Three residues block the doc.

  ---

  DECISION #33 — The basis for the per-bucket maturity indicator
  Blocking: DESIGN.md §5 (what the strategist sees when a period moves) and the
            Signal bucket rendering. Residue of D27.

  Context

  You asked for maturity "something like what fraction of the conversion window
  has elapsed." Elapsed time is the obvious basis and I think it is the wrong
  one, so this is worth thirty seconds. Attribution lag is heavily front-loaded
  — most conversions arrive within hours of their click, and the 72h horizon
  (D13) exists to catch a thin tail. Elapsed fraction against that horizon
  reports 8% maturity at six hours when the true figure might be 80%.

  Options

  A) Elapsed fraction of the horizon. clamp((now − bucket_end) / 72h).
  - Pros: zero machinery; trivially explainable.
  - Cons: systematically understates maturity for the entire period anyone is
    actually looking at. It would make settled-in-practice buckets read as
    barely-started, which is the opposite of the reassurance it exists to give.
  - Reversal cost: low.

  B) Empirical attribution-lag CDF, measured from our own settled cohorts.
  - How it works: over settled buckets, collect received_at − click.ts for every
    resolved conversion — the observational lag, i.e. how long until we knew,
    not how long until the human bought. That empirical distribution gives
    maturity(bucket) = CDF(now − bucket_end), cached and recomputed
    periodically.
  - Pros: derived from the event stream like everything else, so it needs no
    constant anyone can dispute; correct in shape by construction; one query. It
    is a histogram, not a model — worth saying so explicitly, because the brief
    disclaims statistical sophistication and this must not read as a forecast.
  - Cons: needs settled cohorts to exist. With 7d of backfill they always do, so
    the cold-start case never fires in practice.
  - Reversal cost: low.

  C) A fixed stated curve (e.g. 50% @ 1h, 80% @ 6h, 95% @ 24h, 100% @ 72h).
  - Pros: honest, explainable, no machinery.
  - Cons: in a demo it is circular — we would be asserting a curve about a
    distribution our own simulator generates. Defensible in the real world as a
    prior; weak here.
  - Reversal cost: low.

  Recommendation

  B, with C named in the README as the cold-start fallback we would use if no
  settled cohorts existed. Cheap to reverse either way, so I'd normally take the
  simple option — but A is the simple option and it is actively misleading,
  which disqualifies it on the same honesty grounds that D13's displayed horizon
  was ratified on. B costs one query and makes the indicator a fact about our
  data rather than a claim about the domain.

  What I need from you

  Empirical lag CDF from settled cohorts, labelled as an estimate with its basis
  shown — approved?

  ---

  DECISION #34 — Structural enforcement of the raw-tail quarantine
  Blocking: DESIGN.md §11 and the single-implementation guarantee that D30-C
  rests on.

  Context

  Your objection is right and the rule is load-bearing: D30-C's entire
  correctness argument is that exactly one implementation of the arithmetic
  exists. "Don't sum the tail" as a comment survives about two chunks.

  The reframing that makes it enforceable: raw numbers reach the client only in 
  response to a trace descriptor. There are then two raw-event payload types,
  not one — TailFrame (display, unsolicited, pushed) and TraceEvidence
  (summable, only ever returned by D31's descriptor replay, and summed precisely
  so it can be asserted against the displayed figure). The quarantine stops
  being a rule about behaviour and becomes a property of which type you're
  holding.

  Options

  A) Convention plus code review. What you're rejecting. Listed so the doc
  records why.

  B) Branded numerics on the tail. type TailCents = number & { readonly __tail: 
  unique symbol }, not assignable to the metric arithmetic types.
  - Pros: keeps the numbers on the tail, so future uses stay open; compile-time.
  - Cons: a brand is one cast away from gone, and the cast is easy to write and
    easy to miss in review.
  - Reversal cost: low.

  C) Numerics absent from the tail frame. Money on a TailFrame is a pre-rendered
  display string (amount: "$0.42"), never an integer. Plus: every performance
  number renders through D31's descriptor-taking component, which tail data
  cannot satisfy because it carries no descriptor — so TypeScript strict rejects
  it at compile time, and D31's on-screen recompute-and-assert is the runtime
  backstop.
  - Pros: three layers, two of them compile-time. Summing the tail requires
    parsing strings, which is ugly enough to be visible in a diff — the escape
    hatch being unpleasant is the mechanism.
  - Cons: the tail cannot do client-side locale formatting; a future "sum the
    last 100 events" view would need the descriptor path instead (which is the
    correct path anyway).
  - Reversal cost: low, and deliberately annoying — which is the point.

  Recommendation

  C. It reuses D31 rather than adding a mechanism: the descriptor requirement
  was already going to exist, and making it the only door through which summable
  raw numbers enter the client turns it into the enforcement point for free.

  One honest exception, which I want named rather than glossed: stream-health
  figures — events/sec, last-event age, frames dropped — are derived from the
  tail and are numbers on screen. They describe the transport, not the ads. They
  get a visually distinct treatment and are labelled transport telemetry, and
  the rule in the doc reads "no performance number is derived from the tail"
  rather than pretending to an absolute it doesn't hold.

  What I need from you

  Display-strings-only tail frames + descriptor-gated rendering, with
  stream-health named as the stated exception — approved?

  ---

  DECISION #20 (amendment) — How the sample-size gate scales
  Blocking: DESIGN.md §5 presentation and the Signal chart. Constants already
  accepted.

  Context

  You're right that 500 impressions blanks a one-minute view — at ~14
  impressions per ad-minute it would suppress everything, permanently. But I
  don't think the fix is to lower the bar or convert it to a rate, because the
  quantity that makes a ratio meaningless is sample size, not window length or
  volume: a CTR over 30 impressions is noise whether those 30 arrived in a
  minute or an hour, and a rate threshold would gate on how busy an ad is rather
  than on how much evidence a point carries — which is backwards, since the
  low-rate ad is exactly the noisy case.

  Options

  A) Fixed denominator bar, no adaptation. At one-minute granularity CTR is
  simply blank and you read counts instead. Honest, and arguably it teaches the
  right lesson — but a permanently empty chart reads as broken rather than as
  principled.

  B) Fixed statistical bar, adaptive point granularity. The bar stays a property
  of the sample; the chart chooses the smallest bucket size at which its points
  clear it, and displays which granularity it picked ("5-minute points"). D9
  already derives coarser buckets from minutes, so this is the same fold, not
  new machinery. The user gets a readable CTR and can see what it cost them in
  resolution.

  C) Rate-based gate. Gates on volume rather than evidence. Doesn't fix the
  thing the gate exists for.

  Recommendation

  B. It satisfies your constraint — the effective threshold scales with the
  window, because the granularity does — without giving up the statistical basis
  that makes the constant defensible when someone asks where 500 came from.

  One correction to the constants, since I'm re-opening the gate anyway. I
  proposed gating CPA and ROAS on ≥ 25 clicks. That gates the wrong denominator:
  CPA is spend ÷ conversions, so conversions is the noisy quantity. It should
  be ≥ 10 conversions per plotted point (relative standard error of a count of
  10 ≈ 32%, comparable to 500 impressions at a 2% CTR ≈ 30%). This composes well
  with D27-B: a young cohort has few conversions, gets gated, and the maturity
  indicator explains why — two mechanisms with two distinct meanings, too little
  data versus data still arriving, which is worth keeping visibly separate on
  screen.

  Proposed final: CTR ≥ 500 impressions · CPA/ROAS ≥ 10 conversions · EWMA 
  half-life 15 min · raw toggle, with the relative-standard-error basis stated
  so the numbers aren't arbitrary. This is arithmetic used as a threshold, not a
  model — it stays inside the brief's disclaimer.

  What I need from you

  Adaptive granularity against a fixed bar, and CPA/ROAS gated on conversions
  rather than clicks — approved?

  ---

  Answer these three and I'll write docs/DESIGN.md across all twelve of your
  sections. STATUS.md and CHEATSHEET.md get refreshed at the phase close, not
  now.

✻ Brewed for 6m 44s · done 2:54 PM

❯ D33 — B is fine, the elapsed-fraction argument convinced me. Keep the CDF     
  global though, don't segment by ad or channel at this volume, and show the    
  sample size it was measured from so it's obviously a histogram and not a      
  forecast. C as the cold-start fallback in the README, agreed.                 
                                                                                
  D34 — C, approved. And I'd rather you name the stream-health exception than   
  pretend to an absolute that doesn't hold — that's the right call. Just make   
  sure the label makes it obvious those numbers describe the transport and not  
  the ads.                                                                      
                                                                                
  D20 — B, and yes the conversions correction is right, CPA's denominator is    
  conversions so gating on clicks was measuring the wrong thing. One thing to   
  watch: a young cohort will never clear 10 conversions, so adaptive            
  granularity could coarsen forever chasing a bar it can't reach. Cap the       
  coarsening (hour, say) and past that just show the counts instead of an       
  ever-wider bucket. Otherwise the chart quietly turns into one point.          

● All three answered, and your D20 catch is right — an unreachable bar would
  coarsen until the chart is one point. Recording the ratifications first.

  Read 2 files (ctrl+o to expand)

● Now the extensions section owed in BRIEF_GAPS.md — its gate is "before
  DESIGN.md", and it now has to cover the extensions this pass created.

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● Now docs/DESIGN.md.

  Read 1 file (ctrl+o to expand)

● Let me verify the DDL actually executes rather than claiming it does — same as
  D8's pragma check.

  Ran 1 shell command (ctrl+o to expand)

● Verified — the generated-column clamp actually clamps, the partial unique
  index rejects a duplicate click_id, and STRICT + WITHOUT ROWID + upsert all
  work. Recording that in the doc rather than asserting it:

  Ran 1 shell command (ctrl+o to expand)

● Now the two context-hygiene files. CHEATSHEET.md has a hard one-page limit and
  the ratified set has roughly doubled, so table 1 groups the cheap block
  rather than listing 25 rows:

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● docs/DESIGN.md is written — all twelve sections, every choice traced to a
  ratified decision.

  What's in it, beyond restating the decisions:

  - §1 — the split turned out to be four categories, not three. The fourth is
    "interpretation of signals": conversion_attribution is a separate table
    rather than columns on signals, because a late click changes how a
    conversion is read, and if that lived on the log row we'd be mutating the
    log.
  - §2 — full DDL. Dedupe key is event_id (PK on signals); hot path is
    rollup_minute PK (ad_id, minute_start) WITHOUT ROWID, so each chart series
    is one B-tree seek with no indirection, plus ix_rollup_time for cross-ad
    windows and the P16 settlement sweep.
  - §4.5 — the CTR/CPA/ROAS lag as a table of where each numerator and
    denominator lands, with the gate and the maturity indicator kept explicitly
    distinct: too little data vs data still arriving. A young cohort trips both,
    for different reasons, and the surface says which.
  - §5.4 — restatement written as generic pseudocode. D27-B forced that: an
    orphan promotion moves a conversion between two buckets, so a lateness-only
    mechanism would have been wrong on the first orphan, not later.
  - §10.4 — the life of one event as an eight-step trace ending in as_of = 
    918,441 → 1.8, as_of = 918,442 → 2.4, difference is exactly e_88f1.

  I verified rather than asserted the schema. Same method D8 was settled by, in
  the scratchpad: SQLite 3.51.2 under Node 24.14.0 — STRICT tables create, the
  ts_effective generated column accepts MIN() and does clamp (a 2099 ts yields
  ts_effective = received_at, emitted ts intact), the partial unique index
  rejects a second click claiming an existing click_id, and STRICT, WITHOUT 
  ROWID takes the upsert. That note is in §2 so nothing in the storage model
  rests on an untested claim about the driver.

  Also landed: the extensions section owed since Phase 1 close — BRIEF_GAPS.md
  now carries E1–E14 plus seventeen interpretations, separated on purpose, since
  the brief asks to be told about changes to its contracts, not about findings.
  Nothing is narrowed; both candidates were kept and named. CHEATSHEET.md and
  STATUS.md are refreshed and non-overlapping.

  One thing I'd flag rather than leave for you to find. §4.4 says compaction
  would foreclose "any question about an individual impression past the horizon"
  — which means the traceability walk-back stops working on old data while the
  numbers stay correct. That's a sharper cost than D11 recorded at the time, and
  it strengthens the case for not building it, so I've stated it that way
  rather than softening it.

  Open: D17 only — and D32 already took its topology slice, so what's left is
  the emitter's internals. STATUS.md lists the six constraints already fixed
  elsewhere that D17 doesn't get to re-decide, including that the lag
  distribution it generates is what D33's CDF will measure, so it can't be
  uniform.

  Phase 2 closes on your approval, not on the doc existing. Safe to /clear
  either way.

✻ Churned for 12m 1s · done 3:13 PM

❯ make sure STATUS.md is updated and if so, commit phase 2 as well.             

● STATUS.md was rewritten as part of the phase close. Let me verify its claims
  against the actual files before committing, rather than trusting that I wrote
  it correctly.

  Ran 1 shell command (ctrl+o to expand)

● One inaccuracy in STATUS.md: it says DECISIONS.md holds "D1–D34", but nine of
  those are ratified inside the Phase-2 block rather than as ## DECISION #n
  entries — a cold reader grepping for ## DECISION #15 would fail. Fixing that:

  Ran 2 shell commands (ctrl+o to expand)

● Committed as 0159b2b on master. Working tree clean, nothing outside docs/.

  STATUS.md was already current from the phase close, but verifying it against
  the files turned up one real defect, now fixed: it described DECISIONS.md as
  holding "D1–D34", which is true but misleading — twenty have their own ## 
  DECISION #n heading and nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are
  ratified as rows inside the Phase-2 block. Someone resuming cold and grepping
  for ## DECISION #15 would have come up empty and concluded it was unratified.
  STATUS.md now points at the index table as the lookup and names the nine
  explicitly.

  Everything else checked out: 24 standalone decision entries, 5 waves in
  OPEN_QUESTIONS.md, the extensions register present, all 12 DESIGN.md sections
  present.

  One note on what the commit does not mean: STATUS.md still records Phase 2 as
  doc written, awaiting approval. You asked me to commit it, which isn't the
  same as the §4 "approved, continue" gate, so I haven't marked the phase
  closed. Say the word and I'll flip it and move to D17 — which is the only open
  decision left, and is the whole of Phase 3.

✻ Cogitated for 58s · done 3:44 PM

❯ clear                                                                         

❯ /export /ai-sessions/02-phase-2-design.md                                     
  ⎿  Failed to export conversation: EACCES: permission denied, mkdir
     '/ai-sessions'