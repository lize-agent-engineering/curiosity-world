'use client';

import { useEffect } from 'react';
import type { StoryDesignArtifactV1 } from '@/lib/curiosity/agent-contracts';
import type { CuriosityEventV1, CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';
import { ChildTaskShell } from './child-task-shell';
import { RelativeMotionScene } from './scenes/relative-motion-scene';

interface CuriosityRuntimeFrameProps {
  spec: CuriosityExperienceSpecV1;
  onReady: () => void;
  onEvent: (event: CuriosityEventV1) => void;
  onRuntimeFailure: (message: string) => void;
  readinessTimeoutMs?: number;
  activeStageKind?: StoryDesignArtifactV1['stages'][number]['kind'];
}

export function CuriosityRuntimeFrame({
  spec,
  onReady,
  onEvent,
  onRuntimeFailure,
  readinessTimeoutMs: _readinessTimeoutMs = 5_000,
  activeStageKind,
}: CuriosityRuntimeFrameProps) {
  useEffect(() => {
    if (spec.knowledge.family !== 'relative-motion') {
      onRuntimeFailure(`RUNTIME_FAILED: 尚未实现 ${spec.knowledge.family} 的 React 场景。`);
      return;
    }
    onReady();
  }, [onReady, onRuntimeFailure, spec.knowledge.family]);

  return (
    <ChildTaskShell title={spec.presentation.title}>
      {spec.knowledge.family === 'relative-motion' ? (
        <RelativeMotionScene spec={spec} activeStageKind={activeStageKind} onEvent={onEvent} />
      ) : null}
    </ChildTaskShell>
  );
}
