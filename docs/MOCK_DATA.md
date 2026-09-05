# MOCK_DATA.md — the mock data model, and its shapes in the shipped world

**This is not the simulator's design document.** [`SIMULATOR.md`](SIMULATOR.md) is the model as it
was specified in Phase 3 — every equation, every constant, and §21's appendix of all of them in one
place. **This file is what came out**: the same shapes, measured out of `data/loop.sqlite` and
plotted next to the curves they were supposed to be.

The brief says the mock data will be inspected as evidence of domain modelling, so a table of
constants is not the deliverable — *whether the constants produced the world they claimed to* is.
Everything below is a query, and the query is shown.

**Population.** Every measurement is over **`source = 'backfill'`** — the 1,582,985 events the seeder
wrote, hard-censored at `T0 = 2026-09-04T16:03:18.970Z`. That population is **frozen**, so these
numbers are reproducible; the live emitter's rows are a growing trickle (7,374 impressions at the
time of writing) and would make every figure here drift. Where the censoring changes a conclusion —
it changes exactly one, the lag tail — it is called out rather than left in the numbers.

**Local hours are `America/New_York`** (**D22**). The whole window is 28 Aug – 4 Sep 2026, which is
entirely EDT, so `datetime(ts, '-4 hours')` is exact rather than an approximation.

---

## 1 — The arrival process, in one equation

```
lambda(ad, t) =  base_impr_per_day(ad) / 86400
               x  d_channel(h_local(t))     -- §2  diurnal, per channel
               x  w_dow(weekday(t))         -- §2  day of week
               x  rho_pacing(ad, t)         -- §6  budget as a throttle
               x  m_channel(t) x m_ad(t)    -- §5  autocorrelated demand

N(ad, t) ~ NegBinomial(mean = lambda, dispersion alpha = 8)      -- once per second, per ad
```

Four multiplicative factors and one stochastic draw, per ad, per second. Multiplicative rather than
additive because the point of **D37** is that variance scales with level — §5 is where that shows up.

**`phi_fatigue` and `nu_novelty` are deliberately not in this equation** (**D56**). Fatigue and
novelty change *what an impression is worth*, never *how many arrive*; they enter `p_ctr` and nothing
else. Putting them in both places would charge fatigue twice, as `phi²` on clicks, and it would leave
the fatigue flag (§8) unable to fire, because that flag reads fatigue as falling CTR.

---

## 2 — Diurnal rhythm: the channel changes the *shape* of the day, not just its level

Two Gaussians — a midday peak at 13:00 and an evening peak at 20:30 — with weights that differ by
platform, normalised so `base_impr_per_day` means what it says:

```
d_c(h) = [ 0.30 + w1_c * exp(-(h-13.0)^2 / (2*3.2^2))
                + w2_c * exp(-(h-20.5)^2 / (2*2.0^2)) ] / Z_c
```

| Channel | `w1` midday | `w2` evening | `Z` |
|---|---|---|---|
| `meta_feed` | 0.85 | 0.45 | 0.6719 |
| `meta_reels` | 0.45 | 0.85 | 0.6164 |
| `tiktok_feed` | 0.35 | 1.05 | 0.6220 |
| `snap_stories` | 0.30 | 1.00 | 0.5956 |

```sql
WITH i AS (SELECT CAST(strftime('%H', datetime(s.ts_effective,'-4 hours')) AS INT) h
             FROM signals s JOIN ads a ON a.ad_id = s.ad_id
            WHERE s.kind='impression' AND s.source='backfill' AND a.channel = ?)
SELECT h, count(*) FROM i GROUP BY h ORDER BY h;
```

### DIURNAL — designed vs measured

`meta_feed` — impressions per local hour, normalised to mean 1.0
```
  hour   designed d_c(h)                                    measured (n = 949,953 impressions)
  00:00  █████·················  0.45   ██████················  0.46
  01:00  █████·················  0.45   ██████················  0.48
  02:00  █████·················  0.45   █████·················  0.42
  03:00  █████·················  0.46   ██████················  0.46
  04:00  ██████················  0.47   ██████················  0.48
  05:00  ██████················  0.50   ██████················  0.53
  06:00  ███████···············  0.56   ███████···············  0.56
  07:00  ████████··············  0.66   █████████·············  0.75
  08:00  ██████████············  0.82   ███████████···········  0.92
  09:00  ████████████··········  1.03   ███████████████·······  1.22
  10:00  ███████████████·······  1.26   ████████████████······  1.32
  11:00  ██████████████████····  1.49   ██████████████████····  1.54
  12:00  ████████████████████··  1.65   ████████████████████··  1.65
  13:00  ████████████████████··  1.71   ██████████████████████  1.84
  14:00  ████████████████████··  1.65   ███████████████████···  1.57
  15:00  ██████████████████····  1.50   █████████████████·····  1.41
  16:00  ████████████████······  1.31   ████████████████······  1.36
  17:00  ██████████████········  1.17   ██████████████········  1.16
  18:00  █████████████·········  1.13   █████████████·········  1.11
  19:00  ██████████████········  1.17   ███████████████·······  1.28
  20:00  ██████████████········  1.21   ████████████··········  1.00
  21:00  ██████████████········  1.15   █████████████·········  1.05
  22:00  ████████████··········  0.98   ██████████············  0.80
  23:00  █████████·············  0.76   ███████···············  0.63
```
peak/trough — designed **3.83×** (peak 1.71 @ 13:00, trough 0.45 @ 00:00) · measured **4.38×** (peak 1.84 @ 13:00, trough 0.42 @ 02:00)

`tiktok_feed` — impressions per local hour, normalised to mean 1.0
```
  hour   designed d_c(h)                                    measured (n = 386,017 impressions)
  00:00  █████·················  0.48   ████··················  0.42
  01:00  █████·················  0.48   ████··················  0.43
  02:00  █████·················  0.48   █████·················  0.49
  03:00  █████·················  0.49   █████·················  0.51
  04:00  █████·················  0.49   █████·················  0.53
  05:00  █████·················  0.51   █████·················  0.49
  06:00  █████·················  0.53   ██████················  0.60
  07:00  ██████················  0.58   ██████················  0.58
  08:00  ███████···············  0.65   ██████················  0.64
  09:00  ████████··············  0.74   ████████··············  0.80
  10:00  █████████·············  0.84   █████████·············  0.89
  11:00  ██████████············  0.95   █████████·············  0.89
  12:00  ██████████············  1.02   █████████·············  0.91
  13:00  ███████████···········  1.05   ██████████············  0.98
  14:00  ██████████············  1.03   ██████████············  0.97
  15:00  ██████████············  0.98   ██████████············  0.99
  16:00  ██████████············  0.98   ████████████··········  1.16
  17:00  ███████████···········  1.11   ██████████████········  1.36
  18:00  ██████████████········  1.42   ██████████████████····  1.80
  19:00  ███████████████████···  1.85   █████████████████████·  2.04
  20:00  ██████████████████████  2.17   █████████████████████·  2.06
  21:00  ██████████████████████  2.14   █████████████████████·  2.10
  22:00  ██████████████████····  1.77   ███████████████·······  1.49
  23:00  █████████████·········  1.26   █████████·············  0.86
```
peak/trough — designed **4.50×** (peak 2.17 @ 20:00, trough 0.48 @ 00:00) · measured **5.06×** (peak 2.10 @ 21:00, trough 0.42 @ 00:00)

**What the comparison says.** The shape is recovered essentially exactly — `meta_feed` peaks at
13:00 in both, `tiktok_feed` peaks at 20:00–21:00 in both, and the two channels are visibly
*different days* rather than one curve at two heights, which is the property the parameterisation
exists to produce. Hour-by-hour, the median absolute deviation between designed and measured is
**0.06** on both channels; 23 of 24 hours are within 0.20 on `meta_feed` and 20 of 24 on
`tiktok_feed`, whose worst hour (23:00, designed 1.26 against measured 0.86) is also its steepest.

**The measured swing is 12–14% wider than designed** (3.83× → 4.38×, 4.50× → 5.06×) and that is
expected rather than a defect: peak-over-trough is a ratio of the **largest** of 24 noisy sample
means to the **smallest**, so it is biased upward by construction, and the bias grows with the noise
§5 deliberately puts in. Four ads also launch mid-window, so the 24 hourly means are not drawn from
an identical mix of ads. Neither effect touches a parameter.

### Day of week — two effects, because they are two phenomena

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| Volume `w_dow` | 0.96 | 1.00 | 1.02 | 1.03 | 0.98 | **0.88** | **0.93** |
| CVR multiplier | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **0.90** | **0.90** |
| Order-value multiplier | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **1.05** | **1.05** |

Weekends are quieter *and* browsier: fewer people convert, and the ones who do spend slightly more.
Collapsing these into one volume curve would lose the second effect — which is the one that shows up
in ROAS rather than in impressions, and therefore the one a strategist would actually act on.

---

## 3 — Creative fatigue: the centre of the model

**D35, option C: fatigue accrues to the `(component lineage × audience)` pair** — not to the ad, not
to the component, not to the creative-and-channel. Frequency-driven, with recovery.

```
F(L, A)  = impressions of lineage L delivered to audience A, over EVERY ad that used the pair
pool(A)  = est_size(A) x served_fraction(A)
f(L, A)  = F(L, A) / pool(A)                       -- effective frequency
phi(f)   = 0.25 + 0.75 * exp(-0.35 * f)            -- the CTR multiplier
rest     : F <- F * 2^(-dt_idle / 5 days)          -- a rested creative recovers
per ad   : phi_ad = phi(f_video)^1.0 * phi(f_headline)^0.5
```

### FATIGUE — the curve, and the same curve in the data

```
  phi(f) = 0.25 + 0.75 * exp(-0.35 * f)          f = cumulative impressions / served pool

  f=   0  ████████████████████████████████████████  phi = 1.000
  f= 0.5  ██████████████████████████████████······  phi = 0.880
  f=   1  ████████████████████████████············  phi = 0.779
  f=   2  ████████████████████····················  phi = 0.622
  f=   3  ██████████████··························  phi = 0.512
  f=   4  ██████████······························  phi = 0.435
  f=   5  ███████·································  phi = 0.380
  f=   6  █████···································  phi = 0.342
  f=   8  ██······································  phi = 0.296
  f=  10  █·······································  phi = 0.273
  f=  12  █·······································  phi = 0.261
  f=  16  ········································  phi = 0.253
  f=  20  ········································  phi = 0.251
```

```
  daily CTR %, one row per ad-day, over the seven-day store

  a_01
    08-28  ███████████████████████████████████████████· 4.467%   (1472 /  32952)
    08-29  █████████████████████······················· 2.242%   (1514 /  67541)
    08-30  ████████████································ 1.226%   ( 795 /  64820)
    08-31  ████████···································· 0.828%   ( 582 /  70297)
    09-01  ██████······································ 0.636%   ( 496 /  77990)
    09-02  █████······································· 0.567%   ( 465 /  81990)
    09-03  █████······································· 0.506%   ( 453 /  89609)
    09-04  ████········································ 0.464%   ( 166 /  35799)
  a_05
    09-02  ████████···································· 0.830%   ( 108 /  13010)
    09-03  ██████······································ 0.578%   ( 189 /  32685)
    09-04  █████······································· 0.566%   (  73 /  12887)
  a_08
    09-03  ██████████████████████████████████·········· 3.586%   ( 945 /  26355)
    09-04  ███████████████████████····················· 2.390%   ( 974 /  40751)
  a_12
    08-28  ███████████································· 1.110%   ( 106 /   9551)
    08-29  ███████████································· 1.170%   ( 178 /  15217)
    08-30  █████████··································· 0.894%   ( 133 /  14874)
    08-31  ████████···································· 0.856%   ( 154 /  17983)
    09-01  ████████···································· 0.840%   ( 139 /  16548)
    09-02  ████████···································· 0.833%   ( 149 /  17891)
    09-03  ███████····································· 0.707%   ( 131 /  18540)
    09-04  ███████····································· 0.719%   (  66 /   9180)
  a_03
    08-28  ███████████████████████████················· 2.872%   ( 302 /  10514)
    08-29  █████████████████████······················· 2.164%   ( 400 /  18482)
    08-30  █████████████████████······················· 2.240%   ( 418 /  18663)
    08-31  █████████████████··························· 1.817%   ( 365 /  20090)
    09-01  █████████████████··························· 1.730%   ( 414 /  23925)
    09-02  ████████████████···························· 1.677%   ( 402 /  23974)
    09-03  ████████████································ 1.281%   ( 328 /  25609)
    09-04  ████████████································ 1.230%   ( 141 /  11462)
```

**Three claims, and the data that settles each.** All five ads above ran in the same store at the
same time; the numbers are `sum(clicks)/sum(impressions)` per local day out of `rollup_minute`.

**1 — The curve is real and it is steep.** `a_01` (`vl_04` v1 on `rt_us`) falls from **4.467% to
0.464%** in seven days — a **9.6× decline** — with impressions *rising* throughout. Nothing about
the ad changed. Its pair simply ran out of people: retargeting has `served_fraction` 0.70, so the
pool is small on purpose and it is the first to burn.

**2 — The same video is burned on one audience and fresh on another, at the same moment.** `a_12` is
the *same lineage* `vl_04` v1, on `cold_us` instead. Over the same seven days it declines from
**1.110% to 0.719%** — **1.5×**, not 9.6×. One video, two audiences, two entirely different
trajectories, and the only thing that explains the difference is the component's history on that
audience. That is **D4**'s *"you decide on ads, you learn about components"* as a fact about the
data rather than a sentence in a README.

**3 — A recut is not a new creative, and you can see how much of one it is.** Three ads ran on
`rt_us`, and their **first days** are the experiment:

| Ad | Video | Launched | Day-1 CTR | Day-1 CTR, adjusted to `meta_feed` |
|---|---|---|---|---|
| `a_01` | `vl_04` **v1** — a fresh lineage | day 0 | 4.467% (`meta_feed`) | **4.47%** |
| `a_08` | `vl_03` **v1** — a different fresh lineage | day 6 | 3.586% (`meta_reels`, CTR ×0.85) | **4.22%** |
| `a_05` | `vl_04` **v2** — a recut of the video `a_01` burned | day 5 | 0.830% (`meta_feed`) | **0.83%** |

A fresh lineage entering `rt_us` on day 6 still opens at ~4.2%, so the audience is not exhausted —
**`vl_04` is.** The recut opens at **one fifth** of that, because accrual is keyed by *lineage* and
v2 inherits v1's frequency, minus the ratified partial reset `r = 0.35`. A re-edit is not new to
someone who has seen the original eighteen times.

That last row is a **bonus D3 did not expect.** D3's entry states plainly that copy-on-write ships
as a position defended in prose because *"nothing exercises this at runtime"*. Under D35-C something
does, and the evidence is a number.

### Why frequency and not calendar

Calendar decay says an audience tires of an ad it is not being shown, which is wrong — and it would
quietly break the pause demo by continuing to burn a paused ad. Frequency also makes `set_budget` a
*fatigue* lever: double the budget and you burn the creative twice as fast. That tension is a real
strategic property and it comes free with the right denominator.

### The parameter that was wrong, and the correction

Worth keeping because it is the one place calibration overruled the first model. The original
divided cumulative impressions by a *reachable* fraction of `est_size` (0.55 for cold). At that pool
size `a_02` reaches **φ = 0.94 after seven days** — a 6% CTR decline, which is not a fatigue curve.

The error was modelling the pool as *"people the targeting allows"* when the quantity that governs
frequency is *"people the platform actually serves us at our bid"*. Delivery concentrates hard on
the responsive slice: a broad cold audience of 2.4M is reached through a window of tens of
thousands. `served_fraction` replaced it at **0.04 / 0.06 / 0.25 / 0.70**, and `a_02` lands at
**φ 0.43**. Ratified 2026-09-03; recorded in `DECISIONS.md` § D35 parameter ratification.

---

## 4 — Novelty at launch

### NOVELTY
```
  nu(age_h) = 1 + 0.25 * exp(-age_h / 18)

    0 h  ████████████████████████████████  nu = 1.250
    1 h  ██████████████████████████████··  nu = 1.236
    3 h  ███████████████████████████·····  nu = 1.212
    6 h  ███████████████████████·········  nu = 1.179
   12 h  ████████████████················  nu = 1.128
   18 h  ████████████····················  nu = 1.092
   24 h  ████████························  nu = 1.066
   36 h  ████····························  nu = 1.034
   48 h  ██······························  nu = 1.017
   72 h  █·······························  nu = 1.005
```

+25% CTR in the first minutes, decaying with an 18-hour time constant; about 4% left after two days.
Modelled as a **CTR effect only, not a delivery boost** — parsimony, and stated as a simplification
because platforms do also favour new creative during the learning phase, which would be a *volume*
term and is not modelled.

Novelty applies to the pair's **first exposure**, so a version bump gets a fresh novelty window as
well as §3's partial reset; a *reused* pair does not. It is why `a_05`'s and `a_08`'s day-1 figures
above are both slightly flattered. It is much the smaller of the two effects there: over `a_05`'s
first day novelty is worth roughly +15% on CTR, where inherited fatigue is worth about −74%.

---

## 5 — Noise, and where the overdispersion comes from

**D37: negative-binomial counts modulated by two autocorrelated demand factors, with overdispersed
rates on top.** Six stochastic components, each attached to the quantity it should perturb:

| Component | Form | What it is a picture of |
|---|---|---|
| Channel demand `m_channel` | log-AR(1), τ 45 min, sd 0.18 | platform-wide traffic and auction pressure — **moves every ad on that channel together** |
| Ad delivery `m_ad` | log-AR(1), τ 20 min, sd 0.25 | platform-side creative rotation, idiosyncratic per ad |
| Impression counts | `NegBinomial(λ, α = 8)` | overdispersion **grows with volume** — the empirical signature of served traffic |
| Click rate | `Beta(κ = 200)` once per minute, then `Binomial` per tick (**D57**) | audience composition drift: the *rate* is uncertain, not just the count |
| Order value | `LogNormal(σ = 0.6)` | a long right tail on basket size |
| CPC | `LogNormal(σ = 0.35) × m_channel^0.6` | **competition raises price and volume pressure together** |

**Why not uniform jitter on a smooth curve.** It is detectable in one glance: the mean is a visible
spline and the residuals have no volume dependence, no persistence and no source. The brief warns
about it because it is the standard tell.

```sql
-- group each ad's minutes into ad-hours, then compare Var/mean against the level
WITH per_min AS (SELECT ad_id, substr(minute_start,1,13) hr, impressions FROM rollup_minute),
     hr AS (SELECT ad_id, hr, avg(impressions) mu,
                   (avg(impressions*impressions) - avg(impressions)*avg(impressions))*60.0/59.0 var
              FROM per_min GROUP BY ad_id, hr HAVING count(*) >= 55 AND mu > 0)
SELECT mu, var FROM hr;
```

### NOISE — overdispersion grows with volume

```
  per-minute impression counts, grouped into ad-hours (>=55 minutes each)

   lambda band   ad-hours   mean lambda   Var/mean measured   iid bound 1+lambda/480
   2-4                30          3.34   ███████······················· 0.96    1.007
   4-8               192          6.08   ██████████···················· 1.32    1.013
   8-16              284         11.89   ████████████·················· 1.59    1.025
   16-32             298         22.21   ████████████████·············· 2.10    1.046
   32+               185         58.12   ████████████████████████████·· 3.72    1.121
```

**This is the one shape worth reading carefully, because both comparisons matter.**

Var/mean climbs monotonically with the level — **0.96 → 1.32 → 1.59 → 2.10 → 3.72** — which is the
NegBinomial signature the model was chosen for: a quiet ad is *proportionally* noisy and a loud one
is *absolutely* noisy, so **D20**'s statistical gate has something real to protect against.

The right-hand column is the bound the per-second draw alone would produce. Summing 60 independent
`NegBinomial(λ/60, α = 8)` seconds gives a minute with `Var/mean = 1 + λ/480` — **1.007 at λ ≈ 3,
rising only to 1.121 at λ ≈ 58.** Measured is **three times that** at the top band. The excess is
**not** the count draw: it is `m_channel` and `m_ad`, whose 45- and 20-minute time constants mean
that within any one hour the *rate itself* has drifted, so minutes inside an hour are correlated
rather than independent.

That is exactly what **D37** said two AR(1) processes would buy, stated at the time as a read-side
consequence: *"because bursts persist, EWMA smoothing has a real lag-versus-variance tradeoff instead
of a free lunch."* The 3× gap between the iid bound and the measurement is that tradeoff, in a
number.

The lowest band reads **0.96**, marginally *under*-dispersed. At λ ≈ 3 the count is near-Poisson and
the estimate is an average over only 30 ad-hours, so this is sampling noise around 1.0 rather than a
finding.

---

## 6 — Budget pacing: throttle, never cliff

**Budget is a pacing multiplier, not a cap** (**I3**, **P11**). No fifth ad state is invented; there
is no `budget_exhausted`. Real pacers pace against the *expected shape of the day* rather than
linearly — otherwise every ad front-loads into the morning and goes dark before prime time:

```
e(t)       = integral of d_c from day start to t, over the whole day    -- expected traffic elapsed
a(t)       = spend_so_far_today / daily_budget_cents                    -- actual budget consumed
rho_catchup  = clamp(1 + 3.0*(e - a), 0.05, 1.0)     -- ahead of pace: throttle. NEVER boosts.
rho_terminal = clamp((1.05 - a) / 0.15, 0, 1)        -- the taper into the cap
rho_pacing   = rho_catchup * rho_terminal
```

### PACING — the taper, and where the portfolio actually landed
```
  rho_terminal = clamp((1.05 - a) / 0.15, 0, 1)      a = spend today / daily budget

  a=0.000  ████████████████████████████████████  rho_terminal = 1.00
  a=0.500  ████████████████████████████████████  rho_terminal = 1.00
  a=0.800  ████████████████████████████████████  rho_terminal = 1.00
  a=0.850  ████████████████████████████████████  rho_terminal = 1.00
  a=0.900  ████████████████████████████████████  rho_terminal = 1.00
  a=0.925  ██████████████████████████████······  rho_terminal = 0.83
  a=0.950  ████████████████████████············  rho_terminal = 0.67
  a=0.975  ██████████████████··················  rho_terminal = 0.50
  a=1.000  ████████████························  rho_terminal = 0.33
  a=1.025  ██████······························  rho_terminal = 0.17
  a=1.050  ····································  rho_terminal = 0.00
```

```
  peak local-day spend as a share of daily_budget_cents (D52's hand-set budgets)

  a_01  ████████████████████····················  51.7%   peak $1,293.40 of $2,500.00
  a_02  ██████████████████████████··············  67.7%   peak $  169.24 of $  250.00
  a_03  ███████████████████████████·············  71.8%   peak $  251.28 of $  350.00
  a_04  ██████████████████████··················  58.8%   peak $   70.52 of $  120.00
  a_05  ███████·································  19.3%   peak $  174.12 of $  900.00
  a_06  ████████████████████████████████········  84.8%   peak $   67.85 of $   80.00
  a_07  ██████████████████······················  47.0%   peak $   18.78 of $   40.00
  a_08  ███████████████████████████·············  70.6%   peak $  670.78 of $  950.00
  a_09  ███████████████████████████·············  70.3%   peak $   17.57 of $   25.00
  a_10  █████████████████████████···············  65.9%   peak $   98.91 of $  150.00
  a_11  ██████████████████████████··············  68.3%   peak $  102.43 of $  150.00
  a_12  ███████████████████████████████████████· 101.2%   peak $   91.08 of $   90.00
```

**`a_12` is the only ad that reaches the taper**, peaking at **101.2%** of its cap — inside the
stated **+5% overspend tolerance** and nowhere near it being exceeded. Real platforms overspend
slightly, and a simulator that landed exactly on the number every day would be the tell. Ten of the
twelve sit between 47% and 85%, which is what `rho_terminal = 1.00` looks like: pacing is not doing
anything to them, and that is the correct behaviour rather than an inert mechanism.

**`rho_catchup`'s ceiling is 1.0 and it used to be 1.6** — amended by **D59** during the build, and
the reason is worth more than the value. The 1.6 ceiling assumed an ad is *delivery-limited by
pacing*: speed it up and the inventory is there. Ours are **demand-limited** — §1's λ is exogenous
with no auction-supply ceiling — so a boost manufactures impressions the model says do not exist.
Measured at B32 over a 24 h dry run before the amendment: **every ad sat on the 1.6 clamp** and
delivered **1.19×–1.47×** its stated baseline. The prose of the day claimed pacing was *inert*; it
was not inert, it was **pinned**, and only printing the clamp showed the difference.

What the amendment costs, stated: an ad that underspends is no longer accelerated to hit its budget,
so pacing is modelled in the throttling direction only. The taper still tapers — `a_12` is the proof.

`set_budget` moves `a` instantly, so `rho` changes within one tick: **raise the budget and the event
rate visibly rises inside a second.** That is the second closable decision the loop needed, and it
rides a rate curve the simulator needed anyway.

---

## 7 — The conversion lag: two lags, kept apart

**D36: a two-component mixture, plus a separate reporting lag.** The brief conflates them — L83 says
a conversion *"may land hours or days after its click"* — and splitting them is interpretation **I18**
in the extension register.

```
purchase lag   click.ts -> conversion.ts        the human decided later
reporting lag  conversion.ts -> received_at     the platform told us later

purchase  =  with prob p_fast(temperature):  Exponential(mean 12 min)
             otherwise:                      LogNormal(median 14 h, sigma 1.1)
             truncated hard at 7 days
reporting =  LogNormal(median 90 s, sigma 0.9)  + with prob 0.02: Uniform(2 h, 9 h)
```

Ratified in Seno's words: *"If you collapse them then `received_at − ts` becomes the purchase lag,
which would make our own transport look like it's hours behind. That field has to describe us, not
the buyer."*

`p_fast` is a **property of audience temperature** — 0.65 retargeting, 0.45 warm, 0.30 cold — so the
mixture weight carries domain meaning instead of being a fitted knob.

### CONVERSION LAG — the empirical CDF, per temperature

```
  P(purchase lag <= x)      x =  0.25h  0.5h    1h    2h    3h    6h   12h   24h   48h   72h  120h  168h
  retargeting  n=1076    0.49  0.65  0.71  0.73  0.74  0.80  0.86  0.93  0.98  0.99  1.00  1.00
  warm         n=191     0.33  0.46  0.52  0.53  0.56  0.65  0.79  0.90  0.98  0.99  1.00  1.00
  cold         n=70      0.26  0.29  0.30  0.36  0.39  0.47  0.54  0.77  0.94  1.00  1.00  1.00

  retargeting  ▒▒▒▒▒ ▓▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓ █████ █████ █████ █████ █████ 
  warm         ░░░░░ ▒▒▒▒▒ ▒▒▒▒▒ ▒▒▒▒▒ ▒▒▒▒▒ ▓▓▓▓▓ ▓▓▓▓▓ █████ █████ █████ █████ █████ 
  cold         ░░░░░ ░░░░░ ░░░░░ ░░░░░ ▒▒▒▒▒ ▒▒▒▒▒ ▒▒▒▒▒ ▓▓▓▓▓ █████ █████ █████ █████ 
```

**The mixture weight is recovered from the data almost exactly.** `p_fast` is the share of
conversions arriving in the first hour or so, and the `1h` column reads:

| Temperature | designed `p_fast` | measured P(lag ≤ 1 h) | n |
|---|---|---|---|
| `cold` | 0.30 | **0.30** | 70 |
| `warm` | 0.45 | **0.52** | 191 |
| `retargeting` | 0.65 | **0.71** | 1,076 |

Warm and retargeting read a little high because the slow LogNormal component also puts a few percent
of its mass under an hour — the measurement is the *mixture's* CDF, not the fast branch's.

**And the median is a bad statistic here, which the CDF shows and a table of medians hides.** Between
1 h and 3 h the empirical CDF is nearly flat — retargeting moves 0.71 → 0.74, warm 0.52 → 0.56, cold
0.30 → 0.39 — because that is the gap between the fast component finishing and the slow one starting
to accumulate. `SIMULATOR.md` §11.2's designed median for warm is 3.3 h, sitting right on that flat
stretch, so a sample of 191 lands the empirical median at 0.72 h instead. **Nothing is wrong with the
parameter**: the 50th percentile is simply not identified where the density is near zero, and this is
the argument for showing a CDF rather than three medians.

### The censored tail — the one place measurement and design genuinely differ

| Share arriving past the 72 h horizon | designed | measured |
|---|---|---|
| `retargeting` | 2.3% | 0.74% |
| `warm` | 3.6% | 0.52% |
| `cold` | 4.6% | 0.00% |

**This is right-censoring, not a broken model.** The seeded population is cut off hard at
`T0 = 2026-09-04T16:03:18.970Z` — `max(ts)` over `source='backfill'` is `2026-09-04T16:03:05.002Z` —
and **8,157 of the 17,408 backfilled clicks (47%) fall in the last three days of the window**, so
their long-lag conversions could not have been written by the seeder at all. They were not lost:
**B35's handover** means the live emitter re-derives them from `hash(seed, 'conv_lag', click_id)` and
delivers them as the demo runs. The first live event in the store proves it — `min(ts)` over
`source='live'` is **2026-09-04T12:20:46Z**, which is *before* `T0`, arriving at 16:16.

So the designed 2–5% tail is a claim about the *whole* distribution and the measured 0–0.7% is what
a seven-day window can contain of it. The number that matters for the product is neither: it is that
**14 buckets in this store carry `restated_at`** — settled periods that moved anyway — which is
`P7`'s path firing on emergent data rather than on a scenario trigger.

---

## 8 — What this model does not model

Named, because an unnamed simplification reads as an oversight.

| Not modelled | What it would change | Why not |
|---|---|---|
| **Audience overlap / fatigue bleed** | `cold_us` and `cold_us_lookalike` certainly overlap, so burning one should partially burn the other. Pools are disjoint here | Linking them needs an overlap matrix the brief's contract cannot express (G15) |
| **Auction competition as an agent** | Rivals entering would raise CPC and cut delivery together | §5 models its *statistical shadow* — channel demand coupled to CPC — rather than the mechanism |
| **Frequency capping** | Real platforms cap exposures per person, which bounds fatigue | It would flatten the curve in §3, which is the thing being demonstrated |
| **Seasonality beyond day-of-week** | Payday cycles, holidays | Invisible in a seven-day window |
| **View-through conversions** | Conversions with no click at all — which under D27-B would have no cohort minute | Genuinely interesting and genuinely out of scope: a second orphan class |
| **Per-audience timezone** | A non-US audience's diurnal is otherwise wrong by its offset | All four seeded audiences are US, so it never fires |
| **Creative-level delivery optimisation** | Platforms shift budget toward the winning creative inside an ad set | There is no ad-set entity in the brief's model (G29) |
| **CVR fatigue** | Only CTR decays here | Defensible either way; stated because we picked one |
| **Fatigue as a delivery effect** (**D56**) | A tired creative losing *reach*, not just click-through | Real, and representable here only through `rho_pacing`, which is a budget mechanism. Named as a limit rather than left as a gap |

---

## 9 — Determinism, and its stated limit

The reproducibility claim is `(seed + decision log + sim_scenarios) → world` (**D40**). All three
inputs are in the store: `sim_run` holds the seed and `T0` (**D60**), `decisions` holds the levers,
`sim_scenarios` holds the triggers. Draws are **keyed**, not sequential — `hash(seed, purpose, key)`
— which is what lets a restarting emitter re-derive a click's whole future from its `click_id`
alone, and what makes B35's handover possible at all.

**The limit, stated rather than discovered** (**D58**): after the sub-second placement fix, a
restart's catch-up is byte-identical for every event both runs produce, but the two runs **may not
produce the same set** — the emitter's wall-clock start position differs. Set-identity would need a
wire change to `GET /api/sim/world`, priced in D58 and not taken.

---

## 10 — Every constant, in one place

`SIMULATOR.md` §21 is the parameter appendix and is not reproduced here — it is one screen, it is
the source these plots were drawn against, and having two copies of it is how they come to disagree.

Read it there: [`SIMULATOR.md` §21 — Parameter appendix](SIMULATOR.md#21--parameter-appendix).
