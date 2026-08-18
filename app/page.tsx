'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { StudioHomeView } from '@/components/studio/home-view';
import {
  createStudioProject,
  listStudioProjects,
  type StudioProjectSummary,
} from '@/lib/studio/client';

export default function StudioHomePage() {
  const router = useRouter();
  const [draft, setDraft] = useState('');
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
      const { projectId } = await createStudioProject(prompt);
      router.push(`/studio/${projectId}`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <StudioHomeView
      draft={draft}
      busy={busy}
      error={error}
      projects={projects}
      onDraftChange={setDraft}
      onSubmit={onSubmit}
      onOpenProject={(projectId) => router.push(`/studio/${projectId}`)}
      onOpenCuriosity={() => router.push('/curiosity')}
    />
  );
}
