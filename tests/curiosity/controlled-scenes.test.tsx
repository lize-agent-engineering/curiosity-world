import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('controlled first-release React scenes', () => {
  it('reduces variable-explorer actions into bounded state and deterministic events', async () => {
    const scene = await import('@/lib/curiosity/controlled-scenes').catch(() => null);
    expect(scene).not.toBeNull();
    if (!scene) return;

    const initial = scene.createControlledSceneState({
      sceneType: 'variable-explorer',
      variables: [{ id: 'temperature', label: '温度', min: 0, max: 10, initial: 4 }],
      relations: [],
    });
    const next = scene.reduceControlledScene(initial, {
      type: 'set-variable',
      variableId: 'temperature',
      value: 20,
    });

    expect(next.values.temperature).toBe(10);
    expect(
      scene.eventForControlledSceneAction(initial, next, {
        type: 'set-variable',
        variableId: 'temperature',
        value: 20,
      }),
    ).toEqual({
      type: 'variable_changed',
      taskId: 'exploration',
      action: 'set-temperature',
      payload: { variableId: 'temperature', value: 10 },
    });
  });

  it('reduces relation-explorer comparisons without evaluating an expression', async () => {
    const scene = await import('@/lib/curiosity/controlled-scenes').catch(() => null);
    expect(scene).not.toBeNull();
    if (!scene) return;

    const descriptor = {
      sceneType: 'relation-explorer' as const,
      variables: [
        { id: 'distance', label: '距离', min: 1, max: 5, initial: 2 },
        { id: 'change', label: '变化', min: 1, max: 5, initial: 4 },
      ],
      relations: [
        {
          id: 'distance-change',
          fromVariableId: 'distance',
          toVariableId: 'change',
          direction: 'inverse' as const,
        },
      ],
    };
    const initial = scene.createControlledSceneState(descriptor);
    const next = scene.reduceControlledScene(initial, {
      type: 'compare-relation',
      relationId: 'distance-change',
    });

    expect(next.comparedRelationIds).toEqual(['distance-change']);
    expect(
      scene.eventForControlledSceneAction(initial, next, {
        type: 'compare-relation',
        relationId: 'distance-change',
      }),
    ).toMatchObject({
      type: 'challenge_attempted',
      action: 'compare-distance-change',
      payload: { relationId: 'distance-change', direction: 'inverse' },
    });
  });

  it('wires both controlled renderers without dynamic HTML execution', async () => {
    const renderer = await import('@/components/curiosity/scenes/controlled-scene-renderer').catch(
      () => null,
    );
    expect(renderer).not.toBeNull();
    if (!renderer) return;
    expect(renderer.VariableExplorerScene).toBeTypeOf('function');
    expect(renderer.RelationExplorerScene).toBeTypeOf('function');
  });

  it('renders the four-task closure from declarative task data', async () => {
    const { VariableExplorerScene } =
      await import('@/components/curiosity/scenes/controlled-scene-renderer');
    const html = renderToStaticMarkup(
      createElement(VariableExplorerScene, {
        descriptor: {
          sceneType: 'variable-explorer',
          variables: [{ id: 'temperature', label: '温度', min: 0, max: 10, initial: 4 }],
          relations: [],
        },
        tasks: [
          {
            id: 'prediction',
            kind: 'prediction',
            prompt: '哪边变化更快？',
            options: [
              { id: 'warm', label: '温暖的一边' },
              { id: 'cool', label: '凉爽的一边' },
            ],
            expectedOptionId: 'warm',
          },
        ],
        activeStageKind: 'prediction',
        onEvent: () => undefined,
      }),
    );
    expect(html).toContain('哪边变化更快？');
    expect(html).toContain('温暖的一边');
  });
});
