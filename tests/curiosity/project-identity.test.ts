import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const forbiddenIdentifier = String.fromCharCode(111, 112, 101, 110, 109, 97, 105, 99);

function trackedTextFiles(): string[] {
  const listedFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );
  return listedFiles
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.endsWith('.png'));
}

describe('project identity', () => {
  it('ships a first-party Curiosity app icon', () => {
    expect(existsSync(resolve(repositoryRoot, 'app/icon.svg'))).toBe(true);
  });

  it('does not retain the predecessor product identifier in tracked text files', () => {
    const matches = trackedTextFiles().flatMap((file) => {
      const absolutePath = resolve(repositoryRoot, file);
      if (!existsSync(absolutePath)) return [];
      const content = readFileSync(absolutePath, 'utf8');
      return new RegExp(forbiddenIdentifier, 'i').test(content)
        ? [relative(repositoryRoot, absolutePath)]
        : [];
    });

    expect(matches).toEqual([]);
  });
});
