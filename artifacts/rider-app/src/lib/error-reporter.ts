import { getApiBase } from "./api";

const SOURCE_APP = "rider";
let _initialized = false;
let _queue: Array<Record<string, unknown>> = [];
let _flushing = false;
let _flushTimer: ReturnType<typeof setTimeout> | null = null; /* PF7: Single debounced flush (COMPLETED) */

/* PF1 / PF2 / S-Sec5: Filter benign rejections + redact tokens before send.
   The console-error monkeypatch (initErrorReporter below) and the
   unhandledrejection listener both go through these helpers. */
const BENIGN_REJECTION_NAMES = new Set([
  "AbortError",            /* fetch aborted on cancel/route swap */
  "NotAllowedError",        /* audio.play() before user gesture (C5) */
  "NotSupportedError",      /* navigator.share, etc. */
  "DOMException",            /* generic — many benign DOM ops */
]);
const BENIGN_REJECTION_SUBSTRINGS = [
  "the play() request was interrupted",
  "play() failed because the user didn't interact",
  "request signal is aborted",
  "the user aborted a request",
  "load failed",                /* iOS Safari fetch when offline — handled by offline UI */
  "networkerror when attempting", /* Firefox network noise during reconnect */
];

/* S-Sec5: Redact JWT-shaped substrings, query-string tokens, and bearer
   credentials before they leave the device. We're conservative — when in
   doubt we redact. This runs on errorMessage AND stackTrace. */
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  [/(token|access_token|refresh_token|auth|bearer|api[_-]?key)=[^&\s"']+/gi, "$1=[REDACTED]"],
  [/(authorization:\s*bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]"],
  [/(["']?(?:password|secret|otp|pin)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]"],
];
function redactSensitive(input: string | undefined): string | undefined {
  if (!input) return input;
  let out = input;
  for (const [re, sub] of TOKEN_PATTERNS) out = out.replace(re, sub);
  return out;
}

function isBenignRejection(err: unknown): boolean {
  if (!err) return true;
  const name = (err as { name?: unknown }).name;
  if (typeof name === "string" && BENIGN_REJECTION_NAMES.has(name)) return true;
  const msg = ((err as { message?: unknown }).message ?? String(err) ?? "").toString().toLowerCase();
  return BENIGN_REJECTION_SUBSTRINGS.some(s => msg.includes(s));
}

/* S-Sec4: HMAC-SHA256 sign every error report so the server can verify the
   payload originated from a legitimate rider build. The shared secret comes
   from `VITE_ERROR_REPORT_HMAC_SECRET` injected at build time; when it is
   missing we **skip the POST entirely** and warn once in dev so a missing
   build-time secret never silently produces unsigned traffic in production.
   The signature is hex-encoded and sent in the `X-Report-Signature` header. */
const _hmacSecret: string = (import.meta.env.VITE_ERROR_REPORT_HMAC_SECRET as string | undefined) ?? "";
let _warnedNoSecret = false;
let _hmacKeyPromise: Promise<CryptoKey | null> | null = null;
function getHmacKey(): Promise<CryptoKey | null> {
  if (!_hmacSecret) return Promise.resolve(null);
  if (_hmacKeyPromise) return _hmacKeyPromise;
  _hmacKeyPromise = (async () => {
    try {
      const enc = new TextEncoder();
      return await crypto.subtle.importKey(
        "raw",
        enc.encode(_hmacSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } catch { return null; }
  })();
  return _hmacKeyPromise;
}
async function signBody(body: string): Promise<string | null> {
  const key = await getHmacKey();
  if (!key) return null;
  try {
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const bytes = new Uint8Array(sig);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i]!.toString(16).padStart(2, "0");
    }
    return hex;
  } catch { return null; }
}

async function sendReport(report: Record<string, unknown>): Promise<void> {
  /* S-Sec4: Without a build-time HMAC secret we cannot sign the payload.
     Per requirement, skip the POST entirely (warn once in dev) so missing
     config can never produce unsigned traffic in production. */
  if (!_hmacSecret) {
    if (!_warnedNoSecret) {
      _warnedNoSecret = true;
      if (import.meta.env.DEV) {
        /* eslint-disable-next-line no-console */
        console.warn("[ErrorReporter] VITE_ERROR_REPORT_HMAC_SECRET is not set — error reports will NOT be sent.");
      }
    }
    return;
  }
  try {
    const body = JSON.stringify(report);
    const sig = await signBody(body);
    if (!sig) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Report-Signature": sig,
    };
    await fetch(`${getApiBase()}/error-reports`, { /* PWA4: Use centralized getApiBase() (COMPLETED) */
      method: "POST",
      headers,
      body,
    });
  } catch {}
}

async function flushQueue(): Promise<void> {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;
  const batch = _queue.splice(0, 10);
  for (const report of batch) {
    await sendReport(report);
  }
  _flushing = false;
  if (_queue.length > 0) {
    _flushTimer = setTimeout(flushQueue, 1000);
  }
}

function enqueue(report: Record<string, unknown>): void {
  _queue.push(report);
  if (_queue.length > 50) _queue.shift();
  /* PF7: Single debounced flush timer (COMPLETED) */
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushQueue, 100);
}

export function reportError(opts: {
  errorType: "frontend_crash" | "api_error" | "ui_error" | "unhandled_exception";
  errorMessage: string;
  functionName?: string;
  moduleName?: string;
  componentName?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
  statusCode?: number;
}): void {
  /* S-Sec5: Redact sensitive substrings from message + stack before queueing. */
  const safeMsg = redactSensitive((opts.errorMessage || "Unknown error").slice(0, 5000)) ?? "Unknown error";
  const safeStack = redactSensitive(opts.stackTrace?.slice(0, 50000));
  enqueue({
    sourceApp: SOURCE_APP,
    ...opts,
    errorMessage: safeMsg,
    stackTrace: safeStack,
  });
}

export function initErrorReporter(): void {
  if (_initialized) return;
  _initialized = true;

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const err = event.reason;
    /* PF2: Filter benign rejections (AbortError on route swap, NotAllowedError
       from audio.play() autoplay policy violations — see C5). These are
       expected on slow devices and should not flood the backend reporter. */
    if (isBenignRejection(err)) return;
    reportError({
      errorType: "unhandled_exception",
      errorMessage: err?.message || String(err) || "Unhandled promise rejection",
      stackTrace: err?.stack,
      functionName: "unhandledrejection",
    });
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    reportError({
      errorType: "frontend_crash",
      errorMessage: event.message || "Window error",
      stackTrace: event.error?.stack,
      functionName: event.filename,
      metadata: { lineno: event.lineno, colno: event.colno },
    });
  });

  const origConsoleError = console.error;
  const _recentConsoleErrors = new Map<string, number>();
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);

    /* PF1: Only forward console.error calls that include an actual Error
       instance. Library debug logs (React dev warnings, third-party SDK
       noise) commonly call console.error with plain strings/objects; those
       are not actionable defects and used to flood the reporter. */
    const errInstance = args.find((a): a is Error => a instanceof Error);
    if (!errInstance) return;

    const msg = args.map(a => {
      if (a instanceof Error) return a.message;
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(" ");

    if (msg.includes("[ErrorReporter]") || msg.includes("error-reports")) return;

    /* PF1: Dedupe by stack signature (the first non-anonymous frame) rather
       than the raw message. Embedded timestamps / IDs in error messages used
       to defeat the original `msg.slice(0, 200)` key. */
    const stackSig = (() => {
      const stack = errInstance.stack || "";
      /* Pull the first 3 frames, strip line/column to make the signature stable. */
      const frames = stack.split("\n").slice(0, 4)
        .map(l => l.replace(/:\d+:\d+\)?$/, ")").trim())
        .filter(Boolean);
      return frames.join("|") || msg.slice(0, 200);
    })();

    const now = Date.now();
    const lastSeen = _recentConsoleErrors.get(stackSig);
    if (lastSeen && now - lastSeen < 30000) return;
    _recentConsoleErrors.set(stackSig, now);
    if (_recentConsoleErrors.size > 100) {
      const oldest = _recentConsoleErrors.keys().next().value;
      if (oldest) _recentConsoleErrors.delete(oldest);
    }

    reportError({
      errorType: "ui_error",
      errorMessage: msg.slice(0, 5000),
      functionName: "console.error",
      stackTrace: errInstance.stack,
    });
  };
}

export function reportApiError(path: string, status: number, message: string): void {
  reportError({
    errorType: "api_error",
    errorMessage: message,
    functionName: path,
    moduleName: "API Call",
    statusCode: status,
    metadata: { path, status },
  });
}
