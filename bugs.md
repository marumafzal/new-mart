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

## Silent Error Handling in Maps Management
- **File**: `artifacts/admin/src/components/MapsMgmtSection.tsx`
- **Issue**: Empty catch blocks marked as "non-critical"
- **Severity**: Low to Medium
- **Description**: Lines 230, 238 have `catch { /* non-critical */ }` for loading usage data and map config.
- **Impact**: Failures in loading usage statistics or map configuration are silently ignored.
- **Recommendation**: At minimum, log these errors for monitoring purposes.

## Potential XSS Risk
- **File**: `artifacts/admin/src/components/UniversalMap.tsx`
- **Issue**: Use of `dangerouslySetInnerHTML` with `m.iconHtml`
- **Severity**: Medium
- **Description**: Marker icons are rendered using `dangerouslySetInnerHTML={{ __html: m.iconHtml }}` where `iconHtml` is a string prop.
- **Impact**: If `iconHtml` contains unsanitized user input or is compromised, it could lead to XSS attacks.
- **Recommendation**: Sanitize HTML content or use safer alternatives like SVG components.

## Chart Component XSS Risk
- **File**: `artifacts/admin/src/components/ui/chart.tsx`
- **Issue**: Use of `dangerouslySetInnerHTML`
- **Severity**: Low
- **Description**: Chart component uses `dangerouslySetInnerHTML` for rendering chart content.
- **Impact**: Potential XSS if chart data is not properly validated.
- **Recommendation**: Review and ensure all chart data is sanitized.

## Silent Security Section Failures
- **File**: `artifacts/admin/src/pages/settings-security.tsx`
- **Issue**: Several `catch {}` blocks swallow fetch and MFA errors
- **Severity**: Medium
- **Description**: Live security dashboard fetches, MFA setup/verify/disable calls, and some API requests ignore errors and do not report why the action failed.
- **Impact**: Admins may see stale or empty security panels and cannot diagnose why integration or security operations failed.
- **Recommendation**: Surface errors to the UI/toast and log failures for diagnostics.

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

## Missing Toggle Key Support in Settings Renderer
- **File**: `artifacts/admin/src/pages/settings-render.tsx`
- **Issue**: `TOGGLE_KEYS` is missing multiple boolean settings keys.
- **Severity**: Medium
- **Description**: Keys such as `google_maps_enabled`, `mapbox_enabled`, `osm_enabled`, `locationiq_enabled`, `map_failover_enabled`, `comm_enabled`, `comm_chat_enabled`, `comm_voice_calls_enabled`, `comm_voice_notes_enabled`, `comm_translation_enabled`, `comm_chat_assist_enabled`, `auth_phone_otp_enabled`, `auth_email_otp_enabled`, `auth_username_password_enabled`, `auth_email_register_enabled`, `auth_magic_link_enabled`, `auth_2fa_enabled`, `auth_biometric_enabled`, and `auth_captcha_enabled` are not included in `TOGGLE_KEYS`.
- **Impact**: These boolean settings may be rendered as text fields or not behave as toggle controls, causing incorrect admin UI semantics and broken configuration handling.
- **Recommendation**: Add missing boolean setting keys to `TOGGLE_KEYS` and verify the renderer correctly displays them as toggles.

## Silent Launch Control Errors
- **File**: `artifacts/admin/src/pages/launch-control.tsx`
- **Issue**: Empty `catch {}` blocks hide feature flag updates failures
- **Severity**: Low to Medium
- **Description**: Launch-control actions swallow exceptions, so the admin may not know when a feature toggle or release update failed.
- **Impact**: A failed rollout or maintenance toggle may appear to have succeeded on the UI even if the backend call failed.
- **Recommendation**: Report the real error and stop the action spinner on failure.

## Command Palette LocalStorage / Command Execution Silence
- **File**: `artifacts/admin/src/components/CommandPalette.tsx`
- **Issue**: localStorage writes and command execution failures are swallowed
- **Severity**: Low
- **Description**: AI toggle persistence and command execution errors use empty catch blocks, hiding failures in privacy mode or on backend command errors.
- **Impact**: Admins may think the AI search setting changed when it did not, and they will not see why a command failed.
- **Recommendation**: Show a descriptive error toast when localStorage or command execution fails.

## Silent Local Storage Failures in Layout & Language Persistence
- **Files**: `artifacts/admin/src/components/layout/AdminLayout.tsx`, `artifacts/admin/src/lib/useLanguage.ts`
- **Issue**: LocalStorage errors are swallowed silently
- **Severity**: Low
- **Description**: Sidebar collapse state and language preferences fail silently when localStorage is unavailable or restricted.
- **Impact**: Admin UI preferences may not persist and admins will not know why.
- **Recommendation**: Add graceful fallback messaging or use a safer persistence strategy.

## Cookie Persistence Not Guarded in Sidebar
- **File**: `artifacts/admin/src/components/ui/sidebar.tsx`
- **Issue**: Sidebar collapse state is written to cookies without error handling
- **Severity**: Low
- **Description**: The sidebar component writes `ajkmart_sidebar_collapsed` to `document.cookie` without try/catch or fallback.
- **Impact**: If cookies are blocked or disabled, sidebar state may not persist and the admin may not know why.
- **Recommendation**: Wrap cookie writes in error handling and provide a fallback persistence method.

## Hidden Clipboard Copy Failures
- **Files**: `artifacts/admin/src/pages/app-management.tsx`, `artifacts/admin/src/pages/error-monitor.tsx`
- **Issue**: Clipboard copy failures are swallowed silently
- **Severity**: Low
- **Description**: Clipboard copy actions use `navigator.clipboard.writeText(...).catch(() => {})`, hiding failures when the browser denies clipboard access.
- **Impact**: Admins may think a URL or task content was copied when it was not.
- **Recommendation**: Surface copy failures with a toast or error message.

## Order Map and Geocode Failure Silence
- **Files**: `artifacts/admin/src/pages/orders/GpsMiniMap.tsx`, `artifacts/admin/src/pages/orders/GpsStampCard.tsx`
- **Issue**: Map import/load and reverse-geocode errors are swallowed
- **Severity**: Medium
- **Description**: `GpsMiniMap` catches Leaflet import failures silently, and `GpsStampCard` swallows OpenStreetMap reverse-geocode failures.
- **Impact**: Order GPS cards can appear blank or fail to resolve location names without any feedback to the admin.
- **Recommendation**: Report map load and geocode failures to the UI or console, and provide a fallback display.

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

## Silent App Startup Error Handling
- **File**: `artifacts/admin/src/App.tsx`
- **Issue**: Startup initialization errors are swallowed during platform-config load and push registration
- **Severity**: Medium
- **Description**: `fetch('/api/platform-config')` and `Notification.requestPermission()` both use `.catch(() => {})`, hiding failures when Sentry/analytics initialization or push registration cannot complete.
- **Impact**: Admin-side monitoring may never initialize, and push permission failures are hidden, making startup issues invisible.
- **Recommendation**: Report or log startup initialization failures and show a non-blocking alert if integrations cannot initialize.

## Silent Communication Page Failures
- **File**: `artifacts/admin/src/pages/communication.tsx`
- **Issue**: Dashboard and settings fetch failures are swallowed
- **Severity**: Medium
- **Description**: Multiple `fetcher(...).catch(() => {})` handlers hide communication dashboard and settings load failures, and socket connection issues are not surfaced.
- **Impact**: The communication dashboard can fail silently, leaving admins without status or error feedback when chat/call/AI systems are unavailable.
- **Recommendation**: Show explicit error messages and fallback states for communication dashboard and settings loads.

## Silent System Snapshot Load Failure
- **File**: `artifacts/admin/src/pages/settings-system.tsx`
- **Issue**: `apiFetch('/snapshots')` failures are swallowed
- **Severity**: Low to Medium
- **Description**: The system settings page ignores snapshot load errors with `.catch(() => {})`, so undo history may not appear without explanation.
- **Impact**: Admins may think rollback snapshots are unavailable or stale when the backend request actually failed.
- **Recommendation**: Add error handling and toast warnings for snapshot load failures.

## Silent Error Reporter Failure
- **File**: `artifacts/admin/src/lib/error-reporter.ts`
- **Issue**: Error reporting failures are swallowed
- **Severity**: Medium
- **Description**: `sendReport()` catches network or backend failures without logging or retrying, so client-side errors may disappear without any diagnostics.
- **Impact**: Frontend crashes and exceptions can go unreported, undermining observability for admin bugs.
- **Recommendation**: Log failed report attempts and consider retrying or staging reports for later delivery.

## Hidden Auth Redirect on Admin Fetch
- **File**: `artifacts/admin/src/lib/adminFetcher.ts`
- **Issue**: Token refresh or retry failures redirect to login with no user-facing error
- **Severity**: Medium
- **Description**: When `fetchAdmin()` fails to refresh the token or retry a request, it redirects to login immediately and throws a generic error.
- **Impact**: Admin users lose context and may not understand why they were forced back to the login screen.
- **Recommendation**: Preserve a clearer failure state and show an explanation before redirecting, or retry more gracefully.

## Live Riders Map Config Fetch Silence
- **File**: `artifacts/admin/src/pages/live-riders-map.tsx`
- **Issue**: Map config fetch failures are swallowed and returned as undefined
- **Severity**: Medium
- **Description**: The live riders map query catches all errors and returns `undefined` without signaling a failure.
- **Impact**: Map provider configuration problems can silently break live tracking without any visible error message.
- **Recommendation**: Surface map loading errors in the UI and log the root cause.

## State Update During Render in App Management
- **File**: `artifacts/admin/src/pages/app-management.tsx`
- **Issue**: `setState` is called directly during render when syncing settings values into local component state
- **Severity**: Medium
- **Description**: The component reads `settingsData` and updates `minAppVersion`, `termsVersion`, `appStoreUrl`, and `playStoreUrl` immediately in the render path instead of in a `useEffect`.
- **Impact**: React may warn about state updates during render, and this can cause unexpected render loops or stale state.
- **Recommendation**: Move the state synchronization into a `useEffect` that runs when `settingsData` changes.

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

## Potential Race Conditions in Async Operations
- **Files**: `artifacts/admin/src/pages/settings-security.tsx`, `artifacts/admin/src/pages/roles-permissions.tsx`, `artifacts/admin/src/pages/rides.tsx`
- **Issue**: Multiple Promise.all operations without proper cancellation or race condition handling
- **Severity**: Medium
- **Description**: Components use Promise.all for parallel data fetching but don't handle cases where component unmounts during the async operation or where multiple rapid requests could cause race conditions.
- **Impact**: Stale data updates, memory leaks, or incorrect UI state when components unmount during async operations.
- **Recommendation**: Use React Query's built-in race condition handling or implement proper cancellation with AbortController.

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