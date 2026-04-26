# AJKMart Platform — Admin Config & Live Status Tracker
# AJKMart پلیٹ فارم — ایڈمن کنفگ اور لائیو اسٹیٹس ٹریکر

> **Last updated:** 2026-04-26  
> **Status legend:** ✅ Complete | 🔄 In Progress | ⚠️ Partial | ❌ Missing | ⏳ Pending (not started)  
> **Scope:** Monorepo at `/home/runner/workspace` — pnpm workspaces

---

## Table of Contents / فہرست مضامین

1. [Platform Overview](#1-platform-overview)
2. [Quick-Start Checklist](#2-quick-start-checklist)
3. [Integration Credentials Status](#3-integration-credentials-status)
4. [Admin Panel — Page Status](#4-admin-panel--page-status)
5. [AJKMart Customer App — Screen Status](#5-ajkmart-customer-app--screen-status)
6. [Rider App — Screen Status](#6-rider-app--screen-status)
7. [Vendor App — Screen Status](#7-vendor-app--screen-status)
8. [API Server — Route Status](#8-api-server--route-status)
9. [Feature Toggle Reference](#9-feature-toggle-reference)
10. [Known Issues & TODOs](#10-known-issues--todos)
11. [Open Tasks](#11-open-tasks)
12. [How to Keep This File Updated](#12-how-to-keep-this-file-updated)

---

## 1. Platform Overview
## 1. پلیٹ فارم کا جائزہ

AJKMart is a multi-service super-app for the AJK (Azad Jammu & Kashmir) region of Pakistan. It covers:

| Service | Description / تفصیل | Status |
|---------|---------------------|--------|
| 🛒 Mart | E-commerce marketplace (products, vendors, orders) | ✅ Complete |
| 🍔 Food | Food delivery from restaurants | ✅ Complete |
| 🚗 Rides | Bike & car ride hailing | ✅ Complete |
| 💊 Pharmacy | Online pharmacy orders | ✅ Complete |
| 📦 Parcel | Parcel booking & tracking | ✅ Complete |
| 🚐 Van | Van hire for passengers & cargo | ✅ Complete |
| 💰 Wallet | In-app wallet, P2P transfer, top-up | ✅ Complete |
| 🎓 School | School transport (feature-flagged) | ⚠️ Partial |
| 📡 SOS | Emergency SOS alerts with real-time socket | ✅ Complete |

**Monorepo structure:**

```
artifacts/
  admin/          → React + Vite admin panel        (port 23744)
  ajkmart/        → Expo React Native customer app  (web dev port varies)
  rider-app/      → React + Vite rider dashboard    (port varies)
  vendor-app/     → React + Vite vendor dashboard   (port varies)
  api-server/     → Express + Drizzle API           (port 5000 / 8080)
lib/
  db/             → Drizzle ORM schema + migrations
```

---

## 2. Quick-Start Checklist
## 2. فوری شروعات کی چیک لسٹ

Before going live, complete every item marked ❌ or ⚠️:

- [ ] ❌ **Firebase FCM** — set `fcm_server_key` + `fcm_project_id` in Settings → Integrations → Firebase
- [ ] ❌ **SMS Gateway** — choose provider (Twilio / MSG91 / Zong) and enter credentials in Settings → Integrations → SMS
- [ ] ❌ **Email / SMTP** — set `smtp_host`, `smtp_user`, `smtp_password` in Settings → Integrations → Email
- [ ] ⚠️ **WhatsApp Business** — set `wa_phone_number_id` + `wa_access_token` in Settings → Integrations → WhatsApp
- [ ] ⚠️ **Maps API** — set Google Maps / Mapbox / LocationIQ key in Settings → Integrations → Maps
- [ ] ⚠️ **JazzCash** — enable + configure mode (Manual or API) in Settings → Payment
- [ ] ⚠️ **EasyPaisa** — enable + configure mode (Manual or API) in Settings → Payment
- [ ] ❌ **Analytics** — choose platform (Google Analytics / Mixpanel / Amplitude) + tracking ID in Settings → Integrations → Analytics
- [ ] ❌ **Sentry** — set `sentry_dsn` in Settings → Integrations → Sentry
- [ ] ✅ **Weather Widget** — enabled by default, configure cities in Settings → Widgets → Weather
- [ ] ✅ **Admin account** — super admin seeded automatically on first boot
- [ ] ✅ **Database** — Neon PostgreSQL via `DATABASE_URL` env var (already configured in `.replit`)

---

## 3. Integration Credentials Status
## 3. انٹیگریشن اسناد کی حالت

### 3.1 Firebase Cloud Messaging (FCM) 🔥

| Field | Setting Key | Where to Enter | Status |
|-------|-------------|----------------|--------|
| FCM Server Key (Legacy API) | `fcm_server_key` | Settings → Integrations → Firebase | ❌ Missing |
| Firebase Project ID | `fcm_project_id` | Settings → Integrations → Firebase | ❌ Missing |

**How to get:** Firebase Console → Project Settings → Cloud Messaging → Server Key  
**Enable toggle:** `integration_push_notif` → `on`

---

### 3.2 SMS Gateway 📱

**Provider options:** Console (dev only) | Twilio | MSG91 | Zong/CM.com  
**Setting key for provider:** `sms_provider`

#### Twilio
| Field | Setting Key | Status |
|-------|-------------|--------|
| Account SID | `sms_account_sid` | ❌ Missing |
| Auth Token | `sms_api_key` | ❌ Missing |
| From Phone Number | `sms_sender_id` | ❌ Missing |

#### MSG91
| Field | Setting Key | Status |
|-------|-------------|--------|
| Auth Key | `sms_msg91_key` | ❌ Missing |
| Sender ID (6 chars) | `sms_sender_id` | ❌ Missing |

#### Zong / CM.com
| Field | Setting Key | Status |
|-------|-------------|--------|
| API Key | `sms_api_key` | ❌ Missing |
| Sender ID | `sms_sender_id` | ❌ Missing |

**Where to enter:** Settings → Integrations → SMS  
**Enable toggle:** `integration_sms` → `on`

---

### 3.3 Email / SMTP 📧

| Field | Setting Key | Status |
|-------|-------------|--------|
| SMTP Host | `smtp_host` | ❌ Missing |
| Port | `smtp_port` | ❌ Missing |
| Encryption Mode | `smtp_secure` | ⚠️ Default: tls |
| Username / Email | `smtp_user` | ❌ Missing |
| Password / App Password | `smtp_password` | ❌ Missing |
| From Email | `smtp_from_email` | ❌ Missing |
| From Display Name | `smtp_from_name` | ⚠️ Default: AJKMart |
| Admin Alert Email | `smtp_admin_alert_email` | ❌ Missing |

**Gmail quick-start:** host = `smtp.gmail.com`, port = 587, mode = TLS, use an App Password  
**Where to enter:** Settings → Integrations → Email  
**Enable toggle:** `integration_email` → `on`

---

### 3.4 WhatsApp Business API 💬

| Field | Setting Key | Status |
|-------|-------------|--------|
| Phone Number ID | `wa_phone_number_id` | ❌ Missing |
| Business Account ID | `wa_business_account_id` | ❌ Missing |
| Permanent Access Token | `wa_access_token` | ❌ Missing |
| Webhook Verify Token | `wa_verify_token` | ❌ Missing |
| OTP Template Name | `wa_otp_template` | ⚠️ Default: otp_verification |
| Order Notification Template | `wa_order_template` | ⚠️ Default: order_notification |

**Where to enter:** Settings → Integrations → WhatsApp  
**Enable toggle:** `integration_whatsapp` → `on`

---

### 3.5 Maps API 🗺️

**Provider options:** Google Maps | Mapbox | LocationIQ  
**Setting key for provider:** `maps_provider`

| Provider | API Key Setting | Status |
|----------|-----------------|--------|
| Google Maps | `google_maps_api_key` or `maps_api_key` | ❌ Missing |
| Mapbox | `mapbox_api_key` | ❌ Missing |
| LocationIQ | `locationiq_api_key` | ❌ Missing |

**Where to enter:** Settings → Integrations → Maps  
**Enable toggle:** `integration_maps` → `on`

---

### 3.6 Analytics 📊

**Platform options:** none | google | mixpanel | amplitude

| Field | Setting Key | Status |
|-------|-------------|--------|
| Analytics Platform | `analytics_platform` | ⚠️ Default: none |
| Tracking ID / API Key | `analytics_tracking_id` | ❌ Missing |
| API Secret | `analytics_api_secret` | ❌ Missing |

**Where to enter:** Settings → Integrations → Analytics  
**Enable toggle:** `integration_analytics` → `on`

---

### 3.7 Sentry 🐛

| Field | Setting Key | Status |
|-------|-------------|--------|
| Sentry DSN URL | `sentry_dsn` | ❌ Missing |
| Environment | `sentry_environment` | ⚠️ Default: production |
| Error Sample Rate | `sentry_sample_rate` | ⚠️ Default: 100 |
| Performance Traces Rate | `sentry_traces_sample_rate` | ⚠️ Default: 10 |

**Where to enter:** Settings → Integrations → Sentry  
**Enable toggle:** `integration_sentry` → `on`

---

### 3.8 JazzCash 💳

**Modes:** Manual (show account number to customers, always ready) | API (automated)

#### Manual Mode
| Field | Setting Key | Status |
|-------|-------------|--------|
| Account Name | `jazzcash_manual_name` | ⚠️ Optional |
| JazzCash Number | `jazzcash_manual_number` | ⚠️ Optional |

#### API Mode
| Field | Setting Key | Status |
|-------|-------------|--------|
| Merchant ID | `jazzcash_merchant_id` | ❌ Missing |
| Password | `jazzcash_password` | ❌ Missing |
| Integrity Salt | `jazzcash_salt` | ❌ Missing |
| Return URL | `jazzcash_return_url` | ❌ Missing |

**Where to enter:** Settings → Payment → JazzCash  
**Enable toggle:** `jazzcash_enabled` → `on`  
**Test endpoint:** `GET /api/payments/test-connection/jazzcash`

---

### 3.9 EasyPaisa 💳

**Modes:** Manual | API

#### Manual Mode
| Field | Setting Key | Status |
|-------|-------------|--------|
| Account Name | `easypaisa_manual_name` | ⚠️ Optional |
| EasyPaisa Number | `easypaisa_manual_number` | ⚠️ Optional |

#### API Mode
| Field | Setting Key | Status |
|-------|-------------|--------|
| Store ID | `easypaisa_store_id` | ❌ Missing |
| Hash Key | `easypaisa_hash_key` | ❌ Missing |

**Where to enter:** Settings → Payment → EasyPaisa  
**Enable toggle:** `easypaisa_enabled` → `on`  
**Test endpoint:** `GET /api/payments/test-connection/easypaisa`

---

### 3.10 Weather Widget 🌤️

No external API key required — uses Open-Meteo (free, no auth).

| Field | Setting Key | Status |
|-------|-------------|--------|
| Widget Enabled | `feature_weather` | ✅ Default: on |
| Cities list | DB: `weatherConfigTable` | ✅ Configurable |

**Where to enter:** Settings → Widgets → Weather

---

## 4. Admin Panel — Page Status
## 4. ایڈمن پینل — صفحات کی حالت

Port: **23744** | Path prefix: `/admin/`

### 4.1 Core Dashboard & Navigation

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Dashboard | `/admin/dashboard` | ✅ Complete | Stats, recent orders/rides, revenue cards |
| Login | `/admin/login` | ✅ Complete | JWT auth, TOTP support |
| Forgot Password | `/admin/forgot-password` | ✅ Complete | Email reset flow |
| Reset Password | `/admin/reset-password` | ✅ Complete | Token-based |
| Set New Password | `/admin/set-new-password` | ✅ Complete | |
| Not Found | `/admin/*` | ✅ Complete | 404 fallback |

### 4.2 User Management / صارف انتظام

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Users List | `/admin/users` | ✅ Complete | Search, filter, ban/unban, KYC |
| User Detail | `/admin/users/:id` | ✅ Complete | Full profile, orders, wallet |
| KYC Review | `/admin/kyc` | ⚠️ Partial | View/approve/reject, improvements pending (Task open) |
| Roles & Permissions | `/admin/roles-permissions` | ✅ Complete | RBAC with presets |
| Account Conditions | `/admin/account-conditions` | ✅ Complete | |
| Condition Rules | `/admin/condition-rules` | ⚠️ Partial | Van driver rules (fix task open) |

### 4.3 Vendor Management / وینڈر انتظام

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Vendors List | `/admin/vendors` | ✅ Complete | Approve, suspend, plans |
| Vendor Plans | via Settings → Launch | ✅ Complete | CRUD vendor pricing plans |
| Reviews | `/admin/reviews` | ✅ Complete | Product/vendor reviews |

### 4.4 Order Management / آرڈر انتظام

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Orders (Mart) | `/admin/orders` | ✅ Complete | List, filter, status update |
| Order Sub-pages | `/admin/orders/*` | ✅ Complete | Detail, timeline |
| Pharmacy Orders | `/admin/pharmacy` | ✅ Complete | |
| Parcel Bookings | `/admin/parcel` | ✅ Complete | |
| Van Bookings | `/admin/van` | ✅ Complete | |

### 4.5 Ride Management / سواری انتظام

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Rides List | `/admin/rides` | ✅ Complete | All ride types |
| Live Riders Map | `/admin/live-riders-map` | ✅ Complete | Real-time socket map |
| Riders List | `/admin/riders` | ✅ Complete | Approve, suspend, payout |

### 4.6 Product & Inventory / پروڈکٹ انتظام

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Products | `/admin/products` | ✅ Complete | CRUD, images, variants |
| Categories | `/admin/categories` | ✅ Complete | Nested categories |
| Banners | `/admin/banners` | ✅ Complete | |
| Flash Deals | `/admin/flash-deals` | ✅ Complete | |
| Promo Codes | `/admin/promo-codes` | ✅ Complete | |
| Promotions Hub | `/admin/promotions-hub` | ✅ Complete | |
| QR Codes | `/admin/qr-codes` | ✅ Complete | |
| Deep Links | `/admin/deep-links` | ✅ Complete | |
| Popups | `/admin/popups` | ✅ Complete | |

### 4.7 Finance & Payments / مالیات

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Transactions | `/admin/transactions` | ✅ Complete | |
| Wallet Transfers | `/admin/wallet-transfers` | ✅ Complete | P2P log |
| Withdrawals | `/admin/Withdrawals` | ✅ Complete | Vendor/rider payouts |
| Deposit Requests | `/admin/DepositRequests` | ✅ Complete | |

### 4.8 Communication / ابلاغ

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Notifications | `/admin/notifications` | ✅ Complete | Broadcast, FCM |
| Broadcast | `/admin/broadcast` | ⚠️ Partial | Role-filter bug (Task open) |
| SMS Gateways | `/admin/sms-gateways` | ✅ Complete | Gateway test |
| OTP Control | `/admin/otp-control` | ✅ Complete | OTP provider switcher |
| Communication | `/admin/communication` | ✅ Complete | AI-assisted messaging |
| Chat Monitor | `/admin/chat-monitor` | ✅ Complete | Support chat oversight |
| Support Chat | `/admin/support-chat` | ✅ Complete | |

### 4.9 Settings / ترتیبات

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Settings (main) | `/admin/settings` | ✅ Complete | Full settings panel |
| Integrations | `/admin/settings?tab=integrations` | ✅ Complete | Health panel + full config |
| Payment Settings | `/admin/settings?tab=payment` | ✅ Complete | JazzCash, EasyPaisa, COD |
| Security Settings | `/admin/settings?tab=security` | ✅ Complete | IP whitelist, OTP, TOTP |
| Weather Widget | `/admin/settings?tab=weather` | ✅ Complete | Cities config |
| App Management | `/admin/app-management` | ✅ Complete | |
| Launch Control | `/admin/launch-control` | ✅ Complete | Feature flags, vendor plans, mode switch |
| Experiments | `/admin/experiments` | ✅ Complete | A/B testing |
| Loyalty Program | `/admin/loyalty` | ✅ Complete | |
| Delivery Access | `/admin/delivery-access` | ✅ Complete | |
| Webhook Manager | `/admin/webhook-manager` | ✅ Complete | |

### 4.10 Security & Monitoring / سیکیورٹی

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Security | `/admin/security` | ✅ Complete | IP blocking, audit log, lockouts |
| SOS Alerts | `/admin/sos-alerts` | ✅ Complete | Real-time SOS dashboard |
| Error Monitor | `/admin/error-monitor` | ✅ Complete | |
| Search Analytics | `/admin/search-analytics` | ✅ Complete | |
| Wishlist Insights | `/admin/wishlist-insights` | ✅ Complete | |

### 4.11 Content & Misc / مواد

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| FAQs | `/admin/faq-management` | ✅ Complete | |
| Offers | via dashboard | ✅ Complete | |

---

## 5. AJKMart Customer App — Screen Status
## 5. AJKMart کسٹمر ایپ — اسکرین حالت

Framework: **Expo** (React Native) — web + iOS + Android

### 5.1 Authentication / توثیق

| Screen | File | Status |
|--------|------|--------|
| Onboarding | `app/onboarding.tsx` | ✅ Complete |
| Login | `app/auth/index.tsx` | ✅ Complete |
| Register | `app/auth/register.tsx` | ✅ Complete |
| Forgot Password | `app/auth/forgot-password.tsx` | ✅ Complete |
| Wrong App | `app/auth/wrong-app.tsx` | ✅ Complete |

### 5.2 Main Tabs / مرکزی ٹیبز

| Tab | File | Status |
|-----|------|--------|
| Home | `app/(tabs)/index.tsx` | ✅ Complete |
| Orders | `app/(tabs)/orders.tsx` | ✅ Complete |
| Profile | `app/(tabs)/profile.tsx` | ✅ Complete |
| Wallet | `app/(tabs)/wallet.tsx` | ✅ Complete |

### 5.3 Mart / مارٹ

| Screen | Status | Notes |
|--------|--------|-------|
| Mart Home | ✅ Complete | Categories, banners, featured |
| Product Listing | ✅ Complete | Filters, search |
| Product Detail | ✅ Complete | Images, variants, reviews |
| Cart | ✅ Complete | Coupon, checkout |
| Categories | ✅ Complete | Nested |
| Wishlist | ✅ Complete | |
| Search | ✅ Complete | |
| Recently Viewed | ✅ Complete | |
| Scan QR | ✅ Complete | `app/scan.tsx` |

### 5.4 Food / کھانا

| Screen | Status | Notes |
|--------|--------|-------|
| Food Home | ✅ Complete | Featured restaurants |
| Restaurant List | ✅ Complete | |
| Restaurant Detail | ✅ Complete | Menu, cart |
| Food Stores | ✅ Complete | |

### 5.5 Ride / سواری

| Screen | Status | Notes |
|--------|--------|-------|
| Ride Booking | ✅ Complete | Bike / Car selection |
| Active Ride | ✅ Complete | Live map tracking |

### 5.6 Pharmacy / فارمیسی

| Screen | Status | Notes |
|--------|--------|-------|
| Pharmacy Home | ✅ Complete | |
| Pharmacy Stores | ✅ Complete | |
| Pharmacy Store Detail | ✅ Complete | Products, cart |

### 5.7 Parcel / پارسل

| Screen | Status | Notes |
|--------|--------|-------|
| Parcel Booking | ✅ Complete | |
| Parcel Tracking | via orders | ✅ Complete | |

### 5.8 Van / وین

| Screen | Status | Notes |
|--------|--------|-------|
| Van Home | ✅ Complete | |
| Van Bookings | ✅ Complete | |
| Van Tracking | ✅ Complete | |

### 5.9 Vendor Portal (Customer App) / وینڈر پورٹل

| Screen | Status | Notes |
|--------|--------|-------|
| Vendor Product | `app/vendor/[id].tsx` | ✅ Complete |

### 5.10 Other Screens / دیگر اسکرینز

| Screen | Status |
|--------|--------|
| Offers | ✅ Complete |
| Chat (support) | ✅ Complete |
| Help / FAQ | ✅ Complete |
| Rate App | ✅ Complete |
| My Reviews | ✅ Complete |
| Weather Widget | ✅ Complete |

---

## 6. Rider App — Screen Status
## 6. رائیڈر ایپ — اسکرین حالت

Framework: **React + Vite** | Port: varies (dev)

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Login | `Login.tsx` | ✅ Complete | |
| Register | `Register.tsx` | ✅ Complete | |
| Forgot Password | `ForgotPassword.tsx` | ✅ Complete | |
| Home | `Home.tsx` | ✅ Complete | Accept/reject requests |
| Active Ride | `Active.tsx` | ✅ Complete | Live map, status flow |
| Earnings | `Earnings.tsx` | ✅ Complete | Daily/weekly stats |
| History | `History.tsx` | ✅ Complete | Past rides |
| Notifications | `Notifications.tsx` | ✅ Complete | Push + in-app |
| Profile | `Profile.tsx` | ✅ Complete | KYC, documents |
| Security Settings | `SecuritySettings.tsx` | ✅ Complete | Change password, MPIN |
| Wallet | `Wallet.tsx` | ✅ Complete | Balance, withdrawals |
| Van Driver Mode | `VanDriver.tsx` | ⚠️ Partial | Metrics/conditions bug (Task open) |
| Chat | `Chat.tsx` | ✅ Complete | Rider ↔ customer |
| Not Found | `not-found.tsx` | ✅ Complete | |

---

## 7. Vendor App — Screen Status
## 7. وینڈر ایپ — اسکرین حالت

Framework: **React + Vite** | Port: varies (dev)

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Login | `Login.tsx` | ✅ Complete | |
| Dashboard | `Dashboard.tsx` | ✅ Complete | Revenue, orders summary |
| Products | `Products.tsx` | ✅ Complete | CRUD, images |
| Orders | `Orders.tsx` | ✅ Complete | Accept, ready, dispatch |
| Store Settings | `Store.tsx` | ✅ Complete | Hours, delivery zone |
| Analytics | `Analytics.tsx` | ⚠️ Partial | Charts upgrade task open |
| Campaigns | `Campaigns.tsx` | ✅ Complete | Promo campaigns |
| Promotions | `Promos.tsx` | ✅ Complete | Discount codes |
| Reviews | `Reviews.tsx` | ✅ Complete | Rating responses |
| Chat | `Chat.tsx` | ✅ Complete | Customer ↔ vendor |
| Wallet | `Wallet.tsx` | ✅ Complete | Balance, payout requests |
| Notifications | `Notifications.tsx` | ✅ Complete | |
| Profile | `Profile.tsx` | ✅ Complete | Business info, KYC |
| Not Found | `not-found.tsx` | ✅ Complete | |

---

## 8. API Server — Route Status
## 8. API سرور — روٹ حالت

Base URL: `http://localhost:5000` (dev) | `https://<domain>` (prod)  
Auth: Bearer JWT for all `/api/admin/*` routes

### 8.1 Public Routes

| Route Group | Path | Status |
|-------------|------|--------|
| Health | `GET /api/health` | ✅ Complete |
| Auth (customer) | `POST /api/auth/*` | ✅ Complete |
| Platform Config | `GET /api/platform-config` | ✅ Complete |
| Public Vendors | `GET /api/vendors/*` | ✅ Complete |
| Products | `GET /api/products/*` | ✅ Complete |
| Categories | `GET /api/categories/*` | ✅ Complete |
| Banners | `GET /api/banners/*` | ✅ Complete |
| Promotions | `GET /api/promotions/*` | ✅ Complete |
| Deep Links | `GET /api/deep-links/*` | ✅ Complete |
| Weather Config | `GET /api/weather-config` | ✅ Complete |
| Push Notifications | `/api/push/*` | ✅ Complete |
| Recommendations | `GET /api/recommendations/*` | ✅ Complete |
| Delivery Eligibility | `GET /api/delivery-eligibility/*` | ✅ Complete |

### 8.2 Authenticated Customer Routes

| Route Group | Status | Notes |
|-------------|--------|-------|
| Orders (`/api/orders/*`) | ✅ Complete | CRUD, status, COD |
| Rides (`/api/rides/*`) | ✅ Complete | Book, track, rate, SOS |
| Pharmacy (`/api/pharmacy/*`) | ✅ Complete | |
| Parcel (`/api/parcel/*`) | ✅ Complete | |
| Van (`/api/van/*`) | ✅ Complete | |
| Wallet (`/api/wallet/*`) | ✅ Complete | Top-up, P2P, history |
| Payments (`/api/payments/*`) | ✅ Complete | JazzCash, EasyPaisa, wallet, COD |
| KYC (`/api/kyc/*`) | ✅ Complete | Document upload, status |
| Support Chat (`/api/support-chat/*`) | ✅ Complete | |
| Reviews (`/api/reviews/*`) | ✅ Complete | |
| Wishlist (`/api/wishlist/*`) | ✅ Complete | |
| Addresses (`/api/addresses/*`) | ✅ Complete | |
| Maps (`/api/maps/*`) | ✅ Complete | Geocode, directions |
| Notifications (`/api/notifications/*`) | ✅ Complete | |
| Error Reports (`/api/error-reports/*`) | ✅ Complete | |
| Stats (`/api/stats/*`) | ✅ Complete | |
| School (`/api/school/*`) | ⚠️ Partial | Feature-flagged |
| Variants (`/api/variants/*`) | ✅ Complete | |
| Uploads (`/api/uploads/*`) | ✅ Complete | Image upload |

### 8.3 Rider Routes

| Route Group | Status |
|-------------|--------|
| Rider Auth (`/api/rider/*`) | ✅ Complete |

### 8.4 Admin Routes (`/api/admin/*`)

| Route Group | Path | Status | Notes |
|-------------|------|--------|-------|
| System / Settings | `/api/admin/system/*` | ✅ Complete | Platform settings CRUD, backup/restore |
| Integration Tests | `/api/admin/system/test-integration/:type` | ✅ Complete | email/sms/whatsapp/fcm/maps |
| Launch Control | `/api/admin/launch/*` | ✅ Complete | Feature flags, vendor plans, mode switch |
| Users | `/api/admin/system/users/*` (in system.ts) | ✅ Complete | |
| Vendors | `/api/admin/vendors/*` | ✅ Complete | |
| Orders | `/api/admin/orders/*` | ✅ Complete | |
| Rides | `/api/admin/rides/*` | ✅ Complete | |
| Pharmacy | `/api/admin/pharmacy/*` | ✅ Complete | |
| Parcel | `/api/admin/parcel/*` | ✅ Complete | |
| Van | `/api/admin/van/*` | ✅ Complete | |
| Products | `/api/admin/products/*` | ✅ Complete | |
| Categories | `/api/admin/categories/*` | ✅ Complete | |
| Finance | `/api/admin/finance/*` | ✅ Complete | GST, payouts, settlements |
| Fleet | `/api/admin/fleet/*` | ✅ Complete | Rider management |
| KYC | `/api/admin/kyc/*` | ⚠️ Partial | Improvements task open |
| Promotions | `/api/admin/promotions/*` | ✅ Complete | |
| Banners | `/api/admin/banners/*` | ✅ Complete | |
| Communication | `/api/admin/communication/*` | ✅ Complete | AI messaging |
| SOS | `/api/admin/system/sos/*` | ✅ Complete | Real-time socket |
| Support Chat | `/api/admin/support-chat/*` | ✅ Complete | |
| Deep Links | `/api/admin/deep-links/*` | ✅ Complete | |
| QR Codes | `/api/admin/qr-codes/*` | ✅ Complete | |
| Loyalty | `/api/admin/loyalty/*` | ✅ Complete | |
| OTP | `/api/admin/otp/*` | ✅ Complete | |
| Delivery Access | `/api/admin/delivery-access/*` | ✅ Complete | |
| Experiments | `/api/admin/experiments/*` | ✅ Complete | |
| Conditions | `/api/admin/conditions/*` | ⚠️ Partial | Van driver rules bug open |
| Popups | `/api/admin/popups/*` | ✅ Complete | |
| FAQs | `/api/admin/faq/*` | ✅ Complete | |
| Weather Config | `/api/admin/weather-config` | ✅ Complete | |
| Webhooks | `/api/admin/webhook-registrations/*` | ✅ Complete | |
| Wishlist Analytics | `/api/admin/wishlist-analytics/*` | ✅ Complete | |
| Payments Test | `/api/payments/test-connection/:gateway` | ✅ Complete | |
| Notifications | `/api/admin/notifications/*` | ✅ Complete | |
| Whitelist | `/api/admin/whitelist/*` | ✅ Complete | IP management |
| Role Presets | `/api/admin/launch/role-presets/*` | ✅ Complete | |

---

## 9. Feature Toggle Reference
## 9. فیچر ٹوگل حوالہ

All toggles are managed in **Settings → Launch Control** (or platform_settings DB table).  
Default values are set by AI-recommended configuration.

### Services
| Key | Label | Default | Status |
|-----|-------|---------|--------|
| `feature_mart` | Mart (e-commerce) | on | ✅ |
| `feature_food` | Food Delivery | on | ✅ |
| `feature_rides` | Rides | on | ✅ |
| `feature_pharmacy` | Pharmacy | on | ✅ |
| `feature_parcel` | Parcel Delivery | on | ✅ |
| `feature_van` | Van Hire | on | ✅ |
| `feature_school` | School Transport | off | ⚠️ Partial |
| `feature_weather` | Weather Widget | on | ✅ |
| `feature_chat` | In-App Chat | off | ⚠️ Off by default |

### Payments
| Key | Label | Default |
|-----|-------|---------|
| `cod_enabled` | Cash on Delivery | on |
| `jazzcash_enabled` | JazzCash | off |
| `easypaisa_enabled` | EasyPaisa | off |
| `bank_enabled` | Bank Transfer | off |
| `feature_wallet` | Wallet | on |

### Security
| Key | Label | Default |
|-----|-------|---------|
| `security_phone_verify` | Phone OTP Required | on |
| `security_otp_bypass` | OTP Bypass (dev) | off |
| `security_mfa_required` | Admin MFA (TOTP) | off |
| `user_require_approval` | Manual User Approval | off |
| `security_audit_log` | Audit Logging | on |

### Integrations
| Key | Label | Default |
|-----|-------|---------|
| `integration_push_notif` | Firebase FCM | off |
| `integration_sms` | SMS Gateway | off |
| `integration_email` | Email/SMTP | off |
| `integration_whatsapp` | WhatsApp Business | off |
| `integration_maps` | Maps API | off |
| `integration_analytics` | Analytics | off |
| `integration_sentry` | Sentry | off |

---

## 10. Known Issues & TODOs
## 10. معلوم مسائل اور ٹودو

| # | Issue | Component | Severity |
|---|-------|-----------|----------|
| 1 | Admin broadcast role filtering not working correctly | Admin → Broadcast page | 🔴 High |
| 2 | Van Driver metrics & condition rules have display/logic bugs | Rider App → VanDriver, Admin → Condition Rules | 🔴 High |
| 3 | KYC review improvements needed (better UX, verification flow) | Admin → KYC | 🟡 Medium |
| 4 | Analytics charts in Vendor App need upgrade | Vendor App → Analytics | 🟡 Medium |
| 5 | Integration test results not persisted (lost on page reload) | Admin → Settings → Integrations | 🟢 Low |
| 6 | No live API latency shown in Integration Health panel | Admin → Settings → Integrations | 🟢 Low |
| 7 | Payment gateway settings accessible only under Settings → Payment, not Settings → Integrations tab | Admin → Settings | 🟢 Low |

---

## 11. Open Tasks
## 11. کھلے کام

| # | Task | Status | Priority |
|---|------|--------|----------|
| T1 | Admin Panel Complete Testing & Bug Fix | 🔄 In Progress | 🔴 High |
| T2 | Integration Health-Check Dashboard | ✅ Complete | — |
| T3 | Create admin-config.md Live Status Tracker | ✅ Complete | — |
| T4 | Fix Admin Broadcast Role Filtering | ⏳ Pending | 🔴 High |
| T5 | Analytics Charts & Visualizations Upgrade | ⏳ Pending | 🟡 Medium |
| T6 | Fix Van Driver Metrics & Condition Rules | ⏳ Pending | 🔴 High |
| T7 | KYC Review & Verification Improvements | ⏳ Pending | 🟡 Medium |
| T8 | Show Live API Latency in Integration Health Panel | ⏳ Pending | 🟢 Low |
| T9 | Add Payment Gateway Section in Integrations Tab | ⏳ Pending | 🟢 Low |
| T10 | Persist Integration Test History | ⏳ Pending | 🟢 Low |

---

## 12. How to Keep This File Updated
## 12. اس فائل کو اپ ڈیٹ رکھنے کا طریقہ

This is a **static document** — it must be updated manually when:

1. **A task completes** → update the Open Tasks table (change ⏳ to ✅)
2. **A new page/screen is added** → add a row to the relevant section
3. **An integration is configured** → change ❌ Missing → ✅ or ⚠️ Partial in Section 3
4. **A feature toggle default changes** → update Section 9

### Update Command (run from project root)

```bash
# Check what pages exist in each app:
ls artifacts/admin/src/pages/
ls artifacts/ajkmart/app/
ls artifacts/rider-app/src/pages/
ls artifacts/vendor-app/src/pages/

# Check API routes:
ls artifacts/api-server/src/routes/
ls artifacts/api-server/src/routes/admin/

# Count open TODOs in admin pages:
grep -rn "TODO\|FIXME" artifacts/admin/src/pages/ | wc -l
```

### Periodic Verification (Monthly)

Run this quick check at the start of each month to catch status drift:

- [ ] Verify all ✅ Complete items in Sections 4–8 still have working code (no deleted files)
- [ ] Re-run integration tests from Admin → Settings → Integrations health panel
- [ ] Check Open Tasks (Section 11) against actual project task list and update statuses
- [ ] Update "Last updated" date at top of file

### Naming Convention for Status Changes

When editing this file, always update the **Last updated** date at the top using `YYYY-MM-DD` format.

```markdown
> **Last updated:** YYYY-MM-DD
```

### Integration Health Panel

The admin panel has a live **Integration Health Panel** at the top of  
**Settings → Integrations** that automatically reflects credential status  
from the platform settings database — check that panel for real-time  
integration status before updating this document.

---

*This document is maintained by the AJKMart development team.*  
*یہ دستاویز AJKMart ترقیاتی ٹیم کے ذریعہ برقرار رکھی جاتی ہے۔*
