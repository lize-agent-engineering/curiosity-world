'use client';

import { useMemo, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import type { CuriosityEventV1, CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';

interface RelativeMotionSceneProps {
  spec: CuriosityExperienceSpecV1;
  activeStageKind?: string;
  onEvent: (event: CuriosityEventV1) => void | Promise<void>;
}

function createSceneEvent(
  spec: CuriosityExperienceSpecV1,
  sequence: number,
  type: CuriosityEventV1['type'],
  taskId: string,
  action: string,
  payload: Record<string, unknown>,
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

export function RelativeMotionScene({ spec, activeStageKind, onEvent }: RelativeMotionSceneProps) {
  const reduceMotion = useReducedMotion();
  const sequence = useRef(0);
  const [walkCount, setWalkCount] = useState(0);
  const [walking, setWalking] = useState(false);
  const [discovered, setDiscovered] = useState(false);
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState<string | null>(null);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const travel = walkCount * spec.simulation.observerTravel;
  const exploration = useMemo(
    () => spec.tasks.find((task) => task.kind === 'exploration'),
    [spec.tasks],
  );
  const prediction = useMemo(
    () => spec.tasks.find((task) => task.kind === 'prediction'),
    [spec.tasks],
  );
  const challenge = useMemo(
    () => spec.tasks.find((task) => task.kind === 'challenge'),
    [spec.tasks],
  );
  const explanation = useMemo(
    () => spec.tasks.find((task) => task.kind === 'explanation'),
    [spec.tasks],
  );
  const stage = activeStageKind ?? 'exploration';
  const waitingForGuide = pendingStage === stage;

  const emit = async (
    type: CuriosityEventV1['type'],
    taskId: string,
    action: string,
    payload = {},
  ) => {
    sequence.current += 1;
    await onEvent(createSceneEvent(spec, sequence.current, type, taskId, action, payload));
  };

  const walk = () => {
    if (walking) return;
    if (walkCount === 0) void emit('experiment_started', 'exploration', 'started');
    setWalking(true);
    setWalkCount((value) => value + 1);
    window.setTimeout(
      () => {
        void (async () => {
          const value = (walkCount + 1) * spec.simulation.observerTravel;
          setWalking(false);
          setDiscovered(true);
          setPendingStage(stage);
          try {
            await emit('variable_changed', exploration?.id ?? 'exploration', 'walked_forward', {
              variableId: 'observer-position',
              value,
            });
          } finally {
            setPendingStage(null);
          }
        })();
      },
      reduceMotion ? 50 : 1_350,
    );
  };

  const selectOption = async (
    kind: 'prediction' | 'transfer' | 'explanation',
    optionId: string,
    optionLabel: string,
    expectedOptionId: string,
  ) => {
    const eventPayload = { optionId, optionLabel };
    setPendingStage(stage);
    try {
      if (kind === 'prediction') {
        await emit('experiment_started', 'prediction', 'started');
        await emit('prediction_submitted', 'prediction', 'option_selected', eventPayload);
        return;
      }
      if (kind === 'transfer') {
        await emit('challenge_attempted', 'challenge', 'option_selected', eventPayload);
        if (optionId === expectedOptionId) {
          setChallengeFeedback(null);
          await emit('challenge_completed', 'challenge', 'completed', { optionId });
          setChallengeCompleted(true);
        } else {
          setChallengeFeedback('再比较一下：近处和远处，谁更容易看出位置变化？');
        }
        return;
      }
      await emit('explanation_selected', 'explanation', 'option_selected', eventPayload);
      if (optionId === expectedOptionId && challengeCompleted) {
        await emit('experience_completed', 'completion', 'finished', { optionId });
      }
    } finally {
      setPendingStage(null);
    }
  };

  const optionButtons = (
    options: Array<{ id: string; label: string }>,
    kind: 'prediction' | 'transfer' | 'explanation',
    expectedOptionId: string,
  ) => (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <motion.button
          key={option.id}
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={waitingForGuide}
          onClick={() => void selectOption(kind, option.id, option.label, expectedOptionId)}
          className="min-h-16 rounded-2xl border-2 border-white/25 bg-[#f8fbff] px-5 text-base font-black text-[#17324d] shadow-[0_6px_0_#7893a8] disabled:opacity-60"
        >
          {option.label}
        </motion.button>
      ))}
    </div>
  );

  const stagePrompt =
    stage === 'prediction'
      ? prediction?.prompt
      : stage === 'transfer'
        ? challenge?.prompt
        : stage === 'explanation'
          ? explanation?.prompt
          : stage === 'guided-discovery'
            ? '近处和远处，谁看起来移动得更多？'
            : spec.presentation.explorePrompt;

  return (
    <div className="relative min-h-[620px] overflow-hidden bg-[#07152f] text-white">
      <svg
        aria-label="远近物体视角变化实验"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 620"
        role="img"
      >
        <defs>
          <linearGradient id="night-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#07142f" />
            <stop offset="0.7" stopColor="#123b62" />
            <stop offset="1" stopColor="#255b70" />
          </linearGradient>
          <radialGradient id="moon-light">
            <stop offset="0" stopColor="#fffbd2" />
            <stop offset="0.65" stopColor="#ffe797" />
            <stop offset="1" stopColor="#ffc85f" />
          </radialGradient>
          <filter id="moon-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={discovered ? 16 : 8} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="1000" height="620" fill="url(#night-sky)" />
        <g fill="#d9efff" opacity=".75">
          <circle cx="95" cy="92" r="2" />
          <circle cx="190" cy="138" r="2.5" />
          <circle cx="338" cy="70" r="1.8" />
          <circle cx="610" cy="116" r="2" />
          <circle cx="900" cy="78" r="2.4" />
        </g>
        <motion.g
          data-scene-layer="moon"
          animate={{ x: -travel * 0.015 }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: 'easeInOut' }}
        >
          <circle
            cx="790"
            cy="125"
            r={discovered ? 48 : 42}
            fill="url(#moon-light)"
            filter="url(#moon-glow)"
          />
          <circle cx="775" cy="112" r="7" fill="#e7ca79" opacity=".45" />
        </motion.g>
        <motion.g
          data-scene-layer="far-mountain"
          animate={{ x: -travel * 0.12 }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: 'easeInOut' }}
        >
          <path d="M-80 410 L170 220 L300 350 L460 185 L680 410 Z" fill="#193f5c" />
          <path d="M370 410 L650 250 L790 360 L930 240 L1100 410 Z" fill="#24536b" />
        </motion.g>
        <path d="M0 430 Q500 390 1000 440 V620 H0Z" fill="#173f45" />
        <path
          d="M0 520 Q500 430 1000 520"
          fill="none"
          stroke="#91a99a"
          strokeWidth="78"
          opacity=".72"
        />
        <motion.g
          data-scene-layer="near-lamp"
          animate={{ x: -travel * 0.8 }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: 'easeInOut' }}
        >
          <rect x="205" y="275" width="15" height="230" rx="7" fill="#172937" />
          <path d="M212 285 Q235 250 270 265" fill="none" stroke="#172937" strokeWidth="13" />
          <circle cx="272" cy="269" r="27" fill="#ffd36a" opacity=".2" />
          <rect x="255" y="255" width="35" height="28" rx="9" fill="#ffd977" />
        </motion.g>
        <motion.g
          animate={{ x: Math.min(walkCount * 90, 260) }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: 'easeInOut' }}
        >
          <circle cx="430" cy="430" r="25" fill="#f3b986" />
          <path d="M412 424 Q430 438 448 424" fill="none" stroke="#392d3b" strokeWidth="4" />
          <path d="M408 465 Q430 445 452 465 L462 525 H398Z" fill="#ef6b58" />
          <path
            d="M410 520 L395 570 M450 520 L470 570"
            stroke="#203047"
            strokeWidth="14"
            strokeLinecap="round"
          />
        </motion.g>
      </svg>

      <div className="relative z-10 flex min-h-[620px] flex-col justify-between p-5 sm:p-8">
        <div className="max-w-md rounded-[1.4rem] border border-white/15 bg-[#07152f]/80 p-4 shadow-xl backdrop-blur-md">
          <p className="text-xs font-black tracking-[.18em] text-[#ffd76a]">
            {stage === 'prediction'
              ? '先猜一猜'
              : stage === 'guided-discovery'
                ? '仔细看看'
                : stage === 'transfer'
                  ? '换个情况想一想'
                  : stage === 'explanation'
                    ? '说出你的发现'
                    : '夜晚散步任务'}
          </p>
          <p className="mt-2 text-lg font-black leading-snug">{stagePrompt}</p>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3">
          <AnimatePresence>
            {discovered && (
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-full border border-[#fff4bd] bg-[#fff7d8] px-5 py-2 text-sm font-black text-[#25334b] shadow-lg"
              >
                <Lightbulb className="size-4 text-[#b16e1e]" aria-hidden="true" />
                近处变化大，远处变化小
              </motion.p>
            )}
          </AnimatePresence>
          {stage === 'prediction' && prediction ? (
            optionButtons(prediction.options, 'prediction', prediction.expectedOptionId)
          ) : stage === 'transfer' && challenge ? (
            optionButtons(challenge.options, 'transfer', challenge.expectedOptionId)
          ) : stage === 'explanation' && explanation ? (
            optionButtons(explanation.options, 'explanation', explanation.expectedOptionId)
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={walk}
              disabled={walking || waitingForGuide}
              className="min-h-16 w-full rounded-2xl border-2 border-[#fff0a8] bg-[#ffcf5a] px-6 text-lg font-black text-[#2d3548] shadow-[0_8px_0_#c88928] disabled:opacity-70"
            >
              {walking
                ? '正在往前走…'
                : stage === 'guided-discovery' || discovered
                  ? '再走一次，仔细比较'
                  : '让小朋友往前走'}
            </motion.button>
          )}
          {stage === 'transfer' && challengeFeedback && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-full bg-[#07152f]/85 px-4 py-2 text-sm font-bold text-[#ffe08a]"
            >
              {challengeFeedback}
            </p>
          )}
          {waitingForGuide && !walking && (
            <p
              aria-live="polite"
              className="rounded-full bg-[#07152f]/80 px-4 py-2 text-sm font-bold text-[#cbe9ff]"
            >
              探索伙伴正在回应你…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
