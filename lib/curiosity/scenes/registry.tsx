import type { ComponentType, Dispatch } from 'react';
import { z } from 'zod';

import {
  balanceSupportSceneV3Schema,
  comparisonSceneV3Schema,
  lightPathSceneV3Schema,
  processSceneV3Schema,
  relationSceneV3Schema,
  relativeMotionSceneV3Schema,
  situationSceneV3Schema,
  timelineSceneV3Schema,
  variableSceneV3Schema,
  type CuriosityEventTypeV3,
  type CuriosityEventV3,
  type CuriositySceneV3,
} from '../experience-spec-v3';

export const CURIOSITY_SCENE_TYPES = [
  'variable',
  'relation',
  'timeline',
  'comparison',
  'process',
  'situation',
  'relative-motion',
  'balance-support',
  'light-path',
] as const;

export type CuriositySceneType = (typeof CURIOSITY_SCENE_TYPES)[number];
export interface CuriositySceneState {
  inspected: string[];
  moved: Record<string, { x: number; y: number }>;
  controls: Record<string, string | number | boolean>;
  revealed: string[];
  responses: Record<string, string>;
}
export type CuriositySceneAction =
  | { type: 'restore'; state: Partial<CuriositySceneState> }
  | { type: 'inspect'; objectId: string }
  | { type: 'move'; objectId: string; x: number; y: number }
  | { type: 'change-control'; controlId: string; value: string | number | boolean }
  | { type: 'reveal'; relationId: string }
  | { type: 'respond'; promptId: string; response: string };

const emptyState = (): CuriositySceneState => ({
  inspected: [],
  moved: {},
  controls: {},
  revealed: [],
  responses: {},
});

function reducer(
  state: CuriositySceneState | undefined,
  action: CuriositySceneAction,
): CuriositySceneState {
  const current = state ?? emptyState();
  switch (action.type) {
    case 'restore':
      return {
        ...emptyState(),
        ...action.state,
        inspected: [...(action.state.inspected ?? [])],
        moved: { ...(action.state.moved ?? {}) },
        controls: { ...(action.state.controls ?? {}) },
        revealed: [...(action.state.revealed ?? [])],
        responses: { ...(action.state.responses ?? {}) },
      };
    case 'inspect':
      return { ...current, inspected: [...new Set([...current.inspected, action.objectId])] };
    case 'move':
      return {
        ...current,
        moved: { ...current.moved, [action.objectId]: { x: action.x, y: action.y } },
      };
    case 'change-control':
      return { ...current, controls: { ...current.controls, [action.controlId]: action.value } };
    case 'reveal':
      return { ...current, revealed: [...new Set([...current.revealed, action.relationId])] };
    case 'respond':
      return {
        ...current,
        responses: { ...current.responses, [action.promptId]: action.response },
      };
  }
}

function mapEvent(action: CuriositySceneAction): CuriosityEventTypeV3 {
  switch (action.type) {
    case 'restore':
      throw new Error('RESTORE_DOES_NOT_EMIT_EVENT');
    case 'inspect':
      return 'object_inspected';
    case 'move':
      return 'object_moved';
    case 'change-control':
      return 'control_changed';
    case 'reveal':
      return 'relationship_revealed';
    case 'respond':
      return 'response_recorded';
  }
}

export interface CuriositySceneRendererProps {
  scene: CuriositySceneV3;
  state: CuriositySceneState;
  dispatch: Dispatch<CuriositySceneAction>;
}

function TrustedSceneRenderer({ scene, state, dispatch }: CuriositySceneRendererProps) {
  const subject =
    'objects' in scene
      ? scene.objects[0]
      : 'entries' in scene
        ? scene.entries[0]
        : 'items' in scene
          ? scene.items[0]
          : 'steps' in scene
            ? scene.steps[0]
            : 'options' in scene
              ? scene.options[0]
              : undefined;
  return (
    <section
      data-scene-type={scene.type}
      className="grid min-h-72 gap-5 rounded-2xl bg-[#102b47] p-5 text-white lg:grid-cols-[1.2fr_.8fr]"
    >
      <div className="flex min-h-56 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_75%_20%,#ffe08a_0_5%,transparent_6%),linear-gradient(160deg,#173f68,#0a2039)] p-6">
        <button
          type="button"
          className="min-h-24 min-w-24 rounded-full bg-[#6fc5c1] px-5 font-black text-[#102b47] transition-transform hover:scale-105 motion-reduce:transition-none"
          onClick={() => dispatch({ type: 'inspect', objectId: subject?.id ?? scene.type })}
        >
          {subject?.label ?? scene.title}
        </button>
      </div>
      <div className="flex flex-col justify-center gap-4">
        <h2 className="text-xl font-black text-[#ffe08a]">{scene.title}</h2>
        {scene.instructions.map((instruction) => (
          <p key={instruction} className="leading-7 text-white/85">
            {instruction}
          </p>
        ))}
        <p aria-live="polite" className="text-sm text-white/70">
          已查看 {state.inspected.length} 个对象
        </p>
      </div>
    </section>
  );
}

type AnySceneSchema = z.ZodType<CuriositySceneV3>;
export interface CuriositySceneRegistryEntry {
  schema: AnySceneSchema;
  Renderer: ComponentType<CuriositySceneRendererProps>;
  reducer: typeof reducer;
  validate(scene: unknown, targetAge: number): CuriositySceneV3;
  mapEvent: typeof mapEvent;
  ageRange: { min: 6; max: 10 };
}

function entry(schema: AnySceneSchema): CuriositySceneRegistryEntry {
  return {
    schema,
    Renderer: TrustedSceneRenderer,
    reducer,
    validate(scene, targetAge) {
      if (!Number.isInteger(targetAge) || targetAge < 6 || targetAge > 10) {
        throw new Error(`SCENE_AGE_UNSUPPORTED: ${targetAge}`);
      }
      const parsed = schema.parse(scene);
      const maxLength = targetAge <= 7 ? 72 : 108;
      if (parsed.instructions.some((instruction) => instruction.length > maxLength)) {
        throw new Error('SCENE_INSTRUCTION_TOO_LONG');
      }
      return parsed;
    },
    mapEvent,
    ageRange: { min: 6, max: 10 },
  };
}

export const curiositySceneRegistry: Record<CuriositySceneType, CuriositySceneRegistryEntry> = {
  variable: entry(variableSceneV3Schema as AnySceneSchema),
  relation: entry(relationSceneV3Schema as AnySceneSchema),
  timeline: entry(timelineSceneV3Schema as AnySceneSchema),
  comparison: entry(comparisonSceneV3Schema as AnySceneSchema),
  process: entry(processSceneV3Schema as AnySceneSchema),
  situation: entry(situationSceneV3Schema as AnySceneSchema),
  'relative-motion': entry(relativeMotionSceneV3Schema as AnySceneSchema),
  'balance-support': entry(balanceSupportSceneV3Schema as AnySceneSchema),
  'light-path': entry(lightPathSceneV3Schema as AnySceneSchema),
};

export function getCuriositySceneEntry(type: CuriositySceneType): CuriositySceneRegistryEntry {
  const selected = curiositySceneRegistry[type];
  if (!selected) throw new Error(`SCENE_TYPE_UNKNOWN: ${type}`);
  return selected;
}

export function restoreCuriositySceneState(events: CuriosityEventV3[]): CuriositySceneState {
  let state = emptyState();
  for (const event of events) {
    const action: CuriositySceneAction | null =
      event.type === 'object_inspected' && typeof event.payload.objectId === 'string'
        ? { type: 'inspect', objectId: event.payload.objectId }
        : event.type === 'object_moved' &&
            typeof event.payload.objectId === 'string' &&
            typeof event.payload.x === 'number' &&
            typeof event.payload.y === 'number'
          ? {
              type: 'move',
              objectId: event.payload.objectId,
              x: event.payload.x,
              y: event.payload.y,
            }
          : event.type === 'control_changed' &&
              typeof event.payload.controlId === 'string' &&
              ['string', 'number', 'boolean'].includes(typeof event.payload.value)
            ? {
                type: 'change-control',
                controlId: event.payload.controlId,
                value: event.payload.value as string | number | boolean,
              }
            : event.type === 'relationship_revealed' && typeof event.payload.relationId === 'string'
              ? { type: 'reveal', relationId: event.payload.relationId }
              : event.type === 'response_recorded' &&
                  typeof event.payload.promptId === 'string' &&
                  typeof event.payload.response === 'string'
                ? {
                    type: 'respond',
                    promptId: event.payload.promptId,
                    response: event.payload.response,
                  }
                : null;
    if (action) state = reducer(state, action);
  }
  return state;
}
