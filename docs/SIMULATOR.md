# SIMULATOR.md

**Phase 3 output.** The mock-data model. Written 2026-09-03, after the Phase 3 decision pass —
every choice below traces to a ratified entry in `docs/DECISIONS.md`; **nothing here is decided by
this document.** Where a number was measured rather than reasoned, the measurement is cited.

**Reading order.** `CLAUDE.md` → `docs/STATUS.md` → `docs/DESIGN.md` → this file. Option analysis
for D35–D40 is `docs/OPEN_QUESTIONS.md` § Wave 6.

**Still no code.** Formulas and parameter tables below are design artifacts. Nothing exists on disk
outside `docs/`.

The brief's standard for this document, quoted rather than recalled:

> *"Your mock data is itself a design artifact. The shape of the performance data you invent — its
> noise, its daily rhythms, its fatigue curves — reveals your model of the domain. We will look at
> it."* (L133)

---

## 1 — Frame, and what the simulator is not allowed to be

**The emitter is never authoritative for anything the app is graded on detecting.** Per **G37
option A**, fatigue is *generated* here as a decay in delivered CTR and *inferred* there from the
event stream. No `fatigue` field, no `fatigue_score` event, no hint. If the app displays a fatigue
signal, it earned it from impressions and clicks.

That rule generalises: the simulator emits only the four `Signal` kinds the brief declares. Every
richer structure in this document — frequency pools, demand factors, lag mixtures — exists to shape
those four event streams and is then **thrown away**. None of it crosses the wire.

### Constraints inherited, not re-decided

| Constraint | Source | What it means here |
|---|---|---|
| Separate process, HTTP batch `POST /api/ingest` | **D32** | The emitter is outside the server. `received_at` measures something |
| Envelope is server-assigned | **D12** | The emitter never sends `received_at` or `ingest_seq`. §15 is the one carve-out, and it is a *seeder*, not an emitter |
| Account timezone `America/New_York` | **D22** | Day boundary for budget; the diurnal curve's clock. All seeded audiences are US, so audience-local **is** account-local (§6) |
| `spend` is a delta per fixed interval | **I1** | §10 fixes the interval at 60 s |
| `click_id` distinct from `event_id` | **E3** | Conversions reference `click_id`; §14 makes both derivable from the seed |
| Budget is a pacing multiplier, not a cap | **I3 / P11** | §9. Overspend tolerance is a stated parameter |
| Pause is honoured by ceasing emission | **G48 / I11** | A *simulator convention*, not a contract property. Ingest never rejects on ad status, and the arrival count for a paused ad is a self-check that should read zero |
| 72 h lateness horizon | **D13** | §11's tail must actually cross it, or P7 is invisible |
| Gate ≥500 impressions / ≥10 conversions per point, ladder capped at hour | **D20** | §18 shows the parameters were chosen against this, not despite it |
| Maturity CDF over settled cohorts, global, shown with sample size | **D33** | §15 is what makes it measurable from frame one |
| Cohort placement: a conversion counts in its click's minute | **D27-B** | §11's lag is therefore what makes buckets restate |

---

## 2 — The seeded world

Reference data is static and seeded once (**U3**); ads exist only because the seeder appends
`create_ad` and `launch` decisions and the fold runs (`DESIGN.md` §3.2).

### 2.1 Components

Five video lineages, six headline lineages. **`vl_04` carries two versions** — the concrete
two-version lineage **D3** requires, so the component screen's "per version or per lineage?" answer
is a real answer on screen.

| Lineage | v | `component_id` | kind | Payload |
|---|---|---|---|---|
| `vl_01` | 1 | `v_01` | video | "Unboxing hook, 15s" |
| `vl_02` | 1 | `v_02` | video | "Founder story, 45s" |
| `vl_03` | 1 | `v_03` | video | "UGC testimonial, 20s" |
| `vl_04` | 1 | `v_04` | video | "Product demo, 30s" |
| `vl_04` | **2** | `v_05` | video | "Product demo, 30s — recut, tighter open" · `parent_id = v_04` |
| `vl_05` | 1 | `v_06` | video | "Before / after, 12s" |
| `hl_01`–`hl_06` | 1 | `h_01`–`h_06` | headline | six copy variants |

Also seeded and **attachable to nothing**: two `image` and two `body_copy` components. `Ad` has two
slots and `Component.kind` declares four (**D23**, G06) — they are in the library so that the
narrowing we declined to make is visible rather than invisible.

### 2.2 Audiences — all US, deliberately

| `audience_id` | `geo` | `temperature` | `est_size` | `served_fraction` | **served pool** |
|---|---|---|---|---|---|
| `cold_us` | US | cold | 2,400,000 | 0.04 | 96,000 |
| `cold_us_lookalike` | US | cold | 900,000 | 0.06 | 54,000 |
| `warm_us` | US | warm | 380,000 | 0.25 | 95,000 |
| `rt_us` | US | retargeting | 46,000 | 0.70 | 32,200 |

**Why all US.** The Phase 3 ask was for a diurnal rhythm *"in the audience's local time, not UTC"*.
**D22** fixed one account timezone and its rationale was *"The audiences are US"*. Keeping every
seeded audience US satisfies both exactly: audience-local **is** account-local, so the curve is in
the audience's own clock and D22 stands unamended. **Stated limit:** a non-US audience would need an
`Audience.tz` field, which we have not added, and its diurnal would otherwise be wrong by its UTC
offset. Named as the extension we did not make, not silently absorbed. It also makes **G05**
(USD-only while `geo` varies) moot for the seeded set rather than tolerated.

**`served_fraction` is the load-bearing column, and it is not in the brief.** See §6.

### 2.3 The portfolio — twelve ads, each carrying a demo moment

Staggered launches (**D39**): three ads have seven days of history, the rest one to six. This cuts
the row count *and* puts ads at different points on their fatigue and novelty curves at one moment,
so the fatigue story is legible in a single screenshot instead of needing a time-travel narrative.

| Ad | Video | Headline | Audience | Channel | Impr/day | Live | What it is there to show |
|---|---|---|---|---|---|---|---|
| `a_01` | `vl_04` v1 | `h_01` | `rt_us` | `meta_feed` | 75,000 | 7 d | **Burned out.** φ_ad = 0.126 (video pair 0.25, headline burned too). Its CPA has fallen *off* D20's gate — the metric you would judge it by stopped being measurable as it died |
| `a_02` | `vl_01` | `h_02` | `cold_us` | `tiktok_feed` | 45,000 | 7 d | High volume; CTR drawable at 15-min. Shares the `vl_01 × cold_us` pool with `a_04` |
| `a_03` | `vl_02` | `h_03` | `warm_us` | `meta_feed` | 22,000 | 7 d | The `swap_component` demo target: mid-volume, mid-fatigue (φ_ad = 0.555, video pair 0.68) |
| `a_04` | `vl_01` | `h_04` | `cold_us` | `meta_reels` | 18,000 | 4 d | **Cross-ad transfer.** Same lineage *and* audience as `a_02`, so both drain one pool |
| `a_05` | `vl_04` **v2** | `h_01` | `rt_us` | `meta_feed` | 26,000 | 2 d | **Copy-on-write made observable.** A recut of the video `a_01` burned, on the same audience — it arrives pre-fatigued |
| `a_06` | `vl_03` | `h_05` | `cold_us_lookalike` | `tiktok_feed` | 14,000 | 3 d | Mid-life, fresh-ish pair (φ_ad = 0.744, video pair 0.82) |
| `a_07` | `vl_05` | `h_06` | `warm_us` | `snap_stories` | 6,000 | 1 d | **Newest.** Novelty at peak, and low enough volume that D20 suppresses its ratios and shows counts |
| `a_08` | `vl_03` | `h_02` | `rt_us` | `meta_reels` | 65,000 | 1 d | **The gate-boundary ad.** Fresh pair on the smallest pool: hourly CPA/ROAS clears at peak (12.0 conv/h) and falls to counts overnight (3.1). The gate visibly binds and unbinds — on a 20% margin, see §18.3 |
| `a_09` | `vl_02` | `h_05` | `cold_us` | `snap_stories` | 5,000 | 3 d | Cheapest CPM, lowest CTR: counts only, at every rung, honestly |
| `a_10` | `vl_05` | `h_03` | `cold_us_lookalike` | `meta_feed` | 16,000 | 6 d | Shares `vl_05` with `a_07` on a *different* audience — the pools stay separate |
| `a_11` | `vl_01` | `h_06` | `warm_us` | `tiktok_feed` | 18,000 | 2 d | **The headline claim.** `vl_01` is burned on `cold_us` (φ = 0.43) and **fresh on `warm_us`** (φ = 0.91) at the same instant — these two are *pair* φ, per §7.2, and unaffected |
| `a_12` | `vl_04` v1 | `h_04` | `cold_us` | `meta_feed` | 20,000 | 7 d | The **pause target** — the brief's own example is *"Pausing `a_12` stops its events"* |

Two of these pairs are the whole argument for **D35-C** and they are readable side by side:
`a_02`/`a_04`/`a_11` share one video across two audiences, and `a_01`/`a_05` share one lineage across
two versions on one audience.

---

## 3 — The arrival process

Impressions are the only primary arrival; clicks, conversions and spend are consequences (§10).
Per ad, per **1-second tick**:

```
λ(ad, t) =  base_impr_per_day(ad) / 86400
          × d_channel(h_local(t))        -- §4  diurnal, account-local, per-channel shape
          × w_dow(weekday(t))            -- §4  day of week
          × ρ_pacing(ad, t)              -- §9  budget as a throttle
          × m_channel(t) × m_ad(t)       -- §12 autocorrelated demand

N(ad, t) ~ NegBinomial(mean = λ, dispersion α = 8)      -- §12
```

Four multiplicative factors and one stochastic draw. **Multiplicative, not additive** — the whole
point of D37 is that variance scales with level, so a quiet ad is proportionally noisy and D20's
gate has something to protect against.

> **`φ_fatigue` and `ν_novelty` are deliberately NOT here — D56, 2026-09-04.** An earlier draft of
> this equation listed both, which contradicted §7.1 (φ is *"the CTR multiplier"*), §10 (both appear
> in `p_ctr`) and §18.3, whose impressions column is `base/24 × d_c` with neither in it. Keeping
> them in both places would charge fatigue twice, as `φ²` on clicks. **Fatigue and novelty change
> what an impression is worth, never how many arrive.** The budget lever still burns a creative
> faster, through `ρ_pacing` → impressions → `F`. The alternative was rejected because §19's fatigue
> flag reads fatigue as falling EWMA CTR, so a model that moved delivery instead of click-through
> would leave that flag unable to ever fire.

A paused ad emits nothing: `λ = 0` while `status ≠ 'live'`. That is §1's stated convention, not a
property ingest enforces.

---

## 4 — Diurnal rhythm and day of week

### 4.1 Diurnal — two peaks, and the channel changes the *shape*

Social traffic has a midday peak and an evening prime-time peak, and their relative size differs by
platform. So the channel modulates the shape of the day, not merely its level:

```
d_c(h) = [ 0.30 + w1_c · exp(−(h−13.0)² / (2·3.2²))
                + w2_c · exp(−(h−20.5)² / (2·2.0²)) ] / Z_c
```

`h` = fractional hour in **`America/New_York`** (D22), computed with built-in `Intl`. `Z_c`
normalises each curve to mean 1.0 over 24 h, so `base_impr_per_day` means what it says.

| Channel | `w1` midday | `w2` evening | `Z` | Peak / trough | Swing |
|---|---|---|---|---|---|
| `meta_feed` | 0.85 | 0.45 | 0.6719 | 1.71 @ 13:00 / 0.45 @ 00:00 | 3.83× |
| `meta_reels` | 0.45 | 0.85 | 0.6164 | 1.89 @ 20:00 / 0.49 @ 00:00 | 3.88× |
| `tiktok_feed` | 0.35 | 1.05 | 0.6220 | 2.17 @ 20:00 / 0.48 @ 00:00 | 4.50× |
| `snap_stories` | 0.30 | 1.00 | 0.5956 | 2.18 @ 20:00 / 0.50 @ 00:00 | 4.32× |

Two corrections to this table, found at B25 by printing the curve rather than trusting it. The
trough is at **00:00, not 02:00** — the value 0.45 was right, but neither Gaussian wraps around
midnight, so the minimum over the 24 integer hours is the hour furthest from both peaks, which is
the first one. And TikTok's swing is **4.50×, not the 4.8×** the paragraph below once claimed:
2.17 / 0.48 by this table's own constants. Neither changes a parameter.

Hourly multipliers, `meta_feed` (midday-weighted) and `tiktok_feed` (evening-weighted), hours 00→23:

```
meta_feed    0.45 0.45 0.45 0.46 0.47 0.50 0.56 0.66 0.82 1.03 1.26 1.49
             1.65 1.71 1.65 1.50 1.32 1.17 1.13 1.17 1.21 1.15 0.98 0.76
tiktok_feed  0.48 0.48 0.48 0.49 0.49 0.51 0.53 0.58 0.65 0.74 0.84 0.95
             1.02 1.05 1.03 0.98 0.98 1.10 1.42 1.85 2.17 2.14 1.77 1.26
```

The 4.50× peak-to-trough swing on TikTok is what makes D20's granularity ladder *step during the
day* rather than sitting on one rung — §18.

### 4.2 Day of week — two separate effects, because they are two phenomena

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| Volume `w_dow` | 0.96 | 1.00 | 1.02 | 1.03 | 0.98 | 0.88 | 0.93 |
| CVR multiplier | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **0.90** | **0.90** |
| Order-value multiplier | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **1.05** | **1.05** |

Weekends are quieter *and* browsier: fewer people convert, and those who do spend slightly more.
Collapsing these into one volume curve would lose the second effect, which is the one that shows up
in ROAS rather than in impressions.

---

## 5 — Channel differences

| Channel | CTR mult | CVR mult | Pricing mix (CPC / CPM) | CPM base | CPC base |
|---|---|---|---|---|---|
| `meta_feed` | 1.00 | 1.00 | 70 / 30 | $6.50 | $0.62 |
| `meta_reels` | 0.85 | 0.90 | 50 / 50 | $5.20 | $0.48 |
| `tiktok_feed` | 1.20 | 0.75 | 30 / 70 | $4.10 | $0.35 |
| `snap_stories` | 0.70 | 0.65 | 20 / 80 | $3.40 | $0.30 |

TikTok earns clicks and does not convert them; Meta feed converts. Snap is cheap and weak on both.

**The pricing mix is what makes the brief's two cost paths both real.** L79-80 keeps them disjoint:
*"`spend` — non-click charges (CPM, fees); disjoint from click costs — total spend = sum of both"*.
So the mix decides where an ad's cost arrives from:

- On the **CPC share**, each click carries `cost_cents` drawn per §12; `spend` ticks carry fees only.
- On the **CPM share**, cost accrues as `impressions × CPM / 1000`, accumulates within the minute and
  is emitted as a `spend` delta; those impressions' clicks carry `cost_cents = 0`.

A 20/80 channel therefore exercises the `spend` path almost exclusively and a 70/30 channel the click
path — both are live in the same demo, and *total spend* is only ever a read-time sum of the two
(D10), never a third stored column.

---

## 6 — Audience temperature, and the pool that actually matters

| Temperature | CTR base | CVR | CPC mult | Order value (median) | `p_fast` (§11) |
|---|---|---|---|---|---|
| `cold` | 1.1% | 1.8% | 0.85 | $42 | 0.30 |
| `warm` | 2.4% | 5.5% | 1.00 | $58 | 0.45 |
| `retargeting` | 4.2% | 15.0% | 1.35 | $76 | 0.65 |

Retargeting costs more per click and is worth it; cold is cheap and converts badly. Order value rises
with intent. `p_fast` is the mixture weight in the conversion-lag model, so **temperature also sets
how fast a cohort matures** — §11.

**There is no decay-rate column.** The fatigue constant `k` is global; the *pool* does the work
(§7), so retargeting burns out roughly 50× faster than cold as a consequence of the model rather
than as a parameter anyone can dispute.

### `served_fraction` — the correction the arithmetic forced (ratified)

**This parameter replaced a wrong one during calibration and the story is worth keeping.** The first
model divided cumulative impressions by a *reachable fraction* of `est_size` (0.55 for cold). At
that pool size, `a_02` on `cold_us` reaches **φ = 0.94 after seven days** — a 6% CTR decline. That
is not a fatigue curve, and the brief says the fatigue curves will be looked at.

The error was modelling the pool as "people the targeting allows" when the quantity that governs
frequency is **"people the platform actually serves us at our bid"**. Delivery concentrates hard on
the responsive slice: a broad cold audience of 2.4M is served through a window of tens of thousands.
That is why frequency in real campaigns climbs far faster than audience size suggests, and why
retargeting — where the pool is *intentionally* exhausted — burns out first.

| | Old (`reachable_fraction`) | **New (`served_fraction`)** | φ for `a_02` at 7 d |
|---|---|---|---|
| `cold` | 0.55 | **0.04** | 0.94 → **0.43** |
| `warm` | 0.70 | **0.25** | — |
| `retargeting` | 0.85 | **0.70** | — |

**RATIFIED** 2026-09-03 (Seno: *"Both approved"*). `served_fraction` at 0.04 / 0.06 / 0.25 / 0.70
replaces the reachable-fraction column of the D35 pass. It is a parameter inside D35's ratified
frame — frequency-driven, keyed by lineage × audience, `k` = 0.35 — so the decision is unchanged;
only the denominator moved. Recorded in `DECISIONS.md` § D35 parameter ratification.

---

## 7 — Creative fatigue

**Decision D35, option C: fatigue accrues to the `(component lineage × audience)` pair.**
Frequency-driven, with recovery. This is the centre of the document.

### 7.1 The model

```
F(L, A)   = Σ impressions of lineage L delivered to audience A, over EVERY ad that used the pair
pool(A)   = est_size(A) × served_fraction(A)                         -- §6
f(L, A)   = F(L, A) / pool(A)                                        -- effective frequency
φ(f)      = 0.25 + 0.75 · exp(−0.35 · f)                             -- CTR multiplier
rest      : F ← F · 2^(−Δt_idle / 5 days)                            -- a rested creative recovers
per ad    : φ_ad = φ(f_video)^1.0 · φ(f_headline)^0.5
```

| `f` (exposures per served person) | 0 | 1 | 2 | 3 | 5 | 8 | 12 |
|---|---|---|---|---|---|---|---|
| **φ** | 1.00 | 0.78 | 0.62 | 0.51 | 0.38 | 0.30 | 0.26 |

**Why frequency and not calendar.** Calendar decay says an audience tires of an ad it is not being
shown — which is wrong, and would quietly undermine the pause demo by continuing to burn a paused
ad. Frequency also makes `set_budget` a *fatigue* lever: double the budget and you burn the creative
twice as fast. That tension is a real strategic property, and it is free.

**Why the headline carries 0.5 and not 0.** Ratified in Seno's words: *"Copy does wear out, just
slower than video, and zeroing it would mean the headline swap lever changes nothing observable."*

**The floor is 0.25, not 0.** A burned-out creative still gets clicked occasionally. A floor of zero
would make a fatigued ad emit no clicks at all, which is both wrong and would make its CTR
undefined rather than bad.

**The recovery line is written as a half-life, corrected at B26.** It previously read
`F ← F · exp(−Δt_idle/τ)` with `τ = 5-day half-life`, which as a formula is a 5-day *time constant*
— a half-life of 3.47 d, and a different number. §21, D35's ratified rationale, `CHEATSHEET.md` and
`BRIEF_GAPS.md` all state a **5-day half-life**, so the notation was the error and `2^(−Δt/5 d)` is
what is implemented. `BRIEF_GAPS.md` §S carries the entry.

### 7.2 What this buys, in the seeded data

Pools are shared across ads, so the trajectories interact. Measured over the seeded portfolio:

| Pair | Served pool | Cumulative impr | `f` | **φ** |
|---|---|---|---|---|
| `vl_04 × rt_us` (`a_01` + `a_05`) | 32,200 | 577,000 | 17.92 | **0.25** ← floored |
| `vl_03 × rt_us` (`a_08`, 1 day old) | 32,200 | 65,000 | 2.02 | **0.62** |
| `vl_01 × cold_us` (`a_02` + `a_04`) | 96,000 | 387,000 | 4.03 | **0.43** |
| **`vl_01 × warm_us`** (`a_11`) | 95,000 | 36,000 | 0.38 | **0.91** |
| `vl_02 × warm_us` (`a_03`) | 95,000 | 154,000 | 1.62 | 0.68 |
| `vl_05 × warm_us` (`a_07`, newest) | 95,000 | 6,000 | 0.06 | 0.98 |

Three claims the brief asks about are now facts about the data rather than sentences in a README:

1. **The same video is burned on one audience and fresh on another, simultaneously.** `vl_01` is at
   φ 0.43 on `cold_us` and φ 0.91 on `warm_us`. `a_11` launched two days ago into a fresh pool; if
   it had launched onto `cold_us` it would have arrived at φ 0.43.
2. **Reuse accelerates burnout.** `a_02` alone would sit at φ 0.49 after seven days; sharing the pool
   with `a_04` puts it at 0.43. Nothing in the ad's own config explains the difference — only the
   component's history does, which is exactly **D4**'s *"you decide on ads, you learn about
   components"*.
3. **A swap resets one slot only.** Swapping `a_03`'s video moves it to a different lineage's pool
   and leaves the headline's frequency untouched, so the CTR discontinuity is explained by
   `config_generations` and by nothing else — which is what makes `DESIGN.md` §8's temporal reverse
   join worth having.

### 7.3 A new version is not a new creative

`a_05` runs `vl_04` **v2** — a recut of the video `a_01` burned — on the same audience. Accrual is
keyed by *lineage*, so v2 inherits v1's frequency. That is the domain truth: a re-edit is not new to
someone who has seen the original four times. But it is not *nothing* either, so a version bump
grants a partial reset:

```
f_effective(new version) = f(lineage, audience) × (1 − r),   r = 0.35
```

**RATIFIED** 2026-09-03 (Seno: *"Both approved"*). `r` = 0.35 — a recut recovers about a third of
the pool's freshness. Recorded in `DECISIONS.md` § D35 parameter ratification.

This is a **bonus that D3 did not expect.** D3's entry states plainly that copy-on-write ships as a
position defended in prose because *"nothing exercises this at runtime."* Under D35-C something
does: `a_01` and `a_05` are the same lineage, two versions, one audience, and v2 arrives at φ 0.25
rather than 1.00. The versioning decision now has an observable consequence in the data even though
no editor ships.

---

## 8 — Novelty at launch — yes, it is real

```
ν(age_hours) = 1 + 0.25 · exp(−age_hours / 18)
```

+25% CTR in the first minutes, decaying with an 18-hour time constant; ~4% left after two days.

Modelled as a **CTR effect only, not a delivery boost** — parsimony, and stated as a simplification
because platforms do also favour new creative during the learning phase, which would be a *volume*
term. Novelty applies to the `(lineage, audience)` pair's first exposure, so a version bump gets a
fresh novelty window as well as §7.3's partial reset; a *reused* pair does not.

`a_07` (one day old) carries ν ≈ 1.06 and φ 0.98; `a_01` carries ν = 1.00 and φ 0.25. The two ends of
a creative's life are on screen at the same moment.

---

## 9 — Budget pacing: throttle, never cliff

**Budget is a pacing multiplier, not a cap** (**I3**, **P11**). No fifth ad state is invented; there
is no `budget_exhausted`.

Real pacers pace against the *expected shape of the day*, not linearly — otherwise every ad
front-loads its budget into the morning and goes dark before prime time. So:

```
e(t) = ∫ d_c dt from day start to t  /  ∫ d_c dt over the whole day     -- expected traffic elapsed
a(t) = spend_so_far_today / daily_budget_cents                          -- actual budget consumed

ρ_catchup  = clamp(1 + 3.0 · (e − a),  0.05, 1.0)      -- ahead of pace: throttle. NEVER boosts.
ρ_terminal = clamp((1.05 − a) / 0.15,  0, 1)           -- the taper into the cap
ρ_pacing   = ρ_catchup × ρ_terminal
```

**`ρ_catchup`'s ceiling is 1.0, not 1.6 — amended in place by D59 (2026-09-04, at B32), with the
reason rather than the value alone.** The 1.6 ceiling assumed an ad is *delivery-limited by
pacing*: speed it up and the inventory is there. **Ours are demand-limited.** §3's λ is exogenous
and has no auction-supply ceiling, so a boost manufactures impressions this model says do not
exist — and it does so permanently, because D52's budgets are deliberately generous and the
baselines behind them were computed at `φ = ν = 1` while a fatigued world spends far less.

Measured at B32 before the amendment, over a 24 h dry run of the seeded portfolio: every ad sat
**on** the 1.6 clamp (ρ_catchup's clamps bind at a pace gap of ±0.2, and every ad was 20+ points
behind all day) and delivered **1.19×–1.47× §2.3's stated `Impr/day`**. `a_08`, the ad D52 placed
near its cap so the taper would be visible, spent **0.1%** of ticks in the taper. D52's conclusion
— *"Ten sit ~25% above their baseline, so §9's pacing is inert for them"* — was false as written:
pacing was not inert, it was pinned. With the ceiling at 1.0 it is true.

What the amendment costs is stated too: an ad that underspends its budget is no longer accelerated
to hit it, so §9 no longer models catch-up in the upward direction. Everything else in this section
is untouched — `ρ_catchup` still throttles an ad running ahead of its channel's shape of the day,
the taper still tapers, and the +5% tolerance is unchanged.

| `a` (on pace, `e` = `a`) | 0.50 | 0.85 | 0.90 | 0.95 | 1.00 | 1.05 |
|---|---|---|---|---|---|---|
| `ρ_terminal` | 1.00 | 1.00 | 1.00 | 0.67 | 0.33 | **0.00** |

Delivery is unaffected until 90% of budget, then slides to zero at **105%**. **Overspend tolerance
+5%**, stated — real platforms overspend slightly and a simulator that lands exactly on the number
would be the tell. `a` resets at midnight `America/New_York` (**D22**), and because `e` resets with
it, the rollover produces no discontinuity — which is the artifact D22 was chosen to avoid.

`set_budget` moves `a` instantly, so `ρ` changes within one tick: **raise the budget and the event
rate visibly rises inside a second.** That is the second closable decision the loop needed (D26
consequence 3), and it rides the rate curve the simulator needs anyway.

---

## 10 — Clicks, conversions, value, spend

```
p_ctr(minute)  ~ Beta(p̄_ctr·κ, (1−p̄_ctr)·κ),  κ = 200     -- ONCE PER MINUTE  [D57]
clicks(t)      ~ Binomial(N(t), p_ctr(minute))             -- so the MINUTE is BetaBinomial
p̄_ctr          = ctr_base(temperature) × ctr_mult(channel) × φ_ad × ν
conversions    ~ Bernoulli(p_cvr) PER CLICK, keyed by click_id           [D62]
p_cvr          = cvr(temperature) × cvr_mult(channel) × dow_cvr
order value    ~ LogNormal(median = order_value(temperature) × dow_aov, σ = 0.6)
```

> **The click rate is drawn per minute, not per tick — D57, 2026-09-04.** This block previously read
> `clicks(t) ~ BetaBinomial(N(t), p_ctr, κ = 200)`, and **κ had no effect whatsoever**: the
> overdispersion of a BetaBinomial enters through `(N−1)/(κ+1)`, which is exactly zero at `N = 1`,
> and per-tick `N` across the portfolio is 0–3. §12's *"the rate is uncertain, not just the count"*
> was a property of this document and not of the data.
>
> Drawing `p` once per minute and taking `Binomial(N(t), p)` on each of the minute's ticks makes a
> minute's clicks **exactly** `BetaBinomial(N_minute, p̄_ctr, κ)` — the distribution named here, at
> the granularity **D28** buckets and **D20** gates on — while keeping each click emitted in the
> same second as the impression that produced it. The minute is `DEMAND.stepMs`, the same grid D57
> ratified for §12's demand factors.
>
> **`κ = 60` for conversions is GONE, and the reason is §15.3(b) rather than the parameter — D62
> (2026-09-04, at B34).** It was already inert: a conversion draw is over one tick's *clicks*, which
> is 0–1 and stays 0–1 over a minute, so the urn's `(N−1)/(κ+1)` was exactly zero. What forced the
> change is the **handover contract**. §15.3(b) promises the pending-conversion queue is *derivable,
> not stored* — the emitter re-derives a backfilled click's schedule from
> `hash(seed, 'conv_lag', click_id)`. That covers the **lag**. It did not cover **whether the click
> converts at all**, because a BetaBinomial over the tick's clicks needs the tick's click count and
> the click's index within it, and a handed-over `click_id` carries neither.
>
> `Bernoulli(p_cvr)` keyed by `click_id` alone makes a bare `click_id` sufficient, which is what
> §15.3(b) says it already was. Nothing measurable is lost — the urn it replaces did nothing at
> N = 0–1 — and the same move was made on the click side by D57, in the opposite direction: there a
> dead κ was made real, here a dead κ is removed. Cohort-rate uncertainty on conversions remains
> unmodelled and is still a stated limit.

- Every click mints a **`click_id`** distinct from its `event_id` (**E3**), derived from the keyed
  RNG (§14) so it is reproducible and so a conversion can reference it before it is emitted.
- **Fatigue and novelty touch CTR only, never CVR.** Someone tired of an ad clicks less; the ones who
  still click want the product just as much. Stating it because the alternative is defensible and we
  did not take it.
- `spend` is emitted as a **delta per 60-second interval per live ad** (**I1**), carrying that
  interval's CPM accrual plus fees. Sixty seconds rather than five minutes so that minute buckets
  have a spend figure of their own; the cost is ~73k of the seed's rows (§18).
- Conversions are **not** emitted at click time — they are *scheduled* (§11).

---

## 11 — The conversion lag

**Decision D36: a two-component mixture, plus a separate reporting lag.**

### 11.1 Two lags, kept apart

```
purchase lag   click.ts → conversion.ts        the human decided later
reporting lag  conversion.ts → received_at     the platform told us later
```

L83 conflates them — *"may land hours or days after its click"*. Splitting them is **interpretation
I18** in the extension register, not a change to the contract's shape.

Ratified in Seno's words: *"If you collapse them then `received_at − ts` becomes the purchase lag,
which would make our own transport look like it's hours behind. That field has to describe us, not
the buyer."*

```
purchase lag =  with prob p_fast(temperature):  Exponential(mean 12 min)
                otherwise:                      LogNormal(median 14 h, σ = 1.1)
                truncated hard at 7 days -- nothing is emitted beyond it

reporting lag = LogNormal(median 90 s, σ = 0.9)
                + with prob 0.02: a batch straggler, Uniform(2 h, 9 h)
```

`p_fast` is a **property of audience temperature** (§6) — 0.65 retargeting, 0.45 warm, 0.30 cold —
so the mixture weight carries domain meaning instead of being a fitted knob.

### 11.2 What that yields, per temperature

| Temperature | Median | p95 | Hard cutoff | **Share past the 72 h horizon** |
|---|---|---|---|---|
| `retargeting` | **0.3 h** | 1.87 d | 7 d | **2.3%** |
| `warm` | **3.3 h** | 2.49 d | 7 d | **3.6%** |
| `cold` | **7.5 h** | 2.85 d | 7 d | **4.6%** |

That is the product consequence **D27** insisted on stating: a retargeting ad's ROAS is readable
within the hour; a cold ad's takes most of a day; and 2–5% of every cohort lands after we said the
period was closed. p95 sits *inside* the horizon, so headline numbers mean something; the tail
crosses it, so **P7's restatement path fires on real data rather than only on a scenario trigger**.

### 11.3 Why this is what makes the flagship path demonstrable

Purchase lag decides whether a bucket is **settled** when the event lands, so purchase lag is what
drives restatement. Reporting lag is small and is what `received_at − ts` actually measures. Under
**D27-B** the conversion lands in its *click's* minute — up to seven days back — so a late arrival
rewrites a bucket that has been on screen, settled, for days. That is the brief's own sentence
(L83) describing what our system does, rather than something we say it would do.

---

## 12 — Noise, and where the overdispersion comes from

**Decision D37: negative-binomial counts modulated by two autocorrelated demand factors, with
overdispersed rates on top.** Six stochastic components; each is attached to the quantity it should
perturb, and each has a stated source.

| Component | Form | What it is a picture of |
|---|---|---|
| Channel demand `m_channel(t)` | log-AR(1), τ = 45 min, stationary sd 0.18 | platform-wide traffic and auction pressure — **moves every ad on that channel together** |
| Ad delivery `m_ad(t)` | log-AR(1), τ = 20 min, sd 0.25 | platform-side creative rotation, idiosyncratic per ad |
| Impression counts | `NegBinomial(λ, α = 8)` → `Var/mean = 1 + λ/α` | overdispersion **grows with volume**, the empirical signature of served traffic |
| Click rate | `Beta(κ = 200)` **once per minute**, then `Binomial` per tick (**D57**) | audience composition drift — the *rate* is uncertain, not just the count, and per minute that is now true of the data as well |
| Conversion rate | `BetaBinomial(κ = 60)` | the same, and thinner, so cohort ratios are the noisy ones |
| CPC | `LogNormal(σ = 0.35) × m_channel^0.6` | **competition raises price and volume pressure together** |

AR(1) in log space: `log m(t) = ρ · log m(t−Δ) + ε`, with `ρ = exp(−Δ/τ)` and `ε` scaled to hold the
stationary standard deviation.

**Why two AR(1) processes and not one.** Ratified in Seno's words: *"channel-level moves ads
together, ad-level is idiosyncratic, and the fact that you can't immediately tell which one you're
looking at is a real property of the domain — it's also the honest basis for the fatigue flag's
'can't separate this from a platform delivery change' limit."* Recorded fallback, per the same
answer: **if implementation drags, collapse to one and say so.**

**Why not uniform jitter on a smooth curve.** It is detectable in one glance: the mean is a visible
spline, and the residuals have no volume dependence, no persistence and no source. The brief warns
about it because it is the standard tell.

**What the autocorrelation buys on the read side.** Because bursts *persist*, EWMA smoothing has a
real lag-versus-variance tradeoff instead of a free lunch — which is what lets §19 state its limits
honestly rather than hypothetically. It also makes the ingest backpressure path (`DESIGN.md` §11)
reachable without a scenario trigger.

---

## 13 — Injected misbehaviours

Cross-referenced against `DESIGN.md` §6, so **every injected fault has a named handler and every
handler has something that triggers it**. Rates are per event unless stated.

| Injected | Rate | Handled by |
|---|---|---|
| Duplicate delivery, identical payload | 0.8%, re-sent 1–20 s later | D15 — `duplicate_identical` |
| Duplicate delivery, **conflicting** payload | 0.05%, `value_cents` perturbed | D15 / I7 — first write wins, conflict retained |
| Out-of-order, short | 3% held back one batch (~1 s) | D12 — `ingest_seq` supplies the order |
| Out-of-order, long | 0.3% held 30–120 s | D12 |
| Orphan — click withheld, then released | 0.4% of clicks delayed past their conversion | D16 — provisional → promoted, a two-bucket restatement |
| Orphan — click never delivered | 0.6% of clicks dropped *after* their conversion is scheduled | D16 — `orphan_expired` past the horizon |
| Malformed payload | 0.1% — negative money or a missing variant field | `rejected_invalid`, raw body retained |
| Clock skew, future-dated `ts` | 0.2%, +5–90 s | I10 — clamped by the generated column, both values kept |
| Same click under two `event_id`s | 0.05% | E3 — the partial unique index detects it |
| **Emitter-side event loss** | **0.2%, dropped silently** | **G21 — nothing. Injected deliberately so that the one failure we cannot see is actually present in the data rather than hypothetical** |
| Late conversion past 72 h | **2.3–4.6%, emergent from §11 — not injected** | D13 / P7 |

Three deliberate **non**-injections, stated so the table cannot be misread as complete:

- **Signals for a non-live ad.** Not injected. Under **I11** ingest never rejects on ad status and
  counts these as a self-check that *should read zero* under our own simulator; injecting them would
  destroy the only check we have on §1's pause convention. Reachable on demand via `scenario: stall`
  and a pause, if a reviewer wants to see the counter move.
- **Retraction / refund / void.** Not injected — unrepresentable by the contract (**D25**, G43), and
  named as *breaking* rather than tolerated.
- **Burst, gap, stall.** Scenario-triggered only (§17), because their interesting behaviour is a
  demo moment rather than a background rate.

---

## 14 — Determinism

**Seeded, and keyed rather than sequential.** Every random draw is:

```
u = splitmix64( hash(seed, stream_name, entity_id, tick_index) ) / 2^53
```

Streams are named: `impr`, `ctr`, `cvr`, `value`, `cpc`, `conv_lag`, `report_lag`, `dup`, `reorder`,
`orphan`, `skew`, `loss`, `m_channel`, `m_ad`. Ids are derived the same way, so
`event_id = hash(seed, 'eid', ad_id, tick, i)` and `click_id = hash(seed, 'cid', …)`.

**Why keyed and not a sequential PRNG.** A sequential stream means pausing one ad shifts every
subsequent draw for every other ad, so an intervention reshuffles the entire world. Keyed draws are
addressed, so the unaffected part of the world stays identical across a forked run.

Two properties fall out that are worth more than they cost:

1. **Restart safety is free.** Event ids are derived, so a re-emission after a restart carries the
   same `event_id` and is classified `duplicate_identical` — tolerated, counted, and visible. The
   simulator does not need to remember what it has already sent.
2. **The pending-conversion queue is derivable, not stored.** §15's handover depends on it.

### The limit, stated rather than discovered

**A seed does not reproduce the world.** Levers change delivery, so the moment a human pauses an ad
the world forks. The honest claim, ratified in Seno's words as *"the better claim … I'd rather make
the true one"*:

```
(seed + decision log + scenario log)  →  world
```

All three are persisted — the decision log by **D7**, the scenario log by **D40**, and **the seed
by D60** (2026-09-04, at B34: a one-row table written by the seeder at `T0` and served in
`GET /api/sim/world`, so the emitter has no seed of its own and cannot continue a history under a
seed that history was not generated with) — so replaying a
specific interesting moment is genuinely possible. That is a stronger claim than seed-only
determinism, and unlike seed-only determinism it is true.

---

## 15 — Time, backfill, and the seed path

### 15.1 Live emission runs at 1× real time

Not a compromise — **the only rate at which the envelope means anything.** An accelerated live clock
would advance `ts` faster than the wall clock, so I10's skew clamp would fire on nearly every event
and `received_at − ts` would be a measurement of our acceleration factor. Tick = **1 second**, one
batched `POST /api/ingest` per tick (**D32**). Portfolio-wide that is ~3 events/sec average, peaking
~8 — quiet enough that a burst is visible, dense enough to read as live.

### 15.2 Backfill: 7 days, seeded in-process

Generated at first boot by the **seeder**, in-process, through the same `ingest()` function — one
writer of `ingest_seq`, which is the ownership argument **D32** was ratified on. `DESIGN.md` §3.2
already establishes the seeder as a privileged fixture writer (it writes `components`, `audiences`
and the `create_ad` / `launch` decisions directly). **Depth 7 days**, with **5 days as the stated
fallback lever**; both exceed the 72 h horizon, so settlement behaviour is unchanged either way.

### 15.3 The three things D38 fixed

**Decision D38, options E + B.** The seeder stamps `received_at = ts + reporting lag` on historical
rows; the ingest envelope carries a server-assigned `source: 'backfill' | 'live'` (**E15**).

**(a) Why arrival times had to be stamped at all.** D33 measures the maturity CDF as
`received_at − click.ts`, deliberately the *observational* lag. If 7 days of history were ingested
in one burst, every backfilled conversion would carry `received_at ≈ boot` and the CDF would be a
picture of the seed loop — spread near-uniformly across 7 days. `DESIGN.md` §4.5 relies on exactly
that population, so the indicator would have shipped wrong and read plausible.

**(b) The seed is sorted by `received_at` before writing.** Otherwise `ingest_seq` tracks *emission*
order and `as_of_ingest_seq` cannot reconstruct a past screen for the seeded window. One sort of
~1.6M rows. And anything whose computed `received_at` falls **after** the seed boundary `T0` is
**not** seeded — it is handed to the live emitter and delivered at its real arrival moment. So
`ingest_seq` is monotone in `received_at` across the seam as well as within the seed, and *"the
conversions that were in flight when you started the app"* becomes a real population rather than a
manufactured one. §14's keyed RNG is what makes this free: the emitter re-derives each backfilled
click's schedule from `hash(seed, 'conv_lag', click_id)` instead of needing a stored queue.

**(c) Settlement is evaluated at `ev.received_at`, not at `now`.** `DESIGN.md` §5.4's pseudocode
reads `now − (minute_start + 60s) > horizon`. During seeding `now` is boot time, so **every**
backfilled event landing in a bucket older than 72 h would be stamped `restated_at` — the demo would
open with tens of thousands of spurious restatements and P7 would look broken on frame one. The
correct rule is *"was this bucket settled **when this event arrived**"*, which is what the corrected
form says. For live events `received_at ≈ now`, so nothing changes; for seeded events it is the
difference between an honest history and a fabricated one. **This is a correction to `DESIGN.md`
§5.4** — recorded in §22.

### 15.4 Backfilled and live are distinguishable, and the label says so

The `source` marker earns its column beyond the CDF: *"is this number resting on seeded or observed
data"* is a question a reviewer will ask about more than one figure. D33's sample-size label
therefore discloses the split — **"68% mature · measured over 1,432 settled conversions (1,180
seeded)"**.

**The residual limit, stated rather than left looking like it works.** Within the seeded window
`received_at` is *designed*, not observed. So `as_of_ingest_seq` reconstructs what the screen **would
have shown under the seeded arrival model** — not what anyone actually saw, because nobody was
watching. Live arrivals carry no such caveat. Goes in `DESIGN.md` §10.3 and in the README.

**Side effect worth having.** With 2–5% of conversions arriving past the horizon under seeded arrival
times, a handful of backfilled buckets legitimately carry `restated_at` **from frame one**. That
refines **F2**'s arithmetic — which said no restatement is observable at the default horizon.
Historical restatements are now visible immediately; **P16** remains the only way to cause one
*live*, and `scenario: late_cascade` (§17) the only way to cause one *on demand*.

---

## 16 — State and config sync

**Decision D40, options A + X.** The simulator holds **no durable state of its own**, which is what
`DESIGN.md` §3.3 promised and this section is what makes true.

**`GET /api/sim/world`**, polled once per tick, returns in one read transaction:

| Field | Why the emitter needs it |
|---|---|
| The 12 `ads` rows — status, budget, slots, audience, channel | levers change delivery; a pause must stop emission |
| `last_decision_seq` | so a change is detectable without diffing |
| `F(lineage, audience)` — cumulative impressions per pair | §7's accrual, recomputed from the signal log |
| `spend_so_far_today` per ad, account-local day | §9's pacing term |
| Backfilled clicks still inside the 7-day lag window | §15.3(b)'s pending-conversion re-derivation |
| Pending scenario triggers | §17, so there is no second control channel |
| **The world seed** (**D60**) | §14's first term. The emitter holds no seed of its own, so it cannot disagree with the backfill about which world this is |

**Why recompute rather than derive.** Deriving fatigue from `seed + clock` would reconstruct what the
model *would* have produced — which equals the store only if nothing was rejected, lost or truncated.
We deliberately inject 0.2% emitter-side loss and 0.1% malformed payloads (§13), so the two **will**
diverge, silently, in the one number the artifact is judged on. Recomputing from the log cannot
diverge, because the log is what the app reads too.

**It is not a simulator-only query.** Cumulative delivery per `(lineage, audience)` is the temporal
reverse join `DESIGN.md` §8 already documents for component-level performance. The endpoint serves a
query the Workbench wants anyway.

**Consequences.** Pause latency is a number we state — **≤ 1 tick, ≤ 1 s** — rather than a behaviour
we hope for. Cold start, restart, lever propagation and scenario delivery are **one code path**.
Killing the simulator mid-demo loses nothing: it re-reads and resumes, and duplicate emissions
dedupe by construction (§14).

**How far back it resumes is 60 seconds — ratified as D61** (2026-09-04, at B34), and bounded below
by `T0` per §15.3(b), so the start is `max(now − 60 s, T0)`. One `rollup_minute` bucket (D28), so a
restart re-emits at most the minute you are watching. The alternative — a server-derived resume
position carried in this same poll, which would remove the re-emission entirely — was rejected
deliberately: **the re-emission IS the demonstration** that derived ids make restart safety free
(B11 measured 14 `duplicate_identical`, 0 conflicting). Removing it would optimise away the thing
§14 exists to show.

---

## 17 — Scenario control

*"I need to be able to cause the interesting thing to happen live rather than wait for it."*

**`POST /api/sim/scenario {name, args}`** persists a trigger; the simulator picks it up on its next
`GET /api/sim/world` poll (§16). No second control channel, and the triggers are part of the
replayable record (§14) — which is why they need a table (§22).

| Scenario | What it does | What a reviewer watches |
|---|---|---|
| `fatigue_collapse{ad_id, ×4}` | Multiplies the pair's accumulated `F` | CTR halves within a minute; the fatigue flag (§19) fires; the *other* ads sharing that lineage move too |
| `late_cascade{ad_id, n, min_age_h = 96}` | Emits `n` conversions attributed to clicks ≥ 96 h old | **The flagship path.** Settled buckets restate, days back on the chart, with `restated_at` and a timeline entry at the bucket's own time |
| `budget_squeeze{ad_id}` | Jumps `spend_so_far` to 92% of budget | §9's terminal taper: delivery slides, never cliffs |
| `orphan_burst{n}` | Conversions whose clicks are withheld 90 s, then released | Provisional → promoted: a **two-bucket** restatement, D16's path |
| `duplicate_storm{n}` | Replays a batch | Dedupe counters; `duplicate_identical` vs `duplicate_conflicting` |
| `stall{seconds}` | Emission stops | Liveness display — *"last event 12 s ago"*; G21's detected-not-repaired |
| `traffic_burst{×}` | Rate multiplier for 60 s | Ingest backpressure, coalesced bucket rows, dropped tail frames with a visible counter |

**This is new scope, taken as a plan item — P17 in `SCOPE.md` §2.** Ratified in Seno's words: *"Same
argument as P16 — if the interesting thing can't be caused on demand it can't be shown."* Because
`SCOPE.md` §2–§4 is README-verbatim, that is a README change too.

---

## 18 — Calibration: the parameters were chosen against D20, and measured

### 18.1 D20's gate, read backwards, is a volume requirement

| To draw | Needs per point | Which is |
|---|---|---|
| CTR at hour | 500 impressions | 12k impr/day/ad |
| CTR at 15 min | 500 impressions | 48k impr/day/ad |
| CPA/ROAS at hour, cold (CTR 1.1% × CVR 1.8%) | 10 conversions | ~1.2M impr/day/ad — impossible |
| **CPA/ROAS at hour, retargeting (4.2% × 15%)** | 10 conversions | **~38k impr/day/ad** |

Cohort ratios need two to three orders of magnitude more traffic than CTR **unless** CTR × CVR is
high — which is what retargeting *is*. So the ad on which per-ad hourly CPA/ROAS is drawable is a
retargeting ad, for a domain reason rather than a demo reason.

### 18.2 And fatigue pushes ads off the gate

The interaction is the interesting part. `a_01` — retargeting, 75k impr/day, seven days old — sits at
**φ_ad 0.126** and yields **4.3 conversions/hour at the daily peak: below the bar.** The metric a
strategist would use to judge the ad stopped being measurable exactly as the ad died. That is
uncomfortable and it is true, so the drawable ad has to be a **fresh pair on a small pool**, not an
old one. (Its *video* pair sits at φ 0.25; the ad's multiplier is lower because the headline is
burned too — see §18.3's note.)

### 18.3 Where every ad lands on the ladder

Computed with the parameters above, at the daily peak / at the trough. **The φ column is
`φ_ad = φ_video^1.0 · φ_headline^0.5`** (§7.1) — the multiplier that actually enters `p_ctr`. It was
previously the video pair's φ alone, which is the figure §7.2 tabulates; corrected at B26, along
with every conv/h that depends on it. Impressions are unaffected, because φ does not enter λ (D56).

| Ad | φ_ad | φ_video | Peak impr/h | Peak conv/h | CTR rung pk / tr | CPA·ROAS rung pk / tr |
|---|---|---|---|---|---|---|
| `a_08` (rt, 1 d, fresh pair) | 0.488 | 0.62 | 5,118 | **12.0** | 15 min / hour | **hour / counts** |
| `a_01` (rt, 7 d, burned) | 0.126 | 0.25 | 5,351 | 4.3 | 15 min / hour | counts / counts |
| `a_02` (cold, tiktok) | 0.302 | 0.43 | 4,068 | 0.2 | 15 min / hour | counts / counts |
| `a_03` (warm, meta_feed) | 0.555 | 0.68 | 1,570 | 1.1 | hour / counts | counts / counts |
| `a_07` (warm, snap, newest) | 0.929 | 0.98 | 544 | 0.3 | hour / counts | counts / counts |
| `a_09` (cold, snap) | 0.941 | 0.96 | 454 | 0.0 | counts / counts | counts / counts |

**Both branches of D20 fire on camera, and the ladder steps during the day.** `a_08` draws hourly
CPA at peak and falls to counts overnight. `a_02` draws CTR at 15-min in the evening and at hour
overnight. `a_09` never clears any bar and says so. A portfolio where every chart drew every ratio
would make D20's mechanism invisible; one where none did would make cohort ratios invisible.

**Not one rung assignment moved under the correction** — checked against D20's gates at both peak
and trough for all six ads. What moved is `a_08`'s margin: **12.0 conversions/hour against a bar of
10, where the earlier figure gave 53% of headroom and this gives 20%.** That single cell is D20's
hourly branch firing on camera, so **B34 owes a check** (D56 consequence 5): whether the rung is
chosen from the *realised* hour or from the *expectation*. If realised, `α = 8`'s overdispersion
will put some hours under the bar and the demo moment will silently not happen. The figures here are
expectations; ν is also omitted from them, which B28 will revisit.

### 18.4 Seed budget — measured, not estimated

Measured in the scratchpad on this machine, never in the repo — the method **D8** was settled by.
Node v24.14.0, SQLite 3.51.2 via `node:sqlite`, WAL + `synchronous = NORMAL`, transactions of 5,000,
through insert → attribution resolution → rollup upsert:

| | Measured |
|---|---|
| Seed 1.06M events through the full write path | **7.9 s** (133,601 events/s) |
| **P14 full agreement sweep** — one ordered pass over raw, rebuild, diff every bucket | **2.72 s** over 56,160 buckets, **0 mismatches** |
| ↳ **re-measured at B24**, against the built sweep (`npm run agree`) | **0.88–1.71 s** over the same 56,160 buckets (357,540 events, ~1,860 backdated conversions), **0 mismatches**. Three runs: 879 / 876 / 1714 ms — the **range**, not the mean, because the spread is GC variance and the honest claim is the worst case. `/api/verify` on the same store: **3.6 s**. |
| Hot read (D28's `WITHOUT ROWID` PK), 60-minute single-ad window | **0.08 ms** |
| Store | 203 MB + 5 MB WAL |

Projected to the §2.3 portfolio:

```
impressions 1,518,000 · clicks ~31,900 · conversions ~1,750 · spend ticks 73,440
TOTAL ~1,625,000 events  ·  seed ~12 s  ·  P14 sweep ~4.2 s  ·  store ~315 MB
5-day fallback: ~1,160,000 events  ·  seed ~9 s
```

Two consequences:

1. **P14 needs no bounded mode.** 4.2 s is something you run in front of a reviewer. **Confirmed
   at B24: 0.88–1.71 s** on a store of the same shape, so the projection was conservative. The sweep
   **must be a single whole-log pass**, not `replay()` called per bucket — per-bucket would be
   O(buckets × N) and take hours. **That is now a measured statement rather than an estimate: at
   ~0.9 s per whole-log pass, per-bucket over 56,160 buckets is ~13 hours.** That is already what **D7** specifies ("the rebuild path calls it
   with the whole log from zero"); it is written here because the obvious implementation is the
   quadratic one.
2. **The seed prints progress.** Twelve seconds of silence on the one command that is supposed to
   just work reads as a hang.

> **Re-measured at B06 (2026-09-04).** The table above measures **the store**; B34 asks about **the
> write path**, which also writes a `signal_deliveries` row, hashes it and probes for a duplicate.
> Through the real `ingest()` → `apply()`, 1.625M events take **27.5 s** and **716 MB**. Subtracting
> the four line items this benchmark never ran reconciles the two exactly (16.9 µs → 8.0 µs =
> 125k/s against the 133.6k/s above). Nothing regressed; the figures answer different questions. The
> accounting and the five levers for B34 are in `BUILD_PLAN.md` § "The seed budget, re-measured at
> B06". Consequence 2 holds harder: ~28 s of silence is worse than twelve.

---

## 19 — Separating signal from noise, on the read side

**Mostly inherited, and deliberately not re-decided here.** **D20** fixes the gate (≥500 impressions
for CTR, ≥10 **conversions** for CPA/ROAS), the adaptive ladder (minute → 5 min → 15 min → hour, then
**stop** and show counts with the reason stated) and the smoothing (**EWMA, 15-minute half-life**,
raw toggle). **D33** fixes the maturity indicator: the empirical attribution-lag CDF over settled
cohorts, **global**, always displayed with the sample size it was measured from. §18.3 is this
document's contribution — evidence that the parameters were chosen so those mechanisms are visible.

Two mechanisms, two meanings, and they must stay visibly distinct: the **gate** says *too little data
to be a ratio*; the **maturity indicator** says *the data is still arriving*. §11.2 is why a young
cohort trips both.

### The one new heuristic: the fatigue flag

> Flag a `(lineage × audience)` pair as **fatiguing** when its EWMA CTR over the trailing 6 h has
> fallen **≥ 25%** below that pair's **peak** trailing-6h EWMA CTR, counting only points that clear
> D20's impression gate, with **≥ 3 qualifying points in each window**.

Simple, and per L147 a well-chosen heuristic honestly presented beats an opaque model. Its limits,
stated on the surface next to it and not only in the README:

- **It cannot separate fatigue from an audience-quality shift or a platform delivery change.** §12's
  two AR(1) processes are the honest reason: a sustained channel-level dip and a genuine burnout look
  the same for the first few hours, by construction, because they do in reality.
- **It lags by roughly the EWMA half-life.** A collapse is flagged ~15–30 minutes after it starts.
- **It fires late on low-volume ads, precisely because the gate suppresses their points.** `a_09`
  could burn out completely and never accumulate three qualifying points. The ads most likely to be
  fatigued are the ones we are slowest to flag — the honest failure mode, stated rather than hidden.
- **It measures the pair, not the ad.** An ad whose video is fresh and whose headline is burned
  shows a partial signal, and the surface has to attribute it to the slot.
- **It is a display flag, not a recommendation.** No `system:fatigue_rule` decision is ever appended
  — that actor and the approval flow are **D26 cut #6**. The flag informs a human who pulls the
  lever; nothing pulls it automatically.

---

## 20 — What this model does not model

Named, because an unnamed simplification reads as an oversight.

| Not modelled | What it would change | Why not |
|---|---|---|
| **Audience overlap / fatigue bleed** (G15) | `cold_us` and `cold_us_lookalike` certainly overlap, so burning one should partially burn the other. Pools are disjoint here | The model gives `retargeting` a label with no referent; linking pools needs an overlap matrix the contract cannot express |
| **Auction competition as an agent** | Rivals entering would raise CPC and cut delivery together | §12 models its *statistical shadow* (the channel demand factor coupled to CPC) rather than the mechanism |
| **Frequency capping** | Real platforms cap exposures per person, which bounds fatigue | Would flatten the fatigue curve — the thing being demonstrated |
| **Seasonality beyond day-of-week** | Payday cycles, holidays | Invisible in a 7-day window |
| **View-through conversions** | Conversions with no click at all — which under D27-B would have no cohort minute | Genuinely interesting and genuinely out of scope: it would mean a second orphan class |
| **Per-audience timezone** | `Audience.tz`; a non-US audience's diurnal is otherwise wrong by its offset | §2.2. All seeded audiences are US, so it never fires |
| **Creative-level platform delivery optimisation** | Platforms shift budget toward the winning creative inside an ad set | We have no ad-set entity (G29) |
| **CVR fatigue** | Only CTR decays here (§10) | Defensible either way; stated because we picked one |

---

## 21 — Parameter appendix

Every constant, in one place, so it can be inspected as evidence.

```
TIME
  live tick                     1 s, one batched POST per tick
  live rate                     1× wall clock
  backfill depth                7 days   (fallback: 5 days)
  account timezone              America/New_York                     [D22]
  lateness horizon              72 h                                 [D13]
  spend tick interval           60 s                                 [I1]

DIURNAL   d_c(h) = [0.30 + w1·exp(−(h−13.0)²/20.48) + w2·exp(−(h−20.5)²/8.0)] / Z
  meta_feed      w1 0.85  w2 0.45  Z 0.6719     meta_reels    w1 0.45  w2 0.85  Z 0.6164
  tiktok_feed    w1 0.35  w2 1.05  Z 0.6220     snap_stories  w1 0.30  w2 1.00  Z 0.5956
DAY OF WEEK
  volume         Mon .96  Tue 1.00  Wed 1.02  Thu 1.03  Fri .98  Sat .88  Sun .93
  weekend        CVR ×0.90   order value ×1.05                     (Sat, Sun)

CHANNEL                        CTR×   CVR×   CPC/CPM split   CPM base   CPC base
  meta_feed                    1.00   1.00      70 / 30        $6.50      $0.62
  meta_reels                   0.85   0.90      50 / 50        $5.20      $0.48
  tiktok_feed                  1.20   0.75      30 / 70        $4.10      $0.35
  snap_stories                 0.70   0.65      20 / 80        $3.40      $0.30

TEMPERATURE                    CTR    CVR    CPC×   order value   p_fast   served_fraction
  cold                         1.1%   1.8%   0.85      $42        0.30         0.04
  cold (lookalike)             1.1%   1.8%   0.85      $42        0.30         0.06
  warm                         2.4%   5.5%   1.00      $58        0.45         0.25
  retargeting                  4.2%  15.0%   1.35      $76        0.65         0.70

FATIGUE                        φ(f) = 0.25 + 0.75·exp(−0.35·f)          [D35]
  k                            0.35            floor  0.25
  f                            F(lineage,audience) / (est_size × served_fraction)
  slot composition             φ_video^1.0 × φ_headline^0.5
  recovery half-life τ_rec     5 days (idle only)
  version partial reset r      0.35                                 [D35 param, ratified]
NOVELTY                        ν(age_h) = 1 + 0.25·exp(−age_h/18)

PACING                                                                [I3, P11]
  ρ_catchup                    clamp(1 + 3.0·(e − a), 0.05, 1.0)      [ceiling 1.6 -> 1.0, D59]
  ρ_terminal                   clamp((1.05 − a)/0.15, 0, 1)
  overspend tolerance          +5%
  (D59: pacing throttles, never boosts. lambda is exogenous in §3, so an ad behind pace has no
   inventory to catch up into; the 1.6 ceiling ran the whole portfolio 1.19-1.47x §2.3. See §9.)

CONVERSION LAG                                                        [D36]
  purchase, fast               Exponential(mean 12 min),  prob p_fast
  purchase, slow               LogNormal(median 14 h, σ 1.1)
  hard cutoff                  7 days
  reporting                    LogNormal(median 90 s, σ 0.9); 2% straggler Uniform(2 h, 9 h)
  → median / p95 / past-72h    rt 0.3h / 1.87d / 2.3%   warm 3.3h / 2.49d / 3.6%
                               cold 7.5h / 2.85d / 4.6%

NOISE                                                                 [D37]
  m_channel                    log-AR(1), τ 45 min, sd 0.18
  m_ad                         log-AR(1), τ 20 min, sd 0.25
  impressions                  NegBinomial(λ, α = 8)
  clicks                       BetaBinomial(N, p_ctr, κ = 200)
  conversions                  Bernoulli(p_cvr) per click, keyed by click_id   [D62]
  order value                  LogNormal(σ 0.6)
  CPC                          LogNormal(σ 0.35) × m_channel^0.6

MISBEHAVIOUR                   dup identical .8% · dup conflicting .05% · reorder 3% short,
                               .3% long · orphan-released .4% · orphan-never .6% · malformed .1%
                               · skew .2% · dual click-id .05% · emitter loss .2%

READ SIDE                                                             [D20, D33]
  CTR gate                     ≥ 500 impressions / point
  CPA·ROAS gate                ≥ 10 conversions / point
  ladder                       minute → 5 min → 15 min → hour, STOP → show counts
  smoothing                    EWMA, 15-min half-life, raw toggle
  fatigue flag                 −25% vs peak trailing-6h EWMA CTR, ≥3 gated points per window
```

---

## 22 — What this document changes elsewhere

Raised rather than absorbed, per `CLAUDE.md` §8 and §10.

| # | Change | Where | Why |
|---|---|---|---|
| 1 | **`DESIGN.md` §5.4 correction:** settlement is evaluated at `ev.received_at`, not wall-clock `now` | `DESIGN.md` §5.4 | §15.3(c). Otherwise seeding stamps tens of thousands of spurious restatements |
| 2 | **`source: 'backfill' \| 'live'`** — new envelope field, server-assigned at ingest (**E15**) | `DESIGN.md` §2.2, `BRIEF_GAPS.md` §A | D38-B. Also disclosed in D33's sample-size label |
| 3 | **`sim_scenarios`** — one new table, so scenario triggers persist | `DESIGN.md` §2, extension register | §14's reproducibility claim is false if triggers are ephemeral |
| 4 | **`GET /api/sim/world`** and **`POST /api/sim/scenario`** — two new endpoints | `DESIGN.md` §11 | D40-X, §17 |
| 5 | **`as_of` limit for the seeded window** — designed, not observed arrival times | `DESIGN.md` §10.3, README | §15.4 |
| 5b | **Interpretation I18** — purchase and reporting lag are two distinct quantities; `received_at − ts` is the reporting lag only | `BRIEF_GAPS.md` §F | §11.1, D36 |
| 6 | **P17 — scenario control** as a plan item | `SCOPE.md` §2 (**README-verbatim**) | Ratified as new scope, same argument as P16 |
| 7 | **F2 refinement** — historical restatements *are* visible at the default horizon | `DECISIONS.md` F2 | §15.4. P16 remains the only way to cause one live |
| 8 | **D3 gains an observable consequence** — copy-on-write is exercised by the data after all | `DECISIONS.md` D3 note | §7.3 |
| 9 | **Two parameters** — `served_fraction`, version reset `r` = 0.35 | `DECISIONS.md` § D35 parameter ratification | §6, §7.3. **Ratified 2026-09-03**; nothing in the doc is unratified |
