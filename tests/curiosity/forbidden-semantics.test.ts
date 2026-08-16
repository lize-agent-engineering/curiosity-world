import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const forbidden = /课程|教师|同学|课堂|章节|幻灯片|白板|PBL|课堂 TTS|视频导出/;

describe('reachable Curiosity product surface', () => {
  it('uses a dedicated Curiosity settings surface and contains no legacy product language', async () => {
    const files = [
      'app/page.tsx',
      'app/experience/[id]/page.tsx',
      'components/curiosity/home-view.tsx',
      'components/curiosity/parent-review.tsx',
    ];
    const sources = await Promise.all(
      files.map((file) => readFile(path.join(process.cwd(), file), 'utf8')),
    );
    expect(sources[0]).not.toContain('@/components/settings');
    expect(sources.join('\n')).not.toMatch(forbidden);
  });
});
