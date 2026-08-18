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
    <section className="flex min-h-0 flex-1 flex-col bg-[#061223]">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-3">
        <label className="sr-only" htmlFor="studio-version">
          选择版本
        </label>
        <select
          id="studio-version"
          value={selectedVersionId ?? ''}
          onChange={(event) => onSelectVersion(event.target.value)}
          disabled={versions.length === 0}
          className="min-h-9 rounded-lg border border-white/12 bg-[#0c1e35] px-2 text-xs font-bold text-[#e6eef4] outline-none transition focus-visible:border-[#ffe08a]"
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#ffe08a]/50 px-3 text-xs font-black text-[#ffe08a] transition hover:bg-[#ffe08a]/10"
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-black text-[#c7dbe3] transition hover:border-[#ffe08a]/50 hover:text-[#fff4c7]"
          >
            <Download className="size-3.5" aria-hidden="true" /> 下载带走
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/12 p-0.5">
          <button
            type="button"
            aria-pressed={width === 'desktop'}
            onClick={() => setWidth('desktop')}
            title="桌面宽度"
            className={`grid size-8 place-items-center rounded-md transition ${width === 'desktop' ? 'bg-white/12 text-[#ffe08a]' : 'text-[#7f9cae] hover:text-[#e6eef4]'}`}
          >
            <Monitor className="size-4" aria-hidden="true" />
            <span className="sr-only">桌面宽度</span>
          </button>
          <button
            type="button"
            aria-pressed={width === 'mobile'}
            onClick={() => setWidth('mobile')}
            title="手机宽度"
            className={`grid size-8 place-items-center rounded-md transition ${width === 'mobile' ? 'bg-white/12 text-[#ffe08a]' : 'text-[#7f9cae] hover:text-[#e6eef4]'}`}
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e08a7a]/50 bg-[#2b1512] px-3 text-xs font-black text-[#ffb9a6] transition hover:bg-[#3a1c17]"
          >
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            运行报错 {runtimeErrors.length}
          </button>
        )}
      </header>

      {showErrors && runtimeErrors.length > 0 && (
        <div className="border-b border-[#e08a7a]/30 bg-[#1d0f0c] px-4 py-3">
          <p className="text-xs font-bold text-[#ffb9a6]">
            这些错误会自动带给下一轮生成，直接说“修一下报错”即可。
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-[#f0cdc4]">
            {runtimeErrors.map((error) => (
              <li key={`${error.errorKind}:${error.message}`}>
                [{error.errorKind}] {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#0a1728] p-3">
        {document ? (
          <iframe
            ref={frameRef}
            key={`${selectedVersionId}-${width}`}
            title="应用预览"
            srcDoc={document}
            sandbox="allow-scripts"
            className={`h-full rounded-xl border border-white/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,.35)] ${
              width === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          />
        ) : (
          <p className="self-center text-sm text-[#7f9cae]">
            {loading ? '正在载入这一版…' : '第一版生成完成后，应用会出现在这里。'}
          </p>
        )}
      </div>
    </section>
  );
}
