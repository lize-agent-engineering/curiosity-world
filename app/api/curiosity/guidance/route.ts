import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import type { CuriosityPipelineModel } from '@/lib/curiosity/agent-pipeline';
import { CuriosityModelUnavailableError } from '@/lib/curiosity/api-handlers';
import {
  CuriosityGuidanceError,
  curiosityGuidanceInputSchema,
  runCuriosityGuidanceTurn,
} from '@/lib/curiosity/guidance-service';
import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';

export function createCuriosityGuidancePostHandler(dependencies: {
  resolveModel: (request: NextRequest, body: unknown) => Promise<CuriosityPipelineModel>;
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const body = curiosityGuidanceInputSchema.parse(await request.json());
      const model = await dependencies.resolveModel(request, body);
      const response = await runCuriosityGuidanceTurn(body, model);
      return NextResponse.json({ success: true, response });
    } catch (error) {
      if (error instanceof CuriosityModelUnavailableError) {
        return NextResponse.json(
          { success: false, errorCode: error.code, error: error.message },
          { status: 503 },
        );
      }
      if (error instanceof CuriosityGuidanceError) {
        const status = error.code === 'MODEL_UNAVAILABLE' ? 503 : 422;
        return NextResponse.json(
          { success: false, errorCode: error.code, error: error.message },
          { status },
        );
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'INVALID_REQUEST',
            error: '引导请求不符合严格 Schema。',
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, errorCode: 'INTERNAL_ERROR', error: '探索引导服务发生内部错误。' },
        { status: 500 },
      );
    }
  };
}

const post = createCuriosityGuidancePostHandler({
  resolveModel: (request, body) =>
    resolveCuriosityRoleModel(request, body, 'curiosity.exploration-guide'),
});

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
