import { useState, useEffect, useCallback, useRef, type ElementType, type ReactNode } from "react";
import { PageHeader } from "@/components/shared";
import {
  Shield, RefreshCw, CheckCircle2, XCircle, Loader2,
  Search, Clock, AlertTriangle, Users, ChevronRight,
  UserCheck, UserX, Info, ListChecks, Plus, Trash2, CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetcher } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useOtpWhitelist, useAddOtpWhitelist, useUpdateOtpWhitelist, useDeleteOtpWhitelist } from "@/hooks/use-admin";

/* Single source of truth for the bypass-code shape. The backend
   (`artifacts/api-server/src/routes/admin/otp.ts`) uses the same regex —
   keeping them aligned avoids "valid on the client, rejected on the
   server" surprises. */
const BYPASS_CODE_REGEX = /^[0-9]{6}$/;

/* Typed shape for errors thrown by the `fetcher` helper. */
interface ApiError {
  status?: number;
  message?: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && ("status" in value || "message" in value);
}

function errorMessage(value: unknown, fallback = "Something went wrong"): string {
  if (isApiError(value) && typeof value.message === "string" && value.message.length > 0) {
    return value.message;
  }
  if (value instanceof Error) return value.message;
  return fallback;
}

async function api(method: string, path: string, body?: unknown) {
  try {
    return await fetcher(path, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: unknown) {
    if (isApiError(e) && e.status === 401) return null;
    throw e;
  }
}

function useCountdown(targetIso: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) { setRemaining(0); return; }
    const tick = () => {
      const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

function generateBypassCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type OTPStatus = { isGloballyDisabled: boolean; disabledUntil: string | null; activeBypassCount: number };

/* `email` and `otpBypassUntil` are returned by the API for every row, just
   sometimes as null. Optional + nullable was redundant and let `undefined`
   sneak through our null checks. */
type UserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  otpBypassUntil: string | null;
};

type OtpWhitelistEntry = {
  id: string;
  identifier: string;
  label?: string;
  bypassCode: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

/* The audit feed only contains the OTP-bypass family of events; widen
   the union if/when new event types are added on the server. */
type OtpAuditEvent = "login_otp_bypass" | "login_global_otp_bypass" | "otp_send_bypassed";

type AuditRow = {
  id: string;
  event: OtpAuditEvent;
  createdAt: string;
  ip: string;
  userId?: string | null;
  phone?: string | null;
  name?: string | null;
};

/* Robust "is the bypass still in effect?" check. `new Date(invalid)` returns
   an Invalid Date whose `.getTime()` is NaN, and any comparison with NaN is
   false — that silently masked malformed dates as "expired" instead of
   surfacing them. We treat invalid input as "not active" but flag it via
   `isFinite` so callers can decide. */
function isBypassActive(otpBypassUntil: string | null | undefined): boolean {
  if (!otpBypassUntil) return false;
  const ts = new Date(otpBypassUntil).getTime();
  if (Number.isNaN(ts)) return false;
  return ts > Date.now();
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 ${className}`}>{children}</div>
  );
}

function SectionTitle({ icon: Icon, label, color }: { icon: ElementType; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 mb-4 ${color}`}>
      <Icon className="w-4 h-4" />
      <h3 className="text-sm font-bold">{label}</h3>
    </div>
  );
}

export default function OtpControl() {
  const { toast } = useToast();

  /* ── Global suspension state ── */
  const [status, setStatus]           = useState<OTPStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const remaining = useCountdown(status?.disabledUntil ?? null);

  /* ── Per-user bypass state ── */
  const [query, setQuery]             = useState("");
  const [users, setUsers]             = useState<UserRow[]>([]);
  const [searching, setSearching]     = useState(false);
  const [bypassMins, setBypassMins]   = useState<Record<string, string>>({});
  /* In-flight search request — cancelled when a newer keystroke fires
     so a slow earlier response can't overwrite the latest results. */
  const searchAbortRef = useRef<AbortController | null>(null);

  /* ── Audit log state ── */
  const [auditRows, setAuditRows]     = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Load global status ── */
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const d = await api("GET", "/admin/otp/status");
      if (d?.data) setStatus(d.data);
    } finally { setStatusLoading(false); }
  }, []);

  /* ── Load recent audit entries (no-OTP logins only) ── */
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const d = await api("GET", "/admin/otp/audit?page=1");
      if (d?.data?.entries) {
        const bypass = (d.data.entries as AuditRow[]).filter(e =>
          e.event === "login_otp_bypass" || e.event === "login_global_otp_bypass" || e.event === "otp_send_bypassed"
        ).slice(0, 20);
        setAuditRows(bypass);
      }
    } finally { setAuditLoading(false); }
  }, []);

  useEffect(() => { loadStatus(); loadAudit(); }, [loadStatus, loadAudit]);

  /* Auto-refresh when countdown expires */
  useEffect(() => {
    if (status?.isGloballyDisabled && remaining === 0 && status.disabledUntil) {
      setTimeout(loadStatus, 1500);
    }
  }, [remaining, status?.isGloballyDisabled, status?.disabledUntil, loadStatus]);

  /* ── Global suspension actions ── */
  const suspend = async (mins: number) => {
    if (!mins || mins <= 0) return;
    const d = await api("POST", "/admin/otp/disable", { minutes: mins });
    if (d?.data) {
      toast({ title: "OTP Suspended", description: `All OTPs suspended for ${mins} minute(s).` });
      loadStatus(); loadAudit();
    } else {
      toast({ title: "Error", description: d?.error ?? "Failed", variant: "destructive" });
    }
  };

  const restore = async () => {
    await api("DELETE", "/admin/otp/disable");
    toast({ title: "OTPs Restored", description: "Global OTP suspension lifted." });
    loadStatus(); loadAudit();
  };

  /* ── Per-user bypass actions ── */
  const searchUsers = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) return;

    /* Cancel any earlier search before firing this one. Without this, a
       slow first request that resolves AFTER a faster second request
       would overwrite the latest results — the classic "stale response"
       race when typing quickly into a debounced search box. */
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;

    setSearching(true);
    try {
      const d = await fetcher(
        `/users/search?q=${encodeURIComponent(query)}&limit=20`,
        { signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      setUsers((d?.users ?? []).map((u: UserRow) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email ?? null,
        otpBypassUntil: u.otpBypassUntil ?? null,
      })));
    } catch (e: unknown) {
      /* AbortError is the expected outcome of a superseded request — swallow it. */
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (isApiError(e) && (e as { name?: string }).name === "AbortError") return;
      toast({ title: "Search failed", description: errorMessage(e, "Could not load users."), variant: "destructive" });
    } finally {
      if (searchAbortRef.current === ctrl) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }, [query, toast]);

  useEffect(() => {
    const t = setTimeout(() => { if (query.trim().length >= 2) searchUsers(); }, 400);
    return () => clearTimeout(t);
  }, [query, searchUsers]);

  /* On unmount, abort any in-flight search so React doesn't try to set
     state on a torn-down component. */
  useEffect(() => () => { searchAbortRef.current?.abort(); }, []);

  const grantBypass = async (userId: string, mins: number) => {
    try {
      const d = await api("POST", `/admin/users/${userId}/otp/bypass`, { minutes: mins });
      if (d?.data?.bypassUntil) {
        toast({ title: "Bypass Granted", description: `OTP bypass active for ${mins} minute(s).` });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, otpBypassUntil: d.data.bypassUntil } : u));
        loadStatus();
      } else {
        toast({ title: "Error", description: d?.error ?? "Failed", variant: "destructive" });
      }
    } catch (e: unknown) {
      /* Surface the new 409 conflict path so the admin sees the existing
         bypass instead of silently overwriting it. */
      if (isApiError(e) && e.status === 409) {
        toast({
          title: "Bypass already active",
          description: errorMessage(e, "User already has an active OTP bypass."),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Error", description: errorMessage(e, "Failed to grant bypass."), variant: "destructive" });
    }
  };

  const cancelBypass = async (userId: string) => {
    await api("DELETE", `/admin/users/${userId}/otp/bypass`);
    toast({ title: "Bypass Removed" });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, otpBypassUntil: null } : u));
    loadStatus();
  };

  /* Keyed by `OtpAuditEvent` so adding a new event in the union forces us
     to add a label here — no more silent fallback to the raw enum string. */
  const eventLabel: Record<OtpAuditEvent, string> = {
    login_otp_bypass: "Per-user bypass",
    login_global_otp_bypass: "Global suspension",
    otp_send_bypassed: "OTP send bypassed",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={Shield}
        title="OTP Global Control"
        subtitle="Single control panel for all OTP settings — no OTP controls exist elsewhere."
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-700"
        actions={
          <Button size="sm" variant="outline" onClick={() => { loadStatus(); loadAudit(); }} disabled={statusLoading} className="gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* ── 1. GLOBAL SUSPENSION STATUS ── */}
      <Card>
        <SectionTitle icon={Shield} label="Global OTP Suspension" color="text-indigo-700" />

        {/* Status banner */}
        <div className={`rounded-xl p-4 mb-4 flex items-center gap-3 ${status?.isGloballyDisabled ? "bg-red-50 border-2 border-red-300" : "bg-green-50 border border-green-200"}`}>
          {status === null ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : status.isGloballyDisabled ? (
            <>
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800">OTPs are GLOBALLY SUSPENDED</p>
                <p className="text-xs text-red-700 mt-0.5">
                  All users can log in without OTP. Auto-restores in:{" "}
                  <span className="font-mono font-bold">{fmtCountdown(remaining)}</span>
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={restore}>Restore Now</Button>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-green-800">OTPs are ACTIVE</p>
                <p className="text-xs text-green-700 mt-0.5">
                  {status.activeBypassCount > 0
                    ? `${status.activeBypassCount} user(s) have per-user bypass active.`
                    : "All users must verify OTP on login."}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Suspension controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Use during SMS/OTP delivery outages. OTP verification auto-resumes when the timer expires. New registrations during suspension will have <code>is_verified = false</code>.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ label: "30 min", mins: 30 }, { label: "1 hour", mins: 60 }, { label: "2 hours", mins: 120 }, { label: "24 hours", mins: 1440 }].map(opt => (
              <Button key={opt.mins} variant="outline" size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => suspend(opt.mins)} disabled={statusLoading}>
                Suspend for {opt.label}
              </Button>
            ))}
            <div className="flex items-center gap-2">
              <Input
                type="number" placeholder="Custom mins" value={customMinutes}
                onChange={e => setCustomMinutes(e.target.value)}
                className="w-28 h-8 text-xs" min={1} max={10080}
              />
              <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50 h-8"
                onClick={() => {
                  /* `parseInt("abc", 10)` returns NaN, and `NaN > 0` is silently
                     false — so the previous code accepted gibberish without a
                     peep. Now we explicitly tell the user what's wrong. */
                  const m = parseInt(customMinutes, 10);
                  if (Number.isNaN(m) || m <= 0) {
                    toast({
                      title: "Invalid duration",
                      description: "Enter a whole number of minutes greater than 0.",
                      variant: "destructive",
                    });
                    return;
                  }
                  suspend(m);
                }}
                disabled={!customMinutes || statusLoading}>
                Suspend
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 2. PER-USER OTP BYPASS ── */}
      <Card>
        <SectionTitle icon={Users} label="Per-User OTP Bypass" color="text-blue-700" />
        <p className="text-xs text-muted-foreground mb-3">
          Users on this list always skip OTP — even when global OTP is ON. This is the highest-priority bypass.
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9" placeholder="Search user by name, phone, or email…"
            value={query} onChange={e => setQuery(e.target.value)}
          />
        </div>

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching…
          </div>
        )}

        {users.length > 0 && (
          <div className="space-y-2">
            {users.map(user => {
              const bypassActive = isBypassActive(user.otpBypassUntil);
              return (
                <div key={user.id} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">{user.name ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {user.phone ?? user.email ?? "—"}
                      </p>
                      {bypassActive && user.otpBypassUntil && (
                        <p className="text-[10px] text-green-700 mt-0.5">
                          Bypass until: {fmtDate(user.otpBypassUntil)}
                        </p>
                      )}
                    </div>
                    {bypassActive ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                        <UserCheck className="w-3 h-3 mr-1" /> Bypass Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        <UserX className="w-3 h-3 mr-1" /> Normal OTP
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {bypassActive ? (
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => cancelBypass(user.id)}>
                        <XCircle className="w-3 h-3 mr-1" /> Remove Bypass
                      </Button>
                    ) : (
                      <>
                        {[15, 60, 1440].map(m => (
                          <Button key={m} size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => grantBypass(user.id, m)}>
                            Bypass {m < 60 ? `${m}m` : m === 60 ? "1h" : "24h"}
                          </Button>
                        ))}
                        <div className="flex items-center gap-1">
                          <Input type="number" placeholder="min"
                            value={bypassMins[user.id] ?? ""}
                            onChange={e => setBypassMins(p => ({ ...p, [user.id]: e.target.value }))}
                            className="w-16 h-7 text-xs" min={1} />
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => { const m = parseInt(bypassMins[user.id] ?? "", 10); if (m > 0) grantBypass(user.id, m); }}>
                            Custom
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!searching && query.trim().length >= 2 && users.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No users found.</p>
        )}

        {!query.trim() && (
          <p className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
            Search a user above to manage their OTP bypass.
          </p>
        )}
      </Card>

      {/* ── 3. AUDIT LOG — No-OTP Logins ── */}
      <Card>
        <SectionTitle icon={Clock} label="No-OTP Login Audit" color="text-purple-700" />
        <p className="text-xs text-muted-foreground mb-3">
          Every login that skipped OTP (via per-user bypass or global suspension) is recorded here.
        </p>

        {auditLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : auditRows.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No no-OTP logins recorded yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {auditRows.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${row.event === "login_otp_bypass" ? "bg-blue-500" : "bg-orange-500"}`} />
                <span className="font-mono text-muted-foreground">{fmtDate(row.createdAt)}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-foreground truncate">{row.name ?? row.phone ?? row.userId ?? "—"}</span>
                <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">
                  {eventLabel[row.event] ?? row.event}
                </Badge>
                <span className="text-muted-foreground font-mono shrink-0">{row.ip}</span>
              </div>
            ))}
          </div>
        )}

        <Button size="sm" variant="ghost" className="mt-3 text-xs" onClick={loadAudit} disabled={auditLoading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${auditLoading ? "animate-spin" : ""}`} /> Refresh Log
        </Button>
      </Card>

      {/* ── 4. WHITELIST — Per-identity OTP bypass ── */}
      <WhitelistSection />
    </div>
  );
}

function WhitelistSection() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useOtpWhitelist();
  const addEntry = useAddOtpWhitelist();
  const updateEntry = useUpdateOtpWhitelist();
  const deleteEntry = useDeleteOtpWhitelist();

  const [identifier, setIdentifier] = useState("");
  const [label, setLabel] = useState("");
  const [bypassCode, setBypassCode] = useState(() => generateBypassCode());
  const [expiresAt, setExpiresAt] = useState("");
  const [adding, setAdding] = useState(false);

  const entries: Array<OtpWhitelistEntry> = data?.entries ?? [];

  async function handleAdd() {
    if (!identifier.trim()) {
      toast({ title: "Identifier required", variant: "destructive" });
      return;
    }

    const code = bypassCode?.trim() || generateBypassCode();
    if (!BYPASS_CODE_REGEX.test(code)) {
      toast({ title: "Invalid bypass code", description: "Use a 6-digit numeric code.", variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      await addEntry.mutateAsync({
        identifier: identifier.trim(),
        label: label.trim() || undefined,
        bypassCode: code,
        /* `<input type="datetime-local">` returns a *naive* "YYYY-MM-DDTHH:mm"
           string with no timezone. Sending that as-is meant the server parsed
           it as UTC, while the admin meant their local time — so an entry the
           admin set to expire at 5pm PKT would actually expire at 10pm PKT.
           Reattaching the local timezone via `Date` -> `toISOString()` makes
           the wire format unambiguous. */
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      toast({ title: "Added to whitelist", description: `Bypass code ${code} is active.` });
      setIdentifier("");
      setLabel("");
      setBypassCode(generateBypassCode());
      setExpiresAt("");
    } catch (e: unknown) {
      toast({ title: "Error", description: errorMessage(e, "Could not add whitelist entry."), variant: "destructive" });
    } finally { setAdding(false); }
  }

  async function handleToggle(entry: OtpWhitelistEntry) {
    try {
      await updateEntry.mutateAsync({ id: entry.id, isActive: !entry.isActive });
      /* Previously the toggle had no success feedback, so the admin couldn't
         tell whether the click had registered until the list re-rendered. */
      toast({
        title: entry.isActive ? "Whitelist entry disabled" : "Whitelist entry enabled",
        description: entry.identifier,
      });
    } catch (e: unknown) {
      toast({ title: "Error", description: errorMessage(e, "Could not update whitelist entry."), variant: "destructive" });
    }
  }

  async function handleDelete(id: string, identifier: string) {
    if (!confirm(`Remove "${identifier}" from whitelist?`)) return;
    try { await deleteEntry.mutateAsync(id); toast({ title: "Removed from whitelist" }); }
    catch (e: unknown) { toast({ title: "Error", description: errorMessage(e, "Could not delete entry."), variant: "destructive" }); }
  }

  return (
    <Card>
      <SectionTitle icon={ListChecks} label="OTP Whitelist — Per-Identity Bypass" color="text-indigo-700" />
      <p className="text-xs text-muted-foreground mb-4">
        Phones or emails added here bypass real SMS. They accept the configured 6-digit bypass code without sending a real OTP. Perfect for App Store reviewers and testers.
      </p>

      {/* Add form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4 p-3 rounded-xl bg-muted/30 border">
        <Input className="rounded-xl h-9 text-sm" placeholder="Phone or email (identifier)" value={identifier} onChange={e => setIdentifier(e.target.value)} />
        <Input className="rounded-xl h-9 text-sm" placeholder="Label (e.g. Apple Reviewer)" value={label} onChange={e => setLabel(e.target.value)} />
        <Input className="rounded-xl h-9 text-sm" placeholder="Bypass code (6 digits)" value={bypassCode} onChange={e => setBypassCode(e.target.value)} />
        <Input className="rounded-xl h-9 text-sm" type="datetime-local" placeholder="Expires (optional)" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
        <div className="md:col-span-2">
          <Button size="sm" className="rounded-xl gap-1.5 w-full" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add to Whitelist
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">No whitelist entries yet.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: OtpWhitelistEntry) => (
            <div key={entry.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${entry.isActive ? "bg-indigo-50/50 border-indigo-200" : "bg-muted/20 border-border opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{entry.identifier}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {entry.label && <span className="text-xs text-muted-foreground">{entry.label}</span>}
                  <Badge variant="outline" className="text-[10px] font-mono">{entry.bypassCode}</Badge>
                  {entry.expiresAt && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <CalendarDays className="w-3 h-3" />
                      {new Date(entry.expiresAt) < new Date() ? "Expired" : `Expires ${new Date(entry.expiresAt).toLocaleDateString()}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {entry.isActive ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={() => handleToggle(entry)}>
                  {entry.isActive ? "Disable" : "Enable"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 rounded-lg text-red-500 hover:bg-red-50" onClick={() => handleDelete(entry.id, entry.identifier)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="ghost" className="mt-3 text-xs" onClick={() => refetch()}>
        <RefreshCw className="w-3 h-3 mr-1" /> Refresh
      </Button>
    </Card>
  );
}
