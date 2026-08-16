'use client';

import type { CuriosityAgentRole } from './agent-contracts';
import { buildCuriosityRoleHeaders } from './agent-routing';
import { IndexedDbCuriosityRepository, parseCuriosityExperienceSnapshot } from './repository';

let repository: IndexedDbCuriosityRepository | undefined;

export function getCuriosityRepository(): IndexedDbCuriosityRepository {
  repository ??= new IndexedDbCuriosityRepository();
  return repository;
}

export async function hydrateCuriosityExperience(experienceId: string): Promise<boolean> {
  const response = await fetch(`/api/curiosity/experiences/${experienceId}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return false;
  const body = await readApiJson(response);
  await getCuriosityRepository().importSnapshot(parseCuriosityExperienceSnapshot(body.snapshot));
  return true;
}

export async function syncCuriosityExperience(experienceId: string): Promise<void> {
  const snapshot = await getCuriosityRepository().exportSnapshot(experienceId);
  await readApiJson(
    await fetch(`/api/curiosity/experiences/${experienceId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    }),
  );
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
