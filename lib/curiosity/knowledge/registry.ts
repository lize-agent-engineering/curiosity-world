import type { CuriosityKnowledgeFamily } from '../agent-contracts';
import { balanceSupportPlugin } from './balance-support';
import { lightPathPlugin } from './light-path';
import { relativeMotionPlugin } from './relative-motion';
import {
  CuriosityKnowledgePluginError,
  type CuriosityKnowledgePack,
  type CuriosityKnowledgePlugin,
} from './types';

const plugins = [relativeMotionPlugin, balanceSupportPlugin, lightPathPlugin] as const;

export const knowledgeRegistry = {
  plugins,
  classify(input: { question: string; age: number }): {
    family: CuriosityKnowledgeFamily;
    packId: string;
  } {
    const matches: Array<{ plugin: CuriosityKnowledgePlugin; pack: CuriosityKnowledgePack }> = [];
    for (const plugin of plugins) {
      const pack = plugin.classify(input.question.trim());
      if (pack) matches.push({ plugin, pack });
    }
    if (matches.length === 0) {
      throw new CuriosityKnowledgePluginError(
        'UNSUPPORTED_QUESTION',
        '问题不属于已注册的知识模型族。',
      );
    }
    if (matches.length > 1) {
      throw new CuriosityKnowledgePluginError(
        'AMBIGUOUS_KNOWLEDGE_FAMILY',
        '问题同时匹配多个知识模型族，需要先澄清。',
      );
    }
    return { family: matches[0]!.plugin.family, packId: matches[0]!.pack.id };
  },
  get(family: CuriosityKnowledgeFamily): CuriosityKnowledgePlugin {
    const plugin = plugins.find((candidate) => candidate.family === family);
    if (!plugin) {
      throw new CuriosityKnowledgePluginError(
        'KNOWLEDGE_VIOLATION',
        `未注册的知识模型族：${family}`,
      );
    }
    return plugin;
  },
};
