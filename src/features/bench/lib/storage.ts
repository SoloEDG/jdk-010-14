import type { LabDocument, Element } from "../../../shared/document";
import { normalizeElement } from "../../../shared/document";
const KEYS = [
  "x",
  "y",
  "angle",
  "size",
  "power",
  "rays",
  "spread",
  "wavelength",
  "focal",
  "index",
] as const;
export function saveDocument(doc: LabDocument) {
  localStorage.setItem("lumen-document", JSON.stringify(doc));
}
export function loadDocument(): LabDocument | null {
  try {
    const v = JSON.parse(localStorage.getItem("lumen-document") ?? "null");
    if (v?.version !== 1 || !Array.isArray(v.items) || v.items.length > 80)
      return null;
    const items: Element[] = [];
    for (const raw of v.items) {
      if (
        !["source", "mirror", "lens", "prism", "screen"].includes(raw.kind) ||
        typeof raw.id !== "string"
      )
        return null;
      for (const k of KEYS) if (!Number.isFinite(raw[k])) return null;
      if (raw.rays < 1 || raw.rays > 41 || raw.size <= 0 || raw.index < 1)
        return null;
      // 旧存档缺少镀膜字段时，normalizeElement 一律按 ideal 恢复原模型
      items.push(normalizeElement(raw));
    }
    return { version: 1, items };
  } catch {
    return null;
  }
}
