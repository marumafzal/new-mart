# AJKMart Super-App Monorepo

## Overview

AJKMart is a multi-service super-app platform serving the AJK (Azad Jammu & Kashmir) region of Pakistan. The platform provides a unified experience for multiple verticals: e-commerce (Mart), food delivery, ride-hailing (bike/car/rickshaw), pharmacy, parcel delivery, inter-city van transport, school transport, and weather information. The system consists of four user-facing applications (customer mobile/web, rider PWA, vendor portal, admin panel) backed by a single Node.js API server with PostgreSQL data storage.

The repository is organized as a pnpm workspace monorepo with shared libraries for database schema, API client, validation, and i18n. The primary goal is to ship a production-grade, low-resource-friendly experience suitable for slow networks and budget devices common in the target region.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure (pnpm Workspaces)

The repository uses **pnpm exclusively** (enforced via a `preinstall` hook that rejects npm/yarn). The workspace is split into:

- `lib/*` — Shared libraries:
  - `db` — Drizzle ORM schema + migrations
  - `api-client-react` — React Query API client hooks
  - `api-zod` — Zod request/response schemas shared between server and clients
  - `api-spec` — API specification
  - `auth-utils` — JWT helpers, token utilities
  - `i18n` — Trilingual translation strings (English / Urdu / Roman Urdu)
  - `admin-timing-shared` — Admin timing utilities
  - `phone-utils` — Phone number formatting/validation
  - `service-constants` — Shared service-level constants
  - `integrations/gemini_ai_integrations` — Google Gemini AI integration wrapper
  - `integrations-gemini-ai` — Gemini AI integration package
- `artifacts/*` — Deployable applications (`api-server`, `admin`, `rider-app`, `vendor-app`, `ajkmart`, `mockup-sandbox`).
- `scripts/` — Development control (`dev-ctl.mjs`) and environment-specific launchers.

TypeScript uses project references with a `tsconfig.base.json`, `customConditions: ["workspace"]`, and a path alias `@workspace/* -> ./lib/*/dist`.

### Applications & Ports

| App | Port | Base Path | Description |
|-----|------|-----------|-------------|
| api-server | 8080 | / | Main API server (also runs on 5000 via "Start application" workflow) |
| admin | 23744 | /admin/ | Admin command-center panel |
| rider-app | 22969 | /rider/ | Rider PWA (React + Vite + Capacitor) |
| vendor-app | 21463 | /vendor/ | Vendor portal (React + Vite + Wouter) |
| ajkmart (Expo) | 20716 | / | Customer mobile/web app |
| mockup-sandbox | 8081 | /__mockup | Component preview server for Canvas |

### Backend Architecture — API Server

Routes in `artifacts/api-server/src/routes/`:
- `auth.ts` — Multi-method authentication (OTP, password, OAuth, magic links, TOTP)
- `orders.ts`, `products.ts`, `categories.ts`, `variants.ts` — E-commerce
- `rides.ts` — Ride-hailing (bike/car/rickshaw dispatch, bidding, GPS)
- `pharmacy.ts` — Pharmacy vertical
- `parcel.ts` — Parcel delivery
- `van.ts` — Inter-city van service
- `school.ts` — School transport routes
- `vendor.ts`, `public-vendors.ts` — Vendor-facing and public vendor APIs
- `rider.ts` — Rider-facing APIs (jobs, wallet, earnings, deposits)
- `wallet.ts`, `payments.ts` — Wallet management, top-ups, withdrawals
- `maps.ts`, `locations.ts` — Geocoding, routing, live location
- `platform-config.ts` — Admin-controlled feature flags + settings
- `notifications.ts`, `push.ts` — Push notification registration (FCM + VAPID), in-app alerts
- `reviews.ts`, `ratings.ts` — User reviews and ride ratings
- `recommendations.ts` — Personalized product recommendations
- `search-analytics.ts` — Search event logging + zero-result analytics
- `promotions.ts`, `banners.ts`, `popups.ts`, `flash-deals.ts` — Marketing tools
- `deep-links-public.ts`, `deep-links.ts` — Deep link generation and management
- `delivery-eligibility.ts` — Delivery zone and availability checks
- `kyc.ts` — KYC document submission and admin review
- `uploads.ts` — Image upload with auto-compression (Sharp)
- `addresses.ts`, `saved-addresses.ts` — Address management
- `wishlist.ts` — Customer wishlist
- `communication.ts` — SMS/WhatsApp/Email sending
- `support-chat.ts` — Customer support chat
- `sos.ts` — SOS/emergency alerts
- `weather-config.ts` — Weather feature (feature-flag gated server-side)
- `stats.ts`, `system.ts` — Platform stats, system health
- `health.ts` — Health check endpoint
- `webhooks.ts`, `legal.ts`, `error-reports.ts` — Misc

Admin sub-routes in `routes/admin/`:
- Core admin: `admin-auth-v2.ts`, `admin.ts`, `admin-shared.ts`
- Operations: `orders.ts`, `rides.ts` (fleet sub-route)
- Finance: `finance/wallets.ts`, `payments.ts`
- Fleet: `fleet/index.ts`, `fleet/rides.ts`, `fleet/zones.ts`
- System: `system/index.ts`, `system/auth.ts`, `system/rbac.ts`, `system/conditions.ts`, `system/users.ts`
- Content: `content.ts`, `banners.ts`, `popups.ts`, `faq.ts`, `deep-links.ts`, `qr-codes.ts`, `release-notes.ts`
- Users: `user-addresses.ts`, `whitelist.ts`, `kyc.ts`, `conditions.ts`
- Config: `settings.ts`, `sms-gateways.ts`, `webhook-registrations.ts`, `weather-config.ts`
- Analytics: `search-analytics.ts`, `wishlist-analytics.ts`, `experiments.ts`
- Safety: `chat-monitor.ts`, `otp.ts`, `delivery-access.ts`
- Misc: `communication.ts`, `launch.ts`, `loyalty.ts`, `promotions.ts`, `support-chat.ts`

Services in `artifacts/api-server/src/services/`:
- `admin-seed.service.ts` — Super admin seeding on boot
- `admin-auth.service.ts`, `admin-user.service.ts`, `admin-password.service.ts` — Admin auth
- `admin-audit.service.ts`, `admin-password-watch.service.ts` — Security auditing
- `admin-finance.service.ts`, `admin-fleet.service.ts` — Finance/fleet management
- `admin-notification.service.ts` — Admin push/socket notifications
- `permissions.service.ts` — RBAC permission checks
- `email.ts`, `sms.ts`, `smsGateway.ts`, `whatsapp.ts` — Communication services
- `firebase.ts` — Firebase Admin SDK (FCM push notifications)
- `totp.ts` — TOTP 2FA implementation
- `password.ts` — Password hashing/validation
- `contentModeration.ts`, `communicationAI.ts` — AI-powered moderation (Gemini)
- `sqlMigrationRunner.ts` — In-process SQL migration runner

### Authentication & Security

- **Multi-method auth**: Phone OTP, Email OTP, Username+Password, Google OAuth, Facebook OAuth, Magic Links, TOTP 2FA with backup codes, Biometric (mobile). Method visibility per-role, admin-toggleable.
- **JWT**: 15-minute access tokens + 30-day refresh tokens. Admin uses separate JWT secret.
- **RBAC**: Granular role/permission system with admin_role_presets.
- **Rate limiting**, **CSRF**, **helmet** security headers.
- **Audit logging**: auth_audit_log table tracks all auth events.
- **Password watch**: admin-password-watch.service scans and reconciles on boot.
- **reCAPTCHA v3** on auth submissions (client-side).

### Database Schema (key tables)

Schema files in `lib/db/src/schema/`:
- Core: `users`, `vendor_profiles`, `rider_profiles`, `admin_accounts`, `admin_sessions`, `admin_role_presets`
- Auth: `refresh_tokens`, `pending_otps`, `auth_audit_log`, `magic_link_tokens`, `user_sessions`
- Orders: `orders`, `order_items`, `products`, `categories`, `variants`, `inventory`
- Rides: `rides`, `ride_bids`, `ride_event_logs`, `ride_notified_riders`, `ride_ratings`, `ride_service_types`
- Wallets: `wallet_transactions`, `rider_penalties`
- Location: `live_locations`, `location_history`, `location_logs`, `saved_addresses`, `service_zones`
- Content: `banners`, `popups`, `flash_deals`, `campaigns`, `promotions`
- Analytics: `search_logs`, `user_interactions`, `ab_experiments`
- Config: `platform_settings`, `sms_gateways`, `weather_config`, `webhook_registrations`
- Safety: `kyc_verifications`, `sos_alerts`, `chat_reports`, `whitelist_users`
- Misc: `faqs`, `terms_versions`, `consent_log`, `deep_links`, `school_routes`, `van_service`, `error_reports`, `system_snapshots`, `idempotency_keys`, `stock_subscriptions`, `wishlist`, `vendor_plans`, `vendor_schedules`

### Frontend Architecture

**Admin Panel** (`artifacts/admin/src/`):
- Pages (40+): dashboard, riders, vendors, orders, rides, kyc, transactions, wallet-transfers, users, products, categories, banners, promotions, flash-deals, popups, deep-links, qr-codes, settings (10 tabs), auth-methods, launch-control, otp-control, sms-gateways, roles-permissions, chat-monitor, support-chat, error-monitor, sos-alerts, live-riders-map, search-analytics, wishlist-insights, experiments, loyalty, broadcast, communication, faq-management, webhook-manager, parcel, van, pharmacy, school, etc.
- Shared components: `PageHeader`, `StatCard`, `FilterBar`, `ActionBar`, `CommandPalette` (⌘K), `WalletAdjustModal`, `ServiceZonesManager`, `UniversalMap`.
- Settings has 10 top-level tabs with global live search (Cmd/Ctrl+F).

**Rider App** (`artifacts/rider-app/src/`):
- Pages: Home, Active, History, Earnings, Wallet, Chat, Notifications, Profile, SecuritySettings, VanDriver, Login, Register, ForgotPassword.
- Push notifications: FCM (native via `@capacitor/push-notifications`) + VAPID (PWA).
- FCM deep-linking: notification tap navigates rider to `/active` screen.
- Auto-compression of delivery proof photos before upload (Sharp on server side).
- Capacitor shell for native Android/iOS builds.

**Vendor App** (`artifacts/vendor-app/src/`):
- Pages: Dashboard, Orders, Products, Store, Campaigns, Promos, Wallet, Analytics, Reviews, Notifications, Profile, Chat, Login.
- Push notifications: FCM (native) + VAPID. Deep-link to /orders on order notification tap.
- FCM token auto-refresh on rotation.

**Customer App — AJKMart Expo** (`artifacts/ajkmart/`):
- Expo Router, expo-router for file-based routing.
- Service sections: mart, food, pharmacy, parcel, rides, categories, orders, cart, chat, help, onboarding, auth.
- Lazy-loaded service modules gated by platform config feature flags.
- Bento-style home with StatsBar, ServiceGrid, QuickActions, TrendingSection, BannerCarousel, FlashDeals.
- Push notifications via Expo push tokens.
- Network-aware image loading, React Query AsyncStorage persistence.
- Note: Expo web in Replit requires `EXPO_PUBLIC_DOMAIN` + `--host lan` flags. CORS "Unauthorized request" errors from Replit's proxy are cosmetic (Metro still serves the bundle). App may SIGKILL under memory pressure on first load.

### Push Notifications Architecture

- **FCM (Native)**: `@capacitor/push-notifications` for rider-app and vendor-app native builds. `firebase-admin` on server sends FCM messages. Deep links embedded in notification data payload.
- **VAPID (Web/PWA)**: Web Push API with service worker (`sw.js`). VAPID keys in env.
- **Token Lifecycle**: Auto-refresh on token rotation (tokenRefresh listener). Server deletes old FCM rows before inserting new token.
- **Cold-start handling**: Pending tap data captured at module load, consumed after auth rehydrates.
- **Vendor notifications**: New order → push notify vendor → deep link to /orders.
- **Rider notifications**: Ride dispatch → push notify rider → deep link to /active.

### Real-time

- **Socket.IO**: Order ACKs, rider GPS broadcasts (throttled), admin live alerts, ride dispatch events, support chat.
- **GPS**: Rider location broadcasted to admin live map and to customers tracking orders/rides.

### Platform Config System

Central `/api/platform-config` endpoint (public, no auth) returns all admin-controlled settings:
- Feature flags (enable/disable each service vertical)
- Pricing defaults, commission rates, min balances
- Auth method visibility per role
- Map center coordinates, service zone boundaries
- OTP/session TTLs, rate limit thresholds
- Image quality settings
- Currency, regex validation patterns
- Weather feature toggle (also enforced server-side via `requireFeatureEnabled` middleware)

### Development Workflow

All workflows configured in `.replit`:
- `artifacts/api-server: API Server` → port 8080
- `Start application` → port 5000 (both run same api-server code)
- `artifacts/admin: web` → port 23744
- `artifacts/rider-app: web` → port 22969
- `artifacts/vendor-app: web` → port 21463
- `artifacts/ajkmart: expo` → port 20716
- `artifacts/mockup-sandbox: Component Preview Server` → port 8081

Environment variables in `.replit [userenv.shared]`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_SECRET` — Auth secrets
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` — Push notification keys
- `GEMINI_API_KEY` — Google Gemini AI key
- `PORT` — Default 8080

### Admin Account Seeding

On every API server boot, `seedDefaultSuperAdmin` runs, then `reconcileSeededSuperAdmin`:
- No admin accounts → creates super admin with `ADMIN_SEED_PASSWORD` (default `Toqeerkhan@123.com`), sets `default_credentials = true`.
- Existing row with `must_change_password = true` (legacy) → reconcile re-hashes password, clears flag.
- Otherwise → no-op.

The `FirstLoginCredentialsDialog` in the admin SPA shows an **optional** post-login popup for updating credentials. No routes are gated on it.

Configurable via env: `ADMIN_SEED_EMAIL` (default `admin@ajkmart.local`), `ADMIN_SEED_USERNAME` (default `admin`), `ADMIN_SEED_NAME` (default `Super Admin`).

### Key Architectural Decisions

- **Single API server**: Simpler transactions, lower cost for regional scale.
- **pnpm workspace**: Lower complexity than Nx/Turborepo; TypeScript project refs for builds.
- **Expo for customer app**: Single codebase iOS/Android/Web.
- **Admin-driven config**: Pricing, fees, timeouts, flags all admin-settable without redeploys.
- **Manual payment verification**: JazzCash/EasyPaisa/Bank Transfer with admin-verified transaction IDs. No gateway API calls.
- **Hybrid wallet**: Cash jobs deduct platform commission from rider wallet; wallet-paid jobs credit rider share.
- **Feature-flag gating**: Disabled services completely hidden (not greyed); server enforces via `requireFeatureEnabled`.

## External Dependencies

### Runtime & Frameworks
- **Node.js 20** + Express 5, Socket.IO, Drizzle ORM, Zod
- **PostgreSQL 16** via Neon (managed, SSL)
- **React 19** + Vite 7 (admin, rider-app, vendor-app)
- **Expo SDK 54** + expo-router 6 (ajkmart)
- **Capacitor 7** (rider-app + vendor-app native shell)
- **@capacitor/push-notifications 7** (FCM for native apps)
- **firebase-admin 13** (server-side FCM sending)

### Auth & Security
- `jsonwebtoken`, `bcrypt`, `bcryptjs`, `otpauth` (TOTP)
- `@react-oauth/google`, Facebook JS SDK
- `helmet`, `express-rate-limit`, `cookie-parser`, `cors`

### AI & Communication
- `@google/genai` (Gemini AI — content moderation, AI features)
- `openai` (OpenAI integration — key needed via env)
- `nodemailer` (email OTP/magic links)
- `twilio` (SMS OTP — key needed via env)
- `web-push` (VAPID push notifications)
- `firebase-admin` (FCM push notifications)

### Media & Maps
- `sharp` (server-side image compression)
- `multer` (file uploads)
- `Leaflet` (rider/admin web maps)
- `qrcode` (QR code generation)

### Tooling
- **TypeScript 5.9**, **Prettier 3.8**, **tsx 4.21**
- **Drizzle Kit** for schema migrations
- **pnpm 10** (enforced)

### Testing (admin)
- **Vitest** unit tests: `artifacts/admin/tests/*.test.ts`
- **Integration tests**: `artifacts/admin/tests/integration/*.test.tsx` with `@testing-library/react`, `msw`
- Run: `pnpm --filter @workspace/admin test`

## Known Issues / Notes

- **Expo (ajkmart) web**: In the Replit proxied environment, Expo CLI's CORS middleware rejects requests from the Replit proxy domain, logging "Unauthorized request" errors. This is cosmetic — Metro still serves the bundle and the app loads. If the workflow exits with SIGKILL, it's a memory pressure issue; restart the workflow.
- **@capacitor/push-notifications**: Must be installed in `artifacts/rider-app` and `artifacts/vendor-app` node_modules (pnpm workspace places it there). If Vite complains about missing `@capacitor/push-notifications`, run `pnpm --filter @workspace/rider-app add @capacitor/push-notifications` and restart the workflows.
- **Admin port conflict**: Admin dev server tries port 23744 first; if in use, falls back to 23745. The `.replit` port config maps both (3000→23744, 3001→23745).
- **Neon DB cold start**: First request after idle may be slow while the Neon serverless DB wakes up.
