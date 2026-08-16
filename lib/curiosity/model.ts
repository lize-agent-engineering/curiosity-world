import type { z } from 'zod';

export interface CuriosityTextModel {
  complete(input: { system?: string; prompt: string; schema?: z.ZodType }): Promise<string>;
}
