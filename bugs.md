# Admin Panel Bugs and Non-Working Settings

This document lists bugs and non-functional settings found in the AJKMart admin panel.

## TypeScript Configuration Issue
- **File**: `artifacts/admin/tsconfig.json`
- **Issue**: Cannot find type definition file for 'vite/client'
- **Severity**: Low
- **Description**: The TypeScript configuration references 'vite/client' types that may not be available in all environments.
- **Impact**: Type checking may fail in some setups.
- **Status**: Appears resolved after dependency installation.

## Silent Error Handling
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Empty catch blocks that don't log errors
- **Severity**: Medium
- **Description**: Lines 117 and 127 have `catch {}` blocks that only show generic toast messages without logging the actual error.
- **Impact**: Errors during zone creation/update and deletion are not logged, making debugging difficult.
- **Recommendation**: Add error logging: `catch (error) { console.error('Zone operation failed:', error); toast(...); }`
- **Status**: [COMPLETED] — Added `console.error` to both catch blocks in ServiceZonesManager.tsx

## Silent Error Handling in Maps Management
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Empty catch blocks marked as "non-critical"
- **Severity**: Low to Medium
- **Description**: Lines 230, 238 have `catch { /* non-critical */ }` for loading usage data and map config.
- **Impact**: Failures in loading usage statistics or map configuration are silently ignored.
- **Recommendation**: At minimum, log these errors for monitoring purposes.
- **Status**: [COMPLETED] — Added `console.error` logging to both catch blocks

## Potential XSS Risk
- **File**: `artifacts/admin/src/components/UniversalMap.tsx`
- **Issue**: Use of `dangerouslySetInnerHTML` with `m.iconHtml`
- **Severity**: Medium
- **Description**: Marker icons are rendered using `dangerouslySetInnerHTML={{ __html: m.iconHtml }}` where `iconHtml` is a string prop.
- **Impact**: If `iconHtml` contains unsanitized user input or is compromised, it could lead to XSS attacks.
- **Recommendation**: Sanitize HTML content or use safer alternatives like SVG components.
- **Status**: [COMPLETED] — Two-layer fix:
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
- **Status**: [COMPLETED] — `ChartStyle` now validates each config entry via `isSafeCssIdent(key)` and `isSafeCssColor(color)` (shared in `lib/escapeHtml.ts`); unsafe entries are dropped before being injected into the `<style>` block.

## Silent Security Section Failures
- **File**: `artifacts/admin/src/pages/settings-security.tsx`
- **Issue**: Several `catch {}` blocks swallow fetch and MFA errors
- **Severity**: Medium
- **Description**: Live security dashboard fetches, MFA setup/verify/disable calls, and some API requests ignore errors and do not report why the action failed.
- **Impact**: Admins may see stale or empty security panels and cannot diagnose why integration or security operations failed.
- **Recommendation**: Surface errors to the UI/toast and log failures for diagnostics.
- **Status**: [COMPLETED] — Fixed fetchLiveData, fetchMfaStatus, verifyMfaToken, disableMfa catch blocks; added console.error and toast messages

## Integration Health Test UX & Persistence
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Test results are shown transiently and not persisted
- **Severity**: Medium
- **Description**: Integration tests can pass/fail, but results are not persisted in the admin UI, and partial status may be confusing for console-only SMS mode.
- **Impact**: Admins may not have a reliable record of whether credentials were successfully validated.
- **Recommendation**: Preserve the last test status and clearly distinguish dev-only console mode from real gateway configuration.

## Loose Integration Response Handling
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: `as any` response parsing and loose `.ok` checks
- **Severity**: Medium
- **Description**: Integration health tests assume arbitrary backend payload shapes and treat any non-false `.ok` as success.
- **Impact**: Backend contract drift or unexpected response formatting can report false positives or hide real failures.
- **Recommendation**: Use strict response types and normalize test responses before showing UI status.
- **Status**: [COMPLETED] — Added shared `IntegrationTestResponse` type + `parseIntegrationTestResponse(raw, defaultMessage)` in `lib/integrationsApi.ts`; both `handleTest` (health card) and `runTest` (per-section) now route every payload through it instead of `(data as any)?.ok`/`?.message`. Errors are typed via `instanceof Error` (no more `err: any`). Phone inputs now run through shared `isValidPhone()`.

## Missing Toggle Key Support in Settings Renderer
- **File**: `artifacts/admin/src/pages/settings-render.tsx`
- **Issue**: `TOGGLE_KEYS` is missing multiple boolean settings keys.
- **Severity**: Medium
- **Description**: Keys such as `google_maps_enabled`, `mapbox_enabled`, `osm_enabled`, `locationiq_enabled`, `map_failover_enabled`, `comm_enabled`, `comm_chat_enabled`, `comm_voice_calls_enabled`, `comm_voice_notes_enabled`, `comm_translation_enabled`, `comm_chat_assist_enabled`, `auth_phone_otp_enabled`, `auth_email_otp_enabled`, `auth_username_password_enabled`, `auth_email_register_enabled`, `auth_magic_link_enabled`, `auth_2fa_enabled`, `auth_biometric_enabled`, and `auth_captcha_enabled` are not included in `TOGGLE_KEYS`.
- **Impact**: These boolean settings may be rendered as text fields or not behave as toggle controls, causing incorrect admin UI semantics and broken configuration handling.
- **Recommendation**: Add missing boolean setting keys to `TOGGLE_KEYS` and verify the renderer correctly displays them as toggles.
- **Status**: [COMPLETED] — Added all 19 missing keys to TOGGLE_KEYS in settings-render.tsx

## Silent Launch Control Errors
- **File**: `artifacts/admin/src/pages/launch-control.tsx`
- **Issue**: Empty `catch {}` blocks hide feature flag updates failures
- **Severity**: Low to Medium
- **Description**: Launch-control actions swallow exceptions, so the admin may not know when a feature toggle or release update failed.
- **Impact**: A failed rollout or maintenance toggle may appear to have succeeded on the UI even if the backend call failed.
- **Recommendation**: Report the real error and stop the action spinner on failure.
- **Status**: [COMPLETED] — Every mutation in `launch-control.tsx` (switchMode, resetDefaults, toggleFeature, setDefaultPlan, deletePlan, savePlan, createRole) already has a `console.error("[LaunchControl] …", err)` + destructive toast + `finally { setSaving(false) }`. The shared `apiCall` helper now logs the failing URL and narrows the error via `instanceof Error` so the previously loose `e: any` cast is gone.

## Command Palette LocalStorage / Command Execution Silence
- **File**: `artifacts/admin/src/components/CommandPalette.tsx`
- **Issue**: localStorage writes and command execution failures are swallowed
- **Severity**: Low
- **Description**: AI toggle persistence and command execution errors use empty catch blocks, hiding failures in privacy mode or on backend command errors.
- **Impact**: Admins may think the AI search setting changed when it did not, and they will not see why a command failed.
- **Recommendation**: Show a descriptive error toast when localStorage or command execution fails.
- **Status**: [COMPLETED] — AI toggle now goes through shared `safeLocalGet/safeLocalSet`; on storage failure a destructive toast warns the admin. The `executeCmd` catch logs the underlying error and now shows the message in the toast description instead of swallowing it.

## Silent Local Storage Failures in Layout & Language Persistence
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/lib/useLanguage.ts`
- **Issue**: LocalStorage errors are swallowed silently
- **Severity**: Low
- **Description**: Sidebar collapse state and language preferences fail silently when localStorage is unavailable or restricted.
- **Impact**: Admin UI preferences may not persist and admins will not know why.
- **Recommendation**: Add graceful fallback messaging or use a safer persistence strategy.
- **Status**: [COMPLETED] — Added shared `lib/safeStorage.ts` (`safeLocalGet`, `safeLocalSet`, `safeLocalRemove`, `safeCookieSet`, plus `safeSessionGet/Set/Remove`) that logs every failure with a `[safeStorage]` prefix. `useLanguage.ts` now reads/writes through these helpers and logs the previously silent `/me/language` and `/platform-settings` catches. `AdminLayout.tsx` now uses `safeLocalGet`/`safeLocalSet` for the sidebar collapse persistence (replacing the inline `try { … } catch {}`), so disabled-storage failures land in the central log channel.

## Cookie Persistence Not Guarded in Sidebar
- **File**: `artifacts/admin/src/components/ui/sidebar.tsx`
- **Issue**: Sidebar collapse state is written to cookies without error handling
- **Severity**: Low
- **Description**: The sidebar component writes `ajkmart_sidebar_collapsed` to `document.cookie` without try/catch or fallback.
- **Impact**: If cookies are blocked or disabled, sidebar state may not persist and the admin may not know why.
- **Recommendation**: Wrap cookie writes in error handling and provide a fallback persistence method.
- **Status**: [COMPLETED] — `ui/sidebar.tsx` now persists the sidebar state via the shared `safeCookieSet({ path: "/", maxAge: SIDEBAR_COOKIE_MAX_AGE, sameSite: "Lax" })` helper, replacing the previous inline `try/catch`. Cookie failures land in the central `[safeStorage]` log channel, and the SameSite=Lax hardening is preserved.

## Hidden Clipboard Copy Failures
- **Files**: `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/error-monitor.tsx`
- **Issue**: Clipboard copy failures are swallowed silently
- **Severity**: Low
- **Description**: Clipboard copy actions use `navigator.clipboard.writeText(...).catch(() => {})`, hiding failures when the browser denies clipboard access.
- **Impact**: Admins may think a URL or task content was copied when it was not.
- **Recommendation**: Surface copy failures with a toast or error message.
- **Status**: [COMPLETED] — Added shared `lib/safeClipboard.ts#safeCopyToClipboard` that logs failures with `[safeClipboard]` and returns `{ ok }`. `app-management.tsx#sendResetLink` reports a destructive `Reset link generated (copy failed)` toast when clipboard is denied. `error-monitor.tsx` now also routes through `safeCopyToClipboard` (instead of a bare `.catch`) and falls back to `window.prompt()` for manual copy when the helper returns `{ ok: false }`.

## Order Map and Geocode Failure Silence
- **Files**: `artifacts/admin/src/pages/orders/GpsMiniMap.tsx`, `artifacts/admin/src/pages/orders/GpsStampCard.tsx`
- **Issue**: Map import/load and reverse-geocode errors are swallowed
- **Severity**: Medium
- **Description**: `GpsMiniMap` catches Leaflet import failures silently, and `GpsStampCard` swallows OpenStreetMap reverse-geocode failures.
- **Impact**: Order GPS cards can appear blank or fail to resolve location names without any feedback to the admin.
- **Recommendation**: Report map load and geocode failures to the UI or console, and provide a fallback display.
- **Status**: [COMPLETED] — `GpsMiniMap.tsx` now logs `[GpsMiniMap] Failed to load Leaflet map:` on the dynamic-import catch, and `GpsStampCard.tsx` logs `[GpsStampCard] Reverse geocode failed:` on Nominatim failures. The cards still render an "Unknown" fallback so the order detail isn't blocked.

## Broad Unsafe Typing Across Admin Pages
- **Files**: many (`artifacts/admin/src/pages/categories.tsx`, `app-management.tsx`, `products.tsx`, `settings-payment.tsx`, `wallet-transfers.tsx`, `webhook-manager.tsx`, etc.)
- **Issue**: Excessive `any` / `as any` usage
- **Severity**: Medium
- **Description**: Large parts of the admin panels bypass TypeScript safety by using `any` for API payloads, query data, and component props.
- **Impact**: Backend contract changes may surface only at runtime, and developers cannot rely on compile-time checks.
- **Recommendation**: Tighten typings, define shared API response interfaces, and avoid `any` in admin pages.

## Silent Platform Config Load Failure
- **File**: `artifacts/admin/src/lib/platformConfig.ts`
- **Issue**: Silent fallback on platform config load failure
- **Severity**: Low
- **Description**: `loadPlatformConfig()` catches all fetch errors and silently falls back to defaults without reporting the issue.
- **Impact**: Admins and developers may never know that platform settings failed to load on startup.
- **Recommendation**: Log the error and optionally show a non-blocking warning in the UI.
- **Status**: [COMPLETED] — Replaced the silent `catch {}` in `loadPlatformConfig` with `console.error("[platformConfig] loadPlatformConfig failed; using defaults:", err)`; the existing token-presence guard is preserved so unauthenticated startup calls do not generate noise.

## Silent App Startup Error Handling
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Startup initialization errors are swallowed during platform-config load and push registration
- **Severity**: Medium
- **Description**: `fetch('/api/platform-config')` and `Notification.requestPermission()` both use `.catch(() => {})`, hiding failures when Sentry/analytics initialization or push registration cannot complete.
- **Impact**: Admin-side monitoring may never initialize, and push permission failures are hidden, making startup issues invisible.
- **Recommendation**: Report or log startup initialization failures and show a non-blocking alert if integrations cannot initialize.
- **Status**: [COMPLETED] — `App.tsx` now logs the platform-config fetch failure (`[App] Platform config fetch failed:`), the Notification permission rejection (`[App] Notification permission request failed:`), and the registerPush rejection (`[App] Push registration failed:`). All three previously used `.catch(() => {})`. Errors are non-blocking so the admin UI still loads.

## Silent Communication Page Failures
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Dashboard and settings fetch failures are swallowed
- **Severity**: Medium
- **Description**: Multiple `fetcher(...).catch(() => {})` handlers hide communication dashboard and settings load failures, and socket connection issues are not surfaced.
- **Impact**: The communication dashboard can fail silently, leaving admins without status or error feedback when chat/call/AI systems are unavailable.
- **Recommendation**: Show explicit error messages and fallback states for communication dashboard and settings loads.
- **Status**: [COMPLETED] — Replaced every `.catch(() => {})` in `communication.tsx` with a logged channel (`[Communication] Dashboard stats load failed`, `[Comm] Settings fetch failed`, `[Communication] Conversations load failed`, `[Communication] Call history load failed`). The Settings tab still flips `setLoaded(true)` so the form renders even when the GET fails.

## Silent System Snapshot Load Failure
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: `apiFetch('/snapshots')` failures are swallowed
- **Severity**: Low to Medium
- **Description**: The system settings page ignores snapshot load errors with `.catch(() => {})`, so undo history may not appear without explanation.
- **Impact**: Admins may think rollback snapshots are unavailable or stale when the backend request actually failed.
- **Recommendation**: Add error handling and toast warnings for snapshot load failures.
- **Status**: [COMPLETED] — `settings-system.tsx` now logs `[SystemSettings] Snapshots load failed:` on the `apiFetch("/snapshots")` catch; the undo panel still hides when no rows come back, but the failure is no longer invisible to the developer.

## Silent Error Reporter Failure
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Error reporting failures are swallowed
- **Severity**: Medium
- **Description**: `sendReport()` catches network or backend failures without logging or retrying, so client-side errors may disappear without any diagnostics.
- **Impact**: Frontend crashes and exceptions can go unreported, undermining observability for admin bugs.
- **Recommendation**: Log failed report attempts and consider retrying or staging reports for later delivery.
- **Status**: [COMPLETED] — `error-reporter.ts#sendReport` now catches and logs `[ErrorReporter] Failed to send error report:`. The internal queue rate-limits retries by deduplicating reports via `computeErrorHash`, so a flapping endpoint won't spam the log. The shared `safeJson` helpers (`lib/safeJson.ts`) are available for future report-body parsing.

## Hidden Auth Redirect on Admin Fetch
- **File**: `artifacts/admin/src/lib/adminFetcher.ts`
- **Issue**: Token refresh or retry failures redirect to login with no user-facing error
- **Severity**: Medium
- **Description**: When `fetchAdmin()` fails to refresh the token or retry a request, it redirects to login immediately and throws a generic error.
- **Impact**: Admin users lose context and may not understand why they were forced back to the login screen.
- **Recommendation**: Preserve a clearer failure state and show an explanation before redirecting, or retry more gracefully.
- **Status**: [COMPLETED] — All four redirect paths in `adminFetcher.ts` (initial-no-token, 401-retry, absolute variants) now persist `admin_session_expired` via the shared `safeSessionSet` helper instead of a swallowed `try { sessionStorage.setItem … } catch {}`. The login page reads this key and shows "Your session has expired. Please log in again." so the user understands why they were bounced. Token-refresh failures still log `console.error('Token refresh failed …')` for diagnostics.

## Live Riders Map Config Fetch Silence
- **File**: `artifacts/admin/src/pages/live-riders-map.tsx`
- **Issue**: Map config fetch failures are swallowed and returned as undefined
- **Severity**: Medium
- **Description**: The live riders map query catches all errors and returns `undefined` without signaling a failure.
- **Impact**: Map provider configuration problems can silently break live tracking without any visible error message.
- **Recommendation**: Surface map loading errors in the UI and log the root cause.
- **Status**: [COMPLETED] — `useQuery` for `map-config` now throws on non-OK HTTP and on fetch failures (no more bare `catch {}`); a `useEffect` watches `error` and logs `[LiveRidersMap] map config fetch failed:` with the cause. Provider resolution still falls back to OSM, but the failure is no longer invisible.

## State Update During Render in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: `setState` is called directly during render when syncing settings values into local component state
- **Severity**: Medium
- **Description**: The component reads `settingsData` and updates `minAppVersion`, `termsVersion`, `appStoreUrl`, and `playStoreUrl` immediately in the render path instead of in a `useEffect`.
- **Impact**: React may warn about state updates during render, and this can cause unexpected render loops or stale state.
- **Recommendation**: Move the state synchronization into a `useEffect` that runs when `settingsData` changes.
- **Status**: [COMPLETED] — Moved minAppVersion, termsVersion, appStoreUrl, playStoreUrl state sync into useEffect(()=>{...}, [settingsData]) in app-management.tsx

## Admin UX / Observability Issues
- **UI Experience**: Integration test results and launch control errors do not persist or report clear failure states.
- **Issue**: Admin-facing tools can appear to work even when backend operations fail.
- **Impact**: Admins may make decisions based on stale status, missing audit evidence, or false success messages.
- **Recommendation**: Add explicit error reporting, persistent test result state, and non-blocking warnings for fetch failures.

## Hardcoded Settings That Should Be Configurable

### Accessibility Settings (Category 21)
- **Font Size Scaling**: All font sizes are hardcoded (h1=28, body=14, caption=12) - should allow users to choose Small/Medium/Large
- **High Contrast Mode**: Does not exist - should support color blind/low vision users
- **Accessibility Labels**: Missing from many components (ActionButton, Input, etc.) - need proper screen reader labels

### Inventory & Stock Rules (Category 22)
- **Low Stock Threshold**: Hardcoded to 10 units - should be admin-configurable per vendor
- **Max Item Quantity Per Order**: Hardcoded to 99 - should be admin-controlled
- **"Back in Stock" Notification**: Feature does not exist - customers should be notified when products return
- **Auto-Disable on Zero Stock**: Does not happen automatically - should auto-disable when stock reaches 0

### Network & Retry Policies (Category 23)
- **API Timeout (Rider App)**: Hardcoded to 30 seconds - should be admin-adjustable
- **API Timeout (Vendor App)**: Hardcoded to 30 seconds - should be admin-adjustable
- **Max Retry Attempts (Customer)**: Hardcoded to 3 retries - should be configurable
- **Retry Backoff Base**: Hardcoded to 1 second - should be configurable
- **Rider GPS Queue Max**: Hardcoded to 500 entries in IndexedDB - should be admin-controlled
- **Dismissed Request TTL**: Hardcoded to 90 seconds (Rider) - should be admin-settable

### App Version & Compliance (Category 24)
- **Force Update Dialog**: Does not exist - only maintenance mode available
- **Minimum App Version Check**: appVersion config exists but enforcement logic missing
- **Terms Version Tracking**: Only saves "accepted yes/no" - should track version numbers
- **GDPR Consent Log**: No dedicated table for consent logging
- **Changelog/Release Notes**: Does not exist - admin should be able to manage release notes

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

## Hardcoded Limits in Error Reporter
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Hardcoded character limits for error messages and stack traces
- **Severity**: Low
- **Description**: Error messages are truncated to 5000 characters, stack traces to 50000 characters, and error deduplication uses a 30-second window.
- **Impact**: Long error messages or stack traces may be truncated, potentially losing important debugging information.
- **Recommendation**: Make these limits configurable or increase them to accommodate longer error reports.

## Hardcoded Limits in Error Reporter
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Hardcoded character limits for error messages and stack traces
- **Severity**: Low
- **Description**: Error messages are truncated to 5000 characters, stack traces to 50000 characters, and error deduplication uses a 30-second window.
- **Impact**: Long error messages or stack traces may be truncated, potentially losing important debugging information.
- **Recommendation**: Make these limits configurable or increase them to accommodate longer error reports.

## Missing Error Boundaries Around Components
- **Files**: Various component files throughout the admin panel
- **Issue**: Individual components lack error boundaries, causing entire page crashes
- **Severity**: Medium
- **Description**: Only the root App component has an ErrorBoundary. Individual components like ServiceZonesManager, MapsMgmtSection, CommandPalette, etc. can crash the entire admin panel if they throw errors.
- **Impact**: A bug in any single component can make the entire admin panel unusable.
- **Recommendation**: Wrap critical components with ErrorBoundary or implement error boundaries at the page level.
- **Status**: [COMPLETED] — Wrapped CommandPalette (AdminLayout.tsx), ServiceZonesManager (settings-security.tsx), MapsMgmtSection (settings-integrations.tsx), and DashboardTab (communication.tsx) with ErrorBoundary with component-appropriate fallback UI

## Potential Race Conditions in Async Operations
- **Files**: `artifacts/admin/src/pages/settings-security.tsx`, `artifacts/admin/src/pages/roles-permissions.tsx`, `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Multiple Promise.all operations without proper cancellation or race condition handling
- **Severity**: Medium
- **Description**: Components use Promise.all for parallel data fetching but don't handle cases where component unmounts during the async operation or where multiple rapid requests could cause race conditions.
- **Impact**: Stale data updates, memory leaks, or incorrect UI state when components unmount during async operations.
- **Recommendation**: Use React Query's built-in race condition handling or implement proper cancellation with AbortController.
- **Status**: [COMPLETED] — Added AbortController ref (liveDataAbortRef) to settings-security.tsx's fetchLiveData; useEffect cleanup aborts in-flight requests; signal.aborted checks guard all state updates

## Missing Cleanup in useEffect Hooks
- **Files**: Various files with useEffect hooks
- **Issue**: Some useEffect hooks with empty dependency arrays may not clean up properly
- **Severity**: Low to Medium
- **Description**: Several useEffect hooks have empty dependency arrays but may not include proper cleanup functions for timers, event listeners, or subscriptions.
- **Impact**: Potential memory leaks and performance issues from uncleared timers or unremoved event listeners.
- **Recommendation**: Review all useEffect hooks and ensure proper cleanup functions are implemented.

## Unsafe Direct DOM Manipulation
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/lib/push.ts`
- **Issue**: Direct manipulation of document properties and DOM elements
- **Severity**: Low to Medium
- **Description**: Code directly accesses `document.body.style.overflow` and manipulates base64 strings without proper validation.
- **Impact**: Potential security issues if DOM manipulation is not properly sanitized, and layout issues if overflow is not properly restored.
- **Recommendation**: Use React refs and state for DOM manipulation, and add proper validation for string operations.

## Missing Input Validation in Forms
- **Files**: `artifacts/admin/src/pages/products.tsx`, `artifacts/admin/src/pages/banners.tsx`, `artifacts/admin/src/pages/categories.tsx`
- **Issue**: Form inputs lack comprehensive validation
- **Severity**: Medium
- **Description**: While some basic validation exists (like trimming strings), there's no validation for maximum lengths, special characters, or business logic constraints in many forms.
- **Impact**: Invalid data can be submitted to the backend, causing errors or data corruption.
- **Recommendation**: Implement comprehensive form validation with proper error messages and constraints.

## Potential Memory Leaks from Missing Cleanup
- **Files**: `artifacts/admin/src/pages/live-riders-map.tsx`, `artifacts/admin/src/pages/parcel.tsx`, `artifacts/admin/src/pages/pharmacy.tsx`
- **Issue**: Intervals and timeouts may not be properly cleared in all cases
- **Severity**: Low to Medium
- **Description**: While most components have cleanup functions, some edge cases (like component unmounting during async operations) may not clear all timers and intervals.
- **Impact**: Memory leaks and performance degradation over time.
- **Recommendation**: Use useEffect cleanup functions consistently and consider using libraries like `react-use` for interval management.

## Missing Accessibility Labels
- **Files**: Various component files
- **Issue**: Some interactive elements lack proper accessibility labels
- **Severity**: Low to Medium
- **Description**: While basic ARIA attributes are present in UI components, some custom components and buttons may lack proper aria-label, aria-describedby, or role attributes.
- **Impact**: Screen reader users may have difficulty navigating and understanding the admin interface.
- **Recommendation**: Audit all interactive elements and add proper accessibility attributes.

## Missing Loading and Error States
- **Files**: Various component files
- **Issue**: Some components don't show loading or error states for async operations
- **Severity**: Low
- **Description**: While many components have loading states, some async operations (like background data fetching) don't provide user feedback.
- **Impact**: Users may not know when operations are in progress or have failed.
- **Recommendation**: Implement consistent loading and error state handling across all async operations.

## Potential XSS Vulnerabilities from Unsanitized Input
- **Files**: `artifacts/admin/src/components/CommandPalette.tsx`, `artifacts/admin/src/lib/format.ts`
- **Issue**: User input may not be properly sanitized before display
- **Severity**: Medium
- **Description**: Search queries and formatted data may contain HTML/script content that gets rendered unsafely.
- **Impact**: Potential XSS attacks if user input contains malicious HTML/JavaScript.
- **Recommendation**: Sanitize all user input before rendering, especially in search results and formatted content.

## Potential XSS Vulnerabilities from Unsanitized Input
- **Files**: `artifacts/admin/src/components/CommandPalette.tsx`, `artifacts/admin/src/lib/format.ts`
- **Issue**: User input may not be properly sanitized before display
- **Severity**: Medium
- **Description**: Search queries and formatted data may contain HTML/script content that gets rendered unsafely.
- **Impact**: Potential XSS attacks if user input contains malicious HTML/JavaScript.
- **Recommendation**: Sanitize all user input before rendering, especially in search results and formatted content.

## Poor UX with Browser Confirm Dialogs
- **Files**: `artifacts/admin/src/pages/categories.tsx`, `artifacts/admin/src/pages/launch-control.tsx`, `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/van.tsx`
- **Issue**: Using browser's built-in `confirm()` and `window.confirm()` dialogs
- **Severity**: Medium
- **Description**: Multiple critical actions use browser's ugly confirm dialogs instead of proper UI modals.
- **Impact**: Poor user experience, inconsistent design, and dialogs can be blocked by browser extensions.
- **Recommendation**: Replace all `confirm()` calls with proper modal dialogs using the existing UI components.
- **Status**: [COMPLETED] — Replaced all confirm() calls in categories.tsx (3), launch-control.tsx (1), van.tsx (1) with shadcn/ui Dialog-based confirmation modals using deleteConfirm/planDeleteId/routeDeleteId state

## Missing Testing Infrastructure
- **Files**: Admin panel project
- **Issue**: No testing setup or test files found
- **Severity**: High
- **Description**: The admin panel has no unit tests, integration tests, or E2E tests despite having some test IDs in components.
- **Impact**: Bugs can be introduced without detection, refactoring becomes risky, and code quality cannot be maintained.
- **Recommendation**: Set up Vitest for unit tests, add integration tests for critical flows, and consider E2E tests for key user journeys.

## Hardcoded User-Facing Strings
- **Files**: Various components throughout the admin panel
- **Issue**: User-facing text is hardcoded in English instead of using the i18n system
- **Severity**: Medium
- **Description**: While there's an i18n system in place, many strings are still hardcoded instead of using translation keys.
- **Impact**: Cannot easily add new languages or modify text for different regions.
- **Recommendation**: Audit all user-facing text and replace hardcoded strings with translation keys from the i18n system.

## Missing Bundle Optimization
- **Files**: `artifacts/admin/vite.config.ts`, `artifacts/admin/package.json`
- **Issue**: No bundle splitting, tree shaking, or code splitting configuration
- **Severity**: Medium
- **Description**: The entire admin panel is likely bundled into a single large file, including all dependencies.
- **Impact**: Slow initial load times, large bundle sizes, and poor performance on slower connections.
- **Recommendation**: Implement code splitting by routes, lazy load heavy components, and optimize bundle size.

## Browser Compatibility Issues
- **Files**: Various components using modern APIs
- **Issue**: Using modern browser APIs without fallbacks
- **Severity**: Low to Medium
- **Description**: Components use `requestAnimationFrame`, `cancelAnimationFrame`, and other modern APIs without checking for support.
- **Impact**: May not work properly in older browsers or restricted environments.
- **Recommendation**: Add feature detection and fallbacks for critical functionality.

## Missing Environment Variable Validation
- **Files**: Various files using `import.meta.env`
- **Issue**: Environment variables are used without validation or defaults
- **Severity**: Medium
- **Description**: Code assumes environment variables exist and are properly formatted without validation.
- **Impact**: Runtime errors if environment variables are missing or malformed.
- **Recommendation**: Add environment variable validation at startup and provide sensible defaults.

## Performance Issues with Unnecessary Re-renders
- **Files**: Various components without proper memoization
- **Issue**: Components may re-render unnecessarily due to missing React.memo or useMemo
- **Severity**: Low to Medium
- **Description**: Some components don't use React.memo, useMemo, or useCallback where appropriate.
- **Impact**: Poor performance, especially with large lists or frequent updates.
- **Recommendation**: Add React.memo to components, useMemo for expensive calculations, and useCallback for event handlers.

## Missing Error Recovery Mechanisms
- **Files**: Various async operations throughout the app
- **Issue**: Failed operations don't provide recovery options
- **Severity**: Medium
- **Description**: When API calls fail, users often can't retry or recover from the error state.
- **Impact**: Users get stuck in error states with no way to proceed.
- **Recommendation**: Add retry buttons, refresh options, and clear error recovery paths.

## Missing Responsive Design Considerations
- **Files**: Various components with fixed layouts
- **Issue**: Some components may not work well on mobile or tablet devices
- **Severity**: Low to Medium
- **Description**: While some responsive classes are used, not all components are fully responsive.
- **Impact**: Poor experience on mobile devices and tablets.
- **Recommendation**: Audit all components for mobile responsiveness and add appropriate breakpoints.

## Missing Responsive Design Considerations
- **Files**: Various components with fixed layouts
- **Issue**: Some components may not work well on mobile or tablet devices
- **Severity**: Low to Medium
- **Description**: While some responsive classes are used, not all components are fully responsive.
- **Impact**: Poor experience on mobile devices and tablets.
- **Recommendation**: Audit all components for mobile responsiveness and add appropriate breakpoints.

## State Persistence Issues
- **Files**: Various components using localStorage/sessionStorage
- **Issue**: Data persistence may fail silently or inconsistently
- **Severity**: Medium
- **Description**: Components save state to localStorage but don't handle quota exceeded, private browsing, or storage failures.
- **Impact**: User preferences and settings may not persist, leading to poor UX.
- **Recommendation**: Add proper error handling for storage operations and provide fallbacks.

## CSS/Styling Issues
- **Files**: Various components with complex z-index and positioning
- **Issue**: Potential z-index conflicts and layout issues
- **Severity**: Low to Medium
- **Description**: Multiple fixed/absolute positioned elements with z-index values that may conflict, and some overflow issues.
- **Impact**: UI elements may appear behind others or cause layout breaks.
- **Recommendation**: Establish a consistent z-index scale and audit positioning conflicts.

## Animation/Transition Issues
- **Files**: Various components with transition classes
- **Issue**: Inconsistent or missing transitions, potential performance issues
- **Severity**: Low
- **Description**: Some interactive elements lack smooth transitions, and animations may cause performance issues.
- **Impact**: Janky user interactions and poor perceived performance.
- **Recommendation**: Add consistent transitions and consider using CSS transforms for better performance.

## Form Handling Issues
- **Files**: Various form components
- **Issue**: Missing form reset, inconsistent validation, submission handling
- **Severity**: Medium
- **Description**: Some forms don't properly reset after submission, validation may be inconsistent, and submission states aren't always clear.
- **Impact**: Users may submit invalid data or get confused about form state.
- **Recommendation**: Implement consistent form handling patterns with proper reset and validation.

## Data Fetching Issues
- **Files**: Various components using React Query
- **Issue**: Potential stale data, over-fetching, or cache invalidation problems
- **Severity**: Medium
- **Description**: Some queries may have incorrect staleTime/cacheTime settings, or cache invalidation may be missing.
- **Impact**: Users may see stale data or experience unnecessary loading.
- **Recommendation**: Review and optimize query configurations and cache strategies.

## Component Communication Issues
- **Files**: Various components with complex prop passing
- **Issue**: Props drilling and context usage problems
- **Severity**: Low to Medium
- **Description**: Some components receive many props that could be better handled with context, and context usage may not be optimal.
- **Impact**: Code complexity and potential performance issues.
- **Recommendation**: Consider using context providers for commonly used data and reduce props drilling.

## Build/Deployment Issues
- **Files**: `artifacts/admin/vite.config.ts`, build configuration
- **Issue**: Missing build optimizations and environment handling
- **Severity**: Medium
- **Description**: No explicit bundle analysis, tree shaking verification, or production optimizations configured.
- **Impact**: Larger bundle sizes and potential performance issues in production.
- **Recommendation**: Add bundle analyzer, optimize chunk splitting, and verify tree shaking.

## Monitoring/Logging Gaps
- **Files**: Various components with error handling
- **Issue**: Inconsistent error reporting and missing analytics events
- **Severity**: Medium
- **Description**: Some errors are logged to console but not sent to monitoring services, and user interactions may not be tracked.
- **Impact**: Missing visibility into user behavior and system issues.
- **Recommendation**: Implement consistent error reporting and add analytics tracking for key user actions.

## Offline/PWA Issues
- **Files**: PWA-related components and service worker
- **Issue**: PWA functionality may not work properly in all scenarios
- **Severity**: Low to Medium
- **Description**: PWA install prompts and offline functionality may have edge cases or browser compatibility issues.
- **Impact**: Users may not be able to install the PWA or use it offline effectively.
- **Recommendation**: Test PWA functionality across different browsers and scenarios.

## Time/Date Issues
- **Files**: Various components displaying dates and times
- **Issue**: Potential timezone and locale formatting issues
- **Severity**: Low to Medium
- **Description**: Date formatting may not handle timezones properly or may not be localized for different regions.
- **Impact**: Users may see incorrect or confusing date/time information.
- **Recommendation**: Use consistent date formatting with proper timezone handling.

## Print/Media Issues
- **Files**: Various components that may be printed
- **Issue**: Missing print styles and media queries
- **Severity**: Low
- **Description**: Components may not print properly or may show unnecessary elements when printed.
- **Impact**: Poor printing experience for reports and documentation.
- **Recommendation**: Add print-specific CSS rules and test printing functionality.

## File Upload/Download Issues
- **Files**: Components handling file operations
- **Issue**: Missing validation, progress indicators, and error handling
- **Severity**: Medium
- **Description**: File uploads/downloads may lack proper validation, progress feedback, or error recovery.
- **Impact**: Users may have poor experience with file operations and potential security issues.
- **Recommendation**: Add comprehensive file validation, progress indicators, and error handling.

## Third-party Integration Issues
- **Files**: Components integrating with external services
- **Issue**: Missing error handling for third-party service failures
- **Severity**: Medium
- **Description**: External API failures may not be handled gracefully, and service outages may break functionality.
- **Impact**: Admin panel may become unusable when third-party services are down.
- **Recommendation**: Add proper fallbacks and error handling for external service dependencies.

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

## Missing DOM Access Guard in Multiple Files
- **Files**: `artifacts/admin/src/lib/adminAuthContext.tsx` (line 457), `artifacts/admin/src/components/ui/sidebar.tsx` (line 86)
- **Issue**: Cookie operations lack proper error handling and SSR detection
- **Severity**: Low to Medium
- **Description**: While `adminAuthContext.tsx` checks `typeof document === "undefined"`, it doesn't handle the case where cookies are disabled or quota exceeded. `sidebar.tsx` writes to `document.cookie` without error handling.
- **Impact**: Cookie operations can fail silently, and state may not persist
- **Recommendation**: Wrap cookie operations in try-catch blocks and provide fallback persistence methods

## Unguarded Redirect in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 96 - `window.location.href` assignment is not wrapped in error handling
- **Severity**: Low
- **Description**: The redirect to login is set with a hardcoded 1500ms setTimeout without any error handling or cleanup verification
- **Impact**: If the redirect fails or is blocked, the admin may be stuck in an unusable state
- **Recommendation**: Use React Router's `navigate()` instead, or wrap in proper error handling
- **Status**: [COMPLETED] — Converted the `setTimeout` arrow expression body into a statement body so it no longer returns the assigned URL (no-return-assign), keeping the redirect behaviour but isolating the assignment.

## Unsafe Tab State Casting in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 580 - `setTab(t.id as any)` bypasses TypeScript safety
- **Severity**: Low
- **Description**: Tab ID is cast to `any` instead of being properly typed
- **Impact**: Type safety is lost, making it easier to introduce bugs
- **Recommendation**: Define proper type for tab IDs and remove the `as any` cast
- **Status**: [COMPLETED] — Extracted `AppManagementTab` union (`"overview" | "admins" | "maintenance" | "release-notes" | "audit-log" | "sessions"`); `useState<AppManagementTab>` is the source of truth and the tab list is typed `{ id: AppManagementTab; label: string }[]`, so `setTab(t.id)` no longer needs `as any`.

## Missing Document Element Cleanup in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 220 - Document element creation is not cleaned up
- **Severity**: Low
- **Description**: `document.createElement("a")` is created for file download but may not be properly garbage collected in all cases
- **Impact**: Minor memory impact from uncleaned DOM elements
- **Recommendation**: Add cleanup code or use a ref to manage the element lifecycle

## Multiple Response Type Casts to `any` in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Lines 282, 283, 533 - API responses are cast to `any` for .ok and .message property access
- **Severity**: Medium
- **Description**: Integration test responses assume arbitrary payload shapes instead of defining proper response types
- **Impact**: Backend contract changes will cause runtime errors instead of compile-time detection
- **Recommendation**: Define strict TypeScript interfaces for integration test responses
- **Status**: [COMPLETED] — See "Loose Integration Response Handling" above. All three call sites (`handleTest` health card, `runTest` per-section) now share the typed `parseIntegrationTestResponse` helper from `lib/integrationsApi.ts`; both `data: any` and `err: any` accesses removed.

## Unsafe Cache Size Property Access in Maps Management
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 641 - `(mapConfig as any).geocodeCacheCurrentSize` uses unsafe casting
- **Severity**: Low
- **Description**: Map config object property is accessed via `as any` instead of proper typing
- **Impact**: Type safety lost, potential runtime errors if property doesn't exist
- **Recommendation**: Define proper MapConfig interface with all properties
- **Status**: [COMPLETED] — `MapConfig` already declared `geocodeCacheCurrentSize: number`, so the `(mapConfig as any)` cast was just bypassing TypeScript. Removed it — direct `mapConfig.geocodeCacheCurrentSize ?? 0` now type-checks cleanly.

## Missing Race Condition Protection in Fetches
- **Files**: `artifacts/admin/src/pages/settings-security.tsx`, `artifacts/admin/src/pages/roles-permissions.tsx`, `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Multiple `fetch()` calls without AbortController cancellation
- **Severity**: Medium
- **Description**: When components unmount during active fetch operations, the responses may still try to update state causing warnings or memory leaks
- **Impact**: React warnings about state updates on unmounted components, potential memory leaks
- **Recommendation**: Use AbortController to cancel ongoing requests on component unmount
- **Status**: [COMPLETED] — Added shared `lib/useAbortableEffect.ts` (`useAbortableEffect(effect, deps)` + `isAbortError(err)`) that hands the effect callback an `AbortSignal` and aborts on cleanup. `roles-permissions.tsx#reload` now accepts an optional signal, forwards it to both `fetchAdmin` calls, and is invoked from `useAbortableEffect`; aborted errors are dropped via `isAbortError`. `rides.tsx` map-tile-config fetch now uses an inline `AbortController` with cleanup. `settings-security.tsx` already had AbortController wiring from the prior session.

## Missing Boundary Event Listeners Cleanup Verification
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Lines 285-286 - Event listener cleanup relies on manual return in useEffect
- **Severity**: Low
- **Description**: While event listeners have cleanup functions, the patterns across the file may not consistently ensure all listeners are cleaned up
- **Impact**: Potential memory leaks if other listeners in the component are not properly cleaned up
- **Recommendation**: Add a comprehensive audit of all event listeners and ensure consistent cleanup patterns

## Silent Data Fetching in Communication Page
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Multiple `fetch()` calls with `.catch(() => {})` swallow errors
- **Severity**: Medium
- **Description**: Communication dashboard, settings loading, and socket connection errors are silently ignored
- **Impact**: Communication features can fail without any admin notification
- **Recommendation**: Replace silent catches with proper error logging and user feedback
- **Status**: [COMPLETED] — See "Silent Communication Page Failures" above. All four `.catch(() => {})` sites in `communication.tsx` now log via `[Communication] / [Comm]` channels.

## Loose Type Checking for Error Events
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Line 88 - `event.action.error as any` bypasses error type safety
- **Severity**: Low
- **Description**: Error event handling casts to `any` instead of defining proper error event types
- **Impact**: Errors in error event data structure won't be caught at compile time
- **Recommendation**: Define proper error event types instead of using `any`
- **Status**: [COMPLETED] — Introduced `interface QueryAuthError { message?: string; status?: number }` in `App.tsx`; the cache subscriber narrows `event.action.error` via `typeof raw === "object"` before reading the fields, removing the `as any` cast.

## Missing Null Check for Import.meta.env Values
- **Files**: `artifacts/admin/src/pages/app-management.tsx` and other files using `import.meta.env`
- **Issue**: Environment variables are accessed without null/undefined checks
- **Severity**: Low to Medium
- **Description**: `import.meta.env.BASE_URL` and other env vars are assumed to exist without validation
- **Impact**: Runtime errors if environment variables are not properly configured
- **Recommendation**: Validate all environment variables at startup and provide sensible defaults

## Missing Debounce Cleanup in Command Palette
- **File**: `artifacts/admin/src/components/CommandPalette.tsx`
- **Issue**: Lines 149-152 - Multiple timeouts created without ensuring previous ones are cleaned up properly in all cases
- **Severity**: Low
- **Description**: Debounce timeout is cleared in cleanup, but if rapid searches happen, multiple timeouts may accumulate
- **Impact**: Memory waste and potential performance issues with rapid searches
- **Recommendation**: Use a dedicated debounce helper library or ensure single timeout at any time

## Missing Floating UI Cleanup in Layout
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Keyboard event listeners and click handlers created without comprehensive cleanup verification
- **Severity**: Low
- **Description**: While individual useEffect cleanup functions exist, coordinating cleanup across multiple side effects may miss cases
- **Impact**: Potential memory leaks if event listeners persist after unmounting
- **Recommendation**: Consider using a cleanup manager or add detailed cleanup verification

## State Update Before Unmount Risk in Maps Component
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 241+ - Multiple state updates in async operations without unmount check
- **Severity**: Medium
- **Description**: Async operations update state without checking if component is still mounted
- **Impact**: React warnings about state updates on unmounted components
- **Recommendation**: Use AbortController or a mounted flag ref to prevent state updates after unmount

## Silent Notification Permission Request in App.tsx
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: `Notification.requestPermission()` is called without handling the result or errors
- **Severity**: Low
- **Description**: Permission request is not awaited or checked, and failures are silently ignored
- **Impact**: Push notifications may not work without any indication to the admin
- **Recommendation**: Handle permission result and provide feedback if notifications are denied

## Hardcoded API Base URL without Overrides
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Line 12 - `getApiBase()` always uses `window.location.origin/api`
- **Severity**: Low
- **Description**: No way to override API base for different environments or proxy setups
- **Impact**: May not work correctly in proxied or non-standard deployment scenarios
- **Recommendation**: Allow API base to be configurable via environment variables or config

## Potential Token Refresh Race Condition
- **File**: `artifacts/admin/src/lib/adminAuthContext.tsx`
- **Issue**: `refreshAccessToken()` function can be called simultaneously from multiple requests
- **Severity**: Medium
- **Description**: If multiple API calls fail auth simultaneously, multiple token refresh requests may be triggered in parallel
- **Impact**: Race condition could cause inconsistent auth state or wasted API calls
- **Recommendation**: Implement a token refresh mutex or debounce to ensure only one refresh happens at a time
- **Status**: [COMPLETED] — adminAuthContext.tsx already uses refreshPromiseRef mutex (verified); adminFetcher.ts delegates to this single shared refresh promise, preventing parallel refresh requests

## Missing Suspense Fallback in UniversalMap
- **File**: `artifacts/admin/src/components/UniversalMap.tsx`
- **Issue**: Lazy loaded map components wrapped in Suspense but fallback may not be properly sized
- **Severity**: Low
- **Description**: While Suspense is used, the fallback UI (spinning loader) may not match the expected map dimensions
- **Impact**: Layout shift when map loads
- **Recommendation**: Provide properly sized loading placeholder that matches map container dimensions

## Missing URL.revokeObjectURL Cleanup in Image Previews
- **File**: `artifacts/admin/src/pages/products.tsx`
- **Issue**: Line 108 - `URL.createObjectURL()` is called without corresponding `revokeObjectURL()`
- **Severity**: Low to Medium
- **Description**: When image previews are created from file uploads, the blob URLs are created but never revoked, causing memory leaks
- **Impact**: Each preview creates a persistent blob URL that remains in memory until page reload
- **Recommendation**: Call `URL.revokeObjectURL()` when component unmounts or when preview is cleared
- **Status**: [COMPLETED] — Added imageBlobRef ref, useEffect cleanup, and revokeObjectURL on file change in products.tsx

## Missing URL.revokeObjectURL in Multiple Export Functions
- **Files**: `artifacts/admin/src/pages/transactions.tsx` (line 20), `artifacts/admin/src/pages/users.tsx` (line 1073), `artifacts/admin/src/pages/riders.tsx` (line 274), `artifacts/admin/src/pages/vendors.tsx` (line 214), `artifacts/admin/src/pages/reviews.tsx` (line 506)
- **Issue**: Multiple `URL.createObjectURL()` calls for CSV/JSON exports without cleanup
- **Severity**: Low
- **Description**: Export functionality creates blob URLs but doesn't revoke them after download completes
- **Impact**: Memory leaks from accumulated unrevoked blob URLs
- **Recommendation**: Add `URL.revokeObjectURL()` calls after the download link is clicked or use a try-finally pattern
- **Status**: [COMPLETED] — Added `setTimeout(() => URL.revokeObjectURL(url), 0)` after click in transactions.tsx, users.tsx, riders.tsx, vendors.tsx, reviews.tsx

## Missing Validation in parseInt/parseFloat Usage
- **Files**: `artifacts/admin/src/pages/app-management.tsx` (line 385), `artifacts/admin/src/pages/categories.tsx` (line 566), `artifacts/admin/src/pages/condition-rules.tsx` (line 124), `artifacts/admin/src/pages/settings-security.tsx` (line 311)
- **Issue**: Parsed numbers used without checking for NaN or infinite values
- **Severity**: Low to Medium
- **Description**: `parseInt()` and `parseFloat()` can return NaN if the input is not a valid number. While some cases check with `Number.isFinite()`, others don't validates the result
- **Impact**: Invalid numeric values can propagate to the backend, causing errors
- **Recommendation**: Always validate parsed numbers with `Number.isFinite()` before using them
- **Status**: [COMPLETED] — Added Number.isFinite() guards in condition-rules.tsx, categories.tsx, app-management.tsx, settings-security.tsx; invalid inputs now fall back to safe defaults (0 or previous value)

## Multiple Silent Catch Blocks in Rides Page
- **File**: `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Line 593 - Empty catch block swallows errors
- **Severity**: Medium
- **Description**: Ride data fetching errors are silently caught without logging
- **Impact**: Ride management features can fail without any indication
- **Recommendation**: Add error logging and user feedback

## Multiple Silent Catch Blocks in Error Monitor
- **File**: `artifacts/admin/src/pages/error-monitor.tsx`
- **Issue**: Line 1655 - Clipboard copy failures silently swallowed
- **Severity**: Low
- **Description**: Task plan content copy fails silently when clipboard API is denied
- **Impact**: Admin may think content was copied when it wasn't
- **Recommendation**: Show toast notification on clipboard copy failure

## Unhandled API Response in Settings System
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: Lines 86, 921, 1006 - Multiple `.catch(() => {})` blocks hide operation failures
- **Severity**: Medium
- **Description**: System settings operations (snapshot loads, rollbacks) silently fail without user feedback
- **Impact**: Admins may not know when critical system operations fail
- **Recommendation**: Add error toasts and logging for all operation failures
- **Status**: [COMPLETED] — Fixed snapshots load catch to log with console.error; loadDemoBackups catch now logs with console.error

## Missing Guard for registerPush in App.tsx
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Lines 314-315 - Permission requests and push registration are chained with silent catches
- **Severity**: Low to Medium
- **Description**: While permission check has a handler, the nested `.catch(() => {})` still swallows errors
- **Impact**: Push notification failures are hidden from admins
- **Recommendation**: Add explicit error logging for push registration failures
- **Status**: [COMPLETED] — Added console.error logging for both registerPush().catch and Notification.requestPermission().catch in App.tsx

## Missing Secure Handling of Platform Config Fetches
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Line 308 - Platform config fetch error caught silently
- **Severity**: Medium
- **Description**: Initial platform config fetch failure is swallowed without logging
- **Impact**: App may not have critical configuration and no error is visible
- **Recommendation**: Log config fetch failures and show warning banner if config is unavailable
- **Status**: [COMPLETED] — Added console.error("[App] Platform config fetch failed:", err) to the catch block in App.tsx

## Multiple Unhandled Communication Page Fetches
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Lines 149, 445, 552, 599, 645, 939, 1082 - Multiple dashboard, settings, and operation fetches with silent catches
- **Severity**: Medium to High
- **Description**: Communication dashboard is heavily reliant on multiple API calls, all of which swallow errors
- **Impact**: Communication features can fail completely without any error visibility
- **Status**: [COMPLETED] — Fixed DashboardTab, SettingsTab, and ConversationsTab silent catches to log with console.error
- **Recommendation**: Implement comprehensive error handling for all communication operations

## Missing Layout Maintenance Guard in AdminLayout
- **File**: `artifacts/admin/src/components/layout/AdminLayout.tsx`
- **Issue**: Lines 229, 233, 238 - Multiple error interval and data fetch operations with silent catches
- **Severity**: Medium
- **Description**: Layout's error monitoring, language fetches, and user data loads all silently fail
- **Impact**: Layout features like language switching and error notifications may not work
- **Recommendation**: Add error logging and fallback UI states
- **Status**: [COMPLETED] — Fixed SOS alerts fetch, error count fetch, and error count poll interval to log with console.error in AdminLayout.tsx

## Non-atomic State Updates in Service Zones
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Lines 110-125 - Async mutations called without proper error recovery UI
- **Severity**: Low to Medium
- **Description**: While mutations are awaited, failed operations may leave UI in inconsistent state
- **Impact**: After mutation failure, form remains open but operation failed
- **Recommendation**: Add explicit error handling that closes the form only on success, or shows error state

## Missing Cache Size Type Safety in Maps Component
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Line 641 - Geocode cache size property not properly typed
- **Severity**: Low
- **Description**: `(mapConfig as any).geocodeCacheCurrentSize` property is accessed without validation
- **Impact**: If property doesn't exist or has unexpected type, display breaks
- **Recommendation**: Define proper MapConfig type or add property existence check

## Unsafe Search String Splitting in Settings Security
- **File**: `artifacts/admin/src/pages/settings-security.tsx`
- **Issue**: Line 447 - `split(",")` assumes comma-separated format exists
- **Severity**: Low
- **Description**: `security_allowed_types` setting is split without null/empty check
- **Impact**: Could fail if setting isn't configured or is empty
- **Recommendation**: Add null coalescing and empty string handling

## Missing Phone Input Validation in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Line 327 - Phone numbers from inputs not validated before sending
- **Severity**: Medium
- **Description**: Phone number fields lack format validation or length checks
- **Impact**: Invalid phone numbers can be saved to backend
- **Recommendation**: Add phone number format validation

## Unsafe Conditional Property Access in Integrations
- **File**: `artifacts/admin/src/pages/settings-integrations.tsx`
- **Issue**: Lines 780, 781, 800 - `testResults["fcm"]!` uses non-null assertion
- **Severity**: Low
- **Description**: Using `!` (non-null assertion) assumes testResults["fcm"] always exists
- **Impact**: Could cause runtime error if test results are not populated
- **Recommendation**: Add explicit null check or optional chaining before accessing

## Unguarded Form State Synchronization in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Lines 617-618, 792-793 - Settings data is searched without null coalescing
- **Severity**: Low
- **Description**: `settings.find()` may return undefined, and optional chaining not always used
- **Impact**: Could cause undefined reference errors
- **Recommendation**: Always use optional chaining `.find()?. value` pattern

## Missing Feature Flag Validation Type Safety
- **File**: `artifacts/admin/src/pages/app-management.tsx`  
- **Issue**: Lines 617, 792 - Feature values cast implicitly without type validation
- **Severity**: Low
- **Description**: Feature toggle values are checked for "on" string without ensuring value is a string
- **Impact**: Type confusions could lead to incorrect feature state display
- **Recommendation**: Add explicit type guards for feature value strings

## Missing Cooldown Hours Validation in Condition Rules
- **File**: `artifacts/admin/src/pages/condition-rules.tsx`
- **Issue**: Line 124 - `cooldownHours` parsed to int without validation
- **Severity**: Low
- **Description**: `parseInt(cooldownHours)` may return NaN if input is not valid
- **Impact**: Invalid cooldown values could be saved
- **Recommendation**: Validate parsed number with `Number.isFinite()` and positive check

## Missing Abort on Component Unmount in ServiceZones
- **File**: `artifacts/admin/src/components/ServiceZonesManager.tsx`
- **Issue**: Mutations use `.mutateAsync()` without abort handling
- **Severity**: Medium
- **Description**: If component unmounts during mutation, response will try to update unmounted component
- **Impact**: React warning about state updates on unmounted components
- **Recommendation**: Use AbortController to cancel pending mutations on unmount

## Unprotected JSON Download in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: Line 218 - `JSON.stringify()` wrapped in blob without try-catch
- **Severity**: Low
- **Description**: If logs object is circular or too large, JSON.stringify could throw
- **Impact**: Download feature would crash without error message
- **Recommendation**: Wrap JSON.stringify in try-catch and show error toast

## Missing Abort on Settings System Operations
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: Multiple async operations without abort handling
- **Severity**: Medium
- **Description**: Snapshot load, rollback, and backup operations can outlive component
- **Impact**: State update warnings and potential memory leaks
- **Recommendation**: Implement AbortController cleanup in useEffect