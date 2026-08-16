import { FileCuriosityJobStore, type CuriosityJobStore } from './jobs';
import { FileCuriosityExperienceStore } from './experience-store';

export const curiosityJobStore = new FileCuriosityJobStore();
export const curiosityExperienceStore = new FileCuriosityExperienceStore();
let recovery: Promise<void> | undefined;

export function ensureCuriosityJobStoreRecovered(): Promise<void> {
  recovery ??= recoverInterruptedCuriosityJobs(curiosityJobStore);
  return recovery;
}

export async function recoverInterruptedCuriosityJobs(store: CuriosityJobStore): Promise<void> {
  const interrupted = (await store.list()).filter(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  await Promise.all(
    interrupted.map((job) =>
      store.update(job.id, {
        status: 'failed',
        step: 'failed',
        progress: 100,
        message: '服务重启后已保留中间产物，需重新发起生成。',
        errorCode: 'SERVER_RESTARTED',
        error: '生成进程在服务重启时中断。',
      }),
    ),
  );
}
