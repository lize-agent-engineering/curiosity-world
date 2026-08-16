import { z } from 'zod';

import { curiosityAgentRunSchema, type CuriosityAgentRun } from './agent-contracts';
import { renderCuriosityRoleSkill } from './agent-skills';
import type { CuriosityPipelineModel } from './agent-pipeline';
import {
  curiosityExperienceSpecV3Schema,
  curiosityShortTextV3Schema,
  validateCuriosityExperienceSpecV3,
  type CuriosityExperienceSpecV3,
} from './experience-spec-v3';
import { parseCuriosityModelJson } from './model-json';
import { CURIOSITY_QUALITY_CRITERIA } from './quality';
import { getCuriositySceneEntry, type CuriositySceneType } from './scenes/registry';

export interface CuriosityRevisionModels {
  planner: CuriosityPipelineModel;
  quality: CuriosityPipelineModel;
}

export interface CuriosityRevisionIdentity {
  runId: string;
  versionId: string;
  createdAt: string;
  patchArtifactId: string;
  qualityArtifactId: string;
  plannerAgentRunId: string;
  qualityAgentRunId: string;
}

export type CuriosityRevisionErrorCode =
  | 'REVISION_CONTEXT_MISSING'
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

function patchSchemaFor(base: CuriosityExperienceSpecV3, baseVersionId: string) {
  const instructionIndexes = base.scene.instructions.map((_, index) => z.literal(index));
  const limitationIndexes = base.limitations.map((_, index) => z.literal(index));
  const narrationIds = base.narrationLibrary.map((line) => line.id) as [string, ...string[]];
  const promptIds = base.discoveryPrompts.map((prompt) => prompt.id);
  const operations: z.ZodType[] = [
    z.strictObject({ op: z.literal('set_target_age'), value: z.number().int().min(6).max(10) }),
    z.strictObject({
      op: z.literal('replace_instruction'),
      index:
        instructionIndexes.length === 1
          ? instructionIndexes[0]!
          : z.union(instructionIndexes as never),
      value: curiosityShortTextV3Schema,
    }),
    z.strictObject({
      op: z.literal('replace_narration'),
      id: z.enum(narrationIds),
      value: curiosityShortTextV3Schema,
    }),
    z.strictObject({
      op: z.literal('replace_limitation'),
      index:
        limitationIndexes.length === 1
          ? limitationIndexes[0]!
          : z.union(limitationIndexes as never),
      value: curiosityShortTextV3Schema,
    }),
    z.strictObject({ op: z.literal('replace_scene_title'), value: curiosityShortTextV3Schema }),
  ];
  if (promptIds.length > 0) {
    operations.push(
      z.strictObject({
        op: z.literal('replace_discovery_prompt'),
        id: z.enum(promptIds as [string, ...string[]]),
        value: curiosityShortTextV3Schema,
      }),
    );
  }
  return z.strictObject({
    baseVersionId: z.literal(baseVersionId),
    operations: z
      .array(z.union(operations as [z.ZodType, z.ZodType, ...z.ZodType[]]))
      .min(1)
      .max(8),
  });
}

type CuriosityRevisionOperation =
  | { op: 'set_target_age'; value: number }
  | { op: 'replace_instruction'; index: number; value: string }
  | { op: 'replace_narration'; id: string; value: string }
  | { op: 'replace_discovery_prompt'; id: string; value: string }
  | { op: 'replace_limitation'; index: number; value: string }
  | { op: 'replace_scene_title'; value: string };

const qualityOutputSchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        criterion: z.enum(CURIOSITY_QUALITY_CRITERIA),
        status: z.enum(['pass', 'reject']),
        findings: z.array(z.string().trim().min(1).max(240)).max(8),
      }),
    )
    .length(CURIOSITY_QUALITY_CRITERIA.length),
  verdict: z.enum(['pass', 'reject']),
});

async function complete<T>(
  model: CuriosityPipelineModel,
  schema: z.ZodType<T>,
  prompt: Record<string, unknown>,
  code: CuriosityRevisionErrorCode,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await model.complete({
        system: `${renderCuriosityRoleSkill(
          code === 'QUALITY_REVIEW_INVALID'
            ? 'curiosity.quality-reviewer'
            : 'curiosity.revision-planner',
        )}\n只返回严格 JSON。不得修改知识、路线、事件词表或场景类型。Schema：${JSON.stringify(
          z.toJSONSchema(schema),
        )}`,
        prompt: JSON.stringify({
          ...prompt,
          ...(lastError ? { retryReason: 'schema-invalid' } : {}),
        }),
        schema,
      });
      return parseCuriosityModelJson(raw, schema);
    } catch (error) {
      lastError = error;
    }
  }
  throw new CuriosityRevisionPipelineError(code, '修改模型输出未通过严格 Schema。', lastError);
}

function applyPatch(
  base: CuriosityExperienceSpecV3,
  patch: { baseVersionId: string; operations: CuriosityRevisionOperation[] },
): CuriosityExperienceSpecV3 {
  const next = structuredClone(base);
  for (const operation of patch.operations) {
    switch (operation.op) {
      case 'set_target_age':
        if (base.targetAge <= 7 !== operation.value <= 7) {
          throw new CuriosityRevisionPipelineError(
            'REVISION_SCOPE_VIOLATION',
            '跨年龄带修改必须完整重生成，不能作为小范围修改。',
          );
        }
        next.targetAge = operation.value;
        break;
      case 'replace_instruction':
        next.scene.instructions[operation.index] = operation.value;
        break;
      case 'replace_narration': {
        const line = next.narrationLibrary.find((candidate) => candidate.id === operation.id);
        if (!line)
          throw new CuriosityRevisionPipelineError('REVISION_SCOPE_VIOLATION', '旁白不存在。');
        line.text = operation.value;
        break;
      }
      case 'replace_discovery_prompt': {
        const prompt = next.discoveryPrompts.find((candidate) => candidate.id === operation.id);
        if (!prompt)
          throw new CuriosityRevisionPipelineError('REVISION_SCOPE_VIOLATION', '发现提示不存在。');
        prompt.prompt = operation.value;
        break;
      }
      case 'replace_limitation':
        next.limitations[operation.index] = operation.value;
        break;
      case 'replace_scene_title':
        next.scene.title = operation.value;
        break;
    }
  }
  const parsed = curiosityExperienceSpecV3Schema.parse(next);
  getCuriositySceneEntry(parsed.scene.type as CuriositySceneType).validate(
    parsed.scene,
    parsed.targetAge,
  );
  return parsed;
}

function agentRun(input: {
  id: string;
  role: 'curiosity.revision-planner' | 'curiosity.quality-reviewer';
  model: CuriosityPipelineModel;
  identity: CuriosityRevisionIdentity;
  experienceId?: string;
  inputs: string[];
  outputs: string[];
}): CuriosityAgentRun {
  return curiosityAgentRunSchema.parse({
    agentRunId: input.id,
    runId: input.identity.runId,
    ...(input.experienceId ? { experienceId: input.experienceId } : {}),
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

export async function createCuriosityRevisionCandidateV3(
  input: {
    baseVersionId: string;
    spec: CuriosityExperienceSpecV3;
    instruction: string;
    experienceId?: string;
  },
  models: CuriosityRevisionModels,
  identity: CuriosityRevisionIdentity,
): Promise<{
  spec: CuriosityExperienceSpecV3;
  specHash: string;
  patch: Record<string, unknown>;
  quality: Record<string, unknown>;
  artifacts: Record<string, unknown>[];
  agentRuns: CuriosityAgentRun[];
}> {
  const base = curiosityExperienceSpecV3Schema.parse(input.spec);
  const patchSchema = patchSchemaFor(base, input.baseVersionId);
  const operations = await complete(
    models.planner,
    patchSchema,
    { instruction: input.instruction, baseVersionId: input.baseVersionId, spec: base },
    'REVISION_PATCH_INVALID',
  );
  let spec: CuriosityExperienceSpecV3;
  let specHash: string;
  try {
    ({ spec, specHash } = validateCuriosityExperienceSpecV3(
      applyPatch(
        base,
        operations as { baseVersionId: string; operations: CuriosityRevisionOperation[] },
      ),
    ));
  } catch (error) {
    if (error instanceof CuriosityRevisionPipelineError) throw error;
    throw new CuriosityRevisionPipelineError(
      'REVISION_CANDIDATE_INVALID',
      '修改候选未通过 V3 或场景验证。',
      error,
    );
  }
  const qualityOutput = await complete(
    models.quality,
    qualityOutputSchema,
    { instruction: input.instruction, base, patch: operations, candidate: spec },
    'QUALITY_REVIEW_INVALID',
  );
  if (qualityOutput.verdict !== 'pass') {
    throw new CuriosityRevisionPipelineError('QUALITY_REJECTED', '质量审查拒绝修改候选。');
  }
  const patch = {
    artifactId: identity.patchArtifactId,
    runId: identity.runId,
    agentRole: 'curiosity.revision-planner',
    schemaVersion: '3.0',
    createdAt: identity.createdAt,
    ...operations,
  };
  const quality = {
    artifactId: identity.qualityArtifactId,
    runId: identity.runId,
    agentRole: 'curiosity.quality-reviewer',
    schemaVersion: '3.0',
    createdAt: identity.createdAt,
    ...qualityOutput,
  };
  return {
    spec,
    specHash,
    patch,
    quality,
    artifacts: [patch, quality],
    agentRuns: [
      agentRun({
        id: identity.plannerAgentRunId,
        role: 'curiosity.revision-planner',
        model: models.planner,
        identity,
        experienceId: input.experienceId,
        inputs: [input.baseVersionId],
        outputs: [identity.patchArtifactId],
      }),
      agentRun({
        id: identity.qualityAgentRunId,
        role: 'curiosity.quality-reviewer',
        model: models.quality,
        identity,
        experienceId: input.experienceId,
        inputs: [identity.patchArtifactId],
        outputs: [identity.qualityArtifactId],
      }),
    ],
  };
}
