import { z } from 'zod';

export const CURIOSITY_AGENT_ROLES = [
  'curiosity.question-modeler',
  'curiosity.knowledge-designer',
  'curiosity.interaction-designer',
  'curiosity.story-designer',
  'curiosity.quality-reviewer',
  'curiosity.revision-planner',
  'curiosity.exploration-guide',
] as const;

export const CURIOSITY_KNOWLEDGE_FAMILIES = [
  'relative-motion',
  'balance-support',
  'light-path',
] as const;

export const CURIOSITY_PRIMITIVES = [
  'move-observer',
  'compare-near-far',
  'place-support',
  'move-center-of-mass',
  'resize-base',
  'run-load-test',
  'move-light-source',
  'move-occluder',
  'change-incidence-angle',
  'trace-light-path',
] as const;

export const CURIOSITY_EVENT_TYPES_V2 = [
  'experience_started',
  'prediction_submitted',
  'variable_changed',
  'feedback_shown',
  'transfer_attempted',
  'explanation_selected',
  'experience_completed',
] as const;

export const curiosityAgentRoleSchema = z.enum(CURIOSITY_AGENT_ROLES);
export const curiosityKnowledgeFamilySchema = z.enum(CURIOSITY_KNOWLEDGE_FAMILIES);
export const curiosityPrimitiveSchema = z.enum(CURIOSITY_PRIMITIVES);
export const curiosityEventTypeV2Schema = z.enum(CURIOSITY_EVENT_TYPES_V2);

const identifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/);
const shortTextSchema = z.string().trim().min(1).max(240);
const artifactEnvelopeShape = {
  artifactId: identifierSchema,
  runId: identifierSchema,
  createdAt: z.iso.datetime(),
  upstreamArtifactIds: z.array(identifierSchema).max(8),
  knowledgePackVersion: z.string().trim().min(1).max(96),
};

export const questionModelArtifactV1Schema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.question-modeler'),
  schemaVersion: z.literal('1.0'),
  coreQuestion: z.string().trim().min(4).max(180),
  equivalentQuestions: z.array(z.string().trim().min(4).max(180)).min(1).max(5),
  ageBand: z.enum(['6-7', '8-10']),
  interestSignals: z.array(z.string().trim().min(1).max(30)).max(5),
  safetyTags: z.array(z.string().trim().min(1).max(48)).max(8),
  supportStatus: z.enum(['supported', 'clarification-required', 'unsupported']),
  knowledgeFamilyCandidates: z.array(curiosityKnowledgeFamilySchema).max(3),
  clarifications: z.array(shortTextSchema).max(3),
});

const causalRelationSchema = z.strictObject({
  cause: shortTextSchema,
  relation: shortTextSchema,
  effect: shortTextSchema,
});

export const knowledgeDesignArtifactV1Schema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.knowledge-designer'),
  schemaVersion: z.literal('1.0'),
  knowledgeFamily: curiosityKnowledgeFamilySchema,
  packId: z.string().trim().min(3).max(128),
  objectives: z.array(shortTextSchema).min(1).max(5),
  causalRelations: z.array(causalRelationSchema).min(1).max(8),
  prerequisites: z.array(shortTextSchema).max(5),
  allowedVocabulary: z.array(z.string().trim().min(1).max(48)).min(1).max(30),
  forbiddenExplanations: z.array(shortTextSchema).min(1).max(12),
  misconceptions: z.array(shortTextSchema).min(1).max(12),
  ageExpressionStrategy: shortTextSchema,
  observationSuggestions: z.array(shortTextSchema).min(1).max(5),
  packReferences: z.array(z.string().trim().min(3).max(160)).min(1).max(12),
});

const boundedVariableSchema = z
  .strictObject({
    id: identifierSchema,
    label: z.string().trim().min(1).max(48),
    min: z.number().finite(),
    max: z.number().finite(),
    initial: z.number().finite(),
  })
  .superRefine((variable, context) => {
    if (variable.min >= variable.max) {
      context.addIssue({ code: 'custom', path: ['max'], message: 'max must be greater than min' });
    }
    if (variable.initial < variable.min || variable.initial > variable.max) {
      context.addIssue({
        code: 'custom',
        path: ['initial'],
        message: 'initial must be within the declared range',
      });
    }
  });

const taskKindSchema = z.enum([
  'prediction',
  'exploration',
  'guided-discovery',
  'transfer',
  'explanation',
]);

export const interactionDesignArtifactV1Schema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.interaction-designer'),
  schemaVersion: z.literal('1.0'),
  scenario: shortTextSchema,
  visualTheme: z.string().trim().min(1).max(120),
  variables: z.array(boundedVariableSchema).min(1).max(3),
  taskSequence: z.array(taskKindSchema).min(4).max(5),
  instructionCopy: z
    .array(
      z.strictObject({
        taskId: identifierSchema,
        kind: taskKindSchema,
        text: shortTextSchema,
      }),
    )
    .min(4)
    .max(5),
  primitives: z.array(curiosityPrimitiveSchema).min(2).max(8),
  feedback: z
    .array(
      z.strictObject({
        trigger: identifierSchema,
        message: shortTextSchema,
        explains: shortTextSchema,
      }),
    )
    .min(1)
    .max(12),
  endConditions: z.array(shortTextSchema).min(1).max(5),
});

const storyHintSchema = z.strictObject({
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  text: shortTextSchema,
  revealsAnswer: z.literal(false),
});

export const storyStageSchema = z.strictObject({
  id: identifierSchema,
  kind: taskKindSchema,
  openingNarration: shortTextSchema,
  prompt: shortTextSchema,
  allowedEventTypes: z.array(curiosityEventTypeV2Schema).min(1).max(4),
  hints: z
    .array(storyHintSchema)
    .length(3)
    .refine(
      (hints) => hints.every((hint, index) => hint.level === index),
      'hint levels must be ordered from 0 through 2',
    ),
  completionCondition: shortTextSchema,
});

export const storyDesignArtifactV1Schema = z
  .strictObject({
    ...artifactEnvelopeShape,
    agentRole: z.literal('curiosity.story-designer'),
    schemaVersion: z.literal('1.0'),
    sourceArtifactIds: z.strictObject({
      questionModel: identifierSchema.regex(/^art_/),
      knowledgeDesign: identifierSchema.regex(/^art_/),
      interactionDesign: identifierSchema.regex(/^art_/),
    }),
    stages: z.array(storyStageSchema).min(3).max(5),
  })
  .superRefine((story, context) => {
    if (new Set(story.stages.map((stage) => stage.id)).size !== story.stages.length) {
      context.addIssue({ code: 'custom', path: ['stages'], message: 'stage ids must be unique' });
    }
    const upstream = new Set(story.upstreamArtifactIds);
    for (const [key, artifactId] of Object.entries(story.sourceArtifactIds)) {
      if (!upstream.has(artifactId)) {
        context.addIssue({
          code: 'custom',
          path: ['upstreamArtifactIds'],
          message: `Missing ${key} source artifact reference`,
        });
      }
    }
  });

const guidanceBindingShape = {
  schemaVersion: z.literal('1.0'),
  experienceId: identifierSchema.regex(/^cur_/),
  versionId: identifierSchema.regex(/^ver_/),
  storyArtifactId: identifierSchema.regex(/^art_/),
  stageId: identifierSchema,
};

export const guidanceTurnRequestV1Schema = z.strictObject({
  ...guidanceBindingShape,
  recentEventIds: z.array(identifierSchema.regex(/^evt_/)).max(12),
  childInput: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('start') }),
    z.strictObject({ kind: z.literal('event'), eventId: identifierSchema.regex(/^evt_/) }),
    z.strictObject({
      kind: z.literal('voice'),
      transcript: z.string().trim().min(1).max(240),
    }),
  ]),
});

export const guidanceTurnResponseV1Schema = z.strictObject({
  ...guidanceBindingShape,
  triggeredByEventIds: z.array(identifierSchema.regex(/^evt_/)).max(12),
  narration: shortTextSchema,
  feedbackKind: z.enum(['prompt', 'observation', 'hint', 'encouragement', 'retry']),
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  advanceTo: identifierSchema,
});

export const childVoiceEventV1Schema = z
  .strictObject({
    schemaVersion: z.literal('1.0'),
    eventId: identifierSchema.regex(/^evt_/),
    experienceId: identifierSchema.regex(/^cur_/),
    versionId: identifierSchema.regex(/^ver_/),
    stageId: identifierSchema,
    status: z.enum(['recording', 'transcribing', 'accepted', 'unclear', 'failed']),
    transcript: z.string().trim().min(1).max(240).optional(),
    confidence: z.number().min(0).max(1).optional(),
    occurredAt: z.iso.datetime(),
  })
  .superRefine((event, context) => {
    if (event.status === 'accepted' && !event.transcript) {
      context.addIssue({
        code: 'custom',
        path: ['transcript'],
        message: 'accepted voice events require transcript',
      });
    }
  });

const qualityCriterionSchema = z.enum([
  'age-fit',
  'interest-link',
  'knowledge-consistency',
  'misconception-risk',
  'interaction-completeness',
  'transfer-validity',
  'copy-load',
]);

export const qualityReviewArtifactV1Schema = z
  .strictObject({
    ...artifactEnvelopeShape,
    agentRole: z.literal('curiosity.quality-reviewer'),
    schemaVersion: z.literal('1.0'),
    checks: z
      .array(
        z.strictObject({
          criterion: qualityCriterionSchema,
          status: z.enum(['pass', 'reject']),
          findings: z.array(shortTextSchema).max(8),
        }),
      )
      .length(7),
    verdict: z.enum(['pass', 'reject']),
  })
  .superRefine((review, context) => {
    const criteria = new Set(review.checks.map((check) => check.criterion));
    for (const criterion of qualityCriterionSchema.options) {
      if (!criteria.has(criterion)) {
        context.addIssue({
          code: 'custom',
          path: ['checks'],
          message: `Missing quality criterion: ${criterion}`,
        });
      }
    }
    const containsRejection = review.checks.some((check) => check.status === 'reject');
    if ((review.verdict === 'reject') !== containsRejection) {
      context.addIssue({
        code: 'custom',
        path: ['verdict'],
        message: 'verdict must reflect criterion rejections',
      });
    }
  });

const revisionFieldSchema = z.enum([
  'profile.age',
  'profile.interests',
  'presentation.instructions',
  'presentation.visualTheme',
  'variables',
  'observationSuggestions',
  'knowledge.packId',
  'knowledge.packVersion',
]);

export const revisionImpactArtifactV1Schema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.revision-planner'),
  schemaVersion: z.literal('1.0'),
  baseVersionId: identifierSchema.regex(/^ver_/),
  summary: shortTextSchema,
  changedFields: z.array(revisionFieldSchema).min(1).max(6),
  preservedFields: z.array(revisionFieldSchema).min(1).max(8),
  knowledgeFamily: curiosityKnowledgeFamilySchema,
});

const patchOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set_age'), age: z.number().int().min(6).max(10) }),
  z.strictObject({
    op: z.literal('set_interests'),
    interests: z.array(z.string().trim().min(1).max(30)).max(5),
  }),
  z.strictObject({
    op: z.literal('replace_instruction'),
    taskId: identifierSchema,
    value: shortTextSchema,
  }),
  z.strictObject({
    op: z.literal('replace_visual_theme'),
    value: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    op: z.literal('set_variable'),
    variableId: identifierSchema,
    value: z.number().finite(),
  }),
  z.strictObject({
    op: z.literal('replace_observation_suggestion'),
    index: z.number().int().min(0).max(4),
    value: shortTextSchema,
  }),
]);

export const curiosityPatchV2Schema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.revision-planner'),
  schemaVersion: z.literal('2.0'),
  baseVersionId: identifierSchema.regex(/^ver_/),
  impactArtifactId: identifierSchema.regex(/^art_/),
  operations: z.array(patchOperationSchema).min(1).max(8),
});

const compiledVariableSchema = z
  .strictObject({
    id: identifierSchema,
    min: z.number().finite(),
    max: z.number().finite(),
    initial: z.number().finite(),
  })
  .superRefine((variable, context) => {
    if (
      variable.min >= variable.max ||
      variable.initial < variable.min ||
      variable.initial > variable.max
    ) {
      context.addIssue({ code: 'custom', path: ['initial'], message: 'invalid variable bounds' });
    }
  });

export const curiosityExperienceSpecV2Schema = z
  .strictObject({
    ...artifactEnvelopeShape,
    agentRole: z.union([
      z.literal('curiosity.interaction-designer'),
      z.literal('curiosity.revision-planner'),
    ]),
    schemaVersion: z.literal('2.0'),
    experienceId: identifierSchema.regex(/^cur_/),
    versionId: identifierSchema.regex(/^ver_/),
    revision: z.number().int().positive(),
    profile: z.strictObject({
      age: z.number().int().min(6).max(10),
      interests: z.array(z.string().trim().min(1).max(30)).max(5),
    }),
    sourceArtifactIds: z.strictObject({
      questionModel: identifierSchema.regex(/^art_/),
      knowledgeDesign: identifierSchema.regex(/^art_/),
      interactionDesign: identifierSchema.regex(/^art_/),
    }),
    knowledge: z.strictObject({
      family: curiosityKnowledgeFamilySchema,
      packId: z.string().trim().min(3).max(128),
      packVersion: z.string().trim().min(1).max(96),
    }),
    title: z.string().trim().min(1).max(120),
    visualTheme: z.string().trim().min(1).max(120),
    observationSuggestions: z.array(shortTextSchema).min(1).max(5),
    instructions: z
      .array(
        z.strictObject({
          taskId: identifierSchema,
          kind: taskKindSchema,
          text: shortTextSchema,
        }),
      )
      .min(4)
      .max(5),
    variables: z.array(compiledVariableSchema).min(1).max(3),
    primitives: z.array(curiosityPrimitiveSchema).min(2).max(8),
    eventRequirements: z.array(curiosityEventTypeV2Schema).length(CURIOSITY_EVENT_TYPES_V2.length),
  })
  .superRefine((spec, context) => {
    const upstream = new Set(spec.upstreamArtifactIds);
    for (const artifactId of Object.values(spec.sourceArtifactIds)) {
      if (!upstream.has(artifactId)) {
        context.addIssue({
          code: 'custom',
          path: ['upstreamArtifactIds'],
          message: `Missing source artifact reference: ${artifactId}`,
        });
      }
    }
    if (spec.knowledge.packVersion !== spec.knowledgePackVersion) {
      context.addIssue({
        code: 'custom',
        path: ['knowledge', 'packVersion'],
        message: 'knowledge pack versions must match',
      });
    }
    const events = new Set(spec.eventRequirements);
    for (const eventType of CURIOSITY_EVENT_TYPES_V2) {
      if (!events.has(eventType)) {
        context.addIssue({
          code: 'custom',
          path: ['eventRequirements'],
          message: `Missing event requirement: ${eventType}`,
        });
      }
    }
  });

const routeSchema = z.strictObject({
  providerId: z.string().trim().min(1).max(64),
  modelId: z.string().trim().min(1).max(128),
  thinking: z
    .strictObject({
      mode: z.enum(['default', 'disabled', 'enabled', 'auto']).optional(),
      effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
      level: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
      enabled: z.boolean().optional(),
      budgetTokens: z.number().int().min(-1).max(100_000).optional(),
      excludeReasoningOutput: z.boolean().optional(),
    })
    .optional(),
});

const agentRunBaseShape = {
  agentRunId: identifierSchema,
  runId: identifierSchema,
  experienceId: identifierSchema.regex(/^cur_/).optional(),
  candidateVersionId: identifierSchema.regex(/^ver_/).optional(),
  agentRole: curiosityAgentRoleSchema,
  route: routeSchema,
  startedAt: z.iso.datetime(),
  inputArtifactIds: z.array(identifierSchema).max(8),
};

export const curiosityAgentRunSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...agentRunBaseShape,
    status: z.literal('queued'),
    outputArtifactIds: z.array(identifierSchema).length(0),
  }),
  z.strictObject({
    ...agentRunBaseShape,
    status: z.literal('running'),
    outputArtifactIds: z.array(identifierSchema).length(0),
  }),
  z.strictObject({
    ...agentRunBaseShape,
    status: z.literal('succeeded'),
    endedAt: z.iso.datetime(),
    outputArtifactIds: z.array(identifierSchema).min(1).max(4),
  }),
  z.strictObject({
    ...agentRunBaseShape,
    status: z.literal('failed'),
    endedAt: z.iso.datetime(),
    failureCode: z.string().trim().min(3).max(64),
    outputArtifactIds: z.array(identifierSchema).length(0),
  }),
]);

export type CuriosityAgentRole = z.infer<typeof curiosityAgentRoleSchema>;
export type CuriosityKnowledgeFamily = z.infer<typeof curiosityKnowledgeFamilySchema>;
export type CuriosityPrimitive = z.infer<typeof curiosityPrimitiveSchema>;
export type QuestionModelArtifactV1 = z.infer<typeof questionModelArtifactV1Schema>;
export type KnowledgeDesignArtifactV1 = z.infer<typeof knowledgeDesignArtifactV1Schema>;
export type InteractionDesignArtifactV1 = z.infer<typeof interactionDesignArtifactV1Schema>;
export type StoryDesignArtifactV1 = z.infer<typeof storyDesignArtifactV1Schema>;
export type GuidanceTurnRequestV1 = z.infer<typeof guidanceTurnRequestV1Schema>;
export type GuidanceTurnResponseV1 = z.infer<typeof guidanceTurnResponseV1Schema>;
export type ChildVoiceEventV1 = z.infer<typeof childVoiceEventV1Schema>;
export type CuriosityExperienceSpecV2 = z.infer<typeof curiosityExperienceSpecV2Schema>;
export type QualityReviewArtifactV1 = z.infer<typeof qualityReviewArtifactV1Schema>;
export type RevisionImpactArtifactV1 = z.infer<typeof revisionImpactArtifactV1Schema>;
export type CuriosityPatchV2 = z.infer<typeof curiosityPatchV2Schema>;
export type CuriosityAgentRun = z.infer<typeof curiosityAgentRunSchema>;
