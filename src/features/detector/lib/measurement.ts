import type { Element, ScreenHit, BranchStep } from "../../../shared/document";
export interface SourceBreakdown {
  source: string;
  wavelength: number;
  energy: number;
  branches: number;
}
export interface Measurement {
  bins: number[];
  energy: number;
  centroid: number;
  spread: number;
  count: number;
  peak: number;
  /** 按来源光源分组的能量与支路数（屏上保留支路来源） */
  bySource: SourceBreakdown[];
  /** 命中所经过的不同支路路径（用于展示支路来源） */
  paths: { branch: BranchStep[]; power: number }[];
}
export function measure(
  screen: Element | undefined,
  hits: ScreenHit[],
  resolution: number,
): Measurement {
  const valid = screen ? hits.filter((h) => h.screen === screen.id) : [];
  const bins = Array<number>(resolution).fill(0);
  let energy = 0,
    centroid = 0;
  const sourceMap = new Map<string, SourceBreakdown>();
  const pathMap = new Map<string, { branch: BranchStep[]; power: number }>();
  for (const h of valid) {
    const i = Math.max(
      0,
      Math.min(
        resolution - 1,
        Math.floor((h.position / screen!.size + 0.5) * resolution),
      ),
    );
    bins[i] += h.power;
    energy += h.power;
    centroid += h.position * h.power;
    const cur =
      sourceMap.get(h.source) ??
      ({ source: h.source, wavelength: h.wavelength, energy: 0, branches: 0 });
    cur.energy += h.power;
    cur.branches += 1;
    sourceMap.set(h.source, cur);
    const key = h.branch.map((s) => `${s.element}:${s.way}`).join(">");
    const p = pathMap.get(key) ?? { branch: h.branch, power: 0 };
    p.power += h.power;
    pathMap.set(key, p);
  }
  centroid = energy ? centroid / energy : 0;
  const spread = energy
    ? Math.sqrt(
        valid.reduce((s, h) => s + (h.position - centroid) ** 2 * h.power, 0) /
          energy,
      )
    : 0;
  return {
    bins,
    energy,
    centroid,
    spread,
    count: valid.length,
    peak: Math.max(0, ...bins),
    bySource: [...sourceMap.values()].sort((a, b) => b.energy - a.energy),
    paths: [...pathMap.values()].sort((a, b) => b.power - a.power),
  };
}
