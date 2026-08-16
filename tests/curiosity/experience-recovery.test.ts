import { describe, expect, it } from 'vitest';

import { describeExperienceFailure, selectRegenerationBase } from '@/lib/curiosity/experience-recovery';
import { createValidCuriositySpec } from './fixture';

describe('Curiosity failed experience recovery', () => {
  it('regenerates from the selected failed version when no active version exists', () => {
    const spec = createValidCuriositySpec();
    const version = {
      id: spec.versionId,
      experienceId: spec.experienceId,
      revision: spec.revision,
      createdAt: spec.createdAt,
      status: 'failed' as const,
      failureCode: 'RUNTIME_FAILED',
      spec,
      specHash: 'cw1-failed',
      artifacts: [],
      agentRuns: [],
      experienceSpec: {},
    } as never;

    expect(
      selectRegenerationBase(
        {
          experience: {
            id: spec.experienceId,
            question: spec.question.original,
            age: spec.profile.age,
            interests: spec.profile.interests,
            createdAt: spec.createdAt,
            updatedAt: spec.createdAt,
          },
          versions: [version],
        },
        spec.versionId,
      ),
    ).toBe(version);
  });

  it('turns runtime diagnostics into a recovery instruction', () => {
    expect(describeExperienceFailure('RUNTIME_FAILED: 尚未实现 balance-support 的 React 场景。')).toBe(
      '这版探索没有通过运行检查。旧版本已保留，请重新生成。',
    );
    expect(describeExperienceFailure(null)).toBeNull();
  });
});
