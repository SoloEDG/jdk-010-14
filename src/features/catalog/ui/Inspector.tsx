import { Trash2, SlidersHorizontal } from "lucide-react";
import { labels, type Element, clamp } from "../../../shared/document";
import { parameters, supportsCoating } from "../lib/parameters";
export function Inspector({
  element,
  onUpdate,
  onRemove,
}: {
  element?: Element;
  onUpdate: (patch: Partial<Element>) => void;
  onRemove: () => void;
}) {
  if (!element)
    return (
      <section className="inspector">
        <div className="section-title">
          器件属性 <SlidersHorizontal size={15} />
        </div>
        <p className="empty">
          选择实验台上的器件
          <br />
          查看并调整光学参数
        </p>
      </section>
    );
  const coatingSupported = supportsCoating(element);
  return (
    <section className="inspector">
      <div className="section-title">
        器件属性 <SlidersHorizontal size={15} />
      </div>
      <div className="selected-name">
        <i />
        {labels[element.kind]}
        <span>已选中</span>
      </div>
      <div className="coordinates">
        {(["x", "y"] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              aria-label={key + " 坐标"}
              type="number"
              min="20"
              max={key === "x" ? 980 : 580}
              value={Math.round(element[key])}
              onChange={(e) =>
                onUpdate({
                  [key]: Math.max(
                    20,
                    Math.min(key === "x" ? 980 : 580, Number(e.target.value)),
                  ),
                })
              }
            />
            <small>mm</small>
          </label>
        ))}
      </div>

      {coatingSupported && (
        <div className="coating-switch">
          <span>界面模型</span>
          <div role="group" aria-label="界面模型">
            <button
              className={element.coating === "ideal" ? "active" : ""}
              onClick={() => onUpdate({ coating: "ideal" })}
            >
              理想
            </button>
            <button
              className={element.coating === "physical" ? "active" : ""}
              onClick={() => onUpdate({ coating: "physical" })}
            >
              镀膜
            </button>
          </div>
        </div>
      )}
      {coatingSupported && element.coating === "physical" && (
        <p className="coating-hint">
          {element.kind === "prism"
            ? "Fresnel 界面：反射/透射随波长与入射角变化，无吸收。"
            : "R/T/A 随波长与入射角变化，正入射 550nm 处 T₀=1−R₀−A₀。"}
        </p>
      )}

      {parameters(element).map((p) => (
        <label className="parameter" key={p.key}>
          <span>
            {p.label}
            <b>
              {Number(element[p.key]).toFixed(p.step < 1 ? 2 : 0)}{" "}
              <small>{p.unit}</small>
            </b>
          </span>
          <input
            aria-label={p.label}
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={Number(element[p.key])}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const value =
                p.key === "focal" && raw === 0 ? 10 : clamp(raw, p.min, p.max);
              // 保证 R0 + A0 <= 1：调整其一时联动收缩另一个
              if (p.key === "r0")
                onUpdate({ r0: value, a0: Math.min(element.a0, 1 - value) });
              else if (p.key === "a0")
                onUpdate({ a0: value, r0: Math.min(element.r0, 1 - value) });
              else onUpdate({ [p.key]: value });
            }}
          />
          <div className="range-label">
            <span>{p.min}</span>
            <span>{p.max}</span>
          </div>
        </label>
      ))}
      <button className="delete" onClick={onRemove}>
        <Trash2 size={14} />
        移除器件
      </button>
    </section>
  );
}
