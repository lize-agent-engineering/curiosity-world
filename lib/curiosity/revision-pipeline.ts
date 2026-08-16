import { z } from 'zod';

import {
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  curiosityPatchV2Schema,
  qualityReviewArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  type CuriosityAgentRun,
  type CuriosityExperienceSpecV2,
  type CuriosityPatchV2,
  type QualityReviewArtifactV1,
  type RevisionImpactArtifactV1,
} from './agent-contracts';
import { renderCuriosityRoleSkill } from './agent-skills';
import type { CuriosityPipelineArtifact, CuriosityPipelineModel } from './agent-pipeline';
import { compileCuriosityExperience, type CompiledCuriosityExperience } from './compiler';
import { curiosityExperienceSpecSchema, type CuriosityExperienceSpecV1 } from './contracts';
import { canonicalizeCuriosityQuality, CURIOSITY_QUALITY_CRITERIA } from './quality';
import { parseCuriosityModelJson } from './model-json';

export interface CuriosityRevisionModels {
  planner: CuriosityPipelineModel;
  quality: CuriosityPipelineModel;
}

export interface CuriosityRevisionIdentity {
  runId: string;
  versionId: string;
  createdAt: string;
  impactArtifactId: string;
  patchArtifactId: string;
  specArtifactId: string;
  qualityArtifactId: string;
  plannerAgentRunId: string;
  qualityAgentRunId: string;
}

export type CuriosityRevisionErrorCode =
  | 'REVISION_CONTEXT_MISSING'
  | 'REVISION_IMPACT_INVALID'
  | 'REVISION_SCOPE_VIOLATION'
  | 'REVISION_PATCH_INVALID'
  | 'REVISION_CANDIDATE_INVALID'
  | 'QUALITY_REVIEW_INVALID'
  | 'QUALITY_REJECTED';

export class CuriosityRevisionPipelineError extends Error {
  constructor(
    readonly code: CuriosityRevisionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityRevisionPipelineError';
  }
}

const impactOutputSchema = revisionImpactArtifactV1Schema.omit({
  artifactId: true,
  runId: true,
  agentRole: true,
  schemaVersion: true,
  createdAt: true,
  upstreamArtifactIds: true,
  knowledgePackVersion: true,
});

const qualityOutputSchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        criterion: z.enum(CURIOSITY_QUALITY_CRITERIA),
        status: z.enum(['pass', 'reject']),
        findings: z.array(z.string().trim().min(1).max(160)).max(2),
      }),
    )
    .min(7)
    .max(10),
  verdict: z.enum(['pass', 'reject']),
});

const operationFieldByType = {
  set_age: 'profile.age',
  replace_instruction: 'presentation.instructions',
  replace_visual_theme: 'presentation.visualTheme',
  set_variable: 'variables',
  replace_observation_suggestion: 'observationSuggestions',
} as const;

function patchOutputSchemaFor(
  base: CuriosityExperienceSpecV2,
  changedFields: RevisionImpactArtifactV1['changedFields'],
) {
  const taskIds = base.instructions.map((instruction) => instruction.taskId) as [
    string,
    ...string[],
  ];
  const variableIds = base.variables.map((variable) => variable.id) as [string, ...string[]];
  const observationIndexes = base.observationSuggestions.map((_, index) => index) as [
    number,
    ...number[],
  ];
  const shortText = z.string().trim().min(1).max(240);
  const operationSchemas = [
    z.strictObject({ op: z.literal('set_age'), age: z.number().int().min(6).max(10) }),
    z.strictObject({
      op: z.literal('replace_instruction'),
      taskId: z.enum(taskIds),
      value: shortText,
    }),
    z.strictObject({
      op: z.literal('replace_visual_theme'),
      value: z.string().trim().min(1).max(120),
    }),
    z.strictObject({
      op: z.literal('set_variable'),
      variableId: z.enum(variableIds),
      value: z.number().finite(),
    }),
    z.strictObject({
      op: z.literal('replace_observation_suggestion'),
      index: z.union(observationIndexes.map((index) => z.literal(index))),
      value: shortText,
    }),
  ].filter((schema) => {
    const operation = schema.shape.op.value as keyof typeof operationFieldByType;
    return changedFields.includes(operationFieldByType[operation]);
  });
  if (operationSchemas.length === 0) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_SCOPE_VIOLATION',
      '影响分析没有可执行的白名单字段。',
    );
  }
  const operationSchema =
    operationSchemas.length === 1
      ? operationSchemas[0]
      : z.union(
          operationSchemas as [
            (typeof operationSchemas)[number],
            (typeof operationSchemas)[number],
            ...(typeof operationSchemas)[number][],
          ],
        );
  return z.strictObject({
    operations: z.array(operationSchema).min(1).max(8),
  });
}

function structuredSystem(instruction: string, schema: z.ZodType): string {
  return `${instruction} 输出必须严格符合以下 JSON Schema：${JSON.stringify(z.toJSONSchema(schema))}`;
}

function parseModelOutput<T>(
  raw: string,
  schema: z.ZodType<T>,
  code: CuriosityRevisionErrorCode,
): T {
  try {
    return parseCuriosityModelJson(raw, schema);
  } catch (error) {
    throw new CuriosityRevisionPipelineError(code, '修改模型输出不符合严格 Schema。', error);
  }
}

function deterministicFailureSummary(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '$'}:${issue.code}`)
      .join(',');
  }
  if (error instanceof Error) return error.name;
  return 'unknown';
}

async function completeRevisionPhase<T>(
  model: CuriosityPipelineModel,
  input: Parameters<CuriosityPipelineModel['complete']>[0],
  schema: z.ZodType<T>,
  code: CuriosityRevisionErrorCode,
): Promise<T> {
  try {
    return parseModelOutput(await model.complete(input), schema, code);
  } catch (error) {
    if (error instanceof CuriosityRevisionPipelineError) throw error;
    throw new CuriosityRevisionPipelineError(code, '修改模型输出不符合严格 Schema。', error);
  }
}

function validateImpact(base: CuriosityExperienceSpecV2, impact: RevisionImpactArtifactV1): void {
  const changed = new Set(impact.changedFields);
  const preserved = new Set(impact.preservedFields);
  if (
    impact.baseVersionId !== base.versionId ||
    impact.knowledgeFamily !== base.knowledge.family ||
    changed.has('knowledge.packId') ||
    changed.has('knowledge.packVersion') ||
    !preserved.has('knowledge.packId') ||
    !preserved.has('knowledge.packVersion') ||
    [...changed].some((field) => preserved.has(field))
  ) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_SCOPE_VIOLATION',
      '修改影响分析越过知识模型族或未保持知识包不变。',
    );
  }
}

function validatePatchMatchesImpact(
  base: CuriosityExperienceSpecV2,
  impact: RevisionImpactArtifactV1,
  patch: CuriosityPatchV2,
): void {
  const changed = new Set<string>(impact.changedFields);
  if (patch.operations.some((operation) => !changed.has(operationFieldByType[operation.op]))) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_SCOPE_VIOLATION',
      '补丁包含影响分析未声明的字段。',
    );
  }
  const covered = new Set<string>(
    patch.operations.map((operation) => operationFieldByType[operation.op]),
  );
  if (impact.changedFields.some((field) => !covered.has(field))) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_SCOPE_VIOLATION',
      '补丁没有覆盖影响分析声明的全部字段。',
    );
  }
  const ageOperation = patch.operations.find((operation) => operation.op === 'set_age');
  if (ageOperation?.op === 'set_age' && base.profile.age <= 7 !== ageOperation.age <= 7) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_SCOPE_VIOLATION',
      '跨年龄带修改需要重新生成故事与互动，不能作为字段补丁发布。',
    );
  }
}

function applyExperiencePatch(
  base: CuriosityExperienceSpecV2,
  patch: CuriosityPatchV2,
  identity: CuriosityRevisionIdentity,
): CuriosityExperienceSpecV2 {
  const next = structuredClone(base);
  next.artifactId = identity.specArtifactId;
  next.runId = identity.runId;
  next.agentRole = 'curiosity.revision-planner';
  next.versionId = identity.versionId;
  next.revision += 1;
  next.createdAt = identity.createdAt;
  next.upstreamArtifactIds = [
    ...new Set([
      ...base.upstreamArtifactIds,
      base.artifactId,
      patch.impactArtifactId,
      patch.artifactId,
    ]),
  ];

  for (const operation of patch.operations) {
    switch (operation.op) {
      case 'set_age':
        next.profile.age = operation.age;
        break;
      case 'replace_instruction': {
        const selected = next.instructions.find((item) => item.taskId === operation.taskId);
        if (!selected) {
          throw new CuriosityRevisionPipelineError(
            'REVISION_SCOPE_VIOLATION',
            `未知任务：${operation.taskId}`,
          );
        }
        selected.text = operation.value;
        break;
      }
      case 'replace_visual_theme':
        next.visualTheme = operation.value;
        break;
      case 'set_variable': {
        const selected = next.variables.find((item) => item.id === operation.variableId);
        if (!selected || operation.value < selected.min || operation.value > selected.max) {
          throw new CuriosityRevisionPipelineError(
            'REVISION_SCOPE_VIOLATION',
            `变量超出白名单范围：${operation.variableId}`,
          );
        }
        selected.initial = operation.value;
        break;
      }
      case 'replace_observation_suggestion':
        if (operation.index >= next.observationSuggestions.length) {
          throw new CuriosityRevisionPipelineError(
            'REVISION_SCOPE_VIOLATION',
            `现实观察建议不存在：${operation.index}`,
          );
        }
        next.observationSuggestions[operation.index] = operation.value;
        break;
    }
  }
  return curiosityExperienceSpecV2Schema.parse(next);
}

function applyRuntimePatch(
  base: CuriosityExperienceSpecV1,
  patch: CuriosityPatchV2,
  identity: CuriosityRevisionIdentity,
): CuriosityExperienceSpecV1 {
  const next = structuredClone(curiosityExperienceSpecSchema.parse(base));
  next.versionId = identity.versionId;
  next.revision += 1;
  next.createdAt = identity.createdAt;
  for (const operation of patch.operations) {
    switch (operation.op) {
      case 'set_age':
        next.profile.age = operation.age;
        break;
      case 'replace_instruction': {
        const selected = next.tasks.find((task) => task.id === operation.taskId);
        if (selected) selected.prompt = operation.value;
        if (operation.taskId === 'exploration') next.presentation.explorePrompt = operation.value;
        if (operation.taskId === 'transfer' || operation.taskId === 'challenge') {
          next.presentation.challengePrompt = operation.value;
        }
        break;
      }
      case 'set_variable':
        if (operation.variableId === 'observer-position') {
          next.simulation.observerTravel = Math.abs(operation.value);
        } else if (operation.variableId === 'object-distance') {
          next.simulation.farObjectDistance = operation.value;
        }
        break;
      case 'replace_visual_theme':
      case 'replace_observation_suggestion':
        break;
    }
  }
  return curiosityExperienceSpecSchema.parse(next);
}

function agentRun(input: {
  agentRunId: string;
  runId: string;
  role: 'curiosity.revision-planner' | 'curiosity.quality-reviewer';
  model: CuriosityPipelineModel;
  identity: CuriosityRevisionIdentity;
  experienceId: string;
  inputs: string[];
  outputs: string[];
}): CuriosityAgentRun {
  return curiosityAgentRunSchema.parse({
    agentRunId: input.agentRunId,
    runId: input.runId,
    experienceId: input.experienceId,
    candidateVersionId: input.identity.versionId,
    agentRole: input.role,
    route: {
      providerId: input.model.route.providerId,
      modelId: input.model.route.modelId,
      ...(input.model.route.thinkingConfig ? { thinking: input.model.route.thinkingConfig } : {}),
    },
    startedAt: input.identity.createdAt,
    endedAt: input.identity.createdAt,
    status: 'succeeded',
    inputArtifactIds: input.inputs,
    outputArtifactIds: input.outputs,
  });
}

export async function createCuriosityRevisionCandidateV2(
  input: {
    experienceSpec: CuriosityExperienceSpecV2;
    runtimeSpec: CuriosityExperienceSpecV1;
    sourceArtifacts: CuriosityPipelineArtifact[];
    instruction: string;
  },
  models: CuriosityRevisionModels,
  identity: CuriosityRevisionIdentity,
): Promise<{
  impact: RevisionImpactArtifactV1;
  patch: CuriosityPatchV2;
  spec: CuriosityExperienceSpecV2;
  runtimeSpec: CuriosityExperienceSpecV1;
  quality: QualityReviewArtifactV1;
  compiled: CompiledCuriosityExperience;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
}> {
  const base = curiosityExperienceSpecV2Schema.parse(input.experienceSpec);
  const runtimeBase = curiosityExperienceSpecSchema.parse(input.runtimeSpec);
  if (base.versionId !== runtimeBase.versionId || base.experienceId !== runtimeBase.experienceId) {
    throw new CuriosityRevisionPipelineError(
      'REVISION_CONTEXT_MISSING',
      'V2 规格与运行版本不匹配。',
    );
  }

  const impactPayload = await completeRevisionPhase(
    models.planner,
    {
      system: structuredSystem(
        `你是 curiosity.revision-planner。\n${renderCuriosityRoleSkill('curiosity.revision-planner')}\n先输出严格影响分析 JSON。`,
        impactOutputSchema,
      ),
      prompt: JSON.stringify({
        phase: 'impact',
        instruction: input.instruction,
        experienceSpec: base,
        sourceArtifacts: input.sourceArtifacts,
      }),
      schema: impactOutputSchema,
    },
    impactOutputSchema,
    'REVISION_IMPACT_INVALID',
  );
  const impact = revisionImpactArtifactV1Schema.parse({
    ...impactPayload,
    artifactId: identity.impactArtifactId,
    runId: identity.runId,
    agentRole: 'curiosity.revision-planner',
    schemaVersion: '1.0',
    createdAt: identity.createdAt,
    upstreamArtifactIds: [base.artifactId, ...base.upstreamArtifactIds],
    knowledgePackVersion: base.knowledgePackVersion,
  });
  validateImpact(base, impact);

  const patchOutputSchema = patchOutputSchemaFor(base, impact.changedFields);
  const patchPayload = await completeRevisionPhase(
    models.planner,
    {
      system: structuredSystem(
        `你是 curiosity.revision-planner。\n${renderCuriosityRoleSkill('curiosity.revision-planner')}\n只输出白名单 CuriosityPatchV2 JSON。`,
        patchOutputSchema,
      ),
      prompt: JSON.stringify({
        phase: 'patch',
        instruction: input.instruction,
        impact,
        patchContract: {
          coverEveryChangedField: true,
          operationFieldMap: operationFieldByType,
        },
        experienceSpec: base,
      }),
      schema: patchOutputSchema,
    },
    patchOutputSchema,
    'REVISION_PATCH_INVALID',
  );
  const patch = curiosityPatchV2Schema.parse({
    ...patchPayload,
    artifactId: identity.patchArtifactId,
    runId: identity.runId,
    agentRole: 'curiosity.revision-planner',
    schemaVersion: '2.0',
    createdAt: identity.createdAt,
    upstreamArtifactIds: [impact.artifactId, base.artifactId],
    knowledgePackVersion: base.knowledgePackVersion,
    baseVersionId: base.versionId,
    impactArtifactId: impact.artifactId,
  });
  validatePatchMatchesImpact(base, impact, patch);

  let spec: CuriosityExperienceSpecV2;
  let runtimeSpec: CuriosityExperienceSpecV1;
  let compiled: CompiledCuriosityExperience;
  try {
    spec = applyExperiencePatch(base, patch, identity);
    runtimeSpec = applyRuntimePatch(runtimeBase, patch, identity);
    compiled = compileCuriosityExperience(runtimeSpec);
  } catch (error) {
    if (error instanceof CuriosityRevisionPipelineError) throw error;
    throw new CuriosityRevisionPipelineError(
      'REVISION_CANDIDATE_INVALID',
      `修改候选未通过确定性检查：${deterministicFailureSummary(error)}`,
      error,
    );
  }

  const qualityPayload = await completeRevisionPhase(
    models.quality,
    {
      system: structuredSystem(
        `你是 curiosity.quality-reviewer。\n${renderCuriosityRoleSkill('curiosity.quality-reviewer')}\n只能通过或拒绝，不得修改规格。`,
        qualityOutputSchema,
      ),
      prompt: JSON.stringify({
        reviewContract: {
          checksLength: 7,
          exactlyOnePerCriterion: true,
          maxFindingsPerCriterion: 2,
          criteria: [
            'age-fit',
            'interest-link',
            'knowledge-consistency',
            'misconception-risk',
            'interaction-completeness',
            'transfer-validity',
            'copy-load',
          ],
        },
        instruction: input.instruction,
        impact,
        patch,
        candidateSpec: spec,
        knowledgeBoundary: input.sourceArtifacts.find(
          (artifact) => artifact.agentRole === 'curiosity.knowledge-designer',
        ),
      }),
      schema: qualityOutputSchema,
    },
    qualityOutputSchema,
    'QUALITY_REVIEW_INVALID',
  );
  const quality = qualityReviewArtifactV1Schema.parse({
    ...canonicalizeCuriosityQuality(qualityPayload, 2),
    artifactId: identity.qualityArtifactId,
    runId: identity.runId,
    agentRole: 'curiosity.quality-reviewer',
    schemaVersion: '1.0',
    createdAt: identity.createdAt,
    upstreamArtifactIds: [impact.artifactId, patch.artifactId, spec.artifactId],
    knowledgePackVersion: base.knowledgePackVersion,
  });
  if (quality.verdict !== 'pass') {
    const rejectionSummary = quality.checks
      .filter((check) => check.status === 'reject')
      .map((check) => `${check.criterion}:${check.findings.join('；') || '未提供原因'}`)
      .join('，');
    throw new CuriosityRevisionPipelineError(
      'QUALITY_REJECTED',
      `质量审查拒绝修改候选：${rejectionSummary}`,
    );
  }

  const artifacts: CuriosityPipelineArtifact[] = [
    ...input.sourceArtifacts,
    impact,
    patch,
    spec,
    quality,
  ];
  const agentRuns = [
    agentRun({
      agentRunId: identity.plannerAgentRunId,
      runId: identity.runId,
      role: 'curiosity.revision-planner',
      model: models.planner,
      identity,
      experienceId: base.experienceId,
      inputs: [base.artifactId],
      outputs: [impact.artifactId, patch.artifactId, spec.artifactId],
    }),
    agentRun({
      agentRunId: identity.qualityAgentRunId,
      runId: identity.runId,
      role: 'curiosity.quality-reviewer',
      model: models.quality,
      identity,
      experienceId: base.experienceId,
      inputs: [impact.artifactId, patch.artifactId, spec.artifactId],
      outputs: [quality.artifactId],
    }),
  ];
  return { impact, patch, spec, runtimeSpec, quality, compiled, artifacts, agentRuns };
}
