'use client';

import type { CuriosityAgentRole } from './agent-contracts';
import { buildCuriosityRoleHeaders } from './agent-routing';
import { IndexedDbCuriosityRepository } from './repository';

let repository: IndexedDbCuriosityRepository | undefined;

export function getCuriosityRepository(): IndexedDbCuriosityRepository {
  repository ??= new IndexedDbCuriosityRepository();
  return repository;
}

export function getCuriosityApiHeaders(role: CuriosityAgentRole): HeadersInit {
  return buildCuriosityRoleHeaders(
    {
      'Content-Type': 'application/json',
    },
    role,
  );
}

export async function readApiJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    const code = typeof body.errorCode === 'string' ? body.errorCode : 'REQUEST_FAILED';
    const message = typeof body.error === 'string' ? body.error : '请求失败。';
    throw new Error(`${code}: ${message}`);
  }
  return body;
}
