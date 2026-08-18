import { describe, expect, it } from 'vitest';

import { isCuriosityPublicPath } from '@/proxy';

describe('Curiosity public surface', () => {
  it.each([
    '/',
    '/curiosity',
    '/studio/prj_demo',
    '/api/studio/projects',
    '/api/studio/jobs/job_demo',
    '/experience/cur_moon',
    '/api/curiosity/generations',
    '/api/curiosity/narration',
    '/api/health',
    '/api/access-code/status',
    '/apple-icon.png',
    '/icon.svg',
  ])('allows %s', (pathname) => {
    expect(isCuriosityPublicPath(pathname)).toBe(true);
  });

  it.each(['/settings', '/classroom/legacy', '/api/chat', '/api/generate/image'])(
    'rejects legacy path %s',
    (pathname) => {
      expect(isCuriosityPublicPath(pathname)).toBe(false);
    },
  );
});
