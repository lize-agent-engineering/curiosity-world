import {
  curiosityEventSchema,
  curiosityReadyMessageSchema,
  type CuriosityEventV1,
  type CuriosityExperienceSpecV1,
} from './contracts';

export type CuriosityFrameMessage = { kind: 'ready' } | { kind: 'event'; event: CuriosityEventV1 };

export function interpretCuriosityFrameMessage(
  data: unknown,
  expected: { experienceId: string; versionId: string },
): CuriosityFrameMessage | null {
  const ready = curiosityReadyMessageSchema.safeParse(data);
  if (ready.success) {
    if (
      ready.data.experienceId !== expected.experienceId ||
      ready.data.versionId !== expected.versionId
    ) {
      return null;
    }
    return { kind: 'ready' };
  }

  const event = curiosityEventSchema.safeParse(data);
  if (!event.success) return null;
  if (
    event.data.experienceId !== expected.experienceId ||
    event.data.versionId !== expected.versionId
  ) {
    return null;
  }
  return { kind: 'event', event: event.data };
}

export interface CuriositySummaryFact {
  kind: 'prediction' | 'exploration' | 'challenge' | 'explanation' | 'completion';
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
  spec: CuriosityExperienceSpecV1,
  input: CuriosityEventV1[],
): CuriosityParentSummary {
  const byId = new Map<string, CuriosityEventV1>();
  for (const candidate of input) {
    const parsed = curiosityEventSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (
      parsed.data.experienceId !== spec.experienceId ||
      parsed.data.versionId !== spec.versionId
    ) {
      continue;
    }
    if (!byId.has(parsed.data.eventId)) byId.set(parsed.data.eventId, parsed.data);
  }
  const events = [...byId.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const facts: CuriositySummaryFact[] = [];

  const prediction = events.findLast((event) => event.type === 'prediction_submitted');
  if (prediction) {
    const optionId =
      typeof prediction.payload.optionId === 'string' ? prediction.payload.optionId : '';
    const predictionTask = spec.tasks.find((task) => task.kind === 'prediction');
    const label = predictionTask?.options.find((option) => option.id === optionId)?.label;
    facts.push({
      kind: 'prediction',
      text: label ? `孩子最初猜的是：“${label}”。` : '孩子提交了一次预测。',
      eventIds: [prediction.eventId],
    });
  }

  const movement = events.filter((event) => event.type === 'variable_changed');
  if (movement.length > 0) {
    facts.push({
      kind: 'exploration',
      text: `孩子移动观察者 ${movement.length} 次，比较了远近物体的视角变化。`,
      eventIds: movement.map((event) => event.eventId),
    });
  }

  const attempts = events.filter((event) => event.type === 'challenge_attempted');
  const completedChallenge = events.filter((event) => event.type === 'challenge_completed');
  if (attempts.length > 0 || completedChallenge.length > 0) {
    facts.push({
      kind: 'challenge',
      text: completedChallenge.length
        ? `迁移挑战尝试 ${attempts.length} 次后完成。`
        : `迁移挑战已尝试 ${attempts.length} 次，尚未完成。`,
      eventIds: [...attempts, ...completedChallenge].map((event) => event.eventId),
    });
  }

  const explanation = events.findLast((event) => event.type === 'explanation_selected');
  if (explanation) {
    const optionId =
      typeof explanation.payload.optionId === 'string' ? explanation.payload.optionId : '';
    const explanationTask = spec.tasks.find((task) => task.kind === 'explanation');
    const label = explanationTask?.options.find((option) => option.id === optionId)?.label;
    facts.push({
      kind: 'explanation',
      text: label ? `孩子最后选择的解释是：“${label}”。` : '孩子完成了一次解释选择。',
      eventIds: [explanation.eventId],
    });
  }

  const completion = events.filter((event) => event.type === 'experience_completed');
  if (completion.length > 0) {
    facts.push({
      kind: 'completion',
      text: '孩子完成了本次探索。',
      eventIds: completion.map((event) => event.eventId),
    });
  }

  return {
    experienceId: spec.experienceId,
    versionId: spec.versionId,
    eventCount: events.length,
    facts,
    recommendation:
      spec.tabletopExperiment?.title ?? '散步时比较近处路灯和远处月亮在视野里的变化。',
  };
}
