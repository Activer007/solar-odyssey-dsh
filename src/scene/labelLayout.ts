export interface LabelPoint { x: number; y: number; }
export interface LabelRect extends LabelPoint { width: number; height: number; }
export interface LabelCandidate {
  id: string;
  anchor: LabelPoint;
  width: number;
  height: number;
  priority: number;
  subjectRect?: LabelRect;
  /** Reserved for an auxiliary symbol that must remain at its true projected anchor. */
  fixed?: boolean;
}
export interface LabelPlacement {
  id: string;
  visible: boolean;
  rect?: LabelRect;
  offset?: LabelPoint;
  leader?: { from: LabelPoint; to: LabelPoint };
}
export interface LabelLayoutOptions {
  viewport: { width: number; height: number };
  labels: readonly LabelCandidate[];
  obstacles?: readonly LabelRect[];
  previous?: ReadonlyMap<string, LabelPoint>;
  padding?: number;
  gap?: number;
  maxDisplacement?: number;
}

const finiteRect = (rect: LabelRect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function labelRectsOverlap(a: LabelRect, b: LabelRect, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** One deterministic pass for all projected labels; input/DOM mount order is irrelevant. */
export function layoutSceneLabels({ viewport, labels, obstacles = [], previous, padding = 8, gap = 5, maxDisplacement = 240 }: LabelLayoutOptions): LabelPlacement[] {
  const ordered = [...labels].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const occupied: LabelRect[] = [];
  const ui = obstacles.filter(finiteRect);
  const subjects = labels.filter(label => label.subjectRect && finiteRect(label.subjectRect)).map(label => ({ id: label.id, rect: label.subjectRect! }));
  return ordered.map(label => {
    const hidden: LabelPlacement = { id: label.id, visible: false };
    const { anchor, width, height } = label;
    if (![anchor.x, anchor.y, width, height, label.priority].every(Number.isFinite) || width <= 0 || height <= 0
      || width + padding * 2 > viewport.width || height + padding * 2 > viewport.height
      || anchor.x < -32 || anchor.y < -32 || anchor.x > viewport.width + 32 || anchor.y > viewport.height + 32) return hidden;

    const blockers = [...ui, ...subjects.filter(subject => !label.fixed || subject.id !== label.id).map(subject => subject.rect)];
    const centers: LabelPoint[] = [];
    if (!label.fixed) {
      const last = previous?.get(label.id);
      if (last) centers.push({ x: anchor.x + last.x, y: anchor.y + last.y });
    }
    const candidates: LabelPoint[] = [{ x: anchor.x, y: anchor.y }];
    if (!label.fixed) {
      for (const ring of [1, 2, 3]) {
        const dx = (width / 2 + gap + 8) * ring, dy = (height + gap) * ring;
        for (const [x, y] of [[0, -dy], [dx, 0], [0, dy], [-dx, 0], [dx, -dy], [-dx, -dy], [dx, dy], [-dx, dy]]) {
          candidates.push({ x: anchor.x + x, y: anchor.y + y });
        }
      }
      // A large close-up body or panel needs candidates at its edges, not many tiny nudges.
      for (const obstacle of [...blockers, ...occupied]) {
        const left = obstacle.x - gap - width / 2, right = obstacle.x + obstacle.width + gap + width / 2;
        const top = obstacle.y - gap - height / 2, bottom = obstacle.y + obstacle.height + gap + height / 2;
        candidates.push({ x: left, y: anchor.y }, { x: right, y: anchor.y }, { x: anchor.x, y: top }, { x: anchor.x, y: bottom },
          { x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom });
      }
      candidates.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y)
        || a.y - b.y || a.x - b.x);
    }
    centers.push(...candidates);
    const seen = new Set<string>();
    for (const center of centers) {
      const rect = {
        x: label.fixed ? center.x - width / 2 : clamp(center.x - width / 2, padding, viewport.width - padding - width),
        y: label.fixed ? center.y - height / 2 : clamp(center.y - height / 2, padding, viewport.height - padding - height), width, height,
      };
      const key = `${rect.x.toFixed(3)},${rect.y.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const offset = { x: rect.x + width / 2 - anchor.x, y: rect.y + height / 2 - anchor.y };
      if (rect.x < padding || rect.y < padding || rect.x + width > viewport.width - padding || rect.y + height > viewport.height - padding
        || Math.hypot(offset.x, offset.y) > maxDisplacement
        || blockers.some(blocker => labelRectsOverlap(rect, blocker, gap))
        || occupied.some(other => labelRectsOverlap(rect, other, gap))) continue;
      occupied.push(rect);
      const to = { x: clamp(anchor.x, rect.x, rect.x + width), y: clamp(anchor.y, rect.y, rect.y + height) };
      return { id: label.id, visible: true, rect, offset,
        leader: Math.hypot(to.x - anchor.x, to.y - anchor.y) > 5 ? { from: anchor, to } : undefined };
    }
    return hidden;
  });
}
