import {
  curiosityExperienceSpecSchema,
  curiosityPatchSchema,
  type CuriosityExperienceSpecV1,
  type CuriosityPatchV1,
} from './contracts';
import { validateKnowledgeBoundaries } from './knowledge';

export type CuriosityRevisionErrorCode = 'STALE_BASE_VERSION' | 'INVALID_PATCH_RESULT';

export class CuriosityRevisionError extends Error {
  constructor(
    readonly code: CuriosityRevisionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityRevisionError';
  }
}

export function applyCuriosityPatch(
  baseInput: CuriosityExperienceSpecV1,
  patchInput: CuriosityPatchV1,
  revision: { versionId: string; createdAt: string },
): CuriosityExperienceSpecV1 {
  const base = curiosityExperienceSpecSchema.parse(baseInput);
  const patch = curiosityPatchSchema.parse(patchInput);

  if (patch.baseVersionId !== base.versionId) {
    throw new CuriosityRevisionError(
      'STALE_BASE_VERSION',
      `补丁基于 ${patch.baseVersionId}，当前版本为 ${base.versionId}。`,
    );
  }

  const next = structuredClone(base);
  next.versionId = revision.versionId;
  next.createdAt = revision.createdAt;
  next.revision = base.revision + 1;

  for (const operation of patch.operations) {
    switch (operation.op) {
      case 'set_age':
        next.profile.age = operation.age;
        break;
      case 'set_interests':
        next.profile.interests = [...operation.interests];
        break;
      case 'replace_copy':
        next.presentation[operation.field] = operation.value;
        break;
      case 'set_parameter':
        next.simulation[operation.field] = operation.value;
        break;
      case 'set_tabletop_experiment':
        next.tabletopExperiment = structuredClone(operation.experiment);
        break;
      case 'remove_tabletop_experiment':
        delete next.tabletopExperiment;
        break;
    }
  }

  try {
    const validated = curiosityExperienceSpecSchema.parse(next);
    validateKnowledgeBoundaries(validated);
    return validated;
  } catch (error) {
    throw new CuriosityRevisionError(
      'INVALID_PATCH_RESULT',
      '修改后的体验未通过完整领域校验。',
      error,
    );
  }
}
