# PHASE PROMPTS — copy/paste, one per gate

Use these in order. Between phases, run `/clear` after Claude Code has updated
`docs/STATUS.md`. Each prompt is written to survive a cleared context.

---

## P1 — Scope

```
Read CLAUDE.md, docs/BRIEF.md, docs/BRIEF_GAPS.md, docs/OPEN_QUESTIONS.md.
Still no code.

Phase 1: scope. Produce docs/SCOPE.md.

The brief says the full problem is intentionally too large, that a good slice is
one or two surfaces built for real with the rest sketched, and that whatever I
pick must include a live signal path — events flowing, persisting, changing what's
on screen. Signal cannot be scoped out, only scoped down.

Give me 3 candidate slices as a DECISION. For each: which surfaces are real,
which are sketched and how (annotated mockup / README section / stubbed screen),
what it proves about the system (translation of product ask to implementation,
working execution, event/data integrity, explainability), what it leaves
unproven, rough effort split, and the biggest risk of that slice.

Be honest about which slice carries the most engineering substance versus which
is most likely to be finished in the time available. Recommend one, tell me why,
and tell me what I'd be giving up.

Once I choose, docs/SCOPE.md must state in one page: what's real, what's
sketched, what's cut, and the one-sentence justification for each cut — that
section goes into the README verbatim.
```

---

## P2 — Architecture and data model

```
Read CLAUDE.md, docs/BRIEF.md, docs/SCOPE.md, docs/DECISIONS.md,
docs/BRIEF_GAPS.md. Still no code.

Phase 2: design. Produce docs/DESIGN.md. Work through it as a sequence of
DECISIONs and stop for my answers before writing the doc — don't write the doc
around your own preferences and then ask me to rubber-stamp it.

docs/DESIGN.md must cover, and each of these has at least one decision in it:

1. The three-way split. How configs, signals and levers are kept distinct in
   storage and in code. Which are mutable, which are append-only, which are
   derived.
2. Storage model. What is a table, what is a log, what is derived, what is
   cached. Exact schemas/DDL in the doc (as text, not files). Include the
   dedupe key and the index that makes the hot read path fast.
3. The persistence boundary. What lives in the client, what lives in the store,
   what is recomputable from the event log — and the reasoning. Include what
   happens on a cold start with an empty client and a populated store.
4. Aggregation strategy. Raw forever vs minute/hour rollups vs hybrid. Write-time
   vs read-time vs cached metrics. For each option: cost, refresh behaviour under
   late events, and what question it forecloses. I want a real pros/cons table
   here — this is one I need to be able to defend in detail.
5. Late-arriving conversions, end to end. The full path: arrival → dedupe →
   attribution to a click → which time bucket it lands in (event time, not
   arrival time) → how affected rollups are restated → how the UI learns the
   number changed → what the strategist sees when a "closed" period moves.
   Include the lateness horizon and what happens beyond it.
6. The other misbehaviours: duplicates, out-of-order, orphaned conversions,
   clock skew, bursts, gaps, retractions. For each: tolerated / degrades / breaks,
   with one line of why. This becomes a README table.
7. Config as a fold over the decision log. Whether we store the fold, the log,
   or both; which the UI reads; how we detect divergence if both.
8. The read path for the Workbench reverse join ("used in twelve ads"), kept
   current as ads launch and die — even if Workbench is sketched, the model has
   to be defensible.
9. Component versioning, with the defence written out.
10. Traceability. The concrete mechanism by which I can take any number on
    screen during the demo and show the raw events behind it, and show they
    agree. Design this as a product feature, not a debug log.
11. The event flow diagram: simulator → ingest → store → aggregate → transport →
    UI, with what's synchronous, what's batched, and where backpressure would hit.
12. Extensions to the brief's contracts, with the exact new/changed types and a
    pointer to the BRIEF_GAPS entry justifying each.

Where a decision is cheap to reverse, say so and default to the simple option.
Where it's expensive to reverse, slow down and make me choose properly.
```

---

## P3 — Simulator and mock data

```
Read CLAUDE.md, docs/BRIEF.md, docs/DESIGN.md, docs/DECISIONS.md.
Still no code.

Phase 3: the simulator. Produce docs/SIMULATOR.md.

The brief says: "Your mock data is itself a design artifact. The shape of the
performance data you invent — its noise, its daily rhythms, its fatigue curves —
reveals your model of the domain. We will look at it." So this is a modelling
exercise, not a random number generator. Treat it with the same seriousness as
the storage design.

The doc must specify, with the actual formulas and parameter values:

- Arrival process for impressions. Rate per ad, and what modulates it.
- Diurnal rhythm, in the audience's local time, not UTC. Day-of-week effect.
- Channel differences: baseline impression volume, CTR, CPC/CPM mix per channel.
- Audience temperature effects: cold vs warm vs retargeting on CTR, CVR, CPC,
  order value, reachable size, and rate of decay.
- Creative fatigue. This is the centrepiece. Decide and justify what fatigue
  accrues to — the ad, the creative component, or the (component × audience)
  pair. The last one is the interesting answer and it ties directly to the
  Workbench question of whether the strategist manages ads or components: a
  video that's burned out one audience arrives pre-fatigued in a new ad using
  that same audience. Give me the decay function and how frequency drives it.
- Novelty effect at launch, if you think it's real.
- Budget pacing: how spend rate relates to daily_budget_cents and what happens
  as the cap approaches. Delivery should throttle, not cliff.
- Conversion lag distribution — heavy-tailed, with the median, p95, and the tail
  cutoff stated. This is what makes the late-conversion handling demonstrable.
- Noise model: which distributions, and where overdispersion comes from. Don't
  just add uniform jitter to a smooth curve; that reads as fake, and the brief
  states the mock data will be inspected as evidence of the domain model.
- The misbehaviours we inject, with rates: duplicate replays, out-of-order
  delivery within a window, late conversions, orphans.
- Determinism: seeded RNG, so the demo is reproducible and a specific
  interesting moment can be replayed.
- Time: real-time vs accelerated, and the acceleration factor. How much history
  we backfill at seed so the app isn't empty on first load, and how backfilled
  events are distinguishable from live ones (or deliberately not).
- Scenario control: how I trigger a fatigue collapse, a late-conversion cascade,
  or a budget-cap event on demand during a walkthrough. I need to be able to
  cause the interesting thing to happen live rather than wait for it.

Then: how we separate signal from noise on the read side. Minimum sample
thresholds before a metric is shown or a fatigue flag fires, smoothing (EWMA vs
raw vs windowed), and confidence treatment. The brief says a well-chosen
heuristic honestly presented with its limits beats an opaque model — so pick a
simple one and write down its limits explicitly.

Present the fatigue model, the lag distribution, and the noise model as
DECISIONs with alternatives. The rest you can propose and I'll ratify.
```

---

## P4 — Build plan

```
Read CLAUDE.md, docs/SCOPE.md, docs/DESIGN.md, docs/SIMULATOR.md,
docs/DECISIONS.md. Still no code.

Phase 4: produce docs/BUILD_PLAN.md — the tracking document for the whole
implementation.

Rules for the plan:
- Commit-sized items. Each one reviewable in a few minutes, ~150 lines of diff
  max, one concern each.
- Ordered so that the app is runnable and demonstrable after every item, and so
  the riskiest thing (the live event path with persistence) is proven early —
  not left to the end.
- Vertical slice first: I want the thinnest possible end-to-end path — one
  simulated event, persisted, aggregated, on screen, surviving a refresh —
  before any breadth.
- Each item: id, one-line goal, files touched, the manual verification step,
  the DESIGN.md section it implements, and a checkbox.
- Group into stages with an explicit "demo checkpoint" at the end of each: what
  I could show a stranger at that point.
- Flag every item that is load-bearing for a hard requirement in CLAUDE.md §6.
- Include the packaging items: README sections, the life-of-one-event trace, the
  one-command run, the refresh test, the AI artifact export.
- Include a "cut line": if I run out of time, everything below this line is
  droppable without failing a hard requirement. Be realistic about it.

Also give me a `docs/STATUS.md` scaffold I can rely on for context recovery.
```

---

## P5 — Implementation (paste once, at the start)

```
Read CLAUDE.md, docs/BUILD_PLAN.md, docs/STATUS.md, docs/DESIGN.md.

Phase 5: start implementing. Rules from CLAUDE.md §5 apply strictly:

- One plan item at a time. Announce what you're about to do and which item it
  closes. Build it. Report what changed, how I verify it by hand, and what you
  deliberately left out. Then stop.
- Wait for my "ok" before committing. On approval: commit referencing the item,
  tick the item in BUILD_PLAN.md, then stop again and wait for my next word.
- No batching multiple items. No drive-by refactors, renames or reformatting.
  No new dependencies without a DECISION.
- If implementation reveals the design was wrong, stop coding, tell me, and we
  reopen DESIGN.md. Do not patch around a design flaw.
- Every ~3 items, update docs/STATUS.md and tell me it's safe to /clear.

Start with item 1. Tell me what it is before you touch anything.
```

Then, for each subsequent item, just: `next` — or `ok, commit and next`.

---

## P6 — Packaging

```
Read CLAUDE.md, docs/BRIEF.md and every doc in docs/.

Phase 6: write README.md. The brief asks for design notes, so treat the README
as a primary deliverable, not as documentation. Sections:

1. What this is, and how to run it in one command.
2. Framing — how I read the brief and what I think the product actually is.
3. Scope: what's real, what's sketched, what's cut, and why. Verbatim from SCOPE.md.
4. Storage model — what's a table, what's a log, what's derived, what's cached.
   Include the schema.
5. The persistence boundary and the defence of where it sits.
6. Aggregation strategy: what we chose, and what it forecloses. Keep the
   pros/cons table.
7. Late-arriving conversions, handled end to end. Then the misbehaviour table:
   tolerated / degrades / breaks.
8. The life of one event — a single conversion from emission, to stored fact, to
   aggregate, to pixel. Prose or one diagram. Use real ids from a real run.
9. Separating signal from noise — the heuristic and its stated limits.
10. Mock data model: the fatigue curve, the diurnal rhythm, the noise model, the
    lag distribution. Show the shapes.
11. Extensions and corrections to the brief — the BRIEF_GAPS register, cleaned
    up: what we noticed, what we changed, what we argued with and kept as-is.
    This section is the push-back they asked for. Don't bury it.
12. Decision log — the DECISIONS.md digest, each with what it forecloses.
13. What I'd build next, and what I'd do differently with another week.
14. How I worked with AI tooling — pointer to the process artifact.

Pull real numbers and real ids from an actual run. Nothing invented.

Then produce docs/DEMO_SCRIPT.md: a 15-minute walkthrough with the exact
sequence, including where I trigger the late-conversion cascade and the fatigue
collapse, where I invite the page refresh (the brief says to expect at least one
mid-demo refresh), and how I demonstrate event→pixel traceability live. Include
the ten hardest questions a reviewer could ask about this design, each with the
answer in one or two sentences, sourced from DECISIONS.md.
```

---

## Context recovery — paste after any `/clear`

```
Fresh context. Read, in this order: CLAUDE.md, docs/STATUS.md, and only the one
design doc relevant to the current item. Do not read the rest.

Then tell me: current phase, last completed item, next item, and any open
decision blocking it. Do not start work until I confirm.
```

## When Claude Code drifts

Short, direct corrections work better than long re-explanations:

- `You just made a design decision without asking. Which one, and what were the alternatives? Roll it back and present it as a DECISION.`
- `That's too big. Split it into the smallest chunk that's independently verifiable and redo just that part.`
- `You're recalling instead of reading. Open docs/DESIGN.md and quote the relevant section.`
- `Stop. That wasn't in BUILD_PLAN.md. Add it as an item, or drop it.`
- `You agreed with me too fast. Give me the strongest argument against what I just chose.`