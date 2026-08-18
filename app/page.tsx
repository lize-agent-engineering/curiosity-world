'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { StudioHomeView } from '@/components/studio/home-view';
import type { StudioMode } from '@/lib/studio/contracts';
import {
  createStudioProject,
  listStudioProjects,
  type StudioProjectSummary,
} from '@/lib/studio/client';
import {
  readTargetAge,
  serverTargetAge,
  subscribeTargetAge,
  writeTargetAge,
} from '@/lib/studio/target-age';

export default function StudioHomePage() {
  const router = useRouter();
  // Only the education surface is reachable from the UI for now; the general
  // mode stays wired through the API and the prompts.
  const mode: StudioMode = 'education';
  const [draft, setDraft] = useState('');
  const targetAge = useSyncExternalStore(subscribeTargetAge, readTargetAge, serverTargetAge);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    listStudioProjects(controller.signal)
      .then(setProjects)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { projectId } = await createStudioProject({
        prompt,
        mode,
        ...(mode === 'education' ? { targetAge } : {}),
      });
      router.push(`/studio/${projectId}`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <StudioHomeView
      mode={mode}
      draft={draft}
      targetAge={targetAge}
      busy={busy}
      error={error}
      projects={projects}
      onDraftChange={setDraft}
      onTargetAgeChange={writeTargetAge}
      onSubmit={onSubmit}
      onOpenProject={(projectId) => router.push(`/studio/${projectId}`)}
    />
  );
}
