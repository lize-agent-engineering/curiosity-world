import {
  guidanceTurnRequestV1Schema,
  guidanceTurnResponseV1Schema,
  storyDesignArtifactV1Schema,
  type GuidanceTurnRequestV1,
  type GuidanceTurnResponseV1,
  type StoryDesignArtifactV1,
} from './agent-contracts';
import type { CuriosityEventV1 } from './contracts';

export interface GuidanceState {
  storyArtifactId: string;
  stageId: string;
  hintLevel: 0 | 1 | 2;
  completedStageIds: string[];
  lastTriggerEventIds: string[];
}

export interface GuidanceBindings {
  experienceId: string;
  versionId: string;
}

export class GuidanceStageConflictError extends Error {
  readonly code = 'GUIDANCE_STAGE_CONFLICT';

  constructor(message: string) {
    super(`GUIDANCE_STAGE_CONFLICT: ${message}`);
    this.name = 'GuidanceStageConflictError';
  }
}

export function mapGuidanceTriggerEvent(
  stageKind: StoryDesignArtifactV1['stages'][number]['kind'],
  eventType: CuriosityEventV1['type'],
): string | null {
  if (stageKind === 'transfer' && eventType === 'challenge_attempted') return null;
  if (stageKind === 'transfer' && eventType === 'challenge_completed') {
    return 'transfer_attempted';
  }
  return eventType;
}

function parsedStory(input: StoryDesignArtifactV1): StoryDesignArtifactV1 {
  return storyDesignArtifactV1Schema.parse(input);
}

export function createGuidanceState(input: StoryDesignArtifactV1): GuidanceState {
  const story = parsedStory(input);
  const first = story.stages[0];
  if (!first) throw new GuidanceStageConflictError('故事没有可开始的阶段。');
  return {
    storyArtifactId: story.artifactId,
    stageId: first.id,
    hintLevel: 0,
    completedStageIds: [],
    lastTriggerEventIds: [],
  };
}

export function deriveGuidanceRequest(
  state: GuidanceState,
  inputStory: StoryDesignArtifactV1,
  bindings: GuidanceBindings,
  recentEventIds: string[],
  childInput: GuidanceTurnRequestV1['childInput'],
): GuidanceTurnRequestV1 {
  const story = parsedStory(inputStory);
  if (
    state.storyArtifactId !== story.artifactId ||
    !story.stages.some((stage) => stage.id === state.stageId)
  ) {
    throw new GuidanceStageConflictError('当前状态与故事不一致。');
  }
  return guidanceTurnRequestV1Schema.parse({
    schemaVersion: '1.0',
    ...bindings,
    storyArtifactId: story.artifactId,
    stageId: state.stageId,
    recentEventIds,
    childInput,
  });
}

export function applyGuidanceTurn(
  state: GuidanceState,
  inputResponse: GuidanceTurnResponseV1,
  inputStory: StoryDesignArtifactV1,
  bindings: GuidanceBindings,
): GuidanceState {
  const story = parsedStory(inputStory);
  const response = guidanceTurnResponseV1Schema.parse(inputResponse);
  const currentIndex = story.stages.findIndex((stage) => stage.id === state.stageId);
  const targetIndex = story.stages.findIndex((stage) => stage.id === response.advanceTo);
  if (
    state.storyArtifactId !== story.artifactId ||
    response.storyArtifactId !== story.artifactId ||
    response.experienceId !== bindings.experienceId ||
    response.versionId !== bindings.versionId ||
    response.stageId !== state.stageId ||
    currentIndex < 0 ||
    targetIndex < currentIndex ||
    targetIndex > currentIndex + 1
  ) {
    throw new GuidanceStageConflictError('响应绑定或阶段推进非法。');
  }
  const advances = targetIndex === currentIndex + 1;
  return {
    storyArtifactId: state.storyArtifactId,
    stageId: response.advanceTo,
    hintLevel: advances ? 0 : response.hintLevel,
    completedStageIds: advances
      ? [...new Set([...state.completedStageIds, state.stageId])]
      : [...state.completedStageIds],
    lastTriggerEventIds: [...response.triggeredByEventIds],
  };
}

export function restoreGuidanceState(
  inputStory: StoryDesignArtifactV1,
  events: ReadonlyArray<{ eventId: string; type: string }>,
): GuidanceState {
  const story = parsedStory(inputStory);
  const state = createGuidanceState(story);
  const completedStageIds: string[] = [];
  let stageIndex = 0;
  for (const stage of story.stages) {
    if (!events.some((event) => stage.allowedEventTypes.includes(event.type as never))) break;
    completedStageIds.push(stage.id);
    stageIndex += 1;
  }
  const activeIndex = Math.min(stageIndex, story.stages.length - 1);
  return {
    ...state,
    stageId: story.stages[activeIndex]!.id,
    completedStageIds:
      stageIndex === story.stages.length ? completedStageIds.slice(0, -1) : completedStageIds,
    lastTriggerEventIds: events.map((event) => event.eventId),
  };
}
