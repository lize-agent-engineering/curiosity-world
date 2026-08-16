import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseCuriosityModelJson } from '@/lib/curiosity/model-json';

describe('structured model JSON parsing', () => {
  it('repairs syntax-only JSON damage before strict schema validation', () => {
    const schema = z.strictObject({ answer: z.string() });
    expect(parseCuriosityModelJson('{"answer":"月亮",}', schema)).toEqual({ answer: '月亮' });
    expect(() =>
      parseCuriosityModelJson('{"answer":"月亮","html":"<b>bad</b>"}', schema),
    ).toThrow();
  });
});
