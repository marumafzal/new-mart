/**
 * Shared ioredis client for rate limiting.
 *
 * Handles common copy-paste artifacts in REDIS_URL:
 *  - URL-encoded prefixes  ("%20--tls%20-u%20...")
 *  - Literal shell flags   ("--tls -u redis://...")
 *  - Non-TLS scheme        ("redis://" → "rediss://") for Upstash
 *
 * Uses enableOfflineQueue:true so RedisStore's startup SCRIPT LOAD
 * commands queue safely during the initial TLS handshake.
 *
 * Exports:
 *   redisClient  — ioredis instance, or null when REDIS_URL is absent/invalid
 */
import Redis from "ioredis";

function sanitizeRedisUrl(raw: string): string {
  // 1. Percent-decode any URL-encoded characters (handles %20 etc.)
  let url = decodeURIComponent(raw).trim();
  // 2. Strip "redis-cli" command name if the full CLI invocation was stored
  url = url.replace(/^redis-cli\s+/i, "").trim();
  // 3. Strip shell flag prefixes ("--tls -u", "--tls", "-u")
  url = url.replace(/^(?:--tls\s+-u\s+|--tls\s+|-u\s+)/i, "").trim();
  // 4. Upstash requires TLS — promote redis:// to rediss://
  if (url.startsWith("redis://")) {
    url = "rediss://" + url.slice("redis://".length);
  }
  return url;
}

let redisClient: Redis | null = null;

const rawUrl = process.env["REDIS_URL"];

if (rawUrl) {
  const url = sanitizeRedisUrl(rawUrl);

  // Validate the URL has a real hostname before handing it to ioredis
  let valid = false;
  try {
    const parsed = new URL(url);
    valid = parsed.hostname.length > 0;
  } catch {
    console.error("[redis] REDIS_URL is not a valid URL after sanitization — falling back to in-memory store");
  }

  if (valid) {
    try {
      redisClient = new Redis(url, {
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
        connectTimeout: 8000,
        retryStrategy: (times) => {
          if (times >= 4) {
            console.error("[redis] Max reconnect attempts reached — rate limits will use in-memory store");
            return null; // stop retrying; RedisStore will throw and express-rate-limit falls back
          }
          return Math.min(times * 500, 3000);
        },
      });

      redisClient.on("connect", () => console.log("[redis] Connected to Redis"));
      redisClient.on("ready",   () => console.log("[redis] Ready"));
      redisClient.on("error",   (err: Error) => console.error("[redis] Error:", err.message));
      redisClient.on("close",   () => console.warn("[redis] Connection closed"));
    } catch (err) {
      console.error("[redis] Failed to initialise client:", (err as Error).message);
      redisClient = null;
    }
  }
} else {
  console.warn("[redis] REDIS_URL not set — rate-limit counters will use in-memory store");
}

export { redisClient };
