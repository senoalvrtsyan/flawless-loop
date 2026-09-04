# BRIEF_GAPS.md — audit register

Phase 0 output. This is a **register, not a resolution**. Nothing here is decided; the
recommendations are inputs to `docs/OPEN_QUESTIONS.md`, and only become real once they appear
in `docs/DECISIONS.md` as ACCEPTED.

Source: `docs/BRIEF.md`. Quotes are verbatim with line references.

## Legend

**Category**

| Code | Meaning |
|---|---|
| MI | missing identifier |
| MF | missing field |
| US | undefined semantics |
| IC | internal contradiction |
| UI | unenforceable invariant |
| PA | product ask not expressible with the given contracts |
| RW | real-world case the contract cannot represent |

**Severity**

| Code | Meaning |
|---|---|
| **B** | blocking — work cannot start on the affected surface until it is settled |
| **D** | needs a decision — a defensible alternative exists; `CLAUDE.md` §3 applies |
| **C** | cosmetic — note it, pick a default, move on |

**Triage** — carried on blocking findings only, added 2026-09-03. The tag records *what we are
doing about it*; the reasoning, the build cost and what each trim gave up are in
`docs/DECISIONS.md` § "Triage of the blocking findings". The options and recommendation below
each finding are the analysis as it stood before the choice, and are left unedited.

| Code | Meaning |
|---|---|
| FIX | extend the contract and build it |
| SPECIFY | design it fully in the README; do not build it |
| NAME | state it as a known limit we tolerate |

**Passes run:** field-by-field · referential · product-ask · event-semantics · invariant ·
lifecycle. 52 findings. Findings that would have been restatements of an earlier one are
folded into it with a cross-reference rather than counted twice.

---

# Pass 1 — Field by field

Every field of `Ad`, `Component`, `Audience`, `Signal` (each variant) and `Decision` (each
action), asked against: is the referent identified? are units/currency/timezone pinned? delta
or cumulative? who writes it? what does absent mean? is it derivable, and if so is storing it
a divergence hazard?

---

### G01 — `Ad` has no config-generation identifier · MI · **B** · FIX

**Brief:** `Ad` (L47–56) carries `ad_id` and mutable config fields. L125: *"current config is
derivable: the initial state folded over the decision log."*

**Problem:** Nothing in the model names *"the config of `a_12` as of `2026-09-01T14:03Z`"*.
Every retroactive question needs that name: a conversion landing on Tuesday for a click on
Sunday must be credited to the creative that was live on Sunday, not the one live now. Without
an addressable generation, the only way to answer is to re-fold the decision log from the
origin on every read — and the origin does not exist either (G33). This is the join that ties
Workbench to Signal; it is absent.

**Options**
- A) Derive on demand: fold the log to timestamp `t` whenever needed. No new field. O(log) per
  query, and correctness depends entirely on log completeness.
- B) Materialise generations: each config-changing decision closes the current generation and
  opens a new one with a `config_generation_id`, `valid_from`, `valid_to`. Events resolve to a
  generation at ingest or at read.
- C) Denormalise onto the event: stamp each signal with the generation id at emission.
  Fastest reads, but the simulator becomes the source of truth for attribution.

**Recommendation:** B. It gives a stable id to put in the URL, in the decision log, and in the
traceability view, and it is the only option under which "this number came from these events
under that config" is a lookup rather than a recomputation. C is tempting for read speed but
makes the emitter authoritative over attribution, which is exactly backwards.

---

### G02 — `launched_at` is derivable, has no writer, and no lever sets it · UI · D

**Brief:** L55: `launched_at: string | null; // ISO 8601 UTC; null until first live`.

**Problem:** Three distinct issues. (1) *"null until first live"* means it records the **first**
launch, so it is not "currently live since". (2) No lever produces a launch (G50), so nothing
in the sanctioned write path can ever set it — yet L42 says *"A live ad's config changes only
through levers."* (3) It is derivable from the log as the timestamp of the first transition to
`live`; storing it alongside the log creates two sources that can disagree, with no stated
precedence.

**Options**
- A) Drop the field; derive from the log.
- B) Keep it as a materialised projection, written only by the fold, never by hand.
- C) Keep it as the authoritative value and treat the log as advisory.

**Recommendation:** B — keep the field because the UI wants it cheaply, but make it a read
model with exactly one writer. C inverts the brief's own model. A is purest but costs a fold
on every ad list render.

---

### G03 — `Ad` has no `created_at` and no human-readable name · MF · C

**Brief:** `Component` has `created_at` (L62); `Ad` has only `launched_at`.

**Problem:** A draft ad has no timestamp at all, so a drafts list cannot be sorted by age. And
`ad_id: "a_12"` is the only label — every screen showing ads shows opaque ids, or synthesises a
name from the headline component's payload, which changes when the headline is swapped.

**Options** A) add `created_at` + `name`; B) add `created_at` only, derive display name from
the current headline; C) neither, show ids.

**Recommendation:** A. Both are trivially cheap and the extension is explicitly invited (L40).
A stable name matters precisely because components swap underneath it.

---

### G04 — "daily" budget has no day boundary; nothing enforces it · US · **B** · FIX

**Brief:** L54: `daily_budget_cents: number; // all money: integer USD cents`.

**Problem:** "Daily" is a windowing concept and no timezone exists anywhere in the model.
`Audience.geo` is a country code, so a `de` audience plausibly means Berlin days while the
strategist reads UTC. This is not cosmetic: the day boundary determines when the budget resets,
which determines the simulator's pacing curve, which determines the daily rhythm the brief says
it will inspect as evidence of domain modelling (L133). It also determines which day a late
conversion's spend lands in. Separately, nothing in the contract caps spend at the budget — see
G47.

**Options**
- A) Everything UTC. One clock, simple, and daily rhythms are then explicitly UTC-shaped
  rather than local-shaped.
- B) Day boundary from `Audience.geo` via a country→timezone map. Realistic; adds a dependency
  and makes cross-audience comparison awkward.
- C) Account-level timezone as a single config value; day = that timezone's midnight.

**Recommendation:** C. One knob, defensible ("platforms bill on an account timezone"), and it
keeps the simulator's diurnal curve honest without pulling in a tz database per geo. State it
in the README as the reason two audiences in different countries share a day boundary.

---

### G05 — Currency is fixed to USD while geo varies · US · C

**Brief:** L54: *"all money: integer USD cents"*; L67: `geo: string; // ISO 3166-1 alpha-2`.

**Problem:** An audience in `de` spends USD cents. No `currency` field exists, so
multi-currency is unrepresentable and there is no place to record an FX rate or an as-of date
for one.

**Options** A) accept USD-only, state it; B) add `currency` to `Ad` and carry it on money
fields; C) add a currency but keep a single account currency in practice.

**Recommendation:** A. Multi-currency buys nothing for this slice and costs an FX-as-of
decision. Name it in the README as a deliberate omission rather than an oversight.

---

### G06 — `Ad` has slots for video and headline only; `Component.kind` declares four · PA · D

**Brief:** L52–53: `video_id`, `headline_id`. L60: `kind: "video" | "image" | "headline" |
"body_copy"`. L99: `slot: "video" | "headline"`.

**Problem:** `image` and `body_copy` are declared component kinds with no slot on `Ad` and no
slot in `swap_component`. A strategist can create them, see them in the library, and never use
them. The Workbench prose reinforces this: L111 promises *"a library of components — videos,
images, copy, audiences, channels"*. Images are named as a first-class part of the library the
surface is built around, and the ad model cannot hold one.

**Options**
- A) Extend `Ad` with `image_id: string | null` and `body_copy_id: string | null`, extend the
  swap slot enum to match. Honest to the prose; four slots to build and simulate.
- B) Keep two slots; treat `image` and `body_copy` as library-only kinds, visible and
  assignable to nothing. Smallest build, but the library shows dead inventory.
- C) Drop the two kinds from the enum entirely and say so.

**Recommendation:** A, with the two new slots nullable so existing ads stay valid. The
component-reuse story is the whole Workbench premise and it gets stronger with four slots than
two — "this image appears in nine ads" is the same query. If budget is tight, B is defensible
but must be called out, because it leaves the library visibly inconsistent.

---

### G07 — No constraint binds a slot to a component kind · UI · D

**Brief:** L52: `video_id: string; // -> Component.component_id`.

**Problem:** `video_id` may point at a headline component. Nothing in the type system or the
contract prevents it, and `swap_component` (L99) has the same hole — `to_id` is an unconstrained
string. A swap that puts a body-copy component into the video slot is silently valid.

**Options** A) runtime validation at the lever boundary, rejecting the decision; B) branded
types (`VideoComponentId`) enforced at compile time and validated at the trust boundary;
C) trust the UI.

**Recommendation:** B for internal code paths plus A at the ingest/lever boundary. C is not
acceptable given that decisions are the only sanctioned write path and therefore the only place
where an invalid config can enter.

---

### G08 — `channel` is an inline enum; `audience` is an entity reference · IC · C

**Brief:** L45: `type Channel = "meta_feed" | "meta_reels" | "tiktok_feed" | "snap_stories"`.
L20: *"where the ad runs: which platform (Meta, TikTok, …), which surface on that platform."*

**Problem:** Background describes channel as two dimensions — platform and surface — and the
contract collapses them into one opaque string. There is no platform entity, so "how is Meta
doing overall?" requires prefix-parsing an enum member. Meanwhile audience, which is no more
structured, gets its own table. The asymmetry is unexplained.

**Options** A) leave as-is, derive platform by parsing; B) add a `Placement` entity with
`platform` and `surface`; C) keep the enum but add a static lookup table mapping member →
`{platform, surface}` as reference data.

**Recommendation:** C. Preserves the contract exactly as given, makes platform grouping a real
field rather than a string prefix, and is a pure addition. B is over-modelling for four values.

---

### G09 — No lever changes `audience_id` or `channel` · US · D

**Brief:** L42: *"A live ad's config changes only through levers."* Levers (L97–100) are
`pause`/`resume`, `set_budget`, `swap_component`.

**Problem:** By omission, audience and channel are immutable once an ad is live — but the brief
never says so, and the Workbench ask ("what *is* an ad — a frozen bundle, or a recipe over
components?", L111) treats audience and channel as part of the composite (L16: *"creative
components plus configuration — the audience it targets and the channel it runs on"*). If
immutability is intended, it is the most consequential unstated constraint in the model, because
it means a channel test requires a **new ad**, which is exactly the "spin up a variant"
capability that also does not exist (G34).

**Options**
- A) Confirm immutability: audience and channel are the identity of the bet; changing them
  makes it a different experiment. Requires a variant/clone action to be usable.
- B) Add `set_audience` and `set_channel` levers. Now every metric series has a discontinuity
  that the UI must show, and historical comparisons need the config generation (G01).
- C) Immutable in this slice, stated as a scope cut.

**Recommendation:** A, paired with a clone/variant action. It is intellectually the cleanest
reading of "an ad is a bet" (L34) and it makes the experiment model coherent: a bet's terms do
not change mid-flight, you place a new one. Say it out loud in the README, because leaving it
implicit reads as an oversight rather than a position.

---

### G10 — `Component` has no version, lineage, or supersession field · MF · **B** · SPECIFY

**Brief:** L111: *"editing a component forces a versioning decision: mutate in place (twelve
live ads silently change), copy-on-write, or immutable once live. Pick one and defend it."*
`Component` (L58–63) has `component_id`, `kind`, `payload`, `created_at`.

**Problem:** The brief demands a versioning decision and gives the type no vocabulary for two of
the three options. Copy-on-write needs `parent_id` (or `lineage_id` + `version`) to express
"this is v3 of the hook video" — without it, a COW copy is an unrelated component and the
Workbench's whole reuse story fragments. "Immutable once live" needs a status (G12) to know when
live began. Only "mutate in place" is expressible as written, which is the option the brief
itself flags as dangerous.

**Options**
- A) `lineage_id` + `version: number` + `parent_id: string | null`. Full history, groupable in
  the library as one item with N versions.
- B) `parent_id` only; version is depth in the chain.
- C) No lineage; COW copies are independent components with a naming convention.

**Recommendation:** A. `lineage_id` is what the library UI groups on and what "used in twelve
ads" should probably aggregate over (a question in its own right — do you count the lineage or
the exact version?). It is a two-field extension that makes the required decision actually
implementable.

---

### G11 — `payload: string` is polymorphic with no media metadata · US · D

**Brief:** L61: `payload: string; // copy text, or an asset URL for media`.

**Problem:** One field, two meanings, discriminated only by `kind`. For media there is no mime
type, no dimensions, no duration, no poster frame — so the Workbench cannot render a meaningful
preview, and "video" vs "image" rendering is guessed from `kind` alone. There is also no
validation boundary: nothing distinguishes a relative path, an absolute URL, or arbitrary text.

**Options** A) leave as-is, render by `kind`, accept placeholder previews; B) add optional
`meta?: { mime, width, height, duration_ms }`; C) split the type into `TextComponent` and
`MediaComponent`.

**Recommendation:** A for the slice, B if the Workbench is built for real. C breaks the given
contract for little gain. Note in the README that visual polish is explicitly a non-goal
(L147), so placeholder media is the right spend.

---

### G12 — `Component` has no status or lifecycle · MF · D

**Brief:** `Component` (L58–63) has no status field. L111 offers *"immutable once live"* as a
versioning option.

**Problem:** "Immutable once live" is a state predicate on a type with no states. It has to be
computed as "is this component referenced by any ad whose status is or has ever been `live`" —
a reverse join over the ad table *and* the decision log, evaluated on every edit. There is also
no way to retire a component: it stays in the library forever, and nothing marks it as
do-not-use-in-new-ads.

**Options**
- A) Add `status: "draft" | "live" | "retired"` to `Component`, maintained by the system when
  an ad referencing it goes live.
- B) Compute liveness on demand from the reverse join.
- C) No lifecycle; components are eternal and always editable.

**Recommendation:** A. It turns an expensive predicate into a field, gives "retire this
creative" somewhere to live, and is the state the versioning decision (G10) needs to key off.
The write path must be system-only, or it becomes config-changed-without-a-lever.

---

### G13 — `est_size` has no unit and no as-of date · US · C

**Brief:** L69: `est_size: number`.

**Problem:** People? Devices? Households? Estimated when, by whom? Audience sizes drift, and an
estimate with no `as_of` cannot be shown honestly in a UI. It is also the only number in the
model with no unit suffix, breaking the convention `_cents` establishes.

**Options** A) treat as reach in people, static reference data, state it; B) add
`est_size_as_of`; C) rename to `est_reach_people` and add `as_of`.

**Recommendation:** A. It is reference data in this system and nothing writes it. Note the
convention break rather than fixing it, to keep the given contract intact.

---

### G14 — `Audience` has no `created_at` · MF · C

**Brief:** `Component` has `created_at` (L62); `Audience` (L65–70) does not.

**Problem:** Inconsistency only. Audiences are static reference data here, so nothing depends on
it. Recorded for completeness.

**Recommendation:** Leave it. Not worth a field.

---

### G15 — Audience overlap and the referent of `retargeting` · RW · C

**Brief:** L68: `temperature: "cold" | "warm" | "retargeting"`.

**Problem:** Two real-world cases the model cannot hold. (1) `cold_us` and `warm_us` overlap in
reality — the same person can be in both, so fatigue in one bleeds into the other, and audience
sizes are not additive. Nothing expresses overlap. (2) Retargeting is defined by what it
retargets (visitors to X, cart-abandoners of Y); the model has a label with no referent, so
there is no link from a retargeting audience to the conversions or ads that populated it.

**Options** A) accept; audiences are opaque labelled buckets; B) add an overlap matrix;
C) add `source_ad_ids` to retargeting audiences.

**Recommendation:** A, named explicitly in the README as a modelling limit. The interesting
consequence — that fatigue in the simulator should arguably correlate across overlapping
audiences and will not — is worth one sentence, because the mock data is being graded as a
domain artifact (L133).

---

### G16 — `Signal` has no arrival timestamp · MF · **B** · FIX ★

**Brief:** L73: *"Delivery is at-least-once and unordered: `ts` is event time, not arrival
time, and consumers dedupe on `event_id`."* L81–83: conversions *"may land hours or days after
its click, retroactively changing periods you thought were closed."* L123: *"Pick at least one
misbehavior — late-attributing conversions are the most interesting — handle it end to end."*

**Problem:** The brief names arrival time in order to say `ts` is not it, and then provides no
field for it. Every mechanism the flagship requirement needs is therefore unimplementable
against the contract as written:

- **Lateness** is `arrival − ts`. Undefined without arrival.
- **A watermark** ("we have seen everything up to T") cannot be computed.
- **Restatement detection** — "this hour's CPA changed because a conversion landed late" —
  requires knowing when the number changed, which is arrival, not event time.
- **As-of views** ("what did this chart show at 09:00?") require replay by arrival order.
- **Decision scoring** (L125) compares a before-window to an after-window; without arrival
  time, a conversion arriving after the decision but attributed before it silently pollutes the
  before-window, and the guard the brief implies cannot be written.
- **Traceability** (L143) — "trace any number on screen back to the raw events beneath it, and
  do they agree" — is only checkable if the number's as-of point is known.

This is the single most consequential gap in the brief. Note that arrival time is not
recoverable later: if it is not captured at ingest it is gone.

**Options**
- A) Add `received_at: string` (ISO 8601 UTC), stamped by our ingest boundary, never by the
  emitter. The emitter owns `ts`; we own `received_at`. Clock skew becomes observable as
  `received_at − ts`.
- B) Add a monotonic ingest sequence number instead of a timestamp — cheaper to order by, but
  it cannot express "3 hours late" in the UI.
- C) Both: `received_at` for human-facing lateness, `ingest_seq` for ordering and replay.
- D) Neither; approximate arrival as "the time the client first rendered it". Loses everything
  on restart, since the server has no record.

**Recommendation:** C. `received_at` is what the UI shows and what the lateness histogram is
built from; `ingest_seq` is what replay, cursors and "as-of" reconstruction actually need,
because timestamps collide and are not monotonic under bursts. D is a trap — it makes the
brief's own hard requirement (state survives a refresh, L151) destroy the evidence. This is an
extension to the given contract and gets its own entry in the extensions section of the README,
per L40.

---

### G17 — `attributed_click_id` references a field that does not exist · MI · **B** · FIX ★

**Brief:** L81: `{ event: "conversion"; attributed_click_id: string; value_cents: number }`.
L78: `{ event: "click"; cost_cents: number }` — plus the shared envelope `{ event_id, ts, ad_id }`.

**Problem:** There is no `click_id` anywhere in the contract. The only identifier a click
carries is its `event_id`. So `attributed_click_id` either (a) means "the click's `event_id`",
which is never stated and conflates a transport-layer dedupe key with a domain-level foreign
key, or (b) refers to a platform click id that the contract forgot to put on `click`.

The distinction matters. `event_id` is described as a **dedupe key** for at-least-once delivery
(L73) — a transport concern. Using it as a domain foreign key means that if the same click is
re-delivered under a different `event_id` (which at-least-once does not forbid; only redelivery
of the *same* event is deduped), the conversion's reference silently dangles. And the naming
asymmetry — `attributed_click_id` vs `event_id` — is exactly what one would expect if a
`click_id` field had been dropped from the type by accident.

**Options**
- A) Declare `attributed_click_id` = the click's `event_id`. Zero extension, and the
  dedupe/join key conflation is documented as accepted.
- B) Add `click_id: string` to the `click` variant, distinct from `event_id`. Clean separation:
  `event_id` dedupes transport, `click_id` identifies the domain fact. Requires the simulator
  to mint both.
- C) Ask the brief's author (this is in `OPEN_QUESTIONS.md` §A).

**Recommendation:** B, pending C. It costs one field and it makes the interesting failure mode
— the same click delivered twice under two `event_id`s — representable instead of silently
wrong. Under A, that scenario produces a double-counted click that nothing can detect.

---

### G18 — Signals carry `ad_id` only; no component or config linkage · MI · **B** · SPECIFY ★

**Brief:** L76: `type Signal = { event_id: string; ts: string; ad_id: string } & (...)`.
L111: *"When one video appears in twelve live ads across three channels, what does the
strategist see when they look at that video?"*

**Problem:** The Workbench's central question is component-level performance, and no signal
references a component. The only path from an impression to the video that produced it is:
resolve `ad_id` → resolve that ad's config **as of `ts`** → read `video_id`. Step two requires
G01 (no generation identifier) and G33 (the fold has no origin). So the flagship Workbench
question depends on two things the contract does not provide.

It gets worse across a swap. If `a_12`'s video was swapped at noon, then the ad's impressions
before noon belong to video A and after noon to video B — and a conversion arriving Thursday
for a Tuesday click belongs to whatever was live *on Tuesday*. Answering "how is this video
performing" without config generations produces a number that is quietly wrong and, worse,
quietly *changes* every time an unrelated ad swaps a component.

**Options**
- A) Resolve at read time by folding the decision log. Correct if the log is complete; expensive
  and recomputed constantly.
- B) Resolve at ingest and denormalise `config_generation_id` (or the resolved component ids)
  onto the stored fact. Reads become trivial; requires the generation to exist at ingest, and
  a late event must resolve against the generation valid at its `ts`, not at `received_at`.
- C) Have the simulator stamp component ids directly on emitted events. Simplest of all, and
  wrong in principle: it makes the emitter authoritative for attribution, so a bug in the
  simulator is indistinguishable from a bug in the model, and the traceability claim (L143)
  becomes circular.

**Recommendation:** B. It is the only option that keeps the emitter dumb, keeps reads cheap, and
makes the late-conversion attribution question (which generation gets credit) an explicit,
inspectable choice rather than an accident of when the query ran. C is disqualified by the
grading criterion itself: the point is that the app derives everything from the stream.

---

### G19 — `spend`: delta vs cumulative, cadence, and reason are all unspecified · US · **B** · FIX

**Brief:** L79–80: `{ event: "spend"; amount_cents: number } // non-click charges (CPM, fees);
disjoint from click costs — total spend = sum of both`. L117 calls them *"spend ticks"*.

**Problem:** Three unknowns in one field.

1. **Delta or cumulative.** "Total spend = sum of both" implies delta (you sum them). "Ticks"
   implies periodic emission, which is consistent with either. If a cumulative reading is ever
   summed, spend is catastrophically overstated; if a delta is ever treated as a reading, it is
   understated. Nothing in the contract disambiguates, and no field (`period_start`,
   `cumulative: true`) exists to carry the answer.
2. **Cadence.** Per impression? Per minute? Per hour? This determines event volume — the
   difference between thousands and millions of rows over a simulated week — which directly
   drives the aggregation and compaction decisions.
3. **Reason.** "CPM, fees" are lumped into one field with no discriminator, so "what did we
   actually pay for" is unanswerable and a fee cannot be excluded from a CPM-efficiency metric.

The delta/cumulative question is genuinely load-bearing for correctness under **at-least-once
delivery**: a duplicated delta is a real error that dedupe must catch, whereas a duplicated
cumulative reading is harmless and idempotent. The two choices imply different ingest
correctness proofs.

**Options**
- A) Delta, per fixed interval (e.g. one tick per ad per minute while live), `amount_cents` is
  the charge accrued in that interval. Sums naturally; needs strict dedupe.
- B) Cumulative reading with a `period_start`; idempotent under duplication; requires
  max-per-period rather than sum, and gaps are invisible.
- C) Delta, per impression batch, with a `reason: "cpm" | "fee"` discriminator.

**Recommendation:** A plus the `reason` discriminator from C. Delta is the reading most
consistent with "sum of both", and it makes duplicate handling a *visible* correctness property
rather than an accident of idempotence — which is the point of the exercise. Fixed-interval
ticks keep volume predictable and give the simulator a natural place to express pacing.

---

### G20 — `value_cents`: gross vs net, and no conversion kind · US · D

**Brief:** L81: `{ event: "conversion"; attributed_click_id: string; value_cents: number }`.
L22: *"conversions (the action you wanted — a purchase, an install)"*. L22 also defines ROAS as
*"return on ad spend"*.

**Problem:** Two gaps. (1) `value_cents` is the ROAS numerator and its basis is unstated —
gross revenue, net of refunds, or margin. ROAS conventionally uses gross revenue; if the value
is ever net, every ROAS figure is a different metric under the same name. (2) Background names
two conversion kinds, purchases and installs, and the contract has no kind field. An install has
no natural monetary value, so it would either arrive with `value_cents: 0` (dragging ROAS to
zero and making CPA the only usable metric) or with an imputed value that nothing records as
imputed.

**Options**
- A) Single conversion type, `value_cents` is gross revenue, installs out of scope. State it.
- B) Add `conversion_kind: "purchase" | "install"` and allow `value_cents: 0`, with the UI
  segmenting ROAS to purchases only.
- C) Add kind plus an `imputed_value` flag.

**Recommendation:** A for the slice. One conversion kind keeps CPA and ROAS meaning one thing
each, and the brief explicitly disclaims adtech completeness (L147). B is the honest extension
if the Decision loop needs to show that not all conversions are commensurable — note it as a
"what I'd build next".

---

### G21 — No sequence number; gaps and stalls are undetectable · MF · D

**Brief:** L73: delivery is *"at-least-once and unordered"*.

**Problem:** With unordered, at-least-once delivery and no sequence number or offset, the
consumer cannot distinguish: (a) the ad genuinely produced no events in the last minute,
(b) the stream stalled, (c) events were lost, (d) events are in flight and will arrive late.
All four render identically as a flat line. For a real-time cockpit whose entire purpose is
reading signals as they arrive, "is this zero real?" is a first-order question, and the contract
has no vocabulary for it.

This compounds G16: without arrival ordering there is also no cursor for reconnect, so a client
that drops its SSE/WS connection cannot ask "give me everything since X" without guessing on
timestamps, which are neither unique nor monotonic.

**Options**
- A) Server-assigned monotonic `ingest_seq` at the ingest boundary (pairs with G16 option C).
  Gives a reconnect cursor and a total order for replay. Does not detect emitter-side loss.
- B) Emitter-assigned per-ad sequence with gap detection. Detects true loss; a lot of machinery
  for a mock stream.
- C) A liveness heartbeat per live ad, so silence is distinguishable from a stall.
- D) Nothing; treat flat as flat.

**Recommendation:** A, plus C as a cheap UI honesty measure ("last event received 4s ago" vs
"stream stalled"). B is over-engineering for a simulator we control, and the brief asks us to
name what we tolerate rather than handle everything (L123).

---

### G22 — `ts` precision and same-timestamp tie-break undefined · US · C

**Brief:** L54, L73, L92: *"ISO 8601 UTC"* with no precision stated.

**Problem:** Seconds or milliseconds? Under a burst, many events share a timestamp, and the
ordering among them is undefined — which matters for any fold, for cursor-based pagination, and
for "the last event before the decision".

**Options** A) millisecond precision, tie-break on `ingest_seq` (G21), then `event_id`
lexically; B) millisecond precision, ties unordered; C) leave unspecified.

**Recommendation:** A. It is free once `ingest_seq` exists and it makes every fold
deterministic — which the simulator's seeded-determinism goal needs anyway.

---

### G23 — `Decision.ts`: request time or effective time · US · D

**Brief:** L92: `ts: string; // ISO 8601 UTC`.

**Problem:** For a pause, request time and effective time differ — the strategist clicks at
14:00:00 and the platform stops serving at 14:00:03, or in a real system, minutes later. The
fold cares about effective time (when did config actually change); the audit log cares about
request time (when did the human decide); decision scoring (L125) needs to know which boundary
the before/after windows split on. One field cannot be all three.

There is also a subtler case: a *backdated* decision. If a decision is recorded with a `ts` in
the past, the fold retroactively rewrites config history, and every attribution built on
generations (G01) shifts underneath already-computed aggregates.

**Options** A) one `ts` = request time, effect is immediate by fiat; B) two fields, `ts` and
`effective_at`, with a simulated propagation delay; C) one `ts`, and forbid backdating.

**Recommendation:** A + C for the slice. A simulated propagation delay is realistic and adds a
whole class of intermediate states with no payoff for the grading criteria. Forbidding backdated
decisions should be an enforced invariant, not a convention, because it is what keeps the
generation timeline append-only.

---

### G24 — `from_cents` and `from_id` are derivable; storing them is a divergence hazard · UI · D

**Brief:** L98–99: `{ action: "set_budget"; from_cents; to_cents }`,
`{ action: "swap_component"; slot; from_id; to_id }`.

**Problem:** Both `from_*` fields are recoverable by folding the log up to the decision. Storing
them creates a second source of truth with no stated precedence. Three concrete failure modes:

1. **Replay divergence.** Replaying the log from the origin can produce a state where the
   recorded `from_cents` does not match the folded value. Which wins? The contract is silent.
2. **Concurrency.** Two `set_budget` decisions issued against the same read state both record
   the same `from_cents`; applied in sequence, the second's `from` is a lie.
3. **It is also genuinely useful** — as an optimistic-concurrency check (reject the decision if
   `from_cents` ≠ current) and as a self-contained audit record that reads correctly without a
   fold. That is presumably why it is in the contract.

The gap is not the field's existence; it is that its **role is unstated**. A precondition and a
denormalised convenience have opposite failure behaviour: one rejects, the other silently drifts.

**Options**
- A) Treat `from_*` as a **precondition**: the lever rejects the decision if it disagrees with
  the current fold (compare-and-swap). Makes the log a correctness mechanism.
- B) Treat it as an **audit annotation**: recorded, never validated, fold always wins.
- C) Drop the fields and always fold.

**Recommendation:** A. It costs one comparison, it turns a divergence hazard into an enforced
invariant, and it gives the Decision loop a real concurrency story — two strategists (or a
strategist and `system:fatigue_rule`) racing on the same ad is exactly the scenario a
human-in-the-loop product hits.

---

### G25 — `Decision` has no status; no idempotency, conflict, or failure semantics · MF · D

**Brief:** L90–100. L87: *"Every pull is a decision event."*

**Problem:** A decision is modelled as a fact that has already happened, but levers can fail or
be meaningless:

- **Idempotency:** `pause` on an already-paused ad. No-op, error, or a second log entry?
- **Conflict:** two `set_budget` at the same `ts`. G22's tie-break decides the order; nothing
  decides whether the loser is recorded as rejected or silently overwritten.
- **Invalidity:** `swap_component` with a `to_id` that does not exist (G07), or `resume` on an
  archived ad.
- **Failure:** in a real system the platform rejects the change. Here there is no field to say
  "logged but not applied", so a rejected decision either vanishes from the log (destroying the
  audit trail, which is the log's entire purpose) or appears as if it took effect.

**Options** A) validate at the boundary and never append invalid decisions — the log contains
only applied facts; B) append everything with `status: "applied" | "rejected"` and a
`rejection_reason`; C) append everything, no status, fold skips no-ops.

**Recommendation:** B. The Decision loop's product value is the log as a record of what the
strategist *tried*, not just what succeeded, and a rejected decision with its reason is the most
interesting row in an audit trail. It also gives G24's compare-and-swap somewhere to record its
rejections rather than swallowing them.

---

### G26 — `Decision` has no reference to the evidence that triggered it · MF · D

**Brief:** L95: `rationale: string; // required — for systems too`. L93:
`actor: human:${string} | system:${string}` with the example `"system:fatigue_rule"`.

**Problem:** The brief goes out of its way to require a rationale from automated actors, which
is the right instinct — but `rationale` is free text. A system decision therefore records
*"CTR fell below threshold"* as a **string**, not as a reference to the window, metric and
values that fired. So the one thing the evaluation criteria most want to check —
*"can you trace any number on screen back to the raw events beneath it — and do they agree"*
(L143) — is broken precisely at the automated decision, where the number *caused* an action.

This is the traceability requirement's weakest link. A human's rationale is legitimately prose.
A machine's should be a pointer.

**Options**
- A) Free text only; the system formats a human-readable string. Zero cost, zero traceability.
- B) Add `evidence?: { metric, window_start, window_end, value, threshold, sample_size }`.
  A system decision then links back to an exact aggregate, which links back to exact events.
- C) Add `evidence?: { event_ids: string[] }` — the raw facts themselves. Maximally traceable,
  potentially enormous.

**Recommendation:** B. It is the cheapest thing that makes the trace complete end to end:
`decision → evidence window → aggregate → events`. It also makes the "how do you separate
signal from noise" question (L155) inspectable, because `sample_size` and `threshold` are
recorded at decision time rather than reconstructed later against a heuristic that may since
have changed.

---

### G27 — `actor` is an opaque string with no registry · MF · C

**Brief:** L93: `actor: \`human:${string}\` | \`system:${string}\`` — e.g. `"human:nk"`.

**Problem:** No user entity, so `human:nk` cannot be rendered as a name, and nothing prevents
typos creating phantom actors. Similarly, the set of `system:` rules is unenumerated.

**Options** A) accept opaque strings, single hard-coded current user; B) small actor registry
as reference data.

**Recommendation:** A. Single-user prototype; multi-user is not in the brief. Note it.

---

# Pass 2 — Referential

Following every cross-reference between the types. Most referential problems collapse into
Pass 1 findings and are cross-referenced rather than restated. Five findings are genuinely
referential.

**Resolved cleanly (no finding):** `Ad.video_id`/`headline_id` → `Component.component_id` ✔ ·
`Ad.audience_id` → `Audience.audience_id` ✔ · `Signal.ad_id` → `Ad.ad_id` ✔ ·
`Decision.ad_id` → `Ad.ad_id` ✔.

**Dangling or orphaned (cross-referenced):** `conversion.attributed_click_id` → **nothing**
(G17) · `Component.kind: "image" | "body_copy"` → no slot (G06) · `Ad.status: "draft" |
"archived"` → no transition (G50) · `Audience.temperature: "retargeting"` → no referent (G15) ·
`Decision.actor` → no entity (G27).

---

### G28 — No variant or experiment entity · PA · **B** · SPECIFY

**Brief:** L111: *"Think of this as: component library + ad builder + **a model of variants**."*
L34: *"treats every live ad as a running experiment."* L125: *"spin up a variant."*

**Problem:** "Variant" appears three times across the brief as a first-class concept and appears
nowhere in the contracts. Nothing expresses that `a_12` and `a_13` are the same bet with one
component changed — no `variant_group_id`, no `parent_ad_id`, no experiment entity. Without it:

- The Workbench cannot show a variant set, which is the surface's stated deliverable.
- "Which of these three headlines wins?" has no query — you can compare three unrelated ads,
  but nothing records that they were *designed* as a comparison, or which dimension varies.
- The comparison is statistically meaningless without knowing what was held constant, and the
  model does not record what was held constant.

This is a product ask with no expression in the data model at all — not an underdetermined
field, an absent concept.

**Options**
- A) `variant_group_id: string | null` on `Ad`. Minimal; siblings share a group. Does not record
  which dimension varies (inferable by diffing configs).
- B) An `Experiment` entity: `{ experiment_id, hypothesis, held_constant[], varying_slot,
  ad_ids[] }`. Expresses intent; more to build and to keep consistent.
- C) Derive variant sets structurally: ads sharing audience + channel and differing in exactly
  one component slot are a variant set. No new fields; fragile and surprising when two
  unrelated ads coincidentally match.

**Recommendation:** A. One nullable field carries the reuse story and the sibling grouping, and
the varying dimension is recoverable by diffing the configs in the group. B is the right model
for a real product and the wrong spend for a two-surface slice — list it as "what I'd build
next". C looks clever and produces phantom experiments.

---

### G29 — No campaign or portfolio entity · PA · D

**Brief:** L34: *"the strategist not as a producer of ads but as the operator of a **portfolio**
of experiments."* L26: the strategist *"decides what to run, for whom, where, with what
budget."*

**Problem:** The premise is portfolio management and the model has no portfolio. There is no
grouping above the ad, therefore no shared budget pool, no portfolio-level rollup, and no way to
express "reallocate budget" as anything other than N independent `set_budget` calls that happen
to net out. The Decision loop's second named lever is *"reallocate budget"* (L125) — reallocation
implies a fixed pool being redistributed, and there is no pool.

**Options** A) accept; the portfolio is "all ads", rollups are global; B) add a `Campaign`
entity with its own budget; C) add `campaign_id` as a grouping label with no budget semantics.

**Recommendation:** A for the slice, and reframe "reallocate" honestly as "adjust budgets
independently" in the README rather than pretending a pool exists. B introduces a budget
constraint solver that the brief does not ask for and that would eat the whole budget.

---

### G30 — A conversion's `ad_id` can contradict its click's `ad_id` · UI · D

**Brief:** L76 (shared envelope carries `ad_id`) and L81 (`attributed_click_id`).

**Problem:** A conversion carries both its own `ad_id` and a pointer to a click that also has
one. They can disagree, and nothing says which wins. This is not hypothetical: it is exactly
what happens with view-through and cross-ad attribution in real platforms, and it is what
happens in *our* system if a bug or a re-delivery crosses the wires. The choice matters —
crediting the conversion to its own `ad_id` vs to the click's `ad_id` moves revenue between ads.

Compounding this: if the click is not yet present (G41), the conversion's own `ad_id` is the
only information available, so the two paths diverge based purely on arrival order.

**Options**
- A) The **click** is authoritative; the conversion's `ad_id` is a hint. Consistent with
  click-attributed conversions being, by definition, credited to the click's ad. Requires
  parking conversions until the click arrives.
- B) The **conversion's own `ad_id`** is authoritative. Never blocks on the click; disagreements
  are invisible.
- C) Authoritative click, with the conversion counted provisionally against its own `ad_id`
  until the click resolves, then corrected.

**Recommendation:** C. It is the only option that both counts promptly and ends up correct, and
the correction event is a genuinely interesting thing to show in the traceability view — a
number that visibly restates. It requires the restatement machinery that G16/G42 need anyway,
so the marginal cost is low. Disagreements must be counted and surfaced, not silently resolved.

---

### G31 — `swap_component.from_id`/`to_id` are not declared to reference `Component` · MI · C

**Brief:** L99. Compare L52, which annotates `video_id` with `// -> Component.component_id`.

**Problem:** Documentation inconsistency rather than a real ambiguity — the reference is obvious
from context. Recorded so the referential pass is complete.

**Recommendation:** Annotate in our own types. No decision needed.

---

### G32 — Audiences and channels are described as library items but are not components · PA · C

**Brief:** L111: *"I'm a strategist with a library of components — videos, images, copy,
audiences, channels."*

**Problem:** The sentence puts five things in one library; the model has three unrelated shapes
(`Component`, `Audience`, `Channel` enum). Whatever the Workbench renders as "the library" is
therefore a heterogeneous union with no shared type, no shared id space, and no shared
`created_at`.

**Options** A) accept, render three sections in one panel; B) introduce a `LibraryItem` union
type for the UI layer only; C) unify audiences and channels into `Component` with new kinds.

**Recommendation:** B — a presentation-layer union, no change to the storage contracts.
C corrupts a clean domain model for a UI convenience.

---

# Pass 3 — Product ask

Each surface taken sentence by sentence, plus Background concepts that never reach the
contracts.

---

### G33 — "Current config is derivable" is false as written: the fold has no origin · IC · **B** · FIX ★

**Brief:** L125: *"Which means current config is derivable: the initial state folded over the
decision log. Decide whether you store the fold, the log, or both — and which one the UI
reads."* L42: *"A live ad's config changes only through levers."*

**Problem:** The claim depends on "the initial state" being available, and nothing in the
contract produces it. There is no `create_ad` action, no `launch` action, and no event of any
kind that brings an `Ad` into existence with its first config. The `Decision` union (L97–100)
contains only mutations of an ad that already exists.

So the fold has no origin, and the sentence the entire Decision loop is built on is not true of
the model as given. Concretely:

- **The log cannot reconstruct config.** It can only reconstruct *changes* to a config it must
  be handed from somewhere else.
- **That somewhere else is unspecified**, and is therefore a config write that is not a lever —
  directly contradicting L42.
- **Component-level history is unrecoverable** (G38): "which video was live at time T" needs
  the origin plus every swap. With no origin, the earliest answerable question starts at the
  first swap.
- **Event-sourcing purity is unavailable**, so "what is recomputable from the event log" (L119)
  — an explicit grading criterion — cannot be answered as "everything".

This is the finding I would raise first with the brief's author, because it is not
underdetermination; it is a claim the contract falsifies.

**Options**
- A) Add a `create_ad` decision carrying the full initial config, making the log complete and
  self-contained. Every ad begins with exactly one. Purest; makes L125 literally true; the
  action is heterogeneous with the others (it carries a whole config, not a delta).
- B) Ads are seeded into a table out-of-band; the log holds only post-creation changes. Simplest;
  keeps L42 false; config before the first decision is only knowable from a mutable table.
- C) Add both `create_ad` (draft config) **and** `launch` (draft → live), separating authoring
  from committing. Matches how the product actually behaves — a draft is edited freely, and only
  at launch does config become lever-governed.

**Recommendation:** C. It resolves this finding and G50 (dead lifecycle states) together, and it
gives the sharpest defence of L42: config changes freely while `draft` (nothing depends on it
and no events exist), and *once live*, only levers touch it. That is a more precise and more
defensible rule than the brief's own, and it makes "the initial state" a real, dated,
attributable event.

---

### G34 — Two of the five named levers do not exist · PA · **B** · SPECIFY

**Brief:** L125: *"What can the strategist actually do — pause, reallocate budget, swap a
component, **spin up a variant, kill and relaunch**."*

**Problem:** Five capabilities named in the prose; three exist in `Decision`. Missing:

- **"Spin up a variant"** — no clone/duplicate action, and no variant grouping to put the result
  in (G28). This is the loop-closing move: read a signal, hypothesise, launch the challenger.
  Without it, the "compounding what each ad teaches into the next one" premise (L34) has no
  mechanism.
- **"Kill and relaunch"** — "kill" implies `archived`, which no action reaches (G50);
  "relaunch" implies `draft → live`, which no action reaches either.

Note the interaction with G09: if audience and channel are immutable via levers, then testing a
new audience *requires* the variant action. The one capability that would compensate for the
missing levers is itself missing.

**Options**
- A) Build the three that exist; document the other two as cut, with reasons.
- B) Add `create_ad` + `launch` + `archive` + `clone_ad` (→ new draft, optionally in the same
  variant group). Four additions; closes the lifecycle and the loop.
- C) Add only `launch` + `archive`; treat variants as manual re-creation through the builder.

**Recommendation:** B if the Decision loop is a built surface, C if it is sketched — but the
choice must follow the slice decision, not precede it. A is only defensible if the Decision loop
is explicitly sketched, because "at least one decision closable in-product" (L151) can be
satisfied by `pause` alone.

---

### G35 — "A lever shows up in the stream" — but `Decision` is not a `Signal` · IC · D

**Brief:** L125: *"a lever appends a decision event **and** mutates config **and** shows up in
the stream — pause `a_12` and its events stop ticking."*

**Problem:** The sentence has two readings and the contract supports neither cleanly.

- *Reading 1: decisions are emitted into the signal stream.* But `Signal` (L76) is a closed union
  of four event types and does not include decisions. Adding one is an extension, and it mixes
  two things the brief insists elsewhere are distinct (*"are configs, signals, and levers kept
  distinct in your model"*, L143).
- *Reading 2: a lever's effect shows up in the stream* — pausing stops the impressions. This is
  clearly also intended (the em-dash clause says exactly that), but it is a **simulator
  behaviour**, not a contract property (G48).

For the UI, the practical consequence is a **unified timeline**: to draw "budget raised here"
on a metrics chart, decisions and signals must be merged on one axis. They share no envelope,
no sequence, and arguably no clock (`Decision.ts` is our clock; `Signal.ts` is the platform's,
possibly skewed — G44).

**Options**
- A) Two stores, merged in the read model for display. Keeps the three kinds distinct, as the
  grading criterion wants; the merge is a view concern.
- B) One physical append-only log with a `kind: "signal" | "decision"` discriminator, projected
  into two logical streams. One cursor, one order, trivially unified timelines; risks blurring
  the distinction the brief grades on.
- C) Emit a synthetic `Signal` alongside each decision. Duplicates state; two things to keep in
  sync.

**Recommendation:** A, with a shared envelope shape (`{ id, ts, received_at, ingest_seq }`) so
the merge is mechanical. It satisfies L143 literally — configs, signals and levers are distinct
types in distinct stores — while making the timeline cheap. C is disqualified: duplicated state
that can diverge.

---

### G36 — Human-in-the-loop is defined in Background and unrepresentable in the model · PA · D

**Brief:** L28: *"**Human-in-the-loop** — automation that pauses at defined points for a person
to review or approve before proceeding."* L93 supports `system:` actors. L95: rationale
*"required — for systems too"*.

**Problem:** Background defines human-in-the-loop as one of eight concepts *"you need to
understand the brief"*, and the contract has no way to express it. `Decision` has no `proposed`
state, no approver, no approval timestamp. Every decision in the log is one that already
happened. Therefore:

- A `system:fatigue_rule` decision **auto-applies**. The pause-for-review the Background
  promises cannot occur.
- There is no way to record a proposal that a human **rejected** — which is arguably the most
  valuable row in a human-in-the-loop audit log, because it is where the human's judgement is
  visible.
- The `actor` type does not compose: an approved proposal has two actors (the system that
  proposed it, the human who approved it) and the field holds one.

This is the largest gap between the Background section and the contracts.

**Options**
- A) System decisions auto-apply; human-in-the-loop is out of scope, stated. Contract unchanged.
- B) Add `status: "proposed" | "approved" | "rejected" | "applied"` plus `approved_by` and
  `approved_at` (composes with G25's status).
- C) Model proposals as a separate `Recommendation` entity that becomes a `Decision` on
  approval. Cleanest separation — a proposal is genuinely not a decision — at the cost of a
  second entity and a conversion path.

**Recommendation:** C if the Decision loop is built for real; A otherwise. C is the honest
model: a `Decision` should mean "a lever was pulled", and a proposal is not that. It also gives
the Decision loop a compelling demo — the system spots fatigue, proposes a pause with its
evidence (G26), the human approves, events stop — which closes the loop the brief demands (L151)
with a human in it, exactly as Background describes.

---

### G37 — Creative fatigue is central to Background and absent from the contracts · PA · D

**Brief:** L24: *"**Creative fatigue** — ads decay. A creative that performed well for two weeks
will often stop working as its audience tires of it. Performance is a moving target."* L133:
*"The shape of the performance data you invent — its noise, its daily rhythms, its **fatigue
curves** — reveals your model of the domain."* L93's own example actor: `"system:fatigue_rule"`.

**Problem:** Fatigue is named as a core domain concept, is the example given for automated
decisions, and is explicitly called out as something that will be inspected — and there is no
field for it anywhere. It is purely emergent: it must be *generated* by the simulator as a decay
in the CTR of an ad's events over time, and *inferred* by the app from those events. Nothing
records "this creative is fatigued" as state.

That is defensible — arguably correct, since a derived signal should not be stored as a fact —
but it has real consequences that must be chosen deliberately:

- **Fatigue attaches to a (creative, audience) pair**, not to an ad. The same video is fresh to
  a new audience and stale to an old one. With no component-level event linkage (G18), this is
  hard to observe.
- **A swap resets fatigue** for the swapped slot but not the others, so the metric series has a
  discontinuity that only the config generation (G01) explains.
- **Audience overlap** means fatigue should bleed across audiences (G15), and cannot.

**Options**
- A) Fatigue is entirely emergent; the simulator decays per (component-lineage, audience) pair
  and the app infers it from a rolling CTR trend.
- B) Additionally store a derived `fatigue_score` as a cached read-model value.
- C) Emit fatigue as a signal type from the simulator. Rejected on principle — it makes the
  emitter authoritative for something the app is supposed to detect.

**Recommendation:** A, with the decay parameterised per (component lineage, audience) in the
simulator. This is the single richest place to demonstrate domain modelling, since the brief
says outright it will be inspected, and it keeps the app's job honest: detect the decay, do not
be told about it.

> **RESOLVED — option A, by D35.** Fatigue accrues to the `(component lineage × audience)` pair,
> frequency-driven: `f = F(lineage, audience) / (est_size × served_fraction)`,
> `φ(f) = 0.25 + 0.75·exp(−0.35f)`, 5-day idle recovery, slots composing `video^1.0 × headline^0.5`.
> Nothing records fatigue as state and no `fatigue` signal exists — the simulator generates it as
> decayed CTR and the app infers it, which is what this finding asked for. The three consequences
> named above are all now visible in the seeded data: **the same video sits at φ 0.43 on `cold_us`
> and φ 0.91 on `warm_us` at the same instant**; a swap resets one slot and the discontinuity is
> explained only by `config_generations`; audience overlap remains **unmodelled and named** (G15,
> `SIMULATOR.md` §20). Model: `SIMULATOR.md` §7. Decision: `DECISIONS.md` § D35.

---

### G38 — "Used in twelve live ads" is a temporal join blocked by the missing origin · PA · D

**Brief:** L111: *"ads ↔ components is many-to-many with a live read path — 'used in twelve ads'
is a reverse join kept current as ads launch and die."*

**Problem:** Three distinct queries hide behind one phrase, and they need different data:

| Query | Needs |
|---|---|
| "used in 12 ads **right now**" | current config fold + ad status |
| "used in 12 ads **at time T**" | config generations (G01) + origin (G33) |
| "used in 12 ads **ever**" | complete swap history + origin (G33) |

Only the first is answerable with the contract as given, and even that requires knowing each
ad's current config — which requires the fold, which requires the origin. "Kept current as ads
launch and die" also presumes launch and archive transitions that do not exist (G50).

There is a further ambiguity that G10 creates: does "twelve ads" count the exact
`component_id`, or every version in its lineage? Under copy-on-write these give very different
numbers, and the Workbench's headline stat is whichever we pick.

**Options** A) current-only reverse index, maintained on each config change; B) full temporal
index (component, ad, valid_from, valid_to) built from the log; C) current-only, computed on
read by scanning ads.

**Recommendation:** B if the Workbench is built for real — it falls out of G01's generations
almost for free and it is the only version that can answer "how did this video perform" honestly
across swaps. C is fine at prototype scale (tens of ads) and should not be dressed up as an
index.

---

### G39 — "Everything on screen is derived from the stream" cannot hold literally · IC · C

**Brief:** L117: *"Everything on screen is derived from the stream; nothing on screen is
hard-coded."*

**Problem:** Taken literally, false: budget, status, channel, audience and component payloads
come from configs and the decision log, not the signal stream. The intent is obviously "no
pre-baked arrays behind charts" (the preceding clause says exactly that), but as a stated
principle it conflicts with the model's own three-way split, and the claim needs restating
precisely before it can be used as a design rule.

**Recommendation:** Restate as: *every performance number is derived from the signal stream;
every config value is derived from the decision log folded over the origin; nothing is
hard-coded.* Two derivation paths, one rule, no hard-coded arrays. No decision needed — this is
a wording fix for our own docs.

---

# Pass 4 — Event semantics

Pushing on at-least-once, unordered delivery, event time vs arrival time, and late attribution.

---

### G40 — Conflicting duplicates sharing an `event_id` · US · D

**Brief:** L73: *"Delivery is at-least-once and unordered … consumers dedupe on `event_id`."*

**Problem:** "Dedupe on `event_id`" specifies the key and not the resolution. Two deliveries
with the same `event_id` and **different payloads** (a conversion whose `value_cents` changed
from 4999 to 5499) are not addressed at all. First-write-wins silently discards a genuine
platform correction; last-write-wins silently accepts a corrupt redelivery. Neither is
detectable after the fact unless both versions are retained.

This is also the only place a *correction* could sneak into the contract (see G43) — a restated
conversion value has no other vocabulary, so it would arrive here disguised as a duplicate.

**Options**
- A) First-write-wins, count conflicts as a health metric. Idempotent and stable; loses
  corrections.
- B) Last-write-wins by `received_at`, retaining superseded versions. Accepts corrections;
  needs restatement machinery downstream (which G42 needs anyway).
- C) First-write-wins for the aggregate but store every delivery, so conflicts are visible and
  the decision is reversible.

**Recommendation:** C. Storing all deliveries costs little at prototype volume and it is the
only option that makes the choice *demonstrable* — the traceability view can show "this event
was delivered 3 times, twice identically, once conflicting; we used the first." That is a far
better answer to "which misbehaviours does your design handle" than a policy statement.

---

### G41 — Orphaned `attributed_click_id` · US · D

**Brief:** L81–83. Delivery is unordered (L73), so a conversion can arrive before its click, or
its click may never arrive.

**Problem:** No policy exists. The cases:

| Case | Consequence |
|---|---|
| Conversion arrives before click | Cannot resolve the click's `ts` or ad. Attribution window uncheckable. |
| Click never arrives | Conversion is permanently orphaned. Counted or not? |
| Click arrives after the horizon | Was the conversion already counted? Does it move? |

If orphans are dropped, conversions are undercounted and revenue vanishes with no trace. If they
are counted against the conversion's own `ad_id` (G30), they may later prove to belong elsewhere.

**Options** A) drop orphans; B) park in a pending table, resolve on click arrival, promote
retroactively; C) count provisionally against the conversion's own `ad_id`, correct on
resolution.

**Recommendation:** C (consistent with G30). Never silently lose revenue; make the correction
visible. Orphans older than the lateness horizon should be surfaced as a data-health count
rather than deleted — an unresolvable conversion is a fact about the stream and the UI should
say so.

---

### G42 — Nothing defines when a period is closed · US · **B** · FIX

**Brief:** L83: conversions *"retroactively chang[e] periods you thought were closed."* L123:
*"quietly rewrite numbers you thought were final."*

**Problem:** The brief twice describes periods being *thought* closed and never defines when one
*is* closed. With no watermark, no lateness horizon and no finality rule, every number in the
system is provisional forever, and the UI has no vocabulary to distinguish:

- a settled number (the horizon has passed, it will not move),
- a live number (still accruing),
- a restated number (it moved after you last looked).

That third state is the one the brief cares most about, and it is unrepresentable without
arrival time (G16). "Quietly rewrite" is the failure mode; the fix is to make the rewrite
**loud**, and the contract provides no field to make it loud with.

There is a second-order consequence for decision scoring (L125): a before/after window over an
unclosed period compares two numbers that are still moving, at different rates (the "before"
window has had longer to accumulate late conversions than the "after" window). Without a
horizon, that comparison is systematically biased against the post-decision period.

**Options**
- A) Fixed lateness horizon (e.g. 72h): a period is closed once `now − period_end > horizon`;
  events later than that are logged and excluded from aggregates.
- B) Dynamic watermark from observed lateness (e.g. p99 of `received_at − ts`). Adaptive;
  harder to explain, and the brief prefers an explainable heuristic (L147).
- C) Never close; everything is always restatable, and the UI shows an as-of timestamp on every
  number.

**Recommendation:** A plus the as-of display from C. A fixed, stated horizon is exactly the
*"well-chosen heuristic, honestly presented with its limits"* the brief asks for (L147), and it
gives decision scoring a defensible guard: do not score a decision until both windows have
closed. Late arrivals beyond the horizon should still be **stored and counted separately**, so
the honest answer to "how much revenue did we exclude" exists.

---

### G43 — No correction, retraction, refund or void vocabulary · RW · D

**Brief:** L73: *"Append-only facts."* The union (L77–83) has four positive event types.

**Problem:** Real platforms restate. Conversions get reversed (chargebacks, fraud filters,
returns); spend gets credited back; impressions get invalidated as non-viewable. The contract
has no negation, so a retraction can only be expressed by:

- a negative `value_cents` — not permitted or forbidden (G49), and it would break the
  conversion **count** while fixing the value, since one conversion cannot be un-counted by a
  second row with negative value;
- a conflicting duplicate (G40) — semantically wrong, since a retraction is a *new fact*, not a
  redelivery;
- nothing.

Note this is arguably a **more** common real-world case than late attribution, and the brief
does not mention it. It is the clearest example of the contract being modelled on the happy
path.

**Options**
- A) Out of scope; state it as a tolerated-but-unhandled misbehaviour in the README (which L123
  explicitly invites: *"name in your notes which others your design tolerates and which would
  break it"*).
- B) Add `{ event: "conversion_void"; voids_event_id: string }`. Cleanly append-only, correctly
  decrements both count and value, and reuses the restatement path built for late arrivals.
- C) Permit negative `value_cents` with a convention.

**Recommendation:** A for the slice, B named as the one-event extension that would handle it,
with the observation that B costs almost nothing *once* the restatement machinery for G42 exists
— which is a good argument for building that machinery generically rather than special-casing
lateness. C is rejected: it corrupts the conversion count.

---

### G44 — Clock skew is undetectable · RW · D

**Brief:** L73: *"`ts` is event time, not arrival time."*

**Problem:** `ts` comes from an external system on an external clock. Without arrival time
(G16), skew is invisible, and its two symptoms are indistinguishable from real phenomena:

- A **fast** source clock produces events with `ts` in the future. These land in a period that
  has not begun, inflating a future bucket, and look like nothing at all until that bucket
  arrives.
- A **slow** source clock makes every event look late, which under a lateness horizon (G42)
  means legitimate events get excluded.

**Options** A) accept; assume clock sanity; B) compute skew as `received_at − ts` and clamp
future-dated events to `received_at`; C) reject events with `ts > received_at + tolerance`.

**Recommendation:** B with a data-health counter. Clamping is honest (the event definitely did
not happen after we received it) and preserves the event; rejection loses data over a clock
problem. Requires G16.

---

### G45 — At-least-once is stated for signals but not for decisions · US · C

**Brief:** L73 states the delivery guarantee for signals. L87–100 says nothing about `Decision`.

**Problem:** Presumably decisions are locally originated and exactly-once, but that is an
assumption. If the UI retries a lever after a timeout, a duplicate `decision_id` or a duplicate
*intent* under a new id can land — a second `set_budget` to the same value is harmless, but a
second `swap_component` after the first succeeded is not (its `from_id` is now stale, which
G24's compare-and-swap would catch).

**Recommendation:** Treat decisions as exactly-once with idempotency on `decision_id`
(client-generated), plus G24's compare-and-swap as the real guard. State it. No decision needed
beyond G24.

---

# Pass 5 — Invariants

Invariants the model implies, and whether anything can detect a violation.

---

### G46 — clicks ≤ impressions, conversions ≤ clicks: implied, violable, no tolerance stated · UI · D

**Brief:** L22 defines the funnel. L73 makes delivery unordered.

**Problem:** These are real invariants over the *complete* stream and are legitimately violated
over any *partial* one — a conversion whose click has not arrived (G41) makes conversions exceed
clicks for that window, and it is not an error. CTR > 100% is therefore an expected transient.

The gap is that nothing states the tolerance, so the UI cannot distinguish "normal lateness"
from "our ingest is broken", and neither can a reviewer. A cockpit that shows CTR 140% with no
explanation destroys trust in every other number on the screen.

**Options** A) validate and clamp for display, log the violation; B) show unclamped with an
"unsettled" marker; C) enforce ordering at ingest by parking out-of-order events.

**Recommendation:** B. Clamping hides the very phenomenon the brief wants demonstrated. Showing
CTR 140% *marked as unsettled, with the orphan count next to it* is a much better answer, and it
sets up the traceability walk-through: click the number, see the orphaned conversions.

---

### G47 — Spend ≤ daily budget is implied and enforced nowhere · UI · D

**Brief:** L54: `daily_budget_cents`. No lever or signal references it.

**Problem:** The field's name asserts a cap; nothing in the model enforces one, and no event says
"budget exhausted". A real platform stops serving when the daily budget is spent — which is a
*state change* (effectively paused until the day rolls over) with no representation here.
Combined with G04 (no day boundary), the concept has neither a window nor an enforcer.

The consequence for the simulator is direct: budget must either be a hard cap that stops event
emission (implying an unrepresented paused-by-budget state) or a soft pacing parameter (implying
spend can exceed it).

**Options**
- A) Budget as a **pacing parameter**: it shapes the rate of impressions, and daily spend lands
  near but not exactly on it. Realistic, no new state, mild overspend is normal.
- B) Budget as a **hard cap**: emission stops when the day's spend reaches it. Needs a
  `budget_exhausted` state distinct from `paused`, since the UI must not show "paused by
  strategist".
- C) Ignore; budget is a display value only.

**Recommendation:** A. Pacing is how real delivery behaves, it makes `set_budget` visibly change
the event rate (which is what makes the lever *feel* connected to the world, per L151), and it
avoids inventing a fifth ad state. Overspend tolerance should be stated as a simulator parameter.

---

### G48 — Nothing forbids signals for a non-live ad · UI · D

**Brief:** L125: *"pause `a_12` and its events stop ticking."* L113: *"Performance data starts
flowing the minute an ad is live."*

**Problem:** Both statements are about the world's behaviour, not about the contract, which
happily permits an impression for an `archived` ad. Two consequences:

1. **The core demo is a simulator convention.** "Pause and events stop" — the one closable
   decision the brief requires (L151) — holds only because our simulator chooses to honour it.
   Worth stating plainly rather than implying the model enforces it.
2. **Late events for a paused ad are legitimate and must not be rejected.** A conversion
   attributed to a click from before the pause will arrive *after* the pause. If the ingest
   boundary naively rejects events for non-live ads, it will discard exactly the events the
   brief cares most about. This is a real trap.

**Options** A) accept any event for any known ad, tag out-of-window ones as anomalies;
B) reject events for non-live ads (**breaks late attribution**); C) accept, but only conversions,
for non-live ads.

**Recommendation:** A. Never reject on ad status. Count and surface impressions/clicks arriving
for a paused ad as a data-health signal — under our own simulator they should be zero, so a
non-zero count means a real bug, which makes it a useful self-check.

---

### G49 — No sign constraint on money fields · UI · C

**Brief:** `cost_cents`, `amount_cents`, `value_cents`, `daily_budget_cents`, `from_cents`,
`to_cents` — all bare `number`.

**Problem:** Nothing forbids negatives, and nothing permits them either. Negative values are the
natural encoding for refunds (G43) and for a budget decrease recorded as a delta. Also nothing
constrains them to integers despite the "integer USD cents" comment (L54), so a float can enter
and silently break equality checks in the traceability view — where *"do they agree"* (L143) is
literally the test.

**Recommendation:** Enforce non-negative integers at the ingest boundary and state it; revisit
only if G43's void event is built. Cheap, and it protects the one comparison the brief grades.

---

# Pass 6 — Lifecycle

Every state in every status enum: what transition reaches it, and does a lever exist.

---

### G50 — `Ad.status` has two unreachable states and one unreachable transition · PA · **B** · SPECIFY ★

**Brief:** L49: `status: "draft" | "live" | "paused" | "archived"`. Levers: L97–99.

| State | Path in | Path out |
|---|---|---|
| `draft` | **none** (no create action) | **none** (no launch action) |
| `live` | `resume` (from `paused`) only | `pause` ✔ |
| `paused` | `pause` ✔ | `resume` ✔ |
| `archived` | **none** | **none** |

**Problem:** Only the `live ⇄ paused` cycle is closed. `draft` can neither be entered nor left;
`archived` can neither be entered nor left; and `live` cannot be reached from `draft`, which is
the single most important transition in the product — it is the moment the bet is placed and the
event stream begins. Half of the declared lifecycle is decorative.

This is the same root cause as G33 (no origin for the fold) seen from the state-machine side,
and it makes L42 — *"a live ad's config changes only through levers"* — unsatisfiable in the
one direction that matters: an ad cannot *become* live through a lever.

**Options**
- A) Add `launch` (draft → live) and `archive` (any → archived). Two actions; closes the machine
  if `create_ad` also exists (G33). `archived` should be terminal.
- B) Reduce the enum to `live | paused`, deleting the unreachable states. Honest, and throws
  away the draft concept the Workbench's ad builder needs.
- C) Manage `draft` and `archived` outside the lever system as direct table writes. Fastest;
  contradicts L42 and puts config writes on two paths.

**Recommendation:** A, together with G33 option C (`create_ad` + `launch`). Four actions total
(`create_ad`, `launch`, `archive`, plus the existing three) give a fully closed state machine
where every config write is a lever and every state is reachable — which is a stronger and more
defensible version of the brief's own rule than the brief states. Whether these get built
depends on the slice decision; whether they are *specified* should not.

---

### G51 — Undefined transitions: `pause` on `draft`, `resume` on `live` · US · C

**Problem:** No-op, error, or state change? Compounds G25 (no rejection vocabulary).

**Recommendation:** Reject with a reason and record it (G25 option B). Silent no-ops in an audit
log are worse than errors, because the log then implies something happened that did not.

---

### G52 — `Component` and `Decision` have no status enums at all · MF · D

**Problem:** Cross-reference G12 (component has no lifecycle, so "immutable once live" has no
state) and G25/G36 (decision has no lifecycle, so rejection and human-in-the-loop approval have
nowhere to live). Recorded here so the lifecycle pass is complete across all three types that
could carry state.

**Recommendation:** See G12, G25, G36.

---

# Cross-cutting summary

Four findings are load-bearing enough that most others resolve downstream of them:

| Root | Downstream |
|---|---|
| **G16** no arrival timestamp | G21, G42, G44, G46, decision scoring, as-of views, restatement UI |
| **G33** the fold has no origin | G02, G38, G50, all config-generation work, "recomputable from the log" |
| **G01/G18** no config generation, no component link on events | G37, G38, component-level metrics, late-conversion attribution |
| **G34/G50** lever set does not close the lifecycle | G09, G28, G29, the "compounding" premise |

Blocking findings, for the record: G01, G04, G10, G16, G17, G18, G19, G28, G33, G34, G42, G50.
Each carries a triage tag in its heading — **FIX 6 · SPECIFY 6 · NAME 0**. NAME is empty here by
construction: a blocking finding is one we cannot merely tolerate. The non-blocking register is
where NAME lives (G43, G15, G21, G46, G05, G29), and that set becomes the README's
tolerated-misbehaviours section per L123.

Each of these is carried into `docs/OPEN_QUESTIONS.md` as, or inside, a decision. Nothing in
this document is settled until it appears in `docs/DECISIONS.md`.

---

# Extensions to the given contracts

Owed by `CLAUDE.md` §8 (*"Every schema extension gets an entry. The brief invites extension but
requires it be called out"*) and by brief L40: *"Extend them if your slice needs it (new event
types, new actions, extra fields), and call any extension out in your notes."* Written
2026-09-03, before `docs/DESIGN.md`, and covering the extensions created by the Phase 2 design
pass as well as those ratified earlier.

**This section is the assembly source for the README's extensions section.** Each row names the
finding that justifies it, the decision that ratified it, and where it appears in the model. A
finding is a *problem*; an extension is a *change to the given contract* — the two are recorded
separately on purpose, because the brief asks to be told about the second, not the first.

## What counts as an extension

Three dispositions, and only the first is an extension:

- **Extended** — we added a field, type or variant the brief does not have.
- **Narrowed** — we removed or restricted something the brief declares. *We do none.* `archived`
  was the only candidate and F1 kept it, precisely so this row stays empty.
- **Interpreted** — we fixed a meaning the brief left open without changing its shape (e.g. spend
  as a delta, G19). Listed separately below, because an interpretation can be wrong in a way a
  reviewer should be able to check.

---

## A. Extensions to `Signal`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E1 | `received_at` | `string` — ISO 8601 UTC, **server-assigned at the ingest boundary, never emitter-assigned** | G16 | D12 |
| E2 | `ingest_seq` | `number` — monotonic, server-assigned; total replay order, SSE reconnect cursor, timestamp tie-break | G16, G21, G22 | D12 |
| E3 | `click_id` on the `click` variant | `string`, distinct from `event_id` | G17 | T1 / P2 |
| E15 | `source` | `'backfill' \| 'live'` — **server-assigned from the path the batch arrived on** | D33 conflict (below) | D38 |

**E1 + E2 are the highest-priority extensions in the project.** The asymmetry that makes them
urgent: adding them costs two columns; omitting them costs the data *permanently*, because an event
already ingested can never be given an arrival time afterwards. Everything the brief says it cares
most about in Signal — lateness, restatement, as-of views, the mandatory mid-demo refresh surviving
intact — is a statement about arrival time, and the given contract has no way to express arrival.

**E3** separates the transport dedupe key from the domain foreign key. `event_id` is described at
L73 as a dedupe key for at-least-once delivery; `attributed_click_id` (L81) points at a
`click_id` that exists nowhere in the contract. Under the alternative reading — that
`attributed_click_id` means the click's `event_id` — the same click redelivered under a *different*
`event_id` produces a double-counted click that nothing can detect. E3 makes that failure
representable.

**E15 exists because two ratified decisions could not both hold.** D33 measures the maturity CDF as
`received_at − click.ts` — the *observational* lag. D12 makes `received_at` server-assigned. Seeding
7 days of history in one burst gives every backfilled conversion `received_at ≈ boot`, so the CDF
would have been a picture of the seed loop rather than of conversion lag. The seeder therefore stamps
modelled historical arrival times (it is a fixture writer, not an emitter — `DESIGN.md` §3.2) and
`source` keeps the two populations separable, so the maturity label can disclose the seeded share and
any figure resting on history can be identified as such. Full analysis: `OPEN_QUESTIONS.md` § Wave 6
· D38.

## B. Extensions to `Decision`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E4 | `create_ad` action variant | carries the initial config; the fold's origin | G33, G50 | D5 |
| E5 | `launch` action variant | `draft → live`; the only writer of `launched_at` | G02, G33, G50 | D5 |
| E6 | `decision_seq` | `number` — server-assigned fold order, mirroring E2 | G22, G45 | D21 |

**E4 + E5 exist because L125's central claim is false as written.** *"Current config is derivable:
the initial state folded over the decision log"* names no event that produces the initial state, so
the fold has no origin and nothing is recomputable. E4 supplies the origin; E5 supplies the
transition that L42's *"a live ad's config changes only through levers"* otherwise makes
unreachable. The rule we ended up with is **sharper** than the brief's: config is free while
`draft`, and once `live` only levers touch it.

**Not extended:** `Decision.status`, `approved_by`, a `Recommendation` entity (G25, G36). The
human-in-the-loop flow is cut — `SCOPE.md` §4 cut #6 — so the brief's Background definition of
human-in-the-loop (L28) is unrepresented, named rather than silently absent.

## C. Extensions to `Ad`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E7 | `created_at` | `string` ISO 8601 UTC — `Component` has one, `Ad` does not | G03 | Phase-2 defaults |
| E8 | `name` | `string` — stable human label | G03 | Phase-2 defaults |
| E9 | `current_generation_id` | `string` → `ConfigGeneration` | G01 | D2 |

**E8's justification is specific, not cosmetic:** `ad_id` is the only label the contract offers, and
the alternative — synthesising a display name from the headline component's payload — produces a
name that *changes when the headline is swapped*, which is exactly the moment a strategist most
needs a stable referent.

## D. Extensions to `Component`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E10 | `lineage_id` | `string` — groups every version of one creative | G10 | D3 |
| E11 | `version` | `number` — 1-based within the lineage | G10 | D3 |
| E12 | `parent_id` | `string \| null` — the version this was copied from | G10 | D3 |

**Ratified with a qualification worth repeating here:** no component editor ships (D1 sketches the
Workbench), so nothing *writes* these at runtime. The columns exist and the seed data includes one
lineage with two versions, so the reverse join's "per version or per lineage?" question has a
concrete answer on screen rather than a hypothetical one in prose. Copy-on-write is the position
defended in the README; these three fields are what it would be built on.

## E. New entities the contract does not have

| # | Entity | Why it must exist | Justified by | Ratified by |
|---|---|---|---|---|
| E13 | `ConfigGeneration` | Nothing in the given model names *"the config of `a_12` as of Sunday"*, so a conversion landing Thursday cannot be credited to the creative that earned it | G01, G18 | D2, D14 |
| E14 | `TraceDescriptor` | Hard requirement #5 asks that any number be walked back to its events *and shown to agree*; nothing in the contract lets a number name the query that produced it | L143 | D31 |

**E14 is an extension to the *product*, not to the data contract** — it carries no persisted state
and describes a query, not a fact. It is recorded here because a reviewer reading the wire format
will see a field the brief never mentions, and the honest place to explain it is the same list as
everything else.

## F. Interpretations — the brief's shape kept, its meaning fixed

Not extensions. Each fixes a meaning the brief leaves genuinely open, and each could be wrong in a
way a reviewer should be able to check, so each is stated rather than assumed.

| # | Left open by the brief | Fixed as | Finding | Ratified by |
|---|---|---|---|---|
| I1 | `spend`: delta or cumulative, at what cadence | **Delta**, one tick per live ad per fixed interval | G19 | T1 / P2 |
| I2 | Which day `daily_budget_cents` means | Account-level timezone, **`America/New_York`**; buckets stored UTC | G04 | D22 |
| I3 | What the budget *does* | A **pacing parameter** on the emission rate, not a hard cap; mild overspend is normal and is a stated simulator parameter | G47 | D26 / P11 |
| I4 | When a period is closed | Fixed **72h** lateness horizon, displayed and adjustable | G42 | D13 |
| I5 | Which generation a late conversion credits | The one live at the **attributed click's `ts`** | G01 | D14 |
| I6 | Which time bucket a conversion lands in | The **attributed click's minute** (cohort placement) | — | D27 |
| I7 | Resolution of two deliveries sharing an `event_id` | **First write wins** for the aggregate; every delivery persisted; conflicts surfaced | G40 | D15 |
| I8 | A conversion whose `ad_id` contradicts its click's | The **click** is authoritative; provisional against the conversion's own `ad_id` until resolved | G30, G41 | D16 |
| I9 | `ts` precision and tie-break | Milliseconds; tie-break on `ingest_seq`, then `event_id` lexically | G22 | D12 |
| I10 | Future-dated `ts` (clock skew) | **Clamped** to `received_at`, counted, never rejected | G44 | Phase-2 defaults |
| I11 | Signals arriving for a non-live ad | Never rejected on ad status; counted as a self-check | G48 | Phase-2 defaults |
| I12 | `Decision.ts` | Request time; effects immediate; backdating rejected | G23 | U7 |
| I13 | `from_cents` / `from_id` | A **precondition** (compare-and-swap), not an audit annotation — and with one actor (U2) it is a *staleness* guard, not a concurrency feature | G24, G45 | U2, U5 |
| I14 | `value_cents` | Gross revenue, one conversion kind | G20 | U4 |
| I15 | Money sign | Non-negative integers, enforced at ingest | G49 | U6 |
| I16 | Currency | USD only; no currency field, no FX | G05 | U1 |
| I17 | L117's *"everything on screen is derived from the stream"* | Restated as: every **performance** number derives from the signal stream, every **config** value from the decision log folded over its origin, nothing is hard-coded | G39 | — |
| I18 | L83's *"may land hours or days after its click"* — which lag? | **Two distinct lags.** *Purchase* lag `click.ts → conversion.ts` (the buyer decided later) and *reporting* lag `conversion.ts → received_at` (the platform told us later). `received_at − ts` is the **reporting** lag only; purchase lag is what drives restatement | L83, G16 | D36 |
| I19 | L73 says *"consumers dedupe on `event_id`"* but never says a delivery can arrive **without** one, and `signal_deliveries.event_id` is `NOT NULL` | A delivery with no usable `event_id` (absent, empty, or not a string) is still retained — nothing is silently dropped — keyed as **`(no event_id):<payload_hash>`**. The hash suffix keeps unrelated malformed bodies in separate keys; a bare sentinel would make B55's `trace` present a dozen unrelated deliveries as one event's arrival history. Such a delivery is always `rejected_invalid` and never reaches `signals` | L73 | B05 |
| I20 | Nothing in the brief says when a conversion stops being *"waiting for its click"* and becomes one that will never get one — L83 gives lateness no upper bound | **`orphan_expired` is a READING, not a stored state (D54).** The store holds `resolved` and `orphan_provisional`; expiry is computed at read as `at − (credited_minute + 60 s) > 72 h`, the same arithmetic settlement uses. The row is never deleted, never re-bucketed, and a click arriving after the horizon still promotes it — expiry changes what we say, not what we hold. Storing it would put a clock inside a projection and make `/api/verify` diverge on a correct store | L83, G42 | D54, B19 |

**I18 matters because collapsing the two lags would corrupt our own telemetry.** Ratified in Seno's
words: *"If you collapse them then received_at − ts becomes the purchase lag, which would make our
own transport look like it's hours behind. That field has to describe us, not the buyer."*

**I17 is a correction to the brief, not an interpretation of it.** Taken literally the sentence is
false in the brief's own terms: budget, status, channel, audience and component payloads come from
configs and the decision log, not from the signal stream. The restatement preserves the intent — no
pre-baked arrays behind charts — while surviving contact with the brief's own three-way split.

## G. Declared but unreachable

| Contract element | State | Why | Recorded in |
|---|---|---|---|
| `Ad.status: "archived"` | Kept in the type, reachable by no lever | Unreachable in *our lever set*, not in the domain — the visible shadow of a scope cut, which belongs on the cut line and in the notes rather than encoded into a domain type | F1, `SCOPE.md` §4 cut #3 |
| `Component.kind: "image" \| "body_copy"` | Kept in the type, attachable to no slot | `Ad` has two slots and `Component.kind` declares four; with the Workbench sketched, extending to four slots buys nothing | G06, D23 |

Both are **narrowings we declined to make.** Narrowing a quoted contract needs the same call-out in
the notes for strictly less fidelity, and it makes reinstatement a type change rippling through the
fold, the projections and persisted rows rather than a one-variant change.

---

## H. Contradictions found in our own design documents

Opened at B25/B26. CLAUDE.md §8 asks for *"every underdetermined field, contradiction, missing
identifier, undefined semantic"* — and by phase 5 the document most likely to contradict itself is
no longer the brief but `SIMULATOR.md`, which states 60-odd parameters and derives numbers from
them. Both entries below were found by printing what the code computes and diffing it against the
table it was transcribed from, which is the only reason they were found at all: each would have run
without erroring and been wrong by a constant factor.

`DECISIONS.md` **D56** is a third such contradiction and is *not* here — it needed a decision rather
than a correction, so it went through §3.

---

### H1 — `SIMULATOR.md` §7.1's idle recovery is a half-life in prose and a time constant in the formula · **CORRECTED**

**Spec:** §7.1's model block read `rest : F ← F · exp(−Δt_idle / τ), τ = 5-day half-life`.

**Problem:** The formula and its own annotation are different quantities. `exp(−Δt/τ)` with `τ` =
5 days is a 5-day **time constant** — a half-life of 3.47 days. Read as the words say, `F` halves in
5 days. The two differ by a factor of `ln 2` in the exponent, so a rested creative recovers ~44%
faster under one reading than the other. Nothing observable distinguishes them: both are smooth
exponential decays with the same shape, and the only surface that would ever show the difference is
a paused ad's φ several days later.

**Options:** (a) implement the formula literally, `τ` = 5 d as a time constant; (b) implement the
prose, half-life = 5 d; (c) raise it as a decision.

**What we did — (b), corrected in place, argued rather than assumed.** Four places state the
quantity — §21 (*"recovery half-life τ_rec 5 days"*), D35's ratified rationale (*"idle recovery on a
5-day half-life"*), `CHEATSHEET.md` and `OPEN_QUESTIONS.md` — against one place that states the
notation. A notation slip in one formula does not outweigh the ratified quantity repeated in four,
so this was a transcription error to fix and not an open choice: (c) was rejected on that ground.
§7.1 now reads `F ← F · 2^(−Δt_idle / 5 days)`.

**Where it shows up in code:** `src/sim/fatigue.ts` → `rest()`, with the discrepancy in its
docstring, and `FATIGUE.recoveryHalfLifeMs` in `src/sim/params.ts`. `npm run sim -- --dry-run`
prints the recovery curve for `vl_04 × rt_us` at 0/1/2/5/10/20 days idle, so the half-life is
visible in output rather than asserted in a comment — `f` 17.92 → 8.96 at 5 days.

---

### H2 — `spend` is specified as "CPM accrual plus fees" and no fee parameter exists · **NAMED AS A LIMIT**

**Brief:** L79-80 — *"`spend` — non-click charges (CPM, fees); disjoint from click costs — total
spend = sum of both"*. `SIMULATOR.md` §10 follows it: a `spend` delta carries *"that interval's CPM
accrual plus fees"*, and on the CPC share of a channel's mix, *"`spend` ticks carry fees only"*.

**Problem:** There is no fee parameter anywhere. §21's appendix — which exists so that *"every
constant"* can be inspected — has a CPM base and a CPC base per channel and nothing else. So §10
names a cost component the model cannot compute, and on a 70/30 channel the sentence "spend ticks
carry fees only" describes a tick whose value would be zero.

**Options:** (a) invent a fee — a percentage of spend, or a flat per-mille; (b) model CPM only and
state the omission; (c) raise it as a decision and pick a number.

**What we did — (b).** `CLAUDE.md` §2 and this repo's standing rule are explicit that a missing
constant is a gap to raise and not a number to choose, and the arithmetic already ratified agrees:
**D52's budget baseline** (transcribed in `src/sim/fixtures.ts`) computes each ad's daily cost as
`cpm charge + cpc charge` with no fee term, so every one of the twelve seeded budgets was set
against a fee-free baseline. Inventing a fee now would silently invalidate twelve ratified numbers
and §9's pacing behaviour with them. On the CPC share, a `spend` tick is therefore **not emitted**
rather than emitted as zero.

**Stated limit:** our `spend` is CPM accrual only, so "total spend = click costs + spend" is exactly
right and *"non-click charges"* is narrower in our model than in the brief's parenthesis. Belongs in
the README's honest-limits list beside §20. A fee would be a one-line parameter if it is ever
wanted; it is absent because no ratified number exists, not because it is hard.

**Where it shows up in code:** `src/sim/emit.ts` (B27), at the point the 60-second `spend` delta is
computed.

---

### H3 — §8 gives novelty no slot composition, where §7.1 gives fatigue one · **RESOLVED BY THE DOC'S OWN ARITHMETIC**

**Spec:** §7.1 states fatigue's slot rule explicitly — `φ_ad = φ(f_video)^1.0 · φ(f_headline)^0.5`,
with a ratified reason for the 0.5. §8 states novelty as `ν(age_hours) = 1 + 0.25 · exp(−age/18)`
and says it *"applies to the `(lineage, audience)` pair's first exposure"* — singular pair, no slot
rule. §10's `p_ctr` carries one `ν`. §3 writes it as `ν_novelty(age_ad, version)`, which is a third
description again: the age of the **ad**.

**Problem:** An ad has two slots and therefore two pairs, each with its own first exposure. Three
readings are available and they disagree: ν on the video pair, ν composed over both slots the way
φ is, or ν on the ad's own age. Nothing errors under any of them.

**Options:** (a) video pair only; (b) compose `ν_v^1.0 · ν_h^0.5` by analogy with §7.1; (c) ad age;
(d) raise it as a decision.

**What we did — (a), settled by §8's own worked example rather than by analogy.** §8 quotes `a_07`
at **ν ≈ 1.06**. Its video pair `vl_05 × warm_us` is one day old, giving 1.0659; its headline pair
`hl_06 × warm_us` was first exposed two days ago by `a_11`, so (b) would give 1.0752 and (c) — ad
age of one day — would coincide with (a) here but diverge elsewhere. Only (a) reproduces the quoted
figure while also satisfying §8's other sentence.

**And that other sentence is why the key carries the version and the audience.** §8: a version bump
gets a fresh novelty window, *"a reused pair does not."* So the key is
`(lineage, version, audience)`, not the ad and not the lineage alone — which makes `a_04` the
demonstration: four days old as an ad, launched onto the `vl_01 × cold_us` pool `a_02` had already
been burning for seven, and it receives **no novelty at all**. Under (c) it would receive some.
`ν_novelty(age_ad, version)` in §3 is loose notation for the same thing, since for every other
seeded ad the ad and its video pair are the same age.

**Where it shows up in code:** `src/sim/fatigue.ts` → `noveltyKey()`, `noveltyAgesAtT0()`,
`adNovelty()`, each carrying the reading in its docstring. `npm run sim -- --dry-run` prints the
per-ad table with an `ad age h` column beside `pair age h`, so the two disagreeing for `a_04` is
visible in output rather than asserted in a comment.

**Not resolved here:** whether the headline slot should carry novelty at all. §7.1 argues the
headline wears out *"just slower than video"*, and the symmetric argument would give it a novelty
window too. §8 does not make that argument and we did not make it for them.
