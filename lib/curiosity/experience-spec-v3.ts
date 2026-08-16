import { z } from 'zod';

export const CURIOSITY_EVENT_TYPES_V3 = [
  'exploration_started',
  'object_inspected',
  'object_moved',
  'control_changed',
  'relationship_revealed',
  'response_recorded',
  'feedback_presented',
  'discovery_prompt_opened',
  'reflection_recorded',
  'exploration_ended',
] as const;

export const LEGACY_EVENT_TYPE_MAP_V1 = {
  experiment_started: 'exploration_started',
  variable_changed: 'control_changed',
  prediction_submitted: 'response_recorded',
  challenge_attempted: 'response_recorded',
  challenge_completed: 'relationship_revealed',
  explanation_selected: 'reflection_recorded',
  experience_completed: 'exploration_ended',
} as const;

export const LEGACY_EVENT_TYPE_MAP_V2 = {
  experience_started: 'exploration_started',
  prediction_submitted: 'response_recorded',
  transfer_attempted: 'response_recorded',
  variable_changed: 'control_changed',
  feedback_shown: 'feedback_presented',
  explanation_selected: 'reflection_recorded',
  experience_completed: 'exploration_ended',
} as const;

export const curiosityEventTypeV3Schema = z.enum(CURIOSITY_EVENT_TYPES_V3);

const identifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/);
const executableContent =
  /<\/?(?:script|style|html|body)|\b(?:javascript:|function\s*\(|document\.|window\.|eval\s*\()|=>/i;
export const curiosityShortTextV3Schema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !executableContent.test(value), 'executable content is forbidden');

const questionSchema = z.strictObject({
  original: z.string().trim().min(4).max(240),
  core: z.string().trim().min(4).max(180),
});

const knowledgeSchema = z.strictObject({
  source: z.enum(['curated', 'open']),
  packId: z.string().trim().min(3).max(128).optional(),
  claims: z.array(curiosityShortTextV3Schema).min(1).max(12),
  relations: z
    .array(
      z.strictObject({
        id: identifierSchema,
        from: curiosityShortTextV3Schema,
        relation: z.enum(['supports', 'causes', 'changes', 'contrasts', 'precedes']),
        to: curiosityShortTextV3Schema,
      }),
    )
    .max(16),
  misconceptions: z.array(curiosityShortTextV3Schema).min(1).max(12),
  uncertainties: z.array(curiosityShortTextV3Schema).max(12),
  observationSuggestions: z.array(curiosityShortTextV3Schema).min(1).max(5),
  timeSensitive: z.boolean(),
});

const sceneBase = {
  title: z.string().trim().min(1).max(120),
  instructions: z.array(curiosityShortTextV3Schema).min(1).max(5),
};

const stateVariableSchema = z
  .strictObject({
    id: identifierSchema,
    label: z.string().trim().min(1).max(48),
    states: z.array(z.string().trim().min(1).max(48)).min(2).max(8),
    initial: z.string().trim().min(1).max(48),
  })
  .superRefine((variable, context) => {
    if (!variable.states.includes(variable.initial)) {
      context.addIssue({ code: 'custom', path: ['initial'], message: 'initial state is unknown' });
    }
  });

const objectSchema = z.strictObject({ id: identifierSchema, label: curiosityShortTextV3Schema });
const relationSchema = z.strictObject({
  id: identifierSchema,
  from: identifierSchema,
  to: identifierSchema,
  label: curiosityShortTextV3Schema,
});

export const variableSceneV3Schema = z.strictObject({
  type: z.literal('variable'),
  ...sceneBase,
  variables: z.array(stateVariableSchema).min(1).max(4),
});
export const relationSceneV3Schema = z.strictObject({
  type: z.literal('relation'),
  ...sceneBase,
  objects: z.array(objectSchema).min(2).max(10),
  relations: z.array(relationSchema).min(1).max(16),
});
export const timelineSceneV3Schema = z.strictObject({
  type: z.literal('timeline'),
  ...sceneBase,
  entries: z.array(objectSchema).min(2).max(12),
});
export const comparisonSceneV3Schema = z.strictObject({
  type: z.literal('comparison'),
  ...sceneBase,
  items: z.array(objectSchema).min(2).max(8),
  criteria: z.array(curiosityShortTextV3Schema).min(1).max(6),
});
export const processSceneV3Schema = z.strictObject({
  type: z.literal('process'),
  ...sceneBase,
  steps: z.array(objectSchema).min(2).max(10),
});
export const situationSceneV3Schema = z.strictObject({
  type: z.literal('situation'),
  ...sceneBase,
  prompt: curiosityShortTextV3Schema,
  options: z.array(objectSchema).min(2).max(6),
});
export const relativeMotionSceneV3Schema = z.strictObject({
  type: z.literal('relative-motion'),
  ...sceneBase,
  observerTravel: z.number().min(40).max(100),
  nearObjectDistance: z.number().min(10).max(30),
  farObjectDistance: z.number().min(200).max(600),
});
export const balanceSupportSceneV3Schema = z.strictObject({
  type: z.literal('balance-support'),
  ...sceneBase,
  supportPosition: z.number().min(-100).max(100),
  loadPosition: z.number().min(-100).max(100),
});
export const lightPathSceneV3Schema = z.strictObject({
  type: z.literal('light-path'),
  ...sceneBase,
  lightPosition: z.number().min(-100).max(100),
  occluderPosition: z.number().min(-100).max(100),
});

export const curiositySceneV3Schema = z.discriminatedUnion('type', [
  variableSceneV3Schema,
  relationSceneV3Schema,
  timelineSceneV3Schema,
  comparisonSceneV3Schema,
  processSceneV3Schema,
  situationSceneV3Schema,
  relativeMotionSceneV3Schema,
  balanceSupportSceneV3Schema,
  lightPathSceneV3Schema,
]);

export const curiosityExperienceSpecV3Schema = z
  .strictObject({
    question: questionSchema,
    targetAge: z.number().int().min(6).max(10),
    route: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('curated'),
        family: z.enum(['relative-motion', 'balance-support', 'light-path']),
      }),
      z.strictObject({ kind: z.literal('open') }),
    ]),
    knowledge: knowledgeSchema,
    scene: curiositySceneV3Schema,
    narrationLibrary: z
      .array(
        z.strictObject({
          id: identifierSchema,
          eventType: curiosityEventTypeV3Schema,
          action: z.union([z.literal('*'), identifierSchema]),
          text: curiosityShortTextV3Schema,
        }),
      )
      .min(1)
      .max(32),
    discoveryPrompts: z
      .array(
        z.strictObject({
          id: identifierSchema,
          prompt: curiosityShortTextV3Schema,
          skippable: z.literal(true),
        }),
      )
      .max(3),
    limitations: z.array(curiosityShortTextV3Schema).min(1).max(12),
    eventRequirements: z.array(curiosityEventTypeV3Schema).length(CURIOSITY_EVENT_TYPES_V3.length),
  })
  .superRefine((spec, context) => {
    const events = new Set(spec.eventRequirements);
    if (
      events.size !== CURIOSITY_EVENT_TYPES_V3.length ||
      CURIOSITY_EVENT_TYPES_V3.some((eventType) => !events.has(eventType))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['eventRequirements'],
        message: 'event requirements must contain every V3 event exactly once',
      });
    }
    if (
      spec.route.kind === 'curated' &&
      (spec.knowledge.source !== 'curated' || spec.scene.type !== spec.route.family)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['route'],
        message: 'curated route, knowledge and scene must agree',
      });
    }
    if (spec.route.kind === 'open' && spec.knowledge.source !== 'open') {
      context.addIssue({
        code: 'custom',
        path: ['knowledge', 'source'],
        message: 'open knowledge required',
      });
    }
  });

export const curiosityEventV3Schema = z.strictObject({
  source: z.literal('curiosity-world'),
  protocolVersion: z.literal('3.0'),
  eventId: identifierSchema,
  experienceId: identifierSchema.regex(/^cur_/),
  versionId: identifierSchema.regex(/^ver_/),
  type: curiosityEventTypeV3Schema,
  action: identifierSchema,
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
  metadata: z.strictObject({ legacyType: z.string().min(1).max(64) }).optional(),
});

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function validateCuriosityExperienceSpecV3(input: unknown): {
  spec: CuriosityExperienceSpecV3;
  specHash: string;
} {
  const spec = curiosityExperienceSpecV3Schema.parse(input);
  const canonical = JSON.stringify(sortJson(spec));
  return { spec, specHash: `cw3-${fnv1a(canonical)}` };
}

type LegacyVersion = 'v1' | 'v2';
type LegacyEventInput = {
  source: 'curiosity-world';
  protocolVersion?: string;
  eventId: string;
  experienceId: string;
  versionId: string;
  type: string;
  action: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  taskId?: string;
};

export function migrateLegacyEvent(
  version: LegacyVersion,
  input: LegacyEventInput,
): CuriosityEventV3 {
  const mapping = version === 'v1' ? LEGACY_EVENT_TYPE_MAP_V1 : LEGACY_EVENT_TYPE_MAP_V2;
  const type = mapping[input.type as keyof typeof mapping];
  if (!type) throw new Error(`LEGACY_EVENT_TYPE_UNKNOWN: ${input.type}`);
  return curiosityEventV3Schema.parse({
    source: input.source,
    protocolVersion: '3.0',
    eventId: input.eventId,
    experienceId: input.experienceId,
    versionId: input.versionId,
    type,
    action: input.action,
    occurredAt: input.occurredAt,
    payload: input.payload,
    metadata: { legacyType: input.type },
  });
}

export type CuriosityEventTypeV3 = z.infer<typeof curiosityEventTypeV3Schema>;
export type CuriosityEventV3 = z.infer<typeof curiosityEventV3Schema>;
export type CuriositySceneV3 = z.infer<typeof curiositySceneV3Schema>;
export type CuriosityExperienceSpecV3 = z.infer<typeof curiosityExperienceSpecV3Schema>;
