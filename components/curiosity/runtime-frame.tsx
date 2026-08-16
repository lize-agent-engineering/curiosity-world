'use client';

import { useReducer } from 'react';

import type {
  CuriosityEventV3,
  CuriosityExperienceSpecV3,
} from '@/lib/curiosity/experience-spec-v3';
import {
  getCuriositySceneEntry,
  type CuriositySceneAction,
  type CuriositySceneState,
  type CuriositySceneType,
} from '@/lib/curiosity/scenes/registry';
import { ChildTaskShell } from './child-task-shell';

interface CuriosityRuntimeFrameProps {
  experienceId: string;
  versionId: string;
  spec: CuriosityExperienceSpecV3;
  restoredState?: Partial<CuriositySceneState>;
  onEvent: (event: CuriosityEventV3) => void | Promise<void>;
  onStateChange: (state: CuriositySceneState) => void;
}

function payloadFor(action: Exclude<CuriositySceneAction, { type: 'restore' }>) {
  switch (action.type) {
    case 'inspect':
      return { objectId: action.objectId };
    case 'move':
      return { objectId: action.objectId, x: action.x, y: action.y };
    case 'change-control':
      return { controlId: action.controlId, value: action.value };
    case 'reveal':
      return { relationId: action.relationId };
    case 'respond':
      return { promptId: action.promptId, response: action.response };
  }
}

export function CuriosityRuntimeFrame({
  experienceId,
  versionId,
  spec,
  restoredState = {},
  onEvent,
  onStateChange,
}: CuriosityRuntimeFrameProps) {
  const entry = getCuriositySceneEntry(spec.scene.type as CuriositySceneType);
  const [state, reduce] = useReducer(entry.reducer, undefined, () =>
    entry.reducer(undefined, { type: 'restore', state: restoredState }),
  );
  const dispatch = (action: CuriositySceneAction) => {
    const next = entry.reducer(state, action);
    reduce(action);
    onStateChange(next);
    if (action.type === 'restore') return;
    void onEvent({
      source: 'curiosity-world',
      protocolVersion: '3.0',
      eventId: `evt_${crypto.randomUUID()}`,
      experienceId,
      versionId,
      type: entry.mapEvent(action),
      action: action.type.replaceAll('-', '_'),
      occurredAt: new Date().toISOString(),
      payload: payloadFor(action),
    });
  };
  const Renderer = entry.Renderer;
  return (
    <ChildTaskShell title={spec.scene.title}>
      <Renderer scene={spec.scene} state={state} dispatch={dispatch} />
    </ChildTaskShell>
  );
}
