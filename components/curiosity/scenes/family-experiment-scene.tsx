'use client';

import { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

import type { CuriosityEventV1, CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';

type SupportedFamily = 'balance-support' | 'light-path';

interface FamilyExperimentSceneProps {
  family: SupportedFamily;
  spec: CuriosityExperienceSpecV1;
  activeStageKind?: string;
  onEvent: (event: CuriosityEventV1) => void | Promise<void>;
}

const familyCopy = {
  'balance-support': {
    ariaLabel: '桥梁支撑与重心实验',
    explorationAction: '移动桥墩做承重测试',
    discovery: '桥墩越靠近重物下方，桥面越稳',
    accent: '#f4b860',
  },
  'light-path': {
    ariaLabel: '光源位置与影子长度实验',
    explorationAction: '移动手电筒观察影子',
    discovery: '光源位置改变时，影子的长度也跟着改变',
    accent: '#ffd76a',
  },
} as const;

function sceneEvent(
  spec: CuriosityExperienceSpecV1,
  sequence: number,
  type: CuriosityEventV1['type'],
  taskId: string,
  action: string,
  payload: Record<string, unknown> = {},
): CuriosityEventV1 {
  const occurredAt = new Date().toISOString();
  return {
    source: 'curiosity-world',
    protocolVersion: '1.0',
    eventId: `evt_${spec.versionId}_${occurredAt.replace(/\D/g, '')}_${sequence}`,
    experienceId: spec.experienceId,
    versionId: spec.versionId,
    type,
    taskId,
    action,
    occurredAt,
    payload,
  };
}

export function FamilyExperimentScene({
  family,
  spec,
  activeStageKind = 'exploration',
  onEvent,
}: FamilyExperimentSceneProps) {
  const copy = familyCopy[family];
  const sequence = useRef(0);
  const [experimentCount, setExperimentCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const prediction = spec.tasks.find((task) => task.kind === 'prediction');
  const challenge = spec.tasks.find((task) => task.kind === 'challenge');
  const explanation = spec.tasks.find((task) => task.kind === 'explanation');

  const emit = async (
    type: CuriosityEventV1['type'],
    taskId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    sequence.current += 1;
    await onEvent(sceneEvent(spec, sequence.current, type, taskId, action, payload));
  };

  const choose = async (
    kind: 'prediction' | 'transfer' | 'explanation',
    optionId: string,
    expectedOptionId: string,
  ) => {
    setPending(true);
    try {
      if (kind === 'prediction') {
        await emit('experiment_started', 'prediction', 'started');
        await emit('prediction_submitted', prediction?.id ?? 'prediction', 'option_selected', {
          optionId,
        });
      } else if (kind === 'transfer') {
        await emit('challenge_attempted', challenge?.id ?? 'challenge', 'option_selected', {
          optionId,
        });
        if (optionId === expectedOptionId) {
          await emit('challenge_completed', challenge?.id ?? 'challenge', 'completed', { optionId });
        }
      } else {
        await emit('explanation_selected', explanation?.id ?? 'explanation', 'option_selected', {
          optionId,
        });
        if (optionId === expectedOptionId) {
          await emit('experience_completed', 'completion', 'finished', { optionId });
          setCompleted(true);
        }
      }
    } finally {
      setPending(false);
    }
  };

  const runExperiment = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (experimentCount === 0) await emit('experiment_started', 'exploration', 'started');
      const next = experimentCount + 1;
      setExperimentCount(next);
      await emit('variable_changed', 'exploration', 'scene_adjusted', {
        variableId: family === 'balance-support' ? 'support-position' : 'light-position',
        value: next,
      });
    } finally {
      setPending(false);
    }
  };

  const options =
    activeStageKind === 'prediction'
      ? prediction?.options
      : activeStageKind === 'transfer'
        ? challenge?.options
        : activeStageKind === 'explanation'
          ? explanation?.options
          : undefined;
  const expected =
    activeStageKind === 'prediction'
      ? prediction?.expectedOptionId
      : activeStageKind === 'transfer'
        ? challenge?.expectedOptionId
        : explanation?.expectedOptionId;

  return (
    <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.25fr_.75fr]">
      <motion.svg
        viewBox="0 0 720 420"
        role="img"
        aria-label={copy.ariaLabel}
        className="min-h-72 w-full rounded-2xl bg-[#102b47]"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
      >
        <rect width="720" height="420" fill="#102b47" />
        <circle cx="590" cy="70" r="34" fill="#ffe08a" opacity=".85" />
        {family === 'balance-support' ? (
          <>
            <rect x="80" y="300" width="560" height="24" rx="10" fill="#e6a653" />
            <path
              d={experimentCount % 2 ? 'M90 300 Q360 292 630 300' : 'M90 300 Q360 265 630 300'}
              fill="none"
              stroke="#ffd99a"
              strokeWidth="10"
              className="transition-all duration-500 motion-reduce:transition-none"
            />
            <motion.g
              animate={{ x: experimentCount % 2 ? 108 : 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              <path d="M225 324 L265 390 L185 390 Z" fill="#6fa2bd" />
            </motion.g>
            <path d="M495 324 L535 390 L455 390 Z" fill="#6fa2bd" />
            <rect x="325" y="238" width="70" height="60" rx="8" fill="#dc7158" />
            <line x1="360" y1="238" x2="360" y2="332" stroke="#fff3c4" strokeDasharray="7 7" />
            <text x="360" y="220" textAnchor="middle" fill="#fff3c4" fontSize="18">重物</text>
          </>
        ) : (
          <>
            <motion.g
              animate={{ x: experimentCount % 2 ? 100 : 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              <rect x="95" y="205" width="96" height="48" rx="14" fill="#ffd76a" />
              <path d="M191 217 L240 190 L240 268 L191 241 Z" fill="#fff3b5" opacity=".75" />
            </motion.g>
            <path d="M240 190 L470 275 L470 340 L240 268 Z" fill="#ffe08a" opacity=".18" />
            <rect x="400" y="220" width="32" height="120" rx="10" fill="#df725d" />
            <motion.ellipse
              cx="510"
              cy="342"
              rx="120"
              ry="18"
              fill="#071321"
              initial={{ rx: 120 }}
              animate={{ rx: experimentCount % 2 ? 68 : 120 }}
              transition={{ duration: 0.65, ease: 'easeInOut' }}
            />
            <text x="416" y="202" textAnchor="middle" fill="#fff3c4" fontSize="18">遮挡物</text>
          </>
        )}
      </motion.svg>

      <div className="flex min-h-64 flex-col justify-center rounded-2xl border border-white/10 bg-white/[.06] p-5 text-white">
        {completed ? (
          <div>
            <CheckCircle2 className="size-9 text-[#9fd8b8]" />
            <p className="mt-3 text-xl font-black">发现完成</p>
            <p className="mt-2 text-sm leading-6 text-[#c7dbe7]">{spec.presentation.completion}</p>
          </div>
        ) : options?.length ? (
          <div>
            <p className="text-xs font-black tracking-[.14em] text-[#ffe08a]">
              {activeStageKind === 'prediction' ? '先猜一猜' : activeStageKind === 'transfer' ? '换个情况试试' : '说出你的发现'}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#dbe8ef]">
              {activeStageKind === 'prediction'
                ? prediction?.prompt
                : activeStageKind === 'transfer'
                  ? spec.presentation.challengePrompt
                  : explanation?.prompt}
            </p>
            <div className="mt-4 grid gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={pending}
                  onClick={() => void choose(activeStageKind as 'prediction' | 'transfer' | 'explanation', option.id, expected ?? '')}
                  className="min-h-12 rounded-xl border border-white/15 bg-white/10 px-4 text-left text-sm font-bold transition hover:bg-white/15 disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-black tracking-[.14em] text-[#ffe08a]">动手验证</p>
            <p className="mt-2 text-sm leading-6 text-[#dbe8ef]">
              {experimentCount > 0 ? copy.discovery : spec.presentation.explorePrompt}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void runExperiment()}
              className="mt-5 min-h-12 w-full rounded-xl px-4 font-black text-[#173047] shadow-[0_3px_0_#b78a33] disabled:opacity-60"
              style={{ backgroundColor: copy.accent }}
            >
              {copy.explorationAction}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
