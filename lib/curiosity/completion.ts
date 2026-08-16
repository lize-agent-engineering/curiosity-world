import type { CuriosityEventV3, CuriosityExperienceSpecV3 } from './experience-spec-v3';

export function isExperienceComplete(
  _spec: CuriosityExperienceSpecV3,
  events: ReadonlyArray<Pick<CuriosityEventV3, 'type'>>,
): boolean {
  return events.some((event) => event.type === 'exploration_ended');
}
