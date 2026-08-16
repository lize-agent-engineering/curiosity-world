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
  classify(input: { question: string; age: number }):
    | {
        kind: 'curated';
        family: CuriosityKnowledgeFamily;
        packId: string;
      }
    | {
        kind: 'open';
        matchedFamilies: CuriosityKnowledgeFamily[];
      } {
    const matches: Array<{ plugin: CuriosityKnowledgePlugin; pack: CuriosityKnowledgePack }> = [];
    for (const plugin of plugins) {
      const pack = plugin.classify(input.question.trim());
      if (pack) matches.push({ plugin, pack });
    }
    if (matches.length !== 1) {
      return {
        kind: 'open',
        matchedFamilies: matches.map((match) => match.plugin.family),
      };
    }
    return {
      kind: 'curated',
      family: matches[0]!.plugin.family,
      packId: matches[0]!.pack.id,
    };
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
