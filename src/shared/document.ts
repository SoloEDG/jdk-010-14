export type Kind = "source" | "mirror" | "lens" | "prism" | "screen";
/** 镀膜模型：ideal 恢复旧版理想反射/折射；physical 启用随波长、入射角变化的 R/T/A */
export type CoatingMode = "ideal" | "physical";
export interface Point {
  x: number;
  y: number;
}
export interface Element extends Point {
  id: string;
  kind: Kind;
  angle: number;
  size: number;
  power: number;
  rays: number;
  spread: number;
  wavelength: number;
  focal: number;
  index: number;
  /** 镀膜/界面模型，缺省按 ideal 处理以兼容旧存档 */
  coating: CoatingMode;
  /** physical 模型在正入射、550nm 下的名义反射率（镜面、透镜界面） */
  r0: number;
  /** physical 模型在正入射、550nm 下的名义吸收率，T0 = 1 - R0 - A0 */
  a0: number;
}
export interface LabDocument {
  version: 1;
  items: Element[];
}
export interface Segment {
  from: Point;
  to: Point;
  power: number;
  wavelength: number;
  source: string;
  /** 支路来源：从光源出发依次经过的器件 id 与支路类型 */
  branch: BranchStep[];
}
export interface BranchStep {
  element: string;
  way: "reflect" | "transmit";
}
export interface ScreenHit {
  screen: string;
  position: number;
  power: number;
  wavelength: number;
  source: string;
  branch: BranchStep[];
}
/** 未决（被截断）能量去向，保证小能量支路不会被无声吞掉 */
export type PendingReason = "budget" | "depth" | "capacity";
export interface PendingEnergy {
  reason: PendingReason;
  power: number;
  source: string;
  element: string | null;
  depth: number;
}
export interface EnergyLedger {
  /** 全部光源发射的总功率 */
  emitted: number;
  /** 全部接收屏实测到的功率（下界，未决能量尚未到达任何屏） */
  received: number;
  /** 被器件吸收的功率 */
  absorbed: number;
  /** 逃出实验台、无法再遇到器件的功率 */
  escaped: number;
  /** 因截断而悬置、去向未决的功率及原因 */
  pending: PendingEnergy[];
}
export interface TraceResult {
  segments: Segment[];
  hits: ScreenHit[];
  /** 被截断的支路条数（保留旧字段名，语义改为未决支路计数） */
  truncated: number;
  ledger: EnergyLedger;
  /** 实际渲染/追迹中触发的支路容量上限（0 表示未触发） */
  segmentCap: number;
}
export const labels: Record<Kind, string> = {
  source: "光源",
  mirror: "平面镜",
  lens: "凸透镜",
  prism: "三棱镜",
  screen: "接收屏",
};
/** 为旧版存档补齐镀膜字段：旧器件一律按理想模型恢复 */
export function normalizeElement(e: Partial<Element>): Element {
  return {
    id: e.id ?? crypto.randomUUID(),
    kind: e.kind ?? "mirror",
    x: e.x ?? 0,
    y: e.y ?? 0,
    angle: e.angle ?? 90,
    size: e.size ?? 180,
    power: e.power ?? 1,
    rays: e.rays ?? 9,
    spread: e.spread ?? 0,
    wavelength: e.wavelength ?? 550,
    focal: e.focal ?? 180,
    index: e.index ?? 1.52,
    coating: e.coating === "physical" ? "physical" : "ideal",
    r0: Number.isFinite(e.r0) ? clamp(e.r0!, 0, 1) : 0.5,
    a0: Number.isFinite(e.a0) ? clamp(e.a0!, 0, 1) : 0,
  } as Element;
}
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
