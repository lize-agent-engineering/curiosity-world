import type { CuriosityEventV1, CuriosityExperienceSpecV1 } from './contracts';

export function isExperienceComplete(
  spec: CuriosityExperienceSpecV1,
  events: ReadonlyArray<Pick<CuriosityEventV1, 'type'>>,
): boolean {
  const observed = new Set(events.map((event) => event.type));
  return spec.eventRequirements.every((required) => observed.has(required));
}
