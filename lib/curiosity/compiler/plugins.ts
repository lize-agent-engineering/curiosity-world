import {
  CURIOSITY_EVENT_TYPES_V2,
  curiosityExperienceSpecV2Schema,
  type CuriosityExperienceSpecV2,
} from '../agent-contracts';
import { knowledgeRegistry } from '../knowledge/registry';
import { assertPrimaryInstructionsAllowed } from '../age-constraints';
import {
  CuriosityKnowledgePluginError,
  type CompiledCuriosityExperienceV2,
} from '../knowledge/types';

export function compileCuriosityExperienceV2(
  input: CuriosityExperienceSpecV2,
): CompiledCuriosityExperienceV2 {
  const spec = curiosityExperienceSpecV2Schema.parse(input);
  assertPrimaryInstructionsAllowed(
    spec.profile.age,
    spec.instructions.map((instruction) => instruction.text),
  );
  if (spec.knowledge.family === 'open') {
    if (
      !spec.knowledge.packId.startsWith('open.art_') ||
      !spec.sceneType ||
      spec.primitives.some(
        (primitive) => primitive !== 'adjust-variable' && primitive !== 'compare-relation',
      )
    ) {
      throw new CuriosityKnowledgePluginError(
        'KNOWLEDGE_VIOLATION',
        '开放知识体验没有通过受控场景边界。',
      );
    }
    return {
      family: 'open',
      packId: spec.knowledge.packId,
      eventTypes: CURIOSITY_EVENT_TYPES_V2,
      interactions: spec.primitives.map((primitive) => ({
        primitive,
        variableIds: spec.variables.map((variable) => variable.id),
      })),
    };
  }
  const plugin = knowledgeRegistry.get(spec.knowledge.family);
  if (
    !plugin.packs.some(
      (pack) => pack.id === spec.knowledge.packId && pack.version === spec.knowledge.packVersion,
    )
  ) {
    throw new CuriosityKnowledgePluginError(
      'KNOWLEDGE_VIOLATION',
      `未批准的知识包 ${spec.knowledge.packId}`,
    );
  }
  return plugin.compile(spec);
}
