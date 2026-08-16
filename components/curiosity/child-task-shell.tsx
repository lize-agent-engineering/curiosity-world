import type { ReactNode } from 'react';
import { MoveRight } from 'lucide-react';

interface ChildTaskShellProps {
  title: string;
  children?: ReactNode;
}

export function ChildTaskShell({ title, children }: ChildTaskShellProps) {
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-[#d9eef0]/15 bg-[#081a31] shadow-[0_24px_60px_rgba(0,0,0,.26)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9eef0]/12 bg-[#0d2847] px-5 py-4 text-white sm:px-6">
        <div>
          <p className="text-xs font-black tracking-[.16em] text-[#ffe08a]">现在只做一件事</p>
          <h1 className="mt-1 max-w-2xl text-lg font-black leading-snug text-[#fff9e7]">{title}</h1>
        </div>
        <p className="flex items-center gap-2 text-xs font-bold text-[#b9d7df]">
          先猜 <MoveRight className="size-3.5" /> 再动手 <MoveRight className="size-3.5" /> 最后解释
        </p>
      </header>
      {children}
    </section>
  );
}
