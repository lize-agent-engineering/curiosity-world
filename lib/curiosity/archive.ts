import type { CuriosityEventV3 } from './experience-spec-v3';
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
  events: CuriosityEventV3[],
): CuriosityArchive {
  const version = aggregate.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error(`VERSION_NOT_FOUND: ${versionId}`);
  const selectedEvents = events.filter(
    (event) => event.experienceId === aggregate.experience.id && event.versionId === versionId,
  );
  const summary = summarizeCuriosityEvents(
    { experienceId: aggregate.experience.id, versionId, spec: version.spec },
    selectedEvents,
  );
  const nextQuestions =
    version.spec.route.kind === 'curated' && version.spec.knowledge.packId
      ? [
          ...knowledgeRegistry
            .get(version.spec.route.family)
            .migrationQuestions(version.spec.knowledge.packId),
        ]
      : [];
  return {
    experienceId: aggregate.experience.id,
    versionId,
    question: aggregate.experience.question,
    facts: summary.facts,
    observationSuggestions: [...version.spec.knowledge.observationSuggestions],
    ageGuidance:
      version.spec.targetAge <= 7
        ? '一次只问一个短问题，让孩子先点、拖或选择，再说一句发现。'
        : '先让孩子自由操作，再请孩子用一次真实观察说说发现。',
    nextQuestions,
  };
}
