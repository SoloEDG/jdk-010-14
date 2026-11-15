import type { Element, Point } from "../../../shared/document";
import { dot, mul, sub, add, norm } from "../../../shared/geometry";

export function reflect(d: Point, n: Point): Point {
  return norm(sub(d, mul(n, 2 * dot(d, n))));
}
export function refract(
  d: Point,
  normal: Point,
  n1: number,
  n2: number,
): Point | null {
  const n = dot(d, normal) > 0 ? mul(normal, -1) : normal,
    c = -dot(d, n),
    ratio = n1 / n2,
    k = 1 - ratio * ratio * (1 - c * c);
  return k < 0
    ? null
    : norm(add(mul(d, ratio), mul(n, ratio * c - Math.sqrt(k))));
}
export function materialIndex(base: number, wavelength: number) {
  return base + 0.004 * ((550 / wavelength) ** 2 - 1);
}

/** 入射角（弧度，0..π/2）：光线方向与界面法线的夹角 */
export function incidenceAngle(d: Point, normal: Point): number {
  return Math.acos(Math.min(1, Math.abs(dot(d, norm(normal)))));
}

/**
 * 界面功率分配 R/T/A，随波长与入射角变化，且 R+T+A = 1。
 *
 * 两种模型：
 * - prism（无镀膜玻璃界面）：Fresnel 方程，非偏振光取 s/p 平均；
 *   全反射时 R=1。色散通过 materialIndex 随波长变化。
 * - mirror / lens 的 physical 镀膜：以正入射、550nm 的名义 R0、A0 为锚点，
 *   用 Fresnel 型角度因子抬升掠入射反射、用弱色散项表示镀膜的波长选择，
 *   归一化保证能量守恒；T0 = 1 - R0 - A0。
 */
export interface SurfaceRT {
  r: number;
  t: number;
  a: number;
  /** 该次折射是否为全内反射（物理上无透射支路） */
  tir: boolean;
}

function fresnelUnpolarized(
  n1: number,
  n2: number,
  theta: number,
): { r: number; tir: boolean } {
  const sinT2 = (n1 / n2) ** 2 * Math.sin(theta) ** 2;
  if (sinT2 >= 1) return { r: 1, tir: true };
  const cosI = Math.cos(theta),
    cosT = Math.sqrt(1 - sinT2);
  const rs = ((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT)) ** 2;
  const rp = ((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI)) ** 2;
  return { r: (rs + rp) / 2, tir: false };
}

/** 三棱镜玻璃界面：波长相关折射率 + Fresnel，无吸收 */
export function prismSurface(
  e: Element,
  wavelength: number,
  theta: number,
  exiting: boolean,
): SurfaceRT {
  const n = materialIndex(e.index, wavelength);
  const { r, tir } = fresnelUnpolarized(exiting ? n : 1, exiting ? 1 : n, theta);
  return { r, t: tir ? 0 : 1 - r, a: 0, tir };
}

/** 镀膜器件（镜面/透镜）：名义 R0/A0 锚点 + 角度与波长调制 */
export function coatedSurface(
  e: Element,
  wavelength: number,
  theta: number,
): SurfaceRT {
  const r0 = clamp01(e.r0);
  const a0 = clamp01(e.a0);
  const t0 = Math.max(0, 1 - r0 - a0);
  const sin2 = Math.sin(theta) ** 2;
  // 角度因子：正入射时均为 1（锚点）。镀膜为工程化分光膜，角度依赖被刻意做得很弱，
  // 使 50/50 分光片在常见的 45° 布置下仍近似平衡；仅在掠入射时反射才明显抬升。
  const gR = 1 + 0.6 * sin2 * sin2;
  const gT = 1 / (1 + 0.4 * sin2);
  // 波长色散项：以 550nm 为中心的弱调制，体现镀膜的波长选择
  const chroma = 1 + 0.12 * ((550 / wavelength) ** 2 - 1);
  let r = r0 * gR * chroma;
  let a = a0;
  let t = t0 * gT / chroma;
  const sum = r + t + a;
  // 归一化，严格保证 R+T+A = 1
  r /= sum;
  t /= sum;
  a /= sum;
  return { r: clamp01(r), t: clamp01(t), a: clamp01(a), tir: false };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
