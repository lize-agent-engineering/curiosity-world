import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

export function CuriosityBrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-black tracking-tight', className)}>
      <span className="grid size-7 place-items-center rounded-full bg-[#ffd76a] text-[#173d5d]">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <span>Curiosity World</span>
    </span>
  );
}
