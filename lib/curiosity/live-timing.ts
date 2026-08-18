export const CURIOSITY_GENERATION_POLL_INTERVAL_MS = 500;
export const CURIOSITY_GENERATION_TIMEOUT_MS = 360_000;

/**
 * Client-side ceiling for one controlled revision.
 *
 * The revision route runs three sequential model calls, each bounded by
 * CURIOSITY_MODEL_TIMEOUT_MS on the server. Its `maxDuration` export only binds
 * on Vercel, so a self-hosted deployment has nothing else stopping a stuck
 * request — without this budget the browser would wait forever.
 */
export const CURIOSITY_REVISION_BUDGET_MS = 600_000;

export function curiosityGenerationPollLimit(): number {
  return Math.ceil(CURIOSITY_GENERATION_TIMEOUT_MS / CURIOSITY_GENERATION_POLL_INTERVAL_MS);
}
