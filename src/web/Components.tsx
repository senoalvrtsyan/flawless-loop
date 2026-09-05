// The Workbench's one read-only screen — B56 / P15, `DESIGN.md` §8, and **D1's sketch made real**.
//
// `SCOPE.md` puts the Workbench's builder and variant model behind the cut line; what survives is
// this: the component library, and **the reverse join** — *"used in N ads right now"*. It is the
// smallest surface that makes the model's third distinction visible, because it is the only place
// a reader sees that a component is a thing with an identity and a lineage rather than a string
// inside an ad.
//
// **What makes it worth a screen rather than a paragraph** is §8's last property, and it is a
// property of the write path, not of this file: *"kept current as ads launch and die falls out of
// the write path rather than needing machinery — `ads.status` is written only by the fold."* Pause
// an ad in the console above and this count drops. Nothing recomputes a cache and no index is
// maintained; the fold moved, and this is a read of the fold. That is HR6 demonstrated rather than
// claimed, and it is why the caption below says which lever to pull.
//
// **Per lineage as the headline, per version beneath** (§8). The seed carries one lineage with two
// versions (D3) specifically so this is a real answer on screen: *"Product demo, 30s — 2 versions,
// live in 3 ads"*, with v1 in two of them and v2 in the third.
//
// **What is NOT answerable here, stated rather than hidden** — G38's three questions. "Used in N
// ads at time T" and "used in N ads ever" are one join away (`config_generations` exists for D14's
// sake regardless) and are a scope cut, not a modelling gap. The README carries the real query.

import { useEffect, useState } from 'react';
import type { LineageUsage } from '../server/components.ts';

export async function fetchComponentUsage(signal: AbortSignal): Promise<LineageUsage[]> {
  const res = await fetch('/api/components/usage', { signal });
  if (!res.ok) throw new Error(`components/usage: ${res.status} ${res.statusText}`);
  return ((await res.json()) as { lineages: LineageUsage[] }).lineages;
}

export type ComponentsProps = {
  /**
   * Bumped whenever a lever lands, so the counts follow the fold rather than the page load. It is
   * the SAME counter that re-runs §3.1 from step 1 — one signal, so the portfolio, the chart and
   * this screen cannot disagree about which decision they are downstream of.
   */
  generation: number;
};

export function Components({ generation }: ComponentsProps) {
  const [lineages, setLineages] = useState<readonly LineageUsage[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchComponentUsage(controller.signal)
      .then((rows) => {
        setLineages(rows);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('[components] usage read failed', err);
        setFailed(true);
      });
    return () => controller.abort();
  }, [generation]);

  if (failed) return <p className="log__none">the component usage read failed — the rest of the page is unaffected.</p>;
  if (lineages.length === 0) return <p className="log__none">no components in this store.</p>;

  return (
    <>
      {/* **D75.** Kept the demo beat, dropped §8's justification for not maintaining an index. */}
      <p className="gate">
        <strong>Pause an ad above and a count here drops</strong> — the join is computed on read.
      </p>
      <ul className="lineages">
        {lineages.map((lineage) => (
          <li key={lineage.lineage_id} className="lineages__item">
            <div className="lineages__head">
              <strong>{lineage.name}</strong>{' '}
              <span className="boundaries__meta">
                {lineage.kind} · <code>{lineage.lineage_id}</code>
              </span>{' '}
              — <strong>{lineage.versions.length}</strong> version
              {lineage.versions.length === 1 ? '' : 's'}, live in{' '}
              <strong>{lineage.live_ads}</strong> ad{lineage.live_ads === 1 ? '' : 's'}
              {lineage.paused_ads > 0 ? (
                <>
                  {' '}·{' '}
                  {/* "Nothing is using this" and "a paused ad is using this" are different facts,
                      and a screen that showed both as 0 would make a paused component look
                      retired. §8's own SQL filters to `live`; this splits instead. */}
                  <span className="lineages__paused">{lineage.paused_ads} paused</span>
                </>
              ) : null}
              {lineage.ad_ids.length === 0 ? (
                <span className="boundaries__meta"> · not bound to any ad</span>
              ) : (
                <span className="boundaries__meta">
                  {' '}
                  · {lineage.ad_ids.map((id) => <code key={id}>{id} </code>)}
                </span>
              )}
            </div>
            {/* The breakdown only earns its space where there is more than one version. A lineage
                with one version would repeat its own headline, which is noise on a screen whose
                whole point is that versioning is visible. */}
            {lineage.versions.length > 1 ? (
              <ul className="lineages__versions">
                {lineage.versions.map((v) => (
                  <li key={v.component_id}>
                    <code>v{v.version}</code> <code>{v.component_id}</code> — {v.payload}
                    {v.parent_id === null ? null : (
                      <span className="boundaries__meta"> · cut from <code>{v.parent_id}</code></span>
                    )}
                    {' '}· live in <strong>{v.live_ads}</strong>
                    {v.paused_ads > 0 ? <span className="lineages__paused"> · {v.paused_ads} paused</span> : null}
                    {v.ad_ids.length === 0 ? null : (
                      <span className="boundaries__meta"> · {v.ad_ids.join(' ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {/* **D75.** G38's other two questions — *at time T* and *ever* — are a named scope cut, and
          the README carries both the reasoning and the query. The surface keeps only the scope of
          what it is actually showing. */}
      <p className="gate">
        counts are <em>current config</em> — a component an ad has swapped away from is not here.
      </p>
    </>
  );
}
