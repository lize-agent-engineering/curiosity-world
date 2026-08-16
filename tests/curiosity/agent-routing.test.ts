import { describe, expect, it } from 'vitest';

import {
  CuriosityRoleRouteUnavailableError,
  buildCuriosityRoleHeaders,
  getCuriosityRoleStage,
  resolveRoleRoute,
  readCuriosityRoutingConfig,
  writeCuriosityRoleRoutes,
  type CuriosityRoutingConfig,
} from '@/lib/curiosity/agent-routing';

const config: CuriosityRoutingConfig = {
  defaultRoute: {
    providerId: 'openai',
    modelId: 'gpt-default',
    thinkingConfig: { effort: 'medium' },
  },
  roles: {},
};

describe('Curiosity role routing', () => {
  it('inherits the default route unless the requested role has an explicit route', () => {
    expect(resolveRoleRoute('curiosity.knowledge-designer', config)).toEqual({
      providerId: 'openai',
      modelId: 'gpt-default',
      thinkingConfig: { effort: 'medium' },
    });

    expect(
      resolveRoleRoute('curiosity.quality-reviewer', {
        ...config,
        roles: {
          'curiosity.quality-reviewer': {
            providerId: 'anthropic',
            modelId: 'claude-review',
            thinkingConfig: { enabled: true },
          },
        },
      }),
    ).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-review',
      thinkingConfig: { enabled: true },
    });
  });

  it('fails when neither the role nor the default has a usable route', () => {
    expect(() => resolveRoleRoute('curiosity.question-modeler', { roles: {} })).toThrowError(
      CuriosityRoleRouteUnavailableError,
    );
    expect(() =>
      resolveRoleRoute('curiosity.question-modeler', {
        roles: {
          'curiosity.question-modeler': { providerId: 'openai', modelId: '  ' },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'MODEL_UNAVAILABLE' }));
  });

  it('uses the exact role as the server model-routing stage', () => {
    expect(getCuriosityRoleStage('curiosity.revision-planner')).toBe('curiosity.revision-planner');
    expect(getCuriosityRoleStage('curiosity.presentation-designer')).toBe(
      'curiosity.presentation-designer',
    );
  });

  it('declares the exact role without replacing default model headers', () => {
    expect(
      buildCuriosityRoleHeaders(
        { 'x-model': 'openai:gpt-default', 'x-api-key': 'test-key' },
        'curiosity.knowledge-designer',
      ),
    ).toEqual({
      'x-model': 'openai:gpt-default',
      'x-api-key': 'test-key',
      'x-curiosity-role': 'curiosity.knowledge-designer',
    });
  });

  it('persists only explicit role overrides and inherits the current default route', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeCuriosityRoleRoutes(storage, {
      'curiosity.quality-reviewer': { providerId: 'anthropic', modelId: 'claude-review' },
    });
    expect(
      readCuriosityRoutingConfig(storage, { providerId: 'openai', modelId: 'gpt-default' }),
    ).toEqual({
      defaultRoute: { providerId: 'openai', modelId: 'gpt-default' },
      roles: {
        'curiosity.quality-reviewer': { providerId: 'anthropic', modelId: 'claude-review' },
      },
    });
  });
});
