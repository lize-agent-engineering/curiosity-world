import { NextResponse, type NextRequest } from 'next/server';

import { buildSnapshotFromGenerationJobs } from '@/lib/curiosity/experience-store';
import { parseCuriosityExperienceSnapshot } from '@/lib/curiosity/repository';
import {
  curiosityExperienceStore,
  curiosityJobStore,
  ensureCuriosityJobStoreRecovered,
} from '@/lib/curiosity/server-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ experienceId: string }> },
) {
  const { experienceId } = await context.params;
  await ensureCuriosityJobStoreRecovered();
  let snapshot = await curiosityExperienceStore.read(experienceId);
  if (!snapshot) {
    snapshot = buildSnapshotFromGenerationJobs(experienceId, await curiosityJobStore.list());
    if (snapshot) await curiosityExperienceStore.write(snapshot);
  }
  if (!snapshot) {
    return NextResponse.json(
      { success: false, errorCode: 'EXPERIENCE_NOT_FOUND', error: '没有找到这次探索。' },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, snapshot });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ experienceId: string }> },
) {
  const { experienceId } = await context.params;
  try {
    const snapshot = parseCuriosityExperienceSnapshot(await request.json());
    if (snapshot.experience.id !== experienceId) {
      return NextResponse.json(
        { success: false, errorCode: 'EXPERIENCE_ID_MISMATCH', error: '体验标识不一致。' },
        { status: 409 },
      );
    }
    await curiosityExperienceStore.write(snapshot);
    return NextResponse.json({ success: true });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      {
        success: false,
        errorCode: 'EXPERIENCE_SNAPSHOT_INVALID',
        error: `体验快照无效：${detail}`,
      },
      { status: 400 },
    );
  }
}
