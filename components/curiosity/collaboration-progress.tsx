import { Check, Circle } from 'lucide-react';

import type {
  CuriosityPipelineArtifact,
  CuriosityPipelineStage,
} from '@/lib/curiosity/agent-pipeline';

const stages: Array<{ id: CuriosityPipelineStage; label: string; conclusion: string }> = [
  { id: 'question_modeling', label: '核心问题', conclusion: '确认问题、安全范围和知识方向' },
  { id: 'knowledge_design', label: '知识边界', conclusion: '确定目标、因果关系和常见误解' },
  { id: 'interaction_design', label: '互动设计', conclusion: '确定变量、任务和反馈' },
  { id: 'story_design', label: '故事引导', conclusion: '组织连续阶段、旁白和提示层级' },
  { id: 'deterministic_compile', label: '运行检查', conclusion: '编译受限互动并检查事件协议' },
  { id: 'quality_review', label: '质量结论', conclusion: '逐项检查年龄、知识和迁移任务' },
];

interface CollaborationProgressProps {
  status: {
    step: string;
    progress: number;
    message: string;
    completedStages?: CuriosityPipelineStage[];
    artifacts?: CuriosityPipelineArtifact[];
  };
}

function artifactConclusion(artifact: CuriosityPipelineArtifact | undefined): string | undefined {
  if (!artifact) return undefined;
  if ('coreQuestion' in artifact) return artifact.coreQuestion;
  if ('objectives' in artifact) return `${artifact.packId} · ${artifact.objectives[0]}`;
  if ('taskSequence' in artifact)
    return `${artifact.variables.length} 个变量 · ${artifact.taskSequence.length} 个任务`;
  if ('stages' in artifact) return `${artifact.stages.length} 个连续探索阶段`;
  if ('verdict' in artifact) return artifact.verdict === 'pass' ? '全部检查通过' : '检查拒绝';
  return undefined;
}

export function CollaborationProgress({ status }: CollaborationProgressProps) {
  const completed = new Set(status.completedStages ?? []);
  const artifacts = status.artifacts ?? [];
  return (
    <section role="status" className="mt-5 rounded-2xl border border-[#d8cda4] bg-[#f3ead2] p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-black text-[#314657]">{status.message}</p>
        <span className="font-mono text-xs font-bold text-[#6f603b]">{status.progress}%</span>
      </div>
      <ol className="relative mt-5 space-y-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-[#c9ba84]">
        {stages.map((stage, index) => {
          const done = completed.has(stage.id);
          const active = status.step === stage.id;
          const conclusion = artifactConclusion(artifacts[index]);
          return (
            <li key={stage.id} className="relative grid grid-cols-[24px_1fr] gap-3">
              <span
                className={`z-10 grid size-6 place-items-center rounded-full ${done ? 'bg-[#234d69] text-white' : active ? 'bg-[#ffe08a] text-[#173047]' : 'bg-[#ddd6bd] text-[#7f7454]'}`}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : (
                  <Circle className="size-2.5 fill-current" />
                )}
              </span>
              <div>
                <p className="text-sm font-black text-[#314657]">{stage.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#657381]">
                  {conclusion ?? stage.conclusion}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
