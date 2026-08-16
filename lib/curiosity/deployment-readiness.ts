import { CURIOSITY_AGENT_ROLES } from './agent-contracts';

export type CuriosityDeploymentIssue =
  | 'WORKTREE_DIRTY'
  | 'DOCKER_CONTAINER_NOT_RUNNING'
  | 'WORKER_NOT_RUNNING'
  | 'PUBLIC_HTTPS_UNCONFIGURED'
  | 'PUBLIC_HEALTH_UNREACHABLE'
  | 'LEGACY_SURFACE_EXPOSED'
  | 'PUBLIC_URL_NOT_STABLE'
  | 'PUBLIC_MODE_DISABLED'
  | 'TEXT_MODEL_UNCONFIGURED'
  | 'TEXT_MODEL_ROUTES_INVALID'
  | 'TEXT_MODEL_ROUTES_INCOMPLETE'
  | 'PROVIDER_CREDENTIAL_UNCONFIGURED'
  | 'TTS_UNCONFIGURED'
  | 'ASR_UNCONFIGURED';

interface CuriosityDeploymentReadinessInput {
  environment: Readonly<Record<string, string | undefined>>;
  gitClean: boolean;
  dockerRunning: boolean;
  workerRunning: boolean;
  publicUrl: string | undefined;
  publicHealthOk: boolean;
  legacyRoutesBlocked: boolean;
  publicUrlStable: boolean;
}

const PROVIDER_CREDENTIAL_NAMES = ['OPENROUTER_API_KEY'] as const;

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function probeExpectedHttpStatus(
  readStatus: () => number | undefined,
  expectedStatus: number,
  attempts: number,
  onRetry: () => void = () => undefined,
): boolean {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (readStatus() === expectedStatus) return true;
    if (attempt < attempts) onRetry();
  }
  return false;
}

function assessTextModel(environment: Readonly<Record<string, string | undefined>>) {
  if (present(environment.CURIOSITY_DEFAULT_MODEL) || present(environment.DEFAULT_MODEL)) return [];
  if (!present(environment.MODEL_ROUTES)) {
    return ['TEXT_MODEL_UNCONFIGURED'] satisfies CuriosityDeploymentIssue[];
  }
  let routes: unknown;
  try {
    routes = JSON.parse(environment.MODEL_ROUTES!);
  } catch {
    return ['TEXT_MODEL_ROUTES_INVALID'] satisfies CuriosityDeploymentIssue[];
  }
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    return ['TEXT_MODEL_ROUTES_INVALID'] satisfies CuriosityDeploymentIssue[];
  }
  const configured = routes as Record<string, unknown>;
  return CURIOSITY_AGENT_ROLES.every((role) => configured[role] !== undefined)
    ? []
    : (['TEXT_MODEL_ROUTES_INCOMPLETE'] satisfies CuriosityDeploymentIssue[]);
}

export function assessCuriosityDeploymentReadiness(input: CuriosityDeploymentReadinessInput): {
  ready: boolean;
  issues: CuriosityDeploymentIssue[];
} {
  const issues: CuriosityDeploymentIssue[] = [];
  if (!input.gitClean) issues.push('WORKTREE_DIRTY');
  if (!input.dockerRunning) issues.push('DOCKER_CONTAINER_NOT_RUNNING');
  if (!input.workerRunning) issues.push('WORKER_NOT_RUNNING');
  if (!input.publicUrl?.startsWith('https://')) issues.push('PUBLIC_HTTPS_UNCONFIGURED');
  if (!input.publicHealthOk) issues.push('PUBLIC_HEALTH_UNREACHABLE');
  if (!input.legacyRoutesBlocked) issues.push('LEGACY_SURFACE_EXPOSED');
  if (!input.publicUrlStable) issues.push('PUBLIC_URL_NOT_STABLE');
  if (input.environment.CURIOSITY_PUBLIC_MODE !== '1') issues.push('PUBLIC_MODE_DISABLED');
  issues.push(...assessTextModel(input.environment));
  if (!PROVIDER_CREDENTIAL_NAMES.some((name) => present(input.environment[name]))) {
    issues.push('PROVIDER_CREDENTIAL_UNCONFIGURED');
  }
  if (
    !present(input.environment.CURIOSITY_TTS_PROVIDER) ||
    !present(input.environment.CURIOSITY_TTS_MODEL)
  ) {
    issues.push('TTS_UNCONFIGURED');
  }
  if (
    !present(input.environment.CURIOSITY_ASR_PROVIDER) ||
    !present(input.environment.CURIOSITY_ASR_MODEL)
  ) {
    issues.push('ASR_UNCONFIGURED');
  }
  return { ready: issues.length === 0, issues };
}
