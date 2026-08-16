import type { ReactNode } from 'react';
import { MoveRight } from 'lucide-react';

interface ChildTaskShellProps {
  title: string;
  children?: ReactNode;
}

export function ChildTaskShell({ title, children }: ChildTaskShellProps) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#07152f] shadow-2xl shadow-black/30">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-white">
        <div>
          <p className="text-xs font-black tracking-[.16em] text-[#ffd76a]">现在只做一件事</p>
          <h1 className="mt-1 text-lg font-black">{title}</h1>
        </div>
        <p className="flex items-center gap-2 text-xs font-bold text-[#a8c9e5]">
          先猜 <MoveRight className="size-3.5" /> 再动手 <MoveRight className="size-3.5" /> 最后解释
        </p>
      </header>
      {children}
    </section>
  );
}
