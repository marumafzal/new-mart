import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { runSqlMigrations } from "./services/sqlMigrationRunner.js";
import {
  seedPermissionCatalog,
  seedDefaultRoles,
  backfillAdminRoleAssignments,
} from "./services/permissions.service.js";
import {
  seedDefaultSuperAdmin,
  reconcileSeededSuperAdmin,
} from "./services/admin-seed.service.js";
import { purgeStaleAdminPasswordResetTokens } from "./services/admin-password.service.js";
import { detectAndNotifyOutOfBandPasswordResets } from "./services/admin-password-watch.service.js";
import router from "./routes/index.js";

/**
 * Run DB migrations + RBAC seed/backfill before the server begins
 * accepting traffic. SQL migration failure is fatal — we throw so the
 * boot script in `index.ts` exits non-zero rather than silently serving
 * authorization decisions against a half-migrated schema.
 *
 * The RBAC seed is best-effort: a transient seed failure should not
 * block the platform from coming up, but it is logged loudly.
 */
export async function runStartupTasks(): Promise<void> {
  await runSqlMigrations();
  try {
    await seedPermissionCatalog();
    await seedDefaultRoles();
    await backfillAdminRoleAssignments();
    console.log("[startup] RBAC seed + backfill complete");
  } catch (err) {
    console.error("[startup] RBAC seed/backfill failed (continuing):", err);
  }
  // Seed the default super-admin AFTER RBAC so the super_admin role exists
  // and can be granted to the new account on first boot.
  try {
    await seedDefaultSuperAdmin();
  } catch (err) {
    console.error("[startup] admin seed failed (continuing):", err);
  }
  // Reconcile any legacy seeded super-admin row (created by the old
  // forced-password-change flow) to the documented default credentials.
  // Idempotent: only touches a single row matched by ADMIN_SEED_USERNAME
  // when it still carries the legacy `must_change_password = true` flag.
  try {
    await reconcileSeededSuperAdmin();
  } catch (err) {
    console.error("[startup] admin seed reconciliation failed (continuing):", err);
  }
  // Best-effort GC of stale password reset tokens (idempotent, safe to skip).
  try {
    const purged = await purgeStaleAdminPasswordResetTokens();
    if (purged > 0) {
      console.log(`[startup] purged ${purged} expired admin password reset token(s)`);
    }
  } catch (err) {
    console.error("[startup] reset-token purge failed (continuing):", err);
  }
  // Out-of-band admin password reset detection. Compares the current
  // `admin_accounts.secret` against per-admin snapshots maintained by
  // the in-app password flows; mismatches mean somebody (typically an
  // operator) rewrote the hash directly in the database. Best-effort —
  // never blocks boot.
  try {
    await detectAndNotifyOutOfBandPasswordResets();
  } catch (err) {
    console.error(
      "[startup] admin password watchdog failed (continuing):",
      err,
    );
  }
}

export function createServer() {
  const app = express();
  
  // Trust proxy (for proper IP detection behind reverse proxy/load balancer)
  app.set('trust proxy', 1);

  /* ── Dev-only: proxy sibling apps so the api-server preview can render
        admin / vendor / rider / customer (Expo) at their respective paths.
        Registered BEFORE helmet so the proxied responses carry the
        upstream Vite headers untouched. ─────────────────────────────────── */
  if (process.env.NODE_ENV !== "production") {
    const devProxies: Array<{ prefix: string; target: string; ws?: boolean; rewriteToRoot?: boolean }> = [
      { prefix: "/admin",    target: `http://127.0.0.1:${process.env.ADMIN_DEV_PORT  ?? "23744"}`, ws: true },
      { prefix: "/vendor",   target: `http://127.0.0.1:${process.env.VENDOR_DEV_PORT ?? "21463"}`, ws: true },
      { prefix: "/rider",    target: `http://127.0.0.1:${process.env.RIDER_DEV_PORT  ?? "22969"}`, ws: true },
      { prefix: "/__mockup", target: `http://127.0.0.1:${process.env.MOCKUP_DEV_PORT ?? "8081"}`,  ws: true },
      // Expo customer app serves at "/", so /customer/* → strip prefix.
      // Absolute asset URLs Expo embeds (e.g. /_expo/static/...) are caught
      // by the Expo fallback proxy registered at the bottom of this file.
      { prefix: "/customer", target: `http://127.0.0.1:${process.env.EXPO_DEV_PORT   ?? "20716"}`, ws: true, rewriteToRoot: true },
    ];
    for (const p of devProxies) {
      // Mount at root with a path filter so the original `/admin/...` URL is
      // forwarded as-is (Express's app.use(prefix) strips the prefix from
      // req.url, which then collides with Vite's `base` and causes a redirect
      // loop). Filter ensures we only intercept the prefix paths.
      app.use(
        createProxyMiddleware({
          target: p.target,
          changeOrigin: true,
          ws: p.ws,
          xfwd: true,
          logger: undefined,
          pathFilter: (pathname) =>
            pathname === p.prefix ||
            pathname.startsWith(p.prefix + "/") ||
            pathname.startsWith(p.prefix + "?"),
          ...(p.rewriteToRoot
            ? {
                pathRewrite: (path: string) => {
                  const stripped = path.slice(p.prefix.length);
                  return stripped === "" ? "/" : stripped;
                },
              }
            : {}),
          on: {
            error: (err, _req, res) => {
              if (res && "writeHead" in res && !(res as any).headersSent) {
                (res as any).writeHead(502, { "Content-Type": "text/plain" });
                (res as any).end(
                  `Dev proxy error for ${p.prefix} → ${p.target}\n${(err as Error).message}\n` +
                  `Make sure the corresponding workflow is running.`
                );
              }
            },
          },
        }) as unknown as express.RequestHandler,
      );
    }
    console.log("[dev] Sibling app proxies enabled at /admin /vendor /rider /customer /__mockup");
  }

  // Security headers via helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  }));
  
  // CORS with credentials support
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // In development or on Replit, allow all origins
      if (process.env.NODE_ENV !== 'production' || process.env.REPLIT_DEV_DOMAIN) {
        return callback(null, true);
      }
      // In production, restrict to configured origins
      const allowed = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '').split(',').filter(Boolean);
      if (allowed.length === 0 || allowed.some(o => origin.startsWith(o))) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Report-Signature'],
  }));
  
  app.use(cookieParser());
  /* Capture raw body bytes on every JSON request so endpoints that rely on
     request signing (e.g. /api/error-reports HMAC-SHA256 verification) can
     hash the exact bytes the client signed, regardless of JSON formatting
     differences. The buffer is small (capped at 256kb) and only retained for
     the lifetime of the request. */
  app.use(express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));
  
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /* ── Dev-only: hub landing page at exact "/" with one-click cards for
        every sibling app. Registered AFTER the prefix proxies so links to
        /admin/, /vendor/, /rider/, /customer/ still hit the right targets. */
  if (process.env.NODE_ENV !== "production") {
    app.get("/", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderHubPage());
    });
  }

  app.use("/api", router);

  /* ── JSON 404 for unmatched /api/* routes ─────────────────────────────── */
  app.use("/api/*path", (req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  /* ── Dev-only fallback: proxy any remaining non-/api request to the
        Expo (customer / ajkmart) dev server, which serves the customer app
        at the root path. Only kicks in in development, AFTER the
        /admin /vendor /rider /__mockup proxies and the /api router. ─────── */
  if (process.env.NODE_ENV !== "production") {
    const expoTarget = `http://127.0.0.1:${process.env.EXPO_DEV_PORT ?? "20716"}`;
    const expoProxy = createProxyMiddleware({
      target: expoTarget,
      changeOrigin: true,
      ws: true,
      xfwd: true,
      logger: undefined,
      pathFilter: (pathname) =>
        pathname !== "/health" &&
        !pathname.startsWith("/api") &&
        !pathname.startsWith("/admin") &&
        !pathname.startsWith("/vendor") &&
        !pathname.startsWith("/rider") &&
        !pathname.startsWith("/customer") &&
        !pathname.startsWith("/__mockup"),
      on: {
        error: (err, _req, res) => {
          if (res && "writeHead" in res && !(res as any).headersSent) {
            (res as any).writeHead(502, { "Content-Type": "text/plain" });
            (res as any).end(
              `Dev proxy error → ${expoTarget}\n${(err as Error).message}\n` +
              `Make sure the artifacts/ajkmart: expo workflow is running.`
            );
          }
        },
      },
    }) as unknown as express.RequestHandler;
    app.use(expoProxy);
  }

  /* ── Global error handler ──────────────────────────────────────────────── */
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  });
  
  return app;
}

/**
 * Dev-only landing page rendered at `GET /` on the API server. Lists every
 * sibling app as a clickable card so the user can jump between them from a
 * single Replit preview window without typing URLs.
 */
function renderHubPage(): string {
  const apps = [
    { href: "/admin/",    label: "Admin Panel",   sub: "Platform administration",       icon: "🛠️", color: "#6366f1" },
    { href: "/vendor/",   label: "Vendor App",    sub: "Vendors & store management",    icon: "🏪", color: "#10b981" },
    { href: "/rider/",    label: "Rider App",     sub: "Delivery rider operations",     icon: "🛵", color: "#f59e0b" },
    { href: "/customer/", label: "Customer App",  sub: "AJKMart Expo customer client",  icon: "🛍️", color: "#ec4899" },
  ];
  const cards = apps.map(a => `
    <a class="card" href="${a.href}" style="--accent:${a.color}">
      <div class="icon" aria-hidden="true">${a.icon}</div>
      <div class="text">
        <div class="label">${a.label}</div>
        <div class="sub">${a.sub}</div>
      </div>
      <div class="arrow" aria-hidden="true">→</div>
    </a>
  `).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AJKMart — App Hub</title>
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: radial-gradient(1200px 600px at 80% -10%, #312e81 0%, transparent 60%),
                  radial-gradient(900px 500px at -10% 110%, #0f766e 0%, transparent 55%),
                  #0b1020;
      color: #e5e7eb;
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
    }
    .container { width: 100%; max-width: 880px; }
    header { margin-bottom: 28px; text-align: center; }
    h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.02em; }
    p.lead { color: #9ca3af; margin: 0; font-size: 14px; }
    .grid { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
    .card {
      display: flex; align-items: center; gap: 16px;
      padding: 18px 20px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-left: 4px solid var(--accent, #6366f1);
      border-radius: 14px;
      text-decoration: none; color: inherit;
      transition: transform .12s ease, background .12s ease, border-color .12s ease;
    }
    .card:hover {
      background: rgba(255,255,255,0.07);
      border-color: rgba(255,255,255,0.18);
      transform: translateY(-1px);
    }
    .card:active { transform: translateY(0); }
    .icon {
      width: 44px; height: 44px; flex: 0 0 44px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      display: grid; place-items: center;
      font-size: 22px;
    }
    .text { flex: 1; min-width: 0; }
    .label { font-weight: 600; font-size: 16px; line-height: 1.2; }
    .sub { color: #9ca3af; font-size: 12.5px; margin-top: 2px; }
    .arrow { color: #9ca3af; font-size: 18px; }
    footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 22px; }
    footer code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; color: #d1d5db; }
    .status { display:inline-flex; align-items:center; gap:6px; }
    .dot { width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AJKMart — App Hub</h1>
      <p class="lead"><span class="status"><span class="dot"></span>API Server is running</span> · pick an app to open</p>
    </header>
    <div class="grid">
      ${cards}
    </div>
    <footer>
      Backend health: <code>/health</code> · API: <code>/api/*</code>
    </footer>
  </div>
</body>
</html>`;
}
