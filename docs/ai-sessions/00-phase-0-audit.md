 ▐▛███▛█   Claude Code v2.1.259
▝▜██████▀  Opus 5 · Claude Team
  ▝▝ ▝▝    ~/Desktop/Personal/flawless-loop

  Fable 5.1 writes better code and reports progress on long tasks. Switch anytime with /model.

❯ The spec for this project is at docs/BRIEF.md — read it in full before        
  responding. CLAUDE.md at the repo root is our standing working agreement;     
  read that too and treat it as binding for the whole project.                  
                                                                                
  I'm a lead engineer with 11 years of experience — C++ media pipelines and     
  Node/TypeScript services. Talk to me at that level: no basics, no hedging, no 
  long recaps of what I just said.                                              
                                                                                
  This is not a coding task yet. Do not write any code, create any file outside 
  docs/, scaffold any project, or install anything. We are going to fully       
  understand and design the system first, in writing, so that implementation    
  becomes mechanical translation of an agreed design. If you write code before  
  I say "start Phase 5", you've failed the task.                                
                                                                                
  How I need you to behave, for the whole project                               
                                                                                
  No implicit decisions. This is the single most important instruction. The     
  brief is deliberately underdetermined, and I have to be able to explain and   
  defend every choice in the finished system. So every choice with a defensible 
  alternative — data model, storage engine, persistence boundary, aggregation   
  strategy, event semantics, attribution windows, component versioning,         
  transport, scope, information architecture, even libraries — comes to me as a 
  decision, using the DECISION #n format in CLAUDE.md §3: context, options      
  with pros/cons/what-it-forecloses, your recommendation with reasoning, and    
  one concrete question. I make the final call. Never quietly pick and move on. 
  If you notice yourself having already assumed something, surface it           
  retroactively and label it as an unratified assumption.                       
                                                                                
  Batch decisions 3–6 at a time so I can answer in one pass, and order them by  
  what blocks what.                                                             
                                                                                
  Push back. The brief explicitly invites it: "Push back where you think the    
  brief is wrong, and ask questions along the way." I want you actively hunting 
  for gaps, contradictions, missing identifiers, and undefined semantics — not  
  smoothing over them. Where a product ask itself seems wrong, say so with a    
  reason and an alternative.                                                    
                                                                                
  Never guess or work from memory. Read docs/BRIEF.md and the docs in docs/. If 
  a detail isn't written down, ask me — don't reconstruct a plausible version   
  of it.                                                                        
                                                                                
  Phase 0 — deliver these two documents, then stop                              
                                                                                
  A) docs/BRIEF_GAPS.md — everything in the brief that can't be built as        
  written.                                                                      
                                                                                
  Do this as a systematic audit, not an impressions pass. I want it exhaustive. 
  Work through it in these passes and report findings from each:                
                                                                                
  Field-by-field pass. Every field of Ad, Component, Audience, Signal (each     
  variant), and Decision (each action). For each field ask: is the thing it     
  refers to actually identified anywhere? Are units, currency, and timezone     
  pinned down? Is a numeric value a delta or a cumulative reading? Who is       
  allowed to write it? What does absent/null mean? Is it derivable from         
  something else in the model, and if so, is storing it a divergence hazard?    
  Referential pass. Follow every cross-reference between the types. Does every  
  id that is referenced have a corresponding field on the type it points at?    
  Does every enum member have somewhere in the model it can actually live? Are  
  there orphan concepts — declared but unreachable, or reachable but            
  undeclared?                                                                   
  Product-ask pass. Take each of the three surface asks sentence by sentence    
  and check whether everything it describes is expressible with the given       
  contracts. Every capability the prose promises that the types can't support   
  is a finding. Also check the Background section: concepts introduced there    
  that never appear in the contracts or the challenge.                          
  Event-semantics pass. The brief states at-least-once, unordered delivery,     
  event time vs arrival time, and late-attributing conversions. Push on all of  
  it: conflicting duplicates sharing an id, orphaned references, clock skew,    
  bursts, gaps, corrections and retractions, and when a period is ever finally  
  closed. Which of these does the contract as written simply have no vocabulary 
  for?                                                                          
  Invariant pass. What invariants does the model imply, and which of them can   
  be violated without anything in the contract detecting it? Which are stated   
  but unenforceable?                                                            
  Lifecycle pass. Every state in every status enum: what transition reaches it, 
  and does a lever exist for that transition? Any state with no path in or out  
  is a finding.                                                                 
                                                                                
  For each finding: what the brief says, why it's a problem, the realistic      
  options, a recommendation, and a category — missing identifier / missing      
  field / undefined semantics / internal contradiction / unenforceable          
  invariant / product ask not expressible / real-world case the contract can't  
  represent — plus a severity: blocking / needs a decision / cosmetic.          
                                                                                
  Don't stop at the obvious ones and don't pad the list with restatements of    
  the same issue. If a pass turns up nothing, say so explicitly rather than     
  inventing a finding. Don't resolve anything yet — this is a register, and it  
  becomes a README section later.                                               
                                                                                
  B) docs/OPEN_QUESTIONS.md — everything you need me to decide.                 
                                                                                
  Two sections:                                                                 
                                                                                
  Questions to send back to whoever wrote the brief — the things that genuinely 
  can't be resolved unilaterally, phrased tightly. Keep this short and sharp.   
  Decisions for me — the full inventory, in DECISION #n format, ordered by what 
  blocks what. I want the whole set up front so I can see the shape of what     
  I'm committing to, even the ones we won't resolve until Phase 2 or 3. At      
  minimum I expect these to appear:                                             
  Which 1–2 surfaces we build for real, and what "sketched" means for the rest. 
  Is an ad a frozen bundle or a recipe over components?                         
  Component versioning: mutate in place / copy-on-write / immutable once live.  
  What the strategist actually manages: the ad or the component.                
  Where the persistence boundary sits, and which store.                         
  Aggregation: raw events forever / rollups / hybrid — and whether CTR, CPA and 
  ROAS are computed at write time, derived at read time, or cached.             
  What we compact away, and what question that makes unanswerable.              
  Config: store the fold, the log, or both — and which one the UI reads.        
  Lateness horizon and restatement policy for late conversions.                 
  Attribution: which config generation gets credit for a late conversion.       
  Simulator architecture: in-process vs separate process; wall-clock vs         
  accelerated time; seeded determinism; how much history we backfill at seed.   
  Event transport to the browser: SSE / WebSocket / polling.                    
  Decision scoring: the before-window vs after-window heuristic and its guard   
  against conversion lateness.                                                  
  How we separate signal from noise (minimum sample sizes, smoothing).          
                                                                                
  Mark each decision [LOAD-BEARING] if it is expensive to reverse or if other   
  decisions depend on it, and [CHEAP] if we can change our mind later without   
  rework. I want to spend my attention on the first kind.                       
                                                                                
  Format                                                                        
                                                                                
  Terse and structured. Tables and bullets over prose. No preamble, no summary  
  of the brief back to me — I've read it. When you've written both documents,   
  give me a short orientation (what surprised you, which decision you think is  
  the highest risk, and the three findings you think are the most substantive)  
  and then stop and wait. Do not start Phase 1.                                 

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

● I've read docs/BRIEF.md (162 lines) and CLAUDE.md in full. The audit is done.
  One procedural note: plan mode is on, so I can't write into docs/ yet — the
  plan file below is the audit in index form so you can see the shape and sign
  off; on approval I write out both documents in full and stop.

● Updated plan
  ⎿  /plan to preview

● Orientation

  What surprised me — the brief contradicts itself on the one sentence the
  Decision loop is built on. "Current config is derivable: the initial state 
  folded over the decision log" is not true given the types: there is no
  create_ad or launch action, so the fold has no origin. Combined with archived
  having no entry and draft having no exit, only live ⇄ paused is actually
  reachable. The second surprise is smaller and sharper:
  conversion.attributed_click_id points at a field that does not exist anywhere
  — click has no click_id.

  Highest-risk decision — D7 (store the fold, the log, or both, and which the UI
  reads), taken together with D5 (where the fold originates) and D14 (which
  config generation a late conversion credits). These three are one knot. Every
  surface joins through it: Workbench's "used in twelve live ads" is a temporal
  query over it, Signal's per-component metrics can't exist without it, and the
  traceability requirement — walk any pixel back to raw events and have them
  agree — is only demonstrable if config-as-of-T is addressable. It is also the
  most expensive thing to retrofit, because getting it wrong means the event
  store has already been written without a generation key.

  Three most substantive findings

  1. G16 — no arrival timestamp. The brief makes late-attributing conversions
     the flagship requirement, states that ts is event time "not arrival time",
     and then gives no field for arrival time. Without it there is no watermark,
     no lateness horizon, no way to distinguish a restatement from a
     correction, no as-of chart, and no guard on the before/after scoring
     window. The brief's own headline hard requirement is not implementable
     against its own contract.
  2. G18 — signals carry ad_id only. The entire Workbench premise is component
     reuse ("one video in twelve live ads"). No signal references a component,
     so component performance is only obtainable by resolving the ad's config as
     of the event's timestamp — and G01 means nothing identifies that config.
     The join between the two most important surfaces is missing from the model.
  3. G33/G50 — the lever set doesn't close the lifecycle. Two of the five
     capabilities the Decision loop prose names outright ("spin up a variant,
     kill and relaunch") have no action, the fold has no origin, and two of four
     Ad.status states are unreachable. This is where the brief asks for
     something it did not spec.

  44 findings across six passes; the referential pass turned up the least new
  material (most of it collapsed into field-pass findings rather than being
  padded out separately) and I say so in the document.

● User approved Claude's plan
  ⎿  Plan saved to: ~/.claude/plans/the-spec-for-this-dapper-charm.md · /plan to
     edit
     Phase 0 — Ingest & Interrogate

     Context

     docs/BRIEF.md is deliberately underdetermined. Per CLAUDE.md §4, Phase 0
     produces two
     documents and no code. Per CLAUDE.md §3, nothing here gets resolved — this
     is a register
     plus a decision inventory.

     Deliverables, both under docs/:

     - docs/BRIEF_GAPS.md — audit register, six passes, ~44 findings, each with
       what-the-brief-says / why-it's-a-problem / options / recommendation /
       category / severity.
       Becomes a README section later.
     - docs/OPEN_QUESTIONS.md — §A short list of questions for the brief's
       author;
       §B full decision inventory in CLAUDE.md §3 format, ordered by blocking,
       tagged
       [LOAD-BEARING] / [CHEAP].

     Nothing else is created or modified. No package.json, no scaffold, no types
     on disk.

     ---

     A. docs/BRIEF_GAPS.md — finding index

     Categories: MI missing identifier · MF missing field · US undefined
     semantics ·
     IC internal contradiction · UI unenforceable invariant · PA product ask not
     expressible · RW real-world case not representable.
     Severity: B blocking · D needs a decision · C cosmetic.

     Pass 1 — Field-by-field

     #: G01
     Finding: Ad has no config-generation / version identifier. Nothing names
     "the
     config as of time T", which every retroactive attribution needs.
     Cat: MI
     Sev: B
     ────────────────────────────────────────
     #: G02
     Finding: launched_at is derivable from the decision log, has no writer, and
     no
     lever sets it. Divergence hazard.
     Cat: UI
     Sev: D
     ────────────────────────────────────────
     #: G03
     Finding: Ad has no created_at and no human-readable name, though Component
     has
     created_at.
     Cat: MF
     Sev: C
     ────────────────────────────────────────
     #: G04
     Finding: daily_budget_cents: "daily" has no timezone or day boundary
     anywhere
     in the model; nothing enforces spend against it.
     Cat: US
     Sev: B
     ────────────────────────────────────────
     #: G05
     Finding: All money is "integer USD cents" while Audience.geo is any
     ISO-3166
     country. No currency field.
     Cat: US
     Sev: C
     ────────────────────────────────────────
     #: G06
     Finding: Ad has slots for video + headline only; Component.kind also
     declares
     image and body_copy. Two enum members have nowhere to live.
     Cat: PA
     Sev: D
     ────────────────────────────────────────
     #: G07
     Finding: Nothing constrains video_id to point at a kind: "video" component.
     Cat: UI
     Sev: D
     ────────────────────────────────────────
     #: G08
     Finding: channel is an inline enum on Ad; audience is an id to an entity.
     Background describes platform and surface; the model collapses both into
     one
     string with no platform grouping.
     Cat: IC
     Sev: C
     ────────────────────────────────────────
     #: G09
     Finding: No lever changes audience_id or channel, so both are immutable
     after
     launch by omission, never stated.
     Cat: US
     Sev: D
     ────────────────────────────────────────
     #: G10
     Finding: Component has no version, parent_id, or supersedes, yet the brief
     demands a versioning decision. The type has no vocabulary for any of the
     three options.
     Cat: MF
     Sev: B
     ────────────────────────────────────────
     #: G11
     Finding: Component.payload: string is polymorphic (copy text vs asset URL)
     with
     no mime, dimensions, or duration.
     Cat: US
     Sev: D
     ────────────────────────────────────────
     #: G12
     Finding: Component has no status/lifecycle — cannot be retired, and
     "immutable
     once live" has no state to express.
     Cat: MF
     Sev: D
     ────────────────────────────────────────
     #: G13
     Finding: Audience.est_size has no unit and no as_of. Staleness undefined.
     Cat: US
     Sev: C
     ────────────────────────────────────────
     #: G14
     Finding: Audience has no created_at; inconsistent with Component.
     Cat: MF
     Sev: C
     ────────────────────────────────────────
     #: G15
     Finding: Audience overlap is not representable; temperature: "retargeting"
     has
     no referent (nothing says what it retargets).
     Cat: RW
     Sev: C
     ────────────────────────────────────────
     #: G16
     Finding: Signal has no arrival/ingest timestamp. The brief states ts is
     event
     time "not arrival time" but supplies no field for arrival time. Lateness
     horizons, watermarks, as-of charts, restatement detection and the scoring
     guard are all unimplementable without it.
     Cat: MF
     Sev: B
     ────────────────────────────────────────
     #: G17
     Finding: No click_id exists. conversion.attributed_click_id references a
     field
     that is not on the click variant. Only reading is "the click's event_id",
     never stated.
     Cat: MI
     Sev: B
     ────────────────────────────────────────
     #: G18
     Finding: Signals carry ad_id only — no component or config linkage.
     Component-level performance ("one video in twelve ads") requires resolving
     the ad's config as of ts, which needs G01.
     Cat: MI
     Sev: B
     ────────────────────────────────────────
     #: G19
     Finding: spend: delta vs cumulative reading is unspecified, as is cadence
     and
     whether CPM vs fee is distinguishable.
     Cat: US
     Sev: B
     ────────────────────────────────────────
     #: G20
     Finding: conversion.value_cents: gross vs net unspecified; no conversion
     kind,
     though Background names purchases and installs (an install has no natural
     value).
     Cat: US
     Sev: D
     ────────────────────────────────────────
     #: G21
     Finding: No sequence number or offset. Gaps, stalls and "no events yet" vs
     "no
     events ever" are indistinguishable.
     Cat: MF
     Sev: D
     ────────────────────────────────────────
     #: G22
     Finding: ts precision unstated; same-timestamp tie-break undefined.
     Cat: US
     Sev: C
     ────────────────────────────────────────
     #: G23
     Finding: Decision.ts — request time or effective time? They differ for the
     fold
     and for the simulator.
     Cat: US
     Sev: D
     ────────────────────────────────────────
     #: G24
     Finding: set_budget.from_cents and swap_component.from_id are derivable
     from
     the fold. Storing them is a divergence hazard with no stated precedence.
     Cat: UI
     Sev: D
     ────────────────────────────────────────
     #: G25
     Finding: Decision has no status. No idempotency rule (pause an
     already-paused
     ad), no conflict rule (two set_budget at one ts), no failure state.
     Cat: MF
     Sev: D
     ────────────────────────────────────────
     #: G26
     Finding: Decision has no reference to the evidence that triggered it.
     rationale
     is free text even for system:fatigue_rule, so a system decision cannot be
     traced to the numbers that fired it.
     Cat: MF
     Sev: D
     ────────────────────────────────────────
     #: G27
     Finding: actor is an opaque string; no user entity.
     Cat: MF
     Sev: C

     Pass 2 — Referential

     ┌─────┬────────────────────────────────────────────────────────┬─────┬─────
     ┐
     │  #  │                        Finding                         │ Cat │ Sev
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ No variant/experiment entity, though Workbench asks    │     │
     │
     │ G28 │ for "a model of variants". Sibling relationships       │ PA  │ B
     │
     │     │ between ads are unrepresentable.                       │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G29 │ No campaign/portfolio entity, though the premise       │ PA  │ D
     │
     │     │ centres on "a portfolio of experiments".               │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G30 │ A conversion's ad_id can contradict the ad_id of the   │ UI  │ D
     │
     │     │ click it names. No precedence rule.                    │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G31 │ Decision.swap_component.from_id/to_id are never        │ MI  │ C
     │
     │     │ declared to point at Component.                        │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ Reachable-but-undeclared: nothing links                │     │
     │
     │ G32 │ Audience/Channel to the "component library" the        │ PA  │ C
     │
     │     │ Workbench prose describes them as part of.             │     │
     │
     └─────┴────────────────────────────────────────────────────────┴─────┴─────
     ┘

     Pass 3 — Product ask

     #: G33
     Finding: "Current config is derivable: the initial state folded over the 
     decision log" is false as written. There is no create_ad or launch
     decision,
     so the fold has no origin. The log alone cannot reconstruct any config.
     Cat: IC
     Sev: B
     ────────────────────────────────────────
     #: G34
     Finding: Decision-loop names five levers — "pause, reallocate budget, swap
     a
     component, spin up a variant, kill and relaunch". Two have no action in the

     contract.
     Cat: PA
     Sev: B
     ────────────────────────────────────────
     #: G35
     Finding: "A lever … shows up in the stream" — Decision is not a Signal. No
     shared envelope, no shared clock, no common sequence. A unified timeline
     requires an extension.
     Cat: IC
     Sev: D
     ────────────────────────────────────────
     #: G36
     Finding: Background defines human-in-the-loop as a core concept and
     Decision
     supports system: actors, but there is no proposed/pending/approved state.
     Every system decision is auto-applied; the promised pause-for-review cannot

     exist.
     Cat: PA
     Sev: D
     ────────────────────────────────────────
     #: G37
     Finding: Background defines creative fatigue as central; nothing in the
     contracts carries a fatigue signal or decay. It is purely inferred — which
     pushes the whole concept into the simulator and the heuristic.
     Cat: PA
     Sev: D
     ────────────────────────────────────────
     #: G38
     Finding: "Used in twelve live ads" is a temporal reverse join. Historical
     usage
     is only recoverable if swap decisions and origin config are complete —
     blocked by G33.
     Cat: PA
     Sev: D
     ────────────────────────────────────────
     #: G39
     Finding: "Everything on screen is derived from the stream" cannot hold
     literally: budget, status and config come from the decision log, not the
     signal stream. Two derivation sources, one claim.
     Cat: IC
     Sev: C

     Pass 4 — Event semantics

     ┌─────┬────────────────────────────────────────────────────────┬─────┬─────
     ┐
     │  #  │                        Finding                         │ Cat │ Sev
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G40 │ Duplicates sharing an event_id but disagreeing on      │ US  │ D
     │
     │     │ payload: no first-write-wins / last-write-wins rule.   │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ Orphaned attributed_click_id (click never arrives, or  │     │
     │
     │ G41 │ arrives later): no policy — drop, park, or count       │ US  │ D
     │
     │     │ provisionally.                                         │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ Nothing defines when a period closes. No watermark, no │     │
     │
     │ G42 │  lateness horizon, no finality. Every number is        │ US  │ B
     │
     │     │ provisional forever, and the UI has no vocabulary to   │     │
     │
     │     │ say so.                                                │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ No correction, retraction, refund or void event.       │     │
     │
     │ G43 │ Append-only with no negation; chargebacks and platform │ RW  │ D
     │
     │     │  restatements are unrepresentable.                     │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G44 │ Clock skew between the source's ts and local time is   │ RW  │ D
     │
     │     │ undetectable without G16.                              │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ At-least-once is stated for signals but not for        │     │
     │
     │ G45 │ decisions; decision replay/idempotency semantics are   │ US  │ C
     │
     │     │ unstated.                                              │     │
     │
     └─────┴────────────────────────────────────────────────────────┴─────┴─────
     ┘

     Pass 5 — Invariants

     ┌─────┬────────────────────────────────────────────────────────┬─────┬─────
     ┐
     │  #  │                        Finding                         │ Cat │ Sev
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ clicks ≤ impressions and conversions ≤ clicks are      │     │
     │
     │ G46 │ implied but transiently violable by out-of-order       │ UI  │ D
     │
     │     │ arrival. No stated tolerance, so the UI cannot tell a  │     │
     │
     │     │ bug from normal lateness.                              │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G47 │ Spend ≤ daily budget is implied by the field name and  │ UI  │ D
     │
     │     │ enforced nowhere (compounds G04).                      │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ Nothing forbids signals arriving for a draft, paused   │     │
     │
     │ G48 │ or archived ad. The brief's own demo ("pause a_12 and  │ UI  │ D
     │
     │     │ its events stop ticking") is a simulator convention,   │     │
     │
     │     │ not a contract invariant.                              │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ No sign constraint on any money field. Negative values │     │
     │
     │ G49 │  are the natural encoding for refunds (G43) and are    │ UI  │ C
     │
     │     │ neither permitted nor forbidden.                       │     │
     │
     └─────┴────────────────────────────────────────────────────────┴─────┴─────
     ┘

     Pass 6 — Lifecycle

     ┌─────┬────────────────────────────────────────────────────────┬─────┬─────
     ┐
     │  #  │                        Finding                         │ Cat │ Sev
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │     │ Ad.status has dead states. draft has no exit, archived │     │
     │
     │ G50 │  has no entry, live has no entry from draft. Only live │ PA  │ B
     │
     │     │  ⇄ paused is closed by the lever set.                  │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G51 │ pause on a draft ad, resume on a live ad: undefined    │ US  │ C
     │
     │     │ (no-op, error, or state change).                       │     │
     │
     ├─────┼────────────────────────────────────────────────────────┼─────┼─────
     ┤
     │ G52 │ Component and Decision have no status enums at all —   │ MF  │ D
     │
     │     │ no lifecycle to audit (see G12, G25).                  │     │
     │
     └─────┴────────────────────────────────────────────────────────┴─────┴─────
     ┘

     Passes that turned up nothing new are stated as such in the document rather
     than padded.

     ---

     B. docs/OPEN_QUESTIONS.md — structure

     §A Questions for the brief's author (7, tight)

     1. Is an arrival/ingest timestamp available from the platform, or do we
        stamp it ourselves at ingest? (G16)
     2. Is attributed_click_id the click's event_id, or a separate platform
        click id we are expected to add? (G17)
     3. Are spend events deltas or cumulative readings, and at what cadence?
        (G19)
     4. What creates and launches an ad? The fold has no origin — is a
        create/launch lever intended, or is initial config seeded outside the
        log? (G33)
     5. Component.kind declares image and body_copy; Ad and swap_component.slot
        have no slots for them. Extend Ad, or are those kinds forward-looking?
        (G06)
     6. Should system decisions be proposals requiring human approval, given
        Background makes human-in-the-loop a core concept? (G36)
     7. Which timezone closes a "daily" budget? (G04)

     §B Decisions for Seno — inventory, ordered by what blocks what

     Full CLAUDE.md §3 format for each (Blocking / Context / Options with pros,
     cons, forecloses,
     reversal cost / Recommendation / one concrete question).

     #: D1
     Title: Which surfaces are built for real, and what "sketched" means
     Tag: LOAD-BEARING
     Blocks: everything
     ────────────────────────────────────────
     #: D2
     Title: Is an ad a frozen bundle or a recipe over components
     Tag: LOAD-BEARING
     Blocks: D3, D4, D13
     ────────────────────────────────────────
     #: D3
     Title: Component versioning: mutate / copy-on-write / immutable once live
     Tag: LOAD-BEARING
     Blocks: D4, D10
     ────────────────────────────────────────
     #: D4
     Title: Unit the strategist manages: the ad or the component
     Tag: CHEAP (IA)
     Blocks: Workbench UI
     ────────────────────────────────────────
     #: D5
     Title: Origin of the fold — add create_ad / launch levers, or seed config
     outside the log
     Tag: LOAD-BEARING
     Blocks: D6, D7, D13
     ────────────────────────────────────────
     #: D6
     Title: Lever set extension: launch, archive, variant, relaunch, approve
     Tag: LOAD-BEARING
     Blocks: Decision loop, D18
     ────────────────────────────────────────
     #: D7
     Title: Config representation: store the fold, the log, or both — and which
     the
     UI reads
     Tag: LOAD-BEARING
     Blocks: D8, D13
     ────────────────────────────────────────
     #: D8
     Title: Persistence boundary and store engine
     Tag: LOAD-BEARING
     Blocks: D9, D10, D17
     ────────────────────────────────────────
     #: D9
     Title: Aggregation granularity: raw forever / rollups / hybrid
     Tag: LOAD-BEARING
     Blocks: D10, D11
     ────────────────────────────────────────
     #: D10
     Title: Metric computation point: write time / read time / cached
     Tag: LOAD-BEARING
     Blocks: D12
     ────────────────────────────────────────
     #: D11
     Title: Compaction policy and the question it makes unanswerable
     Tag: LOAD-BEARING
     Blocks: D12
     ────────────────────────────────────────
     #: D12
     Title: Add an arrival timestamp to the event envelope
     Tag: LOAD-BEARING
     Blocks: D13, D14, D19
     ────────────────────────────────────────
     #: D13
     Title: Lateness horizon and restatement policy for late conversions
     Tag: LOAD-BEARING
     Blocks: D14, D19, D20
     ────────────────────────────────────────
     #: D14
     Title: Attribution: which config generation gets credit for a late
     conversion
     Tag: LOAD-BEARING
     Blocks: traceability
     ────────────────────────────────────────
     #: D15
     Title: Duplicate-conflict rule: first-write-wins vs last-write-wins
     Tag: CHEAP
     Blocks: —
     ────────────────────────────────────────
     #: D16
     Title: Orphan-conversion policy: drop / park / count provisionally
     Tag: CHEAP
     Blocks: —
     ────────────────────────────────────────
     #: D17
     Title: Simulator architecture: in-process vs separate process; wall-clock
     vs
     accelerated; seeded determinism; backfill depth at seed
     Tag: LOAD-BEARING
     Blocks: Phase 3
     ────────────────────────────────────────
     #: D18
     Title: Event transport to the browser: SSE / WebSocket / polling
     Tag: CHEAP
     Blocks: —
     ────────────────────────────────────────
     #: D19
     Title: Decision scoring: before-window vs after-window heuristic and its
     lateness guard
     Tag: CHEAP
     Blocks: —
     ────────────────────────────────────────
     #: D20
     Title: Signal vs noise: minimum sample sizes and smoothing
     Tag: CHEAP
     Blocks: —
     ────────────────────────────────────────
     #: D21
     Title: Unified timeline: do decisions enter the signal stream, or merge
     client-side
     Tag: CHEAP
     Blocks: D18
     ────────────────────────────────────────
     #: D22
     Title: Day boundary / timezone for daily budget and daily rhythms
     Tag: LOAD-BEARING (simulator)
     Blocks: D17
     ────────────────────────────────────────
     #: D23
     Title: Image and body_copy: extend Ad with slots, or drop the kinds
     Tag: CHEAP
     Blocks: D2
     ────────────────────────────────────────
     #: D24
     Title: How we demonstrate traceability (event → stored fact → aggregate →
     pixel)
     Tag: needs decision
     Blocks: D9, D10
     ────────────────────────────────────────
     #: D25
     Title: Correction/retraction vocabulary: add a void event, allow negative
     money, or declare it out of scope
     Tag: CHEAP
     Blocks: D13

     ---

     Verification

     - docs/BRIEF_GAPS.md and docs/OPEN_QUESTIONS.md exist; nothing else is
       created or changed
       (git status shows exactly two new files under docs/).
     - Every finding cites the brief by line or quote, and every [LOAD-BEARING]
       decision names
       what it blocks.
     - Every finding tagged B appears as, or is subsumed by, at least one
       decision in §B.
     - Nothing is resolved in Phase 0; no recommendation is treated as accepted.

● Write(docs/BRIEF_GAPS.md)
  ⎿  Wrote 1420 lines to docs/BRIEF_GAPS.md
      1 # BRIEF_GAPS.md — audit register
      2 
      3 Phase 0 output. This is a **register, not a resolution**. Nothing
      4 recommendations are inputs to `../OPEN_QUESTIONS.md`, and only 
        become real once they appear
      5 in `../DECISIONS.md` as ACCEPTED.
      6 
        .
      8 
      9 ## Legend
     … +2098 lines (ctrl+o to expand)

❯ progress?                                                                     

● Progress: docs/BRIEF_GAPS.md is written and complete — 52 findings across all
  six passes, each with quote, problem, options, recommendation, category,
  severity, plus a cross-cutting root-cause summary. 12 are blocking.

  Remaining: docs/OPEN_QUESTIONS.md. Plan mode re-engaged mid-turn, so I'm
  updating the plan file and exiting to finish the second document.

● Updated plan
  ⎿  /plan to preview

● Write(docs/OPEN_QUESTIONS.md)
  ⎿  Wrote 1134 lines to docs/OPEN_QUESTIONS.md
      1 # OPEN_QUESTIONS.md
      2 
      3 Phase 0 output. Companion to `../BRIEF_GAPS.md` — that document
      4 broken; this one is the list of what needs deciding. `G##` refere
        nces point into it.
      5 
      6 Nothing here is decided. A decision becomes real only when it is 
      7 `../DECISIONS.md` as ACCEPTED, in Seno's words.
      8 
      9 ---
     … +1633 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Both documents are written. Two new files, nothing else touched, no code.

  - docs/BRIEF_GAPS.md — 52 findings across all six passes, each with a verbatim
    quote and line reference, the problem, realistic options, a recommendation,
    a category and a severity. 12 blocking. Closes with a root-cause table
    showing that most findings resolve downstream of four.
  - docs/OPEN_QUESTIONS.md — §A seven questions for the brief's author; §B 25
    decisions in CLAUDE.md §3 format across four waves ordered by blocking, 14
    load-bearing; §C seven unratified assumptions with the gate each one needs
    clearing before.

  Orientation

  What surprised me. The brief contradicts itself on the sentence the Decision
  loop is built on. "Current config is derivable: the initial state folded over 
  the decision log" is false against the given types — there is no create or
  launch action, so the fold has no origin, and the log can only reconstruct
  changes to a config it must be handed from elsewhere. That "elsewhere" is a
  config write that is not a lever, which contradicts L42 directly. Seen from
  the state-machine side it is the same defect: draft has no exit, archived has
  no entry, and only live ⇄ paused is closed. The second surprise is smaller and
  sharper — conversion.attributed_click_id points at a field that does not
  exist anywhere in the contract.

  Writing it up changed one thing from what I said earlier: G43 (no retraction 
  vocabulary) deserves more weight than its severity suggests. Chargebacks and
  reversed conversions are arguably more common in the wild than late
  attribution, the brief does not mention them at all, and the contract is
  append-only with no way to un-count a conversion. It is cheap to note and
  nearly free to implement once the restatement path exists — which is a real
  argument for building that path generically rather than special-casing
  lateness.

  Highest-risk decision. D12 — adding received_at and ingest_seq to the event
  envelope. Not because it is hard, but because it is the only decision in the
  document with an asymmetric, closing window: two columns to add, and
  permanently unrecoverable if skipped, since events already ingested cannot be
  given an arrival time afterwards. Everything the brief says it cares most
  about in Signal is a statement about arrival, and the contract cannot express
  arrival. D5/D7/D14 (the config-generation knot) are more expensive to reverse
  in effort, but they are reversible; this one is not.

  Three most substantive findings.

  1. G16 — no arrival timestamp. The brief makes late-attributing conversions
     the flagship requirement, explicitly states ts is "event time, not arrival 
     time", then provides no field for arrival time. No watermark, no lateness
     horizon, no restatement detection, no as-of view, no guard on the
     before/after scoring window. The headline requirement is not implementable
     against its own contract.
  2. G33/G50 — the fold has no origin and the lifecycle is half-decorative.
     Above. It also takes down "what is recomputable from the event log," which
     is an explicit grading criterion, and two of the five levers the prose
     names outright.
  3. G18 — signals carry ad_id only. The Workbench premise is component reuse;
     no signal references a component. Component-level performance requires
     resolving the ad's config as of the event's timestamp, which needs a
     generation identifier that does not exist. The join between the two most
     important surfaces is missing, and without it a video's performance number
     silently changes whenever an unrelated ad swaps a component.

  Stopping here. I have not written docs/STATUS.md — per §9 that belongs at
  phase close, so I will write it once Phase 0 is signed off rather than
  pre-empting it. Phase 1 not started; nothing proceeds until D1 is answered.

✻ Churned for 16m 41s · done 10:13 AM

❯ For every blocking finding, classify into exactly one: FIX (extend the        
  contract and build it), SPECIFY (design it fully in the README, don't build   
  it), or NAME (state it as a known limit we tolerate). Give me a count for     
  each bucket and total the FIX bucket's build cost in plan items. If FIX is    
  more than about six extensions, tell me which ones you'd move to SPECIFY and  
  why.                                                                          

  Read 1 file (ctrl+o to expand)

● Updated plan
  ⎿  /plan to preview

● One caveat up front, because it changes the answer: this triage is conditional
  on D1 = A (Signal + Decision loop built, Workbench sketched), which you
  haven't ratified. Under D1-B the buckets invert — G10 and G28 become FIX, and
  G42's restatement path plus G01's click-time attribution drop to SPECIFY.
  Flagging it as an unratified assumption rather than burying it.

  Triage — 12 blocking findings

  ┌─────┬────────────────────────┬─────────┬────────────────────────────────┐
  │ Gap │       Short form       │ Bucket  │             Reason             │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │                        │         │ Irreversible if skipped —      │
  │ G16 │ No arrival timestamp   │ FIX     │ events ingested without it can │
  │     │                        │         │  never be given one            │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ No definition of when  │         │ The one mandatory              │
  │ G42 │ a period closes        │ FIX     │ misbehaviour, handled end to   │
  │     │                        │         │ end                            │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ attributed_click_id    │         │ One field; without it          │
  │ G17 │ dangles                │ FIX     │ click-time attribution can't   │
  │     │                        │         │ be built                       │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ spend delta vs         │         │ Can't emit or ingest spend     │
  │ G19 │ cumulative             │ FIX     │ without pinning it; ~0         │
  │     │                        │         │ marginal cost                  │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │                        │         │ create_ad + launch; otherwise  │
  │ G33 │ The fold has no origin │ FIX     │ "recomputable from the log"    │
  │     │                        │         │ answers "not the config"       │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ No config-generation   │         │ Prerequisite for D14 and the   │
  │ G01 │ identifier             │ FIX     │ traceability anchor; no        │
  │     │                        │         │ substitute                     │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ "Daily" has no day     │         │ Timezone constant is required  │
  │ G04 │ boundary               │ FIX     │ for any bucketing to be        │
  │     │                        │         │ well-defined                   │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │                        │         │ Serves the sketched Workbench; │
  │ G18 │ Events carry no        │ SPECIFY │  generations get built anyway, │
  │     │ component/config link  │         │  so the README shows a real    │
  │     │                        │         │ query                          │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │                        │         │ Blocking half resolved by      │
  │ G50 │ Ad.status dead states  │ SPECIFY │ G33's launch; only archive     │
  │     │                        │         │ remains, nothing graded        │
  │     │                        │         │ touches it                     │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ Two of five levers     │         │ Residue is clone_ad +          │
  │ G34 │ missing                │ SPECIFY │ relaunch; the loop already     │
  │     │                        │         │ closes via pause/budget/swap   │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │     │ No component           │         │ Nothing edits components if    │
  │ G10 │ version/lineage        │ SPECIFY │ the Workbench is sketched → no │
  │     │                        │         │  versioning at runtime         │
  ├─────┼────────────────────────┼─────────┼────────────────────────────────┤
  │ G28 │ No variant entity      │ SPECIFY │ Field is free, the comparison  │
  │     │                        │         │ view is a surface              │
  └─────┴────────────────────────┴─────────┴────────────────────────────────┘

  FIX 6 · SPECIFY 6 · NAME 0

  NAME being empty is the right result, not a miss. A blocking finding is
  definitionally one we can't merely tolerate. NAME is where the non-blocking
  register lives — G43 (retractions), G15 (audience overlap), G21 (gap
  detection), G46 (transient funnel violations), G05 (USD-only), G29 (no
  portfolio). That set becomes the README's tolerated-misbehaviours section.

  FIX build cost — 8 plan items

  ┌─────┬──────────────────────────────────────────────────────────┬────────┐
  │  #  │                           Item                           │ Closes │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P1  │ Ingest boundary: received_at + ingest_seq, dedupe on     │ G16    │
  │     │ event_id, persist all deliveries, integer validation     │        │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P2  │ Signal types + emitter: click_id, spend as               │ G17,   │
  │     │ fixed-interval deltas                                    │ G19    │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P3  │ create_ad + launch variants with compare-and-swap        │ G33    │
  │     │ validation                                               │        │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P4  │ Config fold + rebuildable ads projection                 │ G33    │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P5  │ config_generations table, maintained on config-changing  │ G01    │
  │     │ decisions                                                │        │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P6  │ Minute rollups + settlement state from the lateness      │ G42,   │
  │     │ horizon (incl. timezone constant)                        │ G04    │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P7  │ Restatement path: late arrival recomputes affected       │ G42    │
  │     │ buckets, marks them restated                             │        │
  ├─────┼──────────────────────────────────────────────────────────┼────────┤
  │ P8  │ Click-time attribution + orphan parking / provisional    │ G01,   │
  │     │ counting                                                 │ G42    │
  └─────┴──────────────────────────────────────────────────────────┴────────┘

  Over budget — what I moved

  FIX started at 9 findings / ~9 contract extensions and 10 plan items. Three
  trims:

  1. G18 — ingest-time generation stamping → SPECIFY (saves 1 item). Component
     metrics become a read-time join over config_generations by (ad_id, ts)
     rather than a stamped column. The consuming surface is sketched, so the
     cost is only speed on a query nobody runs. The substrate survives, which
     means the README shows a real query rather than a hypothesis.
  2. G04 — budget pacing → SPECIFY (saves 1 item), timezone constant stays. This
     is the debatable one. Without pacing, set_budget changes a number and
     doesn't visibly change the world, so "the world responds" rests entirely on
     pause. That meets the stated minimum (at least one closable decision) but
     gives up a second, better demonstration. Reinstate this first if budget
     frees up.
  3. G50 — archive → SPECIFY (~0.5 item, absorbed into P3's slack). launch is
     the transition that matters.

  8 is the floor without giving up a graded criterion. Getting to 6 means
  cutting P7 or P8, and either one breaks hard requirement #4 — late conversions
  would be detected but not handled, which is the gap between the flagship
  requirement and a paragraph about it. I wouldn't make that trade. If 8 is too
  many, the lever is D1's sketch boundary, not this list.

  Written to the plan file. Still waiting on D1 before any of it is settled.

✻ Worked for 2m 40s · done 10:22 AM

❯ /plan                                                                         
  ⎿  Current Plan
     /home/seno/.claude/plans/the-spec-for-this-dapper-charm.md

     Blocking-finding triage — FIX / SPECIFY / NAME

     Context

     Phase 0 is delivered: docs/BRIEF_GAPS.md (52 findings, 12 blocking) and
     docs/OPEN_QUESTIONS.md (7 author questions, 25 decisions, 7 unratified
     assumptions). Both
     files exist; no code.

     This document triages the 12 blocking findings into build buckets so the
     FIX budget is a
     number rather than a feeling, and so Phase 1 (docs/SCOPE.md) starts from a
     costed list.

     Load-bearing caveat — this triage is conditional on an unratified answer.
     It assumes
     D1 = option A (Signal + Decision loop built for real, Workbench sketched).
     Under D1-B
     (Workbench built instead) the buckets invert: G10 and G28 become FIX, and
     G42's restatement
     path plus G01's click-time attribution drop to SPECIFY. Do not treat these
     buckets as settled
     until D1 is answered.

     Definitions used, per Seno's framing:

     ┌─────────┬────────────────────────────────────────────────┐
     │ Bucket  │                    Meaning                     │
     ├─────────┼────────────────────────────────────────────────┤
     │ FIX     │ Extend the contract and build it               │
     ├─────────┼────────────────────────────────────────────────┤
     │ SPECIFY │ Design it fully in the README; do not build it │
     ├─────────┼────────────────────────────────────────────────┤
     │ NAME    │ State it as a known limit we tolerate          │
     └─────────┴────────────────────────────────────────────────┘

     ---

     Triage

     Primary bucket for each of the 12 blocking findings. Where a finding
     splits, the primary bucket
     takes the blocking half and the residue is noted.

     Gap: G16
     Short form: No arrival timestamp
     Bucket: FIX
     Reason: Irreversible if skipped — events ingested without it can never be
     given
     one. Every late-conversion mechanism depends on it.
     ────────────────────────────────────────
     Gap: G42
     Short form: Nothing defines when a period closes
     Bucket: FIX
     Reason: The brief's one mandatory misbehaviour, handled end to end. Needs
     horizon + settlement + restatement.
     ────────────────────────────────────────
     Gap: G17
     Short form: attributed_click_id dangles; no click_id
     Bucket: FIX
     Reason: One field. Without it, conversion→click resolution is guesswork and

     click-time attribution cannot be built.
     ────────────────────────────────────────
     Gap: G19
     Short form: spend delta vs cumulative undefined
     Bucket: FIX
     Reason: Cannot emit or ingest spend without pinning it. Near-zero marginal
     cost
     — absorbed into the emitter. Residue → NAME: the CPM/fee discriminator.
     ────────────────────────────────────────
     Gap: G33
     Short form: The fold has no origin
     Bucket: FIX
     Reason: create_ad + launch. Without it the log is not self-contained and
     "recomputable from the event log" (a graded criterion) answers "not the
     config".
     ────────────────────────────────────────
     Gap: G01
     Short form: No config-generation identifier
     Bucket: FIX
     Reason: Prerequisite for click-time attribution (D14) and for the
     traceability
     anchor. No substitute.
     ────────────────────────────────────────
     Gap: G04
     Short form: "Daily" has no day boundary
     Bucket: FIX
     Reason: The timezone constant is required for any bucketing to be
     well-defined.
     Residue → SPECIFY: budget enforcement/pacing.
     ────────────────────────────────────────
     Gap: G18
     Short form: Events carry no component/config link
     Bucket: SPECIFY
     Reason: The surface it serves — component-level performance — is the
     sketched
     Workbench. Generations (G01) are built anyway, so the README can show the
     exact query against data we hold.
     ────────────────────────────────────────
     Gap: G50
     Short form: Ad.status has dead states
     Bucket: SPECIFY
     Reason: Its blocking half (draft→live unreachable) is resolved by G33's
     launch.
     Only archive remains, and nothing graded touches it.
     ────────────────────────────────────────
     Gap: G34
     Short form: Two of five named levers missing
     Bucket: SPECIFY
     Reason: Residue after G33/G50 is clone_ad and relaunch. The loop already
     closes
     via pause / set_budget / swap.
     ────────────────────────────────────────
     Gap: G10
     Short form: Component has no version/lineage
     Bucket: SPECIFY
     Reason: Nothing edits components if the Workbench is sketched, so no
     editing →
     no versioning at runtime. The brief asks us to pick one and defend it,
     which
     is what SPECIFY delivers.
     ────────────────────────────────────────
     Gap: G28
     Short form: No variant/experiment entity
     Bucket: SPECIFY
     Reason: variant_group_id is a free field; the comparison view is a surface.

     Defer the surface.

     Counts: FIX 6 · SPECIFY 6 · NAME 0.

     NAME is empty among the blockers, and that is the correct result — a
     blocking finding is by
     definition one we cannot merely tolerate. NAME is where the non-blocking
     register lives: G43
     (retractions), G15 (audience overlap), G21 (gap detection), G46 (transient
     funnel violations),
     G05 (USD-only), G29 (no portfolio entity). Those become the README's
     tolerated-misbehaviours section, per L123.

     ---

     FIX build cost

     Plan items sized to CLAUDE.md §5 (one reviewable concern, ≤ ~150 lines of
     diff).

     ┌─────┬──────────────────────────────────────────────────────────┬────────┐
     │  #  │                        Plan item                         │ Closes │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │     │ Ingest boundary: envelope extension (received_at,        │        │
     │ P1  │ ingest_seq), dedupe on event_id, persist all deliveries, │ G16    │
     │     │  non-negative integer validation                         │        │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P2  │ Signal types + simulator emitter: click_id, spend as     │ G17,   │
     │     │ fixed-interval deltas                                    │ G19    │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P3  │ Decision variants create_ad + launch, with               │ G33    │
     │     │ compare-and-swap validation                              │        │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P4  │ Config fold + rebuildable ads projection from the log    │ G33    │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P5  │ config_generations table, maintained on every            │ G01    │
     │     │ config-changing decision                                 │        │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P6  │ Minute-bucket rollups + settlement state derived from    │ G42,   │
     │     │ the lateness horizon (incl. account timezone constant)   │ G04    │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P7  │ Restatement path: a late arrival recomputes affected     │ G42    │
     │     │ buckets and marks them restated                          │        │
     ├─────┼──────────────────────────────────────────────────────────┼────────┤
     │ P8  │ Click-time attribution for conversions + orphan parking  │ G01,   │
     │     │ / provisional counting                                   │ G42    │
     └─────┴──────────────────────────────────────────────────────────┴────────┘

     Total: 8 plan items.

     Pre-trim the same list was 10 items; the two removed are below.

     ---

     Over budget — what I moved, and what it cost

     At the finding level FIX started at 9 and the extension count at ~9
     (received_at,
     ingest_seq, click_id, spend reason, create_ad, launch, archive,
     config_generations,
     config_generation_id on events). Over the ~6 ceiling. Three trims:

     1. G18 — event→generation stamping at ingest → SPECIFY. Saves 1 item.
     Drops the config_generation_id column and the ingest resolution step.
     Component-level metrics
     become a read-time join over config_generations by (ad_id, ts) instead of a
     stamped column.
     Cost: component metrics get slower and stay unbuilt — acceptable, because
     the surface consuming
     them is sketched. The substrate survives, so the README shows a real query,
     not a hypothesis.

     2. G04 — budget enforcement/pacing → SPECIFY. Saves 1 item. The timezone
     constant stays in
     P6 (free, and bucketing is undefined without it). This is the debatable 
     one: without pacing,
     set_budget changes a number and does not visibly change the world, so the
     "world responds"
     property rests entirely on pause. That satisfies the deliverable's minimum
     (L151 asks for at
     least one closable decision) but gives up a second, more interesting
     demonstration. Reinstate
     this first if the budget allows.

     3. G50 — archive variant → SPECIFY. Saves ~0.5 item, folded into P3's 
     slack. launch is
     the transition that matters; nothing graded exercises archive.

     8 is the floor without giving up a graded criterion. Getting to 6 means
     cutting P7
     (restatement) or P8 (click-time attribution + orphans), and either cut
     breaks hard requirement
     #4 — one stream misbehaviour handled end to end. At that point late
     conversions are detected
     and not handled, which is the difference between the brief's flagship
     requirement and a
     paragraph about it. I would not make that trade; if 8 is too many, the
     right lever is D1's
     sketch boundary, not this list.

     ---

     Verification

     - Every blocking gap appears in exactly one bucket; buckets total 12.
     - Every FIX gap is closed by at least one P-item; every P-item cites a gap.
     - Under D1-B the triage is re-run before Phase 1 closes.
     - Trims land in the README's scope-cuts section with the cost stated, not
       silently.

     Next gate: D1 is still unanswered. Nothing in this triage is settled until
     it is.

     "/plan open" to edit this plan in VS Code

❯ D1: A. Signal + Decision loop built for real; Workbench sketched — annotated  
  mockup plus one read-only component screen showing the reverse join over live 
  data. Reasoning: the loop is the deliverable's stated minimum and I want it   
  to be the spine of the build, not a bolt-on, and both surfaces sit on the     
  same two logs so the fold, the restatement path and the traceability          
  machinery each get built once. What I'm giving up: component-level            
  performance as a demoed capability, and variant comparison in the UI. I'll    
  answer the versioning question in prose and defend it there.                  

● D1 ratified. Your wording adds one thing worth pinning: "one read-only 
  component screen showing the reverse join over live data" is a slightly
  heavier sketch than "annotated mockup" — it means the ads↔components reverse
  join has to actually work against the live fold, not be drawn. It's nearly
  free (it rides on P4's projection) and it's the right call, since it
  demonstrates the many-to-many claim with real data instead of asserting it.
  But it should be written down as scope, not absorbed silently.

  The triage stands unchanged — D1-A was exactly the assumption it was
  conditional on, and your two stated give-ups (component-level performance,
  variant comparison) are precisely what kept G18 and G28 in SPECIFY.

● Updated plan
  ⎿  /plan to preview

● What I'd do next, all inside docs/, no code:

  1. Create docs/DECISIONS.md and record D1 in the §3 format — with your
     rationale quoted rather than paraphrased, and the consequences pinned
     precisely: the component screen is current-state only ("used in N live ads"
     works; "at time T" and "ever" don't), and config_generations gets built
     anyway for click-time attribution, so component-level performance is one
     join away from existing rather than absent. That's worth stating — it makes
     the give-up smaller than it sounds.
  2. Mark D1 answered in docs/OPEN_QUESTIONS.md so the two files can't disagree
     about what's open.
  3. Fold the FIX/SPECIFY/NAME triage into docs/BRIEF_GAPS.md — it currently
     only exists in the plan file and this conversation, and it's what turns the
     register into a README section later.
  4. Write docs/STATUS.md — Phase 0 is done and a decision is ratified, so per
     §9 this is the point to make the session resumable cold, after which it's
     safe to /clear.

  Then I stop rather than starting SCOPE.md. Beyond the phase gate, D6 is the 
  blocker: whether the Decision loop ships three levers, four (archive), five
  (clone_ad), or a Recommendation approval flow is the largest single
  determinant of what the built surface actually is, and writing scope around it
  unanswered means rewriting it. Worth answering D2–D6 in one pass — D4 in
  particular got cheaper now that the Workbench is sketched, since "ad or
  component as the unit managed" collapses to a README paragraph.

● User approved Claude's plan
  ⎿  Plan saved to: ~/.claude/plans/the-spec-for-this-dapper-charm.md · /plan to
     edit
     Post-D1 — record the decision, then close out Phase 0

     Context

     Phase 0 documents are delivered: docs/BRIEF_GAPS.md (52 findings, 12
     blocking) and
     docs/OPEN_QUESTIONS.md (7 author questions, 25 decisions, 7 unratified
     assumptions).

     D1 is now answered: option A — Signal + Decision loop built for real;
     Workbench sketched as
     an annotated mockup plus one read-only component screen showing the reverse
     join over live data.

     Two consequences for existing work:

     1. The triage is now unconditional. It was written assuming D1-A; that
        assumption is
        ratified, so the buckets are firm: FIX 6 · SPECIFY 6 · NAME 0, FIX
        costing 8 plan
        items. Seno's two stated give-ups (component-level performance as a
        demoed capability,
        variant comparison in the UI) are exactly what holds G18 and G28 in
        SPECIFY, and the stated
        intent to answer versioning in prose confirms G10 in SPECIFY.
     2. The Workbench sketch is heavier than "sketched" implied. A read-only
        component screen
        driven by the live reverse join is a working read path, not a mockup. It
        rides on P4's
        ads projection so the marginal cost is one screen, but it must be
        recorded as scope rather
        than absorbed.

     CLAUDE.md §3 requires every answered decision to be appended to
     docs/DECISIONS.md. That file
     does not exist yet. Nothing here writes code; all work stays inside docs/.

     ---

     Work

     1. Create docs/DECISIONS.md and record D1

     Header explaining the file's contract, then D1 in the §3 format: id, date
     (2026-09-03),
     question, the options as presented in OPEN_QUESTIONS.md, what was chosen,
     rationale in
     Seno's words (quoted, not paraphrased), consequences, what it forecloses,
     and a one-line
     "how I'd defend this in review".

     Consequences to record precisely — these are the things that will otherwise
     drift:

     - The Workbench sketch includes a working read-only component screen over
       the live reverse
       join. Current-state only: "used in N live ads" is answerable; "used in N 
       ads at time T" and
       "ever" are not (G38's second and third query forms stay unbuilt).
     - config_generations (P5) is built regardless, for click-time attribution.
       So component-level
       performance is one join away from existing rather than absent — the
       README can show the real
       query against real data instead of a hypothesis. This softens the stated
       give-up and should be
       said out loud.
     - Component versioning (G10) is answered in prose and defended there; no
       lineage fields ship.
     - Variant grouping (G28) is deferred entirely — no variant_group_id, no
       comparison view.

     2. Mark D1 answered in docs/OPEN_QUESTIONS.md

     One-line status marker on DECISION #1 pointing at DECISIONS.md, so the two
     documents cannot
     disagree about what is still open. No other edits to that file.

     3. Fold the triage into docs/BRIEF_GAPS.md

     The FIX / SPECIFY / NAME classification currently lives only in this plan
     file and in the
     conversation. It belongs in the register, since it is what turns the
     register into a README
     section later. Add a short triage section to BRIEF_GAPS.md — the 12-row
     table, the counts, the
     8 P-items, and the three trims with their costs — with the conditional
     caveat removed now that
     D1 is settled.

     4. Write docs/STATUS.md

     Phase 0 is complete and a decision has been ratified, so per CLAUDE.md §9
     this is the point to
     make the session resumable cold: current phase, what is delivered, D1's
     answer, the 24 open
     decisions with Wave 1 called out as next, the triage totals, and the
     explicit next action. Must
     be sufficient with CLAUDE.md to resume with no memory of this conversation.
     Then tell Seno it
     is safe to /clear.

     ---

     Then stop — Phase 1 is gated

     Do not start docs/SCOPE.md. Two reasons:

     - CLAUDE.md §4 requires an explicit "approved, continue" per phase gate,
       and Phase 0 has not
       been signed off.
     - D6 (lever set extension) materially shapes SCOPE.md and is unanswered.
       Whether the
       Decision loop contains three levers, four (archive), five (clone_ad), or
       a
       Recommendation approval flow is the single largest determinant of what
       the built surface
       is. Writing scope around an unanswered D6 would mean rewriting it.

     Recommended next ask: answer the rest of Wave 1 (D2–D6) in one pass. D2, D3
     and D5 block
     Phase 2 (DESIGN.md) rather than Phase 1, but they are cheap to answer
     alongside D6 and the
     triage has already surfaced the trade-offs. D4 is downgraded in importance
     by D1-A — with the
     Workbench sketched, "ad or component as the unit managed" is largely a
     README paragraph.

     ---

     Verification

     - git status shows docs/DECISIONS.md and docs/STATUS.md added;
       docs/BRIEF_GAPS.md and
       docs/OPEN_QUESTIONS.md modified. No files outside docs/. No code.
     - DECISIONS.md D1 entry contains all eight required elements from CLAUDE.md
       §3, with the
       rationale quoted from Seno rather than paraphrased.
     - OPEN_QUESTIONS.md D1 and DECISIONS.md D1 agree; no other decision is
       marked answered.
     - STATUS.md + CLAUDE.md alone are sufficient to resume: they name the
       phase, the ratified
       decision, the next blocking decisions, and the next action.
     - Phase 1 not started; docs/SCOPE.md does not exist.

● Write(docs/DECISIONS.md)
  ⎿  Wrote 99 lines to docs/DECISIONS.md
       1 # DECISIONS.md
       3 Ratified decisions only. A decision reaches this file when Seno 
         has answered it; until then it
         ations are not decisions.
       5 
         the options as they were
       7 presented, what was chosen, the rationale **in Seno's words**, c
       8 and a one-line "how I'd defend this in review".
       9 
         to `../BRIEF_GAPS.md`.
     … +136 lines (ctrl+o to expand)

● Update(docs/OPEN_QUESTIONS.md)  ⎿  Added 5 lines
      47  
      48  ### DECISION #1 — Which surfaces are built for real [LOAD-BEARI
          NG]
      49  
      50 +> **ANSWERED 2026-09-03 — option A.** Recorded in `docs/DECISIO
         +NS.md` with rationale,                                         
      51 +> consequences and what it forecloses. The sketch is specified 
         +as an annotated mockup **plus one                              
      52 +> read-only component screen showing the reverse join over live
         + data**. Retained below as                                     
      53 +> presented, for the record.                                   
      54 +                                                               
      55  **Blocking:** everything. Phase 1 (`SCOPE.md`) cannot start.
      56  
      57  **Context**

● Update(docs/OPEN_QUESTIONS.md)
  ⎿  Added 2 lines
      112  Signal + Decision loop for real with Workbench sketched — yes,
            or do you want the Workbench
      113  built instead?
      114  
      115 +**Answer:** yes — option A. See `../DECISIONS.md` § DECISION
          + #1.                                                          
      116 +                                                              
      117  ---
      118  
      119  ### DECISION #2 — Is an ad a frozen bundle or a recipe over co
           mponents [LOAD-BEARING]

  Read 1 file (ctrl+o to expand)

● Update(docs/BRIEF_GAPS.md)
  ⎿  User rejected update to docs/BRIEF_GAPS.md

✻ Worked for 2m 25s · done 10:34 AM

❯ Add the FIX/SPECIFY/NAME tag to each blocking finding. Don't rewrite the      
  existing recommendations — the register keeps the full option analysis; the   
  choice lives in DECISIONS.md.                                                 

● Understood — tags inline, register keeps its analysis untouched, the choice
  and its cost live in DECISIONS.md.

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 11 lines
      28  | **D** | needs a decision — a defensible alternative exists; `
          ../../CLAUDE.md` §3 applies |
      29  | **C** | cosmetic — note it, pick a default, move on |
      30  
      31 +**Triage** — carried on blocking findings only, added 2026-09-0
         +3. The tag records *what we are                                
      32 +doing about it*; the reasoning, the build cost and what each tr
         +im gave up are in                                              
      33 +`../DECISIONS.md` § "Triage of the blocking findings". The op
         +tions and recommendation below                                 
      34 +each finding are the analysis as it stood before the choice, an
         +d are left unedited.                                           
      35 +                                                               
      36 +| Code | Meaning |                                             
      37 +|---|---|                                                      
      38 +| FIX | extend the contract and build it |                     
      39 +| SPECIFY | design it fully in the README; do not build it |   
      40 +| NAME | state it as a known limit we tolerate |               
      41 +                                                               
      42  **Passes run:** field-by-field · referential · product-ask · ev
          ent-semantics · invariant ·
      43  lifecycle. 52 findings. Findings that would have been restateme
          nts of an earlier one are
      44  folded into it with a cross-reference rather than counted twice
          .

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      54  
      55  ---
      56  
      57 -### G01 — `Ad` has no config-generation identifier · MI · **B**
      57 +### G01 — `Ad` has no config-generation identifier · MI · **B**
         + · FIX                                                         
      58  
      59  **Brief:** `Ad` (L47–56) carries `ad_id` and mutable config fie
          lds. L125: *"current config is
      60  derivable: the initial state folded over the decision log."*

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      120  
      121  ---
      122  
      123 -### G04 — "daily" budget has no day boundary; nothing enforces
          - it · US · **B**                                              
      123 +### G04 — "daily" budget has no day boundary; nothing enforces
          + it · US · **B** · FIX                                        
      124  
      125  **Brief:** L54: `daily_budget_cents: number; // all money: int
           eger USD cents`.
      126  

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      250  
      251  ---
      252  
      253 -### G10 — `Component` has no version, lineage, or supersession
          - field · MF · **B**                                           
      253 +### G10 — `Component` has no version, lineage, or supersession
          + field · MF · **B** · SPECIFY                                 
      254  
      255  **Brief:** L111: *"editing a component forces a versioning dec
           ision: mutate in place (twelve
      256  live ads silently change), copy-on-write, or immutable once li
           ve. Pick one and defend it."*

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      365  
      366  ---
      367  
      368 -### G16 — `Signal` has no arrival timestamp · MF · **B** ★    
      368 +### G16 — `Signal` has no arrival timestamp · MF · **B** · FIX
          + ★                                                            
      369  
      370  **Brief:** L73: *"Delivery is at-least-once and unordered: `ts
           ` is event time, not arrival
      371  time, and consumers dedupe on `event_id`."* L81–83: conversion
           s *"may land hours or days after

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      409  
      410  ---
      411  
      412 -### G17 — `attributed_click_id` references a field that does n
          -ot exist · MI · **B** ★                                       
      412 +### G17 — `attributed_click_id` references a field that does n
          +ot exist · MI · **B** · FIX ★                                 
      413  
      414  **Brief:** L81: `{ event: "conversion"; attributed_click_id: s
           tring; value_cents: number }`.
      415  L78: `{ event: "click"; cost_cents: number }` — plus the share
           d envelope `{ event_id, ts, ad_id }`.

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      440  
      441  ---
      442  
      443 -### G18 — Signals carry `ad_id` only; no component or config l
          -inkage · MI · **B** ★                                         
      443 +### G18 — Signals carry `ad_id` only; no component or config l
          +inkage · MI · **B** · SPECIFY ★                               
      444  
      445  **Brief:** L76: `type Signal = { event_id: string; ts: string;
            ad_id: string } & (...)`.
      446  L111: *"When one video appears in twelve live ads across three
            channels, what does the

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      476  
      477  ---
      478  
      479 -### G19 — `spend`: delta vs cumulative, cadence, and reason ar
          -e all unspecified · US · **B**                                
      479 +### G19 — `spend`: delta vs cumulative, cadence, and reason ar
          +e all unspecified · US · **B** · FIX                          
      480  
      481  **Brief:** L79–80: `{ event: "spend"; amount_cents: number } /
           / non-click charges (CPM, fees);
      482  disjoint from click costs — total spend = sum of both`. L117 c
           alls them *"spend ticks"*.

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      729  
      730  ---
      731  
      732 -### G28 — No variant or experiment entity · PA · **B**        
      732 +### G28 — No variant or experiment entity · PA · **B** · SPECI
          +FY                                                            
      733  
      734  **Brief:** L111: *"Think of this as: component library + ad bu
           ilder + **a model of variants**."*
      735  L34: *"treats every live ad as a running experiment."* L125: *
           "spin up a variant."*

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      849  
      850  ---
      851  
      852 -### G33 — "Current config is derivable" is false as written: t
          -he fold has no origin · IC · **B** ★                          
      852 +### G33 — "Current config is derivable" is false as written: t
          +he fold has no origin · IC · **B** · FIX ★                    
      853  
      854  **Brief:** L125: *"Which means current config is derivable: th
           e initial state folded over the
      855  decision log. Decide whether you store the fold, the log, or b
           oth — and which one the UI

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      894  
      895  ---
      896  
      897 -### G34 — Two of the five named levers do not exist · PA · **B
          -**                                                            
      897 +### G34 — Two of the five named levers do not exist · PA · **B
          +** · SPECIFY                                                  
      898  
      899  **Brief:** L125: *"What can the strategist actually do — pause
           , reallocate budget, swap a
      900  component, **spin up a variant, kill and relaunch**."*

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      1146  
      1147  ---
      1148  
      1149 -### G42 — Nothing defines when a period is closed · US · **B*
           -*                                                            
      1149 +### G42 — Nothing defines when a period is closed · US · **B*
           +* · FIX                                                      
      1150  
      1151  **Brief:** L83: conversions *"retroactively chang[e] periods 
            you thought were closed."* L123:
      1152  *"quietly rewrite numbers you thought were final."*

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 1 line, removed 1 line
      1358  
      1359  ---
      1360  
      1361 -### G50 — `Ad.status` has two unreachable states and one unre
           -achable transition · PA · **B** ★                            
      1361 +### G50 — `Ad.status` has two unreachable states and one unre
           +achable transition · PA · **B** · SPECIFY ★                  
      1362  
      1363  **Brief:** L49: `status: "draft" | "live" | "paused" | "archi
            ved"`. Levers: L97–99.
      1364  

● Update(docs/BRIEF_GAPS.md)
  ⎿  Added 4 lines
      1426  | **G34/G50** lever set does not close the lifecycle | G09, G
            28, G29, the "compounding" premise |
      1427  
      1428  Blocking findings, for the record: G01, G04, G10, G16, G17, G
            18, G19, G28, G33, G34, G42, G50.
      1429 +Each carries a triage tag in its heading — **FIX 6 · SPECIFY 
           +6 · NAME 0**. NAME is empty here by                          
      1430 +construction: a blocking finding is one we cannot merely tole
           +rate. The non-blocking register is                           
      1431 +where NAME lives (G43, G15, G21, G46, G05, G29), and that set
           + becomes the README's                                        
      1432 +tolerated-misbehaviours section per L123.                    
      1433  
      1434  Each of these is carried into `../OPEN_QUESTIONS.md` as, or
             inside, a decision. Nothing in
      1435  this document is settled until it appears in `docs/DECISIONS.
            md`.

● Update(docs/DECISIONS.md)
  ⎿  Added 1 line
      12  | # | Title | Status | Date |
      13  |---|---|---|---|
      14  | D1 | Which surfaces are built for real | **ACCEPTED — A** | 2
          026-09-03 |
      15 +| T1 | Triage of the blocking findings | **ACCEPTED** | 2026-09
         +-03 |                                                          
      16  | D2–D25 | — | open | — |
      17  
      18  ---

● Update(docs/DECISIONS.md)  ⎿  Added 105 lines
       98  loop should be the spine of the build rather than a bolt-on, a
           nd Signal and the Decision loop are
       99  two views over the same two logs, so the fold, the restatement
            path and the traceability
      100  machinery each get built once instead of twice.
      101 +                                                              
      102 +---                                                           
      103 +                                                              
      104 +## TRIAGE #1 — What we do about each blocking finding         
      105 +                                                              
      106 +**Status:** ACCEPTED · **Date:** 2026-09-03 · **Tag:** [LOAD-B
          +EARING] · **Depends on:** D1                                  
      107 +                                                              
      108 +### Question                                                  
      109 +                                                              
      110 +Each of the 12 blocking findings in `../BRIEF_GAPS.md` needs
          + exactly one disposition: **FIX**                             
      111 +(extend the contract and build it), **SPECIFY** (design it ful
          +ly in the README, don't build it),                            
      112 +or **NAME** (state it as a known limit we tolerate). What is t
          +he FIX bucket's build cost, and is                            
      113 +it affordable?                                                
      114 +                                                              
      115 +### Provenance                                                
      116 +                                                              
      117 +Commissioned by Seno, classified by me, accepted with the inst
          +ruction:                                                      
      118 +                                                              
      119 +> "Add the FIX/SPECIFY/NAME tag to each blocking finding. Don'
          +t rewrite the existing                                        
      120 +> recommendations — the register keeps the full option analysi
          +s; the choice lives in                                        
      121 +> DECISIONS.md."                                              
      122 +                                                              
      123 +So `BRIEF_GAPS.md` carries a tag per blocking finding and keep
          +s its pre-choice option analysis                              
      124 +unedited; this entry carries the choice, the cost, and what ea
          +ch trim gave up.                                              
      125 +                                                              
      126 +### Classification                                            
      127 +                                                              
      128 +| Gap | Short form | Bucket | Reason |                        
      129 +|---|---|---|---|                                             
      130 +| G16 | No arrival timestamp | **FIX** | Irreversible if skipp
          +ed — events ingested without it can never be given one. Every 
          +late-conversion mechanism depends on it. |                    
      131 +| G42 | Nothing defines when a period closes | **FIX** | The o
          +ne mandatory misbehaviour, handled end to end. Needs horizon +
          + settlement + restatement. |                                  
      132 +| G17 | `attributed_click_id` dangles; no `click_id` | **FIX**
          + | One field. Without it, conversion→click resolution is guess
          +work and click-time attribution cannot be built. |            
      133 +| G19 | `spend` delta vs cumulative undefined | **FIX** | Cann
          +ot emit or ingest spend without pinning it. Near-zero marginal
          + cost. Residue → NAME: the CPM/fee discriminator. |           
      134 +| G33 | The fold has no origin | **FIX** | `create_ad` + `laun
          +ch`. Without them the log is not self-contained and "recomputa
          +ble from the event log" answers "not the config". |           
      135 +| G01 | No config-generation identifier | **FIX** | Prerequisi
          +te for click-time attribution and for the traceability anchor.
          + No substitute. |                                             
      136 +| G04 | "Daily" has no day boundary | **FIX** | The timezone c
          +onstant is required for *any* bucketing to be well-defined. Re
          +sidue → SPECIFY: budget enforcement/pacing. |                 
      137 +| G18 | Events carry no component/config link | **SPECIFY** | 
          +The surface it serves — component-level performance — is the s
          +ketched Workbench (D1). Generations are built anyway, so the R
          +EADME shows the real query against real data. |               
      138 +| G50 | `Ad.status` has dead states | **SPECIFY** | Its blocki
          +ng half (draft→live unreachable) is resolved by G33's `launch`
          +. Only `archive` remains, and nothing graded exercises it. |  
      139 +| G34 | Two of five named levers missing | **SPECIFY** | Resid
          +ue after G33/G50 is `clone_ad` and relaunch. The loop already 
          +closes via pause / set_budget / swap. |                       
      140 +| G10 | Component has no version/lineage | **SPECIFY** | Nothi
          +ng edits components while the Workbench is sketched, so no edi
          +ting → no versioning at runtime. L111 asks us to *pick one and
          + defend it*, which is what SPECIFY delivers. |                
      141 +| G28 | No variant/experiment entity | **SPECIFY** | `variant_
          +group_id` is a free field; the comparison view is a surface. D
          +eferred entirely. |                                           
      142 +                                                              
      143 +**Counts: FIX 6 · SPECIFY 6 · NAME 0.**                       
      144 +                                                              
      145 +NAME is empty here by construction — a blocking finding is one
          + we cannot merely tolerate. NAME                              
      146 +is where the non-blocking register lives (G43 retractions, G15
          + audience overlap, G21 gap                                    
      147 +detection, G46 transient funnel violations, G05 USD-only, G29 
          +no portfolio entity), and that set                            
      148 +becomes the README's tolerated-misbehaviours section per L123.
      149 +                                                              
      150 +### FIX build cost                                            
      151 +                                                              
      152 +Plan items sized to `../../CLAUDE.md` §5 (one reviewable concern, ≤ 
          +~150 lines of diff). These                                    
      153 +pre-stage `docs/BUILD_PLAN.md`; they are not that document.   
      154 +                                                              
      155 +| # | Plan item | Closes |                                    
      156 +|---|---|---|                                                 
      157 +| P1 | Ingest boundary: envelope extension (`received_at`, `in
          +gest_seq`), dedupe on `event_id`, persist all deliveries, non-
          +negative integer validation | G16 |                           
      158 +| P2 | Signal types + simulator emitter: `click_id`, spend as 
          +fixed-interval deltas | G17, G19 |                            
      159 +| P3 | Decision variants `create_ad` + `launch`, with compare-
          +and-swap validation | G33 |                                   
      160 +| P4 | Config fold + rebuildable `ads` projection from the log
          + | G33 |                                                      
      161 +| P5 | `config_generations` table, maintained on every config-
          +changing decision | G01 |                                     
      162 +| P6 | Minute-bucket rollups + settlement state from the laten
          +ess horizon (incl. account timezone constant) | G42, G04 |    
      163 +| P7 | Restatement path: a late arrival recomputes affected bu
          +ckets and marks them restated | G42 |                         
      164 +| P8 | Click-time attribution for conversions + orphan parking
          + / provisional counting | G01, G42 |                          
      165 +                                                              
      166 +**Total: 8 plan items.** Pre-trim the list was 10.            
      167 +                                                              
      168 +### Consequences — the three trims, and what each cost        
      169 +                                                              
      170 +FIX started at 9 findings and ~9 contract extensions (`receive
          +d_at`, `ingest_seq`, `click_id`,                              
      171 +spend `reason`, `create_ad`, `launch`, `archive`, `config_gene
          +rations`, `config_generation_id`                              
      172 +on events). Three trims brought it to 6:                      
      173 +                                                              
      174 +1. **G18 — event→generation stamping at ingest → SPECIFY.** *S
          +aved 1 item.* Drops the                                       
      175 +   `config_generation_id` column and the ingest resolution ste
          +p; component-level metrics become                             
      176 +   a read-time join over `config_generations` by `(ad_id, ts)`
          +. Cost: those metrics get slower                              
      177 +   and stay unbuilt — acceptable, because D1 sketches the surf
          +ace consuming them. The substrate                             
      178 +   survives.                                                  
      179 +2. **G04 — budget enforcement/pacing → SPECIFY.** *Saved 1 ite
          +m.* The timezone constant stays in                            
      180 +   P6, since bucketing is undefined without it. **The debatabl
          +e one:** without pacing,                                      
      181 +   `set_budget` changes a number without visibly changing the 
          +world, so "the world responds"                                
      182 +   rests entirely on `pause`. That meets the deliverable's min
          +imum (L151 asks for *at least one*                            
      183 +   closable decision) but gives up a second, more interesting 
          +demonstration. **Reinstate first                              
      184 +   if budget frees up.**                                      
      185 +3. **G50 — `archive` variant → SPECIFY.** *Saved ~0.5 item, fo
          +lded into P3's slack.* `launch` is                            
      186 +   the transition that matters.                               
      187 +                                                              
      188 +### What it forecloses                                        
      189 +                                                              
      190 +- **8 is the floor without giving up a graded criterion.** Rea
          +ching 6 would mean cutting P7                                 
      191 +  (restatement) or P8 (click-time attribution + orphans); eith
          +er breaks hard requirement #4 —                               
      192 +  one stream misbehaviour handled end to end. Late conversions
          + would be *detected* but not                                  
      193 +  *handled*, which is the gap between the brief's flagship req
          +uirement and a paragraph about it.                            
      194 +  The lever for further reduction is D1's sketch boundary, not
          + this list.                                                   
      195 +- The six SPECIFY findings are answered in prose only. They ar
          +e defensible as design, not                                   
      196 +  demonstrable as behaviour.                                  
      197 +- G19's residue (CPM vs fee discriminator) and G04's residue (
          +budget pacing) are the two places                             
      198 +  where a partially-fixed finding could quietly read as fully 
          +fixed. Both are stated as residues                            
      199 +  here so the README does not overclaim.                      
      200 +                                                              
      201 +### How I'd defend this in review                             
      202 +                                                              
      203 +Every blocking finding got a disposition rather than a promise
          +, the FIX bucket was costed at 8                              
      204 +reviewable chunks before any of it was built, and the three th
          +ings cut are each cut for a stated                            
      205 +reason with the loss named — including the one I'd take back f
          +irst if time allowed.                                         

  Ran 1 shell command (ctrl+o to expand)

● All 12 blocking findings tagged in place; no recommendation text touched. Now
  the phase-close artifact per §9.

● Write(docs/STATUS.md)
  ⎿  Wrote 84 lines to docs/STATUS.md
       1 # STATUS.md
       2 
       3 Written for someone with no memory of the conversation. That som
       4 `../../CLAUDE.md`, then the one design doc you need — do not re-read e
         verything.
       5 
       6 **Last updated:** 2026-09-03
       8 ---
       9 
      10 ## Where we are
     … +115 lines (ctrl+o to expand)

● Done. Four files in docs/, no code.

  What changed this round

  - BRIEF_GAPS.md — each of the 12 blocking findings now carries its bucket in
    the heading (· MI · **B** · FIX), plus a legend entry explaining the tag and
    pointing at DECISIONS.md. No recommendation text was touched; the option
    analysis stands as the pre-choice record. The cross-cutting summary picks up
    the counts and the note on why NAME is empty there.
  - DECISIONS.md — new. Holds D1 and TRIAGE #1. The triage entry carries the
    classification with reasons, the 8 costed plan items, the three trims with
    what each gave up, what it forecloses, and the defence line. Provenance is
    recorded honestly: you commissioned it, I classified it, you accepted it —
    your instruction is quoted rather than dressed up as a rationale you gave.
  - OPEN_QUESTIONS.md — D1 marked answered with a pointer, presented options
    retained.
  - STATUS.md — new. Phase state, what's ratified, the 24 open decisions with
    Wave 1 called out, the 7 unratified assumptions, and the next action.

  Two things I'd flag before you clear

  D6 blocks SCOPE.md, not just Phase 2 — the lever count is what the Decision
  loop is, so scope written around an open D6 gets rewritten. And D12 is the one
  with a closing window: two columns to add, permanently unrecoverable once
  events are ingested without them.

  Safe to /clear. Phase 1 not started, awaiting sign-off.

✻ Cogitated for 2m 36s · done 10:40 AM