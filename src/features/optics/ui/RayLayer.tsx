import type { LabDocument, TraceResult } from "../../../shared/document";
import { direction } from "../../../shared/geometry";
import { wavelengthColor } from "../lib/emission";
import { MAX_SEGMENTS } from "../lib/trace";
export function RayLayer({
  result,
  visible,
  normals,
  doc,
}: {
  result: TraceResult;
  visible: boolean;
  normals: boolean;
  doc: LabDocument;
}) {
  // 以光源功率归一化线条透明度，弱支路淡化但仍可见
  const emitted = result.ledger.emitted || 1;
  return (
    <g pointerEvents="none">
      {visible &&
        result.segments.map((s, i) => (
          <line
            key={i}
            x1={s.from.x}
            y1={s.from.y}
            x2={s.to.x}
            y2={s.to.y}
            stroke={wavelengthColor(s.wavelength)}
            strokeWidth="1.3"
            opacity={Math.max(0.08, Math.min(0.85, 0.25 + (s.power / emitted) * 12))}
          />
        ))}
      {visible && result.segments.length >= MAX_SEGMENTS && (
        <text x="20" y="40" fill="#f5c778" fontSize="12">
          光路段数达到渲染上限 {MAX_SEGMENTS}，超出部分仅追迹不绘制
        </text>
      )}
      {normals &&
        doc.items
          .filter((e) => e.kind !== "source")
          .map((e) => {
            const n = direction(e.angle + 90);
            return (
              <line
                key={e.id}
                x1={e.x - n.x * 50}
                y1={e.y - n.y * 50}
                x2={e.x + n.x * 50}
                y2={e.y + n.y * 50}
                stroke="#f5c778"
                strokeDasharray="4 5"
              />
            );
          })}
    </g>
  );
}
