export const CURIOSITY_QUALITY_CRITERIA = [
  'age-fit',
  'knowledge-grounding',
  'misconception-risk',
  'scene-safety',
  'interaction-completeness',
  'narration-coverage',
  'discovery-card-quality',
] as const;

type CuriosityQualityCriterion = (typeof CURIOSITY_QUALITY_CRITERIA)[number];

interface CuriosityQualityCheck {
  criterion: CuriosityQualityCriterion;
  status: 'pass' | 'reject';
  findings: string[];
}

export function canonicalizeCuriosityQuality<T extends { checks: CuriosityQualityCheck[] }>(
  output: T,
  maxFindings: number,
): T {
  const checks = CURIOSITY_QUALITY_CRITERIA.map((criterion) => {
    const matching = output.checks.filter((check) => check.criterion === criterion);
    if (matching.length === 0) return undefined;
    return {
      criterion,
      status: matching.some((check) => check.status === 'reject') ? ('reject' as const) : 'pass',
      findings: [...new Set(matching.flatMap((check) => check.findings))].slice(0, maxFindings),
    };
  });
  if (checks.some((check) => check === undefined)) return output;
  const canonicalChecks = checks as CuriosityQualityCheck[];
  return {
    ...output,
    checks: canonicalChecks,
    verdict: canonicalChecks.some((check) => check.status === 'reject') ? 'reject' : 'pass',
  } as T;
}
