import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TARGET_AGE,
  MAX_TARGET_AGE,
  MIN_TARGET_AGE,
  isSupportedTargetAge,
  serverTargetAge,
} from '@/lib/studio/target-age';

describe('the remembered child age', () => {
  it('accepts the ages the product supports', () => {
    expect(isSupportedTargetAge(MIN_TARGET_AGE)).toBe(true);
    expect(isSupportedTargetAge(MAX_TARGET_AGE)).toBe(true);
    expect(isSupportedTargetAge(8)).toBe(true);
  });

  it('rejects anything outside that range or not a whole year', () => {
    expect(isSupportedTargetAge(3)).toBe(false);
    expect(isSupportedTargetAge(13)).toBe(false);
    expect(isSupportedTargetAge(7.5)).toBe(false);
    expect(isSupportedTargetAge('8')).toBe(false);
    expect(isSupportedTargetAge(null)).toBe(false);
  });

  it('gives the server a stable snapshot so hydration matches', () => {
    expect(serverTargetAge()).toBe(DEFAULT_TARGET_AGE);
  });
});
