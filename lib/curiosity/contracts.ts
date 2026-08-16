import { z } from 'zod';

export const CURIOUSITY_EVENT_TYPES = [
  'experiment_started',
  'variable_changed',
  'prediction_submitted',
  'challenge_attempted',
  'challenge_completed',
  'explanation_selected',
  'experience_completed',
] as const;

export const curiosityEventTypeSchema = z.enum(CURIOUSITY_EVENT_TYPES);

const identifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/);
const shortTextSchema = z.string().trim().min(1).max(180);
const optionSchema = z.strictObject({
  id: identifierSchema,
  label: shortTextSchema,
});

const predictionTaskSchema = z.strictObject({
  id: z.literal('prediction'),
  kind: z.literal('prediction'),
  prompt: shortTextSchema,
  options: z.array(optionSchema).min(2).max(4),
  expectedOptionId: identifierSchema,
});

const explorationTaskSchema = z.strictObject({
  id: z.literal('exploration'),
  kind: z.literal('exploration'),
  prompt: shortTextSchema,
  variable: identifierSchema,
});

const challengeTaskSchema = z.strictObject({
  id: z.literal('challenge'),
  kind: z.literal('challenge'),
  prompt: shortTextSchema,
  options: z.array(optionSchema).min(2).max(3),
  expectedOptionId: identifierSchema,
});

const explanationTaskSchema = z.strictObject({
  id: z.literal('explanation'),
  kind: z.literal('explanation'),
  prompt: shortTextSchema,
  options: z.array(optionSchema).min(2).max(3),
  expectedOptionId: identifierSchema,
});

export const curiosityTaskSchema = z.discriminatedUnion('kind', [
  predictionTaskSchema,
  explorationTaskSchema,
  challengeTaskSchema,
  explanationTaskSchema,
]);

export const tabletopExperimentSchema = z.strictObject({
  title: shortTextSchema,
  steps: z.array(shortTextSchema).min(2).max(4),
});

export const curiosityExperienceSpecSchema = z
  .strictObject({
    schemaVersion: z.literal('1.0'),
    experienceId: identifierSchema.regex(/^cur_/),
    versionId: identifierSchema.regex(/^ver_/),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    profile: z.strictObject({
      age: z.number().int().min(6).max(10),
      interests: z.array(z.string().trim().min(1).max(30)).max(5),
    }),
    question: z.strictObject({
      original: z.string().trim().min(4).max(240),
      coreQuestion: z.string().trim().min(4).max(180),
    }),
    knowledge: z.strictObject({
      family: z.enum(['relative-motion', 'balance-support', 'light-path']),
      packId: z.string().trim().min(3).max(128),
    }),
    presentation: z.strictObject({
      title: shortTextSchema,
      hook: shortTextSchema,
      explorePrompt: shortTextSchema,
      challengePrompt: shortTextSchema,
      completion: shortTextSchema,
    }),
    simulation: z.strictObject({
      preset: z.enum(['moon-parallax-v1', 'balance-support-v1', 'light-path-v1']),
      observerTravel: z.number().min(40).max(100),
      nearObjectDistance: z.number().min(10).max(30),
      farObjectDistance: z.number().min(200).max(600),
    }),
    tasks: z.array(curiosityTaskSchema).length(4),
    tabletopExperiment: tabletopExperimentSchema.optional(),
    eventRequirements: z.array(curiosityEventTypeSchema).length(CURIOUSITY_EVENT_TYPES.length),
  })
  .superRefine((spec, context) => {
    const taskKinds = new Set(spec.tasks.map((task) => task.kind));
    for (const required of ['prediction', 'exploration', 'challenge', 'explanation'] as const) {
      if (!taskKinds.has(required)) {
        context.addIssue({
          code: 'custom',
          path: ['tasks'],
          message: `Missing required task: ${required}`,
        });
      }
    }

    const eventTypes = new Set(spec.eventRequirements);
    for (const required of CURIOUSITY_EVENT_TYPES) {
      if (!eventTypes.has(required)) {
        context.addIssue({
          code: 'custom',
          path: ['eventRequirements'],
          message: `Missing required event: ${required}`,
        });
      }
    }

    for (const task of spec.tasks) {
      if (
        'options' in task &&
        !task.options.some((option) => option.id === task.expectedOptionId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['tasks'],
          message: `Task ${task.id} does not contain its expected option`,
        });
      }
    }
  });

const revisionOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set_age'), age: z.number().int().min(6).max(10) }),
  z.strictObject({
    op: z.literal('set_interests'),
    interests: z.array(z.string().trim().min(1).max(30)).max(5),
  }),
  z.strictObject({
    op: z.literal('replace_copy'),
    field: z.enum(['title', 'hook', 'explorePrompt', 'challengePrompt', 'completion']),
    value: shortTextSchema,
  }),
  z.strictObject({
    op: z.literal('set_parameter'),
    field: z.enum(['observerTravel', 'nearObjectDistance', 'farObjectDistance']),
    value: z.number(),
  }),
  z.strictObject({
    op: z.literal('set_tabletop_experiment'),
    experiment: tabletopExperimentSchema,
  }),
  z.strictObject({ op: z.literal('remove_tabletop_experiment') }),
]);

export const curiosityPatchSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  baseVersionId: identifierSchema.regex(/^ver_/),
  operations: z.array(revisionOperationSchema).min(1).max(5),
});

export const curiosityEventSchema = z.strictObject({
  source: z.literal('curiosity-world'),
  protocolVersion: z.literal('1.0'),
  eventId: identifierSchema,
  experienceId: identifierSchema.regex(/^cur_/),
  versionId: identifierSchema.regex(/^ver_/),
  type: curiosityEventTypeSchema,
  taskId: identifierSchema,
  action: identifierSchema,
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export const curiosityReadyMessageSchema = z.strictObject({
  source: z.literal('curiosity-world'),
  protocolVersion: z.literal('1.0'),
  kind: z.literal('experience_ready'),
  experienceId: identifierSchema.regex(/^cur_/),
  versionId: identifierSchema.regex(/^ver_/),
});

export type CuriosityTask = z.infer<typeof curiosityTaskSchema>;
export type CuriosityExperienceSpecV1 = z.infer<typeof curiosityExperienceSpecSchema>;
export type CuriosityPatchV1 = z.infer<typeof curiosityPatchSchema>;
export type CuriosityEventV1 = z.infer<typeof curiosityEventSchema>;
export type CuriosityReadyMessageV1 = z.infer<typeof curiosityReadyMessageSchema>;
