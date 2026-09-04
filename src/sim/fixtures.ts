// The seeded world's reference data and portfolio. SIMULATOR.md §2, transcribed. B15.
//
// Reference data is static and seeded once (U3). Ads are NOT data: they exist only because the
// seeder appends `create_ad` and `launch` decisions and the fold runs (DESIGN §3.2) — so the rows
// below are decision PAYLOADS, not an `ads` table in disguise.

import type { Channel } from '../shared/decisions.ts';

export type ComponentFixture = {
  component_id: string;
  kind: 'video' | 'image' | 'headline' | 'body_copy';
  payload: string;
  lineage_id: string;
  version: number;
  parent_id: string | null;
};

/**
 * §2.1. Five video lineages, six headline lineages, and **`vl_04` carries two versions** — the
 * concrete two-version lineage D3 requires, so the component screen's "per version or per
 * lineage?" answer is a real answer on screen rather than a claim.
 *
 * The two `image` and two `body_copy` components attach to nothing. `Ad` has two slots and
 * `Component.kind` declares four (D23, G06): they are in the library so that the narrowing we
 * declined to make is **visible** rather than invisible.
 */
export const COMPONENTS: readonly ComponentFixture[] = [
  { component_id: 'v_01', kind: 'video', payload: 'Unboxing hook, 15s', lineage_id: 'vl_01', version: 1, parent_id: null },
  { component_id: 'v_02', kind: 'video', payload: 'Founder story, 45s', lineage_id: 'vl_02', version: 1, parent_id: null },
  { component_id: 'v_03', kind: 'video', payload: 'UGC testimonial, 20s', lineage_id: 'vl_03', version: 1, parent_id: null },
  { component_id: 'v_04', kind: 'video', payload: 'Product demo, 30s', lineage_id: 'vl_04', version: 1, parent_id: null },
  { component_id: 'v_05', kind: 'video', payload: 'Product demo, 30s — recut, tighter open', lineage_id: 'vl_04', version: 2, parent_id: 'v_04' },
  { component_id: 'v_06', kind: 'video', payload: 'Before / after, 12s', lineage_id: 'vl_05', version: 1, parent_id: null },
  { component_id: 'h_01', kind: 'headline', payload: 'The last one you will buy', lineage_id: 'hl_01', version: 1, parent_id: null },
  { component_id: 'h_02', kind: 'headline', payload: 'Sold out twice this month', lineage_id: 'hl_02', version: 1, parent_id: null },
  { component_id: 'h_03', kind: 'headline', payload: 'Made for people who hate this category', lineage_id: 'hl_03', version: 1, parent_id: null },
  { component_id: 'h_04', kind: 'headline', payload: 'Thirty seconds, then decide', lineage_id: 'hl_04', version: 1, parent_id: null },
  { component_id: 'h_05', kind: 'headline', payload: 'Free returns, no questions', lineage_id: 'hl_05', version: 1, parent_id: null },
  { component_id: 'h_06', kind: 'headline', payload: 'Your shortlist just got shorter', lineage_id: 'hl_06', version: 1, parent_id: null },
  { component_id: 'i_01', kind: 'image', payload: 'Static hero, 1:1', lineage_id: 'il_01', version: 1, parent_id: null },
  { component_id: 'i_02', kind: 'image', payload: 'Lifestyle flat-lay, 4:5', lineage_id: 'il_02', version: 1, parent_id: null },
  { component_id: 'b_01', kind: 'body_copy', payload: 'Long-form body, 60 words', lineage_id: 'bl_01', version: 1, parent_id: null },
  { component_id: 'b_02', kind: 'body_copy', payload: 'Short body, 18 words', lineage_id: 'bl_02', version: 1, parent_id: null },
];

export type AudienceFixture = {
  audience_id: string;
  geo: string;
  temperature: 'cold' | 'warm' | 'retargeting';
  est_size: number;
};

/**
 * §2.2. **All US, deliberately** — the diurnal curve is asked for in the audience's local time,
 * and D22 fixed one account timezone on the grounds that "the audiences are US". Keeping every
 * seeded audience US makes audience-local *equal* account-local, so D22 stands unamended.
 *
 * Stated limit: a non-US audience would need an `Audience.tz` field we have not added, and its
 * diurnal would be wrong by its UTC offset. Named as the extension we did not make.
 *
 * `served_fraction` (§2.2, §6) is NOT here and not in the schema: it is a parameter of the
 * emitter's fatigue model, not a fact about the audience, and it lands with the emitter.
 */
export const AUDIENCES: readonly AudienceFixture[] = [
  { audience_id: 'cold_us', geo: 'US', temperature: 'cold', est_size: 2_400_000 },
  { audience_id: 'cold_us_lookalike', geo: 'US', temperature: 'cold', est_size: 900_000 },
  { audience_id: 'warm_us', geo: 'US', temperature: 'warm', est_size: 380_000 },
  { audience_id: 'rt_us', geo: 'US', temperature: 'retargeting', est_size: 46_000 },
];

export type AdFixture = {
  ad_id: string;
  name: string;
  video_id: string;
  headline_id: string;
  audience_id: string;
  channel: Channel;
  daily_budget_cents: number;
  /** §2.3's staggered launch (D39): days of history at `T0`. D53 makes this a real backdate. */
  live_days: number;
};

/**
 * §2.3's twelve ads, each carrying a demo moment.
 *
 * `name` is **E8** and is ours — §2.3 names the ads by what they demonstrate, which is a note to
 * us, not a label a strategist would read.
 *
 * `daily_budget_cents` is **D52**, and is ours too. The baseline it is set against, per ad:
 *
 *     clicks/day = impressions/day x ctr_base(temperature) x ctr_mult(channel)     [phi = nu = 1]
 *     cpm charge = impressions/day x cpm_share(channel) / 1000 x cpm_base(channel)
 *     cpc charge = clicks/day x cpc_share(channel) x cpc_base(channel) x cpc_mult(temperature)
 *
 *     ad     channel        impr/day   clicks    cpm $    cpc $   baseline $/day   budget $/day
 *     a_01   meta_feed        75,000    3,150   146.25  1845.59          1991.84         2,500
 *     a_02   tiktok_feed      45,000      594   129.15    53.01           182.16           250
 *     a_03   meta_feed        22,000      528    42.90   229.15           272.05           350
 *     a_04   meta_reels       18,000      168    46.80    34.33            81.13           120
 *     a_05   meta_feed        26,000    1,092    50.70   639.80           690.50           900
 *     a_06   tiktok_feed      14,000      185    40.18    16.49            56.67            80
 *     a_07   snap_stories      6,000      101    16.32     6.05            22.37            40
 *     a_08   meta_reels       65,000    2,320   169.00   751.84           920.84    ** 950 **
 *     a_09   snap_stories      5,000       38    13.60     1.96            15.56            25
 *     a_10   meta_feed        16,000      176    31.20    64.93            96.13           150
 *     a_11   tiktok_feed      18,000      518    51.66    54.43           106.09           150
 *     a_12   meta_feed        20,000      220    39.00    81.16           120.16    **  90 **
 *
 * Ten sit ~25% above their baseline, so §9's pacing is inert for them. **`a_08` and `a_12` are
 * the two D52 placed near their cap**: a_08 reaches `a` ~= 0.94 by day end so ρ_terminal visibly
 * bites in the evening, and a_12 — the brief's own pause target — is set BELOW its baseline so
 * that raising its budget releases it inside one tick (D26 consequence 3).
 *
 * The baseline uses phi = nu = 1, so a fatigued ad spends less than its row says: a_01 at φ 0.25
 * spends ~$610, not $1,992. Budgets are an account setting, not a measurement.
 */
export const ADS: readonly AdFixture[] = [
  { ad_id: 'a_01', name: 'Product demo · retargeting', video_id: 'v_04', headline_id: 'h_01', audience_id: 'rt_us', channel: 'meta_feed', daily_budget_cents: 250_000, live_days: 7 },
  { ad_id: 'a_02', name: 'Unboxing hook · cold', video_id: 'v_01', headline_id: 'h_02', audience_id: 'cold_us', channel: 'tiktok_feed', daily_budget_cents: 25_000, live_days: 7 },
  { ad_id: 'a_03', name: 'Founder story · warm', video_id: 'v_02', headline_id: 'h_03', audience_id: 'warm_us', channel: 'meta_feed', daily_budget_cents: 35_000, live_days: 7 },
  { ad_id: 'a_04', name: 'Unboxing hook · cold, reels', video_id: 'v_01', headline_id: 'h_04', audience_id: 'cold_us', channel: 'meta_reels', daily_budget_cents: 12_000, live_days: 4 },
  { ad_id: 'a_05', name: 'Product demo recut · retargeting', video_id: 'v_05', headline_id: 'h_01', audience_id: 'rt_us', channel: 'meta_feed', daily_budget_cents: 90_000, live_days: 2 },
  { ad_id: 'a_06', name: 'UGC testimonial · lookalike', video_id: 'v_03', headline_id: 'h_05', audience_id: 'cold_us_lookalike', channel: 'tiktok_feed', daily_budget_cents: 8_000, live_days: 3 },
  { ad_id: 'a_07', name: 'Before / after · warm, stories', video_id: 'v_06', headline_id: 'h_06', audience_id: 'warm_us', channel: 'snap_stories', daily_budget_cents: 4_000, live_days: 1 },
  { ad_id: 'a_08', name: 'UGC testimonial · retargeting', video_id: 'v_03', headline_id: 'h_02', audience_id: 'rt_us', channel: 'meta_reels', daily_budget_cents: 95_000, live_days: 1 },
  { ad_id: 'a_09', name: 'Founder story · cold, stories', video_id: 'v_02', headline_id: 'h_05', audience_id: 'cold_us', channel: 'snap_stories', daily_budget_cents: 2_500, live_days: 3 },
  { ad_id: 'a_10', name: 'Before / after · lookalike', video_id: 'v_06', headline_id: 'h_03', audience_id: 'cold_us_lookalike', channel: 'meta_feed', daily_budget_cents: 15_000, live_days: 6 },
  { ad_id: 'a_11', name: 'Unboxing hook · warm', video_id: 'v_01', headline_id: 'h_06', audience_id: 'warm_us', channel: 'tiktok_feed', daily_budget_cents: 15_000, live_days: 2 },
  { ad_id: 'a_12', name: 'Product demo · cold', video_id: 'v_04', headline_id: 'h_04', audience_id: 'cold_us', channel: 'meta_feed', daily_budget_cents: 9_000, live_days: 7 },
];
