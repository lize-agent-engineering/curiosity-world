interface GuidanceRetryOptions {
  attempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number) => void;
}

function isRetryableGuidanceFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /GUIDANCE_MODEL_INVALID|MODEL_UNAVAILABLE|fetch failed|network|timeout|\b5\d\d\b/i.test(
    message,
  );
}

export async function runGuidanceWithRetry<T>(
  operation: () => Promise<T>,
  options: GuidanceRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 400;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (cause) {
      if (attempt >= attempts || !isRetryableGuidanceFailure(cause)) throw cause;
      options.onRetry?.(attempt + 1);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw new Error('GUIDANCE_RETRY_EXHAUSTED');
}
