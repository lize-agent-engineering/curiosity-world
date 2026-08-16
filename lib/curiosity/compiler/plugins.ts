import {
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
