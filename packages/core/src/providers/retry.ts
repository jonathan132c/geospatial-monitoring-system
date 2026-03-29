import type { LoggerLike } from '../types/domain';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(
  operationName: string,
  action: () => Promise<T>,
  logger: LoggerLike,
  retries = 3,
  initialBackoffMs = 200
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const backoff = initialBackoffMs * 2 ** attempt;
      logger.warn({ operationName, attempt: attempt + 1, backoff, error: error instanceof Error ? error.message : String(error) }, 'Provider call failed; retrying');
      await sleep(backoff);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Operation ${operationName} failed after retries`);
};
