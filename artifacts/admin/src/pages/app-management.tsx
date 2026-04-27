import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow, Users, ShoppingBag, Car, Pill, Package,
  Wallet, Shield, Plus, Pencil, Trash2, Save, X,
  ToggleRight, ToggleLeft, RefreshCw, CheckCircle2,
  AlertTriangle, WrenchIcon, Eye, EyeOff, ScrollText, CalendarDays, ChevronLeft, ChevronRight,
  Zap, Activity, Download, Smartphone, FileText, List, LogOut, Globe,
} from "lucide-react";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useToast } from "@/hooks/use-toast";
import { fetcher } from "@/lib/api";
import { getAdminTiming } from "@/lib/adminTiming";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { Mail } from "lucide-react";
import { useAuditLog } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ADMIN_SERVICE_LIST } from "@workspace/service-constants";
import { safeCopyToClipboard } from "@/lib/safeClipboard";
import { safeJsonStringifyPretty } from "@/lib/safeJson";

type PlatformSetting = { key: string; value: string };

function getSettingValue(settings: PlatformSetting[] | undefined, key: string, fallback = ""): string {
  if (!Array.isArray(settings)) return fallback;
  const row = settings.find(s => s && typeof s === "object" && s.key === key);
  const v = row?.value;
  return typeof v === "string" ? v : fallback;
}

/* ── Types ── */
interface AdminAccount {
  id: string; name: string; role: string; permissions: string;
  isActive: boolean; lastLoginAt: string | null; createdAt: string;
  username?: string | null; email?: string | null;
}

interface AdminSession {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt?: string | null;
  isCurrent?: boolean;
}

type AppManagementTab =
  | "overview"
  | "admins"
  | "maintenance"
  | "release-notes"
  | "audit-log"
  | "sessions";

interface AdminFormBody {
  name: string;
  role: string;
  permissions: string;
  isActive: boolean;
  email?: string | null;
  secret?: string;
}
interface AppOverview {
  users: { total: number; active: number; banned: number };
  orders: { total: number; pending: number };
  rides: { total: number; active: number };
  pharmacy: { total: number };
  parcel: { total: number };
  adminAccounts: number;
  appStatus: string;
  appName: string;
  features: Record<string, string>;
}

const ADMIN_ROLES = [
  { val: "super",    label: "Super Admin",    desc: "Full access to everything", color: "bg-red-100 text-red-700" },
  { val: "manager",  label: "Manager",         desc: "Orders, rides, users", color: "bg-blue-100 text-blue-700" },
  { val: "finance",  label: "Finance Admin",   desc: "Transactions & wallet", color: "bg-green-100 text-green-700" },
  { val: "support",  label: "Support Admin",   desc: "Users & broadcast only", color: "bg-amber-100 text-amber-700" },
];

const PERMISSIONS = ["users","orders","rides","pharmacy","parcel","products","transactions","settings","broadcast","flash-deals"];

const SERVICE_MAP = [
  ...ADMIN_SERVICE_LIST,
  { key: "wallet", label: "Wallet", description: "Digital wallet for payments & transfers", icon: "💰", setting: "feature_wallet", color: "#1A56DB", colorLight: "#E5EDFF" },
];

const EMPTY_ADMIN = { name: "", email: "", secret: "", role: "manager", permissions: PERMISSIONS.join(","), isActive: true };

/* ── Sessions Tab Component ── */
function SessionsTab() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  // qc kept for future invalidation hooks; currently unused but retained
  // to keep the SessionsTab signature aligned with the other tabs.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const qc = useQueryClient();

  // Load sessions on mount
  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await fetcher("/auth/sessions");
      const raw: unknown = Array.isArray(data) ? data : data?.sessions ?? [];
      setSessions(Array.isArray(raw) ? (raw as AdminSession[]) : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      toast({ title: "Error loading sessions", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Remove a specific session
  const revokeSession = async (sessionId: string) => {
    try {
      await fetcher(`/auth/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(sessions.filter(s => s.id !== sessionId));
      toast({ title: "Session revoked" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke session";
      toast({ title: "Error revoking session", description: message, variant: "destructive" });
    }
  };

  // Revoke all sessions
  const revokeAllSessions = async () => {
    if (!window.confirm("Are you sure? You will be logged out of all devices.")) return;
    try {
      await fetcher("/auth/sessions", { method: "DELETE" });
      setSessions([]);
      toast({ title: "All sessions revoked - logging out...", description: "You will be redirected to login." });
      // Statement body — `setTimeout` callback should not return the
      // assignment value (no-return-assign).
      setTimeout(() => {
        window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      }, getAdminTiming().loginRedirectDelayMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke sessions";
      toast({ title: "Error revoking sessions", description: message, variant: "destructive" });
    }
  };

  useEffect(() => { loadSessions(); }, []);

  const formatTime = (isoDate: string | null) => {
    if (!isoDate) return "Never";
    return new Date(isoDate).toLocaleString("en-PK", {
      day: "numeric", month: "short", year: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const parseUA = (ua: string) => {
    if (!ua) return "Unknown Device";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Mobile")) return "Mobile Browser";
    return "Browser";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Manage active admin sessions across all devices</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoading} className="h-9 rounded-xl gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {sessions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={revokeAllSessions}
              className="h-9 rounded-xl gap-2 bg-red-600 hover:bg-red-700"
            >
              <LogOut className="w-4 h-4" /> Sign out everywhere
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-2xl border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Globe className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No active sessions</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sessions.map((session) => {
              const isCurrentSession = session.isCurrent;
              return (
                <div key={session.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <p className="font-semibold text-sm">
                        {parseUA(session.userAgent ?? "")}
                        {isCurrentSession && <Badge className="ml-2 bg-green-100 text-green-700 text-xs">Current Device</Badge>}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <p className="truncate">IP: {session.ipAddress || "Unknown"}</p>
                      <p>Created: {formatTime(session.createdAt)}</p>
                      <p>Last used: {formatTime(session.lastUsedAt)}</p>
                      {session.expiresAt && <p className="text-yellow-600">Expires: {formatTime(session.expiresAt)}</p>}
                    </div>
                  </div>
                  {!isCurrentSession && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeSession(session.id)}
                      className="ml-2 text-red-500 hover:text-red-600 hover:bg-red-50 h-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Audit Log Tab Component ── */
function AuditLogTab() {
  const { toast } = useToast();
  const [page, setPage]     = useState(1);
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const { data, isLoading, refetch, isFetching } = useAuditLog({ page, action: action || undefined, from: dateFrom || undefined, to: dateTo || undefined });

  const logs: any[]  = data?.logs || [];
  const total: number = data?.total || 0;
  const pages: number = data?.pages || 1;

  const fd = (d: string) => new Date(d).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Filter by action..." value={action} onChange={e => { setAction(e.target.value); setPage(1); }} className="h-9 rounded-xl text-sm sm:w-56" />
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-9 rounded-xl text-xs w-32" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value); setPage(1); }}   className="h-9 rounded-xl text-xs w-32" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-primary hover:underline">Clear</button>}
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => {
            const json = safeJsonStringifyPretty(logs);
            if (!json) {
              toast({ title: "Export failed", description: "Could not serialize audit log entries.", variant: "destructive" });
              return;
            }
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.json`; a.click();
            URL.revokeObjectURL(url);
          }} disabled={logs.length === 0} className="h-9 rounded-xl gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading audit log...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No audit log entries found</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-muted/30">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{log.adminName || "Unknown Admin"}</p>
                    <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-200">{log.action}</Badge>
                    {log.targetId && <span className="text-xs text-muted-foreground font-mono">{log.targetId}</span>}
                  </div>
                  {log.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{typeof log.details === "string" ? log.details : JSON.stringify(log.details)}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{fd(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{total} entries · page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 rounded-xl gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-8 rounded-xl gap-1">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppManagement() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: authState } = useAdminAuth();
  const isSuperAdmin = authState.user?.role === "super";
  const [tab, setTab] = useState<AppManagementTab>("overview");
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN });
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [adminDialog, setAdminDialog] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  /* ── Release Notes state ── */
  const [rnDialog, setRnDialog] = useState(false);
  const [editingRn, setEditingRn] = useState<any>(null);
  const [rnForm, setRnForm] = useState({ version: "", releaseDate: new Date().toISOString().split("T")[0], notes: "", sortOrder: "0" });

  /* ── Compliance settings state ── */
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [minAppVersion, setMinAppVersion] = useState("");
  const [termsVersion, setTermsVersion] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");

  /* ── Queries ── */
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<AppOverview>({
    queryKey: ["admin-app-overview"],
    queryFn: () => fetcher("/app-overview"),
    refetchInterval: getAdminTiming().refetchIntervalAppManagementMs,
  });

  const { data: adminsData, isLoading: adminsLoading, refetch: refetchAdmins } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => fetcher("/admin-accounts"),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: () => fetcher("/platform-settings"),
  });

  const { data: rnData, isLoading: rnLoading, refetch: refetchRn } = useQuery({
    queryKey: ["admin-release-notes"],
    queryFn: () => fetcher("/admin/release-notes"),
  });

  const admins: AdminAccount[] = adminsData?.accounts || [];
  const settings: any[] = settingsData?.settings || [];
  const appStatus = getSettingValue(settings, "app_status", "active");
  const maintenanceMsgSaved = getSettingValue(settings, "content_maintenance_msg", "");
  const releaseNotes: any[] = rnData?.releaseNotes || [];

  /* ── Sync compliance state from platform settings (in useEffect to avoid setState-in-render) ── */
  useEffect(() => {
    if (!settingsData?.settings) return;
    const s = settingsData.settings as any[];
    const savedMinAppVersion = s.find((x: any) => x.key === "min_app_version")?.value || "";
    const savedTermsVersion  = s.find((x: any) => x.key === "terms_version")?.value  || "";
    const savedAppStoreUrl   = s.find((x: any) => x.key === "app_store_url")?.value   || "";
    const savedPlayStoreUrl  = s.find((x: any) => x.key === "play_store_url")?.value  || "";
    if (savedMinAppVersion) setMinAppVersion(prev => prev || savedMinAppVersion);
    if (savedTermsVersion)  setTermsVersion(prev  => prev || savedTermsVersion);
    if (savedAppStoreUrl)   setAppStoreUrl(prev   => prev || savedAppStoreUrl);
    if (savedPlayStoreUrl)  setPlayStoreUrl(prev  => prev || savedPlayStoreUrl);
  }, [settingsData]);

  /* ── Release Notes Mutations ── */
  const saveRn = useMutation({
    mutationFn: async (body: any) => {
      if (editingRn) return fetcher(`/admin/release-notes/${editingRn.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return fetcher("/admin/release-notes", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-release-notes"] });
      setRnDialog(false); setEditingRn(null); setRnForm({ version: "", releaseDate: new Date().toISOString().split("T")[0], notes: "", sortOrder: "0" });
      toast({ title: editingRn ? "Release note updated ✅" : "Release note created ✅" });
    },

    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRn = useMutation({
    mutationFn: (id: string) => fetcher(`/admin/release-notes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-release-notes"] }); toast({ title: "Release note deleted" }); },
  });

  const openNewRn = () => {
    setEditingRn(null);
    setRnForm({ version: "", releaseDate: new Date().toISOString().split("T")[0], notes: "", sortOrder: "0" });
    setRnDialog(true);
  };

  const openEditRn = (rn: any) => {
    setEditingRn(rn);
    setRnForm({
      version: rn.version,
      releaseDate: rn.releaseDate ?? new Date().toISOString().split("T")[0],
      notes: Array.isArray(rn.notes) ? rn.notes.join("\n") : rn.notes ?? "",
      sortOrder: String(rn.sortOrder ?? 0),
    });
    setRnDialog(true);
  };

  const submitRn = () => {
    if (!rnForm.version.trim()) { toast({ title: "Version required", variant: "destructive" }); return; }
    if (!rnForm.notes.trim())   { toast({ title: "Release notes required", variant: "destructive" }); return; }
    const notesArr = rnForm.notes.split("\n").map(s => s.trim()).filter(Boolean);
    const parsedSortOrder = parseInt(rnForm.sortOrder);
    saveRn.mutate({ version: rnForm.version.trim(), releaseDate: rnForm.releaseDate, notes: notesArr, sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0 });
  };

  /* ── Compliance settings save ── */
  const handleComplianceSave = async () => {
    setComplianceSaving(true);
    try {
      const pairs = [
        { key: "min_app_version", value: minAppVersion.trim() || "1.0.0" },
        { key: "terms_version",   value: termsVersion.trim()   || "1.0"  },
        { key: "app_store_url",   value: appStoreUrl.trim()            },
        { key: "play_store_url",  value: playStoreUrl.trim()           },
      ].filter(p => p.value !== "");
      await fetcher("/platform-settings", { method: "PUT", body: JSON.stringify({ settings: pairs }) });
      qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      toast({ title: "Compliance settings saved ✅" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setComplianceSaving(false);
  };

  /* ── Admin Mutations ── */
  const saveAdmin = useMutation({
    mutationFn: async (body: any) => {
      if (editingAdmin) return fetcher(`/admin-accounts/${editingAdmin.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return fetcher("/admin-accounts", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-app-overview"] });
      setAdminDialog(false); setEditingAdmin(null); setAdminForm({ ...EMPTY_ADMIN });
      toast({ title: editingAdmin ? "Admin updated ✅" : "Admin account created ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAdmin = useMutation({
    mutationFn: (id: string) => fetcher(`/admin-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-accounts"] }); toast({ title: "Admin removed" }); },
  });

  const toggleAdmin = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetcher(`/admin-accounts/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-accounts"] }),
  });

  /* ── Send password-reset link (super-admin only) ──
     Calls POST /api/admin/admin-accounts/:id/send-reset-link which issues a
     fresh single-use token (existing tokens for that account are invalidated
     server-side) and emails it. In non-prod, the API echoes back resetUrl so
     a super-admin can copy it directly when SMTP isn't configured. */
  const sendResetLink = useMutation({
    mutationFn: (id: string) =>
      fetcher(`/admin-accounts/${id}/send-reset-link`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async (data: { resetUrl?: string } | null | undefined) => {
      const resetUrl: string | undefined = data?.resetUrl;
      if (resetUrl) {
        // Surface clipboard failure: the toast previously claimed the link
        // was copied even when the browser blocked the write.
        const result = await safeCopyToClipboard(resetUrl);
        toast({
          title: result.ok ? "Reset link generated" : "Reset link generated (copy failed)",
          description: result.ok
            ? "Email sent. Link copied to clipboard for your records."
            : "Email sent, but the link could not be copied automatically — open the audit log to retrieve it.",
          variant: result.ok ? undefined : "destructive",
        });
      } else {
        toast({
          title: "Reset link sent",
          description: "An email with the reset link is on its way.",
        });
      }
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : "Please try again.";
      toast({
        title: "Could not send reset link",
        description: message,
        variant: "destructive",
      });
    },
  });

  /* ── Feature toggle ── */
  const toggleFeature = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) =>
      fetcher("/platform-settings", { method: "PUT", body: JSON.stringify({ settings: [{ key, value }] }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-app-overview"] });
    },
  });

  /* ── Maintenance mode ── */
  const handleMaintenanceSave = async () => {
    setSavingMaintenance(true);
    try {
      const newStatus = appStatus === "maintenance" ? "active" : "maintenance";
      await fetcher("/platform-settings", { method: "PUT", body: JSON.stringify({ settings: [{ key: "app_status", value: newStatus }] }) });
      qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-app-overview"] });
      toast({ title: newStatus === "maintenance" ? "🔧 Maintenance mode ON" : "✅ App is now Live", description: newStatus === "maintenance" ? "Users will see the maintenance screen." : "App is back to normal." });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSavingMaintenance(false);
  };

  /* ── Form handlers ── */
  const openNewAdmin = () => {
    setEditingAdmin(null); setAdminForm({ ...EMPTY_ADMIN }); setShowSecret(false); setAdminDialog(true);
  };
  const openEditAdmin = (a: AdminAccount) => {
    setEditingAdmin(a);
    setAdminForm({ name: a.name, email: a.email ?? "", secret: "", role: a.role, permissions: a.permissions, isActive: a.isActive });
    setShowSecret(false); setAdminDialog(true);
  };
  const togglePermission = (p: string) => {
    const perms = adminForm.permissions.split(",").filter(Boolean);
    const next = perms.includes(p) ? perms.filter(x => x !== p) : [...perms, p];
    setAdminForm(f => ({ ...f, permissions: next.join(",") }));
  };

  const submitAdmin = () => {
    if (!adminForm.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (!editingAdmin && !adminForm.secret) { toast({ title: "Secret required", variant: "destructive" }); return; }
    const trimmedEmail = adminForm.email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email or leave it blank.", variant: "destructive" });
      return;
    }
    const body: AdminFormBody = {
      name: adminForm.name,
      role: adminForm.role,
      permissions: adminForm.permissions,
      isActive: adminForm.isActive,
    };
    if (trimmedEmail) body.email = trimmedEmail;
    else if (editingAdmin) body.email = null;
    if (adminForm.secret) body.secret = adminForm.secret;
    saveAdmin.mutate(body);
  };

  const roleCfg = (role: string) => ADMIN_ROLES.find(r => r.val === role) || ADMIN_ROLES[1]!;

  /* ── Stat Card ── */
  function StatCard({ icon: Icon, label, value, sub, color }: any) {
    return (
      <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5"/></div>
        </div>
        <p className="text-2xl font-display font-bold mt-3">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
            <AppWindow className="w-6 h-6"/>
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">App Management</h1>
            <p className="text-sm text-muted-foreground">Control the entire app — status, admins, services</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tab === "admins" && (
            <Button onClick={openNewAdmin} className="h-10 rounded-xl gap-2">
              <Plus className="w-4 h-4"/> New Admin
            </Button>
          )}
          <Button variant="outline" onClick={() => { refetchOverview(); refetchAdmins(); }} className="h-10 rounded-xl gap-2">
            <RefreshCw className="w-4 h-4"/> Refresh
          </Button>
        </div>
      </div>

      {/* App Status Banner */}
      {appStatus === "maintenance" && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4 flex items-center gap-3">
          <WrenchIcon className="w-6 h-6 text-amber-600 flex-shrink-0"/>
          <div className="flex-1">
            <p className="font-bold text-amber-800">🔧 Maintenance Mode is ON</p>
            <p className="text-sm text-amber-700">The app is currently in maintenance — users cannot access it.</p>
          </div>
          <Button size="sm" onClick={handleMaintenanceSave} className="bg-green-600 hover:bg-green-700 rounded-xl text-xs">Go Live</Button>
        </div>
      )}

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-max min-w-full">
          {([
            { id: "overview",       label: "📊 Overview" },
            { id: "admins",         label: "👥 Admin Accounts" },
            { id: "maintenance",    label: "🔧 Services & Maintenance" },
            { id: "release-notes",  label: "🚀 Release Notes" },
            { id: "sessions",       label: "🌐 Active Sessions" },
            { id: "audit-log",      label: "📋 Audit Log" },
          ] as { id: AppManagementTab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${tab === t.id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Overview Tab ══ */}
      {tab === "overview" && (
        <div className="space-y-5">
          {overviewLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{[1,2,3,4,5,6].map(i=><div key={i} className="h-28 bg-muted rounded-2xl animate-pulse"/>)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard icon={Users}     label="Total Users"    value={overview?.users.total ?? 0}    sub={`${overview?.users.active} active · ${overview?.users.banned} banned`}  color="bg-blue-100 text-blue-600"/>
                <StatCard icon={ShoppingBag} label="Total Orders" value={overview?.orders.total ?? 0}  sub={`${overview?.orders.pending} pending`}  color="bg-indigo-100 text-indigo-600"/>
                <StatCard icon={Car}       label="Total Rides"    value={overview?.rides.total ?? 0}    sub={`${overview?.rides.active} active now`} color="bg-green-100 text-green-600"/>
                <StatCard icon={Pill}      label="Pharmacy Orders" value={overview?.pharmacy.total ?? 0} sub="all time"                               color="bg-pink-100 text-pink-600"/>
                <StatCard icon={Package}   label="Parcel Bookings" value={overview?.parcel.total ?? 0}  sub="all time"                               color="bg-orange-100 text-orange-600"/>
                <StatCard icon={Shield}    label="Admin Accounts"  value={overview?.adminAccounts ?? 0} sub="active sub-admins"                      color="bg-violet-100 text-violet-600"/>
              </div>

              {/* Feature status grid */}
              <Card className="rounded-2xl border-border/50">
                <div className="p-5 border-b border-border/50 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Activity className="w-5 h-5 text-emerald-600"/></div>
                  <div>
                    <h2 className="font-bold">Service Status</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Live status of all app services</p>
                  </div>
                </div>
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {SERVICE_MAP.map(svc => {
                      const featureVal = getSettingValue(settings, svc.setting, "on");
                      const isOn = featureVal === "on";
                      return (
                        <div key={svc.key} className={`relative overflow-hidden rounded-xl border p-4 transition-all ${isOn ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200" : "bg-gradient-to-br from-red-50 to-rose-50 border-red-200"}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isOn ? "bg-green-100" : "bg-red-100"}`}>
                              {svc.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{svc.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className={`w-2 h-2 rounded-full ${isOn ? "bg-green-500 animate-pulse" : "bg-red-400"}`}/>
                                <span className={`text-xs font-bold ${isOn ? "text-green-600" : "text-red-500"}`}>{isOn ? "Online" : "Offline"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ Admin Accounts Tab ══ */}
      {tab === "admins" && (
        <div className="space-y-4">
          {/* Master Admin info */}
          <Card className="rounded-2xl border-red-200 bg-red-50/50">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold text-red-800">Super Admin (Master)</p>
                <p className="text-sm text-red-700">Secret stored in env var <code className="bg-red-100 px-1 rounded">ADMIN_SECRET</code>. Full access to all features. Cannot be managed here.</p>
              </div>
            </CardContent>
          </Card>

          {adminsLoading ? (
            <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-20 bg-muted rounded-2xl animate-pulse"/>)}</div>
          ) : admins.length === 0 ? (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3"/>
                <p className="font-medium text-muted-foreground">No sub-admin accounts yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Create accounts for managers, support, finance staff</p>
                <Button onClick={openNewAdmin} className="mt-4 rounded-xl gap-2"><Plus className="w-4 h-4"/>Add Admin Account</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {admins.map(a => {
                const cfg = roleCfg(a.role);
                return (
                  <Card key={a.id} className="rounded-2xl border-border/50 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600 flex-shrink-0">
                          {a.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground">{a.name}</p>
                            <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            {!a.isActive && <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500">Inactive</Badge>}
                          </div>
                          <div className="flex gap-3 mt-1 flex-wrap">
                            <p className="text-xs text-muted-foreground">Permissions: {a.permissions ? a.permissions.split(",").slice(0,4).join(", ") + (a.permissions.split(",").length > 4 ? `... +${a.permissions.split(",").length - 4} more` : "") : "all"}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last login: {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => toggleAdmin.mutate({ id: a.id, isActive: !a.isActive })} className="p-2 hover:bg-muted rounded-lg" title={a.isActive ? "Deactivate" : "Activate"}>
                            {a.isActive ? <ToggleRight className="w-5 h-5 text-green-600"/> : <ToggleLeft className="w-5 h-5 text-muted-foreground"/>}
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => {
                                if (!a.email) {
                                  toast({
                                    title: "No email on file",
                                    description: "Add an email to this admin before sending a reset link.",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                if (window.confirm(`Send a password reset link to ${a.email}?`)) {
                                  sendResetLink.mutate(a.id);
                                }
                              }}
                              disabled={sendResetLink.isPending}
                              className="p-2 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                              title={a.email ? `Send reset link to ${a.email}` : "Admin has no email on file"}
                              data-testid={`button-send-reset-link-${a.id}`}
                            >
                              <Mail className="w-4 h-4 text-amber-600"/>
                            </button>
                          )}
                          <button onClick={() => openEditAdmin(a)} className="p-2 hover:bg-muted rounded-lg" title="Edit">
                            <Pencil className="w-4 h-4 text-blue-600"/>
                          </button>
                          <button onClick={() => deleteAdmin.mutate(a.id)} className="p-2 hover:bg-red-50 rounded-lg" title="Delete">
                            <Trash2 className="w-4 h-4 text-red-500"/>
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Services & Maintenance Tab ══ */}
      {tab === "maintenance" && (
        <div className="space-y-5">
          {/* Maintenance Mode */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <div className="p-5 border-b border-border/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><WrenchIcon className="w-5 h-5 text-amber-600"/></div>
              <h2 className="font-bold">Maintenance Mode</h2>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className={`flex items-center justify-between p-4 rounded-xl border ${appStatus === "maintenance" ? "bg-amber-50 border-amber-300" : "bg-green-50 border-green-200"}`}>
                <div className="flex items-center gap-3">
                  {appStatus === "maintenance"
                    ? <WrenchIcon className="w-6 h-6 text-amber-600"/>
                    : <CheckCircle2 className="w-6 h-6 text-green-600"/>}
                  <div>
                    <p className="font-bold">{appStatus === "maintenance" ? "🔧 App is in Maintenance" : "✅ App is Live"}</p>
                    <p className="text-sm text-muted-foreground">{appStatus === "maintenance" ? "Users see the maintenance screen and cannot use the app." : "All services are running normally."}</p>
                  </div>
                </div>
                <Button
                  onClick={handleMaintenanceSave}
                  disabled={savingMaintenance}
                  className={`rounded-xl ${appStatus === "maintenance" ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"}`}
                >
                  {savingMaintenance ? "..." : appStatus === "maintenance" ? "Go Live" : "Enable Maintenance"}
                </Button>
              </div>
              {appStatus === "maintenance" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5"/>
                  <p className="text-sm text-amber-700">While in maintenance mode, only admin panel is accessible. Mobile app shows a maintenance screen.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Service Toggles */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Zap className="w-5 h-5 text-blue-600"/></div>
                <div>
                  <h2 className="font-bold">Live Service Control</h2>
                  <p className="text-xs text-muted-foreground">Toggle services on/off instantly — changes apply immediately</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {SERVICE_MAP.filter(svc => getSettingValue(settings, svc.setting, "on") === "on").length}/{SERVICE_MAP.length} Active
              </Badge>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SERVICE_MAP.map(svc => {
                  const featureVal = getSettingValue(settings, svc.setting, "on");
                  const isOn = featureVal === "on";
                  return (
                    <div
                      key={svc.key}
                      className={`group relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${isOn ? "border-green-200 bg-white hover:border-green-300 hover:shadow-md" : "border-gray-200 bg-gray-50/50 hover:border-gray-300"}`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 transition-colors ${isOn ? "bg-green-500" : "bg-gray-300"}`}/>
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all ${isOn ? "bg-gradient-to-br from-green-50 to-emerald-100 shadow-sm" : "bg-gray-100"}`}>
                            {svc.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-bold text-sm">{svc.label}</p>
                              <Badge className={`text-[10px] px-1.5 py-0 h-4 ${isOn ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-600 border-red-200"}`} variant="outline">
                                {isOn ? "Live" : "Off"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{svc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isOn ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}/>
                            <span className={`text-xs font-semibold ${isOn ? "text-green-600" : "text-gray-500"}`}>
                              {isOn ? "Running" : "Stopped"}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleFeature.mutate({ key: svc.setting, value: isOn ? "off" : "on" })}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 ${isOn ? "bg-green-500 focus:ring-green-300" : "bg-gray-300 focus:ring-gray-300"}`}
                          >
                            <span className={`absolute w-5 h-5 bg-white rounded-full shadow-md top-0.5 transition-transform duration-200 ${isOn ? "translate-x-6" : "translate-x-0.5"}`}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ Release Notes Tab ══ */}
      {tab === "release-notes" && (
        <div className="space-y-5">
          {/* Compliance Settings */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <div className="p-5 border-b border-border/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Smartphone className="w-5 h-5 text-purple-600"/></div>
              <div>
                <h2 className="font-bold">App Version Compliance</h2>
                <p className="text-xs text-muted-foreground">Force-update enforcement and terms versioning</p>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Minimum Required Version</label>
                  <Input
                    placeholder="e.g. 1.2.0"
                    value={minAppVersion}
                    onChange={e => setMinAppVersion(e.target.value)}
                    className="h-10 rounded-xl font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Users on older versions will be forced to update</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Terms Version</label>
                  <Input
                    placeholder="e.g. 2.0"
                    value={termsVersion}
                    onChange={e => setTermsVersion(e.target.value)}
                    className="h-10 rounded-xl font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Changing this forces users to re-accept T&amp;Cs</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">App Store URL (iOS)</label>
                  <Input
                    placeholder="https://apps.apple.com/..."
                    value={appStoreUrl}
                    onChange={e => setAppStoreUrl(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Play Store URL (Android)</label>
                  <Input
                    placeholder="https://play.google.com/store/apps/..."
                    value={playStoreUrl}
                    onChange={e => setPlayStoreUrl(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              <Button onClick={handleComplianceSave} disabled={complianceSaving} className="rounded-xl gap-2">
                <Save className="w-4 h-4"/>
                {complianceSaving ? "Saving..." : "Save Compliance Settings"}
              </Button>
            </CardContent>
          </Card>

          {/* Release Notes List */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><FileText className="w-5 h-5 text-emerald-600"/></div>
                <div>
                  <h2 className="font-bold">What's New — Release Notes</h2>
                  <p className="text-xs text-muted-foreground">Shown to users after app update</p>
                </div>
              </div>
              <Button onClick={openNewRn} className="h-9 rounded-xl gap-2 text-sm">
                <Plus className="w-4 h-4"/> Add Release
              </Button>
            </div>
            <CardContent className="p-5">
              {rnLoading ? (
                <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-muted rounded-xl animate-pulse"/>)}</div>
              ) : releaseNotes.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3"/>
                  <p className="text-muted-foreground text-sm">No release notes yet. Add your first one!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {releaseNotes.map((rn: any) => (
                    <div key={rn.id} className="border border-border/50 rounded-xl p-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs font-mono bg-purple-50 text-purple-700 border-purple-200">
                              v{rn.version}
                            </Badge>
                            {rn.releaseDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="w-3 h-3"/> {rn.releaseDate}
                              </span>
                            )}
                          </div>
                          <ul className="space-y-1">
                            {(Array.isArray(rn.notes) ? rn.notes : []).slice(0, 3).map((note: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span className="line-clamp-1">{note}</span>
                              </li>
                            ))}
                            {Array.isArray(rn.notes) && rn.notes.length > 3 && (
                              <li className="text-xs text-muted-foreground/60">+{rn.notes.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => openEditRn(rn)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="w-3.5 h-3.5"/>
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete release notes for v${rn.version}?`)) deleteRn.mutate(rn.id); }}
                            className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ Release Notes Dialog ══ */}
      <Dialog open={rnDialog} onOpenChange={v => { setRnDialog(v); if (!v) { setEditingRn(null); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600"/>
              {editingRn ? "Edit Release Notes" : "Add Release Notes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Version <span className="text-red-500">*</span></label>
                <Input placeholder="e.g. 1.2.0" value={rnForm.version} onChange={e => setRnForm(f=>({...f, version: e.target.value}))} className="h-10 rounded-xl font-mono"/>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Release Date</label>
                <Input type="date" value={rnForm.releaseDate} onChange={e => setRnForm(f=>({...f, releaseDate: e.target.value}))} className="h-10 rounded-xl"/>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Release Notes <span className="text-red-500">*</span></label>
              <textarea
                placeholder={"One note per line:\nNew feature added\nBug fix: order tracking\nImproved performance"}
                value={rnForm.notes}
                onChange={e => setRnForm(f=>({...f, notes: e.target.value}))}
                rows={6}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Enter one bullet point per line — each line becomes a separate item in the "What's New" sheet</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Sort Order</label>
              <Input type="number" placeholder="0" value={rnForm.sortOrder} onChange={e => setRnForm(f=>({...f, sortOrder: e.target.value}))} className="h-10 rounded-xl w-32"/>
              <p className="text-xs text-muted-foreground">Lower number = shown first</p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRnDialog(false)}>Cancel</Button>
              <Button onClick={submitRn} disabled={saveRn.isPending} className="flex-1 rounded-xl gap-2">
                <Save className="w-4 h-4"/>
                {saveRn.isPending ? "Saving..." : (editingRn ? "Update" : "Create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Admin Account Dialog ══ */}
      <Dialog open={adminDialog} onOpenChange={v => { setAdminDialog(v); if (!v) { setEditingAdmin(null); setAdminForm({ ...EMPTY_ADMIN }); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600"/>
              {editingAdmin ? "Edit Admin Account" : "Create Admin Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Full Name <span className="text-red-500">*</span></label>
              <Input placeholder="e.g. Ahmed Khan" value={adminForm.name} onChange={e => setAdminForm(f=>({...f, name: e.target.value}))} className="h-11 rounded-xl"/>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Email
                <span className="text-xs font-normal text-muted-foreground ml-1">(used for password resets)</span>
              </label>
              <Input
                type="email"
                placeholder="ahmed@ajkmart.local"
                value={adminForm.email}
                onChange={e => setAdminForm(f=>({...f, email: e.target.value}))}
                className="h-11 rounded-xl"
                data-testid="input-admin-email"
              />
            </div>

            {/* Secret */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Admin Secret {!editingAdmin && <span className="text-red-500">*</span>}
                {editingAdmin && <span className="text-xs font-normal text-muted-foreground ml-1">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Create a strong secret key"
                  value={adminForm.secret}
                  onChange={e => setAdminForm(f=>({...f, secret: e.target.value}))}
                  className="h-11 rounded-xl pr-10 font-mono"
                />
                <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">This secret is used to log in to the admin panel. Keep it secure.</p>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ADMIN_ROLES.filter(r => r.val !== "super").map(r => (
                  <div
                    key={r.val}
                    onClick={() => setAdminForm(f=>({...f, role: r.val}))}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${adminForm.role === r.val ? "border-blue-400 bg-blue-50" : "border-border hover:border-blue-200 bg-muted/30"}`}
                  >
                    <Badge variant="outline" className={`text-xs mb-1.5 ${r.color}`}>{r.label}</Badge>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Page Access</label>
              <div className="flex flex-wrap gap-2">
                {PERMISSIONS.map(p => {
                  const active = adminForm.permissions.split(",").includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => togglePermission(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${active ? "bg-blue-600 text-white border-blue-600" : "bg-muted border-border text-muted-foreground hover:border-blue-300"}`}
                    >
                      {p.replace("-", " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active toggle */}
            <div
              onClick={() => setAdminForm(f=>({...f, isActive: !f.isActive}))}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer ${adminForm.isActive ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}
            >
              <span className="text-sm font-semibold">Account Active</span>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${adminForm.isActive ? "bg-green-500" : "bg-gray-300"}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-transform ${adminForm.isActive ? "translate-x-5" : "translate-x-0.5"}`}/>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setAdminDialog(false)}>Cancel</Button>
              <Button onClick={submitAdmin} disabled={saveAdmin.isPending} className="flex-1 rounded-xl gap-2">
                <Save className="w-4 h-4"/>
                {saveAdmin.isPending ? "Saving..." : (editingAdmin ? "Update" : "Create Admin")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Audit Log Tab ══ */}
      {tab === "audit-log" && <AuditLogTab />}

      {/* ══ Sessions Tab ══ */}
      {tab === "sessions" && <SessionsTab />}
    </div>
  );
}
