import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CURIOSITY_SCENE_TYPES,
  curiositySceneRegistry,
  restoreCuriositySceneState,
} from '@/lib/curiosity/scenes/registry';

const common = { title: '动手探索', instructions: ['试着改变一个东西，看看会发生什么。'] };

const scenes = {
  variable: {
    type: 'variable',
    ...common,
    variables: [{ id: 'speed', label: '速度', states: ['慢', '快'], initial: '慢' }],
  },
  relation: {
    type: 'relation',
    ...common,
    objects: [
      { id: 'rain', label: '雨滴' },
      { id: 'cloud', label: '云' },
    ],
    relations: [{ id: 'rain_from_cloud', from: 'cloud', to: 'rain', label: '落下' }],
  },
  timeline: {
    type: 'timeline',
    ...common,
    entries: [
      { id: 'egg', label: '蛋' },
      { id: 'dinosaur', label: '恐龙' },
    ],
  },
  comparison: {
    type: 'comparison',
    ...common,
    items: [
      { id: 'bird', label: '鸟' },
      { id: 'plane', label: '飞机' },
    ],
    criteria: ['翅膀', '动力'],
  },
  process: {
    type: 'process',
    ...common,
    steps: [
      { id: 'evaporation', label: '蒸发' },
      { id: 'rain', label: '下雨' },
    ],
  },
  situation: {
    type: 'situation',
    ...common,
    prompt: '风变大时会怎样？',
    options: [
      { id: 'faster', label: '移动更快' },
      { id: 'same', label: '不变' },
    ],
  },
  'relative-motion': {
    type: 'relative-motion',
    ...common,
    observerTravel: 80,
    nearObjectDistance: 20,
    farObjectDistance: 400,
  },
  'balance-support': {
    type: 'balance-support',
    ...common,
    supportPosition: 0,
    loadPosition: 20,
  },
  'light-path': {
    type: 'light-path',
    ...common,
    lightPosition: -20,
    occluderPosition: 20,
  },
} as const;

describe('CuriositySceneRegistry', () => {
  it('contains the six generic and three specialized scene types', () => {
    expect(CURIOSITY_SCENE_TYPES).toEqual([
      'variable',
      'relation',
      'timeline',
      'comparison',
      'process',
      'situation',
      'relative-motion',
      'balance-support',
      'light-path',
    ]);
    expect(Object.keys(curiositySceneRegistry)).toEqual(CURIOSITY_SCENE_TYPES);
  });

  it.each(CURIOSITY_SCENE_TYPES)('%s provides the complete trusted scene contract', (type) => {
    const entry = curiositySceneRegistry[type];
    expect(entry.schema).toBeDefined();
    expect(entry.Renderer).toBeTypeOf('function');
    expect(entry.reducer).toBeTypeOf('function');
    expect(entry.validate).toBeTypeOf('function');
    expect(entry.mapEvent).toBeTypeOf('function');
    expect(entry.ageRange).toEqual({ min: 6, max: 10 });
  });

  it.each(CURIOSITY_SCENE_TYPES)('%s validates, renders and restores reducer state', (type) => {
    const entry = curiositySceneRegistry[type];
    const scene = entry.schema.parse(scenes[type]);
    entry.validate(scene, 8);
    const initial = entry.reducer(undefined, {
      type: 'restore',
      state: { inspected: ['subject'] },
    });
    const changed = entry.reducer(initial, { type: 'inspect', objectId: 'other' });
    expect(changed.inspected).toEqual(['subject', 'other']);
    expect(
      renderToStaticMarkup(
        <entry.Renderer scene={scene} state={changed} dispatch={() => undefined} />,
      ),
    ).toContain('data-scene-type');
  });

  it('fast-fails the selected scene instead of switching types', () => {
    expect(() => curiositySceneRegistry.variable.schema.parse(scenes.relation)).toThrow();
  });

  it('restores scene state from persisted V3 events', () => {
    expect(
      restoreCuriositySceneState([
        {
          source: 'curiosity-world',
          protocolVersion: '3.0',
          eventId: 'evt_inspect_restore',
          experienceId: 'cur_restore',
          versionId: 'ver_restore',
          type: 'object_inspected',
          action: 'inspect',
          occurredAt: '2026-08-17T00:00:00.000Z',
          payload: { objectId: 'moon' },
        },
        {
          source: 'curiosity-world',
          protocolVersion: '3.0',
          eventId: 'evt_control_restore',
          experienceId: 'cur_restore',
          versionId: 'ver_restore',
          type: 'control_changed',
          action: 'change_control',
          occurredAt: '2026-08-17T00:00:01.000Z',
          payload: { controlId: 'observer', value: 42 },
        },
      ]),
    ).toMatchObject({ inspected: ['moon'], controls: { observer: 42 } });
  });
});
