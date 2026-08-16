import { Binoculars, Lightbulb, Route } from 'lucide-react';

import type { CuriosityArchive } from '@/lib/curiosity/archive';

interface CuriosityArchiveViewProps {
  archive: CuriosityArchive;
}

export function CuriosityArchiveView({ archive }: CuriosityArchiveViewProps) {
  return (
    <section aria-label="好奇档案" className="mt-6 grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border border-[#c9dce9] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <Binoculars className="size-4 text-[#1b4d80]" /> 现实观察
        </h3>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[#48647d]">
          {archive.observationSuggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      </article>
      <article className="rounded-2xl border border-[#c9dce9] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <Lightbulb className="size-4 text-[#c26b27]" /> 陪伴提示
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#48647d]">{archive.ageGuidance}</p>
      </article>
      <article className="rounded-2xl border border-[#c9dce9] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <Route className="size-4 text-[#347a58]" /> 下一次可以继续问
        </h3>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[#48647d]">
          {archive.nextQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}
