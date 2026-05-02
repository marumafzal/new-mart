/**
 * Tiered rate-limit middleware definitions.
 *
 * All limiters are IP-based (in-memory store) and emit standard
 * RateLimit-* headers so clients can self-throttle.
 * The library's default keyGenerator is used — it handles IPv6 safely
 * and works correctly with `trust proxy: 1` set in app.ts (so Express's
 * req.ip already reflects the real client IP from x-forwarded-for).
 *
 * Tiers:
 *   globalLimiter     — broad cap on all /api traffic            300 req / 15 min
 *   authLimiter       — public OTP / login / social-auth routes   20 req / 15 min
 *   adminAuthLimiter  — admin login and password-reset routes      10 req / 15 min
 *   paymentLimiter    — wallet and payment routes                  30 req / 15 min
 */
import rateLimit, { type Options } from "express-rate-limit";

function makeOptions(max: number, windowMs: number): Partial<Options> {
  const retryAfterSec = Math.ceil(windowMs / 1000);
  return {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: "Too many requests",
        retryAfter: retryAfterSec,
        code: "RATE_LIMITED",
      });
    },
  };
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Applied to every /api route. */
export const globalLimiter = rateLimit(makeOptions(300, WINDOW_MS));

/** Applied to customer-facing auth routes (OTP, login, social sign-in). */
export const authLimiter = rateLimit(makeOptions(20, WINDOW_MS));

/** Applied to admin login and password-reset routes. */
export const adminAuthLimiter = rateLimit(makeOptions(10, WINDOW_MS));

/** Applied to wallet and payment routes to prevent financial abuse. */
export const paymentLimiter = rateLimit(makeOptions(30, WINDOW_MS));
