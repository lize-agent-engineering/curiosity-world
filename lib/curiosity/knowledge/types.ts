import {
  CURIOSITY_EVENT_TYPES_V2,
  type CuriosityExperienceSpecV2,
  type CuriosityKnowledgeFamily,
  type CuriosityPrimitive,
  type KnowledgeDesignArtifactV1,
} from '../agent-contracts';

export interface CuriosityKnowledgePack {
  id: string;
  version: string;
  family: CuriosityKnowledgeFamily;
  questionPatterns: readonly RegExp[];
  forbiddenPatterns: readonly RegExp[];
  migrationQuestions: readonly string[];
}

export interface CuriosityCompiledInteraction {
  primitive: CuriosityPrimitive;
  variableIds: string[];
}

export interface CompiledCuriosityExperienceV2 {
  family: CuriosityKnowledgeFamily;
  packId: string;
  eventTypes: typeof CURIOSITY_EVENT_TYPES_V2;
  interactions: CuriosityCompiledInteraction[];
}

export interface CuriosityKnowledgePlugin {
  family: CuriosityKnowledgeFamily;
  packs: readonly CuriosityKnowledgePack[];
  allowedVariables: Readonly<Record<string, { min: number; max: number }>>;
  allowedPrimitives: readonly CuriosityPrimitive[];
  classify(question: string): CuriosityKnowledgePack | null;
  validateKnowledge(artifact: KnowledgeDesignArtifactV1): void;
  validateVariables(spec: CuriosityExperienceSpecV2): void;
  validatePrimitives(spec: CuriosityExperienceSpecV2): void;
  compile(spec: CuriosityExperienceSpecV2): CompiledCuriosityExperienceV2;
  migrationQuestions(packId: string): readonly string[];
}

export type CuriosityKnowledgePluginErrorCode =
  | 'UNSUPPORTED_QUESTION'
  | 'AMBIGUOUS_KNOWLEDGE_FAMILY'
  | 'KNOWLEDGE_VIOLATION';

export class CuriosityKnowledgePluginError extends Error {
  constructor(
    readonly code: CuriosityKnowledgePluginErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CuriosityKnowledgePluginError';
  }
}

export function createKnowledgePlugin(config: {
  family: CuriosityKnowledgeFamily;
  pack: CuriosityKnowledgePack;
  variables: Readonly<Record<string, { min: number; max: number }>>;
  primitives: readonly CuriosityPrimitive[];
}): CuriosityKnowledgePlugin {
  const pack = config.pack;
  const allowedPrimitives = new Set<CuriosityPrimitive>(config.primitives);
  const fail = (message: string): never => {
    throw new CuriosityKnowledgePluginError('KNOWLEDGE_VIOLATION', message);
  };

  return {
    family: config.family,
    packs: [pack],
    allowedVariables: config.variables,
    allowedPrimitives: config.primitives,
    classify(question) {
      return pack.questionPatterns.some((pattern) => pattern.test(question)) ? pack : null;
    },
    validateKnowledge(artifact) {
      if (
        artifact.knowledgeFamily !== config.family ||
        artifact.packId !== pack.id ||
        artifact.knowledgePackVersion !== pack.version ||
        pack.forbiddenPatterns.some((pattern) =>
          pattern.test(
            [
              ...artifact.causalRelations.map((relation) => relation.effect),
              ...artifact.objectives,
            ].join('\n'),
          ),
        )
      ) {
        fail(`知识设计越过 ${config.family} 的确定性边界。`);
      }
    },
    validateVariables(spec) {
      for (const variable of spec.variables) {
        const bounds = config.variables[variable.id];
        if (!bounds || variable.min < bounds.min || variable.max > bounds.max) {
          fail(`变量 ${variable.id} 不属于 ${config.family} 或超出范围。`);
        }
      }
    },
    validatePrimitives(spec) {
      if (spec.primitives.some((primitive) => !allowedPrimitives.has(primitive))) {
        fail(`交互原语越过 ${config.family} 边界。`);
      }
    },
    compile(spec) {
      this.validateVariables(spec);
      this.validatePrimitives(spec);
      return {
        family: config.family,
        packId: pack.id,
        eventTypes: CURIOSITY_EVENT_TYPES_V2,
        interactions: spec.primitives.map((primitive) => ({
          primitive,
          variableIds: spec.variables.map((variable) => variable.id),
        })),
      };
    },
    migrationQuestions(packId) {
      if (packId !== pack.id) fail(`未知知识包：${packId}`);
      return pack.migrationQuestions;
    },
  };
}
