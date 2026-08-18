/**
 * The child's age, remembered between visits.
 *
 * It barely changes, so asking for it every time is noise. It lives in
 * localStorage and is read through `useSyncExternalStore`, which hydrates with
 * the server's default and then re-renders with the stored value — the
 * sanctioned way to read browser state that the server cannot know.
 */

export const TARGET_AGE_KEY = 'curiosity-target-age';
export const DEFAULT_TARGET_AGE = 8;
export const MIN_TARGET_AGE = 4;
export const MAX_TARGET_AGE = 12;

const listeners = new Set<() => void>();

export function isSupportedTargetAge(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_TARGET_AGE &&
    value <= MAX_TARGET_AGE
  );
}

export function subscribeTargetAge(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function readTargetAge(): number {
  const stored = Number(window.localStorage.getItem(TARGET_AGE_KEY));
  return isSupportedTargetAge(stored) ? stored : DEFAULT_TARGET_AGE;
}

/** What the server renders, and what the client hydrates with. */
export function serverTargetAge(): number {
  return DEFAULT_TARGET_AGE;
}

export function writeTargetAge(age: number): void {
  if (!isSupportedTargetAge(age)) return;
  window.localStorage.setItem(TARGET_AGE_KEY, String(age));
  for (const listener of listeners) listener();
}
