import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Curiosity production Docker image', () => {
  it('declares every production runtime module used by the provider factory', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(manifest.dependencies.undici).toBeDefined();
  });

  it('gives the Next.js builder enough heap for the production type check', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const builder = dockerfile.slice(
      dockerfile.indexOf('FROM base AS builder'),
      dockerfile.indexOf('FROM node:22-alpine AS runner'),
    );

    expect(builder).toContain('ENV NODE_OPTIONS=--max-old-space-size=4096');
  });

  it('runs the worker image on the script that drives both queues', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const worker = dockerfile.slice(dockerfile.indexOf('FROM base AS worker'));
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const script = readFileSync('scripts/studio-worker.ts', 'utf8');

    expect(worker).toContain('CMD ["pnpm", "worker"]');
    expect(manifest.scripts.worker).toBe('tsx scripts/studio-worker.ts');
    // Deploying a worker that only drains one queue would silently strand the other.
    expect(script).toContain('runStudioWorkerOnce');
    expect(script).toContain('runCuriosityWorkerOnce');
  });

  it('ships the studio library and scripts into the worker image', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const worker = dockerfile.slice(dockerfile.indexOf('FROM base AS worker'));

    expect(worker).toContain('COPY lib ./lib');
    expect(worker).toContain('COPY scripts ./scripts');
  });

  it('creates a data directory owned by the non-root runtime user', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const runner = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS runner'));

    expect(runner).toContain('RUN mkdir -p /app/data && chown nextjs:nodejs /app/data');
    expect(runner.indexOf('RUN mkdir -p /app/data')).toBeLessThan(runner.indexOf('USER nextjs'));
  });
});
