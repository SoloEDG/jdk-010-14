import type { Element, LabDocument } from "../../../shared/document";
const e = (
  id: string,
  kind: Element["kind"],
  x: number,
  y: number,
  patch: Partial<Element> = {},
): Element => ({
  id,
  kind,
  x,
  y,
  angle: kind === "source" ? 0 : 90,
  size: 180,
  power: 1,
  rays: 9,
  spread: 0,
  wavelength: 550,
  focal: 180,
  index: 1.52,
  coating: "ideal",
  r0: kind === "mirror" ? 0.95 : 0.08,
  a0: 0.02,
  ...patch,
});
export const missions = [
  {
    id: "focus",
    name: "寻找焦点",
    tag: "透镜成像",
    description: "移动接收屏，使平行光经凸透镜后汇聚成一个清晰光斑。",
    condition: "接收 ≥ 80% 光能，RMS 半径 ≤ 3 mm",
    doc: {
      version: 1,
      items: [
        e("source", "source", 140, 300, { size: 120 }),
        e("lens", "lens", 450, 300, { size: 240 }),
        e("screen", "screen", 790, 300, { size: 230 }),
      ],
    } as LabDocument,
  },
  {
    id: "reflection",
    name: "转折的光",
    tag: "镜面反射",
    description: "调整镜面方向，把光束转向上方的接收屏。",
    condition: "接收屏捕获 ≥ 80% 光源能量",
    doc: {
      version: 1,
      items: [
        e("source", "source", 150, 370, { size: 60 }),
        e("mirror", "mirror", 500, 370, { angle: -35 }),
        e("screen", "screen", 500, 100, { angle: 0, size: 200 }),
      ],
    } as LabDocument,
  },
  {
    id: "refraction",
    name: "穿过玻璃",
    tag: "棱镜折射",
    description: "移动接收屏，捕获穿过三棱镜的折射光束。",
    condition: "经过棱镜后，接收 ≥ 60% 光源能量",
    doc: {
      version: 1,
      items: [
        e("source", "source", 130, 280, { size: 45 }),
        e("prism", "prism", 490, 300, { angle: -90, size: 170 }),
        e("screen", "screen", 800, 300, { size: 200 }),
      ],
    } as LabDocument,
  },
  {
    id: "splitter",
    name: "分光实验",
    tag: "镀膜分光",
    description:
      "把镀膜平面镜调成半透半反，使反射与透射两条支路分别到达两个接收屏。",
    condition: "两个接收屏各接收 ≥ 30% 光源能量（须证明，未决能量不计入）",
    doc: {
      version: 1,
      items: [
        e("source", "source", 120, 300, { size: 40 }),
        e("mirror", "mirror", 480, 300, {
          angle: -45,
          size: 260,
          coating: "physical",
          r0: 0.5,
          a0: 0,
        }),
        e("screen", "screen", 850, 300, { size: 260 }),
        e("screen", "screen", 480, 120, { angle: 0, size: 260 }),
      ],
    } as LabDocument,
  },
];
export const initialDocument = missions[0].doc;
