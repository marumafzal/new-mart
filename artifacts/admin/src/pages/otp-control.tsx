import { useState, useEffect, useCallback } from "react";
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

async function api(method: string, path: string, body?: unknown) {
  try {
    return await fetcher(path, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    if (e?.status === 401) return null;
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

type OTPStatus = { isGloballyDisabled: boolean; disabledUntil: string | null; activeBypassCount: number };
type UserRow   = { id: string; name: string | null; phone: string | null; email?: string | null; otpBypassUntil?: string | null };
type AuditRow  = { id: string; event: string; userId: string | null; phone: string | null; name: string | null; ip: string; result: string | null; createdAt: string };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 ${className}`}>{children}</div>
  );
}

function SectionTitle({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
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

  /* ── Audit log state ── */
  const [auditRows, setAuditRows]     = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Load global status ── */
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const d = await api("GET", "/otp/status");
      if (d?.data) setStatus(d.data);
    } finally { setStatusLoading(false); }
  }, []);

  /* ── Load recent audit entries (no-OTP logins only) ── */
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const d = await api("GET", "/otp/audit?page=1");
      if (d?.data?.entries) {
        const bypass = (d.data.entries as AuditRow[]).filter(e =>
          e.event === "login_otp_bypass" || e.event === "login_global_otp_bypass"
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
    const d = await api("POST", "/otp/disable", { minutes: mins });
    if (d?.data) {
      toast({ title: "OTP Suspended", description: `All OTPs suspended for ${mins} minute(s).` });
      loadStatus(); loadAudit();
    } else {
      toast({ title: "Error", description: d?.error ?? "Failed", variant: "destructive" });
    }
  };

  const restore = async () => {
    await api("DELETE", "/otp/disable");
    toast({ title: "OTPs Restored", description: "Global OTP suspension lifted." });
    loadStatus(); loadAudit();
  };

  /* ── Per-user bypass actions ── */
  const searchUsers = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) return;
    setSearching(true);
    try {
      const d = await fetcher(`/users/search?q=${encodeURIComponent(query)}&limit=20`);
      setUsers((d?.users ?? []).map((u: UserRow) => ({
        id: u.id, name: u.name, phone: u.phone, email: u.email, otpBypassUntil: u.otpBypassUntil,
      })));
    } finally { setSearching(false); }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => { if (query.trim().length >= 2) searchUsers(); }, 400);
    return () => clearTimeout(t);
  }, [query, searchUsers]);

  const grantBypass = async (userId: string, mins: number) => {
    const d = await api("POST", `/users/${userId}/otp/bypass`, { minutes: mins });
    if (d?.data?.bypassUntil) {
      toast({ title: "Bypass Granted", description: `OTP bypass active for ${mins} minute(s).` });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, otpBypassUntil: d.data.bypassUntil } : u));
      loadStatus();
    } else {
      toast({ title: "Error", description: d?.error ?? "Failed", variant: "destructive" });
    }
  };

  const cancelBypass = async (userId: string) => {
    await api("DELETE", `/users/${userId}/otp/bypass`);
    toast({ title: "Bypass Removed" });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, otpBypassUntil: null } : u));
    loadStatus();
  };

  const eventLabel: Record<string, string> = {
    login_otp_bypass: "Per-user bypass",
    login_global_otp_bypass: "Global suspension",
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
                onClick={() => { const m = parseInt(customMinutes, 10); if (m > 0) suspend(m); }}
                disabled={!customMinutes || parseInt(customMinutes, 10) <= 0 || statusLoading}>
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
              const bypassActive = !!(user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date());
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
  const [bypassCode, setBypassCode] = useState("000000");
  const [expiresAt, setExpiresAt] = useState("");
  const [adding, setAdding] = useState(false);

  const entries: any[] = data?.entries ?? [];

  async function handleAdd() {
    if (!identifier.trim()) { toast({ title: "Identifier required", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await addEntry.mutateAsync({ identifier: identifier.trim(), label: label.trim() || undefined, bypassCode: bypassCode || "000000", expiresAt: expiresAt || undefined });
      toast({ title: "Added to whitelist" });
      setIdentifier(""); setLabel(""); setBypassCode("000000"); setExpiresAt("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAdding(false); }
  }

  async function handleToggle(entry: any) {
    try { await updateEntry.mutateAsync({ id: entry.id, isActive: !entry.isActive }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: string, identifier: string) {
    if (!confirm(`Remove "${identifier}" from whitelist?`)) return;
    try { await deleteEntry.mutateAsync(id); toast({ title: "Removed from whitelist" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <Card>
      <SectionTitle icon={ListChecks} label="OTP Whitelist — Per-Identity Bypass" color="text-indigo-700" />
      <p className="text-xs text-muted-foreground mb-4">
        Phones or emails added here bypass real SMS. They accept the configured bypass code (default: <code className="bg-muted px-1 rounded">000000</code>) without sending a real OTP. Perfect for App Store reviewers and testers.
      </p>

      {/* Add form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4 p-3 rounded-xl bg-muted/30 border">
        <Input className="rounded-xl h-9 text-sm" placeholder="Phone or email (identifier)" value={identifier} onChange={e => setIdentifier(e.target.value)} />
        <Input className="rounded-xl h-9 text-sm" placeholder="Label (e.g. Apple Reviewer)" value={label} onChange={e => setLabel(e.target.value)} />
        <Input className="rounded-xl h-9 text-sm" placeholder="Bypass code (default: 000000)" value={bypassCode} onChange={e => setBypassCode(e.target.value)} />
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
          {entries.map((entry: any) => (
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
