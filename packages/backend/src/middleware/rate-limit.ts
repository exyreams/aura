import { ApiError } from "../errors.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  check(key: string, now = Date.now()) {
    const current = this.store.get(key);
    if (!current || current.resetAt <= now) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      this.prune(now);
      return;
    }

    if (current.count >= this.maxRequests) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please retry later.",
        {
          retryAfterMs: current.resetAt - now,
        },
      );
    }

    current.count += 1;
  }

  private prune(now: number) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
