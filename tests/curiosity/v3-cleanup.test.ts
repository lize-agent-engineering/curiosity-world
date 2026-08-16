import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('V3 single runtime chain', () => {
  it('removes compiler, V1 contracts, duplicated revisions and superseded scene implementations', () => {
    for (const path of [
      'lib/curiosity/compiler.ts',
      'lib/curiosity/compiler/plugins.ts',
      'lib/curiosity/contracts.ts',
      'lib/curiosity/revisions.ts',
      'lib/curiosity/controlled-scenes.ts',
      'components/curiosity/exploration-completion.tsx',
      'components/curiosity/scenes/controlled-scene-renderer.tsx',
      'components/curiosity/scenes/family-experiment-scene.tsx',
      'components/curiosity/scenes/relative-motion-scene.tsx',
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }
  });

  it('keeps repository, revision, runtime, API and model fixtures on V3 only', () => {
    for (const path of [
      'lib/curiosity/revision-pipeline.ts',
      'lib/curiosity/runtime.ts',
      'lib/curiosity/api-handlers.ts',
      'lib/curiosity/server-model.ts',
      'app/experience/[id]/page.tsx',
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(source, path).not.toMatch(
        /ExperienceSpecV[12]|experienceSpec|compileCuriosityExperience/,
      );
    }

    const repository = readFileSync(resolve(process.cwd(), 'lib/curiosity/repository.ts'), 'utf8');
    expect(repository).not.toMatch(/import[^;]+ExperienceSpecV[12]|export[^;]+ExperienceSpecV[12]/);
    expect(repository).not.toMatch(/^\s{2}experienceSpec\??:/m);
    expect(repository).toContain(
      "requiredRecord(row.experienceSpec, 'LEGACY_EXPERIENCE_SPEC_MISSING')",
    );
  });
});
