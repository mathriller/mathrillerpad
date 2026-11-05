/** 타임스탬프 기반 고유 ID (예: b-mh3k2x9a-4f7q) — 백엔드 genId_ 와 동일 규칙 */
export function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
