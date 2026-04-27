# Rider App Bug Audit

Static review of `artifacts/rider-app/src/`. No bugs were fixed; this is a triage backlog. Backend code is out of scope. Every cited file path and line range was verified to be in-bounds against the current source tree at the time of writing.

---

## Severity summary

| Severity | Count |
|---|---|
| Critical | 3  |
| High     | 14 |
| Medium   | 40 |
| Low      | 21 |
| **Total**| **78** |

(Entry IDs A6, R1, R2, R4, O1, U7, PWA2, PWA3 were removed during validation as either incorrect against current source or speculative future-tense risks rather than concrete present-day defects. The remaining IDs are kept stable rather than renumbered, so gaps are intentional.)

#### Deduped unique backlog (for sprint planning)

The 78 entries above are organised by area so each section reads standalone. After collapsing the 7 cross-section duplicate pairs enumerated in the duplicates list below, and excluding entries that are engineering debt rather than user-facing defects, the deduped triage backlog looks like this:

| Slice | Count |
|---|---|
| Unique items after merging the 7 cross-section duplicate pairs | **71** (= 78 − 7) |
| ↳ engineering debt rather than user-facing defects | **9** (R3, U3, W2, PF4, PF6, PF7, T1, T2, T3 — note PWA4 and T4 were already removed via dedupe) |
| ↳ concrete defects | **62** |

Treat the deduped Critical and High concrete defects as the launch-blocker set; the 9 debt items belong on a separate hardening backlog.

#### Categorization & dedupe notes for downstream triage

- **Defect vs debt.** Most entries are concrete defects (functional break, race, leak, security weakness). A small number are improvement debt that doesn't manifest as a user-facing failure today; flag them for separate triage rather than treating them as launch blockers. The debt-leaning entries (raw, before dedupe) are: **R3** (eager imports / bundle-size), **U3** (god-component pages), **W2** (transactions pagination), **PF4** (lazy-loading), **PF6** (IDB connection reuse), **PF7** (flush debounce), **PWA4** (Capacitor base-URL duplication), and the type-safety section **T1–T4** — 11 raw items, of which 9 remain after collapsing the duplicates listed below (PWA4 and T4 are duplicates of C1 and S1 respectively).
- **Cross-section duplicates (same root cause, listed in multiple sections so each reads standalone).** Treat these as a single backlog item:
  - **A1 ↔ S-Sec1** — token storage in `localStorage`.
  - **C1 ↔ PWA4** — Chat hard-coding `/api` is an instance of the broader Capacitor base-URL duplication.
  - **C2 ↔ S-Sec2** — Chat reading the rider token directly from `localStorage`.
  - **C7 ↔ PWA7** — incoming-call ringtone gap.
  - **PF3 ↔ S2/S3** — heartbeat/battery effect churn.
  - **S1 ↔ T4** — socket `auth` mutation; T4 is the type-safety facet.
  - **A4 ↔ S-Sec8** — auto-firing social login from an effect.
  - After collapsing these **7** duplicate pairs, the unique-backlog count is **71** (matching the planning table above — single source of truth).

Severity rubric:

- **Critical** — data loss, account takeover, mid-trip breakage, or persistent crash.
- **High** — feature broken for many users, security weakness, or significant UX failure.
- **Medium** — degraded behaviour, race condition, perf/battery regression, or maintenance hazard.
- **Low** — code smell, missing i18n, minor leak, or hardening opportunity.

Per-entry template — every entry includes:

- **File:** path + verified in-bounds line range(s)
- **Description:** the defect
- **Trigger / repro:** the action or condition that exposes it
- **Suggested fix:** the recommended remediation

---

## Table of contents

- [Auth](#auth)
- [Routing](#routing)
- [Real-time / Socket](#real-time--socket)
- [GPS / Location](#gps--location)
- [Order Flow](#order-flow)
- [Wallet](#wallet)
- [Chat](#chat)
- [Profile / Settings](#profile--settings)
- [UI / UX](#ui--ux)
- [Performance](#performance)
- [Type Safety](#type-safety)
- [Security](#security)
- [PWA / Capacitor](#pwa--capacitor)

---

## Auth

### A1 — Access + refresh tokens stored in `localStorage` (XSS = full takeover) — Critical
- **File:** `src/lib/api.ts` lines 5–7, 22–42, 332–339
- **Description:** Both `TOKEN_KEY` and `REFRESH_KEY` are written to `localStorage` (`sessionSet` / `localSet`). Any XSS — a malicious dependency, a markdown injection in announcements, a third-party SDK gone rogue — can read both tokens at once. The in-source comment claims server-side `tokenVersion` is the security boundary, but an attacker with both tokens can refresh indefinitely until the rider notices and rotates manually.
- **Trigger / repro:** Inject a script (e.g. via a CSP-bypassing third-party widget) that reads `localStorage.getItem("ajkmart_rider_token")` and `localStorage.getItem("ajkmart_rider_refresh_token")`; the attacker now has long-lived authenticated access.
- **Suggested fix:** Move the refresh token to an HttpOnly, SameSite=Strict cookie; keep the short-lived access token in memory and rehydrate on tab open. If full cookie migration is not feasible, store the refresh token in IndexedDB behind a strict CSP that forbids inline script.

### A2 — Unsafe `atob` JWT decode (UTF-8 names crash silently) — Medium
- **File:** `src/lib/auth.tsx` lines 5–15
- **Description:** `decodeJwtExp` does `JSON.parse(atob(b64))`. `atob` is byte-oriented; any JWT payload whose claims contain non-ASCII characters (Urdu/Arabic names, emoji in `email`) throws and the function silently returns `null`, disabling proactive refresh entirely for that user.
- **Trigger / repro:** Sign in with a JWT whose `name` claim contains a non-Latin character such as `ا`. `decodeJwtExp` returns `null`; the proactive refresh timer is never scheduled, and the rider eventually hits 401 mid-trip when the access token expires.
- **Suggested fix:** Use a UTF-8-safe decoder, e.g. `decodeURIComponent(escape(atob(b64)))` or `new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))`.

### A3 — `scheduleProactiveRefresh` recurses without backoff or cap on transient failure — High
- **File:** `src/lib/auth.tsx` lines 90–96
- **Description:** The catch branch immediately calls `scheduleProactiveRefresh(currentToken)` again. Because `decodeJwtExp` is computed from the same (already-expired) token, `refreshIn` collapses to the floor of `10_000` ms and the loop hammers `/auth/refresh` every 10 s for as long as the network is unhealthy. There is no `refreshFailCountRef` increment in this path despite the ref existing.
- **Trigger / repro:** Disable network until the access token is near expiry. Re-enable network briefly so the timer fires and the refresh hits a transient 5xx. The 10-second loop persists until the rider quits the app.
- **Suggested fix:** Track consecutive failures and apply exponential backoff (e.g. `min(60s * 2^n, 15m)`). After ~5 consecutive failures, bail and dispatch the existing `ajkmart:refresh-user-failed` event.

### A4 — Auto-trigger of social login can loop on failure — High
- **File:** `src/pages/Login.tsx` lines 516–519
- **Description:** `useEffect(() => { if (step === "input" && method === "google") handleSocialGoogle(); ... }, [step, method])` has no in-flight guard and no failure latch. `handleSocialGoogle`'s catch calls `handleAuthError`, which doesn't change `step` or `method`, so the next render still satisfies the predicate. Any provider error (popup blocked, network blip, lockout) re-fires the social flow on the next state change.
- **Trigger / repro:** Pick "Continue with Google" while popups are blocked. Each subsequent re-render — including typing in another input field — attempts a new GSI token request and re-pops the auth flow.
- **Suggested fix:** Add a `socialAttemptedRef`/state flag set inside the effect and cleared only when the user explicitly switches method back to phone/email/username; or move the trigger to an `onClick` so it never re-fires from an effect.

### A5 — Magic-link `useEffect` deps don't include `doLogin` — Medium
- **File:** `src/pages/Login.tsx` lines 253–271
- **Description:** The effect calls `doLogin(res)` but its deps array is `[login, navigate, setGlobalTwoFaPending]`. `doLogin` closes over `auth.lockoutEnabled`, `T`, and other config-derived values; the effect captures the stale instance defined on first render.
- **Trigger / repro:** Open a magic-link URL on a slow connection so platform config arrives after the link is verified; lockout policy and i18n strings reflect the pre-config defaults rather than the live config.
- **Suggested fix:** Wrap `doLogin` in `useCallback` and include it in the deps; or hoist the magic-link verification out of an effect into a one-shot `useRef`-guarded async runner.

### A7 — `finalize2fa` may strip a still-valid refresh token — Medium
- **File:** `src/pages/Login.tsx` lines 521–539
- **Description:** `refreshTk` falls back to `twoFaPending?.refreshToken`, but `api.storeTokens(finalToken, refreshTk)` is called with `refreshTk` possibly `undefined`. `storeTokens` only writes when `refreshToken` is truthy, so the previously-stored refresh token sticks. `queryClient.clear()` is not called here (only inside `login()` later), so intermediate query state can briefly include the prior user's data if a route change happens between `storeTokens` and `login`.
- **Trigger / repro:** Logout from user A; log in as user B with 2FA enabled. During the verify step, navigate to a page that reads cached queries — user A's data may flash for a frame.
- **Suggested fix:** Surface the 2FA-issued refresh token explicitly in the response and require it; clear the React Query cache before storing the new tokens.

### A8 — Approval-pending sign-out reload races state cleanup — Low
- **File:** `src/App.tsx` lines 131–134
- **Description:** `api.clearTokens(); window.location.reload();` clears local tokens but does not call `/auth/logout` to revoke the refresh token. Any other tab or background sync still holding the previous refresh token could keep refreshing.
- **Trigger / repro:** A rider with two browser tabs open clicks "Sign Out" on the approval-pending screen in tab A; tab B (which still holds the same refresh token) can continue refreshing the access token until the refresh token expires server-side.
- **Suggested fix:** `await api.logout(refreshToken)` (revoking server-side) before `window.location.reload()`; the same applies to the rejected screen at lines 148–151.

### A9 — Logout request after non-rider login uses just-stored credentials — Low
- **File:** `src/pages/Login.tsx` lines 291–301
- **Description:** `checkRiderRole` stores tokens, then fires `apiFetch("/auth/logout", ...).catch(() => {})` and immediately `clearTokens()`. The clear races the in-flight logout — if `clearTokens` wins on the next request, the logout retry has no bearer header. Errors are silently swallowed.
- **Trigger / repro:** Authenticate with a non-rider account (e.g. customer credentials) — the chained logout/clear sequence may leave the server with an un-revoked session if the request retries after the token clear.
- **Suggested fix:** `await api.logout(res.refreshToken)` before `clearTokens()`.

---

## Routing

### R3 — `Chat` is imported eagerly; full bundle on first paint — Low
- **File:** `src/App.tsx` line 33
- **Description:** Every page is statically imported including `Chat.tsx` (312 lines + WebRTC plumbing) and `Wallet.tsx`. Riders who never open chat still pay for the entire surface in the initial JS bundle.
- **Trigger / repro:** Inspect the production bundle — Chat, Wallet, VanDriver, and the wallet modals are all in the initial chunk regardless of whether the rider visits those screens.
- **Suggested fix:** `const Chat = lazy(() => import("./pages/Chat"))` plus `<Suspense>`; same for the other big pages (Active, Wallet, VanDriver).

---

## Real-time / Socket

### S1 — Socket token rotation mutates `s.auth` but never reconnects — High
- **File:** `src/lib/socket.tsx` lines 61–66
- **Description:** Every 10 s the interval rewrites `s.auth.token` in place. socket.io reads `auth` only at handshake time; the live connection keeps using the original token until it disconnects. After a refresh, server-side middleware that re-validates JWT on certain events will reject with the old token.
- **Trigger / repro:** Force a token rotation via `api.refreshToken()`; observe the socket continuing to send the stale `auth.token` on reconnect attempts triggered by transport drops within the next reconnection delay window.
- **Suggested fix:** When the access token changes, call `s.disconnect(); s.connect()` (or `s.io.opts.auth = { token: fresh }; s.connect()`). Trigger this from the auth context, not a polling interval.

### S2 — Heartbeat captures stale `batteryLevel` from closure — Medium
- **File:** `src/lib/socket.tsx` lines 81–104
- **Description:** `let batteryLevel: number | undefined;` is captured by `emitHeartbeat`. The first heartbeat (line 103) fires immediately, before `getBattery()` resolves, so it always sends `undefined`. The `levelchange` callback writes through the closure without anyone clearing the listener on cleanup; when this effect re-runs (e.g. on `socket` change at line 110), the previous battery listener still mutates the dead variable.
- **Trigger / repro:** Add a `console.log` in `emitHeartbeat` and watch heartbeats issued in the first ~100 ms after mount — `batteryLevel` is `undefined` for the first frame.
- **Suggested fix:** Hoist `batteryLevel` to a `useRef`, attach the battery listener once at the SocketProvider top level, and remove it on full unmount. Defer the first heartbeat until after `getBattery` resolves (or accept `undefined` and don't emit it).

### S3 — Heartbeat effect deps include `socket` causing reload churn — Medium
- **File:** `src/lib/socket.tsx` lines 77–110
- **Description:** Deps `[user?.isOnline, socket]`. Every time `setSocket` runs (on each connect/disconnect cycle) this effect tears down and rebuilds the heartbeat interval and battery listener — yet it reads `socketRef.current`, not `socket`. The dep is incorrect and forces extra renders.
- **Trigger / repro:** Toggle the socket connection state (e.g. by dropping the network briefly); each reconnection rebuilds the entire heartbeat machinery.
- **Suggested fix:** Drop `socket` from deps and rely on `socketRef.current`, or use `socket` directly without the ref.

### S4 — `s.disconnect()` on cleanup leaves listeners attached — Medium
- **File:** `src/lib/socket.tsx` lines 68–74
- **Description:** Cleanup disconnects the socket but does not call `s.removeAllListeners()`. socket.io retains handler references on the manager; under React fast-refresh or rapid login/logout, the previous handlers (which captured the dead provider's `setConnected`) keep firing on `connect_error` until GC.
- **Trigger / repro:** During development, hot-reload `socket.tsx` while connected — handlers from the previous module instance keep firing into stale state setters and warnings appear in the console.
- **Suggested fix:** `s.removeAllListeners(); s.disconnect();` in cleanup.

### S5 — Chat opens a SECOND socket.io connection — Critical
- **File:** `src/pages/Chat.tsx` lines 58–93
- **Description:** `Chat` instantiates its own `io(window.location.origin, ...)` at mount, in addition to the connection already maintained by `SocketProvider`. The rider thus appears to the server as two sockets, doubles every event the server emits to the user (the `comm:message:new` handler appends the same message twice in many race orders), and inflates concurrent-connection metering.
- **Trigger / repro:** Open Chat; have another user send a message. Inspect server-side socket connection count for this rider — two connections appear; in the UI the same message can render twice if both sockets join the conversation room.
- **Suggested fix:** Reuse the provider's socket via `const { socket } = useSocket();` and bind chat-specific listeners to that single instance.

### S6 — Chat socket cleanup leaks WebRTC peer + media stream + timer — High
- **File:** `src/pages/Chat.tsx` lines 53–94, 134–162
- **Description:** The unmount effect only calls `socket.disconnect()`. If the user navigates away mid-call, `pcRef.current` (RTCPeerConnection), `localStreamRef.current` (active mic), and `timerRef.current` (interval) are never closed. The mic indicator stays on, the peer keeps signalling, and the interval keeps firing into a dead state setter.
- **Trigger / repro:** Start a call from Chat; tap the BottomNav to leave Chat. The browser microphone indicator remains red and CPU usage stays elevated.
- **Suggested fix:** Call `endCall()` from cleanup, plus `pcRef.current?.close()`, `localStreamRef.current?.getTracks().forEach(t => t.stop())`, `clearInterval(timerRef.current)`.

### S7 — Chat handlers bound in `useEffect([])` never re-bind on user change — Medium
- **File:** `src/pages/Chat.tsx` lines 53–94
- **Description:** Empty deps mean if `useAuth().user` updates (logout/login in same tab — possible after token refresh) the socket and listeners still reference the previous user's identity captured at mount.
- **Trigger / repro:** Within Chat, sign out and sign in as a different user; chat events still route to the original socket session.
- **Suggested fix:** Move socket setup into an effect keyed on `[user?.id]`, mirroring `SocketProvider`.

### S8 — Inline incoming-call accept handler swaps `pcRef` without closing prior peer — High
- **File:** `src/pages/Chat.tsx` line 195 (the multi-statement inline arrow inside the accept button)
- **Description:** The handler unconditionally assigns `pcRef.current = pc;` without checking if a prior peer connection exists. If a stale RTCPeerConnection is still active (e.g. previous call's `endCall` failed or hasn't fired), the old peer is leaked and ICE traffic continues until GC.
- **Trigger / repro:** Trigger an incoming call while a previous call's RTCPeerConnection still exists (e.g. `endCall` raced with a new offer); inspect `chrome://webrtc-internals` — the prior peer remains active.
- **Suggested fix:** `pcRef.current?.close(); pcRef.current = pc;` and stop any prior `localStreamRef.current` tracks before requesting a new media stream.

---

## GPS / Location

### G1 — `drainQueue` `break`s on first chunk error, even transient — High
- **File:** `src/lib/gpsQueue.ts` lines 262–281 (esp. line 279)
- **Description:** When one chunk's batch fails, the loop `break`s and leaves all remaining chunks in IndexedDB until the next `online` event. Because `_draining` is set to false in `finally`, the next event will retry the whole queue, but the rider may be back offline by then — a single transient 5xx wedges drain.
- **Trigger / repro:** Queue several thousand pings while offline. Come back online and have the server return 503 once: drain stops mid-way, even though the connection itself is healthy.
- **Suggested fix:** `continue` instead of `break` for non-spoof errors so subsequent chunks still attempt; track failed chunks and retry them with backoff. Optionally schedule a `setTimeout(drainQueue, backoff)`.

### G2 — IndexedDB eviction may double-spend cursor onsuccess — Medium
- **File:** `src/lib/gpsQueue.ts` lines 86–99
- **Description:** When at `_maxQueueSize`, `cursor.delete()` and `store.put(ping)` are both called inside `cursorReq.onsuccess`. Performing a delete via index cursor and a put on the same store in the same `onsuccess` callback has historically aborted the transaction silently in older Firefox releases.
- **Trigger / repro:** Force the queue to its `_maxQueueSize` limit (e.g. by setting it low and going offline for a long ride) and observe behaviour in older Firefox builds.
- **Suggested fix:** Open the cursor with `IDBCursor.continue()` semantics, perform the delete first, then in a subsequent `tx.oncomplete` open a fresh write transaction for the put; or call `store.put(ping)` only after the delete request's own `onsuccess`.

### G3 — Per-call IDB connection open is wasteful and serializes drains — Medium
- **File:** `src/lib/gpsQueue.ts` lines 47–73 (`openDB`), used by every public function (76, 109, 124, 138, 156, 169, 181, 202, 225, 255)
- **Description:** Each `enqueue`/`dequeueAll`/`clearQueue` opens a fresh IndexedDB connection and closes it on `tx.oncomplete`. At a 30-second heartbeat plus per-watch ping enqueues that's hundreds of opens/day per device, each forcing a structured-clone handshake.
- **Trigger / repro:** Add `console.log` inside `openDB` and watch one continuous trip — multiple opens per minute.
- **Suggested fix:** Memoise a single `Promise<IDBDatabase>` in module scope and reuse it.

### G4 — `Home` `watchPosition` runs even when the rider is offline — Medium
- **File:** `src/pages/Home.tsx` lines 411–503
- **Description:** The watch is started inside an effect that does not gate on `user?.isOnline`. Riders who haven't gone online still burn battery on high-accuracy GPS.
- **Trigger / repro:** Sign in but stay offline (don't toggle "Go online"). Open the browser permissions panel — geolocation is active even though the rider is not accepting requests.
- **Suggested fix:** Gate the watch on `user?.isOnline === true` and tear it down on toggle off.

### G5 — Duplicate `watchPosition` between Home and Active during navigation — Medium
- **File:** `src/pages/Home.tsx` line 424, `src/pages/Active.tsx` (multiple watch effects between the location-related effect block lines 679–894)
- **Description:** Both pages start their own `navigator.geolocation.watchPosition`. While wouter swaps pages, both watches are alive simultaneously; on slow devices there's a 1–2 s overlap during which two GPS subscriptions are pinging.
- **Trigger / repro:** Accept a request on Home and let wouter navigate to Active. During the transition, two `watchId`s are alive — observed in `chrome://device-log`.
- **Suggested fix:** Lift the geolocation watch into a single hook (e.g. inside `SocketProvider` or a new `LocationProvider`) and have pages subscribe.

### G6 — `VanDriver` `getCurrentPosition` swallows errors silently — Medium
- **File:** `src/pages/VanDriver.tsx` lines 175–185
- **Description:** Error callback is `() => {}`. PERMISSION_DENIED, POSITION_UNAVAILABLE, and TIMEOUT all vanish; the broadcast appears to "work" while sending nothing. There is also no fallback when geolocation isn't available (the `if (navigator.geolocation)` guard skips silently).
- **Trigger / repro:** Deny location permission, then start a van trip — the broadcasting indicator says "on" and the interval keeps firing, but no positions reach the server.
- **Suggested fix:** Surface a UI banner on permission errors and stop the interval; degrade to a coarser `enableHighAccuracy: false` retry on TIMEOUT.

### G7 — `VanDriver` GPS interval can stack overlapping requests — Medium
- **File:** `src/pages/VanDriver.tsx` lines 175–185
- **Description:** Interval is 5000 ms, `getCurrentPosition` timeout is also 5000 ms. On weak GPS, request N+1 starts before N completes, queueing concurrent geolocation requests. Android Chrome will stack them and surface ANR-style stalls.
- **Trigger / repro:** Run a van trip in an area with weak GPS (basement, tunnel, urban canyon); observe the device performance counter while geolocation requests pile up.
- **Suggested fix:** Use `watchPosition` instead of an interval, or guard the interval with an in-flight flag.

### G8 — `VanDriver` GPS broadcast keeps running if `tripStatus` leaves `in_progress` externally — High
- **File:** `src/pages/VanDriver.tsx` lines 200–204
- **Description:** The effect only starts the broadcast on `tripStatus === "in_progress" && !broadcasting`. There is no symmetric `else` to call `stopGpsBroadcast()` when the trip transitions out of `in_progress` due to a server-side update (e.g. dispatcher cancels). The broadcast keeps emitting until the user navigates away.
- **Trigger / repro:** Have a dispatcher cancel an in-progress van trip server-side. The driver's app continues GPS broadcasting until they manually leave the screen.
- **Suggested fix:** Add an `else if (broadcasting) stopGpsBroadcast()` branch and include `broadcasting` in the deps.

---

## Order Flow

### O2 — Order-accept race leaves stale UI when competing rider wins — High
- **File:** `src/pages/Home.tsx` lines 546–567 (`acceptOrderMut`), 582–606 (`acceptRideMut`), 511–532 (`dismiss` callback consumed by both mutations)
- **Description:** When the rider taps Accept, the optimistic UI updates while the server may have already assigned the order to another rider. `onSuccess` invalidates queries, but until the refetch returns the rider sees "accepted" and may navigate to `/active` which then 404s.
- **Trigger / repro:** Two riders accept the same request simultaneously; the loser briefly sees a successful accept screen before being kicked back to Home.
- **Suggested fix:** Use `onSettled` to invalidate; rely on the server-confirmed payload before navigating.

### O3 — `updateOrderMut.mutationFn` shows toast inside the function — Low
- **File:** `src/pages/Active.tsx` lines 991–996, 1029–1034
- **Description:** The mutation function calls `showToast(...)` and `queueUpdate(...)` for the offline path then returns `Promise.reject`. Mixing imperative side-effects into the mutation function (instead of `onMutate`) double-fires toasts when React Query retries the mutation.
- **Trigger / repro:** Trigger the mutation while offline with `retry: 1` configured — the offline toast and queue both run twice.
- **Suggested fix:** Move the offline-queue logic to `onMutate` and let the mutation function be a pure async wrapper around `api.updateOrder`.

### O4 — `onError` toasts raw backend `e.message` (no i18n, no normalisation) — Medium
- **File:** `src/pages/Active.tsx` lines 1019–1023, 1046–1048, 1059
- **Description:** `showToast(e.message, true)` displays the literal English server error. Riders on Urdu locale see English; sensitive details may also leak.
- **Trigger / repro:** Trigger any backend 4xx for an order/ride update while the app is in Urdu — the rider sees the English server message verbatim.
- **Suggested fix:** Map known error codes to translated strings via the existing `T()` helper; default to a generic translated message.

### O5 — `navigator.onLine` is not reliable on mobile and gates queue logic — Medium
- **File:** `src/pages/Active.tsx` lines 981, 991, 1029
- **Description:** Decisions to queue updates depend on `navigator.onLine`, which on Android Chrome can lag connectivity changes by tens of seconds and on iOS often reports `true` while behind a captive portal.
- **Trigger / repro:** Connect to a captive-portal Wi-Fi without authenticating; `navigator.onLine` reports `true` and the app sends requests that hang for the full 30 s timeout instead of being queued.
- **Suggested fix:** Treat `navigator.onLine` as a hint only; queue on every fetch failure regardless of the flag, and reconcile by `online` event + a periodic ping.

### O6 — Cancel-confirm modal close happens only on `onSuccess` — Low
- **File:** `src/pages/Active.tsx` lines 1009–1013, 1809–1818
- **Description:** If the cancel mutation 4xxs, `setShowCancelConfirm(false)` is never called, so the modal stays open with a generic toast. The button stays disabled (`updateOrderMut.isPending`) until the next user action.
- **Trigger / repro:** Open the cancel modal and have the backend reject the cancellation (e.g. order already in a non-cancellable state); the modal stays open with the disabled button.
- **Suggested fix:** Close the modal in `onSettled` and re-enable the button on error.

---

## Wallet

### W1 — Withdraw amount validated client-side only at submit time — Medium
- **File:** `src/components/wallet/WithdrawModal.tsx` lines 103–105, 47, 92; `src/pages/Wallet.tsx` lines 1–448 (Wallet shell mounting WithdrawModal)
- **Description:** Min-balance and amount checks (`amt < minPayout`, `amt <= 0`) live in the modal submit handler at lines 103–105. The balance prop is captured at modal open; a withdrawal that completes in another tab between modal open and submit can let the rider request more than they hold. The server is the source of truth, but the UX shows accepted requests that the server later rejects.
- **Trigger / repro:** Open the Withdraw modal showing balance 1000. In another tab, complete a withdrawal of 800. Submit a 500 withdrawal in the original tab — it passes the client check (uses captured 1000) but fails server-side.
- **Suggested fix:** Re-fetch `getMinBalance` and current balance immediately before submit; disable submit if `amount > balance - minBalance`.

### W2 — Wallet transactions list has no pagination — Medium
- **File:** `src/pages/Wallet.tsx` lines 234 (query call), 282 (full transactions array), 311–316 (filter selectors that re-scan the whole array); `src/lib/api.ts` line 381 (`getWallet`)
- **Description:** `getWallet()` returns the entire transactions list; for active riders this grows unbounded and renders all rows at once.
- **Trigger / repro:** A rider with thousands of transactions opens the wallet — initial render takes seconds and scroll stutters.
- **Suggested fix:** Add `?limit=&cursor=` to the API and a virtualised list (`react-window` or similar).

### W3 — COD remittance, deposit, and withdraw modals share container with no reset on close — Low
- **File:** `src/pages/Wallet.tsx` lines 831 (`<RemittanceModal>`), 847 (`<WithdrawModal>`), 866 (`<DepositModal>`); `src/components/wallet/WithdrawModal.tsx` lines 47–53 (form-state hooks that aren't reset on `onClose` at line 38); `src/components/wallet/DepositModal.tsx` lines 1–337; `src/components/wallet/RemittanceModal.tsx` lines 1–262
- **Description:** Switching tabs while a modal is open does not unmount the modal; form values from one workflow can bleed into the next session if the user reopens.
- **Trigger / repro:** Open the Withdraw modal, type an amount, switch to the Deposit tab without closing — values from the prior modal can persist in the next render of the same modal.
- **Suggested fix:** Key each modal off its tab and reset state on close.

---

## Chat

### C1 — Hard-coded `BASE = "/api"` breaks Capacitor builds — High
- **File:** `src/pages/Chat.tsx` line 5
- **Description:** Unlike `src/lib/api.ts` lines 1–3 and `src/lib/error-reporter.ts` lines 6–12 which honour `VITE_CAPACITOR` + `VITE_API_BASE_URL`, Chat hardcodes `/api`, so on the native build all chat HTTP calls hit `file:///api/...` and fail.
- **Trigger / repro:** Build the Capacitor Android target and open Chat — no conversations load, no errors are shown to the user.
- **Suggested fix:** Reuse `apiFetch` from `src/lib/api.ts` instead of the local copy.

### C2 — Chat token read directly from `localStorage` with hard-coded key — High
- **File:** `src/pages/Chat.tsx` lines 6–8
- **Description:** `getToken()` calls `localStorage.getItem("ajkmart_rider_token")` directly. This bypasses the api.ts abstraction (no fallback to in-memory token, no refresh on 401, no future migration to cookie storage). Once tokens move off `localStorage`, Chat silently loses auth.
- **Trigger / repro:** After A1 is fixed (move tokens off localStorage), Chat suddenly fails to authenticate any request even though all other pages work.
- **Suggested fix:** Use `api.getToken()`.

### C3 — Chat `apiFetch` has no auth refresh, no timeout, no error reporting — High
- **File:** `src/pages/Chat.tsx` lines 10–18
- **Description:** Local `apiFetch` lacks the 401 → refresh → retry path, the configurable timeout (`_apiTimeoutMs`), and the error-reporter integration that lives in `src/lib/api.ts`. Expired tokens during chat surface as raw "Request failed" toasts.
- **Trigger / repro:** Stay in Chat past the access-token expiry — every chat request fails with a generic error toast instead of refreshing the token transparently.
- **Suggested fix:** Reuse `api.ts`'s `apiFetch` (export it for internal callers) instead of a parallel implementation.

### C4 — `sendMessage` swallows error silently — Medium
- **File:** `src/pages/Chat.tsx` lines 108–118 (esp. `catch {}` at line 116)
- **Description:** If the POST fails, `setSending(false)` runs but no toast is shown. The user sees the input still populated and may not realise the send failed.
- **Trigger / repro:** Disconnect the network mid-Chat and tap Send — the input clears nothing and the user has no feedback that the message wasn't delivered.
- **Suggested fix:** Surface a toast and keep the typed text in the input on failure.

### C5 — `audio.play()` returns a rejected Promise that is never awaited — Medium
- **File:** `src/pages/Chat.tsx` lines 151, 195 (inside the `pc.ontrack = (e) => {...}` arrow)
- **Description:** Browser autoplay policies reject `audio.play()` if the call wasn't user-gesture-initiated. The unhandled rejection bubbles to `unhandledrejection` and is reported as a crash by `error-reporter.ts`.
- **Trigger / repro:** Receive an incoming WebRTC track while the tab hasn't received a user gesture — `audio.play()` rejects with NotAllowedError, captured by the global handler.
- **Suggested fix:** `audio.play().catch(() => { /* show "tap to enable audio" UI */ })`.

### C6 — `pc.ontrack` creates a fresh `<audio>` element per track — Medium
- **File:** `src/pages/Chat.tsx` lines 151, 195
- **Description:** Each `ontrack` event allocates a new `Audio` element and assigns `srcObject`. With renegotiation or peer track changes, multiple Audio elements can play simultaneously. Old ones are never released.
- **Trigger / repro:** Trigger an ICE renegotiation mid-call (e.g. network change) and observe multiple `<audio>` elements created in DOM.
- **Suggested fix:** Pre-create one `<audio ref>` element per call and reassign `srcObject = e.streams[0]` on it.

### C7 — Incoming-call ringtone never plays — Medium
- **File:** `src/pages/Chat.tsx` line 67 (`socket.on("comm:call:incoming", ...)`)
- **Description:** Only `setIncomingCall(data)` is called; no audible alert is triggered. `notificationSound.ts` exists but is not imported in Chat.
- **Trigger / repro:** Have another user call the rider while their phone is in the rider's pocket — no sound plays; the rider misses the call.
- **Suggested fix:** Play `notificationSound`'s ringtone (and stop it on accept/reject/timeout).

### C8 — Call timer starts before mic permission granted — Medium
- **File:** `src/pages/Chat.tsx` lines 134–162 (esp. line 139 starts timer; lines 140–161 obtain media)
- **Description:** `setCallTimer` interval is created at line 139 before `getUserMedia` resolves at line 140. If the user denies the mic, the catch on line 161 swallows the error but the timer keeps incrementing.
- **Trigger / repro:** Initiate a call, then deny the mic prompt — the timer continues to count up while no actual call is happening.
- **Suggested fix:** Start the timer only after `getUserMedia` succeeds, and clear it in the catch.

### C9 — Trickle-ICE flag set per-call but read from a module-scope ref — Low
- **File:** `src/pages/Chat.tsx` lines 51 (ref declaration), 75 (used in incoming offer), 142 (caller-side local), 195 (callee-side ref write)
- **Description:** `trickleIceRef.current` is mutated in the callee path (line 195) but the caller path (`startCall` at line 142) reads `data.trickleIce` into a local `const trickleIce` and never updates the ref. If a user accepts an incoming call after starting one, the ref reflects the wrong policy.
- **Trigger / repro:** Initiate a call (which sets the local `trickleIce` to `true` say), then before it ends accept an incoming call with `trickleIce: false` — the ref now disagrees with the active call's actual policy.
- **Suggested fix:** Set `trickleIceRef.current = trickleIce` in `startCall` too.

---

## Profile / Settings

### P1 — Profile re-sync effect deps miss `editing` — Medium
- **File:** `src/pages/Profile.tsx` lines 290–306
- **Description:** Effect deps are `[user]`. While the gate `if (!editing)` is correct logically, an inflight `refreshUser()` that resolves between `setEditing(null)` and the next render may not trigger the effect if `user` reference doesn't change. When `editing` flips from `"personal"` to `null` without `user` changing, the form fields are not reset to server values and stale typed text persists into the next edit session.
- **Trigger / repro:** Open the personal section, type into the name field, cancel edit — reopen the section. The previously typed text is still there even though the rider cancelled.
- **Suggested fix:** Add `editing` to the deps array.

### P2 — Optional fields posted as empty strings — Medium
- **File:** `src/pages/Profile.tsx` lines 334–335
- **Description:** `email: email.trim(), cnic: cnic.trim()` are sent even when the rider cleared the field. Backend validators that allow `null` but reject `""` (CNIC is one such field) bounce the whole save.
- **Trigger / repro:** Clear the CNIC field and save — the server rejects `cnic: ""` even though the rider intended to remove the value.
- **Suggested fix:** Only assign keys whose trimmed value is non-empty (`...(email.trim() ? { email: email.trim() } : {})`).

### P3 — Language fetch overrides local pick mid-render — Medium
- **File:** `src/lib/useLanguage.ts` lines 43–72
- **Description:** When local storage has a language, the effect still calls `api.getSettings()` and overwrites the local pick if the server has a different one. If the rider deliberately switched language client-side and then opens the app on a slow network, their pick is replaced silently. `applyRTL` is also called twice (line 47 then line 54), causing a brief LTR→RTL flicker.
- **Trigger / repro:** Pick Urdu in the rider app; settings round-trip to the server with English. Reopen on a slow network — UI flips back to English.
- **Suggested fix:** Don't overwrite local-only choice from the server; treat server-side language as a default for first run only. Cache last-applied dir in a ref to avoid double `setAttribute`.

### P4 — `notification` permission requested unconditionally on every mount — Low
- **File:** `src/App.tsx` lines 81–87
- **Description:** Every time `user` changes (login, refresh) the permission prompt is re-requested. After a "denied" decision, modern browsers refuse the prompt anyway, but the call still triggers `console.error` reports captured by the error reporter.
- **Trigger / repro:** Deny notifications once. Sign out and back in — the prompt does not appear again, but the app silently issues the permission request and logs warnings.
- **Suggested fix:** Guard with `Notification.permission === "default"`.

---

## UI / UX

### U1 — Refresh-fail toast text not translated — Low
- **File:** `src/App.tsx` lines 168–170, 182–184
- **Description:** "Connection issue — profile sync failed" is hard-coded English even though the rest of the app uses the `T()` translation helper.
- **Trigger / repro:** Set the rider language to Urdu and trigger 3 consecutive refresh failures — the toast appears in English.
- **Suggested fix:** Wrap with `T("connectionIssueProfileSync")` and add the key to the i18n bundle.

### U2 — `AnnouncementBar` consumes up to 30vh of sticky space — Low
- **File:** `src/App.tsx` lines 187–189
- **Description:** `max-h-[30vh] overflow-y-auto` on a sticky banner means a long announcement covers a third of the small phone screen even after the rider has read it; there is no dismiss within the layout.
- **Trigger / repro:** Set `config.content.announcement` to a multi-paragraph message — the banner permanently consumes 30 % of the viewport.
- **Suggested fix:** Cap at e.g. `max-h-[80px]` and add an explicit "expand" affordance, plus a dismiss persisted to `localStorage`.

### U3 — God-component pages over 1000 lines each — Medium
- **File:** `src/pages/Active.tsx` lines 47, 69, 218, 301, 444, 496, 679, 684, 695, 719, 728, 771, 785, 799, 804, 817, 894 (the 17 `useEffect` call sites in this single 1866-line file); `src/pages/Profile.tsx` lines 1–1231; `src/pages/Login.tsx` lines 1–995; `src/pages/Home.tsx` lines 1–987
- **Description:** These pages carry many `useEffect`s each (Active.tsx has 17, enumerated above). Maintenance, code review, and React reconciliation costs are all elevated. Splitting was clearly intended (`src/components/dashboard/` exists) but the work is incomplete.
- **Trigger / repro:** Open any of these files in an editor — scroll fatigue and merge-conflict surface area are immediate and obvious.
- **Suggested fix:** Extract sub-features (offer card, OTP modal, cancel modal, proof upload, status panel) into focused components with their own state.

### U4 — `PullToRefresh` swallows `onRefresh` errors — Medium
- **File:** `src/components/PullToRefresh.tsx` lines 42–53
- **Description:** `try { await onRefresh(); ... } finally { setRefreshing(false); setPullY(0); }` — there is no `catch`. Errors are reported by the global `unhandledrejection` listener but the user sees the spinner end with no failure indication.
- **Trigger / repro:** Disconnect the network and pull to refresh on Home — the spinner disappears as if the refresh succeeded.
- **Suggested fix:** Catch and surface a toast (e.g. via a callback prop), and visually mark the last-updated indicator as stale.

### U5 — "Loading Rider Portal…" splash shown indefinitely if `getMe` hangs — Low
- **File:** `src/App.tsx` lines 105–113
- **Description:** `loading` from `useAuth` is the only gate; if `getMe` hangs, riders see the splash forever.
- **Trigger / repro:** Throttle the network so `getMe` takes longer than the 30 s API timeout, then crashes — splash remains visible until the user kills the tab.
- **Suggested fix:** Add a 30-second deadline that surfaces a "Couldn't reach server, retry" UI.

### U6 — Approval-rejected screen lacks contact/appeal CTA — Low
- **File:** `src/App.tsx` lines 140–155
- **Description:** Riders rejected with a `rejectionReason` see the reason but no path to contact support or appeal.
- **Trigger / repro:** Sign in as a rider whose `approvalStatus === "rejected"` — the screen offers only a "Sign Out" button.
- **Suggested fix:** Add a "Contact support" button populated from `config.content.supportPhone` or similar.

---

## Performance

### PF1 — Console-error monkeypatch ships every error to backend with low dedupe — Medium
- **File:** `src/lib/error-reporter.ts` lines 83–111
- **Description:** Replacing `console.error` globally captures every library log (React dev warnings, third-party SDK noise, expected validation errors). Dedupe key is `msg.slice(0, 200)` over a 30-second window, but error messages with embedded changing data (timestamps, IDs) defeat dedupe and flood `/api/error-reports`.
- **Trigger / repro:** Add a third-party SDK that calls `console.error` with timestamped messages each second — every message gets sent because the `slice(0, 200)` key includes the timestamp.
- **Suggested fix:** Limit capture to errors that include `Error` instances; debounce by stack signature, not raw message; opt-in via config flag.

### PF2 — `unhandledrejection` reporter forwards every rejection to backend — Low
- **File:** `src/lib/error-reporter.ts` lines 63–71
- **Description:** Combined with the chat-side `audio.play()` rejection (C5), this can spam the backend with hundreds of "AbortError" messages on slow devices.
- **Trigger / repro:** Trigger several `audio.play()` rejections (silent autoplay policy) and watch `/api/error-reports` POSTs in the network panel.
- **Suggested fix:** Filter common benign rejections (AbortError, NotAllowedError on play()).

### PF3 — Heartbeat re-runs entire effect on socket state change — Medium
- **File:** `src/lib/socket.tsx` lines 77–110
- **Description:** Battery query and listener are torn down/rebuilt on every socket reconnect (see also S2, S3).
- **Trigger / repro:** Drop the network briefly to force a reconnect — the battery API is queried again and a fresh listener attached on each cycle.
- **Suggested fix:** Lift battery handling to a top-level effect outside the heartbeat effect.

### PF4 — All routes statically imported — Medium
- **File:** `src/App.tsx` lines 20–33
- **Description:** First paint downloads every page, including Wallet, VanDriver, Chat (with WebRTC plumbing).
- **Trigger / repro:** Run `vite build` and inspect the chunk graph — the initial chunk includes pages a typical rider may never visit.
- **Suggested fix:** `React.lazy` + `<Suspense>` for at least the heavy pages.

### PF5 — No `useMemo` on filtered request lists — Medium
- **File:** `src/pages/Home.tsx` lines 507–508 (`allOrders.filter(...)` / `allRides.filter(...)`)
- **Description:** Filtered arrays are recomputed on every render; the `dismissed` Set comparison key is recomputed each pass.
- **Trigger / repro:** With many active requests visible, type into any controlled input on Home — all request cards re-render due to stale array identity.
- **Suggested fix:** Wrap the filter results with `useMemo([allOrders, dismissed])`.

### PF6 — `gpsQueue` opens a fresh IDB connection per call — Medium
- **File:** `src/lib/gpsQueue.ts` lines 47–73 (`openDB`); callers at lines 76 (`enqueue`), 109 (`dequeueAll`), 124 (`clearQueue`), 138 (`queueSize`), 156 (`addDismissed`), 169 (`removeDismissed`), 181 (`loadDismissed`), 202 (`purgeExpiredDismissed`), 225 (`clearAllDismissed`), 255 (`drainQueue`)
- **Description:** Every call opens and closes an IndexedDB connection. At a 30-second heartbeat plus per-watch ping enqueues that's hundreds of opens/day per device, each forcing a structured-clone handshake.
- **Trigger / repro:** Add a `console.log` in `openDB` and run a one-hour ride — open count is well into the thousands.
- **Suggested fix:** Memoise a single `Promise<IDBDatabase>` in module scope and reuse it across calls.

### PF7 — `error-reporter` flush schedules a `setTimeout` per enqueue — Low
- **File:** `src/lib/error-reporter.ts` lines 35–39
- **Description:** Rapid bursts schedule many overlapping flush timers; `flushQueue` then re-schedules itself if the queue isn't empty.
- **Trigger / repro:** Trigger a burst of 50 `console.error` calls in <100 ms — 50 flush timers are scheduled even though one would suffice.
- **Suggested fix:** Use a single in-flight flag plus a debounce.

---

## Type Safety

### T1 — `RiderRequestsResponse.orders` and `.rides` typed as `any[]` — Medium
- **File:** `src/lib/api.ts` lines 161–167, 350–357
- **Description:** Every consumer (`Home`, `Active`, dashboard subcomponents) receives `any[]` and propagates `any` through filters and renderers. Type errors at the wire format are completely silent.
- **Trigger / repro:** Rename a backend field (e.g. `pickupAddress` → `pickup_address`); the frontend continues to compile and renders `undefined` at runtime.
- **Suggested fix:** Define `Order` and `Ride` interfaces in a shared types module and tighten the response type.

### T2 — `(o: any) => …` filter callbacks across pages — Medium
- **File:** `src/pages/Home.tsx` lines 507–508; many call sites in `src/pages/Active.tsx` (e.g. inside the location/status effect block lines 679–894)
- **Description:** Even after T1 is fixed, the explicit `any` annotations would shadow the new types.
- **Trigger / repro:** Change `Order.id` to `Order.orderId` after T1 — `(o: any) => o.id` keeps compiling and silently breaks.
- **Suggested fix:** Remove the `any` annotations once T1 is in place.

### T3 — Many `as` casts hide bad shapes — Low
- **File:** `src/lib/auth.tsx` lines 118–124 (`errAny.code`, `errAny.rejectionReason as string | undefined`); `src/lib/api.ts` lines 238–240 (`(err.data as Record<string, unknown> | undefined)?.code as string`)
- **Description:** Broad casts mask rename or schema drift on the server.
- **Trigger / repro:** Server changes the error envelope from `err.code` to `err.errorCode` — frontend keeps casting and silently treats every error as having no code.
- **Suggested fix:** Validate envelope responses with a small runtime schema (zod or similar).

### T4 — `s.auth as { token?: string }` cast in socket — Low
- **File:** `src/lib/socket.tsx` lines 63–64
- **Description:** Cast hides that socket.io's typings don't expose `auth` for mutation. Combined with S1, the runtime mutation has no effect on the active connection anyway.
- **Trigger / repro:** Future socket.io upgrade adds proper typings — the existing cast suddenly fails to compile, hiding which call site is wrong.
- **Suggested fix:** Use a typed wrapper (see S1) and remove the cast.

---

## Security

### S-Sec1 — Access + refresh tokens stored in `localStorage` — Critical
- **File:** `src/lib/api.ts` lines 5–7, 22–42, 332–339
- **Description:** Same root cause as **A1** — both tokens are persistent in `localStorage` and any XSS exfiltrates them. Listed under Security as well so this section reads standalone for security reviewers.
- **Trigger / repro:** Inject a script via any XSS sink (compromised dependency, markdown injection, etc.) that reads `localStorage.getItem("ajkmart_rider_token")` and `localStorage.getItem("ajkmart_rider_refresh_token")`.
- **Suggested fix:** Move the refresh token to an HttpOnly, SameSite=Strict cookie; keep the short-lived access token in memory and rehydrate via the refresh cookie on tab open.

### S-Sec2 — Chat reads token directly from `localStorage` with hardcoded key — High
- **File:** `src/pages/Chat.tsx` lines 6–8
- **Description:** Even if A1 is mitigated by moving tokens off `localStorage`, this code path still reads the legacy key — direct XSS sink.
- **Trigger / repro:** After A1 fix lands, an XSS still finds the rider's token at `localStorage.getItem("ajkmart_rider_token")` if Chat ever populated it (or if any storage write keeps the key for compatibility).
- **Suggested fix:** Single source of truth via `api.getToken()`.

### S-Sec3 — `push.ts` reads token directly from `localStorage` — High
- **File:** `src/lib/push.ts` line 26
- **Description:** Same pattern as S-Sec2 — push subscription registration reads the token directly from `localStorage` with a hardcoded key.
- **Trigger / repro:** Same XSS pathway as S-Sec2; push registration code also leaks the token.
- **Suggested fix:** Use `api.getToken()`.

### S-Sec4 — `error-reports` endpoint posted unauthenticated and unverified — Medium
- **File:** `src/lib/error-reporter.ts` lines 14–22
- **Description:** Reports are POSTed without an `Authorization` header (intentional — even logged-out users can crash). However the payload includes arbitrary `console.error` arguments (lines 87–91) which may include user PII, query strings with tokens, etc., and there is no way for the server to verify the report originated from the rider app vs a malicious caller. An attacker can flood the endpoint with fake reports.
- **Trigger / repro:** Issue `curl -X POST /api/error-reports -d '{"errorMessage":"flood"}'` 1000 times — all are accepted with no provenance check.
- **Suggested fix:** Add a shared HMAC over the report body with a server-known key (rotated per build), and rate-limit per source IP. Strip URLs from console arguments before sending.

### S-Sec5 — Console-error sink may leak tokens via stack traces — High
- **File:** `src/lib/error-reporter.ts` lines 83–111
- **Description:** Many error stacks include URLs (e.g. `at fetch (https://api/...?token=xyz)`); some integrations (Google GSI, Firebase) accept tokens in URLs. Capturing every `console.error` arg can exfiltrate them to the unauthenticated reporting endpoint described in S-Sec4.
- **Trigger / repro:** Trigger an error in a network call whose URL contains a query-string token; the stack trace is forwarded verbatim to `/api/error-reports`.
- **Suggested fix:** Redact `token=`, `access_token=`, JWT-shaped substrings before submit.

### S-Sec6 — `analytics.identifyUser` calls `gtag("config", undefined, …)` — Medium
- **File:** `src/lib/analytics.ts` line 65
- **Description:** Passing `undefined` as the GA4 measurement ID silently no-ops; rider IDs are never associated. Repeated `gtag("config")` calls with `undefined` can also surface warnings in dev tools.
- **Trigger / repro:** Sign in with analytics enabled — the GA4 user_id property is never set; verify in `chrome://gtm` or the GA4 debug panel.
- **Suggested fix:** Store the tracking ID in `_trackingId` at init and pass it here.

### S-Sec7 — `pc.ontrack` autoplays remote audio without user gesture — Low
- **File:** `src/pages/Chat.tsx` lines 151, 195
- **Description:** A hostile peer can force the rider's device to play audio whenever ICE renegotiation occurs (browser policies usually reject this on a tab without prior interaction, but the policy is per-tab and softens after the first user gesture).
- **Trigger / repro:** Establish a call, then have the peer renegotiate with a loud track — the audio plays without an additional consent prompt.
- **Suggested fix:** Wrap remote audio playback in a user-confirmed "Tap to accept audio" gesture for the very first remote track.

### S-Sec8 — `loadGoogleGSIToken` / `loadFacebookAccessToken` triggered from a `useEffect` — Medium
- **File:** `src/pages/Login.tsx` lines 516–519 (also see A4)
- **Description:** Auto-firing OAuth flows from an effect violates the user-gesture requirement of these SDKs in some browsers, and surfaces the auth popup in unexpected contexts (which users tend to dismiss, denying consent for the next legitimate attempt).
- **Trigger / repro:** Pick "Continue with Google" — the popup appears immediately because of the effect rather than because of the click; some browsers block it as a non-gesture popup.
- **Suggested fix:** Trigger on explicit click only.

### S-Sec9 — Direct `magicLinkVerify` handles untrusted token without format check — Low
- **File:** `src/pages/Login.tsx` lines 261–268
- **Description:** The magic token comes from the URL and is never sanitised before being passed to `magicLinkVerify`. The backend presumably validates it, but a token with `\u0000` or extreme length could trigger client-side surprises in `fetch` URL parsing.
- **Trigger / repro:** Open a URL with `?magic_token=<10MB string>` — `apiFetch` builds a request with a 10MB header which most servers will reject with an opaque error that the rider sees verbatim.
- **Suggested fix:** Validate token format (`/^[A-Za-z0-9._-]{16,512}$/`) before calling.

### S-Sec10 — Maintenance/approval-pending branches don't clear in-flight queries — Low
- **File:** `src/App.tsx` lines 124–158
- **Description:** When the rider transitions into an approval-pending state from a previously-active session, queries already fetched (e.g. cached `rider-active`) remain in `queryClient`; a route swap that briefly mounts a child can read them.
- **Trigger / repro:** Be signed in as an active rider, have admin flip your approval to `pending`, refresh — for one frame the cached `rider-active` data may flash before the pending screen renders.
- **Suggested fix:** `queryClient.clear()` when entering pending/rejected/maintenance branches.

---

## PWA / Capacitor

### PWA1 — Service-worker registration scope is implicit — Medium
- **File:** `src/lib/push.ts` lines 1, 6
- **Description:** `BASE` is `import.meta.env.BASE_URL` minus trailing slash. If the app is later served from a sub-path (`/rider/`) and `BASE_URL` is configured to match, registration succeeds, but the resulting scope inherits from the SW URL and may not include all sibling paths the rider visits.
- **Trigger / repro:** Configure Vite with `base: "/rider/"`, register the SW — push subscriptions never deliver to paths under `/api/...` if the implicit scope excludes them.
- **Suggested fix:** Pass an explicit `{ scope: BASE + "/" }` to `register`.

### PWA4 — Capacitor base-URL config duplicated in three places — Medium
- **File:** `src/lib/api.ts` lines 1–3, `src/lib/socket.tsx` lines 41–43, `src/lib/error-reporter.ts` lines 6–12
- **Description:** Three independent computations of "is Capacitor && which base URL". A change to one (e.g. switching to a per-tenant base) silently desyncs the other two.
- **Trigger / repro:** Change `VITE_API_BASE_URL` resolution in `api.ts` only — socket and error-reporter still hit the previous host.
- **Suggested fix:** Centralise in a `getApiBase()` helper exported from `src/lib/api.ts` and consume from socket.tsx + error-reporter.ts.

### PWA5 — `WouterRouter base` not Capacitor-aware — Low
- **File:** `src/App.tsx` line 222
- **Description:** Under Capacitor, `BASE_URL` may be `./` or a `capacitor://` URL depending on Vite config; `replace(/\/$/, "")` won't normalise those.
- **Trigger / repro:** Build the Capacitor target and inspect router behaviour — paths under `capacitor://localhost/...` never match wouter routes.
- **Suggested fix:** Compute base as `new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, "")` (see also R4).

### PWA6 — No `online`/`offline` event listener aborts in-flight requests — Medium
- **File:** `src/pages/Active.tsx` (offline branches at lines 981, 991, 1029); no global `offline` listener exists in `src/App.tsx` or `src/lib/api.ts`
- **Description:** When the device goes offline mid-mutation, the request is allowed to time out (30 s default per `setApiTimeoutMs`) before the offline branch engages on the *next* attempt. There's no global `addEventListener("offline", ...)` that aborts in-flight requests early.
- **Trigger / repro:** Initiate an order status update on a metered LTE connection that drops just after the request leaves — the user waits 30 s before being told to retry.
- **Suggested fix:** Maintain a shared `AbortController` per-page that fires on the global `offline` event.

### PWA7 — `notificationSound` not used by Chat for incoming-call ring — Low
- **File:** `src/lib/notificationSound.ts` lines 86–134 (`playRequestSound` and stop helpers, the canonical alert utility); `src/pages/Chat.tsx` lines 67 (`socket.on("comm:call:incoming")` setter that should trigger the ring) and line 1–46 (no `notificationSound` import); `src/pages/Home.tsx` line 18 (existing consumer that proves the import path works)
- **Description:** Cross-cutting gap — the sound utility exists and is wired for order alerts, but Chat's incoming-call path doesn't import it. Pairs with C7.
- **Trigger / repro:** Receive a call while the rider's phone is locked or the tab is backgrounded — no audible notification accompanies the visual "Incoming Call" UI at line 187.
- **Suggested fix:** Import `notificationSound` in Chat and play it on `comm:call:incoming`; stop on accept/reject/timeout.

---

## Closing notes

- The largest cluster of issues is on the boundary between Chat and the rest of the app: Chat reimplements `apiFetch`, the token reader, and the socket connection. A single refactor that makes Chat consume `api.ts` and `useSocket()` would close ~6 of the bugs above (S5, S6, S7, C1, C2, C3, S-Sec2).
- The next-biggest cluster is around tokens (`localStorage` storage, hard-coded keys in 3 places). Treat A1 / S-Sec1, S-Sec2, S-Sec3 as a single migration.
- Type-safety issues (T1–T4) are cheap to fix and would prevent a class of runtime crashes when the wire format drifts.
- Several effects (A4, A5, S2, S3, P1, PF3) need either better deps arrays, hoisting, or in-flight guards. Consider an internal lint rule to flag empty dep arrays in pages that read context state.
