'use client';

import { useEffect } from 'react';
import type { InteractionDesignArtifactV1 } from '@/lib/curiosity/agent-contracts';
import type { CuriosityEventV1, CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';
import type { ControlledSceneEvent } from '@/lib/curiosity/controlled-scenes';
import { ChildTaskShell } from './child-task-shell';
import { RelativeMotionScene } from './scenes/relative-motion-scene';
import { FamilyExperimentScene } from './scenes/family-experiment-scene';
import { RelationExplorerScene, VariableExplorerScene } from './scenes/controlled-scene-renderer';

interface CuriosityRuntimeFrameProps {
  spec: CuriosityExperienceSpecV1;
  onReady: () => void;
  onEvent: (event: CuriosityEventV1) => void;
  onRuntimeFailure: (message: string) => void;
  readinessTimeoutMs?: number;
  activeStageKind?: 'prediction' | 'exploration' | 'transfer' | 'explanation';
  interaction: InteractionDesignArtifactV1;
}

export function CuriosityRuntimeFrame({
  spec,
  onReady,
  onEvent,
  onRuntimeFailure,
  readinessTimeoutMs: _readinessTimeoutMs = 5_000,
  activeStageKind,
  interaction,
}: CuriosityRuntimeFrameProps) {
  useEffect(() => {
    if (
      !['relative-motion', 'balance-support', 'light-path', 'open'].includes(spec.knowledge.family)
    ) {
      onRuntimeFailure(`RUNTIME_FAILED: 尚未实现 ${spec.knowledge.family} 的 React 场景。`);
      return;
    }
    onReady();
  }, [onReady, onRuntimeFailure, spec.knowledge.family]);

  const controlledDescriptor = {
    sceneType: interaction.sceneType,
    variables: interaction.variables,
    relations: interaction.relations,
  };
  const handleControlledEvent = (event: ControlledSceneEvent) =>
    onEvent({
      source: 'curiosity-world',
      protocolVersion: '1.0',
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      experienceId: spec.experienceId,
      versionId: spec.versionId,
      occurredAt: new Date().toISOString(),
      ...event,
    });

  return (
    <ChildTaskShell title={spec.presentation.title}>
      {spec.knowledge.family === 'open' ? (
        interaction.sceneType === 'variable-explorer' ? (
          <VariableExplorerScene
            descriptor={controlledDescriptor}
            tasks={spec.tasks}
            activeStageKind={activeStageKind}
            onEvent={handleControlledEvent}
          />
        ) : (
          <RelationExplorerScene
            descriptor={controlledDescriptor}
            tasks={spec.tasks}
            activeStageKind={activeStageKind}
            onEvent={handleControlledEvent}
          />
        )
      ) : spec.knowledge.family === 'relative-motion' ? (
        <RelativeMotionScene spec={spec} activeStageKind={activeStageKind} onEvent={onEvent} />
      ) : (
        <FamilyExperimentScene
          family={spec.knowledge.family}
          spec={spec}
          activeStageKind={activeStageKind}
          onEvent={onEvent}
        />
      )}
    </ChildTaskShell>
  );
}
