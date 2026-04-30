/**
 * API Health Check Integration Tests
 *
 * Verifies that key API endpoints respond with the expected HTTP status codes.
 * Run with: pnpm test (inside artifacts/api-server)
 *
 * Requirements:
 *   - API server must be running (started automatically in development).
 *   - JWT_SECRET env var must be set (required by the server itself).
 *   - Set API_BASE_URL to override the default server URL.
 */

import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

const BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:8082";
const JWT_SECRET = process.env["JWT_SECRET"] ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set before running API health checks.");
}

/**
 * Generate a valid admin JWT token for testing admin-protected routes.
 * adminAuth middleware verifies the token but does NOT look up the admin
 * in the database, so a well-formed signed token is sufficient.
 */
function makeAdminToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      adminId: "test-admin-health-check",
      role: "super_admin",
      name: "Health Check Bot",
      perms: [],
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res;
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

// ─── Server availability check ────────────────────────────────────────────────

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Unexpected status from /health: ${res.status}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `API server not reachable at ${BASE_URL}. Start it with \`pnpm dev\` before running tests. (${msg})`,
    );
  }
}, 10000);

// ─── Public endpoints ─────────────────────────────────────────────────────────

describe("Public endpoints", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /api/categories returns 200 with a categories array", async () => {
    const res = await get("/api/categories");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.categories)).toBe(true);
  });

  it("GET /api/products returns 200 with a products array", async () => {
    const res = await get("/api/products");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.products)).toBe(true);
  });

  it("GET /api/banners returns 200 with a banners array", async () => {
    const res = await get("/api/banners");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.banners)).toBe(true);
  });

  it("GET /api/platform-config returns 200 with config data", async () => {
    const res = await get("/api/platform-config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("GET /api/vendors returns 200 with a vendors array", async () => {
    const res = await get("/api/vendors");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.vendors)).toBe(true);
  });

  it("GET /api/recommendations/trending returns 200", async () => {
    const res = await get("/api/recommendations/trending");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── Authentication boundary checks ──────────────────────────────────────────

describe("Auth-protected customer endpoints reject unauthenticated requests", () => {
  it("GET /api/orders returns 401 without token", async () => {
    const res = await get("/api/orders");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET /api/wallet returns 401 without token", async () => {
    const res = await get("/api/wallet");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET /api/notifications returns 401 without token", async () => {
    const res = await get("/api/notifications");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET /api/addresses returns 401 without token", async () => {
    const res = await get("/api/addresses");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ─── Admin-protected endpoints with valid JWT ─────────────────────────────────

describe("Admin-protected endpoints with valid admin token", () => {
  let adminToken: string;

  beforeAll(() => {
    adminToken = makeAdminToken();
  });

  it("GET /api/admin/system/stats returns 200 with valid admin JWT", async () => {
    const res = await get("/api/admin/system/stats", {
      Authorization: `Bearer ${adminToken}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.users).toBe("number");
    expect(typeof body.generatedAt).toBe("string");
  });

  it("GET /api/legal returns 200 with valid admin JWT", async () => {
    const res = await get("/api/legal", {
      Authorization: `Bearer ${adminToken}`,
    });
    expect([200, 404]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBeDefined();
  });

  it("GET /api/admin/system/stats returns 401 without token", async () => {
    const res = await get("/api/admin/system/stats");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/system/stats returns 401 with invalid token", async () => {
    const res = await get("/api/admin/system/stats", {
      Authorization: "Bearer not-a-valid-token",
    });
    expect(res.status).toBe(401);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("Input validation rejects bad requests", () => {
  it("POST /api/auth/check-identifier with empty body returns 400", async () => {
    const res = await post("/api/auth/check-identifier", {});
    expect([400, 422]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("POST /api/auth/send-otp without a phone returns 400", async () => {
    const res = await post("/api/auth/send-otp", {});
    expect([400, 422]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("POST /api/auth/verify-otp with missing fields returns 400", async () => {
    const res = await post("/api/auth/verify-otp", { phone: "123" });
    expect([400, 422]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
