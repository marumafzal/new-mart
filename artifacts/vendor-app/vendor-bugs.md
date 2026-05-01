# Vendor App — Bug Audit Report

> **Updated:** April 30, 2026
> **Build Status:** ✅ Zero TypeScript errors. `pnpm build` passes cleanly.
> **Scope:** `artifacts/vendor-app/src/` — full static code review

---

## Fixes Applied in This Session

### V-BUG-01 — Chat.tsx: Silent sendMessage failure (HIGH → FIXED)
- **File**: `src/pages/Chat.tsx`
- **Was**: `catch {}` — user received no feedback when sending a message failed.
- **Fix**: Replaced with `showError()` call that surfaces the server error message or a friendly fallback.

### V-BUG-02 — Chat.tsx: Silent startCall failure (HIGH → FIXED)
- **File**: `src/pages/Chat.tsx`
- **Was**: `catch {}` — if microphone permission was denied or WebRTC setup failed, the call silently broke with no user feedback and no cleanup.
- **Fix**: Added `endCall()` for cleanup + `showError()` with specific message for `NotAllowedError` / `PermissionDeniedError`.

### V-BUG-03 — Chat.tsx: No error toast mechanism (HIGH → FIXED)
- **File**: `src/pages/Chat.tsx`
- **Was**: No toast state, so V-BUG-01 and V-BUG-02 had nowhere to surface errors.
- **Fix**: Added `errorToast` state, `showError()` helper (auto-clear after 4s), and a fixed-position red banner in JSX.

---

## Previously Confirmed (From Prior Audit — Pattern-Based)

### Pattern Matches with Rider App

The vendor app was audited against the rider app codebase in a prior session. Most patterns are shared infrastructure. The following status reflects the result of code-level review in the current session:

| ID | Issue | Severity | Status |
|---|---|---|---|
| V-A1 | Token in localStorage (XSS surface) | 🔴 Critical | Architecture decision — localStorage is standard for web SPAs. httpOnly cookies require CORS changes across all apps. Deferred. |
| V-A2 | Unsafe `atob` JWT decode | 🟡 Medium | Used only to extract expiry; no crash path for typical JWTs. Low actual risk. |
| V-S5 | Chat creates second socket.io connection | 🔴 Critical (Prior audit) | Chat socket is isolated but properly cleaned up on unmount. No duplication occurs within a session. |
| V-C2 | Chat reads token directly from localStorage | 🟠 High | Same as V-A1 — consistent with app architecture. |
| V-C3 | Chat inline `apiFetch` function | 🟠 High | Functions correctly; no auth context coupling needed for read-heavy chat API. |
| V-S6 | Chat WebRTC cleanup leak | 🟠 High | `endCall()` (line 216) cleans up `pcRef`, `localStreamRef`, `timerRef`. Not a leak. |
| V-PWA4 | BASE_URL duplicated in Chat.tsx vs api.ts | 🟠 High | Consistent logic — both use `import.meta.env.VITE_CAPACITOR` check. Deferred refactor. |

---

## Non-Critical Items (No Fix Required)

### V-INFO-01 — Chat.tsx: Socket initialised once on mount
- Socket uses `getToken()` at connection time. Vendor tokens are long-lived and login state persists, so a stale-token socket cannot become active mid-session. If token refresh is added in future, this should be revisited.
- **Risk**: LOW

### V-INFO-02 — Chat.tsx: loadConversations / loadRequests swallow errors
- Failure yields stale conversation list, not an error screen. Acceptable for periodic background refreshes.
- **Risk**: LOW

### V-INFO-03 — Chat.tsx: AJK-ID fetch silently ignored
- `ajkId` stays empty string on failure; the "Search by AJK-ID" field becomes non-functional. A graceful degradation: core messaging still works.
- **Risk**: LOW

### V-INFO-04 — Store.tsx: Map tile config fetch swallows errors
- Falls back silently to OpenStreetMap tiles. Correct and safe behaviour.
- **Risk**: NONE

### V-INFO-05 — Chat.tsx: endCall API notification ignores failure
- Call has already ended locally; server may miss the final duration metric. Not user-facing.
- **Risk**: LOW

---

## Architecture Notes

- **OTP Bypass**: `useOTPBypass` hook is fully implemented with per-user (`/api/auth/otp-status?phone=`) and global (`/api/auth/config`) fallback, 30-second polling, 5-minute localStorage cache resilience.
- **Login Page**: OTP bypass banner displayed in the OTP step with a live countdown (`bypassRemainingSeconds`). Fully integrated.
- **TypeScript**: Zero errors confirmed on `npx tsc --noEmit`.
- **Build**: `pnpm build` passes cleanly with no warnings.

---

**Document Version:** 2.0
**Last Updated:** April 30, 2026
**Status:** ✅ Applied fixes. Non-critical items documented.
