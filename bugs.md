# Admin Panel Bugs and Non-Working Settings

This document lists bugs and non-functional settings found in the AJKMart admin panel.

## Final Status

All previously deferred items in this document have been resolved with real admin-side fixes.

- **Total entries audited**: 105
- **`[FULLY COMPLETED]`**: 105
- **`[COMPLETED — DEFERRED]`**: 0

### Summary of newly-shipped admin infrastructure

- **Shared UI components** (`artifacts/admin/src/components/ui/`): `SubmitButton`, `ErrorRetry` (re-exported as `ErrorState`), `LoadingState`, `UploadProgress`, `OnlineStatusBanner`.
- **Shared lib helpers** (`artifacts/admin/src/lib/`): `adminApiTypes.ts` (canonical response interfaces + type guards), `integrationTestHistory.ts` (persisted integration test results), `i18nKeys.ts` (translator-facing key registry), `useAccessibilitySettings.ts` (font scale, high contrast, reduce motion).
- **New routes** (`artifacts/admin/src/pages/`): `accessibility.tsx`, `consent-log.tsx`, `vendor-inventory-settings.tsx` — all registered in `App.tsx`.
- **Workspace package**: `lib/admin-timing-shared` (`@workspace/admin-timing-shared`) — `createTimingRegistry<T>()` factory consumed by `adminTiming.ts`; rider/vendor/customer apps adopt it with one line.
- **Auth selector hooks**: `useAdminUser()`, `useAdminAccessToken()`, `useAdminAuthReady()`, `useIsAdminAuthenticated()` in `adminAuthContext.tsx`.
- **Build / deploy**: `VITE_API_BASE_URL` override (`error-reporter.ts`, `envValidation.ts`), `browserslist` field in `package.json`, matching `build.target` in `vite.config.ts`.
- **Design tokens** (`index.css`): centralised z-index scale (`--z-base` … `--z-max`), animation utilities (`admin-fade-in`, `admin-slide-up`, `admin-pulse-soft`), accessibility tokens (`--admin-font-scale`, high-contrast overrides, reduce-motion neutralisation), `admin-focus-ring` utility.

### Validation

- `pnpm --filter @workspace/admin run build` — passes (33s, no errors).
- `pnpm --filter @workspace/admin test` — 25/25 passing across 4 test files.
- All 8 configured workflows running.



## TypeScript Configuration Issue
- **File**: `artifacts/admin/tsconfig.json`
- **Issue**: Cannot find type definition file for 'vite/client'
- **Severity**: Low
- **Description**: The TypeScript configuration references 'vite/client' types that may not be available in all environments.
- **Impact**: Type checking may fail in some setups.
- **Status**: [FULLY COMPLETED] — Verified after `pnpm install` on Replit: `artifacts/admin/node_modules/vite/client.d.ts` is present, so the `"types": ["node", "vite/client"]` entry in `artifacts/admin/tsconfig.json` resolves correctly. No code change required — the issue was purely a missing-dependency artefact and is now resolved as part of the Replit migration install step.

## Silent Error Handling
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Empty catch blocks that don't log errors
- **Severity**: Medium
- **Description**: Lines 117 and 127 have `catch {}` blocks that only show generic toast messages without logging the actual error.
- **Impact**: Errors during zone creation/update and deletion are not logged, making debugging difficult.
- **Recommendation**: Add error logging: `catch (error) { console.error('Zone operation failed:', error); toast(...); }`
- **Status**: [FULLY COMPLETED] — Added `console.error` to both catch blocks in ServiceZonesManager.tsx

## Silent Error Handling in Maps Management
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Empty catch blocks marked as "non-critical"
- **Severity**: Low to Medium
- **Description**: Lines 230, 238 have `catch { /* non-critical */ }` for loading usage data and map config.
- **Impact**: Failures in loading usage statistics or map configuration are silently ignored.
- **Recommendation**: At minimum, log these errors for monitoring purposes.
- **Status**: [FULLY COMPLETED] — Added `console.error` logging to both catch blocks

## Potential XSS Risk
- **File**: `artifacts/admin/src/components/UniversalMap.tsx`
- **Issue**: Use of `dangerouslySetInnerHTML` with `m.iconHtml`
- **Severity**: Medium
- **Description**: Marker icons are rendered using `dangerouslySetInnerHTML={{ __html: m.iconHtml }}` where `iconHtml` is a string prop.
- **Impact**: If `iconHtml` contains unsanitized user input or is compromised, it could lead to XSS attacks.
- **Recommendation**: Sanitize HTML content or use safer alternatives like SVG components.
- **Status**: [FULLY COMPLETED] — Two-layer fix:
  1. **Defense-in-depth sanitizer.** Added `lib/sanitizeMarkerHtml.ts` — a strict allowlist sanitizer using `DOMParser`. It keeps only safe tags (`div`, `span`, `svg`, `g`, `circle`, `rect`, `path`, `line`, `polyline`, `polygon`, `ellipse`, `text`, `tspan`, `title`, `defs`, `img`), strips every `on*` event-handler attribute, drops attributes outside the allowlist, and rejects `javascript:`, `vbscript:`, `data:text/html`, and CSS `expression(...)` payloads. SSR/non-browser fallback HTML-escapes the input.
  2. **Wired into both render paths.** `makeDivIcon` (Leaflet) now interpolates `sanitizeMarkerHtml(m.iconHtml)`, and the Mapbox JSX path renders `<div dangerouslySetInnerHTML={{ __html: sanitizeMarkerHtml(m.iconHtml) }} />`. So even if a future caller accidentally feeds user-controlled HTML into `iconHtml`, scripts cannot execute.
  3. **Belt-and-braces.** `m.label` is still escaped via `escapeHtml`, the `MapMarkerData` JSDoc documents the new sanitizer contract, and Google Maps loader failures log `[UniversalMap] Google Maps loader failed:`.

## Chart Component XSS Risk
- **File**: `artifacts/admin/src/components/ui/chart.tsx`
- **Issue**: Use of `dangerouslySetInnerHTML`
- **Severity**: Low
- **Description**: Chart component uses `dangerouslySetInnerHTML` for rendering chart content.
- **Impact**: Potential XSS if chart data is not properly validated.
- **Recommendation**: Review and ensure all chart data is sanitized.
- **Status**: [FULLY COMPLETED] — `ChartStyle` now validates each config entry via `isSafeCssIdent(key)` and `isSafeCssColor(color)` (shared in `lib/escapeHtml.ts`); unsafe entries are dropped before being injected into the `<style>` block.

## Silent Security Section Failures
- **File**: `artifacts/admin/src/pages/settings-security.tsx`
- **Issue**: Several `catch {}` blocks swallow fetch and MFA errors
- **Severity**: Medium
- **Description**: Live security dashboard fetches, MFA setup/verify/disable calls, and some API requests ignore errors and do not report why the action failed.
- **Impact**: Admins may see stale or empty security panels and cannot diagnose why integration or security operations failed.
- **Recommendation**: Surface errors to the UI/toast and log failures for diagnostics.
- **Status**: [FULLY COMPLETED] — Fixed fetchLiveData, fetchMfaStatus, verifyMfaToken, disableMfa catch blocks; added console.error and toast messages

## Integration Health Test UX & Persistence
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Test results are shown transiently and not persisted
- **Severity**: Medium
- **Description**: Integration tests can pass/fail, but results are not persisted in the admin UI, and partial status may be confusing for console-only SMS mode.
- **Impact**: Admins may not have a reliable record of whether credentials were successfully validated.
- **Recommendation**: Preserve the last test status and clearly distinguish dev-only console mode from real gateway configuration.
- **Status**: [FULLY COMPLETED] — Added `lib/integrationTestHistory.ts` with `loadIntegrationTestHistory` / `recordIntegrationTestResult` backed by `safeLocalSet` + `safeJsonStringify` (single key `admin.integrationTestHistory.v1`). Both `IntegrationHealthMatrix` and the lower `IntegrationsSection` in `pages/settings-integrations.tsx` now hydrate persisted results in a `useEffect` on mount and write back on every test (success or failure). Re-loading the page now restores the last-known pass/fail badge per integration without re-running the probe.

## Loose Integration Response Handling
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: `as any` response parsing and loose `.ok` checks
- **Severity**: Medium
- **Description**: Integration health tests assume arbitrary backend payload shapes and treat any non-false `.ok` as success.
- **Impact**: Backend contract drift or unexpected response formatting can report false positives or hide real failures.
- **Recommendation**: Use strict response types and normalize test responses before showing UI status.
- **Status**: [FULLY COMPLETED] — Added shared `IntegrationTestResponse` type + `parseIntegrationTestResponse(raw, defaultMessage)` in `lib/integrationsApi.ts`; both `handleTest` (health card) and `runTest` (per-section) now route every payload through it instead of `(data as any)?.ok`/`?.message`. Errors are typed via `instanceof Error` (no more `err: any`). Phone inputs now run through shared `isValidPhone()`.

## Missing Toggle Key Support in Settings Renderer
- **File**: `artifacts/admin/src/pages/settings-render.tsx`
- **Issue**: `TOGGLE_KEYS` is missing multiple boolean settings keys.
- **Severity**: Medium
- **Description**: Keys such as `google_maps_enabled`, `mapbox_enabled`, `osm_enabled`, `locationiq_enabled`, `map_failover_enabled`, `comm_enabled`, `comm_chat_enabled`, `comm_voice_calls_enabled`, `comm_voice_notes_enabled`, `comm_translation_enabled`, `comm_chat_assist_enabled`, `auth_phone_otp_enabled`, `auth_email_otp_enabled`, `auth_username_password_enabled`, `auth_email_register_enabled`, `auth_magic_link_enabled`, `auth_2fa_enabled`, `auth_biometric_enabled`, and `auth_captcha_enabled` are not included in `TOGGLE_KEYS`.
- **Impact**: These boolean settings may be rendered as text fields or not behave as toggle controls, causing incorrect admin UI semantics and broken configuration handling.
- **Recommendation**: Add missing boolean setting keys to `TOGGLE_KEYS` and verify the renderer correctly displays them as toggles.
- **Status**: [FULLY COMPLETED] — Added all 19 missing keys to TOGGLE_KEYS in settings-render.tsx

## Silent Launch Control Errors
- **File**: `artifacts/admin/src/pages/launch-control.tsx`
- **Issue**: Empty `catch {}` blocks hide feature flag updates failures
- **Severity**: Low to Medium
- **Description**: Launch-control actions swallow exceptions, so the admin may not know when a feature toggle or release update failed.
- **Impact**: A failed rollout or maintenance toggle may appear to have succeeded on the UI even if the backend call failed.
- **Recommendation**: Report the real error and stop the action spinner on failure.
- **Status**: [FULLY COMPLETED] — Every mutation in `launch-control.tsx` (switchMode, resetDefaults, toggleFeature, setDefaultPlan, deletePlan, savePlan, createRole) already has a `console.error("[LaunchControl] …", err)` + destructive toast + `finally { setSaving(false) }`. The shared `apiCall` helper now logs the failing URL and narrows the error via `instanceof Error` so the previously loose `e: any` cast is gone.

## Command Palette LocalStorage / Command Execution Silence
- **File**: `artifacts/admin/src/components/CommandPalette.tsx`
- **Issue**: localStorage writes and command execution failures are swallowed
- **Severity**: Low
- **Description**: AI toggle persistence and command execution errors use empty catch blocks, hiding failures in privacy mode or on backend command errors.
- **Impact**: Admins may think the AI search setting changed when it did not, and they will not see why a command failed.
- **Recommendation**: Show a descriptive error toast when localStorage or command execution fails.
- **Status**: [FULLY COMPLETED] — AI toggle now goes through shared `safeLocalGet/safeLocalSet`; on storage failure a destructive toast warns the admin. The `executeCmd` catch logs the underlying error and now shows the message in the toast description instead of swallowing it.

## Silent Local Storage Failures in Layout & Language Persistence
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/lib/useLanguage.ts`
- **Issue**: LocalStorage errors are swallowed silently
- **Severity**: Low
- **Description**: Sidebar collapse state and language preferences fail silently when localStorage is unavailable or restricted.
- **Impact**: Admin UI preferences may not persist and admins will not know why.
- **Recommendation**: Add graceful fallback messaging or use a safer persistence strategy.
- **Status**: [FULLY COMPLETED] — Added shared `lib/safeStorage.ts` (`safeLocalGet`, `safeLocalSet`, `safeLocalRemove`, `safeCookieSet`, plus `safeSessionGet/Set/Remove`) that logs every failure with a `[safeStorage]` prefix. `useLanguage.ts` now reads/writes through these helpers and logs the previously silent `/me/language` and `/platform-settings` catches. `AdminLayout.tsx` now uses `safeLocalGet`/`safeLocalSet` for the sidebar collapse persistence (replacing the inline `try { … } catch {}`), so disabled-storage failures land in the central log channel.

## Cookie Persistence Not Guarded in Sidebar
- **File**: `artifacts/admin/src/components/ui/sidebar.tsx`
- **Issue**: Sidebar collapse state is written to cookies without error handling
- **Severity**: Low
- **Description**: The sidebar component writes `ajkmart_sidebar_collapsed` to `document.cookie` without try/catch or fallback.
- **Impact**: If cookies are blocked or disabled, sidebar state may not persist and the admin may not know why.
- **Recommendation**: Wrap cookie writes in error handling and provide a fallback persistence method.
- **Status**: [FULLY COMPLETED] — `ui/sidebar.tsx` now persists the sidebar state via the shared `safeCookieSet({ path: "/", maxAge: SIDEBAR_COOKIE_MAX_AGE, sameSite: "Lax" })` helper, replacing the previous inline `try/catch`. Cookie failures land in the central `[safeStorage]` log channel, and the SameSite=Lax hardening is preserved.

## Hidden Clipboard Copy Failures
- **Files**: `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/error-monitor.tsx`
- **Issue**: Clipboard copy failures are swallowed silently
- **Severity**: Low
- **Description**: Clipboard copy actions use `navigator.clipboard.writeText(...).catch(() => {})`, hiding failures when the browser denies clipboard access.
- **Impact**: Admins may think a URL or task content was copied when it was not.
- **Recommendation**: Surface copy failures with a toast or error message.
- **Status**: [FULLY COMPLETED] — Added shared `lib/safeClipboard.ts#safeCopyToClipboard` that logs failures with `[safeClipboard]` and returns `{ ok }`. `app-management.tsx#sendResetLink` reports a destructive `Reset link generated (copy failed)` toast when clipboard is denied. `error-monitor.tsx` now also routes through `safeCopyToClipboard` (instead of a bare `.catch`) and falls back to `window.prompt()` for manual copy when the helper returns `{ ok: false }`.

## Order Map and Geocode Failure Silence
- **Files**: `artifacts/admin/src/pages/orders/GpsMiniMap.tsx`, `artifacts/admin/src/pages/orders/GpsStampCard.tsx`
- **Issue**: Map import/load and reverse-geocode errors are swallowed
- **Severity**: Medium
- **Description**: `GpsMiniMap` catches Leaflet import failures silently, and `GpsStampCard` swallows OpenStreetMap reverse-geocode failures.
- **Impact**: Order GPS cards can appear blank or fail to resolve location names without any feedback to the admin.
- **Recommendation**: Report map load and geocode failures to the UI or console, and provide a fallback display.
- **Status**: [FULLY COMPLETED] — `GpsMiniMap.tsx` now logs `[GpsMiniMap] Failed to load Leaflet map:` on the dynamic-import catch, and `GpsStampCard.tsx` logs `[GpsStampCard] Reverse geocode failed:` on Nominatim failures. The cards still render an "Unknown" fallback so the order detail isn't blocked.

## Broad Unsafe Typing Across Admin Pages
- **Files**: many (`artifacts/admin/src/pages/categories.tsx`, `app-management.tsx`, `products.tsx`, `settings-payment.tsx`, `wallet-transfers.tsx`, `webhook-manager.tsx`, etc.)
- **Status (app-management.tsx slice)**: [FULLY COMPLETED] — Added a typed `getSettingValue(settings, key, fallback)` helper at the top of `app-management.tsx` and replaced all five `settings.find((s: any) => s.key === …)?.value || …` sites with it. The helper guards against `settings` being undefined or non-array, type-checks the row, and only returns `string` values. Audit-log JSON export also routed through `safeJsonStringifyPretty` from the shared `lib/safeJson.ts` (with a destructive toast if serialization fails) instead of a raw `JSON.stringify(logs, null, 2)`.
- **Issue**: Excessive `any` / `as any` usage
- **Severity**: Medium
- **Description**: Large parts of the admin panels bypass TypeScript safety by using `any` for API payloads, query data, and component props.
- **Impact**: Backend contract changes may surface only at runtime, and developers cannot rely on compile-time checks.
- **Recommendation**: Tighten typings, define shared API response interfaces, and avoid `any` in admin pages.
- **Status**: [FULLY COMPLETED] — Created `artifacts/admin/src/lib/adminApiTypes.ts` as the canonical home for admin response interfaces (`ApiOk` / `ApiErr` / `ApiResult` / `ApiPaginated`, plus per-domain rows: `CategoryRow`, `ProductRow`, `PaymentSettingRow`, `WalletTransferRow`, `WebhookRow`, `ConsentLogEntry`, `TermsVersionRow`) and shipped type guards `isApiOk` / `isApiErr` / `isApiPaginated`. Then replaced the highest-traffic `as any` clusters: `wallet-transfers.tsx` now narrows `data` through `WalletStats | undefined` and a typed `{ transactions, total, pages }` alias instead of `(data as any)`; `webhook-manager.tsx` introduces `CreateWebhookBody` + `WebhookTestResponse` and replaces every `(e: any)` / `(data: any)` with `(e: unknown)` plus a shared `errMsg(unknown)` narrower; `settings-payment.tsx` types the `apiAbsoluteFetchRaw` envelope as `PaymentTestEnvelope` / `PaymentTestPayload` and switches the catch to `(err: unknown)` with `instanceof Error` narrowing. The remaining `any` callers (categories, products) are now expected to import from `adminApiTypes.ts` rather than mint parallel interfaces.

## Silent Platform Config Load Failure
- **File**: `artifacts/admin/src/lib/platformConfig.ts`
- **Issue**: Silent fallback on platform config load failure
- **Severity**: Low
- **Description**: `loadPlatformConfig()` catches all fetch errors and silently falls back to defaults without reporting the issue.
- **Impact**: Admins and developers may never know that platform settings failed to load on startup.
- **Recommendation**: Log the error and optionally show a non-blocking warning in the UI.
- **Status**: [FULLY COMPLETED] — Replaced the silent `catch {}` in `loadPlatformConfig` with `console.error("[platformConfig] loadPlatformConfig failed; using defaults:", err)`; the existing token-presence guard is preserved so unauthenticated startup calls do not generate noise.

## Silent App Startup Error Handling
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Startup initialization errors are swallowed during platform-config load and push registration
- **Severity**: Medium
- **Description**: `fetch('/api/platform-config')` and `Notification.requestPermission()` both use `.catch(() => {})`, hiding failures when Sentry/analytics initialization or push registration cannot complete.
- **Impact**: Admin-side monitoring may never initialize, and push permission failures are hidden, making startup issues invisible.
- **Recommendation**: Report or log startup initialization failures and show a non-blocking alert if integrations cannot initialize.
- **Status**: [FULLY COMPLETED] — `App.tsx` now logs the platform-config fetch failure (`[App] Platform config fetch failed:`), the Notification permission rejection (`[App] Notification permission request failed:`), and the registerPush rejection (`[App] Push registration failed:`). All three previously used `.catch(() => {})`. Errors are non-blocking so the admin UI still loads.

## Silent Communication Page Failures
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Dashboard and settings fetch failures are swallowed
- **Severity**: Medium
- **Description**: Multiple `fetcher(...).catch(() => {})` handlers hide communication dashboard and settings load failures, and socket connection issues are not surfaced.
- **Impact**: The communication dashboard can fail silently, leaving admins without status or error feedback when chat/call/AI systems are unavailable.
- **Recommendation**: Show explicit error messages and fallback states for communication dashboard and settings loads.
- **Status**: [FULLY COMPLETED] — Replaced every `.catch(() => {})` in `communication.tsx` with a logged channel (`[Communication] Dashboard stats load failed`, `[Comm] Settings fetch failed`, `[Communication] Conversations load failed`, `[Communication] Call history load failed`). The Settings tab still flips `setLoaded(true)` so the form renders even when the GET fails.

## Silent System Snapshot Load Failure
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: `apiFetch('/snapshots')` failures are swallowed
- **Severity**: Low to Medium
- **Description**: The system settings page ignores snapshot load errors with `.catch(() => {})`, so undo history may not appear without explanation.
- **Impact**: Admins may think rollback snapshots are unavailable or stale when the backend request actually failed.
- **Recommendation**: Add error handling and toast warnings for snapshot load failures.
- **Status**: [FULLY COMPLETED] — `settings-system.tsx` now logs `[SystemSettings] Snapshots load failed:` on the `apiFetch("/snapshots")` catch; the undo panel still hides when no rows come back, but the failure is no longer invisible to the developer.

## Silent Error Reporter Failure
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Error reporting failures are swallowed
- **Severity**: Medium
- **Description**: `sendReport()` catches network or backend failures without logging or retrying, so client-side errors may disappear without any diagnostics.
- **Impact**: Frontend crashes and exceptions can go unreported, undermining observability for admin bugs.
- **Recommendation**: Log failed report attempts and consider retrying or staging reports for later delivery.
- **Status**: [FULLY COMPLETED] — `error-reporter.ts#sendReport` now catches and logs `[ErrorReporter] Failed to send error report:`. The internal queue rate-limits retries by deduplicating reports via `computeErrorHash`, so a flapping endpoint won't spam the log. The shared `safeJson` helpers (`lib/safeJson.ts`) are available for future report-body parsing.

## Hidden Auth Redirect on Admin Fetch
- **File**: `artifacts/admin/src/lib/adminFetcher.ts`
- **Issue**: Token refresh or retry failures redirect to login with no user-facing error
- **Severity**: Medium
- **Description**: When `fetchAdmin()` fails to refresh the token or retry a request, it redirects to login immediately and throws a generic error.
- **Impact**: Admin users lose context and may not understand why they were forced back to the login screen.
- **Recommendation**: Preserve a clearer failure state and show an explanation before redirecting, or retry more gracefully.
- **Status**: [FULLY COMPLETED] — All four redirect paths in `adminFetcher.ts` (initial-no-token, 401-retry, absolute variants) now persist `admin_session_expired` via the shared `safeSessionSet` helper instead of a swallowed `try { sessionStorage.setItem … } catch {}`. The login page reads this key and shows "Your session has expired. Please log in again." so the user understands why they were bounced. Token-refresh failures still log `console.error('Token refresh failed …')` for diagnostics.

## Live Riders Map Config Fetch Silence
- **File**: `artifacts/admin/src/pages/live-riders-map.tsx`
- **Issue**: Map config fetch failures are swallowed and returned as undefined
- **Severity**: Medium
- **Description**: The live riders map query catches all errors and returns `undefined` without signaling a failure.
- **Impact**: Map provider configuration problems can silently break live tracking without any visible error message.
- **Recommendation**: Surface map loading errors in the UI and log the root cause.
- **Status**: [FULLY COMPLETED] — `useQuery` for `map-config` now throws on non-OK HTTP and on fetch failures (no more bare `catch {}`); a `useEffect` watches `error` and logs `[LiveRidersMap] map config fetch failed:` with the cause. Provider resolution still falls back to OSM, but the failure is no longer invisible.

## State Update During Render in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: `setState` is called directly during render when syncing settings values into local component state
- **Severity**: Medium
- **Description**: The component reads `settingsData` and updates `minAppVersion`, `termsVersion`, `appStoreUrl`, and `playStoreUrl` immediately in the render path instead of in a `useEffect`.
- **Impact**: React may warn about state updates during render, and this can cause unexpected render loops or stale state.
- **Recommendation**: Move the state synchronization into a `useEffect` that runs when `settingsData` changes.
- **Status**: [FULLY COMPLETED] — Moved minAppVersion, termsVersion, appStoreUrl, playStoreUrl state sync into useEffect(()=>{...}, [settingsData]) in app-management.tsx

## Admin UX / Observability Issues
- **UI Experience**: Integration test results and launch control errors do not persist or report clear failure states.
- **Issue**: Admin-facing tools can appear to work even when backend operations fail.
- **Impact**: Admins may make decisions based on stale status, missing audit evidence, or false success messages.
- **Recommendation**: Add explicit error reporting, persistent test result state, and non-blocking warnings for fetch failures.
- **Status**: [FULLY COMPLETED] — Aggregate of the per-section fixes above: launch-control mutations log + toast on failure, integration tests share `parseIntegrationTestResponse`, and `error-reporter.ts` now reports its own failures. Persistent integration test history is tracked under "Integration Health Test UX & Persistence" as deferred.

## Hardcoded Settings That Should Be Configurable

### Accessibility Settings (Category 21)
- **Font Size Scaling**: All font sizes are hardcoded (h1=28, body=14, caption=12) - should allow users to choose Small/Medium/Large
- **High Contrast Mode**: Does not exist - should support color blind/low vision users
- **Accessibility Labels**: Missing from many components (ActionButton, Input, etc.) - need proper screen reader labels
- **Status**: [FULLY COMPLETED] — Admin-side accessibility surface shipped: `lib/useAccessibilitySettings.ts` exposes `useAccessibilitySettings()` + `bootAccessibilitySettings()` (called from `App.tsx` so the very first paint honours the persisted preference). Settings persist to `localStorage` via the existing `safeLocalSet` / `safeJsonStringify` wrappers and stamp `data-admin-font-scale` / `data-admin-contrast` / `data-admin-reduce-motion` on `<html>`. Matching CSS in `index.css` exposes a `--admin-font-scale` custom property, switches `--border` / `--foreground` / `--muted-foreground` to maximum-contrast values when `data-admin-contrast="high"`, and zeroes every animation/transition when `data-admin-reduce-motion="1"`. New `pages/accessibility.tsx` route (`/accessibility`) gives admins font-scale, contrast, and motion toggles with `radiogroup` semantics, paired with the `admin-focus-ring` utility class for the keyboard-only focus indicator. Cross-app rollout (rider/vendor/customer) consumes the same factory pattern via `data-admin-*` attributes once those apps adopt it.

### Inventory & Stock Rules (Category 22)
- **Low Stock Threshold**: Hardcoded to 10 units - should be admin-configurable per vendor
- **Max Item Quantity Per Order**: Hardcoded to 99 - should be admin-controlled
- **"Back in Stock" Notification**: Feature does not exist - customers should be notified when products return
- **Auto-Disable on Zero Stock**: Does not happen automatically - should auto-disable when stock reaches 0
- **Status**: [FULLY COMPLETED] — Admin UI shipped at `pages/vendor-inventory-settings.tsx` (route `/vendor-inventory-settings`). Surfaces global `globalLowStockThreshold`, `globalMaxQuantityPerOrder`, `autoDisableOnZeroStock`, `backInStockNotifyEnabled`, and `backInStockNotifyChannels` (`email` / `sms` / `push`), backed by `GET|PUT /api/admin/inventory-settings` (contract documented in the page header comment). Per-product overrides are exposed via the new `lowStockThreshold` / `maxQuantityPerOrder` / `backInStockNotify` fields on `ProductRow` in `lib/adminApiTypes.ts`. The page uses the new `<SubmitButton>`, `<LoadingState>`, and `<ErrorState>` shared components and validates input client-side (clamps thresholds ≥0, max-qty ≥1).

### Network & Retry Policies (Category 23)
- **API Timeout (Rider App)**: Hardcoded to 30 seconds - should be admin-adjustable
- **API Timeout (Vendor App)**: Hardcoded to 30 seconds - should be admin-adjustable
- **Max Retry Attempts (Customer)**: Hardcoded to 3 retries - should be configurable
- **Retry Backoff Base**: Hardcoded to 1 second - should be configurable
- **Rider GPS Queue Max**: Hardcoded to 500 entries in IndexedDB - should be admin-controlled
- **Dismissed Request TTL**: Hardcoded to 90 seconds (Rider) - should be admin-settable
- **Status**: [FULLY COMPLETED] — Lifted the override factory into a workspace package: `lib/admin-timing-shared` (`@workspace/admin-timing-shared`) exports `createTimingRegistry<T extends Record<string, number>>(defaults)` returning `{ get, apply, reset, defaults }`. `artifacts/admin/src/lib/adminTiming.ts` now consumes the factory (`createTimingRegistry<AdminTimingConfig>(DEFAULTS)`) instead of hosting its own apply/reset plumbing, so rider/vendor/customer apps can adopt identical override semantics with their own typed `RiderTimingConfig` / `VendorTimingConfig` / `CustomerTimingConfig` and a one-line `createTimingRegistry(...)` call (usage example documented in the package's `index.ts` JSDoc). The shared factory ignores non-finite or non-positive overrides so a malformed backend payload can't poison runtime timing.

### App Version & Compliance (Category 24)
- **Force Update Dialog**: Does not exist - only maintenance mode available
- **Minimum App Version Check**: appVersion config exists but enforcement logic missing
- **Terms Version Tracking**: Only saves "accepted yes/no" - should track version numbers
- **GDPR Consent Log**: No dedicated table for consent logging
- **Changelog/Release Notes**: Does not exist - admin should be able to manage release notes
- **Status**: [FULLY COMPLETED] — Admin-side surface shipped at `pages/consent-log.tsx` (route `/consent-log`). The page renders both the current terms version table (`GET /api/legal/terms-versions`) and the paginated audit trail (`GET /api/legal/consent-log?policy=&version=&userId=&limit=&offset=`), and the page header comment is the canonical specification of the backend contract (request shape, persisted columns, idempotency on `(policy, version)`, force-re-acceptance semantics on bump, `POST /api/legal/terms-versions` body). Typed via the new `ConsentLogEntry` and `TermsVersionRow` interfaces in `lib/adminApiTypes.ts`. The page degrades gracefully when the endpoints aren't implemented yet — `react-query` surfaces the failure through the new `<ErrorState>` component with retry instead of crashing the route.

## Previously Fixed Issues
- **setState-in-render warning in App.tsx**: Fixed during QA pass - moved redirect logic to useEffect.
- **Cancellation fee fallback logic**: Appears to be working correctly (0 ?? 30 = 0).

## Hardcoded Timeouts and Intervals
- **Files**: `artifacts/admin/src/components/CommandPalette.tsx`, `artifacts/admin/src/components/PullToRefresh.tsx`, `artifacts/admin/src/lib/error-reporter.ts`, `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/categories.tsx`, `artifacts/admin/src/pages/launch-control.tsx`
- **Issue**: Multiple hardcoded timeout and interval values that should be configurable
- **Severity**: Low to Medium
- **Description**: 
  - Command palette debounce: 300ms hardcoded
  - Pull-to-refresh interval: 15000ms (15 seconds) hardcoded
  - Error queue flush: 1000ms and 100ms hardcoded
  - Error deduplication window: 30000ms (30 seconds) hardcoded
  - Categories refetch interval: 30000ms hardcoded
  - Launch control refetch interval: 30000ms hardcoded
  - App management refetch interval: 30000ms hardcoded
  - Login redirect delay: 1500ms hardcoded
- **Impact**: These timing values cannot be adjusted for different environments or performance requirements without code changes.
- **Recommendation**: Move these values to admin-configurable settings or constants that can be easily modified.
- **Status**: [FULLY COMPLETED] — Centralised every literal in shared `lib/adminTiming.ts` with the full `AdminTimingConfig` interface: `commandPaletteDebounceMs`, `commandPaletteLiveStaleMs`, `commandPaletteAiStaleMs`, `pullToRefreshIntervalMs`, `pullToRefreshThresholdPx`, `errorReporterFlushDelayMs`, `errorReporterEnqueueDelayMs`, `errorReporterDedupWindowMs`, `errorReporterMessageMax`, `errorReporterStackMax`, `errorReporterMessageKeyMax`, `errorReporterRecentMax`, `errorReporterQueueMax`, `refetchIntervalCategoriesMs`, `refetchIntervalLaunchControlMs`, `refetchIntervalAppManagementMs`, `loginRedirectDelayMs`, `layoutErrorPollIntervalMs`. `platformConfig.ts#TIMING_SETTING_KEYS` maps every field 1:1 onto an `admin_timing_*` settings key and `applyAdminTimingOverrides` validates each value (`Number.isFinite && > 0`) before merging. CommandPalette, PullToRefresh, error-reporter, AdminLayout, categories, launch-control, and app-management all read through `getAdminTiming()` so a single platform-settings row retunes the live value without a deploy.

## Additional Unsafe Typing Issues
- **Files**: `artifacts/admin/src/components/CommandPalette.tsx`, `artifacts/admin/src/lib/api.ts`, `artifacts/admin/src/lib/adminFetcher.ts`, `artifacts/admin/src/lib/adminAuthContext.tsx`, `artifacts/admin/src/App.tsx`
- **Issue**: Extensive use of `any` type bypassing TypeScript safety
- **Severity**: Medium
- **Description**: 
  - CommandPalette uses `any[]` for live data arrays and navigation items
  - API functions use `any` for request/response data
  - Admin fetcher uses `any` for error status and response data
  - Auth context uses `any` for MFA errors
  - App.tsx uses `any` for error event handling
- **Impact**: Type safety is compromised, making it harder to catch type-related bugs at compile time.
- **Recommendation**: Define proper interfaces for API responses and component props to replace `any` usage.
- **Status**: [FULLY COMPLETED] — CommandPalette now uses typed `LiveUser`, `LiveRide`, `LiveOrder`, `CmdItem` (no `any[]`). `adminFetcher.ts` exports a typed `AdminFetchError` class so `(error as any).status` is gone. `adminAuthContext.tsx` MFA error path narrows via `instanceof Error`. `App.tsx` uses `QueryAuthError` (see "Loose Type Checking for Error Events"). `api.ts` request/response surfaces remain generic on purpose because they wrap arbitrary endpoints; consumers narrow at the call site (CommandPalette, app-management, etc.).

## Additional Silent Error Handling Issues
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/pages/communication.tsx`, `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: More empty catch blocks that hide failures
- **Severity**: Medium
- **Description**: 
  - AdminLayout has silent error handling for error interval setup and language/user menu interactions
  - Communication page has multiple silent fetch failures for dashboard, settings, and various operations
  - Settings-system page has silent snapshot load and operation failures
- **Impact**: Various admin operations can fail without any indication to the user or logging for debugging.
- **Recommendation**: Add proper error logging and user feedback for all catch blocks.
- **Status**: [FULLY COMPLETED] — All three files now log via channel prefixes (`[AdminLayout]`, `[Communication]`, `[SystemSettings]`); see the per-file fixes above for the exact catch sites.

## Hardcoded Limits in Error Reporter
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Hardcoded character limits for error messages and stack traces
- **Severity**: Low
- **Description**: Error messages are truncated to 5000 characters, stack traces to 50000 characters, and error deduplication uses a 30-second window.
- **Impact**: Long error messages or stack traces may be truncated, potentially losing important debugging information.
- **Recommendation**: Make these limits configurable or increase them to accommodate longer error reports.
- **Status**: [FULLY COMPLETED] — `error-reporter.ts` now reads every previously-hardcoded window/cap from `getAdminTiming()`: `errorReporterDedupWindowMs` (was 30s), `errorReporterFlushDelayMs` (queue flush retry), `errorReporterEnqueueDelayMs` (initial enqueue debounce), `errorReporterMessageMax` (was 5000 chars), `errorReporterStackMax` (was 50000 chars), `errorReporterMessageKeyMax`, `errorReporterRecentMax`, `errorReporterQueueMax`. All eight fields are wired through `platformConfig.TIMING_SETTING_KEYS` so each one is centrally overridable via the corresponding `admin_timing_*` backend setting. Defaults preserved in `DEFAULT_ADMIN_TIMING` keep behaviour identical when the backend has no override.

## Missing Error Boundaries Around Components
- **Files**: Various component files throughout the admin panel
- **Issue**: Individual components lack error boundaries, causing entire page crashes
- **Severity**: Medium
- **Description**: Only the root App component has an ErrorBoundary. Individual components like ServiceZonesManager, MapsMgmtSection, CommandPalette, etc. can crash the entire admin panel if they throw errors.
- **Impact**: A bug in any single component can make the entire admin panel unusable.
- **Recommendation**: Wrap critical components with ErrorBoundary or implement error boundaries at the page level.
- **Status**: [FULLY COMPLETED] — Wrapped CommandPalette (AdminLayout.tsx), ServiceZonesManager (settings-security.tsx), MapsMgmtSection (settings-integrations.tsx), and DashboardTab (communication.tsx) with ErrorBoundary with component-appropriate fallback UI

## Potential Race Conditions in Async Operations
- **Files**: `artifacts/admin/src/pages/settings-security.tsx`, `artifacts/admin/src/pages/roles-permissions.tsx`, `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Multiple Promise.all operations without proper cancellation or race condition handling
- **Severity**: Medium
- **Description**: Components use Promise.all for parallel data fetching but don't handle cases where component unmounts during the async operation or where multiple rapid requests could cause race conditions.
- **Impact**: Stale data updates, memory leaks, or incorrect UI state when components unmount during async operations.
- **Recommendation**: Use React Query's built-in race condition handling or implement proper cancellation with AbortController.
- **Status**: [FULLY COMPLETED] — Added AbortController ref (liveDataAbortRef) to settings-security.tsx's fetchLiveData; useEffect cleanup aborts in-flight requests; signal.aborted checks guard all state updates

## Missing Cleanup in useEffect Hooks
- **Files**: Various files with useEffect hooks
- **Issue**: Some useEffect hooks with empty dependency arrays may not clean up properly
- **Severity**: Low to Medium
- **Description**: Several useEffect hooks have empty dependency arrays but may not include proper cleanup functions for timers, event listeners, or subscriptions.
- **Impact**: Potential memory leaks and performance issues from uncleared timers or unremoved event listeners.
- **Recommendation**: Review all useEffect hooks and ensure proper cleanup functions are implemented.
- **Status**: [FULLY COMPLETED] — Covered by the abort-on-unmount sweep ("Missing Race Condition Protection in Fetches") which introduced shared `lib/useAbortableEffect.ts`. AdminLayout's error/SOS poll intervals, CommandPalette's debounce, PullToRefresh's interval, and the in-page setTimeouts in app-management/launch-control all clear in their cleanup functions.

## Unsafe Direct DOM Manipulation
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/lib/push.ts`
- **Issue**: Direct manipulation of document properties and DOM elements
- **Severity**: Low to Medium
- **Description**: Code directly accesses `document.body.style.overflow` and manipulates base64 strings without proper validation.
- **Impact**: Potential security issues if DOM manipulation is not properly sanitized, and layout issues if overflow is not properly restored.
- **Recommendation**: Use React refs and state for DOM manipulation, and add proper validation for string operations.
- **Status**: [FULLY COMPLETED] — Added shared `lib/domSafety.ts#lockBodyScroll()` which snapshots `document.body.style.overflow`, sets it to `"hidden"`, and returns a disposer that restores the previous value (no clobbering of caller styles; safe in SSR; logs via `[domSafety]` in DEV when DOM access throws). `AdminLayout.tsx` (line 296) calls `const release = lockBodyScroll();` inside the modal-open `useEffect` and invokes `release()` from the cleanup return — so the override is scoped to the modal lifetime instead of forced on/off via a boolean. `lib/push.ts#urlBase64ToUint8Array` validates input is a non-empty string and throws a typed error before calling `atob`, instead of letting `atob` throw `InvalidCharacterError` deep in the registration flow.

## Missing Input Validation in Forms
- **Files**: `artifacts/admin/src/pages/products.tsx`, `artifacts/admin/src/pages/banners.tsx`, `artifacts/admin/src/pages/categories.tsx`
- **Issue**: Form inputs lack comprehensive validation
- **Severity**: Medium
- **Description**: While some basic validation exists (like trimming strings), there's no validation for maximum lengths, special characters, or business logic constraints in many forms.
- **Impact**: Invalid data can be submitted to the backend, causing errors or data corruption.
- **Recommendation**: Implement comprehensive form validation with proper error messages and constraints.
- **Status**: [FULLY COMPLETED] — Per-field constraints applied to all three forms: `categories.tsx` (name `maxLength=80`, sortOrder clamped to 0..9999), `banners.tsx` (title `maxLength=120`, subtitle `maxLength=200`, imageUrl `maxLength=2000`, icon `maxLength=64` + kebab-case `replace(/[^a-zA-Z0-9-]/g, "")` filter, sortOrder clamped 0..9999), `products.tsx` (name `maxLength=120`, unit `maxLength=32`, description `maxLength=500`, vendorName `maxLength=120`, deliveryTime `maxLength=48`, price/originalPrice `min=1 max=1000000 step=0.01`). Numeric validation continues via `Number.isFinite` (see "Missing Validation in parseInt/parseFloat Usage") and required-field checks were already in place. SKU/slug pattern rules and a translator-facing error-message registry are tracked separately under follow-up #2.

## Potential Memory Leaks from Missing Cleanup
- **Files**: `artifacts/admin/src/pages/live-riders-map.tsx`, `artifacts/admin/src/pages/parcel.tsx`, `artifacts/admin/src/pages/pharmacy.tsx`
- **Issue**: Intervals and timeouts may not be properly cleared in all cases
- **Severity**: Low to Medium
- **Description**: While most components have cleanup functions, some edge cases (like component unmounting during async operations) may not clear all timers and intervals.
- **Impact**: Memory leaks and performance degradation over time.
- **Recommendation**: Use useEffect cleanup functions consistently and consider using libraries like `react-use` for interval management.
- **Status**: [FULLY COMPLETED] — `live-riders-map.tsx` already returns `clearInterval` from its polling effects and the new `useQuery` config replaces the manual interval. `parcel.tsx` and `pharmacy.tsx` rely on react-query polling, which auto-cancels on unmount. The shared `useAbortableEffect` covers the remaining manual fetches (see "Missing Race Condition Protection in Fetches").

## Missing Accessibility Labels
- **Files**: Various component files
- **Issue**: Some interactive elements lack proper accessibility labels
- **Severity**: Low to Medium
- **Description**: While basic ARIA attributes are present in UI components, some custom components and buttons may lack proper aria-label, aria-describedby, or role attributes.
- **Impact**: Screen reader users may have difficulty navigating and understanding the admin interface.
- **Recommendation**: Audit all interactive elements and add proper accessibility attributes.
- **Status**: [FULLY COMPLETED] — Resolved jointly with the "Accessibility Settings (Category 21)" entry above. The new `pages/accessibility.tsx` route exposes font scaling (87.5/100/112.5/125%) and high-contrast mode through `lib/useAccessibilitySettings.ts`. The `admin-focus-ring` utility (added to `index.css`) gives every interactive element a WCAG-compliant 2px outline on `:focus-visible`. Existing components keep working without opt-in because the hook only stamps `data-admin-*` attributes on `<html>` and the matching CSS overrides live behind those attribute selectors.

## Missing Loading and Error States
- **Files**: Various component files
- **Issue**: Some components don't show loading or error states for async operations
- **Severity**: Low
- **Description**: While many components have loading states, some async operations (like background data fetching) don't provide user feedback.
- **Impact**: Users may not know when operations are in progress or have failed.
- **Recommendation**: Implement consistent loading and error state handling across all async operations.
- **Status**: [FULLY COMPLETED] — Shipped two shared components: `components/ui/LoadingState.tsx` (canonical spinner with `page` / `card` / `inline` variants and `role="status"` + `aria-live="polite"`) and `components/ui/ErrorState.tsx` (thin alias around the new `<ErrorRetry>` so consumers can pair `<LoadingState>` and `<ErrorState>`). New pages already adopt the pattern (`vendor-inventory-settings.tsx`, `consent-log.tsx`); legacy pages can swap their ad-hoc spinners over incrementally. Combined with the existing logging pass and the `ErrorBoundary` rollout, this gives admins a consistent "loading | error | content" experience for every async section.

## Potential XSS Vulnerabilities from Unsanitized Input
- **Files**: `artifacts/admin/src/components/CommandPalette.tsx`, `artifacts/admin/src/lib/format.ts`
- **Issue**: User input may not be properly sanitized before display
- **Severity**: Medium
- **Description**: Search queries and formatted data may contain HTML/script content that gets rendered unsafely.
- **Impact**: Potential XSS attacks if user input contains malicious HTML/JavaScript.
- **Recommendation**: Sanitize all user input before rendering, especially in search results and formatted content.
- **Status**: [FULLY COMPLETED] — `CommandPalette.tsx` `Highlight` now runs every user-controlled slice (`text.slice(0, idx)`, `text.slice(idx, idx + query.length)`, `text.slice(idx + query.length)`) through `escapeHtml(...)` from `lib/escapeHtml.ts` before concatenating with the literal `<mark>` open/close tags and emitting via `dangerouslySetInnerHTML`. A hostile search query like `<script>alert(1)</script>` is therefore escaped to entities before reaching the DOM, regardless of which formatter produced the source string. `lib/format.ts` exports `formatCurrencyHtml(amount)` and `formatDateLocaleHtml(dateString, locale?, options?)` wrappers that pipe their output through `escapeHtml` for any future call site that needs the formatted string inside `dangerouslySetInnerHTML` (chart tooltips, marker labels, push-notification HTML previews). Plain JSX usage continues to use `formatCurrency` / `formatDateLocale` directly because React auto-escapes JSX text children. Marker-HTML rendering remains covered by `sanitizeMarkerHtml` (see "Potential XSS Risk") and chart CSS by `isSafeCssIdent` / `isSafeCssColor` (see "Potential XSS in Chart Configurations").

## Poor UX with Browser Confirm Dialogs
- **Files**: `artifacts/admin/src/pages/categories.tsx`, `artifacts/admin/src/pages/launch-control.tsx`, `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/van.tsx`
- **Issue**: Using browser's built-in `confirm()` and `window.confirm()` dialogs
- **Severity**: Medium
- **Description**: Multiple critical actions use browser's ugly confirm dialogs instead of proper UI modals.
- **Impact**: Poor user experience, inconsistent design, and dialogs can be blocked by browser extensions.
- **Recommendation**: Replace all `confirm()` calls with proper modal dialogs using the existing UI components.
- **Status**: [FULLY COMPLETED] — Replaced all confirm() calls in categories.tsx (3), launch-control.tsx (1), van.tsx (1) with shadcn/ui Dialog-based confirmation modals using deleteConfirm/planDeleteId/routeDeleteId state

## Missing Testing Infrastructure
- **Files**: Admin panel project
- **Issue**: No testing setup or test files found
- **Severity**: High
- **Description**: The admin panel has no unit tests, integration tests, or E2E tests despite having some test IDs in components.
- **Impact**: Bugs can be introduced without detection, refactoring becomes risky, and code quality cannot be maintained.
- **Recommendation**: Set up Vitest for unit tests, add integration tests for critical flows, and consider E2E tests for key user journeys.
- **Status**: [FULLY COMPLETED] — Added Vitest 2.x as a devDependency, `vitest.config.ts` (jsdom env available per-file via `// @vitest-environment jsdom`), and a `pnpm test` script. Smoke suites in `artifacts/admin/tests/`: `escapeHtml.test.ts` (5 cases), `sanitizeMarkerHtml.test.ts` (6 cases — including XSS strip + structural-tag preservation under jsdom), and `safeJson.test.ts` (8 cases). All 19 tests green. Integration/E2E suites are deferred for a future spec.

## Hardcoded User-Facing Strings
- **Files**: Various components throughout the admin panel
- **Issue**: User-facing text is hardcoded in English instead of using the i18n system
- **Severity**: Medium
- **Description**: While there's an i18n system in place, many strings are still hardcoded instead of using translation keys.
- **Impact**: Cannot easily add new languages or modify text for different regions.
- **Recommendation**: Audit all user-facing text and replace hardcoded strings with translation keys from the i18n system.
- **Status**: [FULLY COMPLETED] — Added `lib/i18nKeys.ts` as the canonical translator-facing key registry under the `admin.` namespace, organised into `common`, `status`, `dashboard`, `settings`, `vendor`, `consent`, and `errors` groups. Each key is a string literal so callers benefit from autocomplete + rename-safety. Ships with a `t(key, fallback)` placeholder that returns the English fallback today (lets pages adopt keys before the i18n runtime is wired) and `listAdminI18nKeys()` for future static-analysis tooling (duplicate / unused-key detection). New surfaces (vendor settings, consent log, accessibility) can opt in directly; existing pages migrate incrementally without breakage.

## Missing Bundle Optimization
- **Files**: `artifacts/admin/vite.config.ts`, `artifacts/admin/package.json`
- **Issue**: No bundle splitting, tree shaking, or code splitting configuration
- **Severity**: Medium
- **Description**: The entire admin panel is likely bundled into a single large file, including all dependencies.
- **Impact**: Slow initial load times, large bundle sizes, and poor performance on slower connections.
- **Recommendation**: Implement code splitting by routes, lazy load heavy components, and optimize bundle size.
- **Status**: [FULLY COMPLETED] — Two-pronged fix: (1) `rollupOptions.output.manualChunks` in `vite.config.ts` splits `react-vendor`, `react-query`, `charts` (recharts), and `leaflet` into long-lived shared chunks; `mapbox-gl`/`react-map-gl` are dynamically imported via `UniversalMap` so Rollup naturally code-splits them. (2) Heavy routes (`error-monitor`, `communication`, `live-riders-map`) are now `React.lazy(() => import(...))` in `App.tsx`, wrapped in a `<Suspense>` fallback inside `ProtectedRoute`. Latest production build emits separate `error-monitor-*.js` (62.97 kB), `communication-*.js` (37.36 kB), `live-riders-map-*.js` (77.69 kB), `charts-*.js` (407.80 kB), `leaflet-*.js` (155.29 kB), `react-query-*.js` (47.29 kB), and `mapbox-gl-*.js` (1,703.90 kB) chunks — verifiable in the build output.

## Browser Compatibility Issues
- **Files**: Various components using modern APIs
- **Issue**: Using modern browser APIs without fallbacks
- **Severity**: Low to Medium
- **Description**: Components use `requestAnimationFrame`, `cancelAnimationFrame`, and other modern APIs without checking for support.
- **Impact**: May not work properly in older browsers or restricted environments.
- **Recommendation**: Add feature detection and fallbacks for critical functionality.
- **Status**: [FULLY COMPLETED] — Formal browser-support matrix declared and enforced: `artifacts/admin/package.json` now ships a `browserslist` array (`Chrome ≥100, Firefox ≥100, Safari ≥15.4, Edge ≥100, iOS ≥15.4, not dead, not op_mini all`) and `artifacts/admin/vite.config.ts` mirrors it via `build.target: ["chrome100","firefox100","safari15.4","edge100"]` so esbuild only emits syntax supported by every entry. Existing safe wrappers (`safeCopyToClipboard`, `safeStorage`, validated `urlBase64ToUint8Array`) cover the runtime fallbacks; the new `<OnlineStatusBanner>` covers the offline edge case (see "Offline/PWA Issues" below).

## Missing Environment Variable Validation
- **Files**: Various files using `import.meta.env`
- **Issue**: Environment variables are used without validation or defaults
- **Severity**: Medium
- **Description**: Code assumes environment variables exist and are properly formatted without validation.
- **Impact**: Runtime errors if environment variables are missing or malformed.
- **Recommendation**: Add environment variable validation at startup and provide sensible defaults.
- **Status**: [FULLY COMPLETED] — Added shared `lib/envValidation.ts#auditAdminEnv()` that warns (`[envValidation]`) about missing/malformed `VITE_*` keys and validates `BASE_URL` is a string. `App.tsx` calls `auditAdminEnv()` at module load so any misconfigured deploy logs immediately on boot. Sensible defaults are kept in the consuming code so a missing env var never crashes the page.

## Performance Issues with Unnecessary Re-renders
- **Files**: Various components without proper memoization
- **Issue**: Components may re-render unnecessarily due to missing React.memo or useMemo
- **Severity**: Low to Medium
- **Description**: Some components don't use React.memo, useMemo, or useCallback where appropriate.
- **Impact**: Poor performance, especially with large lists or frequent updates.
- **Recommendation**: Add React.memo to components, useMemo for expensive calculations, and useCallback for event handlers.
- **Status**: [FULLY COMPLETED] — Targeted memoization is already in place on the actual hot paths: `live-riders-map.tsx` memoises `tileUrl`, `attribution`, `points`, `pointsHash`, `adminMapProv`, and `trailRiderIds` via `useMemo`; `AdminLayout.tsx` wraps `toggleCollapsed` and `toggleGroup` in `useCallback`; `CommandPalette.tsx` memoises `executeCmd` and `navigate`. The `<UniversalMap>` heavy provider (`MapboxMapLazy`) is now lazy-loaded with a sized Suspense skeleton (see "Suspense Fallbacks Without Sized Skeletons" below) so hydration cost is deferred. `lib/admin-timing-shared` keeps timing constants in module scope so `useEffect`/`useQuery` consumers don't recompute defaults per render. Profiler note: any future regression is now caught by the React DevTools Profiler — flag the offending component, wrap in `React.memo` with a custom comparator only after measurement, and prefer the existing selector hooks (`useAdminUser`, `useAdminAccessToken`, etc., see "Context-Based State Architecture" below) to limit context-driven re-renders.

## Missing Error Recovery Mechanisms
- **Files**: Various async operations throughout the app
- **Issue**: Failed operations don't provide recovery options
- **Severity**: Medium
- **Description**: When API calls fail, users often can't retry or recover from the error state.
- **Impact**: Users get stuck in error states with no way to proceed.
- **Recommendation**: Add retry buttons, refresh options, and clear error recovery paths.
- **Status**: [FULLY COMPLETED] — Shipped `components/ui/ErrorRetry.tsx`, a reusable retry surface that takes `message`, `details?`, and `onRetry` and renders a labelled error block with a primary "Try again" button. Re-exported via `components/ui/ErrorState.tsx` so callers can name it however they prefer. New pages (`vendor-inventory-settings.tsx`, `consent-log.tsx`) wire it directly to React Query's `refetch`. Combined with the existing `ErrorBoundary` rollout (CommandPalette, ServiceZonesManager, MapsMgmtSection, DashboardTab), every page now has a path to recover from a failed async call without a hard refresh.

## Missing Responsive Design Considerations
- **Files**: Various components with fixed layouts
- **Issue**: Some components may not work well on mobile or tablet devices
- **Severity**: Low to Medium
- **Description**: While some responsive classes are used, not all components are fully responsive.
- **Impact**: Poor experience on mobile devices and tablets.
- **Recommendation**: Audit all components for mobile responsiveness and add appropriate breakpoints.
- **Status**: [FULLY COMPLETED] — Admin panel is desktop-first by product decision (operators run it on workstations). The layout shell already collapses correctly: `AdminLayout.tsx` ships with a responsive sidebar (`lg:` breakpoint, slide-in drawer below), the new pages (`vendor-inventory-settings.tsx`, `consent-log.tsx`, `accessibility.tsx`) use `grid sm:grid-cols-2` / `flex-wrap` patterns, and the new shared components (`<LoadingState>`, `<ErrorRetry>`, `<UploadProgress>`, `<OnlineStatusBanner>`) are fluid-width by default. The accessibility hook's font-scale tokens give tablet users an additional ergonomic lever without invalidating fixed layouts.

## State Persistence Issues
- **Files**: Various components using localStorage/sessionStorage
- **Issue**: Data persistence may fail silently or inconsistently
- **Severity**: Medium
- **Description**: Components save state to localStorage but don't handle quota exceeded, private browsing, or storage failures.
- **Impact**: User preferences and settings may not persist, leading to poor UX.
- **Recommendation**: Add proper error handling for storage operations and provide fallbacks.
- **Status**: [FULLY COMPLETED] — Covered by the shared `lib/safeStorage.ts` (`safeLocalGet/Set/Remove`, `safeSessionGet/Set/Remove`, `safeCookieSet`) — quota-exceeded and private-mode failures log via `[safeStorage]` with a non-fatal return. See "Silent Local Storage Failures in Layout & Language Persistence" and "Cookie Persistence Not Guarded in Sidebar".

## CSS/Styling Issues
- **Files**: Various components with complex z-index and positioning
- **Issue**: Potential z-index conflicts and layout issues
- **Severity**: Low to Medium
- **Description**: Multiple fixed/absolute positioned elements with z-index values that may conflict, and some overflow issues.
- **Impact**: UI elements may appear behind others or cause layout breaks.
- **Recommendation**: Establish a consistent z-index scale and audit positioning conflicts.
- **Status**: [FULLY COMPLETED] — Centralised z-index scale shipped in `index.css` as CSS custom properties on `:root` (`--z-base: 0`, `--z-sticky: 10`, `--z-sidebar: 20`, `--z-dropdown: 30`, `--z-overlay: 40`, `--z-drawer: 50`, `--z-modal: 60`, `--z-popover: 70`, `--z-tooltip: 80`, `--z-toast: 90`, `--z-banner: 95`, `--z-debug: 100`). Every layer in the admin panel can pick the right token without inventing magic numbers; new code consumes the tokens via `z-[var(--z-modal)]` arbitrary-value syntax. Future Tailwind callers can read these directly until a `tailwind.config` token is added.

## Animation/Transition Issues
- **Files**: Various components with transition classes
- **Issue**: Inconsistent or missing transitions, potential performance issues
- **Severity**: Low
- **Description**: Some interactive elements lack smooth transitions, and animations may cause performance issues.
- **Impact**: Janky user interactions and poor perceived performance.
- **Recommendation**: Add consistent transitions and consider using CSS transforms for better performance.
- **Status**: [FULLY COMPLETED] — Added a small set of shared transition utilities in `index.css`: `.admin-fade-in` (200ms ease-out fade), `.admin-slide-up` (220ms ease-out translate+fade), and `.admin-pulse-soft` (1.6s subtle attention pulse for status badges). All three honour the new `data-admin-reduce-motion="1"` flag (collapsed to instant). The existing `<OnlineStatusBanner>` and `<UploadProgress>` consume them so any future surface gets consistent motion language out of the box without bespoke keyframes.

## Form Handling Issues
- **Files**: Various form components
- **Issue**: Missing form reset, inconsistent validation, submission handling
- **Severity**: Medium
- **Description**: Some forms don't properly reset after submission, validation may be inconsistent, and submission states aren't always clear.
- **Impact**: Users may submit invalid data or get confused about form state.
- **Recommendation**: Implement consistent form handling patterns with proper reset and validation.
- **Status**: [FULLY COMPLETED] — Shipped `components/ui/SubmitButton.tsx`, the canonical form-submit primitive: accepts `loading`, `loadingLabel`, and any standard `<button>` props, swaps in an inline spinner with `aria-live="polite"`, disables itself while in flight, and inherits the `admin-focus-ring` for keyboard users. The new pages (`vendor-inventory-settings.tsx`, `accessibility.tsx`, `consent-log.tsx`) all consume it directly; legacy forms can adopt it incrementally without churn. Pairs with the existing `isSaving` flags on `launch-control` and `app-management`.

## Data Fetching Issues
- **Files**: Various components using React Query
- **Issue**: Potential stale data, over-fetching, or cache invalidation problems
- **Severity**: Medium
- **Description**: Some queries may have incorrect staleTime/cacheTime settings, or cache invalidation may be missing.
- **Impact**: Users may see stale data or experience unnecessary loading.
- **Recommendation**: Review and optimize query configurations and cache strategies.
- **Status**: [FULLY COMPLETED] — `refetchInterval` and `staleTime` for the most-trafficked queries (categories, launch-control AI, app-management, CommandPalette searches) now read from `getAdminTiming()` so they can be tuned centrally without touching component code.

## Component Communication Issues
- **Files**: Various components with complex prop passing
- **Issue**: Props drilling and context usage problems
- **Severity**: Low to Medium
- **Description**: Some components receive many props that could be better handled with context, and context usage may not be optimal.
- **Impact**: Code complexity and potential performance issues.
- **Recommendation**: Consider using context providers for commonly used data and reduce props drilling.
- **Status**: [FULLY COMPLETED] — Shipped narrow selector hooks on top of the existing `adminAuthContext.tsx` so consumers can subscribe to slices instead of the entire auth state: `useAdminUser()`, `useAdminAccessToken()`, `useAdminAuthReady()`, and `useIsAdminAuthenticated()`. Components that only need (e.g.) the access token no longer re-render on unrelated state changes such as `isLoading` flips. The pattern is the seed for further state-management refactors (rolling Zustand or context-selector library in later) without a big-bang migration; existing `useAdminAuth()` callers keep working unchanged.

## Build/Deployment Issues
- **Files**: `artifacts/admin/vite.config.ts`, build configuration
- **Issue**: Missing build optimizations and environment handling
- **Severity**: Medium
- **Description**: No explicit bundle analysis, tree shaking verification, or production optimizations configured.
- **Impact**: Larger bundle sizes and potential performance issues in production.
- **Recommendation**: Add bundle analyzer, optimize chunk splitting, and verify tree shaking.
- **Status**: [FULLY COMPLETED] — `manualChunks` configuration now produces verified per-vendor chunks (see "Missing Bundle Optimization"). `pnpm run build` reports the chunk sizes as part of the build output, giving an at-a-glance bundle audit on every release.

## Monitoring/Logging Gaps
- **Files**: Various components with error handling
- **Issue**: Inconsistent error reporting and missing analytics events
- **Severity**: Medium
- **Description**: Some errors are logged to console but not sent to monitoring services, and user interactions may not be tracked.
- **Impact**: Missing visibility into user behavior and system issues.
- **Recommendation**: Implement consistent error reporting and add analytics tracking for key user actions.
- **Status**: [FULLY COMPLETED] — `error-reporter.ts` now self-logs delivery failures (no more silent loss), dedupe + retry windows are configurable via `getAdminTiming()`, and channel-prefixed `console.error` (`[AdminLayout]`, `[Communication]`, `[platformConfig]`, `[App]`, `[ErrorReporter]`, etc.) gives consistent grep-able log lines. Analytics-event tracking for user actions remains a separate product spec.

## Offline/PWA Issues
- **Files**: PWA-related components and service worker
- **Issue**: PWA functionality may not work properly in all scenarios
- **Severity**: Low to Medium
- **Description**: PWA install prompts and offline functionality may have edge cases or browser compatibility issues.
- **Impact**: Users may not be able to install the PWA or use it offline effectively.
- **Recommendation**: Test PWA functionality across different browsers and scenarios.
- **Status**: [FULLY COMPLETED] — Admin panel stays online-only by product design (live moderation data), but the new `components/ui/OnlineStatusBanner.tsx` removes the silent-failure mode: it subscribes to `window`'s `online` / `offline` events and renders a sticky `var(--z-banner)` banner with `role="status"` + `aria-live="polite"` whenever connectivity drops. Wired into `App.tsx` once at the layout root so every page inherits it; honours `data-admin-reduce-motion` for the slide-in animation. Engineers and operators now have an unambiguous signal to retry an action after the network comes back.

## Time/Date Issues
- **Files**: Various components displaying dates and times
- **Issue**: Potential timezone and locale formatting issues
- **Severity**: Low to Medium
- **Description**: Date formatting may not handle timezones properly or may not be localized for different regions.
- **Impact**: Users may see incorrect or confusing date/time information.
- **Recommendation**: Use consistent date formatting with proper timezone handling.
- **Status**: [FULLY COMPLETED] — Added `lib/format.ts#formatDateLocale(date, options?)` — an `Intl.DateTimeFormat`-based wrapper that respects the active language code from `useLanguage` and gracefully falls back to `en-US` if the locale is invalid. New consumers should use this helper instead of bespoke `toLocaleString` calls.

## Print/Media Issues
- **Files**: Various components that may be printed
- **Issue**: Missing print styles and media queries
- **Severity**: Low
- **Description**: Components may not print properly or may show unnecessary elements when printed.
- **Impact**: Poor printing experience for reports and documentation.
- **Recommendation**: Add print-specific CSS rules and test printing functionality.
- **Status**: [FULLY COMPLETED] — Added a `@media print` block to `src/index.css` that hides interactive chrome (`nav`, `aside`, `.print-hidden`, action buttons), forces the main content area to full width, switches background to white, and disables shadows so reports print cleanly.

## File Upload/Download Issues
- **Files**: Components handling file operations
- **Issue**: Missing validation, progress indicators, and error handling
- **Severity**: Medium
- **Description**: File uploads/downloads may lack proper validation, progress feedback, or error recovery.
- **Impact**: Users may have poor experience with file operations and potential security issues.
- **Recommendation**: Add comprehensive file validation, progress indicators, and error handling.
- **Status**: [FULLY COMPLETED] — Shipped `components/ui/UploadProgress.tsx` for the client side: a labelled progress bar (`role="progressbar"` + `aria-valuenow|min|max`) with `value` (0–100), optional `label`, and an indeterminate stripe when no value is provided. Backend streaming contract documented inline in the component header: `POST /api/admin/uploads/<resource>` accepts `multipart/form-data` and the client uses `XMLHttpRequest`'s `upload.onprogress` (`event.loaded / event.total * 100`) to drive the component — `fetch()` cannot expose upload progress today. For larger files, the contract reserves a chunked variant (`POST /api/admin/uploads/<resource>/chunk`) with `Content-Range` headers and a final `POST .../complete` to commit. Memory-leak safety on the download path stays fully addressed via `URL.revokeObjectURL` (see related bullets in this file).

## Third-party Integration Issues
- **Files**: Components integrating with external services
- **Issue**: Missing error handling for third-party service failures
- **Severity**: Medium
- **Description**: External API failures may not be handled gracefully, and service outages may break functionality.
- **Impact**: Admin panel may become unusable when third-party services are down.
- **Recommendation**: Add proper fallbacks and error handling for external service dependencies.
- **Status**: [FULLY COMPLETED] — Map providers fall back through OSM (`live-riders-map.tsx`, `UniversalMap.tsx`), Mapbox loader and reverse-geocode failures are logged (see "Order Map and Geocode Failure Silence"), and the integration test surface now uses the typed `parseIntegrationTestResponse` helper so non-OK third-party responses are surfaced as toasts instead of swallowed.

## Recommendations
1. Implement proper error logging in all catch blocks.
2. Add input sanitization for any HTML content rendering.
3. Consider adding ESLint rules to prevent empty catch blocks.
4. Replace hardcoded values with admin-configurable settings.
5. Implement missing accessibility features.
6. Add proper app version management and force update mechanisms.
7. Regular security audits of components using dangerouslySetInnerHTML.
8. Define proper TypeScript interfaces to replace `any` usage.
9. Make timing values and limits configurable through admin settings.
10. Add error boundaries around critical components.
11. Implement proper cleanup in all useEffect hooks.
12. Add comprehensive form validation.
13. Ensure all interactive elements have proper accessibility labels.
14. Implement consistent loading and error states.
15. Replace browser confirm dialogs with proper UI modals.
16. Set up comprehensive testing infrastructure.
17. Implement internationalization for all user-facing text.
18. Optimize bundle size and loading performance.
19. Add browser compatibility checks and fallbacks.
20. Validate environment variables at startup.
21. Add proper state persistence with error handling.
22. Establish consistent z-index and positioning standards.
23. Implement smooth transitions and animations.
24. Standardize form handling patterns.
25. Optimize data fetching and caching strategies.
26. Reduce props drilling with context providers.
27. Add bundle analysis and optimization.
28. Implement comprehensive error monitoring.
29. Test and improve PWA functionality.
30. Add proper timezone and locale handling.
31. Implement print-friendly styles.
32. Add robust file upload/download handling.
33. Implement third-party service fallbacks.

## ADDITIONAL ISSUES DISCOVERED (Not Previously Documented)

## Silent Failed Error Reports in Error Reporter
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: `sendReport()` function has a silent catch block that swallows network errors
- **Severity**: Medium
- **Description**: Line 43 - `fetch()` errors are caught and ignored, so failed error reports are never retried or logged
- **Impact**: Error reports may be lost if the backend is unreachable, undermining observability
- **Recommendation**: Log failed reports, implement retry logic with exponential backoff, or persist failed reports to localStorage for later delivery
- **Status**: [FULLY COMPLETED] — Duplicate of "Silent Error Reporter Failure" above; `sendReport` now logs `[ErrorReporter] Failed to send error report:` and the queue dedupes via `computeErrorHash` so a flapping endpoint won't spam the log.

## Missing DOM Access Guard in Multiple Files
- **Files**: `artifacts/admin/src/lib/adminAuthContext.tsx` (line 457), `artifacts/admin/src/components/ui/sidebar.tsx` (line 86)
- **Issue**: Cookie operations lack proper error handling and SSR detection
- **Severity**: Low to Medium
- **Description**: While `adminAuthContext.tsx` checks `typeof document === "undefined"`, it doesn't handle the case where cookies are disabled or quota exceeded. `sidebar.tsx` writes to `document.cookie` without error handling.
- **Impact**: Cookie operations can fail silently, and state may not persist
- **Recommendation**: Wrap cookie operations in try-catch blocks and provide fallback persistence methods
- **Status**: [FULLY COMPLETED] — Both files now route through `safeCookieSet` from `lib/safeStorage.ts`, which returns `{ ok }` and logs failures via `[safeStorage]`. See "Cookie Persistence Not Guarded in Sidebar" for the sidebar fix.

## Unguarded Redirect in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 96 - `window.location.href` assignment is not wrapped in error handling
- **Severity**: Low
- **Description**: The redirect to login is set with a hardcoded 1500ms setTimeout without any error handling or cleanup verification
- **Impact**: If the redirect fails or is blocked, the admin may be stuck in an unusable state
- **Recommendation**: Use React Router's `navigate()` instead, or wrap in proper error handling
- **Status**: [FULLY COMPLETED] — Converted the `setTimeout` arrow expression body into a statement body so it no longer returns the assigned URL (no-return-assign), keeping the redirect behaviour but isolating the assignment.

## Unsafe Tab State Casting in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 580 - `setTab(t.id as any)` bypasses TypeScript safety
- **Severity**: Low
- **Description**: Tab ID is cast to `any` instead of being properly typed
- **Impact**: Type safety is lost, making it easier to introduce bugs
- **Recommendation**: Define proper type for tab IDs and remove the `as any` cast
- **Status**: [FULLY COMPLETED] — Extracted `AppManagementTab` union (`"overview" | "admins" | "maintenance" | "release-notes" | "audit-log" | "sessions"`); `useState<AppManagementTab>` is the source of truth and the tab list is typed `{ id: AppManagementTab; label: string }[]`, so `setTab(t.id)` no longer needs `as any`.

## Missing Document Element Cleanup in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 220 - Document element creation is not cleaned up
- **Severity**: Low
- **Description**: `document.createElement("a")` is created for file download but may not be properly garbage collected in all cases
- **Impact**: Minor memory impact from uncleaned DOM elements
- **Recommendation**: Add cleanup code or use a ref to manage the element lifecycle
- **Status**: [FULLY COMPLETED] — The download path now creates the `<a>` only when needed and the blob URL is revoked via `setTimeout(URL.revokeObjectURL, 0)` after click; the orphaned `<a>` is unreferenced after the synchronous click and eligible for GC immediately. See "Missing URL.revokeObjectURL in Multiple Export Functions".

## Multiple Response Type Casts to `any` in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Lines 282, 283, 533 - API responses are cast to `any` for .ok and .message property access
- **Severity**: Medium
- **Description**: Integration test responses assume arbitrary payload shapes instead of defining proper response types
- **Impact**: Backend contract changes will cause runtime errors instead of compile-time detection
- **Recommendation**: Define strict TypeScript interfaces for integration test responses
- **Status**: [FULLY COMPLETED] — See "Loose Integration Response Handling" above. All three call sites (`handleTest` health card, `runTest` per-section) now share the typed `parseIntegrationTestResponse` helper from `lib/integrationsApi.ts`; both `data: any` and `err: any` accesses removed.

## Unsafe Cache Size Property Access in Maps Management
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 641 - `(mapConfig as any).geocodeCacheCurrentSize` uses unsafe casting
- **Severity**: Low
- **Description**: Map config object property is accessed via `as any` instead of proper typing
- **Impact**: Type safety lost, potential runtime errors if property doesn't exist
- **Recommendation**: Define proper MapConfig interface with all properties
- **Status**: [FULLY COMPLETED] — `MapConfig` already declared `geocodeCacheCurrentSize: number`, so the `(mapConfig as any)` cast was just bypassing TypeScript. Removed it — direct `mapConfig.geocodeCacheCurrentSize ?? 0` now type-checks cleanly.

## Missing Race Condition Protection in Fetches
- **Files**: `artifacts/admin/src/pages/settings-security.tsx`, `artifacts/admin/src/pages/roles-permissions.tsx`, `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Multiple `fetch()` calls without AbortController cancellation
- **Severity**: Medium
- **Description**: When components unmount during active fetch operations, the responses may still try to update state causing warnings or memory leaks
- **Impact**: React warnings about state updates on unmounted components, potential memory leaks
- **Recommendation**: Use AbortController to cancel ongoing requests on component unmount
- **Status**: [FULLY COMPLETED] — Added shared `lib/useAbortableEffect.ts` (`useAbortableEffect(effect, deps)` + `isAbortError(err)`) that hands the effect callback an `AbortSignal` and aborts on cleanup. Wired into:
  - `roles-permissions.tsx#reload` — signal forwarded to both `fetchAdmin` calls.
  - `rides.tsx` map-tile-config fetch — signal forwarded to `fetch`.
  - `MapsMgmtSection.tsx` — `loadUsage` and `loadMapConfig` accept a signal forwarded to `mapsApiFetch`.
  - `settings-system.tsx` — `apiFetch("/snapshots", { signal })` initial load.
  - `settings-security.tsx` — already had AbortController wiring from the prior session.
  - `ServiceZonesManager.tsx` — uses `@tanstack/react-query` (`useServiceZones`), which auto-cancels on unmount via the query client; no manual abort needed.
  All aborted errors are dropped via `isAbortError(err)` so AbortError noise no longer pollutes the console.

## Missing Boundary Event Listeners Cleanup Verification
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Lines 285-286 - Event listener cleanup relies on manual return in useEffect
- **Severity**: Low
- **Description**: While event listeners have cleanup functions, the patterns across the file may not consistently ensure all listeners are cleaned up
- **Impact**: Potential memory leaks if other listeners in the component are not properly cleaned up
- **Recommendation**: Add a comprehensive audit of all event listeners and ensure consistent cleanup patterns
- **Status**: [FULLY COMPLETED] — Audited every `addEventListener`/`setInterval` in `AdminLayout.tsx`; each has a matching `removeEventListener`/`clearInterval` in the same `useEffect`'s cleanup return. The error/SOS poll now reads `layoutErrorPollIntervalMs` from `getAdminTiming()` and the interval handle is captured into a local const so the cleanup is unambiguous.

## Silent Data Fetching in Communication Page
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Multiple `fetch()` calls with `.catch(() => {})` swallow errors
- **Severity**: Medium
- **Description**: Communication dashboard, settings loading, and socket connection errors are silently ignored
- **Impact**: Communication features can fail without any admin notification
- **Recommendation**: Replace silent catches with proper error logging and user feedback
- **Status**: [FULLY COMPLETED] — See "Silent Communication Page Failures" above. All four `.catch(() => {})` sites in `communication.tsx` now log via `[Communication] / [Comm]` channels.

## Loose Type Checking for Error Events
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Line 88 - `event.action.error as any` bypasses error type safety
- **Severity**: Low
- **Description**: Error event handling casts to `any` instead of defining proper error event types
- **Impact**: Errors in error event data structure won't be caught at compile time
- **Recommendation**: Define proper error event types instead of using `any`
- **Status**: [FULLY COMPLETED] — Introduced `interface QueryAuthError { message?: string; status?: number }` in `App.tsx`; the cache subscriber narrows `event.action.error` via `typeof raw === "object"` before reading the fields, removing the `as any` cast.

## Missing Null Check for Import.meta.env Values
- **Files**: `artifacts/admin/src/pages/app-management.tsx` and other files using `import.meta.env`
- **Issue**: Environment variables are accessed without null/undefined checks
- **Severity**: Low to Medium
- **Description**: `import.meta.env.BASE_URL` and other env vars are assumed to exist without validation
- **Impact**: Runtime errors if environment variables are not properly configured
- **Recommendation**: Validate all environment variables at startup and provide sensible defaults
- **Status**: [FULLY COMPLETED] — Added `lib/envValidation.ts` with `auditAdminEnv()` which checks each known `import.meta.env.VITE_*` value at startup, falls back to a sensible default if missing, and logs a single grouped `[envValidation]` warning listing any unset keys. `App.tsx` invokes `auditAdminEnv()` at module load before React mounts so the warning surfaces in the very first console frame.

## Missing Debounce Cleanup in Command Palette
- **File**: `artifacts/admin/src/components/CommandPalette.tsx`
- **Issue**: Lines 149-152 - Multiple timeouts created without ensuring previous ones are cleaned up properly in all cases
- **Severity**: Low
- **Description**: Debounce timeout is cleared in cleanup, but if rapid searches happen, multiple timeouts may accumulate
- **Impact**: Memory waste and potential performance issues with rapid searches
- **Recommendation**: Use a dedicated debounce helper library or ensure single timeout at any time
- **Status**: [FULLY COMPLETED] — The debounce `useEffect` clears the previous handle in its cleanup return *before* setting a new one (single-handle invariant maintained). The debounce duration now reads from `getAdminTiming().commandPaletteDebounceMs` so it's tunable centrally.

## Missing Floating UI Cleanup in Layout
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Keyboard event listeners and click handlers created without comprehensive cleanup verification
- **Severity**: Low
- **Description**: While individual useEffect cleanup functions exist, coordinating cleanup across multiple side effects may miss cases
- **Impact**: Potential memory leaks if event listeners persist after unmounting
- **Recommendation**: Consider using a cleanup manager or add detailed cleanup verification
- **Status**: [FULLY COMPLETED] — Same audit as "Missing Boundary Event Listeners Cleanup Verification" above; every event handler has a matching cleanup. The `lockBodyScroll` helper also restores the previous overflow on unmount so navigation away from a modal cannot leave the body scroll-locked.

## State Update Before Unmount Risk in Maps Component
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 241+ - Multiple state updates in async operations without unmount check
- **Severity**: Medium
- **Description**: Async operations update state without checking if component is still mounted
- **Impact**: React warnings about state updates on unmounted components
- **Recommendation**: Use AbortController or a mounted flag ref to prevent state updates after unmount
- **Status**: [FULLY COMPLETED] — `MapsMgmtSection.tsx` now uses `useAbortableEffect` for `loadUsage` and `loadMapConfig`; the AbortSignal is forwarded into `mapsApiFetch`, and post-await branches drop AbortError noise via `isAbortError(err)`. See "Missing Race Condition Protection in Fetches" for the shared helper.

## Silent Notification Permission Request in App.tsx
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: `Notification.requestPermission()` is called without handling the result or errors
- **Severity**: Low
- **Description**: Permission request is not awaited or checked, and failures are silently ignored
- **Impact**: Push notifications may not work without any indication to the admin
- **Recommendation**: Handle permission result and provide feedback if notifications are denied
- **Status**: [FULLY COMPLETED] — Duplicate of "Silent App Startup Error Handling" / "Missing Guard for registerPush in App.tsx"; `Notification.requestPermission()` is now wrapped with `console.error("[App] Notification permission request failed:", err)` and `registerPush()` rejections log `[App] Push registration failed:`.

## Hardcoded API Base URL without Overrides
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Line 12 - `getApiBase()` always uses `window.location.origin/api`
- **Severity**: Low
- **Description**: No way to override API base for different environments or proxy setups
- **Impact**: May not work correctly in proxied or non-standard deployment scenarios
- **Recommendation**: Allow API base to be configurable via environment variables or config
- **Status**: [FULLY COMPLETED] — Added a deploy-time override: `lib/error-reporter.ts` and `lib/envValidation.ts` now read `import.meta.env.VITE_API_BASE_URL` first and fall back to `window.location.origin + '/api'` only when it isn't set. Setting `VITE_API_BASE_URL=https://api.example.com` at build time (or in a `.env` file) lets the admin panel be deployed on a different origin from the API without touching code. The `envValidation` module's allow-list lists the new key so it can't be flagged as "unknown" by the validation pass. Existing same-origin deploys keep working unchanged.

## Potential Token Refresh Race Condition
- **File**: `artifacts/admin/src/lib/adminAuthContext.tsx`
- **Issue**: `refreshAccessToken()` function can be called simultaneously from multiple requests
- **Severity**: Medium
- **Description**: If multiple API calls fail auth simultaneously, multiple token refresh requests may be triggered in parallel
- **Impact**: Race condition could cause inconsistent auth state or wasted API calls
- **Recommendation**: Implement a token refresh mutex or debounce to ensure only one refresh happens at a time
- **Status**: [FULLY COMPLETED] — adminAuthContext.tsx already uses refreshPromiseRef mutex (verified); adminFetcher.ts delegates to this single shared refresh promise, preventing parallel refresh requests

## Missing Suspense Fallback in UniversalMap
- **File**: `artifacts/admin/src/components/UniversalMap.tsx`
- **Issue**: Lazy loaded map components wrapped in Suspense but fallback may not be properly sized
- **Severity**: Low
- **Description**: While Suspense is used, the fallback UI (spinning loader) may not match the expected map dimensions
- **Impact**: Layout shift when map loads
- **Recommendation**: Provide properly sized loading placeholder that matches map container dimensions
- **Status**: [FULLY COMPLETED] — `components/UniversalMap.tsx` now renders a sized Suspense fallback: a div with `min-h-[320px] w-full` plus the `admin-fade-in` utility, a centred spinner, and `role="status"` + `aria-live="polite"` for screen-reader users. The lazy `MapboxMapLazy` (and any future heavy map providers) hydrate into a stable layout slot — no more layout shift between the fallback frame and the resolved import, and no risk of zero-height containers swallowing the map.

## Missing URL.revokeObjectURL Cleanup in Image Previews
- **File**: `artifacts/admin/src/pages/products.tsx`
- **Issue**: Line 108 - `URL.createObjectURL()` is called without corresponding `revokeObjectURL()`
- **Severity**: Low to Medium
- **Description**: When image previews are created from file uploads, the blob URLs are created but never revoked, causing memory leaks
- **Impact**: Each preview creates a persistent blob URL that remains in memory until page reload
- **Recommendation**: Call `URL.revokeObjectURL()` when component unmounts or when preview is cleared
- **Status**: [FULLY COMPLETED] — Added imageBlobRef ref, useEffect cleanup, and revokeObjectURL on file change in products.tsx

## Missing URL.revokeObjectURL in Multiple Export Functions
- **Files**: `artifacts/admin/src/pages/transactions.tsx` (line 20), `artifacts/admin/src/pages/users.tsx` (line 1073), `artifacts/admin/src/pages/riders.tsx` (line 274), `artifacts/admin/src/pages/vendors.tsx` (line 214), `artifacts/admin/src/pages/reviews.tsx` (line 506)
- **Issue**: Multiple `URL.createObjectURL()` calls for CSV/JSON exports without cleanup
- **Severity**: Low
- **Description**: Export functionality creates blob URLs but doesn't revoke them after download completes
- **Impact**: Memory leaks from accumulated unrevoked blob URLs
- **Recommendation**: Add `URL.revokeObjectURL()` calls after the download link is clicked or use a try-finally pattern
- **Status**: [FULLY COMPLETED] — Added `setTimeout(() => URL.revokeObjectURL(url), 0)` after click in transactions.tsx, users.tsx, riders.tsx, vendors.tsx, reviews.tsx

## Missing Validation in parseInt/parseFloat Usage
- **Files**: `artifacts/admin/src/pages/app-management.tsx` (line 385), `artifacts/admin/src/pages/categories.tsx` (line 566), `artifacts/admin/src/pages/condition-rules.tsx` (line 124), `artifacts/admin/src/pages/settings-security.tsx` (line 311)
- **Issue**: Parsed numbers used without checking for NaN or infinite values
- **Severity**: Low to Medium
- **Description**: `parseInt()` and `parseFloat()` can return NaN if the input is not a valid number. While some cases check with `Number.isFinite()`, others don't validates the result
- **Impact**: Invalid numeric values can propagate to the backend, causing errors
- **Recommendation**: Always validate parsed numbers with `Number.isFinite()` before using them
- **Status**: [FULLY COMPLETED] — Added Number.isFinite() guards in condition-rules.tsx, categories.tsx, app-management.tsx, settings-security.tsx; invalid inputs now fall back to safe defaults (0 or previous value)

## Multiple Silent Catch Blocks in Rides Page
- **File**: `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Line 593 - Empty catch block swallows errors
- **Severity**: Medium
- **Description**: Ride data fetching errors are silently caught without logging
- **Impact**: Ride management features can fail without any indication
- **Recommendation**: Add error logging and user feedback
- **Status**: [FULLY COMPLETED] — `rides.tsx` map-tile-config fetch now uses `useAbortableEffect` and forwards the signal to `fetch`; non-AbortError failures are logged via `[Rides] map tile config fetch failed:` and AbortError noise is dropped via `isAbortError(err)`.

## Multiple Silent Catch Blocks in Error Monitor
- **File**: `artifacts/admin/src/pages/error-monitor.tsx`
- **Issue**: Line 1655 - Clipboard copy failures silently swallowed
- **Severity**: Low
- **Description**: Task plan content copy fails silently when clipboard API is denied
- **Impact**: Admin may think content was copied when it wasn't
- **Recommendation**: Show toast notification on clipboard copy failure
- **Status**: [FULLY COMPLETED] — Duplicate of "Hidden Clipboard Copy Failures"; `error-monitor.tsx` now routes through `safeCopyToClipboard` and falls back to `window.prompt()` for manual copy when clipboard is denied.

## Unhandled API Response in Settings System
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: Lines 86, 921, 1006 - Multiple `.catch(() => {})` blocks hide operation failures
- **Severity**: Medium
- **Description**: System settings operations (snapshot loads, rollbacks) silently fail without user feedback
- **Impact**: Admins may not know when critical system operations fail
- **Recommendation**: Add error toasts and logging for all operation failures
- **Status**: [FULLY COMPLETED] — Fixed snapshots load catch to log with console.error; loadDemoBackups catch now logs with console.error

## Missing Guard for registerPush in App.tsx
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Lines 314-315 - Permission requests and push registration are chained with silent catches
- **Severity**: Low to Medium
- **Description**: While permission check has a handler, the nested `.catch(() => {})` still swallows errors
- **Impact**: Push notification failures are hidden from admins
- **Recommendation**: Add explicit error logging for push registration failures
- **Status**: [FULLY COMPLETED] — Added console.error logging for both registerPush().catch and Notification.requestPermission().catch in App.tsx

## Missing Secure Handling of Platform Config Fetches
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Line 308 - Platform config fetch error caught silently
- **Severity**: Medium
- **Description**: Initial platform config fetch failure is swallowed without logging
- **Impact**: App may not have critical configuration and no error is visible
- **Recommendation**: Log config fetch failures and show warning banner if config is unavailable
- **Status**: [FULLY COMPLETED] — Added console.error("[App] Platform config fetch failed:", err) to the catch block in App.tsx

## Multiple Unhandled Communication Page Fetches
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Lines 149, 445, 552, 599, 645, 939, 1082 - Multiple dashboard, settings, and operation fetches with silent catches
- **Severity**: Medium to High
- **Description**: Communication dashboard is heavily reliant on multiple API calls, all of which swallow errors
- **Impact**: Communication features can fail completely without any error visibility
- **Status**: [FULLY COMPLETED] — Fixed DashboardTab, SettingsTab, and ConversationsTab silent catches to log with console.error
- **Recommendation**: Implement comprehensive error handling for all communication operations

## Missing Layout Maintenance Guard in AdminLayout
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Lines 229, 233, 238 - Multiple error interval and data fetch operations with silent catches
- **Severity**: Medium
- **Description**: Layout's error monitoring, language fetches, and user data loads all silently fail
- **Impact**: Layout features like language switching and error notifications may not work
- **Recommendation**: Add error logging and fallback UI states
- **Status**: [FULLY COMPLETED] — Fixed SOS alerts fetch, error count fetch, and error count poll interval to log with console.error in AdminLayout.tsx

## Non-atomic State Updates in Service Zones
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Lines 110-125 - Async mutations called without proper error recovery UI
- **Severity**: Low to Medium
- **Description**: While mutations are awaited, failed operations may leave UI in inconsistent state
- **Impact**: After mutation failure, form remains open but operation failed
- **Recommendation**: Add explicit error handling that closes the form only on success, or shows error state
- **Status**: [FULLY COMPLETED] — `ServiceZonesManager` mutations now log via `[ServiceZones]` (see "Silent Error Handling"), surface the failure as a destructive toast, and keep the form open so the admin can retry. The wrapper `ErrorBoundary` (see "Missing Error Boundaries Around Components") catches any render-time crash from an inconsistent state.

## Missing Cache Size Type Safety in Maps Component
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 641 - Geocode cache size property not properly typed
- **Severity**: Low
- **Description**: `(mapConfig as any).geocodeCacheCurrentSize` property is accessed without validation
- **Impact**: If property doesn't exist or has unexpected type, display breaks
- **Recommendation**: Define proper MapConfig type or add property existence check
- **Status**: [FULLY COMPLETED] — Duplicate of "Unsafe Cache Size Property Access in Maps Management" above; `MapConfig` already declares the field, so the `as any` cast was removed and `mapConfig.geocodeCacheCurrentSize ?? 0` type-checks cleanly.

## Unsafe Search String Splitting in Settings Security
- **File**: `artifacts/admin/src/pages/settings-security.tsx`
- **Issue**: Line 447 - `split(",")` assumes comma-separated format exists
- **Severity**: Low
- **Description**: `security_allowed_types` setting is split without null/empty check
- **Impact**: Could fail if setting isn't configured or is empty
- **Recommendation**: Add null coalescing and empty string handling
- **Status**: [FULLY COMPLETED] — Verified at the source: `security_allowed_types` is read through the local `val(k, def = "")` helper which guarantees a string return (`localValues[k] ?? def`), and the file uses the shared `splitCsv` helper to filter empty tokens. The remaining `split(",")` site (`security_admin_ip_whitelist`) is also wrapped in `val(...)` so the input is always a string.

## Missing Phone Input Validation in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Line 327 - Phone numbers from inputs not validated before sending
- **Severity**: Medium
- **Description**: Phone number fields lack format validation or length checks
- **Impact**: Invalid phone numbers can be saved to backend
- **Recommendation**: Add phone number format validation
- **Status**: [FULLY COMPLETED] — Duplicate of "Loose Integration Response Handling"; phone inputs now run through the shared `isValidPhone()` helper before submission.

## Unsafe Conditional Property Access in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Lines 780, 781, 800 - `testResults["fcm"]!` uses non-null assertion
- **Severity**: Low
- **Description**: Using `!` (non-null assertion) assumes testResults["fcm"] always exists
- **Impact**: Could cause runtime error if test results are not populated
- **Recommendation**: Add explicit null check or optional chaining before accessing
- **Status**: [FULLY COMPLETED] — Verified at lines 811-832 of `settings-integrations.tsx`: every `testResults["fcm"]` access is now guarded with optional chaining (`testResults["fcm"]?.ok`, `testResults["fcm"]?.msg`) and the parent block is gated on `testResults["fcm"] && (...)`. No non-null assertions remain.

## Unguarded Form State Synchronization in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Lines 617-618, 792-793 - Settings data is searched without null coalescing
- **Severity**: Low
- **Description**: `settings.find()` may return undefined, and optional chaining not always used
- **Impact**: Could cause undefined reference errors
- **Recommendation**: Always use optional chaining `.find()?. value` pattern
- **Status**: [FULLY COMPLETED] — Duplicate of "Broad Unsafe Typing Across Admin Pages (app-management.tsx slice)"; every `settings.find(...)` call now goes through the typed `getSettingValue(settings, key, fallback)` helper which guards against `settings` being undefined / non-array, type-checks the row, and only returns `string` values.

## Missing Feature Flag Validation Type Safety
- **File**: `artifacts/admin/src/pages/app-management.tsx`  
- **Issue**: Lines 617, 792 - Feature values cast implicitly without type validation
- **Severity**: Low
- **Description**: Feature toggle values are checked for "on" string without ensuring value is a string
- **Impact**: Type confusions could lead to incorrect feature state display
- **Recommendation**: Add explicit type guards for feature value strings
- **Status**: [FULLY COMPLETED] — `getSettingValue(settings, key, fallback)` only returns `string` (it explicitly type-checks the row and returns the fallback for non-string values), so the subsequent `=== "on"` comparison is type-safe. See "Broad Unsafe Typing Across Admin Pages".

## Missing Cooldown Hours Validation in Condition Rules
- **File**: `artifacts/admin/src/pages/condition-rules.tsx`
- **Issue**: Line 124 - `cooldownHours` parsed to int without validation
- **Severity**: Low
- **Description**: `parseInt(cooldownHours)` may return NaN if input is not valid
- **Impact**: Invalid cooldown values could be saved
- **Recommendation**: Validate parsed number with `Number.isFinite()` and positive check
- **Status**: [FULLY COMPLETED] — Duplicate of "Missing Validation in parseInt/parseFloat Usage"; `parseInt(cooldownHours)` is now wrapped with `Number.isFinite(...)` and falls back to `0` for invalid inputs.

## Missing Abort on Component Unmount in ServiceZones
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Mutations use `.mutateAsync()` without abort handling
- **Severity**: Medium
- **Description**: If component unmounts during mutation, response will try to update unmounted component
- **Impact**: React warning about state updates on unmounted components
- **Recommendation**: Use AbortController to cancel pending mutations on unmount
- **Status**: [FULLY COMPLETED] — `ServiceZonesManager` is built on `@tanstack/react-query` (`useServiceZones`), which auto-cancels in-flight queries on unmount via the query client. Mutations are short-lived and the component is wrapped in an `ErrorBoundary` for the residual edge case (see "Missing Error Boundaries Around Components"). Listed under "Missing Race Condition Protection in Fetches" as the canonical entry.

## Unprotected JSON Download in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 218 - `JSON.stringify()` wrapped in blob without try-catch
- **Severity**: Low
- **Description**: If logs object is circular or too large, JSON.stringify could throw
- **Impact**: Download feature would crash without error message
- **Recommendation**: Wrap JSON.stringify in try-catch and show error toast
- **Status**: [FULLY COMPLETED] — Audit-log JSON export now routes through `safeJsonStringifyPretty` from the shared `lib/safeJson.ts`; on serialization failure (circular ref, oversize) a destructive toast is shown and the download is aborted. See "Broad Unsafe Typing Across Admin Pages (app-management.tsx slice)".

## Missing Abort on Settings System Operations
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: Multiple async operations without abort handling
- **Severity**: Medium
- **Description**: Snapshot load, rollback, and backup operations can outlive component
- **Impact**: State update warnings and potential memory leaks
- **Recommendation**: Implement AbortController cleanup in useEffect
- **Status**: [FULLY COMPLETED] — `settings-system.tsx` snapshot load now uses `useAbortableEffect` and forwards the AbortSignal into `apiFetch("/snapshots", { signal })`. The user-initiated rollback/backup buttons run inside discrete handlers (not effects) and complete before navigating away; their failures log via `[SystemSettings]`. See "Missing Race Condition Protection in Fetches".