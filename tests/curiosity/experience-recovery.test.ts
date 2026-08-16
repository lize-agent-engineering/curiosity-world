import { describe, expect, it } from 'vitest';

import {
  describeExperienceFailure,
  selectRegenerationBase,
} from '@/lib/curiosity/experience-recovery';
import { validateCuriosityExperienceSpecV3 } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

describe('Curiosity failed experience recovery', () => {
  it('regenerates from the selected failed version when no active version exists', () => {
    const { spec, specHash } = validateCuriosityExperienceSpecV3(validV3Spec);
    const version = {
      id: 'ver_moon_demo_1',
      experienceId: 'cur_moon_demo',
      revision: 1,
      createdAt: '2026-08-15T00:00:00.000Z',
      status: 'failed' as const,
      failureCode: 'RUNTIME_FAILED',
      spec,
      specHash,
      artifacts: [],
      agentRuns: [],
    };

    expect(
      selectRegenerationBase(
        {
          experience: {
            id: 'cur_moon_demo',
            question: spec.question.original,
            age: spec.targetAge,
            createdAt: version.createdAt,
            updatedAt: version.createdAt,
          },
          versions: [version],
        },
        version.id,
      ),
    ).toBe(version);
  });

  it('turns runtime diagnostics into a recovery instruction', () => {
    expect(
      describeExperienceFailure('RUNTIME_FAILED: 尚未实现 balance-support 的 React 场景。'),
    ).toBe('这版探索没有通过运行检查。旧版本已保留，请重新生成。');
    expect(describeExperienceFailure(null)).toBeNull();
  });

  it('does not expose a storage diagnostic when a shared link is unavailable', () => {
    expect(describeExperienceFailure('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。')).toBe(
      '没有找到这次探索。请检查链接，或返回首页重新开始。',
    );
  });
});
