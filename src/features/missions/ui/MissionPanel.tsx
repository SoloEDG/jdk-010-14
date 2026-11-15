import { Check, ArrowUpRight, Target, Hourglass, X } from "lucide-react";
import { missions } from "../model/presets";
import type { evaluateMission } from "../lib/evaluate";
export function MissionPanel({
  mission,
  evaluation,
  onChoose,
}: {
  mission: (typeof missions)[number];
  evaluation: ReturnType<typeof evaluateMission>;
  onChoose: (id: string) => void;
}) {
  const icon =
    evaluation.status === "proven" ? (
      <Check size={15} />
    ) : evaluation.status === "pending" ? (
      <Hourglass size={15} />
    ) : (
      <X size={15} />
    );
  const statusText =
    evaluation.status === "proven"
      ? "实验完成 · 测量已证明满足条件"
      : evaluation.status === "pending"
        ? "未决：存在被截断能量，尚不能证明满足条件"
        : "无法达成：即使未决能量全部到达也不满足";
  return (
    <section className="mission-panel">
      <div className="section-title">
        实验任务 <Target size={15} />
      </div>
      <div className="mission-tabs">
        {missions.map((m, i) => (
          <button
            key={m.id}
            className={m.id === mission.id ? "active" : ""}
            onClick={() => onChoose(m.id)}
          >
            {String(i + 1).padStart(2, "0")}
          </button>
        ))}
      </div>
      <span className="tag">{mission.tag}</span>
      <h2>
        {mission.name}
        <ArrowUpRight size={19} />
      </h2>
      <p>{mission.description}</p>
      <div className={`mission-condition ${evaluation.status}`}>
        {icon}
        <span>{mission.condition}</span>
      </div>
      <div className="progress-track">
        <i
          className={evaluation.status}
          style={{ width: `${evaluation.progress * 100}%` }}
        />
      </div>
      <small className={evaluation.status === "proven" ? "success" : "muted"}>
        {statusText}
      </small>
      <div className="mission-energy">
        <span>
          实测接收占比 <b>{(evaluation.ratio * 100).toFixed(1)}%</b>
        </span>
        <span>
          未决上界 <b>{(evaluation.ratioUpper * 100).toFixed(1)}%</b>
        </span>
      </div>
      {evaluation.status === "pending" && (
        <p className="mission-note">
          未决能量 {evaluation.pendingPower.toFixed(4)} W
          去向未定，只有下界达标才能完成任务。
        </p>
      )}
      <button className="reset-mission" onClick={() => onChoose(mission.id)}>
        重置本次实验 ↗
      </button>
    </section>
  );
}
