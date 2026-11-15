import { test } from "node:test";
import assert from "node:assert/strict";
import type { Element, LabDocument } from "../src/shared/document";
import {
  reflect,
  refract,
  coatedSurface,
  prismSurface,
  incidenceAngle,
} from "../src/features/optics/lib/refraction";
import {
  trace,
  MAX_DEPTH,
  MAX_BRANCHES,
  BUDGET_RATIO,
} from "../src/features/optics/lib/trace";
import { evaluateMission } from "../src/features/missions/lib/evaluate";

const base = (id: string, kind: Element["kind"], patch: Partial<Element>): Element => ({
  id,
  kind,
  x: 0,
  y: 0,
  angle: 90,
  size: 200,
  power: 1,
  rays: 9,
  spread: 0,
  wavelength: 550,
  focal: 180,
  index: 1.52,
  coating: "ideal",
  r0: 0.5,
  a0: 0,
  ...patch,
});

const doc = (items: Element[]): LabDocument => ({ version: 1, items });

test("reflection preserves norm and reverses the normal component", () => {
  const r = reflect({ x: 1, y: 0 }, { x: -1, y: 0 });
  assert.deepEqual(r, { x: -1, y: 0 });
});

test("total internal reflection returns no transmitted direction", () =>
  assert.equal(refract({ x: 0.8, y: 0.6 }, { x: 0, y: -1 }, 1.5, 1), null));

test("coated surface conserves energy R+T+A=1 across wavelengths and angles", () => {
  const e = base("m", "mirror", { coating: "physical", r0: 0.6, a0: 0.1 });
  for (const wl of [400, 550, 700])
    for (const theta of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2 - 0.01]) {
      const rt = coatedSurface(e, wl, theta);
      assert.ok(Math.abs(rt.r + rt.t + rt.a - 1) < 1e-9);
      assert.ok(rt.r >= 0 && rt.t >= 0 && rt.a >= 0);
    }
});

test("coating matches nominal R0/A0 anchor at normal incidence and 550nm", () => {
  const e = base("m", "mirror", { coating: "physical", r0: 0.7, a0: 0.2 });
  const rt = coatedSurface(e, 550, 0);
  assert.ok(Math.abs(rt.r - 0.7) < 1e-9);
  assert.ok(Math.abs(rt.a - 0.2) < 1e-9);
  assert.ok(Math.abs(rt.t - 0.1) < 1e-9);
});

test("grazing incidence raises reflectance relative to normal incidence", () => {
  const e = base("m", "mirror", { coating: "physical", r0: 0.5, a0: 0 });
  const normal = coatedSurface(e, 550, 0);
  const grazing = coatedSurface(e, 550, Math.PI / 2 - 0.02);
  assert.ok(grazing.r > normal.r);
});

test("coating response changes with wavelength (chroma)", () => {
  const e = base("l", "lens", { coating: "physical", r0: 0.2, a0: 0 });
  const blue = coatedSurface(e, 420, 0.3);
  const red = coatedSurface(e, 700, 0.3);
  assert.notEqual(blue.r, red.r);
});

test("Fresnel prism surface is lossless and reaches TIR at steep angle", () => {
  const p = base("p", "prism", { coating: "physical" });
  const shallow = prismSurface(p, 550, 0.1, true);
  assert.ok(Math.abs(shallow.r + shallow.t - 1) < 1e-9);
  assert.equal(shallow.a, 0);
  assert.equal(shallow.tir, false);
  const steep = prismSurface(p, 550, Math.PI / 2 - 0.01, true);
  assert.equal(steep.tir, true);
  assert.equal(steep.r, 1);
  assert.equal(steep.t, 0);
});

test("physical beam splitter produces two branches that each reach a screen", () => {
  const d = doc([
    base("src", "source", { x: 100, y: 300, angle: 0, size: 40, rays: 5 }),
    base("bs", "mirror", {
      x: 480,
      y: 300,
      angle: -45,
      size: 260,
      coating: "physical",
      r0: 0.5,
      a0: 0,
    }),
    base("s1", "screen", { x: 850, y: 300, size: 260 }),
    base("s2", "screen", { x: 480, y: 120, angle: 0, size: 260 }),
  ]);
  const r = trace(d);
  const s1 = r.hits.filter((h) => h.screen === "s1");
  const s2 = r.hits.filter((h) => h.screen === "s2");
  assert.ok(s1.length > 0, "透射支路应到达透射屏");
  assert.ok(s2.length > 0, "反射支路应到达反射屏");
  // 屏命中保留支路来源
  assert.ok(s1.every((h) => h.branch.some((b) => b.way === "transmit")));
  assert.ok(s2.every((h) => h.branch.some((b) => b.way === "reflect")));
  // 无吸收半透半反：两屏能量之和守恒，角度依赖允许两路不严格相等
  const e1 = s1.reduce((s, h) => s + h.power, 0);
  const e2 = s2.reduce((s, h) => s + h.power, 0);
  assert.ok(e1 > 0 && e2 > 0);
  assert.ok(Math.abs(e1 + e2 - r.ledger.emitted) < 1e-9);
});

test("branches continue to encounter devices after splitting (chained splitters)", () => {
  const d = doc([
    base("src", "source", { x: 80, y: 300, angle: 0, size: 30, rays: 3 }),
    base("bs1", "mirror", { x: 350, y: 300, angle: 45, coating: "physical", r0: 0.5 }),
    base("bs2", "mirror", { x: 620, y: 300, angle: 45, coating: "physical", r0: 0.5 }),
    base("s1", "screen", { x: 850, y: 300 }),
  ]);
  const r = trace(d);
  // 至少一条支路经过两个分光器件（branch 长度 >= 2）
  assert.ok(r.hits.some((h) => h.branch.length >= 2));
});

test("energy ledger conserves total power including absorption and escape", () => {
  const d = doc([
    base("src", "source", { x: 100, y: 300, angle: 0, size: 40, rays: 5 }),
    base("m", "mirror", {
      x: 450,
      y: 300,
      angle: 60,
      coating: "physical",
      r0: 0.6,
      a0: 0.2,
    }),
  ]);
  const r = trace(d);
  const L = r.ledger;
  const pending = L.pending.reduce((s, p) => s + p.power, 0);
  const accounted = L.received + L.absorbed + L.escaped + pending;
  assert.ok(Math.abs(accounted - L.emitted) < L.emitted * 1e-6 + 1e-9);
  assert.ok(L.absorbed > 0, "应有吸收损失");
});

test("ideal mirror and lens keep the original lossless model", () => {
  const d = doc([
    base("src", "source", { x: 100, y: 300, angle: 0, size: 100, rays: 9 }),
    base("l", "lens", { x: 400, y: 300, focal: 150, size: 200 }),
    base("sc", "screen", { x: 550, y: 300, size: 200 }),
  ]);
  const r = trace(d);
  assert.equal(r.hits.length, 9);
  assert.ok(r.hits.every((h) => Math.abs(h.position) < 0.01));
  assert.equal(r.ledger.absorbed, 0);
  assert.equal(r.ledger.pending.length, 0);
});

test("ideal prism keeps fixed 4% attenuation per interface", () => {
  const d = doc([
    base("src", "source", { x: 130, y: 280, angle: 0, size: 45, rays: 3 }),
    base("p", "prism", { x: 490, y: 300, angle: -90, size: 170 }),
    // 屏面朝向折射光束（光线向下偏折约 59°），足够大以容纳全部光线
    base("sc", "screen", { x: 900, y: 820, angle: 149, size: 560 }),
  ]);
  const r = trace(d);
  const received = r.hits.reduce((s, h) => s + h.power, 0);
  // 理想棱镜进、出两个界面各衰减 4%：0.96^2
  assert.ok(received > 0, "朝向折射光的屏应捕获折射光束");
  assert.ok(Math.abs(received - r.ledger.emitted * 0.96 * 0.96) < r.ledger.emitted * 1e-6);
  assert.ok(
    Math.abs(r.ledger.absorbed - r.ledger.emitted * (1 - 0.96 * 0.96)) <
      r.ledger.emitted * 1e-6,
  );
});

test("energy budget does not silently drop weak branches; power lands in pending", () => {
  // 镜腔 + 强吸收：弱反射支路在两镜间反复反弹，功率逐次衰减，直到跌破预算
  const d = doc([
    base("src", "source", { x: 120, y: 300, angle: 0, size: 10, rays: 1 }),
    base("m1", "mirror", {
      x: 420,
      y: 300,
      angle: 90,
      coating: "physical",
      r0: 0.2,
      a0: 0.7,
    }),
    base("m2", "mirror", {
      x: 280,
      y: 300,
      angle: 90,
      coating: "physical",
      r0: 0.2,
      a0: 0.7,
    }),
  ]);
  const r = trace(d);
  const budgetPending = r.ledger.pending.filter((p) => p.reason === "budget");
  assert.ok(budgetPending.length > 0, "低于预算的支路应进入未决而非消失");
  const accounted =
    r.ledger.received +
    r.ledger.absorbed +
    r.ledger.escaped +
    r.ledger.pending.reduce((s, p) => s + p.power, 0);
  assert.ok(Math.abs(accounted - r.ledger.emitted) < 1e-9);
});

test("depth truncation records pending at MAX_DEPTH in a mirror cavity", () => {
  // 近完美反射镜 + 浅楔形镜腔：单条光线几乎无损地往返，直至路径深度上限
  const d = doc([
    base("src", "source", { x: 100, y: 300, angle: 0, size: 10, rays: 1 }),
    base("m1", "mirror", {
      x: 420,
      y: 300,
      angle: -1.5,
      size: 1000,
      coating: "physical",
      r0: 1,
      a0: 0,
    }),
    base("m2", "mirror", {
      x: 640,
      y: 300,
      angle: 1.5,
      size: 1000,
      coating: "physical",
      r0: 1,
      a0: 0,
    }),
  ]);
  const r = trace(d);
  const depthPending = r.ledger.pending.filter((p) => p.reason === "depth");
  assert.ok(depthPending.length > 0, "镜腔多次反射应在 MAX_DEPTH 处触发深度截断");
  assert.ok(depthPending.every((p) => p.depth === MAX_DEPTH));
  assert.ok(MAX_DEPTH === 48 && BUDGET_RATIO === 1e-4);
});

test("capacity truncation bounds branch count and reports segmentCap", () => {
  // 多光源采样光线各自形成分光树：支路增长快于能量预算剪枝，从而触发容量上限
  const items: Element[] = [
    base("src", "source", { x: 60, y: 300, angle: 0, size: 400, rays: 41 }),
  ];
  for (let i = 0; i < 12; i++)
    items.push(
      base(`m${i}`, "mirror", {
        x: 220 + i * 60,
        y: 300,
        angle: -45,
        size: 600,
        coating: "physical",
        r0: 0.5,
        a0: 0,
      }),
    );
  const r = trace(doc(items));
  // 容量上限被触发并显式上报，剩余在途功率整笔进入 capacity 未决
  assert.equal(r.segmentCap, MAX_BRANCHES);
  const capacityPending = r.ledger.pending.filter((p) => p.reason === "capacity");
  assert.ok(capacityPending.length > 0);
  // 分支总数受 MAX_BRANCHES 约束，不会无限增长拖垮浏览器
  const totalBranches = r.segments.length + r.truncated;
  assert.ok(totalBranches <= MAX_BRANCHES + r.hits.length + 2);
  // 容量截断下能量仍然守恒
  const accounted =
    r.ledger.received +
    r.ledger.absorbed +
    r.ledger.escaped +
    r.ledger.pending.reduce((s, p) => s + p.power, 0);
  assert.ok(Math.abs(accounted - r.ledger.emitted) < 1e-9);
});

test("mission only completes on provable lower bound when pending energy exists", () => {
  // 强吸收制造未决能量，使反射屏的实测下界低于 80%
  const d = doc([
    base("src", "source", { x: 150, y: 370, angle: 0, size: 60, rays: 5 }),
    base("m", "mirror", {
      x: 500,
      y: 370,
      angle: -35,
      coating: "physical",
      r0: 0.5,
      a0: 0.4,
    }),
    base("sc", "screen", { x: 500, y: 100, angle: 0, size: 200 }),
  ]);
  const r = trace(d);
  const ev = evaluateMission("reflection", d, r);
  if (ev.pendingPower > 0) {
    assert.notEqual(ev.status, "proven", "存在未决能量且下界不达标时不能判定完成");
    assert.ok(ev.ratioUpper >= ev.ratio);
  }
});

test("splitter mission completes when both screens provably exceed 30%", () => {
  const d = doc([
    base("src", "source", { x: 120, y: 300, angle: 0, size: 40, rays: 9 }),
    base("bs", "mirror", {
      x: 480,
      y: 300,
      angle: -45,
      size: 260,
      coating: "physical",
      r0: 0.5,
      a0: 0,
    }),
    base("s1", "screen", { x: 850, y: 300, size: 260 }),
    base("s2", "screen", { x: 480, y: 120, angle: 0, size: 260 }),
  ]);
  const r = trace(d);
  const ev = evaluateMission("splitter", d, r);
  assert.equal(ev.status, "proven");
  assert.equal(ev.complete, true);
  assert.ok(ev.screens.length === 2);
  assert.ok(ev.screens.every((s) => s.ratio >= 0.3 - 1e-9));
});

test("incidence angle is zero for head-on ray and near 90 degrees at grazing", () => {
  assert.ok(Math.abs(incidenceAngle({ x: 1, y: 0 }, { x: -1, y: 0 })) < 1e-9);
  assert.ok(
    Math.abs(incidenceAngle({ x: 0.01, y: 1 }, { x: 1, y: 0 }) - Math.PI / 2) < 0.02,
  );
});
