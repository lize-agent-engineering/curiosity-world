'use client';

import { use, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { StudioWorkbench } from '@/components/studio/workbench';
import type { StudioRuntimeError } from '@/lib/studio/contracts';
import {
  buildStudioTurns,
  fetchStudioProject,
  fetchStudioVersionHtml,
  findActiveStudioJobId,
  foldStudioCode,
  pollStudioJob,
  reportStudioRuntimeErrors,
  rollbackStudioProject,
  sendStudioMessage,
  type StudioJobView,
  type StudioProjectView,
} from '@/lib/studio/client';

const POLL_INTERVAL_MS = 500;

export default function StudioProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [view, setView] = useState<StudioProjectView | null>(null);
  const [job, setJob] = useState<StudioJobView | null>(null);
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [lastRequest, setLastRequest] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // The poll loop reads the id from a ref so it never has to resubscribe; the
  // render reads the state copy.
  const activeJobIdRef = useRef<string | null>(null);
  const userSelected = useRef(false);
  const setActiveJob = useCallback((jobId: string | null) => {
    activeJobIdRef.current = jobId;
    setActiveJobId(jobId);
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchStudioProject(projectId);
    setView(next);
    if (!userSelected.current) setSelectedVersionId(next.project.currentVersionId);
    return next;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await refresh();
        if (cancelled) return;
        setActiveJob(findActiveStudioJobId(next.messages));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, setActiveJob]);

  // One poll loop for the lifetime of the page: it idles when no job is running
  // and picks up whichever job id the ref currently holds.
  useEffect(() => {
    let cancelled = false;
    let seen = 0;
    const controller = new AbortController();
    const tick = async () => {
      while (!cancelled) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        const jobId = activeJobIdRef.current;
        if (!jobId) continue;
        try {
          const next = await pollStudioJob(jobId, seen, controller.signal);
          if (cancelled) return;
          seen = next.codeLength;
          setCode((current) => foldStudioCode(current, next));
          setJob(next);
          if (next.done) {
            setActiveJob(null);
            seen = 0;
            if (next.status === 'failed') {
              setError(null);
            }
            await refresh();
          }
        } catch (cause) {
          if (cancelled || controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setActiveJob(null);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refresh, setActiveJob]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let cancelled = false;
    void (async () => {
      setHtmlLoading(true);
      try {
        const next = await fetchStudioVersionHtml(projectId, selectedVersionId);
        if (!cancelled) setHtml(next);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setHtmlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedVersionId]);

  const start = async (text: string, parentVersionId?: string) => {
    setError(null);
    setLastRequest(text);
    setCode('');
    setJob(null);
    try {
      const { jobId } = await sendStudioMessage(projectId, text, parentVersionId);
      setActiveJob(jobId);
      userSelected.current = false;
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await start(text, selectedVersionId ?? undefined);
  };

  const runtimeErrors: StudioRuntimeError[] =
    view?.versions.find((version) => version.id === selectedVersionId)?.runtimeErrors ?? [];

  const onRuntimeErrors = useCallback(
    (errors: Array<Pick<StudioRuntimeError, 'errorKind' | 'message'>>) => {
      if (!selectedVersionId) return;
      void reportStudioRuntimeErrors(projectId, selectedVersionId, errors)
        .then(() => refresh())
        .catch(() => undefined);
    },
    [projectId, refresh, selectedVersionId],
  );

  const busy = Boolean(activeJobId) || Boolean(job && !job.done);

  return (
    <StudioWorkbench
      view={view}
      turns={buildStudioTurns({
        messages: view?.messages ?? [],
        versions: view?.versions ?? [],
        activeJob: job,
        code,
      })}
      draft={draft}
      busy={busy}
      error={error}
      selectedVersionId={selectedVersionId}
      html={selectedVersionId ? html : null}
      htmlLoading={htmlLoading}
      runtimeErrors={runtimeErrors}
      onDraftChange={setDraft}
      onSubmit={onSubmit}
      onSelectVersion={(versionId) => {
        userSelected.current = true;
        setSelectedVersionId(versionId);
      }}
      onRollback={(versionId) => {
        void rollbackStudioProject(projectId, versionId)
          .then(() => {
            userSelected.current = false;
            return refresh();
          })
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
      }}
      onRetry={() => {
        if (lastRequest) void start(lastRequest, selectedVersionId ?? undefined);
      }}
      onRuntimeErrors={onRuntimeErrors}
      onBack={() => router.push('/')}
    />
  );
}
