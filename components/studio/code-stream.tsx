'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface StudioCodeStreamProps {
  code: string;
  streaming: boolean;
}

/**
 * The code as it is written. While a round is running this is the main thing
 * that makes waiting bearable, so it stays open and follows the tail; once the
 * round finishes it collapses to a single line the reader can reopen.
 */
export function StudioCodeStream({ code, streaming }: StudioCodeStreamProps) {
  // `null` means "follow the round": open while the coder writes, collapsed once
  // it stops. An explicit toggle pins it either way.
  const [override, setOverride] = useState<boolean | null>(null);
  const paneRef = useRef<HTMLPreElement>(null);
  const expanded = override ?? streaming;

  useEffect(() => {
    const pane = paneRef.current;
    if (pane && streaming) pane.scrollTop = pane.scrollHeight;
  }, [code, streaming]);

  if (!code) return null;
  const kb = (new TextEncoder().encode(code).length / 1024).toFixed(1);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-[#050f1c]">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[#93aec0] transition hover:text-[#e6eef4] disabled:cursor-default"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        {streaming ? `正在写入代码 · ${kb} KB` : `已生成代码 ${kb} KB`}
      </button>
      {expanded && (
        <pre
          ref={paneRef}
          className="max-h-64 overflow-auto border-t border-white/10 px-3 py-2 font-mono text-[11px] leading-5 text-[#8fd6b4]"
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
