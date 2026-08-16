import {
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

export interface CuriosityKnowledgePlugin {
  family: CuriosityKnowledgeFamily;
  packs: readonly CuriosityKnowledgePack[];
  allowedVariables: Readonly<Record<string, { min: number; max: number }>>;
  allowedPrimitives: readonly CuriosityPrimitive[];
  classify(question: string): CuriosityKnowledgePack | null;
  validateKnowledge(artifact: KnowledgeDesignArtifactV1): void;
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
    migrationQuestions(packId) {
      if (packId !== pack.id) fail(`未知知识包：${packId}`);
      return pack.migrationQuestions;
    },
  };
}
