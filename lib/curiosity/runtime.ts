import {
  curiosityEventV3Schema,
  type CuriosityEventV3,
  type CuriosityExperienceSpecV3,
} from './experience-spec-v3';

export interface CuriosityRuntimeIdentity {
  experienceId: string;
  versionId: string;
  spec: CuriosityExperienceSpecV3;
}

export interface CuriositySummaryFact {
  kind:
    | 'inspection'
    | 'movement'
    | 'change'
    | 'relationship'
    | 'response'
    | 'reflection'
    | 'completion';
  text: string;
  eventIds: string[];
}

export interface CuriosityParentSummary {
  experienceId: string;
  versionId: string;
  eventCount: number;
  facts: CuriositySummaryFact[];
  recommendation: string;
}

export function summarizeCuriosityEvents(
  runtime: CuriosityRuntimeIdentity,
  input: CuriosityEventV3[],
): CuriosityParentSummary {
  const byId = new Map<string, CuriosityEventV3>();
  for (const candidate of input) {
    const parsed = curiosityEventV3Schema.safeParse(candidate);
    if (
      !parsed.success ||
      parsed.data.experienceId !== runtime.experienceId ||
      parsed.data.versionId !== runtime.versionId
    ) {
      continue;
    }
    if (!byId.has(parsed.data.eventId)) byId.set(parsed.data.eventId, parsed.data);
  }
  const events = [...byId.values()].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  const facts: CuriositySummaryFact[] = [];
  const grouped = (types: CuriosityEventV3['type'][]) =>
    events.filter((event) => types.includes(event.type));
  const inspections = grouped(['object_inspected']);
  if (inspections.length) {
    facts.push({
      kind: 'inspection',
      text: `孩子查看了 ${inspections.length} 个场景对象。`,
      eventIds: inspections.map((event) => event.eventId),
    });
  }
  const movements = grouped(['object_moved']);
  if (movements.length) {
    facts.push({
      kind: 'movement',
      text: `孩子移动对象 ${movements.length} 次。`,
      eventIds: movements.map((event) => event.eventId),
    });
  }
  const changes = grouped(['control_changed']);
  if (changes.length) {
    facts.push({
      kind: 'change',
      text: `孩子改变控制条件 ${changes.length} 次。`,
      eventIds: changes.map((event) => event.eventId),
    });
  }
  const relationships = grouped(['relationship_revealed']);
  if (relationships.length) {
    facts.push({
      kind: 'relationship',
      text: `孩子打开了 ${relationships.length} 条关系。`,
      eventIds: relationships.map((event) => event.eventId),
    });
  }
  const responses = grouped(['response_recorded']);
  if (responses.length) {
    facts.push({
      kind: 'response',
      text: `孩子记录了 ${responses.length} 次回答。`,
      eventIds: responses.map((event) => event.eventId),
    });
  }
  const reflections = grouped(['reflection_recorded']);
  if (reflections.length) {
    const latest = reflections.at(-1)!;
    const text =
      typeof latest.payload.text === 'string'
        ? `孩子记录：“${latest.payload.text}”。`
        : '孩子记录了一次发现。';
    facts.push({ kind: 'reflection', text, eventIds: reflections.map((event) => event.eventId) });
  }
  const completions = grouped(['exploration_ended']);
  if (completions.length) {
    facts.push({
      kind: 'completion',
      text: '孩子结束了本次探索。',
      eventIds: completions.map((event) => event.eventId),
    });
  }
  return {
    experienceId: runtime.experienceId,
    versionId: runtime.versionId,
    eventCount: events.length,
    facts,
    recommendation: runtime.spec.knowledge.observationSuggestions[0]!,
  };
}
