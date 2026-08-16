import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Curiosity production Docker image', () => {
  it('gives the Next.js builder enough heap for the production type check', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const builder = dockerfile.slice(
      dockerfile.indexOf('FROM base AS builder'),
      dockerfile.indexOf('FROM node:22-alpine AS runner'),
    );

    expect(builder).toContain('ENV NODE_OPTIONS=--max-old-space-size=4096');
  });

  it('creates a data directory owned by the non-root runtime user', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const runner = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS runner'));

    expect(runner).toContain('RUN mkdir -p /app/data && chown nextjs:nodejs /app/data');
    expect(runner.indexOf('RUN mkdir -p /app/data')).toBeLessThan(runner.indexOf('USER nextjs'));
  });
});
