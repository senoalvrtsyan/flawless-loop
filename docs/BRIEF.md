# Flawless — Practical Interview

**Objective: Implementation of product-level asks**   
**AdTech: The Optimization Loop** **Scope:** build one or two of the three surfaces for real; sketch the rest — details under *Scope it deliberately* below.

*Confidential. This brief references internal systems and roadmap information. Please keep it, and your work, private.*

---

## Background

You don't need ad-industry experience for this exercise. Here's the minimum context to understand the brief:

**Creative** — the content of an ad: the video, the image, the text ("copy") that people actually see.

**Ad** — in this brief, an ad is a *composite*: creative components plus configuration — the audience it targets and the channel it runs on. The same video or headline can appear in many ads.

**Targeting / audience** — the definition of who is eligible to see an ad.

**Channel / placement** — where the ad runs: which platform (Meta, TikTok, …), which surface on that platform.

**Performance data** — what comes back once an ad is live: impressions (times shown), clicks, conversions (the action you wanted — a purchase, an install), spend, and derived rates like CTR (click-through rate), CPA (cost per acquisition), and ROAS (return on ad spend).

**Creative fatigue** — ads decay. A creative that performed well for two weeks will often stop working as its audience tires of it. Performance is a moving target.

**Ad strategist** — our user. The person who decides what to run, for whom, where, with what budget — and what to change when the numbers come in.

**Human-in-the-loop** — automation that pauses at defined points for a person to review or approve before proceeding.

## The premise

Launch is not the finish line. It's the starting gun.

The traditional workflow treats an ad as a deliverable: assemble it, launch it, read a report next week. But an ad is really a bet — a specific combination of creative, audience, and channel — and the moment it goes live, the market starts scoring that bet in real time. The system we're building treats every live ad as a running experiment, and the strategist not as a producer of ads but as the operator of a portfolio of experiments: reading signals as they arrive, making calls, and compounding what each ad teaches into the next one.

This exercise is about the strategist-facing product of that loop. You're designing what the strategist sees, decides, and learns — and most importantly what data the strategist needs and how that data is handled in an observable and actionable way.

## The shape of the data (a loose spec open to interpretation and evolution)

Three kinds of data move through this system. The contracts below are what your app builds against — names, types, and semantics hold. Extend them if your slice needs it (new event types, new actions, extra fields), and call any extension out in your notes.

**Configs — what the strategist sets.** A live ad's config changes only through levers (below); everything else reads it.

```ts
type Channel = "meta_feed" | "meta_reels" | "tiktok_feed" | "snap_stories";

interface Ad {
  ad_id: string;                  // "a_12"
  status: "draft" | "live" | "paused" | "archived";
  video_id: string;               // -> Component.component_id
  headline_id: string;            // -> Component.component_id
  audience_id: string;            // -> Audience.audience_id
  channel: Channel;
  daily_budget_cents: number;     // all money: integer USD cents
  launched_at: string | null;     // ISO 8601 UTC; null until first live
}

interface Component {
  component_id: string;           // "h_03"
  kind: "video" | "image" | "headline" | "body_copy";
  payload: string;                // copy text, or an asset URL for media
  created_at: string;             // ISO 8601 UTC
}

interface Audience {
  audience_id: string;            // "cold_us"
  geo: string;                    // ISO 3166-1 alpha-2
  temperature: "cold" | "warm" | "retargeting";
  est_size: number;
}
```

**Signals — what the world sends back.** Append-only facts. Delivery is at-least-once and unordered: `ts` is event time, not arrival time, and consumers dedupe on `event_id`.

```ts
type Signal = { event_id: string; ts: string; ad_id: string } & (
  | { event: "impression" }
  | { event: "click"; cost_cents: number }      // CPC charge for this click
  | { event: "spend"; amount_cents: number }    // non-click charges (CPM, fees);
                                                // disjoint from click costs — total spend = sum of both
  | { event: "conversion"; attributed_click_id: string; value_cents: number }
      // the troublemaker: may land hours or days after its click,
      // retroactively changing periods you thought were closed
);
```

**Levers — what the strategist pulls.** Every pull is a decision event; a live ad's config changes only this way.

```ts
type Decision = {
  decision_id: string;
  ts: string;                                      // ISO 8601 UTC
  actor: `human:${string}` | `system:${string}`;   // "human:nk", "system:fatigue_rule"
  ad_id: string;
  rationale: string;                               // required — for systems too
} & (
  | { action: "pause" | "resume" }
  | { action: "set_budget"; from_cents: number; to_cents: number }
  | { action: "swap_component"; slot: "video" | "headline"; from_id: string; to_id: string }
);
```

As you read the challenge below, notice the correspondence: configs live in the **Workbench**, signals in **Signal**, levers in the **Decision loop**.

## Your challenge

Design — and prototype as a live web app — the strategist's cockpit for this loop.

Each surface below is written as a product ask, and translating it to an implementation is part of the test: decide the data model, the read path, and the write path it implies — and say out loud what the ask underdetermines and how you resolved it. **The focus is on decision making and implementation, not building a fully functional shippable product.**

**Workbench.** I'm a strategist with a library of components — videos, images, copy, audiences, channels. How do I assemble an ad? What *is* an ad in this system — a frozen bundle, or a recipe over components? When one video appears in twelve live ads across three channels, what does the strategist see when they look at that video? Think of this as: component library \+ ad builder \+ a model of variants. The interesting question: when components are shared across many ads, what is the unit the strategist actually manages — the ad, or the component? Under the product ask sits a data-model ask: ads ↔ components is many-to-many with a live read path — "used in twelve ads" is a reverse join kept current as ads launch and die — and editing a component forces a versioning decision: mutate in place (twelve live ads silently change), copy-on-write, or immutable once live. Pick one and defend it.

**Signal.** Performance data starts flowing the minute an ad is live — and it never stops. The user needs to be able to interpret the data visually in order to make real time decisions.

Signal is where we look hardest at your engineering. Treat the stream as an event problem, not a display problem:

- **Events, not snapshots.** The mock stream should be a sequence of timestamped events — impressions, clicks, conversions, spend ticks — not a pre-baked array sitting behind a chart. Everything on screen is derived from the stream; nothing on screen is hard-coded.  
    
- **Persistence is not optional.** A page refresh must not lose the world: live ads, accumulated performance history, and the decision log all come back — ideally across an app restart too. Any store earns full credit (Postgres, SQLite, a JSON file, IndexedDB); what we're grading is that you placed the persistence boundary deliberately and can defend where it sits — what lives in the client, what lives in the store, and what is recomputable from the event log.  
    
- **Aggregation is a design decision.** Do you keep raw events forever, or roll them into minute- and hour-buckets? Are CTR, CPA, and ROAS computed at write time, derived at read time, or cached somewhere in between? What do you compact away — and what question becomes unanswerable once you have? Say what you chose and what it forecloses.  
    
- **The stream will misbehave.** Real platform data arrives late, duplicated, and out of order — conversions especially, which attribute backwards to clicks from hours or days earlier and quietly rewrite numbers you thought were final. Your mock stream is under your control, so it's tempting to make it polite. Don't. Pick at least one misbehavior — late-attributing conversions are the most interesting — handle it end to end, and name in your notes which others your design tolerates and which would break it.

**Decision loop.** Signals demand actions. What can the strategist actually *do* — pause, reallocate budget, swap a component, spin up a variant, kill and relaunch. Think of this as an action console \+ a decision log. The decisions themselves are both data and actions on data. Concretely: a lever appends a decision event *and* mutates config *and* shows up in the stream — pause `a_12` and its events stop ticking. Which means current config is derivable: the initial state folded over the decision log. Decide whether you store the fold, the log, or both — and which one the UI reads. If you score outcomes, a stated before-window vs. after-window heuristic next to each log entry is enough.

## Scope it deliberately

The full problem is intentionally too large. A good slice at this level: build one or two of the three surfaces for real, and sketch the rest (annotated mockups, a README section, or stubbed screens are all fine for the sketched parts). Tell us what you cut and why.

One constraint on the slice: whatever you pick must include a live signal path — events flowing, persisting, and changing what's on screen. You can scope **Signal** down (one metric, a handful of ads), but you can't scope it out.

Your mock data is itself a design artifact. The shape of the performance data you invent — its noise, its daily rhythms, its fatigue curves — reveals your model of the domain. We will look at it.

Push back where you think the brief is wrong, and ask questions along the way.

## What we're evaluating

**Bridging product requirements and implementation** — how did you interpret the product ask and decide on implementation details? Did you pick a slice with real signal, and make sensible tradeoffs?

**Execution** — does the built part actually work and feel like a product — and does state survive a refresh?

**Data & events** — are configs, signals, and levers kept distinct in your model, and is the path from event to pixel sound: can you trace any number on screen back to the raw events beneath it — and do they agree?

**Clarity** — can you explain your decisions?

We are **not** evaluating adtech expertise, visual polish, completeness — or statistical/ML sophistication. A well-chosen heuristic, honestly presented with its limits, beats an opaque model.

## Deliverables

A **live web app** — deployed URL, or a repo we can run in one command. Mock data is fine (encouraged — see above); no real platform integrations expected. It should feel like a product, not wireframes. At least one decision must be closable *inside* the product: the strategist sees a signal, takes an action, and the world — even a simulated one — responds. And state survives a refresh: reload the page and the live ads, their history, and the decision log are still there. Losing the world on reload is the one prototype shortcut we won't accept.

**AI process artifact** — we expect and encourage you to use AI tooling (Claude, Cursor, Copilot, etc.). Include an export of your main prompt threads, or a \~10-minute screen recording (Loom or similar) of a working session. We want to see how you work, not just what you produced.

**Short design notes** (a README is fine): framing, scope decisions, your storage model and how it maps to the contracts — what's a table, what's a log, what's derived — any extensions you made to them, your aggregation strategy, where the persistence boundary sits and why, how you separate signal from noise, and what you'd build next. Include the life of one event: a short trace — prose or one diagram — following a single conversion from emission, to stored fact, to aggregate, to pixel.

**A walkthrough** — you demo, we dig in together. Expect at least one mid-demo page refresh from us.

Any stack, any tools — AI coding tools are very much encouraged.

**Timeline:** TBD

