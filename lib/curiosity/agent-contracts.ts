import { z } from 'zod';

export const CURIOSITY_AGENT_ROLES = [
  'curiosity.question-modeler',
  'curiosity.knowledge-designer',
  'curiosity.interaction-designer',
  'curiosity.presentation-designer',
  'curiosity.quality-reviewer',
  'curiosity.revision-planner',
] as const;

export const CURIOSITY_KNOWLEDGE_FAMILIES = [
  'relative-motion',
  'balance-support',
  'light-path',
  'open',
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
  'adjust-variable',
  'compare-relation',
] as const;

export const curiosityAgentRoleSchema = z.enum(CURIOSITY_AGENT_ROLES);
export const curiosityKnowledgeFamilySchema = z.enum(CURIOSITY_KNOWLEDGE_FAMILIES);
export const curiosityPrimitiveSchema = z.enum(CURIOSITY_PRIMITIVES);

const identifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/);
const executableModelContent =
  /<\/?(?:script|style|html|body)|\b(?:javascript:|function\s*\(|document\.|window\.|eval\s*\()|=>|\{\s*(?:display|color|position)\s*:/i;
const shortTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (value) => !executableModelContent.test(value),
    'model-authored executable content is forbidden',
  );
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
  safetyTags: z.array(z.string().trim().min(1).max(48)).max(8),
  supportStatus: z.enum(['supported', 'clarification-required', 'unsupported']),
  knowledgeRoute: z.enum(['curated', 'open']).default('curated'),
  knowledgeFamilyCandidates: z.array(curiosityKnowledgeFamilySchema).max(3),
  clarifications: z.array(shortTextSchema).max(3),
});

const causalRelationSchema = z.strictObject({
  cause: shortTextSchema,
  relation: shortTextSchema,
  effect: shortTextSchema,
});

export const knowledgeDesignArtifactV1BaseSchema = z.strictObject({
  ...artifactEnvelopeShape,
  agentRole: z.literal('curiosity.knowledge-designer'),
  schemaVersion: z.literal('1.0'),
  knowledgeFamily: curiosityKnowledgeFamilySchema,
  source: z.enum(['curated', 'open']).default('curated'),
  packId: z.string().trim().min(3).max(128),
  objectives: z.array(shortTextSchema).min(1).max(5),
  causalRelations: z.array(causalRelationSchema).min(1).max(8),
  claims: z
    .array(z.strictObject({ id: identifierSchema, statement: shortTextSchema }))
    .max(12)
    .default([]),
  relations: z
    .array(
      z.strictObject({
        id: identifierSchema,
        fromClaimId: identifierSchema,
        relation: z.enum(['supports', 'causes', 'changes', 'contrasts']),
        toClaimId: identifierSchema,
      }),
    )
    .max(16)
    .default([]),
  prerequisites: z.array(shortTextSchema).max(5),
  allowedVocabulary: z.array(z.string().trim().min(1).max(48)).min(1).max(30),
  allowedExplanations: z.array(shortTextSchema).max(12).default([]),
  forbiddenExplanations: z.array(shortTextSchema).min(1).max(12),
  misconceptions: z.array(shortTextSchema).min(1).max(12),
  uncertainties: z.array(shortTextSchema).max(12).default([]),
  timeSensitive: z.boolean().optional(),
  ageExpressionStrategy: shortTextSchema,
  observationSuggestions: z.array(shortTextSchema).min(1).max(5),
  packReferences: z.array(z.string().trim().min(3).max(160)).min(1).max(12),
});

export const knowledgeDesignArtifactV1Schema = knowledgeDesignArtifactV1BaseSchema.superRefine(
  (artifact, context) => {
    if (artifact.source !== 'open') return;
    for (const [field, value] of [
      ['claims', artifact.claims],
      ['relations', artifact.relations],
      ['allowedExplanations', artifact.allowedExplanations],
      ['uncertainties', artifact.uncertainties],
    ] as const) {
      if (value.length === 0) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `open knowledge requires ${field}`,
        });
      }
    }
    if (artifact.knowledgeFamily !== 'open') {
      context.addIssue({
        code: 'custom',
        path: ['knowledgeFamily'],
        message: 'open knowledge must use the open family',
      });
    }
    if (artifact.timeSensitive === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['timeSensitive'],
        message: 'open knowledge must declare timeSensitive',
      });
    }
  },
);

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
  'knowledge-grounding',
  'misconception-risk',
  'scene-safety',
  'interaction-completeness',
  'narration-coverage',
  'discovery-card-quality',
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
export type ChildVoiceEventV1 = z.infer<typeof childVoiceEventV1Schema>;
export type QualityReviewArtifactV1 = z.infer<typeof qualityReviewArtifactV1Schema>;
export type CuriosityAgentRun = z.infer<typeof curiosityAgentRunSchema>;
