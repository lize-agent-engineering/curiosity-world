import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CuriosityHomeView } from '@/components/curiosity/home-view';
import { CURIOSITY_AGENT_ROLES } from '@/lib/curiosity/agent-contracts';
import { LLM_STAGES } from '@/lib/server/model-routes';

describe('first-release public surface', () => {
  it('shows the concrete generation error and offers cross-domain examples without interests', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityHomeView, {
        values: { question: '毛毛虫为什么会变成蝴蝶？', targetAge: 8 },
        status: null,
        recent: [],
        error: 'NEEDS_CLARIFICATION: 请告诉我是哪一个现象。',
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onOpenExperience: vi.fn(),
      }),
    );

    expect(html).toContain('NEEDS_CLARIFICATION: 请告诉我是哪一个现象。');
    expect(html).toContain('毛毛虫为什么会变成蝴蝶？');
    expect(html).toContain('海水为什么是咸的？');
    expect(html).not.toContain('兴趣');
  });

  it('removes team and runtime guide roles, routes, APIs, test doubles and UI files', () => {
    expect(CURIOSITY_AGENT_ROLES).not.toContain('curiosity.team-assembler');
    expect(CURIOSITY_AGENT_ROLES).not.toContain('curiosity.exploration-guide');
    expect(LLM_STAGES).not.toContain('curiosity.team-assembler');
    expect(LLM_STAGES).not.toContain('curiosity.exploration-guide');

    for (const path of [
      'lib/curiosity/team-speaker.ts',
      'lib/curiosity/guidance-service.ts',
      'lib/curiosity/guidance-retry.ts',
      'app/api/curiosity/guidance/route.ts',
      'components/curiosity/exploration-team-strip.tsx',
      'tests/curiosity/guidance-api.test.ts',
      'tests/curiosity/guidance-retry.test.ts',
      'tests/curiosity/guidance.test.ts',
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }

    const experiencePage = readFileSync(
      resolve(process.cwd(), 'app/experience/[id]/page.tsx'),
      'utf8',
    );
    expect(experiencePage).not.toMatch(/team|Team|guidance|Guidance|探索小队|rotateY/);
    expect(experiencePage).toContain('selectReviewedNarration');
  });

  it('keeps Web request handling queue-only and uses the V3 validator', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/api/curiosity/generations/route.ts'),
      'utf8',
    );
    const pipeline = readFileSync(
      resolve(process.cwd(), 'lib/curiosity/agent-pipeline.ts'),
      'utf8',
    );
    const worker = readFileSync(resolve(process.cwd(), 'scripts/curiosity-worker.ts'), 'utf8');
    expect(route).not.toContain("from 'next/server'");
    expect(route).not.toContain('after(');
    expect(worker).toContain('runCuriosityWorkerOnce');
    expect(pipeline).toContain('validateCuriosityExperienceSpecV3');
    expect(pipeline).not.toContain('compileCuriosityExperience');
  });
});
