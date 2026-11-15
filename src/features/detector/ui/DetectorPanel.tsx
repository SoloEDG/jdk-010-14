import type { Element, LabDocument, EnergyLedger } from "../../../shared/document";
import { labels } from "../../../shared/document";
import type { Measurement } from "../lib/measurement";
import { wavelengthColor } from "../../optics/lib/emission";
import { EnergyChart } from "./EnergyChart";

const pct = (v: number, total: number) =>
  total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";

const pendingLabel: Record<string, string> = {
  budget: "能量预算",
  depth: "路径深度",
  capacity: "支路容量",
};

export function DetectorPanel({
  screen,
  screens,
  measurement: m,
  ledger,
  doc,
  onChoose,
  resolution,
  onResolution,
}: {
  screen?: Element;
  screens: Element[];
  measurement: Measurement;
  ledger: EnergyLedger;
  doc: LabDocument;
  onChoose: (id: string) => void;
  resolution: number;
  onResolution: (n: number) => void;
}) {
  const total = ledger.emitted;
  const pending = ledger.pending.reduce((s, p) => s + p.power, 0);
  const nameOf = (id: string) => {
    const idx = doc.items.findIndex((e) => e.id === id);
    const el = doc.items[idx];
    return el ? `${labels[el.kind]} ${idx + 1}` : "器件";
  };
  return (
    <section className="detector">
      <div className="section-title">
        接收屏分析 <span className="live-dot">实时测量</span>
      </div>
      <div className="detector-body">
        <div className="chart-wrap">
          <div className="chart-heading">
            <select
              aria-label="接收屏"
              value={screen?.id ?? ""}
              onChange={(e) => onChoose(e.target.value)}
            >
              {screens.length ? (
                screens.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    接收屏 {i + 1}
                  </option>
                ))
              ) : (
                <option value="">尚无接收屏</option>
              )}
            </select>
            <select
              aria-label="采样精度"
              value={resolution}
              onChange={(e) => onResolution(Number(e.target.value))}
            >
              <option value="32">32 区间</option>
              <option value="64">64 区间</option>
              <option value="128">128 区间</option>
            </select>
          </div>
          <EnergyChart measurement={m} />
          <div className="chart-axis">
            <span>−{(screen?.size ?? 0) / 2} mm</span>
            <span>光轴中心</span>
            <span>+{(screen?.size ?? 0) / 2} mm</span>
          </div>
        </div>
        <div className="measurements">
          <div>
            <small>接收能量</small>
            <strong>
              {m.energy.toFixed(3)} <em>W</em>
            </strong>
          </div>
          <div>
            <small>光斑 RMS 半径</small>
            <strong>
              {Number.isFinite(m.spread) ? m.spread.toFixed(2) : "—"} <em>mm</em>
            </strong>
          </div>
          <div>
            <small>命中支路</small>
            <strong>
              {m.count} <em>条</em>
            </strong>
          </div>
        </div>

        {m.bySource.length > 0 && (
          <div className="source-breakdown">
            <div className="subhead">支路来源（按光源）</div>
            {m.bySource.map((s) => (
              <div className="source-row" key={s.source}>
                <i style={{ background: wavelengthColor(s.wavelength) }} />
                <span>
                  {s.wavelength} nm · {s.branches} 条支路
                </span>
                <b>
                  {s.energy.toFixed(3)} W（{pct(s.energy, total)}%）
                </b>
              </div>
            ))}
          </div>
        )}

        {m.paths.length > 0 && (
          <div className="path-breakdown">
            <div className="subhead">支路路径（前 5 条）</div>
            {m.paths.slice(0, 5).map((p, i) => (
              <div className="path-row" key={i}>
                <span>
                  {p.branch.length
                    ? p.branch
                        .map((s) => `${nameOf(s.element)}${s.way === "reflect" ? "反射" : "透射"}`)
                        .join(" → ")
                    : "直射"}
                </span>
                <b>{p.power.toFixed(4)} W</b>
              </div>
            ))}
          </div>
        )}

        <div className="energy-budget">
          <div className="subhead">能量预算与损失统计</div>
          <div className="budget-bar" role="img" aria-label="能量分配">
            <i className="received" style={{ width: `${pct(ledger.received, total)}%` }} />
            <i className="absorbed" style={{ width: `${pct(ledger.absorbed, total)}%` }} />
            <i className="escaped" style={{ width: `${pct(ledger.escaped, total)}%` }} />
            <i className="pending" style={{ width: `${pct(pending, total)}%` }} />
          </div>
          <ul className="ledger-list">
            <li><i className="dot received" />接收 <b>{pct(ledger.received, total)}%</b></li>
            <li><i className="dot absorbed" />吸收 <b>{pct(ledger.absorbed, total)}%</b></li>
            <li><i className="dot escaped" />逃逸 <b>{pct(ledger.escaped, total)}%</b></li>
            <li><i className="dot pending" />未决 <b>{pct(pending, total)}%</b></li>
          </ul>
          {pending > 0 && (
            <div className="pending-range">
              未决能量 {pending.toFixed(4)} W：接收能量区间{" "}
              <b>
                {ledger.received.toFixed(3)} –{" "}
                {(ledger.received + pending).toFixed(3)} W
              </b>
              <div className="pending-reasons">
                {ledger.pending.map((p, i) => (
                  <span key={i}>
                    {pendingLabel[p.reason]}（{p.power.toFixed(4)} W
                    {p.element ? ` · 截于 ${nameOf(p.element)}` : ""}）
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
