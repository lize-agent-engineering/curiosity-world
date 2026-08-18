'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Monitor, RotateCcw, Smartphone } from 'lucide-react';

import type { StudioRuntimeError } from '@/lib/studio/contracts';
import type { StudioVersionView } from '@/lib/studio/client';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

const EDIT_MODE_BADGE: Record<string, string> = {
  create: '全新',
  patch: '补丁',
  rewrite: '重写',
};

interface StudioPreviewPanelProps {
  versions: StudioVersionView[];
  selectedVersionId: string | null;
  currentVersionId: string | null;
  html: string | null;
  loading: boolean;
  runtimeErrors: StudioRuntimeError[];
  /** Used to name the downloaded file; the page is one self-contained document. */
  downloadName: string;
  onSelectVersion: (versionId: string) => void;
  onRollback: (versionId: string) => void;
  onRuntimeErrors?: (errors: Array<Pick<StudioRuntimeError, 'errorKind' | 'message'>>) => void;
}

export function StudioPreviewPanel({
  versions,
  selectedVersionId,
  currentVersionId,
  html,
  loading,
  runtimeErrors,
  downloadName,
  onSelectVersion,
  onRollback,
  onRuntimeErrors,
}: StudioPreviewPanelProps) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [showErrors, setShowErrors] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const selected = versions.find((version) => version.id === selectedVersionId) ?? null;
  const document = useMemo(() => (html ? patchHtmlForIframe(html) : null), [html]);

  // The sandboxed page buffers errors it threw while srcDoc was parsing — before
  // this listener existed. Ask it to replay once the listener is installed; the
  // reporter dedupes, so a live copy and a replayed copy collapse into one.
  useEffect(() => {
    if (!onRuntimeErrors) return;
    const seen = new Set<string>();
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { __curiosityInteractive?: boolean; kind?: string; errorKind?: string; message?: string }
        | undefined;
      if (!data?.__curiosityInteractive || data.kind !== 'runtime-error') return;
      const errorKind = (data.errorKind ?? 'error') as StudioRuntimeError['errorKind'];
      const message = String(data.message ?? '').slice(0, 1200);
      if (!message) return;
      const key = `${errorKind}:${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      onRuntimeErrors([{ errorKind, message }]);
    };
    window.addEventListener('message', onMessage);
    const replay = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage({ __curiosityErrorReplayRequest: true }, '*');
    }, 60);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(replay);
    };
  }, [onRuntimeErrors, selectedVersionId, document]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-bench">
      <header className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
        <label className="sr-only" htmlFor="studio-version">
          选择版本
        </label>
        <select
          id="studio-version"
          value={selectedVersionId ?? ''}
          onChange={(event) => onSelectVersion(event.target.value)}
          disabled={versions.length === 0}
          className="min-h-9 rounded-edge border border-rule bg-sheet px-2 text-xs font-bold text-ink outline-none transition focus-visible:border-spot"
        >
          {versions.length === 0 && <option value="">还没有版本</option>}
          {[...versions]
            .slice()
            .reverse()
            .map((version) => (
              <option key={version.id} value={version.id}>
                {`v${version.revision} · ${EDIT_MODE_BADGE[version.editMode]} · ${new Date(
                  version.createdAt,
                ).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
                {version.id === currentVersionId ? ' · 当前' : ''}
              </option>
            ))}
        </select>

        {selected && selected.id !== currentVersionId && (
          <button
            type="button"
            onClick={() => onRollback(selected.id)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-edge bg-spot px-3 text-xs font-black text-spot-ink transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spot"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> 回到这一版
          </button>
        )}

        {html && (
          <button
            type="button"
            onClick={() => {
              // The host page is not sandboxed, so it can hand the file over —
              // a download started by the previewed page itself would be blocked.
              const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
              // `document` is shadowed in this component by the patched HTML.
              const link = window.document.createElement('a');
              link.href = url;
              link.download = downloadName;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-edge border border-rule px-3 text-xs font-black text-ink transition hover:bg-sheet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spot"
          >
            <Download className="size-3.5" aria-hidden="true" /> 下载带走
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-edge border border-rule p-0.5">
          <button
            type="button"
            aria-pressed={width === 'desktop'}
            onClick={() => setWidth('desktop')}
            title="桌面宽度"
            className={`grid size-8 place-items-center rounded-edge transition ${width === 'desktop' ? 'bg-spot text-spot-ink' : 'text-ink-soft hover:bg-sheet'}`}
          >
            <Monitor className="size-4" aria-hidden="true" />
            <span className="sr-only">桌面宽度</span>
          </button>
          <button
            type="button"
            aria-pressed={width === 'mobile'}
            onClick={() => setWidth('mobile')}
            title="手机宽度"
            className={`grid size-8 place-items-center rounded-edge transition ${width === 'mobile' ? 'bg-spot text-spot-ink' : 'text-ink-soft hover:bg-sheet'}`}
          >
            <Smartphone className="size-4" aria-hidden="true" />
            <span className="sr-only">手机宽度</span>
          </button>
        </div>

        {runtimeErrors.length > 0 && (
          <button
            type="button"
            onClick={() => setShowErrors((value) => !value)}
            aria-expanded={showErrors}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-edge border border-fail/40 bg-fail-wash px-3 text-xs font-black text-fail transition hover:bg-fail-wash/70"
          >
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            运行报错 {runtimeErrors.length}
          </button>
        )}
      </header>

      {showErrors && runtimeErrors.length > 0 && (
        <div className="border-b border-rule bg-fail-wash px-4 py-3">
          <p className="text-[13px] font-bold text-fail">
            这些错误会自动带给下一轮，直接说“修一下报错”就行。
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-ink">
            {runtimeErrors.map((error) => (
              <li key={`${error.errorKind}:${error.message}`}>
                [{error.errorKind}] {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-bench-deep p-3">
        {document ? (
          <iframe
            ref={frameRef}
            key={`${selectedVersionId}-${width}`}
            title="应用预览"
            srcDoc={document}
            sandbox="allow-scripts"
            className={`h-full rounded-edge border border-rule bg-white shadow-[0_10px_30px_rgba(16,22,25,.18)] ${
              width === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          />
        ) : (
          <p className="self-center max-w-xs text-center text-[13px] leading-6 text-ink-soft">
            {loading ? '正在载入这一版…' : '第一版做好之后，页面会出现在这里，可以直接玩。'}
          </p>
        )}
      </div>
    </section>
  );
}
