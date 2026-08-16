import type { ThinkingConfig } from '@/lib/types/provider';
import type { LlmStage } from '@/lib/server/model-routes';
import type { CuriosityAgentRole } from './agent-contracts';
import { z } from 'zod';

export interface CuriosityRoleRoute {
  providerId: string;
  modelId: string;
  thinkingConfig?: ThinkingConfig;
}

export interface CuriosityRoutingConfig {
  defaultRoute?: CuriosityRoleRoute;
  roles: Partial<Record<CuriosityAgentRole, CuriosityRoleRoute>>;
}

export const CURIOSITY_ROUTING_STORAGE_KEY = 'curiosity-role-routes-v1';

const routeSchema = z.strictObject({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
});
const storedRoutingSchema = z.strictObject({
  roles: z.record(z.string(), routeSchema),
});

export function readCuriosityRoutingConfig(
  storage: Pick<Storage, 'getItem'>,
  defaultRoute: CuriosityRoleRoute,
): CuriosityRoutingConfig {
  const raw = storage.getItem(CURIOSITY_ROUTING_STORAGE_KEY);
  if (!raw) return { defaultRoute, roles: {} };
  const stored = storedRoutingSchema.parse(JSON.parse(raw));
  return {
    defaultRoute,
    roles: stored.roles as Partial<Record<CuriosityAgentRole, CuriosityRoleRoute>>,
  };
}

export function writeCuriosityRoleRoutes(
  storage: Pick<Storage, 'setItem'>,
  roles: Partial<Record<CuriosityAgentRole, CuriosityRoleRoute>>,
): void {
  storage.setItem(CURIOSITY_ROUTING_STORAGE_KEY, JSON.stringify({ roles }));
}

export class CuriosityRoleRouteUnavailableError extends Error {
  readonly code = 'MODEL_UNAVAILABLE';

  constructor(role: CuriosityAgentRole) {
    super(`角色 ${role} 没有可用模型。`);
    this.name = 'CuriosityRoleRouteUnavailableError';
  }
}

function isUsableRoute(route: CuriosityRoleRoute | undefined): route is CuriosityRoleRoute {
  return Boolean(route?.providerId.trim() && route.modelId.trim());
}

export function resolveRoleRoute(
  role: CuriosityAgentRole,
  config: CuriosityRoutingConfig,
): CuriosityRoleRoute {
  const selected = config.roles[role] ?? config.defaultRoute;
  if (!isUsableRoute(selected)) throw new CuriosityRoleRouteUnavailableError(role);
  return selected;
}

export function getCuriosityRoleStage(role: CuriosityAgentRole): LlmStage {
  return role;
}

export function buildCuriosityRoleHeaders(
  headers: Readonly<Record<string, string>>,
  role: CuriosityAgentRole,
): Record<string, string> {
  return { ...headers, 'x-curiosity-role': role };
}
