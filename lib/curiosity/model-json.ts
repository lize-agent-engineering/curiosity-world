import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

export function parseCuriosityModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonrepair(raw));
  } catch (cause) {
    throw new SyntaxError('MODEL_OUTPUT_INVALID_JSON', { cause });
  }
  return schema.parse(parsed);
}
