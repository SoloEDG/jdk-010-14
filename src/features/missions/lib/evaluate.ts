import type { LabDocument, TraceResult, ScreenHit } from "../../../shared/document";

export type MissionStatus = "proven" | "pending" | "impossible";

export interface MissionEvaluation {
  complete: boolean;
  status: MissionStatus;
  /** 已实测的总接收占比（下界） */
  ratio: number;
  /** 若全部未决能量都到达接收屏时的占比上界 */
  ratioUpper: number;
  rms: number;
  /** RMS 的最坏情况上界：未决能量全部落在当前屏边缘 */
  rmsUpper: number;
  progress: number;
  /** 每个接收屏的实测占比下界，用于分光任务 */
  screens: { id: string; ratio: number }[];
  pendingPower: number;
}

function rmsOf(hits: ScreenHit[]): number {
  const received = hits.reduce((s, h) => s + h.power, 0);
  if (!received) return Infinity;
  const center =
    hits.reduce((s, h) => s + h.position * h.power, 0) / received;
  return Math.sqrt(
    hits.reduce((s, h) => s + (h.position - center) ** 2 * h.power, 0) /
      received,
  );
}

export function evaluateMission(
  id: string,
  doc: LabDocument,
  result: TraceResult,
): MissionEvaluation {
  const energy = doc.items
    .filter((e) => e.kind === "source")
    .reduce((s, e) => s + e.power, 0);
  const hits = result.hits;
  const received = hits.reduce((s, h) => s + h.power, 0);
  const pendingPower = result.ledger.pending.reduce(
    (s, p) => s + p.power,
    0,
  );
  const ratio = energy ? received / energy : 0;
  const ratioUpper = energy ? (received + pendingPower) / energy : 0;
  const rms = rmsOf(hits);

  // 当前屏（取命中最多的接收屏）边缘作为未决能量的最坏落点
  const screenIds = [...new Set(hits.map((h) => h.screen))];
  const chosenScreen =
    doc.items.find((e) => e.id === screenIds[0]) ??
    doc.items.find((e) => e.kind === "screen");
  const edge = chosenScreen ? chosenScreen.size / 2 : Infinity;
  // 最坏 RMS：把未决能量放在屏边缘，与现有质心做混合方差
  const rmsUpper =
    received + pendingPower > 0 && Number.isFinite(rms)
      ? Math.sqrt(
          (received * rms * rms + pendingPower * edge * edge) /
            (received + pendingPower),
        )
      : Infinity;

  const screens = doc.items
    .filter((e) => e.kind === "screen")
    .map((s) => ({
      id: s.id,
      ratio: energy
        ? hits
            .filter((h) => h.screen === s.id)
            .reduce((sum, h) => sum + h.power, 0) / energy
        : 0,
    }));

  let proven = false;
  let possible = false;
  let progress = 0;

  if (id === "focus") {
    // 条件：ratio >= 0.8 且 RMS <= 3。下界能量达标，且最坏 RMS 仍达标才算证明
    proven = ratio >= 0.8 && rmsUpper <= 3;
    possible = ratioUpper >= 0.8;
    progress = Math.min(1, Math.min(ratio / 0.8, 3 / Math.max(3, rms)));
  } else if (id === "reflection") {
    proven = ratio >= 0.8;
    possible = ratioUpper >= 0.8;
    progress = Math.min(1, ratio / 0.8);
  } else if (id === "splitter") {
    // 两个屏各 ≥ 30%，且只能用实测下界证明
    const ranked = [...screens].sort((a, b) => b.ratio - a.ratio);
    const top2 = ranked.slice(0, 2);
    proven = top2.length === 2 && top2.every((s) => s.ratio >= 0.3);
    // 未决能量理论上仍可能把两个屏推过 30%（合计需 ≥ 60%）
    possible = ratioUpper >= 0.6 && screens.length >= 2;
    progress =
      top2.length >= 2
        ? Math.min(1, Math.min(top2[0].ratio, top2[1].ratio) / 0.3)
        : 0;
  } else {
    // refraction：ratio >= 0.6 且场景中有棱镜
    const prism = doc.items.some((e) => e.kind === "prism");
    proven = ratio >= 0.6 && prism;
    possible = ratioUpper >= 0.6 && prism;
    progress = Math.min(1, ratio / 0.6);
  }

  const status: MissionStatus = proven
    ? "proven"
    : possible
      ? "pending"
      : "impossible";
  return {
    complete: proven,
    status,
    ratio,
    ratioUpper,
    rms,
    rmsUpper,
    progress,
    screens,
    pendingPower,
  };
}
