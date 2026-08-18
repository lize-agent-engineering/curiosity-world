'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { StudioHomeView } from '@/components/studio/home-view';
import type { StudioMode } from '@/lib/studio/contracts';
import {
  createStudioProject,
  listStudioProjects,
  type StudioProjectSummary,
} from '@/lib/studio/client';

export default function StudioHomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<StudioMode>('education');
  const [draft, setDraft] = useState('');
  const [targetAge, setTargetAge] = useState(8);
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
      onModeChange={(next) => {
        setMode(next);
        setDraft('');
        setError(null);
      }}
      onDraftChange={setDraft}
      onTargetAgeChange={setTargetAge}
      onSubmit={onSubmit}
      onOpenProject={(projectId) => router.push(`/studio/${projectId}`)}
    />
  );
}
