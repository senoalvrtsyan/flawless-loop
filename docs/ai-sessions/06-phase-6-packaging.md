# Phase 6 · Packaging — the README's missing half, the shapes, and the digest

**Date:** 2026-09-05 · **Model:** Opus 5 (1M context) · **Phase:** 6 of 6 — the last gate
**Commits:** `eebec52` `07f1981` `4fafdbb` `28e3241` `7559c7e` `6557eac` `f33ab40` `5c364a7`
and the two that follow this line

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript.

The headline: **phase 6 wrote seven files and edited three, changed no code, and produced two
decisions and three findings.** The findings all came from the same move — *measuring the shipped
world against the document that specified it* — which is a thing none of the previous six phases had
done, because until packaging asked for the shapes there had been no reason to.

---

## Prompt 1 — the session opening

The prompt was unusually specific about what **not** to read, which mattered: `STATUS.md` had already
tabulated phase 6's gap section by section, so the instruction was *"read only what the sections you
are writing cite"* and *"do not re-read the README's finished sections."*

> PHASE 5 IS CLOSED. 69/69 chunks, BUILD_PLAN complete, tree clean, tsc clean, vite build clean,
> 172 tests. […] THE APP IS FINISHED — do not touch code. Phase 6 writes documents. If a section
> wants a code change, that is a DECISION, not an edit. […]
>
> ANSWERS TO THE TWO DECISIONS STATUS.md RECORDS:
>   A — `<pick: rename+trim / subset alongside DEMO.md / keep the name>`
>   B — `<pick: one long README / front door + appendices / summary + pointers>`
>
> […] data/loop.sqlite IS THE SEVEN-DAY STORE. DO NOT RESEED — 5m20s and 750 MB. Read it;
> scratch DB_PATH for anything that writes. […]
> NO OPEN DECISIONS — D1-D71 are ratified; a new one goes in its own commit, my wording verbatim,
> BEFORE you build on it.

### The turning point was in the first thirty seconds, and it was a formatting accident

**The two answer lines arrived as unfilled placeholders** — literally `<pick: … / … / …>`. The
template had been pasted without being completed.

This is the sort of thing that is easy to paper over: both options had a defensible default, the
prompt clearly wanted momentum, and either reading would have produced a plausible session. It was
also exactly the case `CLAUDE.md` §3 exists for, and `STATUS.md` had pre-emptively written *"Neither
should be taken by the model"* beside both. So the session **stopped before writing a line** and
asked.

Worth recording because the cost of asking was about ninety seconds and the cost of guessing wrong on
**B** was the shape of every remaining artifact.

---

## D72 and D73 — `eebec52`, before anything was built on them

Both were answered as a **multiple-choice selection rather than in prose**, which created a small
integrity problem: `CLAUDE.md` §3 requires the rationale *"quoted verbatim, never paraphrased"*, and
there was no prose to quote.

The resolution is written into both entries: **quote the selected option text exactly as it was
presented and chosen, and say that is what is being done.** Inventing a paragraph in Seno's voice
would have been a worse failure than the one it papered over.

- **D72 — `DEMO_SCRIPT.md` is a 15-minute *subset alongside* the tested `DEMO.md`**, not a trim of
  it. `DEMO.md` was followed cold in a browser at B61 and its four ⚑ corrections are the record of
  that; trimming it to hit a filename would have spent evidence to satisfy a prompt. On disagreement,
  the tested file wins — written into the entry as consequence 4.
- **D73 — the README stays the front door; the heavy material goes to three appendices.**

### One thing added to D73 that was not in the option

Option B's stated **con** was drift: three new files are three new places for the schema and the
parameters to disagree with `DESIGN.md` and `SIMULATOR.md`. That con is real and accepting it
silently would have been sloppy, so consequence 2 constrains how the appendices are written:

> **None of the three restates a design document.** `SCHEMA.md` is the **as-built** schema read out
> of the store; `MOCK_DATA.md` is the **measured** shape of the seeded world; `DECISION_DIGEST.md`
> is a column `DECISIONS.md`'s index table does not carry.

Every appendix is **generated from the shipped artifact rather than retyped from the design**, which
converts the duplication risk into a checkable diff. That reframing is what made the next three
findings possible at all.

---

## `docs/SCHEMA.md` — `07f1981`

The as-built DDL, read with `sqlite_master` from the running store.

**The finding is the diff, and it is small.** Rather than eyeballing 158 lines against
`DESIGN.md` §2, the two files' `CREATE TABLE` bodies were parsed and compared programmatically:
**six of eleven tables are character-identical**, and the other five differ by **one dropped trailing
comment on the `CREATE TABLE` line and nothing else** — no column, no `CHECK`, no `DEFAULT`, no
`REFERENCES`, no index, no qualifier. Plus one table `DESIGN.md` never had: `sim_run`, added by
**D60** mid-build.

That is a stronger claim than "the build matches the design" and it took less effort than asserting
it, because the check is a script rather than a reading.

---

## `docs/MOCK_DATA.md` — `4fafdbb` — hard requirement #7, and the biggest gap

`STATUS.md` had flagged this as *"missing entirely, and it is the single biggest gap"*. P6 asks to
**"show the shapes"**, and `SIMULATOR.md` §21 has every constant but no picture.

The decision that made this section worth having: **plot the designed curve against the measured one
rather than plotting the formula.** All measurements are over `source='backfill'` — the frozen
1,582,985-event seeded population, hard-censored at `T0` — so they are reproducible, and every query
is printed beside its plot.

Six shapes: diurnal per channel, the fatigue curve, novelty, the overdispersion signature, the
pacing taper, and the conversion-lag CDF.

### Finding 1 — the model checks out, mostly, and in ways that are worth stating

- **Diurnal:** median absolute deviation between designed `d_c(h)` and measured impressions-per-local
  hour is **0.06** on both channels. The two channels read as visibly *different days*, which is the
  property the parameterisation exists to produce.
- **Fatigue:** `a_01` falls **4.467% → 0.464%** CTR over the week (9.6×) with impressions *rising*.
  The same lineage on a different audience (`a_12`) falls **1.5×**. And a fresh lineage entering the
  same retargeting audience on day 6 opens at ~4.2% while the **recut of the burned one opens at
  0.830%** — which turns **D3**'s copy-on-write decision, shipped as prose because no editor was
  built, into an observable fact.
- **Noise:** Var/mean climbs **0.96 → 3.72** with λ, against an iid bound of **1.007 → 1.121**. The
  3× excess is `m_channel` and `m_ad` persisting within the hour — exactly what **D37** said two
  AR(1) processes would buy, now a number rather than a claim.
- **`p_fast` is recovered from the lag CDF**: measured P(lag ≤ 1 h) of **0.30 / 0.52 / 0.71** against
  a designed `p_fast` of **0.30 / 0.45 / 0.65**.

### Finding 2 — `SIMULATOR.md` §11.2's medians are not recoverable, and the document was NOT amended

Measured warm median purchase lag is **0.72 h**; §11.2 designs **3.3 h**. That looks like a broken
parameter and is not one.

Between 1 h and 3 h the empirical CDF is nearly flat — warm moves 0.52 → 0.56 across that whole
stretch — because it is the gap between the fast exponential component finishing and the slow
lognormal starting to accumulate. **The designed median sits exactly on the flat part**, so the 50th
percentile is not identified there and a sample of 191 lands it wherever the noise puts it.

The temptation was to amend the table. **It was not amended.** No parameter is wrong; the *statistic*
is wrong for this distribution, and `MOCK_DATA.md` says so and shows the CDF instead. Amending a
ratified document to make a measurement agree with it would have been the wrong direction entirely.

### Finding 3 — the seeded tail is right-censored, and the handover is the proof

Measured share of conversions arriving past the 72 h horizon reads **0–0.74%** against a designed
**2.3–4.6%**. Cause: the seeded population stops hard at `T0`, and **47% of backfilled clicks fall
in the last three days of the window**, so their long-lag conversions could not have been written by
the seeder at all.

They were not lost. **B35's handover** re-derives them from `hash(seed, 'conv_lag', click_id)` and
the live emitter delivers them as the app runs — and the store proves it: the earliest `source='live'`
event has a `ts` of `2026-09-04T12:20:46Z`, which is **before `T0`**, received at 16:16.

This is a fact about what a seven-day window can *contain*, not about the model, and neither the
README nor `SIMULATOR.md` had ever said it.

---

## `docs/DECISION_DIGEST.md` — `28e3241`

P6 asks for the decision log *"each with what it forecloses"*. `DECISIONS.md`'s index table has title
and status; **forecloses** lives in the per-entry sections, in two different formats (a `###` section
in full entries, a bold `**Forecloses.**` line in compressed ones).

Both formats were extracted programmatically rather than transcribed, which surfaced the three
entries that have neither (F1 and F2 use a bold-inline variant; D17 is a closure record, not a
decision) and the ten that were **ratified as a Phase-2 block** and therefore never had a per-entry
foreclosure written. Those ten are marked **§** rather than given one they never had.

**The counts in the header were wrong on the first pass and were fixed by counting.** The draft
claimed "27 foreclose nothing" and "eleven cost something" from memory of writing it; the actual
figures, from parsing the finished table, are **77 rows · 48 foreclose nothing · 22 cost something**.
The 22 are gathered in the digest's §4 as the answer to *"what did you give up?"*

That 48 is the load-bearing number in the file: it is the evidence for a design that keeps its
expensive choices few, and it only works as evidence if the cheap ones are enumerated too.

---

## The README — `7559c7e` and `6557eac`

Eight of P6's fourteen sections already existed. Six were written or completed:

| § | What went in |
|---|---|
| **2** framing | The product is a **ledger with a viewport**, not a dashboard — because L143 grades *agreement* between a number and the events under it. The product problem underneath is *which numbers are safe to act on yet*, which is **D27**. Ends on where the brief's own three-coordinate-surfaces framing is misleading |
| **4** storage | Four categories with measured row counts, the six extension columns and why each exists, the two values nothing writes; DDL → `SCHEMA.md` |
| **6** aggregation | D9, D10 and D29's option tables restored inline — *"keep the pros/cons table"* is what P6 asks for by name |
| **7** late conversions | The mechanism in six steps, ending on the 14 restated buckets in the shipped store and `c4804d05ed499439` at **147.4 hours** |
| **9** signal from noise | Three mechanisms kept visibly distinct; the gate that **stops** rather than widening; the fatigue flag with its five limits — including that it fires last on exactly the ads most likely to be burned |
| **10** mock data | The rate equation and four measured results; shapes → `MOCK_DATA.md` |
| **12** decision log | The count, the fifteen load-bearing decisions, how decisions were taken |
| **13** what's next | The cut line as an ordered queue, plus four process findings |

### §13 is the section that was hardest to write honestly

*"What I'd do differently"* invites a list of things that went fine. The three that went in are the
ones that actually cost something, and two of them are the same mistake wearing different clothes
— **plausible output is not correct output**:

1. **Two simulator parameters did nothing for an entire phase** (`κ` on clicks and on conversions,
   both inert at N = 0–3 — D57, D62), and `ρ_catchup`'s ceiling had the whole portfolio **pinned to
   a clamp** and delivering 1.19–1.47× baseline while the design document called pacing *"inert"*
   (D59). Only printing the clamp showed the difference.
2. **The seeded distributions were measured at packaging time rather than at build time** — which is
   this very session, and findings 2 and 3 above are what that cost.
3. **`B33a` is designed, costed and undone** — neither built nor formally cut, which is the one
   state nothing in this repo should be left in.

---

## `docs/DEMO_SCRIPT.md` — `f33ab40`

Fifteen minutes across seven of the eight beats, with P6's four required moments placed explicitly:
the fatigue collapse caused live at 1:30, **the refresh invited at 7:30 with the keyboard handed
over**, `late_cascade` at 8:00, and event→pixel traceability at 10:30.

Per D72 it is a subset, so it **says which three sections it drops and why** — the decision score
cannot be earned inside fifteen minutes (window + horizon is ~16 at the floor), the component screen
is read-only and beat 4 already draws the swap's generation boundary, and three scenarios are the
first thing to add back given a longer slot.

The ten questions were chosen to be the ones that are actually hard rather than the ones with tidy
answers — cohort placement meaning today's number can move for weeks, whether the restatement path
only fires because the simulator makes it, the circularity of grading your own simulator, and what
I'd take differently. Each answers in one or two sentences and names its decision id.

---

## Prompt 2 — the fresh-clone problem, and a contents list

> The one-command run, from a fresh clone. .gitignore excludes *.sqlite, so a reviewer cloning the
> repo gets no store and has to run the 5m20s / 750 MB seed before anything shows. […] make sure the
> README's quickstart says plainly what the first run costs and gives a shorter option if one
> exists. This is the single most likely thing to go wrong on their machine, and it's the first
> thing they'll do.
>
> And also add content list with links in readme

A good catch, and one every previous phase had been structurally unable to make: **everyone working
in this repo has had a seeded store since B34.** The `Run it` section was written by someone for whom
the seed had already happened, so it mentioned the cost in the middle of a paragraph and named
`SIM_BACKFILL_DAYS=5` in a subordinate clause. A reviewer's first five minutes are the seed, and the
README had been treating that as a footnote.

Two things were verified rather than assumed before rewriting it: that `data/` is **not tracked at
all** (so a fresh clone genuinely has no store, and `db.ts` creates the directory itself), and that
`SIM_BACKFILL_DAYS` is the **only** wired shortening lever.

**The five-day cost was measured, not extrapolated**, on a scratch `DB_PATH` — proportional
arithmetic off the seven-day figure would have been an invented number in a file whose whole claim
is that it has none.

### Finding 4 — the shortening lever helps far less than everyone assumed

`SIM_BACKFILL_DAYS=5` has been described as *"the wired lever if you want it shorter"* since
`SIMULATOR.md` §15.2, and nobody had ever run it end to end and timed it. Measured:

| | Wall clock | On disk | Events |
|---|---|---|---|
| 7 days (default) | **5m20s** | 749 MB | ~1.6M |
| 5 days | **4m13s** | 587 MB | 1.26M |

**67 seconds and 162 MB — about 21%**, not the ~30% the day count suggests and nowhere near the
difference between waiting and not waiting. The reason is in the phase breakdown: **201.8 s of the
253 s is *generate*.** The rate model runs per simulated second and does not get cheaper per day, so
slicing the history shorter buys proportionally less than it looks like it should.

Had this gone in unmeasured, the README would have offered a reviewer a lever framed as a rescue that
saves them a minute. **The section now says so plainly and recommends seeding in advance instead** —
which is a worse-sounding answer and the true one. It also names **four days as the floor**: the
horizon is 72 h, so below that no bucket is old enough to have been declared final and the flagship
restatement moment cannot occur at all.

The contents list is grouped by what the brief asks for rather than by document order, and every
anchor is machine-checked: a link-checker over all thirteen markdown files reports **0 broken
links**, and it is the check to re-run after any heading edit.

---

## What this session did not do

- **No code.** Not one file under `src/` or `scripts/` was touched. `tsc`, `vite build`, 172 tests
  and `/api/verify` are green and were green throughout, which is the point of a documentation phase
  having a build gate at all.
- **No design document was amended**, including the one place measurement disagreed with the design
  (finding 2). `SIMULATOR.md` §11.2 stands as ratified.
- **`data/loop.sqlite` was never written to.** Every measurement is a read; the one thing that needed
  to write — the five-day seed timing — ran against a scratch `DB_PATH` and was deleted afterwards.
- **`05-phase-5-Impl-13.md` was left alone.** It landed during this session as a 5,476-line raw
  export — the state sessions 9–11 were in before B62 curated them. It is a curation pass someone
  should schedule; it is not a phase 6 item and was not quietly absorbed into one.
