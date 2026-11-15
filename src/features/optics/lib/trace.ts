import type {
  Element,
  LabDocument,
  Point,
  TraceResult,
  Segment,
  ScreenHit,
  BranchStep,
  PendingEnergy,
  PendingReason,
} from "../../../shared/document";
import { add, mul, dot, sub, direction, norm } from "../../../shared/geometry";
import { emit } from "./emission";
import { nearestSurface } from "./surfaces";
import {
  reflect,
  refract,
  materialIndex,
  incidenceAngle,
  prismSurface,
  coatedSurface,
} from "./refraction";

/**
 * 截断语义（公开常量，帮助面板同步说明）：
 * 1. 能量预算 BUDGET_RATIO：单条支路功率低于“该光源发射总功率 × 1e-4”时，
 *    不再继续细分，其功率整笔记入未决能量（reason=budget），不会被无声吞掉。
 * 2. 路径深度 MAX_DEPTH：单条支路最多经过 48 个器件，超出记入未决（depth）。
 * 3. 可计算性 MAX_BRANCHES：单个光源最多保留 4096 条在途/已完成支路，
 *    超出时剩余在途功率整体记入未决（capacity），防止镜腔反射拖垮浏览器。
 * 所有未决功率进入 EnergyLedger.pending，并参与任务判定的“未决能量范围”。
 */
export const MAX_DEPTH = 48;
export const MAX_BRANCHES = 4096;
export const BUDGET_RATIO = 1e-4;
/** 单光源渲染段数硬上限：超过后只追迹不画图，保证界面流畅 */
export const MAX_SEGMENTS = 6000;
const ESCAPE_DISTANCE = 1800;
const EPS = 0.01;

interface Branch {
  o: Point;
  d: Point;
  power: number;
  inside: string | null;
  depth: number;
  branch: BranchStep[];
}

export function trace(doc: LabDocument): TraceResult {
  const segments: Segment[] = [];
  const hits: ScreenHit[] = [];
  const pending: PendingEnergy[] = [];
  let absorbed = 0,
    escaped = 0,
    emitted = 0,
    truncated = 0,
    segmentCap = 0;

  for (const source of doc.items.filter((e) => e.kind === "source")) {
    const rays = emit(source);
    const sourceEmitted = rays.reduce((s, r) => s + r.power, 0);
    emitted += sourceEmitted;
    const budget = sourceEmitted * BUDGET_RATIO;
    const queue: Branch[] = rays.map((ray) => ({
      o: ray.origin,
      d: ray.direction,
      power: ray.power,
      inside: null,
      depth: 0,
      branch: [],
    }));
    let branchCount = 0;
    let capacityTripped = false;

    const pushPending = (
      reason: PendingReason,
      power: number,
      element: string | null,
      depth: number,
    ) => {
      if (power <= 0) return;
      pending.push({ reason, power, source: source.id, element, depth });
      truncated++;
    };

    while (queue.length) {
      const b = queue.shift()!;

      // 闸 3：容量上限。触发后把队列中全部在途功率合并记为未决。
      if (branchCount >= MAX_BRANCHES) {
        if (!capacityTripped) {
          capacityTripped = true;
          segmentCap = MAX_BRANCHES;
        }
        const rest = b.power + queue.reduce((s, q) => s + q.power, 0);
        pushPending("capacity", rest, null, b.depth);
        queue.length = 0;
        break;
      }
      branchCount++;

      // 闸 1：能量预算，小支路挂起而非丢弃
      if (b.power < budget) {
        pushPending("budget", b.power, null, b.depth);
        continue;
      }

      const hit = nearestSurface(doc.items, b.o, b.d);
      const dest = hit?.point ?? add(b.o, mul(b.d, ESCAPE_DISTANCE));
      if (segments.length < MAX_SEGMENTS)
        segments.push({
          from: b.o,
          to: dest,
          power: b.power,
          wavelength: source.wavelength,
          source: source.id,
          branch: b.branch,
        });

      if (!hit) {
        escaped += b.power;
        continue;
      }
      const e = hit.element;

      if (e.kind === "screen") {
        hits.push({
          screen: e.id,
          position: dot(sub(hit.point, e), direction(e.angle)),
          power: b.power,
          wavelength: source.wavelength,
          source: source.id,
          branch: b.branch,
        });
        continue;
      }

      // 闸 2：路径深度
      if (b.depth >= MAX_DEPTH) {
        pushPending("depth", b.power, e.id, b.depth);
        continue;
      }

      const theta = incidenceAngle(b.d, hit.normal);
      const spawn = (
        d: Point,
        power: number,
        inside: string | null,
        way: BranchStep["way"],
      ): void => {
        queue.push({
          o: add(hit!.point, mul(d, EPS)),
          d,
          power,
          inside,
          depth: b.depth + 1,
          branch: [...b.branch, { element: e.id, way }],
        });
      };

      if (e.kind === "mirror") {
        if (e.coating === "physical") {
          const rt = coatedSurface(e, source.wavelength, theta);
          absorbed += b.power * rt.a;
          if (rt.r > 0)
            spawn(reflect(b.d, hit.normal), b.power * rt.r, b.inside, "reflect");
          if (rt.t > 0) spawn(b.d, b.power * rt.t, b.inside, "transmit");
        } else {
          // 旧理想镜面：全反射
          spawn(reflect(b.d, hit.normal), b.power, b.inside, "reflect");
        }
      } else if (e.kind === "lens") {
        const bend = (): Point => {
          const axis = direction(e.angle - 90),
            tangent = direction(e.angle),
            forward = dot(b.d, axis) >= 0 ? 1 : -1,
            u = dot(sub(hit.point, e), tangent),
            axial = Math.max(0.0001, Math.abs(dot(b.d, axis))),
            slope = dot(b.d, tangent) / axial - u / e.focal;
          return norm(add(mul(axis, forward), mul(tangent, slope)));
        };
        if (e.coating === "physical") {
          const rt = coatedSurface(e, source.wavelength, theta);
          absorbed += b.power * rt.a;
          if (rt.t > 0) spawn(bend(), b.power * rt.t, b.inside, "transmit");
          if (rt.r > 0)
            spawn(reflect(b.d, hit.normal), b.power * rt.r, b.inside, "reflect");
        } else {
          // 旧理想薄透镜：全透射、按近轴模型偏折
          spawn(bend(), b.power, b.inside, "transmit");
        }
      } else {
        // prism
        const n = materialIndex(e.index, source.wavelength);
        const exiting = b.inside === e.id;
        const transmitted = refract(
          b.d,
          hit.normal,
          exiting ? n : 1,
          exiting ? 1 : n,
        );
        if (e.coating === "physical") {
          const rt = prismSurface(e, source.wavelength, theta, exiting);
          if (rt.tir || !transmitted) {
            // 全内反射：物理上全部反射
            spawn(reflect(b.d, hit.normal), b.power, b.inside, "reflect");
          } else {
            absorbed += b.power * rt.a;
            if (rt.t > 0)
              spawn(transmitted, b.power * rt.t, exiting ? null : e.id, "transmit");
            if (rt.r > 0)
              spawn(reflect(b.d, hit.normal), b.power * rt.r, b.inside, "reflect");
          }
        } else {
          // 旧理想棱镜：Snell 折射 + 固定 4% 衰减，全反射时镜面反射
          if (transmitted) {
            spawn(transmitted, b.power * 0.96, exiting ? null : e.id, "transmit");
            absorbed += b.power * 0.04;
          } else {
            spawn(reflect(b.d, hit.normal), b.power, b.inside, "reflect");
          }
        }
      }
    }
  }

  const received = hits.reduce((s, h) => s + h.power, 0);
  const pendingPower = pending.reduce((s, p) => s + p.power, 0);
  const ledger = {
    emitted,
    received,
    absorbed,
    escaped,
    pending,
  };
  // 守恒自检（浮点容差）：已决 + 未决应等于发射
  const accounted = received + absorbed + escaped + pendingPower;
  if (emitted > 0 && Math.abs(accounted - emitted) > emitted * 1e-6 + 1e-9) {
    // 数值残差归入吸收，避免台账出现非物理缺口
    ledger.absorbed += emitted - accounted;
  }
  return { segments, hits, truncated, ledger, segmentCap };
}
