import type { TeamAssemblyArtifactV1 } from '@/lib/curiosity/agent-contracts';

type ExplorationStageKind =
  | 'prediction'
  | 'exploration'
  | 'guided-discovery'
  | 'transfer'
  | 'explanation';

const preferredRoleByStage: Record<ExplorationStageKind, string> = {
  prediction: 'lead',
  exploration: 'interaction',
  'guided-discovery': 'science',
  transfer: 'interaction',
  explanation: 'science',
};

export function selectActiveTeamMember(
  team: TeamAssemblyArtifactV1,
  stageKind?: ExplorationStageKind,
  narration = '',
) {
  return (
    team.members.find((member) => narration.includes(member.name)) ??
    team.members.find(
      (member) => member.role === preferredRoleByStage[stageKind ?? 'prediction'],
    ) ??
    team.members.find((member) => member.role === 'lead') ??
    team.members[0]!
  );
}
