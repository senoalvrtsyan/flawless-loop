# CLAUDE.md — Flawless Practical: "AdTech, The Optimization Loop"

This file is the standing contract for this repo. Re-read it at the start of every
session. If anything here conflicts with something you remember, this file and
`docs/BRIEF.md` win.

---

## 1. What we are building

A strategist-facing web app for an ad optimization loop: live ads are running
experiments, performance events stream in continuously, and the strategist reads
signals and pulls levers (pause / budget / component swap).

Three surfaces exist in the brief:

- **Workbench** — component library + ad builder + variant model.
- **Signal** — live event stream, metrics, visual interpretation. **Cannot be cut.**
- **Decision loop** — action console + decision log.

Stack: **Node.js + TypeScript (strict) + React**. Everything else is an open
decision until it appears in `docs/DECISIONS.md` as ACCEPTED.

---

## 2. Source of truth — never work from memory

- The brief lives at `docs/BRIEF.md`. **Read it, do not recall it.**
- Design state lives in `docs/`. If you need a field name, a type, a chosen
  option, or a scope boundary — open the file and read it.
- If you cannot find something in the docs, **say so and ask**. Do not
  reconstruct it from what seems plausible.
- Never paraphrase the contracts from memory. Quote from `docs/BRIEF.md`.

If you catch yourself about to write "I believe we decided…", stop and grep.

---

## 3. The decision protocol (the most important rule)

**You do not make design decisions. You surface them.**

Anything with a defensible alternative — data model, storage, aggregation,
transport, attribution windows, versioning, scope, library choice, event
semantics, schema extension, UI information architecture — is a decision for
the human (Seno), not for you.

When you hit one, stop and present it in exactly this shape:

```
DECISION #<n> — <short title>
Blocking: <what work is blocked until this is answered>

Context
  <2–4 lines: what the brief says, what it leaves open, why it matters>

Options
  A) <name>
     How it works: …
     Pros: …
     Cons: …
     Forecloses: <what question becomes unanswerable / what gets hard later>
     Reversal cost: <how expensive is this to change once built>
  B) …
  C) …

Recommendation
  <one option, with the reason in one paragraph — including the reason it is
   right *for a 1–2 surface slice under time pressure*, not just in the abstract>

What I need from you
  <a single, concrete question>
```

Batch related decisions (3–6 at a time) so the human answers in one pass, but
never proceed past a blocking decision on an assumption. If you genuinely must
proceed to keep momentum, label it loudly:

`ASSUMPTION (unratified): … — blocks nothing yet, needs sign-off before <X>.`

Every answered decision is appended to `docs/DECISIONS.md` with: id, date,
question, the options as presented, what was chosen, the rationale in the
human's words, consequences, **what it forecloses**, and a one-line
"how I'd defend this in review".

Rationale: the brief requires that every choice be explainable. A decision the
human cannot defend is worth less than a worse decision they can.

---

## 4. Phase gates — no code before design

Work proceeds in phases. Each phase ends with a document and an explicit
"approved, continue" from the human.

| Phase | Output | Code allowed? |
|---|---|---|
| 0. Ingest & interrogate | `docs/OPEN_QUESTIONS.md`, `docs/BRIEF_GAPS.md` | **No** |
| 1. Scope | `docs/SCOPE.md` | **No** |
| 2. Architecture & data model | `docs/DESIGN.md` | **No** |
| 3. Simulator / mock data design | `docs/SIMULATOR.md` | **No** |
| 4. Build plan | `docs/BUILD_PLAN.md` | **No** |
| 5. Implementation | working app, chunk by chunk | Yes |
| 6. Packaging | `README.md`, demo script, event trace | Yes |

"No code" means no code — not a scaffold, not a `package.json`, not a "quick
type sketch to illustrate". Type definitions *inside a design document* are
fine and encouraged; files on disk outside `docs/` are not.

---

## 5. Implementation rules (phase 5+)

- **Small chunks.** One reviewable concern per chunk. Target ≤ ~150 lines of
  diff. If a chunk is growing, stop and split it.
- **Announce, build, report, wait.** Before each chunk: one line on what it
  covers and which `BUILD_PLAN` item it closes. After: what changed, how to
  verify it by hand, what you deliberately left out.
- **Do not proceed to the next chunk without "ok" / "approved".**
- On approval: commit with a message referencing the plan item
  (`feat(signal): SSE transport — closes P5.3`), then tick the item in
  `docs/BUILD_PLAN.md`, then stop and take the next instruction.
- **No drive-by refactors.** No renaming, reformatting, or "while I was in
  there" changes. Propose them as separate chunks.
- **No new dependencies without a decision.** Same protocol as §3.
- Every chunk must leave the app runnable. No broken intermediate states.
- If a chunk reveals the design was wrong, **stop coding and reopen the design
  doc**. Do not silently patch around it.

---

## 6. Hard requirements — treat these as fail conditions

From the brief, these are non-negotiable:

1. **State survives a refresh, and ideally an app restart.** Live ads,
   accumulated performance history, and the decision log all come back.
   *"Losing the world on reload is the one prototype shortcut we won't accept."*
2. **Events, not snapshots.** The mock stream is a sequence of timestamped
   events. Nothing on screen is hard-coded; everything is derived from the
   stream. No pre-baked arrays behind charts.
3. **At least one decision is closable in-product**: strategist sees a signal,
   takes an action, the world responds. Pausing `a_12` stops its events.
4. **At least one stream misbehavior handled end to end** — late-attributing
   conversions are the interesting one. Others (duplicates, out-of-order,
   orphans) must be named as tolerated or breaking, in the README.
5. **Traceability.** Any number on screen can be walked back to the raw events
   underneath it, and the two must agree. Build a way to *demonstrate* this,
   not just claim it.
6. **Configs, signals, and levers stay distinct** in the model. Config changes
   only via levers.
7. **The mock data is a design artifact.** Noise, daily rhythms, fatigue
   curves. It will be inspected as evidence of domain modelling.
8. **The persistence boundary is deliberate and defensible**: what lives in the
   client, what lives in the store, what is recomputable from the event log.

Add to that, from the deliverables list: a README with design notes, the **life
of one event** trace (emission → stored fact → aggregate → pixel), and an AI
process artifact.

## 7. Non-goals, stated by the brief

The brief explicitly excludes adtech expertise, visual polish, completeness, and
statistical/ML sophistication from what matters here.
*"A well-chosen heuristic, honestly presented with its limits, beats an opaque
model."* Do not spend budget here. Do not build a forecasting model. Do not
gold-plate CSS.

---

## 8. Push back — the brief asks for it

The brief says: *"Push back where you think the brief is wrong, and ask
questions along the way."* So:

- Maintain `docs/BRIEF_GAPS.md` continuously — every underdetermined field,
  contradiction, missing identifier, undefined semantic.
- Each entry: what the brief says → why it's a problem → the options → what we
  did (extended / changed / assumed / argued and kept) → where it shows up in
  code.
- Every schema extension gets an entry. The brief invites extension but
  requires it be called out.
- If a product ask seems wrong (not just vague), say so with a reason and an
  alternative. Do not be agreeable by default.

---

## 9. Context hygiene

The docs are the memory; the conversation is scratch space.

- At the end of every phase and every 3–4 chunks: update `docs/STATUS.md`
  (current phase, last completed plan item, next item, open decisions,
  anything in flight) — then tell the human it is safe to `/clear`.
- `docs/STATUS.md` must be sufficient, together with this file, to resume cold.
  Write it for someone with no memory of the conversation. That someone is you.
- Never rely on something being "earlier in the conversation".
- Keep documents append-friendly and skimmable: short sections, stable
  headings, no walls of prose.
- Don't re-read whole files you already have open; don't dump large files into
  context to "get oriented" — read `STATUS.md` and the one relevant design doc.

---

## 10. Definition of done for a chunk

- Does the thing the plan item said, and nothing else.
- TypeScript strict, no `any` without a comment justifying it.
- Any number it puts on screen is traceable to events.
- Survives a refresh if it touches state.
- Verifiable by hand in the browser or terminal, with steps given.
- `docs/BUILD_PLAN.md` item ticked; `docs/DECISIONS.md` and
  `docs/BRIEF_GAPS.md` updated if the chunk touched either.