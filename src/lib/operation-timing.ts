import { logSafeError, logStructured } from './safe-error';

export interface OperationTimingOptions {
  slowMs?: number;
  context?: () => Record<string, number | string | boolean | undefined>;
}

const DEFAULT_SLOW_MS = 5_000;

function safeContext(context?: OperationTimingOptions['context']): Record<string, number | string | boolean> {
  try {
    const values = context?.() ?? {};
    return Object.fromEntries(
      Object.entries(values).filter((entry): entry is [string, number | string | boolean] =>
        entry[1] !== undefined,
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Emits one sanitized warning only when an awaited boundary exceeds its
 * diagnostic threshold, and one sanitized error if that boundary rejects.
 * It deliberately does not race or cancel the operation: callers that own a
 * network or database resource must retain responsibility for its lifecycle.
 */
export async function observeOperation<T>(
  stage: string,
  operation: () => Promise<T>,
  options: OperationTimingOptions = {},
): Promise<T> {
  const startedAt = performance.now();
  const slowMs = options.slowMs ?? DEFAULT_SLOW_MS;
  let settled = false;
  const elapsed = () => Math.round(performance.now() - startedAt);
  const timer = setTimeout(() => {
    if (settled) return;
    logStructured('warn', 'dependency', stage, 'slow', 'Operation exceeded diagnostic threshold', {
      durationMs: elapsed(),
      ...safeContext(options.context),
    });
  }, slowMs);

  try {
    return await operation();
  } catch (error) {
    logSafeError(stage, error, 'dependency', {
      durationMs: elapsed(),
      ...safeContext(options.context),
    });
    throw error;
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
