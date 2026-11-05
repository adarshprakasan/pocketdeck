/**
 * Small in-memory token-bucket rate limiter.
 * Shared by the Next.js API route, the optional WebSocket signaling server and the browser.
 * @param {{ capacity: number, refillPerSecond: number, maxKeys?: number, now?: () => number }} options
 */
export function createRateLimiter({ capacity, refillPerSecond, maxKeys = 1000, now = Date.now }) {
  /** @type {Map<string, { tokens: number, updated: number }>} */
  const buckets = new Map();
  return {
    /**
     * @param {string} key
     * @param {number} [cost]
     * @returns {boolean} true when the call is allowed
     */
    take(key, cost = 1) {
      const time = now();
      let bucket = buckets.get(key);
      if (bucket) buckets.delete(key); // re-insert below so the oldest key is always first
      else {
        if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value);
        bucket = { tokens: capacity, updated: time };
      }
      bucket.tokens = Math.min(capacity, bucket.tokens + ((time - bucket.updated) / 1000) * refillPerSecond);
      bucket.updated = time;
      const allowed = bucket.tokens >= cost;
      if (allowed) bucket.tokens -= cost;
      buckets.set(key, bucket);
      return allowed;
    },
  };
}
