export interface ReviewedNarrationLine {
  id: string;
  eventType: string;
  action: string;
  text: string;
}

export interface NarrationEventKey {
  type: string;
  action: string;
}

export function normalizeNarrationEventPart(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function selectReviewedNarration<T extends ReviewedNarrationLine>(
  library: readonly T[],
  event: NarrationEventKey,
): T | null {
  const eventType = normalizeNarrationEventPart(event.type);
  const action = normalizeNarrationEventPart(event.action);
  const candidates = library
    .filter((line) => normalizeNarrationEventPart(line.eventType) === eventType)
    .sort((left, right) => left.id.localeCompare(right.id));
  return (
    candidates.find((line) => normalizeNarrationEventPart(line.action) === action) ??
    candidates.find((line) => line.action === '*') ??
    null
  );
}
