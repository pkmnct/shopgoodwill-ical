export interface FeedCacheOptions {
  /** How long a built feed is reused. 0 builds one for every request. */
  cacheSeconds: number;
  /** How long a failure is remembered before the next attempt, by error. */
  failureSeconds: (error: unknown) => number;
  /** Called once for each build that really failed, not for remembered failures. */
  onFailure?: (error: unknown) => void;
  now?: () => number;
}

/**
 * Wraps a feed build (a login check plus a favorites request to ShopGoodwill)
 * so calendar clients polling the feed cannot hammer the account:
 * - concurrent requests share one build;
 * - a built feed is reused for `cacheSeconds`;
 * - a failure is remembered too, so a wrong password or an outage does not
 *   turn every poll into a new login attempt.
 */
export function createFeedCache(
  build: () => Promise<string>,
  options: FeedCacheOptions
): () => Promise<string> {
  const now = options.now ?? Date.now;
  let cached: { body: string; expires: number } | undefined;
  let failed: { error: unknown; expires: number } | undefined;
  let pending: Promise<string> | undefined;

  return async () => {
    if (cached && cached.expires > now()) {
      return cached.body;
    }
    if (failed && failed.expires > now()) {
      throw failed.error;
    }
    pending ??= build()
      .then(
        (body) => {
          cached = { body, expires: now() + options.cacheSeconds * 1000 };
          failed = undefined;
          return body;
        },
        (error: unknown) => {
          failed = {
            error,
            expires: now() + options.failureSeconds(error) * 1000,
          };
          options.onFailure?.(error);
          throw error;
        }
      )
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
