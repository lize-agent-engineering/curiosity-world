'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface StudioCodeStreamProps {
  code: string;
  streaming: boolean;
}

/**
 * The page being written, inset as a dark pane — the machine's own output, held
 * apart from the paper chrome around it. While a round runs this is the main
 * thing that makes the wait legible, so it stays open and follows the tail;
 * afterwards it collapses to one line the reader can reopen.
 */
export function StudioCodeStream({ code, streaming }: StudioCodeStreamProps) {
  // `null` follows the round; an explicit toggle pins it either way.
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
    <div className="mt-3 overflow-hidden rounded-edge bg-pane">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="label-machine flex w-full items-center gap-2 px-3 py-2 text-left text-pane-ink transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-proof"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        {streaming ? `正在写入 ${kb} KB` : `已写好 ${kb} KB`}
      </button>
      {expanded && (
        <pre
          ref={paneRef}
          className="max-h-60 overflow-auto border-t border-pane-rule px-3 py-2 font-mono text-[11px] leading-5 text-pane-code"
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
