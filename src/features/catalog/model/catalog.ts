import type { Kind, Element } from "../../../shared/document";
export const catalog: { kind: Kind; subtitle: string; symbol: string }[] = [
  { kind: "source", subtitle: "平行光束 · 可调波长", symbol: "☀" },
  { kind: "mirror", subtitle: "理想/镀膜反射 · 可分光", symbol: "╱" },
  { kind: "lens", subtitle: "薄透镜 · 镀膜透射反射", symbol: "◉" },
  { kind: "prism", subtitle: "Fresnel 折射 · 色散分光", symbol: "△" },
  { kind: "screen", subtitle: "捕获光束 · 能量分析", symbol: "▥" },
];
export function createElement(kind: Kind, count: number): Element {
  return {
    id: crypto.randomUUID(),
    kind,
    x: 200 + ((count * 63) % 600),
    y: 270 + (count % 3) * 35,
    angle: kind === "source" ? 0 : 90,
    size: kind === "source" ? 90 : kind === "prism" ? 100 : 180,
    power: 1,
    rays: 9,
    spread: 0,
    wavelength: 550,
    focal: 180,
    index: 1.52,
    // 新器件默认理想模型，保持与旧任务一致的行为
    coating: "ideal",
    r0: kind === "mirror" ? 0.95 : 0.08,
    a0: 0.02,
  };
}
