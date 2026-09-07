# Phase 7 · Post-completion hardening — the phase that came from using the thing

**Dates:** 2026-09-05 → 2026-09-07 · **Model:** Opus 5 (1M context) · **Phase:** 7, after the last gate
**Commits:** `dbcc4c3` `1fa9516` `71806a9` `fd7aa47` `dc6268f` `f42ece1` `83bf61e` `14787a3`
`afcfc7e` `00e077d` `d21c032` `377d6e2` `4a8d70d` `7ac3dd4` `561e0be` `8800ca6` `48e647a`
and the one that adds this file

Written as a process artifact per the brief (L153). Prompts, decisions and turning points — not a
keystroke transcript.

---

## Why there is a phase 7 at all

Phases 0 through 6 each opened with a document that said what the phase would do. `SCOPE.md`,
`DESIGN.md`, `SIMULATOR.md`, `BUILD_PLAN.md`, then packaging against `PHASE_PROMPTS.md` § P6. Every
one of them was work planned in advance and then executed.

**Phase 7 opened with Seno clicking around the finished app.** There was no plan, no gap table and
no section list. There was a person using a product and saying what was wrong with it, ten times
over three days. That is a different generator of work, and it produced a different *kind* of work:
ten chunks, three decisions, one new document — and, more interestingly, **five reported defects
that turned out not to be defects.**

Three things are true of the whole phase and are the reason it is worth writing up:

1. **Every change came from using the product**, not from reading a document about it. The one
   document-driven item — `ARCHITECTURE.md` — was itself prompted by a reviewer's-eye question the
   documents could not answer with a picture.
2. **Every change was measured before it was made.** Not after, as a verification: *before*, as the
   thing that decided whether to make it. D75 exists because 25% of the page was measured to be
   prose. B71's fix is shaped by the 7,004 ms it measured first.
3. **Four of the five things reported as bugs were not bugs**, and were argued down with reasons
   rather than fixed to be agreeable. That is the part of this phase that most needed writing down,
   because a "fixed it" is self-documenting and a "no, and here is why" is not.

---

## Prompt 1 — "everything else is a noise"

Two prompts arrived close together, both from the same act of walking the app:

> "I tried to walk through the application and it seems to be very complex. Not sure if it is because
> app is huge, or we show a lot of information, noise and etc..."

> "Also there are a lot of information, written with small fonts, if possible try to minimize the
> shown information as much as possible. Keep only the most important things, the requested by brif
> or needed by demo. everything else is a noise."

and, separately:

> "Does EWMA is in req list ? if not maybe remove completely?"

### The turning point: measure the premise before arguing with it

The tempting reply to *"there is too much information"* is to start deleting captions. The tempting
reply to *"is EWMA in the requirements?"* is to defend it, because it was ratified in **D20** and it
was work.

Both were checked instead.

**The EWMA premise checks out completely.** `docs/BRIEF.md` contains neither the string *"EWMA"* nor
*"smoothing"*. It asks only *"how you separate signal from noise"* (L155) and warns that *"a
well-chosen heuristic, honestly presented with its limits, beats an opaque model"* (L147). EWMA is
ours, not the brief's. Grep settled in seconds what an argument would not have.

**The noise premise checks out numerically.** Measured in the DOM before touching anything:
**5,548 characters of explanatory prose across 20 blocks, out of 21,863 characters on the page — 25%
of everything on screen was a paragraph explaining the design.** That number is what turned a matter
of taste into **D75**, and it is why the entry could name the blocks and their character counts one
by one instead of gesturing at "some captions".

### What made both of these decisions rather than edits

`CLAUDE.md` §3 names *UI information architecture* as decision territory, and there was a harder
reason than the list: **several of those captions are ratified consequences.** D33 requires the
maturity figure to carry its sample size. D71 consequence 3 requires the caption to name the window
each score was answered at. D67 requires the chosen rung and the dropped ads on screen. D34 requires
the telemetry under a heading naming it as transport. D65 requires the resolved anchor beside the
client's frame.

So "minimize the shown information" could not be executed as an instruction. It had to become a
**rule** that distinguishes what a decision requires from what it merely explains:

> **The surface states the fact. The README explains the choice.**

That rule is the whole of D75, and it is what let ~2,860 characters go — 52% of the page's prose —
**without losing one ratified requirement.** The four scoring limits were the interesting case:
828 characters of honesty the brief actively grades, which is exactly the kind of thing that must
not be deleted and also must not be an 828-character wall. They were **collapsed behind a
`<details>`, not removed.**

### D74's second-order effect, which was the real answer to Seno's question

D74 chose option B — delete the chart's raw/EWMA toggle, keep the fatigue flag's internal EWMA. The
line in the entry that matters is consequence 1: *"One fewer control on the busiest surface, which
is the point Seno was actually making."* He asked about a requirement; what he was reporting was a
crowded page. Answering the literal question would have been a grep. Answering the reported problem
took the toggle off the screen.

`HALF_LIFE_MS` moved to `src/shared/config.ts` in the process, because the fatigue flag still needs
it and a server module importing a display constant out of the browser bundle was the only thing
keeping the client's smoother alive. **Four tests went with the toggle: 172 → 168.** That number
then went stale in two documents and was still stale two days later — see the last prompt below.

---

## The two chunks nobody decided, and why they needed no decision

**B63** and **B64** came from the same walk and were built without a decision entry, correctly:
neither has a defensible alternative worth putting to a human.

**B63 — the acronyms.** The brief's *user* is an ad strategist, for whom CTR needs no expansion. The
brief's *reader* is not, and **HR5** is that any number on screen can be walked back to the events
beneath it. An unexpanded acronym is the first place that walk stops: you cannot check ROAS against
raw events without knowing it is value over spend. Two surfaces, because a tooltip is not a label —
it does not exist on touch, does not survive a screenshot, and is undiscoverable without a cue. The
implementation detail worth keeping: `METRIC_GLOSSARY` is keyed by `TraceMetric` and **total**, so an
added metric is a compile error rather than a blank tooltip.

**B64 — the separators.** Eight surfaces doing genuinely different jobs, told apart by a small muted
heading. Two of those boundaries are load-bearing in the *model*, not just the layout: action console
(what the advertiser decided) versus scenario console (what the simulator was told to do), and every
performance number versus D34's quarantined transport telemetry. A rule and space rather than a box,
because boxing each section would enclose the telemetry block that already has its own treatment for
exactly that reason (**D45**), and two competing enclosures is how the one that means something stops
meaning it.

---

## Prompt 2 — walking it again, and the two that were real

Two more items came from a second pass, and **both were genuine**:

**B70 — two duplications on the Signal surface.**

- (a) At a selection of *one* ad, the per-ad table was a single row carrying the same six numbers as
  the headline above it, each with its own clickable drill-down — two affordances opening the same
  panel. The subtlety in the fix is that **the condition is the selection, not the row count**: with
  every ad selected but only one delivering in the window, the table still renders, because the
  headline is then a portfolio total that *happens* to equal one ad's numbers and the row is the only
  thing naming which ad that is.
- (b) `latestBucket()` scanned the whole store while its caption read *"newest bucket **in view**"*.
  With `a_01` selected it could report `a_12` — a true statement about the store and a false one
  about the view, on the one line whose job is to say what the screen is showing.

**B71 — the drill-down showed the previous metric's answer while re-deriving.** Click impressions,
then clicks, and the impression verdict, counts, evidence and slices stayed on screen under a title
that already read *"Walk it back — clicks"*. The `replaying the log…` branch existed but **could
never fire**, because the descriptor-change effect reset the rewind box and the baseline and never
cleared the result.

This is the one thing that surface exists to make impossible: a number that does not answer the
question above it.

### The measurement that shaped the fix rather than just confirming it

The obvious fix is to clear the panel. Whether that is enough depends entirely on how long the gap
lasts, so it was measured on the seven-day store first: **7,004 ms for a 12-ad one-hour drill-down,
1,504 ms for a single ad.**

Seconds, not milliseconds. And the cost is **not the window** — `replayIn()` reads every event for
the ad over the whole log prefix, because a conversion's own `ts_effective` may sit far outside the
window it is credited to and filtering in SQL would drop exactly the events **D27-B** exists to place
correctly. So it is roughly linear in **ads**, not in window width.

That turned one fix into two behaviours:

- **A metric switch clears the panel** and says what it is doing and why it takes a moment.
- **A rewind does not.** It re-asks the *same* question at another `as_of`, and the answer on screen
  stays internally consistent because the query line reads its own result's window and position. So
  it dims and labels *"answering…"* rather than blanking.

Without the timing, both cases would have been given the same treatment, and the right one would have
been a coin toss.

---

## The centrepiece — five reported bugs, four of them not bugs

Walking the demo produced a list of five things that looked wrong. **Four were correct behaviour that
reads as a fault on camera.** They went into `docs/DEMO.md`'s presenter notes (`d21c032`), not into a
fix queue:

| Reported | What it actually is |
|---|---|
| Clicking a number in a window containing `now` answers `NOT_COMPARABLE`, not `MATCH` | **Correct, and one of the better lines in the demo.** A projection has no `as_of`, so there is nothing for a recomputation over an earlier prefix to agree with. The note says: explain it, then click an older minute slice for the `MATCH` |
| Charting a paused ad puts its flat run hard against the right edge, easy to miss | **Correct rendering, wrong selection.** Select a live ad alongside it — one line going flat next to eleven that do not is the picture worth showing |
| The restart's duplicate line often does not appear | **D61 ratified a 60-second catch-up window on purpose.** Restart eight minutes later and you get `dup 0/0` and a gap in the series, which is a different and less interesting true statement. Do beat 8 briskly |
| Generation markers look misplaced on the chart | **They have looked wrong twice and measured correct to the second both times.** The note is an instruction not to narrate a doubt you cannot settle on camera: open the trace instead |
| A drill-down over the whole portfolio hangs for seconds | **Real** — and now carries `1,504 ms` / `7,004 ms` and the reason (linear in ads, not in window width) instead of a guess. B71 is its fix |

The fifth is also the only one that was fixed, which is the ratio worth recording.

**Why this matters more than the fixes.** A prototype under demo pressure has a strong gradient
toward agreeing with whoever is holding the mouse. Four of these could have been "fixed" — special-case
the live window to say `MATCH`, widen the catch-up window past D61, nudge the marker positions — and
every one of those fixes would have made the product **less** honest to make a demo smoother.
`NOT_COMPARABLE` on a window containing `now` is not a limitation the app is working around; it is
the app refusing to claim an agreement it cannot demonstrate, which is the single property the whole
design exists to have.

The correct output of that batch was **presenter's notes and one fix**, and getting there required
saying "no" four times with a reason each time.

---

## The finding that was argued down in the other direction

Not every "no" went that way. `377d6e2` removed a finding **I** had written and Seno rejected.

README §13 had carried a fourth process finding: that the browser had been opened too late in the
build, and that a great deal had been implemented before anyone clicked it. The claim was **inferred
from a single line in the session-12 prompt** — *"NOBODY HAS CLICKED ANY OF IT"* — and then written up
as a process failure with confidence it had not earned.

Seno was there for the build and said the characterisation is wrong. **That settles it**, and the
reasoning is worth stating explicitly because it is a rule about evidence and not about politeness:
this is a claim about how the work was actually done, and the person who did it is the authority on
that. An inference drawn from one prompt line is not.

It was removed from three places — README §13, `DEMO_SCRIPT.md`'s answer 10, and the phase 6 process
capture — and §13 renumbered to three findings. `DEMO_SCRIPT.md`'s answer 10 now gives the process
answer that *is* defensible: measuring the seeded distributions at build time rather than at packaging
time, which is where the lag CDF's flat median and the `T0` censoring actually surfaced.

**A process artifact that flatters the process is worthless, and one that invents a failure to look
candid is worse than worthless.**

---

## `docs/ARCHITECTURE.md` — the picture that did not exist

`DESIGN.md` argues the design; `README.md` explains the choices. Both are prose, and there was no
single picture of the system's shape. Six Mermaid diagrams: three processes and what crosses each
boundary, the write path from event to pixel, the server by role, the store's four categories, the
read path with D34's three layers, and the simulator's loop. Plus all 18 endpoints and a
where-to-look-in-the-code table.

Two choices in it were deliberate:

**Derived from source, not recollection.** The endpoint list and methods parsed out of
`src/server/index.ts`, the tables from `sqlite_master`, the module roles from their own exports, the
proxy topology from `vite.config.ts`, the HMAC key lifetime from `descriptor.ts`. A diagram drawn from
memory of a system is the easiest document in a repo to be wrong about, and the least likely to be
checked.

**Mermaid rather than SVG or a PNG.** It renders on GitHub, adds no dependency (`CLAUDE.md` §5), and
**diffs line by line** so it cannot drift silently the way an exported image would.

And it was verified rather than assumed: all six blocks parsed *and* rendered against mermaid 11 in
headless Chrome, then inspected as images. **That pass caught a real defect** — the server-components
diagram had an orphaned simulator-facing subgraph floating disconnected. It was restructured around
the store, with the two checks carrying labelled edges: *"rebuilds THROUGH apply"* for `/api/verify`
and *"re-derives WITHOUT apply"* for `npm run agree`, which is the distinction that makes having two
checks worth anything.

---

## The UTC+4 finding, in full

This is the best thing in the phase, and it arrived as one sentence:

> "the browser that i'm going to demo is in utc+4. but event are stored with utc+0. do we need to
> render browser with utc 0 as well independat from where it opened ?"

### What the audit found

The honest answer to "do we need to" was: **we already half-do, and nobody knew.** Audited in the
source rather than reasoned about:

| Surface | Clock |
|---|---|
| Chart x-axis | **browser-local** — `scales: { x: { time: true } }`, and uPlot's default is local |
| Restatement timeline | **browser-local** — `toLocaleString('en-GB', …)` with no `timeZone` |
| Decision log · raw tail · drill-down query · `trace` · totals line · generation markers · maturity · settlement captions | **UTC**, printed as raw ISO with `Z` |

**Two of ten surfaces translated. Eight did not.** And both of the two carried comments saying it was
deliberate — *"the axis is the one place a reviewer reads a clock, and they read it in their own"* —
so this was not an oversight in the ordinary sense. It was a choice, made **inline in two files, never
put to anyone, and never exercised anywhere but UTC+0.**

### Why it was invisible for the entire build

Every machine this was built on ran at UTC+0. At UTC+0, `toLocaleString` with no `timeZone` and a raw
ISO `Z` string produce **the same characters**. The bug is not merely hidden at UTC+0 — it is
*absent*. There is no test that could have caught it, because the two code paths are observationally
identical in the only environment they ever ran in. `tsc` was clean, 168 tests passed, `/api/verify`
returned 200, `npm run agree` was OK, and the app was wrong by four hours on the machine it was about
to be presented on.

### The three places a four-hour offset lands on camera

This is what made it urgent rather than tidy:

1. **On one chart, against itself.** The axis would read `8:05pm` while a generation-boundary marker
   drawn on that same chart reads `2026-09-05T16:00:21.152Z`.
2. **Beat 6, where the claim is agreement.** Clicking `8:05pm` opens a drill-down whose query reads
   `16:05:00.000Z`, and the entire point of the beat is *"these two agree."*
3. **The restatement timeline against the decision log two sections up** — `22:33 Sat 29 Aug` beside
   the same event's `18:33Z`.

Item 2 is the one that matters. The app's whole graded claim (**HR5**, brief L143) is that any number
on screen can be walked back to the raw events underneath it **and the two agree**. A surface that
quietly translated two of ten displays was not being friendly to the reader; it was **injecting a
four-hour discrepancy into the one chain the product is graded on being able to walk** — and doing it
invisibly, on the machine it was built on, in the beat designed to demonstrate the opposite.

### The decision, and the option that was refused

**D76** was ratified in its own commit before the fix (`7ac3dd4` → `561e0be`). Option A: render
everything UTC. Two files.

The option worth recording is the one refused. **Option C was "set `TZ=UTC` on the demo machine"** —
zero code, zero risk, and it would have worked perfectly on Tuesday. It was refused because it fixes
*this demo* and not the app: anyone opening the page from another zone meets the same mismatch, and
the finding would have been converted into a piece of tribal knowledge about one laptop. `Forecloses:
nothing, and fixes nothing either.`

**Option B — render everything browser-local** — was refused for a harder reason. It is ~10 files, and
it **breaks copy-paste**: the drill-down's `from`/`to` bounds and `trace <event_id>`'s inputs must be
the stored UTC strings to be re-runnable, so a local-time string on screen is one a reviewer cannot
use. It forecloses pasteable provenance, which is the mechanism HR5 is demonstrated with.

So the trade taken under A is explicit: **the presenter's convenience is spent.** Nobody reading the
chart sees their own wall clock any more. The reason that is the right way round is in the entry:
*the reviewer's question is never "what time is it here?" — it is "does this number match that
event?", and that comparison is only possible in one zone.*

### Two implementation choices that were not obvious

- **`uPlot.tzDate(…, 'Etc/UTC')` rather than an `axes[0].values` override.** uPlot's tick granularity
  is *adaptive* — day, hour, minute, by zoom level — and a wholesale formatter override would have
  thrown that away to fix a timezone. `tzDate` is uPlot 1.6.32's own API for exactly this.
- **The axis is labelled `UTC`, and consequence 1 is worthless without it.** An unlabelled clock that
  is not the reader's is worse than a labelled one that is not.

### What survives, named rather than hidden

**D22 is unaffected and stays a third clock.** `America/New_York` governs the budget day boundary and
the diurnal curve, not display. So under A, midnight-New-York — the budget reset — appears at
**04:00** on a UTC axis. That was already a named limit; it is now *visibly* so rather than
accidentally concealed by a local-time axis that made it look almost right. `ARCHITECTURE.md` §7,
*"Three clocks, and which one the screen shows"*, exists to say this out loud.

**Nothing on the wire, in the store, or in any descriptor changed.** `minute_start` was already UTC
(**D28**) and every window bound and `as_of` was already an ISO `Z` string, so `/api/verify`,
`npm run agree` and the whole test suite are untouched **by construction** — not by luck, and not by
re-running them and hoping.

### Verified where it was broken

The fix was checked on a **genuine UTC+4 browser**, not by reasoning about offsets:
`getTimezoneOffset() = -240`. The axis read `5:00am…5:55am` with a `UTC` label at UTC 05:58, and a
timeline entry read `Thu 3 Sept, 04:09 UTC` beside its own `learned at …Z`. Before the fix those read
`9:00am` and `08:09`.

Re-verified independently at this session's close, headless Chrome at `TZ=Asia/Dubai`, wall clock
**12:37 +04 / 08:37Z**: the axis reads **`3:00am … 8:30am`** under a **`UTC`** label with the date
`9/7/26`. Untranslated it would have read `7:00am … 12:30pm`.

### The general lesson, which is not about timezones

Phase 6's §13 finding #1 was *"plausible output is not correct output"* — two simulator parameters
that did nothing for a whole phase, and a clamp the whole portfolio was pinned to while the design
document called it inert. **This is the same failure, in the display layer**, and it was found the
same way: by running the thing somewhere other than where it was built.

The difference is that the simulator's version was found by *printing the clamp*, and this one could
only be found by **changing the environment**. No amount of care inside a UTC+0 machine finds a bug
whose two branches are identical at UTC+0. That is worth knowing about a whole class of defect: some
of them are not reachable from your own desk, and the demo machine is not the place to discover it.

---

## Prompt 3 — closing the documentation gap, and the store that had moved

The final prompt is the one that produced `8800ca6` and `48e647a`, and it is a `CLAUDE.md` §9 catch
about §9 itself:

> "STATUS.md still declares PHASE 6 CLOSED with nothing after it, so a cold reader meets 27 commits
> the documents do not account for. This repo's pitch is that the docs are the memory. Close that
> gap."

Which is exactly right, and exactly the failure mode the phase-gate discipline is designed to prevent:
**the work after the last gate has no gate, so nothing forces it into the documents.** Phase 7 shipped
ten chunks and three decisions while `STATUS.md`'s first line still said phase 6 was the last thing
that happened.

Three drift defects were named in the prompt, and all three were real:

- **`README.md` §Run it and `STATUS.md`'s stage-7 table both said `npm test` runs 172 tests.** It
  runs 168 — measured, `168 pass / 0 fail`. `BUILD_PLAN` B66 had recorded the drop; those two lines
  had not. `npm test` is the **first** command a reviewer runs, so a count four high there reads as a
  regression before anything else is looked at.
- **`BUILD_PLAN.md` §10a had no B71 row**, with B70 and B72 both present.

### Two more found in that same table, both by measuring rather than reading

Adding the B71 row meant looking at §10a properly for the first time since it grew:

**Three blank lines sat inside the table body.** A blank line **terminates** a GFM table, so
`B65`–`B69`, `B70` and `B72` were rendering as literal pipe text rather than rows — eight of ten
chunks. This was not asserted from knowing the spec; it was **run against GitHub's own renderer**
(`api.github.com/markdown/raw`). Before: 2 of 10 chunks came back as `<td>`, three came back as
`<p>| [x] |`. After: 10 of 10 are rows and none is a paragraph.

**The preamble still read *"Both are UI-only"***, written when §10a held two chunks. It holds ten.

Both are the same class of defect as the 172: **a document that was correct when written and was
never re-read after the thing it describes changed.** None of the three would have been found by
reading the section for meaning; all three were found by checking a claim against the thing it claims
about.

### The finding this session did not go looking for

`CLAUDE.md`'s standing instruction is *read `data/loop.sqlite`, never reseed it — 5m20s and 749 MB.*
Reading it turned up something else. `sim_run` says:

```
t0 = 2026-09-07T03:48:41Z · seed = 'flawless-loop' · backfill_days = 7
```

**It is not the store phase 6 measured.** It was reseeded, three days after phase 6's `T0`. Same seed,
same seven days, **different population** — because the rate model is driven by wall-clock hour and
the window is hard-censored at `T0`. Backfill is frozen once written, so the row below is stable;
the *live* half of the store is not, and every whole-store count in `STATUS.md`'s phase 7 table is a
point-in-time read of a store with the emitter running.

| | Phase 6's store | This store |
|---|---|---|
| `source='backfill'` events | 1,582,985 | **1,543,095** |
| `a_01` CTR across the week | 4.467% → 0.464% (**9.6×**) | **3.424% → 0.514%** (**6.7×**) |

**The shapes hold and the counts do not** — and that is a *truer* reading of `MOCK_DATA.md` than the
one that file gives. It describes its measurements as *"reproducible"* because they are over the
frozen backfill population, which is true of **that file** and not of a reseeding. Since `.gitignore`
excludes `*.sqlite`, **a reviewer never receives this store at all.** They seed their own, at their
own `T0`, and will reproduce every *shape* in `MOCK_DATA.md` and **not one of its row counts.**

The fatigue result is the good news in it: `a_01` still collapses across the week with impressions
*rising*, at 6.7× rather than 9.6×. **The model reproduces; the population does not.** Which is what
`MOCK_DATA.md` should have been claiming all along, and a stronger claim than the one it makes.

It was **written up, not patched.** Amending `MOCK_DATA.md`'s population line is Seno's call and is
now item 1 of `STATUS.md`'s Next action. Every historical figure elsewhere is left exactly as written:
each is attributed to the gate that measured it, and **a measurement is not wrong because the world
moved on.**

---

## What phase 7 did not do

- **It touched no projection, endpoint, descriptor, wire format or ratified constant.** All ten chunks
  are read-side. The whole of the phase's code is `src/web/`, plus `HALF_LIFE_MS` moving into
  `src/shared/config.ts` and the comment in `src/server/fatigue-flag.ts` that stopped being true when
  the chart's smoother went. **Nothing under `src/sim/` changed at all**, which is why `/api/verify`
  and `npm run agree` are green by construction rather than by luck.
- **It reseeded nothing.** Every measurement is a read; the reseed it *found* was not its own.
- **It did not act on README §13's three "differently" items.** #1 (instrument the simulator's clamps)
  and #2 (measure the seeded distributions at build time) both need simulator work, and #3 (`B33a`,
  splitting the fault injector) is still designed, costed at ~90 lines and unbuilt — there is no
  `npm run faults` and no `scripts/faults.ts`. They stand as regrets, correctly. §13 *did* change in
  this phase, but by **losing** its fourth item as inaccurate, which is the opposite of progress on
  the other three.
- **It amended no design document to agree with a measurement.** `SIMULATOR.md` §11.2 still stands as
  ratified, and the reseed finding is written up rather than patched away.
- **It did not curate `docs/ai-sessions/05-phase-5-Impl-13.md`**, still a 5,475-line raw export.
  Outstanding at the phase 6 close and outstanding now.
- **It took no decision on its own.** D74, D75 and D76 were each ratified in their own commit, with
  Seno's words verbatim, **before** the chunk that depended on them was built. D76's rationale is the
  selected option text quoted exactly, and the entry **says that is what it is doing** — the same
  resolution D72 and D73 reached in phase 6, for the same reason: inventing a paragraph in Seno's
  voice would be a worse failure than the one it papers over.
