// `npm run sim -- --dry-run` — the simulator's verification surface for the whole of stage 3.
//
// Every stage-3 plan item's "verify by hand" is a comparison against a table that is already in
// `SIMULATOR.md`, so this prints the model's own numbers in the shape those tables are written in
// and lets the reader diff them by eye. It is not a test: nothing here asserts. The point is that
// "does it match" stays arithmetic rather than judgement.
//
// It emits NOTHING. No POST, no store, no side effect — the dry run is a pure function of the seed
// and the clock, which is also why it can print an `expected` column at all.
//
// Sections land per chunk: B25's arrival process here, fatigue (B26) and the click/cost/spend path
// (B27) appended below it.

import { ACCOUNT_TZ } from '../shared/config.ts';
import { ADS, COMPONENTS } from './fixtures.ts';
import { BASE_IMPR_PER_DAY, DIURNAL, DOW_VOLUME, FATIGUE } from './params.ts';
import {
  adFatigue,
  nominalAccrual,
  pairKey,
  phi,
  pool,
  readPairKey,
  rest,
  versionAdjusted,
} from './fatigue.ts';
import { diurnal, dowVolume, localHour, localMs, localWeekday, lambdaPerSecond, negBinomial } from './rate.ts';
import type { Channel } from '../shared/decisions.ts';

export type DryRunOptions = { seed: string; hours: number; fromMs: number };

/** §7.2's table, quoted so the computed accrual can be diffed against it rather than described. */
const SEVEN_TWO: Readonly<Record<string, { f: number; phi: number }>> = {
  [pairKey('vl_04', 'rt_us')]: { f: 17.92, phi: 0.25 },
  [pairKey('vl_03', 'rt_us')]: { f: 2.02, phi: 0.62 },
  [pairKey('vl_01', 'cold_us')]: { f: 4.03, phi: 0.43 },
  [pairKey('vl_01', 'warm_us')]: { f: 0.38, phi: 0.91 },
  [pairKey('vl_02', 'warm_us')]: { f: 1.62, phi: 0.68 },
  [pairKey('vl_05', 'warm_us')]: { f: 0.06, phi: 0.98 },
};

/** §18.3's per-ad φ column, quoted for the same reason — and because it does not agree. */
const EIGHTEEN_THREE: Readonly<Record<string, number>> = {
  a_08: 0.62,
  a_01: 0.25,
  a_02: 0.43,
  a_03: 0.68,
  a_07: 0.98,
  a_09: 0.96,
};

const CHANNELS = Object.keys(DIURNAL) as Channel[];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const pad = (v: string | number, w: number): string => String(v).padStart(w);

/** The local wall clock of an instant, to the minute — so the reader can see which day it is. */
function localStamp(ms: number): string {
  return new Date(localMs(ms)).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * The most recent account-local midnight at or before `ms`. The default window start, so a 24-hour
 * dry run covers one whole local day and its hour rows line up with §4.1's hourly table.
 */
export function localMidnightAtOrBefore(ms: number): number {
  // `localHour` is fractional to the millisecond, so this ONE subtraction lands exactly on
  // midnight. Removing a sub-minute remainder as well would shift the window back by the current
  // second — which is why the default start is worth a line of its own rather than being inlined.
  return ms - localHour(ms) * 3_600_000;
}

/**
 * §3 and §4: the arrival process, hour by hour.
 *
 * `expected` is Σλ over the hour's seconds — the mean the draw is taken at, not a separate model —
 * and `drawn` is the `NegBinomial(λ, α = 8)` count actually generated, at the same absolute tick
 * indices live emission would use. The two agreeing to within a percent or two over an hour is the
 * whole check: a systematic gap means the rate equation and the draw disagree about λ.
 */
export function arrivalProcess(opts: DryRunOptions): void {
  const { seed, hours, fromMs } = opts;
  const startSec = Math.floor(fromMs / 1000);

  console.log(
    `\n=== B25 · §3 arrival process · §4 diurnal and day of week ===\n` +
      `${hours} h from ${localStamp(fromMs)} ${ACCOUNT_TZ} · seed '${seed}'\n` +
      `φ (B26) ν (B28) ρ (B32) m_channel·m_ad (B30) all held at 1.00 — this is λ's shape, not its final level\n`,
  );

  console.log(
    `  ${pad('hour', 5)}  ${pad('local', 16)}  ` +
      CHANNELS.map((c) => pad(`d_${c}`, 14)).join('  ') +
      `  ${pad('expected', 10)}  ${pad('drawn', 8)}  ${pad('ratio', 6)}`,
  );

  let totalExpected = 0;
  let totalDrawn = 0;
  const perChannel = new Map<Channel, { expected: number; drawn: number }>(
    CHANNELS.map((c) => [c, { expected: 0, drawn: 0 }]),
  );
  let dSum = 0;
  let dCount = 0;

  for (let h = 0; h < hours; h++) {
    const hourStart = startSec + h * 3_600;
    let hourExpected = 0;
    let hourDrawn = 0;

    for (const ad of ADS) {
      const bucket = perChannel.get(ad.channel);
      if (bucket === undefined) continue;
      for (let s = 0; s < 3_600; s++) {
        const tick = hourStart + s;
        const lambda = lambdaPerSecond(ad.ad_id, ad.channel, tick * 1000);
        const n = negBinomial(seed, ad.ad_id, tick, lambda);
        hourExpected += lambda;
        hourDrawn += n;
        bucket.expected += lambda;
        bucket.drawn += n;
      }
    }

    const mid = (hourStart + 1_800) * 1000;
    const shapes = CHANNELS.map((c) => diurnal(c, localHour(mid)));
    dSum += shapes.reduce((a, b) => a + b, 0);
    dCount += shapes.length;

    totalExpected += hourExpected;
    totalDrawn += hourDrawn;
    console.log(
      `  ${pad(String(new Date(localMs(mid)).getUTCHours()).padStart(2, '0'), 5)}  ` +
        `${pad(localStamp(mid), 16)}  ` +
        shapes.map((d) => pad(d.toFixed(2), 14)).join('  ') +
        `  ${pad(Math.round(hourExpected), 10)}  ${pad(hourDrawn, 8)}  ` +
        `${pad((hourDrawn / Math.max(hourExpected, 1e-9)).toFixed(3), 6)}`,
    );
  }

  console.log(`\n  Peak and trough per channel — compare against §4.1's table:`);
  for (const c of CHANNELS) {
    let peak = { h: 0, d: -Infinity };
    let trough = { h: 0, d: Infinity };
    for (let h = 0; h < 24; h++) {
      const d = diurnal(c, h);
      if (d > peak.d) peak = { h, d };
      if (d < trough.d) trough = { h, d };
    }
    const { w1, w2, Z } = DIURNAL[c];
    console.log(
      `    ${c.padEnd(14)} w1 ${w1.toFixed(2)}  w2 ${w2.toFixed(2)}  Z ${Z.toFixed(4)}  ` +
        `peak ${peak.d.toFixed(2)} @ ${String(peak.h).padStart(2, '0')}:00  ` +
        `trough ${trough.d.toFixed(2)} @ ${String(trough.h).padStart(2, '0')}:00  ` +
        `swing ${(peak.d / trough.d).toFixed(2)}×`,
    );
  }

  console.log(`\n  Per channel over the window — expected is Σλ, drawn is the NegBinomial count:`);
  for (const c of CHANNELS) {
    const b = perChannel.get(c);
    if (b === undefined || b.expected === 0) continue;
    const ads = ADS.filter((a) => a.channel === c).map((a) => a.ad_id);
    console.log(
      `    ${c.padEnd(14)} ${pad(Math.round(b.expected), 10)}  ${pad(b.drawn, 10)}  ` +
        `ratio ${(b.drawn / b.expected).toFixed(4)}  ${ads.join(' ')}`,
    );
  }

  // The nominal figure §2.3's `Impr/day` column states, before the day's shape touches it. Over a
  // whole local day the diurnal mean is 1.0 by construction (§21's Z), so `expected / nominal`
  // isolates the residual: Z normalises the 24 INTEGER hours, and a 1 s tick samples between them
  // where the curve is convex, which lifts the realised mean a fraction of a percent above 1.0.
  const nominalDay = ADS.reduce((sum, a) => sum + (BASE_IMPR_PER_DAY[a.ad_id] ?? 0), 0);
  const dow = dowVolume(fromMs + 43_200_000);
  const nominal = (nominalDay * hours * dow) / 24;
  console.log(
    `\n  window   expected ${Math.round(totalExpected)}  drawn ${totalDrawn}  ` +
      `drawn/expected ${(totalDrawn / totalExpected).toFixed(4)}\n` +
      `  nominal  Σ base_impr_per_day ${nominalDay}/day × ${hours}/24 h × w_dow ${dow.toFixed(2)} ` +
      `(${DAY_NAMES[localWeekday(fromMs + 43_200_000)]}) = ${Math.round(nominal)}\n` +
      `  expected/nominal ${(totalExpected / nominal).toFixed(4)}  ` +
      `· mean d_c over the window ${(dSum / dCount).toFixed(4)}\n` +
      `  w_dow, §4.2: ` +
      DAY_NAMES.map((d, i) => `${d} ${DOW_VOLUME[i]?.toFixed(2)}`).join('  '),
  );
}


/**
 * §7's fatigue, as §7.2 writes it: per pair, then per ad.
 *
 * Both tables here are checks, not illustrations. §7.2's six rows are quoted beside the computed
 * ones so the accrual arithmetic can be diffed digit by digit, and the per-ad table prints
 * `φ_video` and `φ_ad` in separate columns because **§18's calibration quotes the first where the
 * ratified model uses the second** — see the note this prints under it.
 */
export function fatigue(): void {
  const accrual = nominalAccrual();

  console.log(
    `\n=== B26 · §7 creative fatigue ===\n` +
      `F(lineage x audience) nominal at T0 = base_impr_per_day x live_days, summed over every ad\n` +
      `using the pair. pool = est_size x served_fraction (§6). phi(f) = ${FATIGUE.floor} + ` +
      `${FATIGUE.span}*exp(-${FATIGUE.k}*f), floored, never zero.\n`,
  );

  console.log(
    `  ${'pair'.padEnd(30)} ${pad('pool', 8)} ${pad('cum impr', 10)} ${pad('f', 7)} ${pad('phi', 7)}  §7.2`,
  );
  const rows = [...accrual.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, F] of rows) {
    const { lineage_id, audience_id } = readPairKey(key);
    const denominator = pool(audience_id);
    const f = F / denominator;
    const quoted = SEVEN_TWO[key];
    console.log(
      `  ${`${lineage_id} x ${audience_id}`.padEnd(30)} ${pad(Math.round(denominator), 8)} ` +
        `${pad(F, 10)} ${pad(f.toFixed(2), 7)} ${pad(phi(f).toFixed(4), 7)}  ` +
        (quoted === undefined
          ? ''
          : `quoted ${quoted.f.toFixed(2)} / ${quoted.phi.toFixed(2)} -> ` +
            `${Math.abs(f - quoted.f) < 0.01 && Math.abs(phi(f) - quoted.phi) < 0.005 ? 'MATCH' : 'DIFFERS'}`),
    );
  }

  console.log(
    `\n  §7.2's three claims, as arithmetic:\n` +
      `    1. one video, two audiences, one instant — vl_01 x cold_us phi ` +
      `${phi((accrual.get(pairKey('vl_01', 'cold_us')) ?? 0) / pool('cold_us')).toFixed(2)}` +
      ` vs vl_01 x warm_us phi ` +
      `${phi((accrual.get(pairKey('vl_01', 'warm_us')) ?? 0) / pool('warm_us')).toFixed(2)}\n` +
      `    2. reuse accelerates burnout — a_02 alone would sit at phi ` +
      `${phi((45_000 * 7) / pool('cold_us')).toFixed(2)}; sharing vl_01 x cold_us with a_04 puts it at ` +
      `${phi((accrual.get(pairKey('vl_01', 'cold_us')) ?? 0) / pool('cold_us')).toFixed(2)}\n` +
      `    3. a swap resets one slot only — the per-ad table below has two phi columns for that reason`,
  );

  console.log(
    `\n  ${'ad'.padEnd(6)} ${'video pair'.padEnd(26)} ${pad('f_v', 6)} ${pad('phi_v', 7)}  ` +
      `${'headline pair'.padEnd(26)} ${pad('f_h', 6)} ${pad('phi_h', 7)}  ${pad('phi_ad', 7)}  §18.3`,
  );
  for (const ad of ADS) {
    const fat = adFatigue(ad.ad_id, accrual);
    const video = COMPONENTS.find((c) => c.component_id === ad.video_id);
    const headline = COMPONENTS.find((c) => c.component_id === ad.headline_id);
    const quoted = EIGHTEEN_THREE[ad.ad_id];
    console.log(
      `  ${ad.ad_id.padEnd(6)} ` +
        `${`${video?.lineage_id} v${video?.version} x ${ad.audience_id}`.padEnd(30)} ` +
        `${pad(fat.f_video.toFixed(2), 6)} ${pad(fat.phi_video.toFixed(4), 7)}  ` +
        `${`${headline?.lineage_id} v${headline?.version} x ${ad.audience_id}`.padEnd(30)} ` +
        `${pad(fat.f_headline.toFixed(2), 6)} ${pad(fat.phi_headline.toFixed(4), 7)}  ` +
        `${pad(fat.phi_ad.toFixed(4), 7)}  ` +
        (quoted === undefined ? '' : `${quoted.toFixed(2)} = phi_v, NOT phi_ad`),
    );
  }

  console.log(
    `\n  FINDING. §18.2, §18.3 and §2.3 quote the VIDEO pair's phi as "the ad's phi". The ratified\n` +
      `  model (§7.1, D35) makes an ad's CTR multiplier phi_v^1.0 x phi_h^0.5, which is lower for\n` +
      `  every ad in the portfolio. §18.3's conv/h therefore overstate by phi_v/phi_ad. Not resolved\n` +
      `  here: the model is implemented as ratified and the calibration is reported as a finding.`,
  );

  console.log(`\n  §7.1's idle recovery, on vl_04 x rt_us (f ${(577_000 / pool('rt_us')).toFixed(2)}):`);
  const burned = accrual.get(pairKey('vl_04', 'rt_us')) ?? 0;
  const idle = [0, 1, 2, 5, 10, 20];
  console.log(
    `    ${'days idle'.padEnd(12)}` + idle.map((d) => pad(d, 8)).join('') +
      `\n    ${'f'.padEnd(12)}` +
      idle.map((d) => pad((rest(burned, d * 86_400_000) / pool('rt_us')).toFixed(2), 8)).join('') +
      `\n    ${'phi'.padEnd(12)}` +
      idle.map((d) => pad(phi(rest(burned, d * 86_400_000) / pool('rt_us')).toFixed(3), 8)).join('') +
      `\n    half-life ${FATIGUE.recoveryHalfLifeMs / 86_400_000} d — f halves at 5 d, as §21 states.` +
      ` §7.1's formula reads as a 3.47 d half-life; see fatigue.ts.`,
  );

  const fVl04 = burned / pool('rt_us');
  console.log(
    `\n  §7.3's version reset, r = ${FATIGUE.versionReset}: a_01 runs vl_04 v1 at f ${fVl04.toFixed(2)} ` +
      `phi ${phi(fVl04).toFixed(4)};\n    a_05 runs the recut v2 on the same pool at f ` +
      `${versionAdjusted(fVl04, 2).toFixed(2)} phi ${phi(versionAdjusted(fVl04, 2)).toFixed(4)} — ` +
      `pre-fatigued, which is §7.3's point.`,
  );
}
