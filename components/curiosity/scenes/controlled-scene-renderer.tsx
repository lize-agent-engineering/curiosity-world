'use client';

import { useReducer } from 'react';

import {
  createControlledSceneState,
  eventForControlledSceneAction,
  reduceControlledScene,
  type ControlledSceneAction,
  type ControlledSceneDescriptor,
  type ControlledSceneEvent,
} from '@/lib/curiosity/controlled-scenes';
import type { CuriosityTask } from '@/lib/curiosity/contracts';

interface ControlledSceneProps {
  descriptor: ControlledSceneDescriptor;
  tasks?: CuriosityTask[];
  activeStageKind?: 'prediction' | 'exploration' | 'transfer' | 'explanation';
  onEvent: (event: ControlledSceneEvent) => void | Promise<void>;
}

function ControlledScene({
  descriptor,
  tasks = [],
  activeStageKind = 'exploration',
  onEvent,
}: ControlledSceneProps) {
  const [state, dispatch] = useReducer(
    reduceControlledScene,
    descriptor,
    createControlledSceneState,
  );
  const act = (action: ControlledSceneAction) => {
    const next = reduceControlledScene(state, action);
    dispatch(action);
    onEvent(eventForControlledSceneAction(state, next, action));
  };
  const activeTask = tasks.find((task) =>
    activeStageKind === 'transfer' ? task.kind === 'challenge' : task.kind === activeStageKind,
  );
  const choose = async (optionId: string, expectedOptionId: string) => {
    const payload = { optionId };
    if (activeStageKind === 'prediction') {
      await onEvent({
        type: 'experiment_started',
        taskId: 'prediction',
        action: 'started',
        payload: {},
      });
      await onEvent({
        type: 'prediction_submitted',
        taskId: 'prediction',
        action: 'option-selected',
        payload,
      });
    } else if (activeStageKind === 'transfer') {
      await onEvent({
        type: 'challenge_attempted',
        taskId: 'challenge',
        action: 'option-selected',
        payload,
      });
      if (optionId === expectedOptionId) {
        await onEvent({
          type: 'challenge_completed',
          taskId: 'challenge',
          action: 'completed',
          payload,
        });
      }
    } else if (activeStageKind === 'explanation') {
      await onEvent({
        type: 'explanation_selected',
        taskId: 'explanation',
        action: 'option-selected',
        payload,
      });
      if (optionId === expectedOptionId) {
        await onEvent({
          type: 'experience_completed',
          taskId: 'completion',
          action: 'finished',
          payload,
        });
      }
    }
  };

  return (
    <section className="grid gap-5 rounded-2xl bg-[#102b47] p-5 text-white lg:grid-cols-[1.2fr_.8fr]">
      <div className="relative min-h-72 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_75%_20%,#ffe08a_0_5%,transparent_6%),linear-gradient(160deg,#173f68,#0a2039)] p-6">
        <p className="text-xs font-black tracking-[.16em] text-[#ffe08a]">动手比较</p>
        <div className="mt-10 flex h-36 items-end justify-around gap-4" aria-label="变量关系观察区">
          {descriptor.variables.map((variable) => {
            const ratio =
              (state.values[variable.id]! - variable.min) / (variable.max - variable.min);
            return (
              <div
                key={variable.id}
                className="flex h-full flex-1 flex-col items-center justify-end gap-3"
              >
                <div
                  className="w-full max-w-24 rounded-t-xl bg-[#6fc5c1] transition-[height] duration-300 motion-reduce:transition-none"
                  style={{ height: `${32 + ratio * 96}px` }}
                />
                <span className="text-sm font-bold">{variable.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-5 rounded-2xl border border-white/10 bg-white/[.06] p-5">
        {activeTask && 'options' in activeTask ? (
          <div>
            <p className="font-black text-[#ffe08a]">{activeTask.prompt}</p>
            <div className="mt-4 grid gap-2">
              {activeTask.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="min-h-12 rounded-xl border border-white/15 bg-white/10 px-4 text-left font-bold"
                  onClick={() => void choose(option.id, activeTask.expectedOptionId)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          descriptor.variables.map((variable) => (
            <label key={variable.id} className="text-sm font-bold">
              {variable.label}：{state.values[variable.id]}
              <input
                className="mt-3 block w-full accent-[#ffe08a]"
                type="range"
                min={variable.min}
                max={variable.max}
                value={state.values[variable.id]}
                onChange={(event) =>
                  act({
                    type: 'set-variable',
                    variableId: variable.id,
                    value: Number(event.target.value),
                  })
                }
              />
            </label>
          ))
        )}
        {activeStageKind === 'exploration' &&
          descriptor.relations.map((relation) => (
            <button
              key={relation.id}
              type="button"
              className="min-h-12 rounded-xl bg-[#ffd76a] px-4 font-black text-[#173047]"
              onClick={() => act({ type: 'compare-relation', relationId: relation.id })}
            >
              比较这组变化
            </button>
          ))}
      </div>
    </section>
  );
}

export function VariableExplorerScene(props: ControlledSceneProps) {
  if (props.descriptor.sceneType !== 'variable-explorer') {
    throw new Error('VARIABLE_EXPLORER_SCENE_TYPE_REQUIRED');
  }
  return <ControlledScene {...props} />;
}

export function RelationExplorerScene(props: ControlledSceneProps) {
  if (props.descriptor.sceneType !== 'relation-explorer') {
    throw new Error('RELATION_EXPLORER_SCENE_TYPE_REQUIRED');
  }
  return <ControlledScene {...props} />;
}
