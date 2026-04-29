# AJKMart Super-App Monorepo

## Overview

AJKMart is a multi-service super-app platform serving the AJK (Azad Jammu & Kashmir) region of Pakistan. The platform provides a unified experience for multiple verticals: e-commerce (Mart), food delivery, ride-hailing (bike/car/rickshaw), pharmacy, parcel delivery, and inter-city van transport. The system consists of four user-facing applications (customer mobile/web, rider PWA, vendor portal, admin panel) backed by a single Node.js API server with PostgreSQL data storage.

The repository is organized as a pnpm workspace monorepo with shared libraries for database schema, API client, validation, and i18n. The primary goal is to ship a production-grade, low-resource-friendly experience suitable for slow networks and budget devices common in the target region.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure (pnpm Workspaces)

The repository uses **pnpm exclusively** (enforced via a `preinstall` hook that rejects npm/yarn). The workspace is split into:

- `lib/*` — Shared libraries (`db`, `api-client-react`, `api-zod`, `auth-utils`, `i18n`) consumed via `@workspace/*` path aliases. These are built first and consumed in their `dist` form by apps.
- `artifacts/*` — Deployable applications (`api-server`, `admin`, `rider-app`, `vendor-app`, `ajkmart`, `sandbox`).
- `scripts/` — Development control (`dev-ctl.mjs`) and environment-specific launchers (`replit`, `codespace`, `vps`, `local`).

TypeScript uses project references with a `tsconfig.base.json`, `customConditions: ["workspace"]`, and a path alias `@workspace/* -> ./lib/*/dist`. The root `typecheck` script builds library references first, then per-package typechecks.

### Applications

1. **api-server** (Node.js/Express) — Single backend serving all clients on port 8080. Routes organized by domain (auth, orders, rides, pharmacy, vendor, rider, admin, wallet, payments, maps, platform-config, etc.). Uses Drizzle ORM, Zod for validation, Socket.IO for real-time events.
2. **admin** (React + Vite) — Admin command-center panel with sidebar navigation, dashboard, operations/inventory/financials/safety/config modules. Designed with a "Command Center" aesthetic (Slate sidebar, Indigo accents, Lucide icons, glassmorphism header).
3. **rider-app** (React + Vite, PWA) — Rider-facing web app with Leaflet maps, GPS tracking, order/ride acceptance, wallet, earnings, deposits.
4. **vendor-app** (React + Vite, Wouter router) — Vendor portal for product/inventory/order management, served under `/vendor/` base path.
5. **ajkmart** (Expo / React Native + Expo Router) — Customer mobile super-app with web build support. Uses `expo-router`, `expo-secure-store`, `expo-local-authentication` (biometrics), `expo-image`, deep linking for magic-link auth.

### Backend Architecture

- **Framework**: Express with Zod request validation, JWT-based auth (15min access + 30-day refresh tokens), CSRF, rate limiting, audit logging.
- **Real-time**: Socket.IO for order ACKs, rider GPS broadcasts (throttled), admin notifications, ride dispatch events.
- **Auth**: Multi-method authentication system — Phone OTP, Email OTP, Username+Password, Google/Facebook OAuth, magic links, TOTP-based 2FA with backup codes, biometric (mobile only). Method visibility is admin-toggleable via platform config.
- **Hybrid Wallet Model**: For cash rides/orders, platform commission is deducted from rider wallet (rider keeps full cash). For wallet-paid rides, rider gets their share credited. Riders must maintain `rider_min_balance` to accept cash jobs. Manual deposit + admin-verified top-ups.
- **Atomic Operations**: Wallet deduction + order creation wrapped in single Drizzle transactions. Two-way ACK pattern between client and server for order confirmation.
- **Platform Config**: A central `/api/platform-config` endpoint exposes admin-controlled settings (feature toggles, pricing defaults, service colors, map center, currency, regex formats, OTP/session TTLs, rate limits, image quality, etc.). Clients fetch on startup and use config values with hardcoded fallbacks.

### Frontend Architecture

- **Customer App (Expo)**: Lazy-loaded service modules gated by platform config feature flags — disabled services don't load code at all. Network-aware image loading via NetInfo + expo-image. React Query cache persisted to AsyncStorage for offline resilience. Bento-style home grid that dynamically adapts when services are toggled. Disabled services completely hidden (not greyed-out).
- **State Management**: React Context (AuthContext, CartContext, PlatformConfigContext, RiderLocationContext) plus React Query for server state.
- **i18n**: Trilingual (English / Urdu / Roman Urdu) via shared `lib/i18n` package.
- **Design System**: Lucide icons across web apps; Ionicons in Expo. Slate/Indigo palette for admin; emerald for rider; brand gradient for customer. Skeleton loaders, bottom sheets on mobile, accessible labels, configurable font scaling.

### Data Layer

- **ORM**: Drizzle. Schema lives in `lib/db/src/schema/` split per domain (users, orders, products, rides, wallets, refresh_tokens, pending_otps, auth_audit_log, magic_link_tokens, error_reports, platform_settings, etc.).
- **Database**: PostgreSQL (via `pg` Pool). May be added later if not yet provisioned — Drizzle schema can exist without an active Postgres instance during development.
- **Migrations**: Managed via Drizzle Kit (`db:push` / `db:migrate`).

### Development Workflow

- `dev-ctl.mjs` provides per-service start/stop/status commands (`pnpm start:api`, `start:admin`, `start:rider`, `start:vendor`, `start:ajkmart`, `start:sandbox`, `start:all`).
- Environment-specific launchers (`replit-start`, `codespace-start`, `vps-start`, `local-start`) handle env-specific port and proxy configuration.
- All apps support hot reload via Vite/Expo dev servers.
- Error tracking via central `error_reports` table with severity classification, surfaced through admin panel.

### Key Architectural Decisions

- **Single API server vs microservices**: Chosen for simplicity, lower hosting cost, and easier transaction consistency across services. Rationale: target market is regional, scale demands moderate.
- **pnpm workspace over Nx/Turborepo**: Lower complexity, sufficient for this project size; build references handled via TypeScript project refs.
- **Expo for customer app**: Single codebase for iOS/Android/Web; trade-off is web bundle requires shims for native-only modules.
- **Admin-driven configuration**: Almost everything (pricing, fees, timeouts, feature flags, auth methods, vehicle types, service zones, currency) is admin-controllable via platform settings to avoid code redeploys for business changes.
- **Manual payment verification**: Wallet top-ups and COD remittances use bank transfer + admin verification rather than gateway integration, matching local payment habits and avoiding gateway fees during initial rollout.

## External Dependencies

### Core Runtime & Frameworks
- **Node.js** (API server) with **Express**, **Socket.IO**, **Drizzle ORM**, **Zod**.
- **PostgreSQL** via `pg` driver (provisioned separately; SSL mode configurable per environment).
- **React 19** + **Vite** for admin/rider/vendor web apps.
- **Wouter** router (vendor app); **React Router** / native expo-router elsewhere.
- **Expo SDK** with **expo-router**, **expo-secure-store**, **expo-local-authentication**, **expo-image**, **expo-auth-session**, **expo-camera**, **expo-store-review**, **expo-linking**.
- **EAS CLI** for native builds.
- **Capacitor** (referenced for rider native shell — Android/iOS).

### Admin Account Seeding

On every API server boot, `seedDefaultSuperAdmin` runs first, followed by
`reconcileSeededSuperAdmin`. Behaviour:

- **No admin accounts in DB** → creates a single super admin using
  `ADMIN_SEED_PASSWORD` (default `Toqeerkhan@123.com`). The row is
  flagged `default_credentials = true` and `must_change_password = false`.
  The SPA reads `defaultCredentials` from auth responses and surfaces an
  OPTIONAL post-login popup (`FirstLoginCredentialsDialog`) that lets
  the super-admin update their username and/or password. Skipping the
  popup keeps the defaults working — no route is gated.
- **Existing admin row with `must_change_password = true`** (legacy
  installs from the previous forced-rotation flow) → the reconcile step
  re-hashes the documented default password, clears the flag, and sets
  `default_credentials = true`. Idempotent: skipped once the admin has
  rotated their password.
- **Otherwise** → no-op (`[admin-seed] skipped — at least one admin
  account already exists`).

The legacy `mpc` (must-change-password) JWT claim and
`FORCE_PASSWORD_CHANGE` 403 gate have been removed. The
`admin_accounts.default_credentials` boolean column (migration `0047`)
drives the new flow and is automatically cleared whenever the admin
self-edits their password (`/api/admin/auth/change-password`) or
username (`PATCH /api/admin/system/admin-accounts/:id`).

Configurable via env (`ADMIN_SEED_EMAIL` defaults to `admin@ajkmart.local`,
`ADMIN_SEED_USERNAME` to `admin`, `ADMIN_SEED_NAME` to
`Super Admin`). `ADMIN_SEED_PASSWORD` is **optional** — if unset, the
documented default `Toqeerkhan@123.com` is used so the credentials shown
on the login page always work out-of-the-box. Operators may override
`ADMIN_SEED_PASSWORD` via Replit Secrets, or simply rotate the
credentials through the post-login popup once signed in.

### Authentication & Security
- **@react-oauth/google** (web Google sign-in).
- **Facebook SDK** (JS for web, expo-auth-session provider for mobile).
- **JWT** (access + refresh tokens), **bcrypt**-style password hashing, **TOTP** (otpauth URIs) for 2FA, hashed backup codes.
- **reCAPTCHA v3** (invisible) on auth submissions.

### Maps & Location
- **Leaflet** (rider/admin web maps) with custom marker icon fix.
- **Reverse geocoding & routing** via maps service routes (street-level precision).
- **NetInfo** for network-quality detection.

### Real-time & State
- **Socket.IO** server + clients for order ACKs, rider location broadcasts, admin live alerts.
- **TanStack React Query** with AsyncStorage persistence (mobile) for offline cache.

### Payment & Wallet
- Manual integration with **JazzCash**, **EasyPaisa**, **Bank Transfer** — no gateway API calls; admin verifies transaction IDs.

### Notifications
- **Push notifications** via Expo push tokens (mobile); WebSocket events for in-app realtime alerts.
- **SMS / WhatsApp / Email OTP** delivery (provider abstracted in services layer).

### Tooling
- **TypeScript 5.9**, **Prettier 3.8**.
- **pnpm** (enforced via preinstall hook).
- **Drizzle Kit** for schema migrations.
- **Sentry** (lazy-loaded for error reporting).

### Testing (admin app)
- **Vitest** unit tests for shared helpers in `artifacts/admin/tests/*.test.ts`
  (safeJson, escapeHtml, sanitizeMarkerHtml, highlightHtml).
- **Integration tests** in `artifacts/admin/tests/integration/*.test.tsx`
  using `@testing-library/react`, `@testing-library/user-event`, `jsdom`,
  and `msw` for HTTP mocking. Covers admin auth (login + token refresh +
  logout), settings persistence (`SystemSection` demo-backup save), and
  CSV export with blob URL revocation. Run with
  `pnpm --filter @workspace/admin test` (full suite < 15s).
### Recent Polish (Apr 2026)
- **Auth Methods page** (`/admin/auth-methods`) — unified per-role login
  toggles for Phone OTP, Email OTP, Username/Password, Magic Link, Google
  OAuth, Facebook OAuth, 2FA (TOTP), and Biometric. 8 methods × 3 roles
  (Customer/Rider/Vendor) matrix with bulk row toggles, OAuth credential
  inputs, search, sticky save bar, and role usage stats. Uses existing
  `platform_settings` JSON values (`{"customer":"on","rider":"on",
  "vendor":"on"}`) — no backend changes required. Server-side
  `isAuthMethodEnabled(settings, key, role)` already enforces per-role
  access in `routes/auth.ts`.
- **Settings global search** — cross-section live search input in the
  Settings sidebar (desktop) and mobile drawer. Type 2+ chars to filter
  any setting by key/label across all 10 top-level groups; clicking a
  result switches to the right tab, smooth-scrolls to the sub-section,
  and briefly flashes it (`ajkm-section-flash` keyframe). Cmd/Ctrl+F
  focuses the search field while on the Settings page.
- **Command Palette (⌘K) coverage** — added searchIndex entries for
  `auth-methods`, `launch-control`, `otp-control`, and `sms-gateways`
  pages with English/Urdu/Roman-Urdu keywords.
