import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StudioSnapshot, StudioVersion } from '@/lib/studio/contracts';
import {
  appendStudioMessage,
  appendStudioVersion,
  attachStudioRuntimeErrors,
  createStudioSnapshot,
  FileStudioStore,
  MemoryStudioStore,
  rollbackStudioProject,
  StudioStoreConflictError,
  studioVersionLineage,
  withStudioProject,
  type StudioStore,
} from '@/lib/studio/store';

const at = '2026-08-18T10:00:00.000Z';

const version = (overrides: Partial<StudioVersion> = {}): StudioVersion => ({
  id: 'ver_one',
  projectId: 'prj_one',
  parentVersionId: null,
  revision: 1,
  html: '<!doctype html><html><body>1</body></html>',
  summary: '第一版',
  appKind: 'tool',
  editMode: 'create',
  jobId: 'job_one',
  runtimeErrors: [],
  createdAt: at,
  ...overrides,
});

function seeded(): StudioSnapshot {
  return createStudioSnapshot({
    projectId: 'prj_one',
    title: '番茄钟',
    createdAt: at,
    firstMessage: { id: 'msg_one', text: '做个番茄钟', createdAt: at },
  });
}

describe('snapshot helpers', () => {
  it('creates a project that has a message but no version yet', () => {
    const snapshot = seeded();
    expect(snapshot.project.currentVersionId).toBeNull();
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.project.storeVersion).toBe(1);
  });

  it('appending a version makes it current', () => {
    const snapshot = appendStudioVersion(seeded(), version());
    expect(snapshot.project.currentVersionId).toBe('ver_one');
    expect(snapshot.versions).toHaveLength(1);
  });

  it('derives the revision from the parent so a branch does not renumber the trunk', () => {
    let snapshot = appendStudioVersion(seeded(), version());
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_two', parentVersionId: 'ver_one', revision: 0 }),
    );
    expect(snapshot.versions.find((entry) => entry.id === 'ver_two')!.revision).toBe(2);
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_three', parentVersionId: 'ver_one', revision: 0 }),
    );
    expect(snapshot.versions.find((entry) => entry.id === 'ver_three')!.revision).toBe(2);
    expect(snapshot.versions.find((entry) => entry.id === 'ver_two')!.revision).toBe(2);
  });

  it('never overwrites history when a new branch grows from an old version', () => {
    let snapshot = appendStudioVersion(seeded(), version());
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_two', parentVersionId: 'ver_one' }),
    );
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_three', parentVersionId: 'ver_one', html: '<html><body>3</body></html>' }),
    );
    expect(snapshot.versions.map((entry) => entry.id)).toEqual(['ver_one', 'ver_two', 'ver_three']);
    expect(snapshot.versions[1]!.html).toBe(version().html);
  });

  it('rolling back only moves the pointer', () => {
    let snapshot = appendStudioVersion(seeded(), version());
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_two', parentVersionId: 'ver_one' }),
    );
    const rolled = rollbackStudioProject(snapshot, 'ver_one');
    expect(rolled.project.currentVersionId).toBe('ver_one');
    expect(rolled.versions).toHaveLength(2);
  });

  it('refuses to roll back to a version that does not exist', () => {
    expect(() =>
      rollbackStudioProject(appendStudioVersion(seeded(), version()), 'ver_nope'),
    ).toThrow();
  });

  it('walks the lineage of a version back to the root', () => {
    let snapshot = appendStudioVersion(seeded(), version());
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_two', parentVersionId: 'ver_one' }),
    );
    snapshot = appendStudioVersion(
      snapshot,
      version({ id: 'ver_three', parentVersionId: 'ver_two' }),
    );
    expect(studioVersionLineage(snapshot, 'ver_three').map((entry) => entry.id)).toEqual([
      'ver_one',
      'ver_two',
      'ver_three',
    ]);
  });

  it('attaches runtime errors to the version that produced them and dedupes repeats', () => {
    const snapshot = appendStudioVersion(seeded(), version());
    const once = attachStudioRuntimeErrors(snapshot, 'ver_one', [
      { errorKind: 'error', message: 'x is not defined', occurredAt: at },
    ]);
    const twice = attachStudioRuntimeErrors(once, 'ver_one', [
      { errorKind: 'error', message: 'x is not defined', occurredAt: '2026-08-18T10:05:00.000Z' },
      { errorKind: 'console.error', message: 'boom', occurredAt: at },
    ]);
    expect(twice.versions[0]!.runtimeErrors).toHaveLength(2);
  });

  it('caps stored runtime errors so one broken page cannot grow the file forever', () => {
    let snapshot = appendStudioVersion(seeded(), version());
    for (let index = 0; index < 40; index += 1) {
      snapshot = attachStudioRuntimeErrors(snapshot, 'ver_one', [
        { errorKind: 'error', message: `error ${index}`, occurredAt: at },
      ]);
    }
    expect(snapshot.versions[0]!.runtimeErrors).toHaveLength(20);
  });

  it('appends conversation messages in order', () => {
    const snapshot = appendStudioMessage(seeded(), {
      id: 'msg_two',
      projectId: 'prj_one',
      role: 'agent',
      text: '做好了',
      createdAt: at,
    });
    expect(snapshot.messages.map((message) => message.role)).toEqual(['user', 'agent']);
  });
});

function storeContract(name: string, makeStore: () => Promise<StudioStore> | StudioStore) {
  describe(name, () => {
    let store: StudioStore;
    beforeEach(async () => {
      store = await makeStore();
    });

    it('round-trips a project', async () => {
      await store.create(seeded());
      const read = await store.read('prj_one');
      expect(read!.project.title).toBe('番茄钟');
    });

    it('returns null for an unknown project', async () => {
      expect(await store.read('prj_missing')).toBeNull();
    });

    it('refuses to create the same project twice', async () => {
      await store.create(seeded());
      await expect(store.create(seeded())).rejects.toThrow();
    });

    it('bumps the store version and updatedAt on every write', async () => {
      const created = await store.create(seeded());
      const written = await store.write(
        appendStudioVersion(created, version()),
        created.project.storeVersion,
      );
      expect(written.project.storeVersion).toBe(2);
      expect(Date.parse(written.project.updatedAt)).toBeGreaterThanOrEqual(Date.parse(at));
    });

    it('rejects a write built on a stale read', async () => {
      const created = await store.create(seeded());
      await store.write(appendStudioVersion(created, version()), created.project.storeVersion);
      await expect(
        store.write(
          appendStudioVersion(created, version({ id: 'ver_two' })),
          created.project.storeVersion,
        ),
      ).rejects.toBeInstanceOf(StudioStoreConflictError);
    });

    it('lists projects newest first', async () => {
      await store.create(seeded());
      await store.create(
        createStudioSnapshot({
          projectId: 'prj_two',
          title: '贪吃蛇',
          createdAt: '2026-08-18T11:00:00.000Z',
          firstMessage: { id: 'msg_two', text: '做个游戏', createdAt: '2026-08-18T11:00:00.000Z' },
        }),
      );
      expect((await store.list()).map((project) => project.id)).toEqual(['prj_two', 'prj_one']);
    });

    it('retries a conflicting read-modify-write instead of losing the change', async () => {
      const created = await store.create(seeded());
      let attempts = 0;
      const result = await withStudioProject(store, 'prj_one', async (snapshot) => {
        attempts += 1;
        if (attempts === 1) {
          // Someone else commits between our read and our write.
          await store.write(
            appendStudioMessage(snapshot, {
              id: 'msg_other',
              projectId: 'prj_one',
              role: 'agent',
              text: '别人先写了',
              createdAt: at,
            }),
            created.project.storeVersion,
          );
        }
        return appendStudioVersion(snapshot, version());
      });
      expect(attempts).toBe(2);
      expect(result.versions).toHaveLength(1);
      expect(result.messages.map((message) => message.id)).toContain('msg_other');
    });

    it('reports a missing project to the mutation helper', async () => {
      await expect(
        withStudioProject(store, 'prj_missing', async (snapshot) => snapshot),
      ).rejects.toThrow();
    });
  });
}

storeContract('MemoryStudioStore', () => new MemoryStudioStore());

describe('FileStudioStore', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'studio-store-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  storeContract('contract', () => new FileStudioStore(directory));

  it('rejects a project id that could escape the data directory', async () => {
    const store = new FileStudioStore(directory);
    await expect(store.read('../../etc/passwd')).rejects.toThrow();
  });

  it('survives a concurrent write from another process holding the lock', async () => {
    const store = new FileStudioStore(directory);
    const created = await store.create(seeded());
    const results = await Promise.allSettled([
      store.write(appendStudioVersion(created, version()), created.project.storeVersion),
      store.write(
        appendStudioVersion(created, version({ id: 'ver_two' })),
        created.project.storeVersion,
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await store.read('prj_one'))!.versions).toHaveLength(1);
  });
});
