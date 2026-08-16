import type { CuriosityEventV1 } from './contracts';
import { knowledgeRegistry } from './knowledge/registry';
import type { CuriosityExperienceAggregate } from './repository';
import { summarizeCuriosityEvents, type CuriositySummaryFact } from './runtime';

export interface CuriosityArchive {
  experienceId: string;
  versionId: string;
  question: string;
  facts: CuriositySummaryFact[];
  observationSuggestions: string[];
  ageGuidance: string;
  nextQuestions: string[];
}

export function buildCuriosityArchive(
  aggregate: CuriosityExperienceAggregate,
  versionId: string,
  events: CuriosityEventV1[],
): CuriosityArchive {
  const version = aggregate.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error(`VERSION_NOT_FOUND: ${versionId}`);
  const selectedEvents = events.filter(
    (event) => event.experienceId === aggregate.experience.id && event.versionId === versionId,
  );
  const summary = summarizeCuriosityEvents(version.spec, selectedEvents);
  const plugin = knowledgeRegistry.get(version.experienceSpec.knowledge.family);
  return {
    experienceId: aggregate.experience.id,
    versionId,
    question: aggregate.experience.question,
    facts: summary.facts,
    observationSuggestions: [...version.experienceSpec.observationSuggestions],
    ageGuidance:
      version.spec.profile.age <= 7
        ? '一次只问一个短问题，让孩子先指、拖或选择，再说一句发现。'
        : '先让孩子预测，再要求用一次观察证据解释选择。',
    nextQuestions: [...plugin.migrationQuestions(version.experienceSpec.knowledge.packId)],
  };
}
