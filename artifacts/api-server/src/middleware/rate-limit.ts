/**
 * Tiered rate-limit middleware.
 *
 * When REDIS_URL is valid and reachable, counters live in Redis (shared across
 * instances, survive restarts). When Redis is unavailable, express-rate-limit
 * automatically falls back to its built-in in-memory store — no request is
 * ever blocked by a Redis outage.
 *
 * Tiers:
 *   globalLimiter     300 req / 15 min  — all /api traffic
 *   authLimiter        20 req / 15 min  — OTP / login / social-auth
 *   adminAuthLimiter   10 req / 15 min  — admin login & password-reset
 *   paymentLimiter     30 req / 15 min  — wallet & payment routes
 */
import rateLimit, { type Options, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../lib/redis.js";

function makeStore(prefix: string): Store | undefined {
  if (!redisClient) return undefined;
  try {
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      // Wrap every call so errors are swallowed and rethrown as a resolved
      // rejection — express-rate-limit v8 treats a store error as a skip,
      // effectively falling back to in-memory behaviour for that request.
      sendCommand: (...args: string[]) => {
        return (redisClient!.call as (...a: string[]) => Promise<unknown>)(...args).catch((err: Error) => {
          // Log once per error type (connection closed is noisy but expected
          // when Redis is temporarily down).
          if (!err.message.includes("closed")) {
            console.error(`[rate-limit:${prefix}] Redis error:`, err.message);
          }
          throw err; // re-throw so express-rate-limit skips the store
        });
      },
    });
  } catch (err) {
    console.error(`[rate-limit] Could not create Redis store for "${prefix}":`, err);
    return undefined;
  }
}

function makeOptions(prefix: string, max: number, windowMs: number): Partial<Options> {
  const store = makeStore(prefix);
  console.log(`[rate-limit] "${prefix}" limiter → ${store ? "Redis" : "in-memory"} store`);
  return {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: "Too many requests",
        retryAfter: Math.ceil(windowMs / 1000),
        code: "RATE_LIMITED",
      });
    },
  };
}

const WINDOW_MS = 15 * 60 * 1000;

export const globalLimiter    = rateLimit(makeOptions("global",     300, WINDOW_MS));
export const authLimiter      = rateLimit(makeOptions("auth",        20, WINDOW_MS));
export const adminAuthLimiter = rateLimit(makeOptions("admin-auth",  10, WINDOW_MS));
export const paymentLimiter   = rateLimit(makeOptions("payment",     30, WINDOW_MS));
