/**
 * Roles & Permissions admin page.
 * Lists RBAC roles, allows editing the permissions on each role,
 * and creating new custom roles. Built-in roles can be edited but not deleted.
 *
 * Backend enforcement lives at /api/admin/system/rbac/* —
 * the UI here is gated by `system.roles.manage` for write actions.
 */
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shared";
import { Shield, Plus, Save, Trash2, RefreshCw, Search, Lock, Users, KeyRound, Pencil } from "lucide-react";
import { fetchAdmin } from "@/lib/adminFetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAbortableEffect, isAbortError } from "@/lib/useAbortableEffect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface PermissionDef {
  id: string;
  category: string;
  label?: string;
  description?: string;
  highRisk?: boolean;
}

interface RbacRole {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  permissions: string[];
}

interface AdminAccount {
  id: string;
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
}

export default function RolesPermissionsPage() {
  const { toast } = useToast();
  const { has, isSuper } = usePermissions();
  const canManage = isSuper || has("system.roles.manage");

  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"roles" | "admins">("roles");
  const [confirmRemoveRole, setConfirmRemoveRole] = useState(false);

  /* ── Single-dialog create role ──────────────────────────────────── */
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  /* ── Inline edit role name/description ─────────────────────────── */
  const [showEditRole, setShowEditRole] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  /* ── Unsaved-changes guard ──────────────────────────────────────── */
  const [pendingRole, setPendingRole] = useState<RbacRole | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  /* ── Admin assignments tab state ────────────────────────────────── */
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminRoleMap, setAdminRoleMap] = useState<Record<string, string[]>>({});
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);
  const [activeAdminEffective, setActiveAdminEffective] = useState<string[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");

  const activeRole = useMemo(
    () => roles.find(r => r.id === activeRoleId) ?? null,
    [roles, activeRoleId],
  );

  const dirty = useMemo(() => {
    if (!activeRole) return false;
    if (activeRole.permissions.length !== draftPerms.size) return true;
    return activeRole.permissions.some(p => !draftPerms.has(p))
      || [...draftPerms].some(p => !activeRole.permissions.includes(p));
  }, [activeRole, draftPerms]);

  const reload = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [catRes, rolesRes] = await Promise.all([
        fetchAdmin("/system/rbac/permissions", { signal }),
        fetchAdmin("/system/rbac/roles", { signal }),
      ]);
      if (signal?.aborted) return;
      const cat: PermissionDef[] = catRes?.data?.permissions ?? catRes?.permissions ?? [];
      const rls: RbacRole[] = rolesRes?.data?.roles ?? rolesRes?.roles ?? [];
      setCatalog(cat);
      setRoles(rls);
      if (rls.length && !activeRoleId) {
        setActiveRoleId(rls[0]!.id);
        setDraftPerms(new Set(rls[0]!.permissions));
      }
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("[RolesPermissions] reload failed:", err);
      toast({ title: "Failed to load roles", description: String(err), variant: "destructive" });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useAbortableEffect((signal) => { void reload(signal); }, []);

  /* ── Admin assignments ──────────────────────────────────────────── */
  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const res = await fetchAdmin("/admin-accounts");
      const list: AdminAccount[] =
        res?.data?.accounts
        ?? res?.accounts
        ?? res?.data?.adminAccounts
        ?? res?.adminAccounts
        ?? (Array.isArray(res?.data) ? res.data : null)
        ?? (Array.isArray(res) ? res : [])
        ?? [];
      setAdmins(Array.isArray(list) ? list : []);
      const map: Record<string, string[]> = {};
      await Promise.all((Array.isArray(list) ? list : []).map(async a => {
        try {
          const r = await fetchAdmin(`/system/rbac/admins/${a.id}/roles`);
          const rs: RbacRole[] = r?.data?.roles ?? r?.roles ?? [];
          map[a.id] = rs.map(x => x.id);
        } catch { map[a.id] = []; }
      }));
      setAdminRoleMap(map);
    } catch (err) {
      toast({ title: "Failed to load admins", description: String(err), variant: "destructive" });
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => { if (tab === "admins" && !admins.length) void loadAdmins(); /* eslint-disable-next-line */ }, [tab]);

  const selectAdmin = async (a: AdminAccount) => {
    setActiveAdminId(a.id);
    setActiveAdminEffective([]);
    try {
      const r = await fetchAdmin(`/system/rbac/admins/${a.id}/effective-permissions`);
      setActiveAdminEffective(r?.data?.permissions ?? r?.permissions ?? []);
    } catch { /* non-fatal */ }
  };

  const toggleAdminRole = async (adminId: string, roleId: string) => {
    if (!canManage) return;
    const current = new Set(adminRoleMap[adminId] ?? []);
    if (current.has(roleId)) current.delete(roleId); else current.add(roleId);
    const next = [...current];
    setAdminRoleMap(prev => ({ ...prev, [adminId]: next }));
    try {
      await fetchAdmin(`/system/rbac/admins/${adminId}/roles`, {
        method: "PUT", body: JSON.stringify({ roleIds: next }),
      });
      toast({ title: "Roles updated" });
      if (activeAdminId === adminId) await selectAdmin({ id: adminId } as AdminAccount);
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
      void loadAdmins();
    }
  };

  /* Attempt to switch to a different role; show discard dialog if dirty */
  const trySelectRole = (role: RbacRole) => {
    if (role.id === activeRoleId) return;
    if (dirty) {
      setPendingRole(role);
      setShowDiscardDialog(true);
    } else {
      doSelectRole(role);
    }
  };

  const doSelectRole = (role: RbacRole) => {
    setActiveRoleId(role.id);
    setDraftPerms(new Set(role.permissions));
  };

  const togglePerm = (id: string) => {
    if (!canManage) return;
    setDraftPerms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoryAll = (perms: PermissionDef[], selectAll: boolean) => {
    if (!canManage) return;
    setDraftPerms(prev => {
      const next = new Set(prev);
      for (const p of perms) {
        if (selectAll) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  };

  const save = async () => {
    if (!activeRole || !canManage) return;
    setSaving(true);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: [...draftPerms] }),
      });
      toast({ title: "Saved", description: `Permissions updated for ${activeRole.name}` });
      await reload();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openCreateRole = () => {
    setNewSlug("");
    setNewName("");
    setNewDesc("");
    setShowCreateRole(true);
  };

  const submitNewRole = async () => {
    const slug = newSlug.trim();
    const name = newName.trim() || slug;
    if (!slug) return;
    setCreating(true);
    try {
      const res = await fetchAdmin("/system/rbac/roles", {
        method: "POST",
        body: JSON.stringify({ slug, name, description: newDesc.trim() || undefined }),
      });
      const role = (res?.data?.role ?? res?.role) as RbacRole | undefined;
      toast({ title: "Role created", description: name });
      setShowCreateRole(false);
      setFilter("");
      await reload();
      if (role) { setActiveRoleId(role.id); setDraftPerms(new Set()); }
    } catch (err) {
      toast({ title: "Create failed", description: String(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEditRole = () => {
    if (!activeRole) return;
    setEditName(activeRole.name);
    setEditDesc(activeRole.description ?? "");
    setShowEditRole(true);
  };

  const submitEditRole = async () => {
    if (!activeRole) return;
    setEditSaving(true);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() || undefined, description: editDesc.trim() === "" ? null : editDesc.trim() }),
      });
      toast({ title: "Role updated" });
      setShowEditRole(false);
      await reload();
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const performRemoveRole = async () => {
    if (!activeRole || activeRole.isBuiltIn) return;
    setConfirmRemoveRole(false);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}`, { method: "DELETE" });
      toast({ title: "Role deleted" });
      setActiveRoleId(null);
      await reload();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return catalog;
    const q = filter.toLowerCase();
    return catalog.filter(p =>
      p.id.toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q) ||
      (p.label ?? "").toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q),
    );
  }, [catalog, filter]);

  const grouped = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const p of filtered) {
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const filteredAdmins = useMemo(() => {
    if (!adminSearch) return admins;
    const q = adminSearch.toLowerCase();
    return admins.filter(a =>
      (a.name ?? "").toLowerCase().includes(q) ||
      (a.username ?? "").toLowerCase().includes(q) ||
      (a.email ?? "").toLowerCase().includes(q),
    );
  }, [admins, adminSearch]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        icon={Shield}
        title="Roles & Permissions"
        subtitle={`Fine-grained access control for admin users.${!canManage ? " (read-only — system.roles.manage required to edit)" : ""}`}
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-700"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { void (tab === "roles" ? reload() : loadAdmins()); }} disabled={loading || adminsLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${(loading || adminsLoading) ? "animate-spin" : ""}`} /> Reload
            </Button>
            {canManage && tab === "roles" && (
              <Button onClick={openCreateRole}>
                <Plus className="h-4 w-4 mr-2" /> New role
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="border-b flex gap-1">
        <button
          onClick={() => setTab("roles")}
          data-testid="tab-roles"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "roles" ? "border-indigo-600 text-indigo-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Shield className="inline h-4 w-4 mr-1.5 -mt-0.5" />Roles
        </button>
        <button
          onClick={() => setTab("admins")}
          data-testid="tab-admins"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "admins" ? "border-indigo-600 text-indigo-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="inline h-4 w-4 mr-1.5 -mt-0.5" />Admin assignments
        </button>
      </div>

      {tab === "admins" ? (
        <AdminAssignments
          admins={filteredAdmins}
          allAdmins={admins}
          roles={roles}
          adminRoleMap={adminRoleMap}
          activeAdminId={activeAdminId}
          activeAdminEffective={activeAdminEffective}
          onSelect={selectAdmin}
          onToggleRole={toggleAdminRole}
          canManage={canManage}
          loading={adminsLoading}
          search={adminSearch}
          onSearchChange={setAdminSearch}
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Roles list — scrollable */}
        <aside className="border rounded-lg bg-white flex flex-col">
          <div className="p-3 border-b text-xs uppercase tracking-wider text-muted-foreground shrink-0">
            Roles ({roles.length})
          </div>
          <ul className="divide-y max-h-[70vh] overflow-y-auto">
            {roles.map(r => (
              <li key={r.id}>
                <button
                  onClick={() => trySelectRole(r)}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${activeRoleId === r.id ? "bg-indigo-50" : ""}`}
                  data-testid={`role-${r.slug}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.isBuiltIn && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Lock className="h-3 w-3 mr-1" />built-in
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.slug} · {r.permissions.length} perms</div>
                </button>
              </li>
            ))}
            {!roles.length && !loading && (
              <li className="p-3 text-sm text-muted-foreground">No roles defined yet.</li>
            )}
          </ul>
        </aside>

        {/* Permission editor — scrollable */}
        <section className="border rounded-lg bg-white flex flex-col">
          {!activeRole ? (
            <div className="p-6 text-sm text-muted-foreground">Select a role to view its permissions.</div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="font-semibold">{activeRole.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {activeRole.description || "No description"} · {draftPerms.size} of {catalog.length} permissions
                    </p>
                  </div>
                  {canManage && !activeRole.isBuiltIn && (
                    <Button variant="ghost" size="sm" onClick={openEditRole} title="Edit role name / description">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter permissions…"
                      className="pl-8 h-9 w-64"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                    />
                  </div>
                  {canManage && !activeRole.isBuiltIn && (
                    <Button variant="ghost" onClick={() => setConfirmRemoveRole(true)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  )}
                  {canManage && (
                    <Button onClick={save} disabled={!dirty || saving}>
                      <Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : "Save"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
                {grouped.map(([category, perms]) => {
                  const allChecked = perms.every(p => draftPerms.has(p.id));
                  const noneChecked = perms.every(p => !draftPerms.has(p.id));
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {category}
                        </h3>
                        {canManage && (
                          <div className="flex gap-2">
                            <button
                              className="text-[11px] text-indigo-600 hover:underline disabled:opacity-40"
                              disabled={allChecked}
                              onClick={() => toggleCategoryAll(perms, true)}
                            >
                              Select all
                            </button>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <button
                              className="text-[11px] text-muted-foreground hover:underline disabled:opacity-40"
                              disabled={noneChecked}
                              onClick={() => toggleCategoryAll(perms, false)}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {perms.map(p => {
                          const checked = draftPerms.has(p.id);
                          return (
                            <li key={p.id}>
                              <label className={`flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer ${checked ? "bg-indigo-50/50" : "hover:bg-slate-50"}`}>
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={checked}
                                  onChange={() => togglePerm(p.id)}
                                  disabled={!canManage}
                                  data-testid={`perm-${p.id}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <code className="text-sm font-mono">{p.id}</code>
                                    {p.highRisk && (
                                      <Badge variant="destructive" className="text-[10px]">high-risk</Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{p.label || p.description || ""}</div>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {!grouped.length && (
                  <div className="text-sm text-muted-foreground">No permissions match the filter.</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      )}

      {/* ── Create role dialog (single form) ────────────────────────── */}
      <Dialog open={showCreateRole} onOpenChange={o => { if (!o && !creating) setShowCreateRole(false); }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Create new role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Slug <span className="text-red-500">*</span></label>
              <Input
                autoFocus
                placeholder="e.g. billing_manager"
                value={newSlug}
                onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers and underscores only.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Display name</label>
              <Input
                placeholder="e.g. Billing Manager"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                disabled={creating}
                onKeyDown={e => { if (e.key === "Enter" && newSlug.trim()) void submitNewRole(); }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="Short description of this role's purpose"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRole(false)} disabled={creating}>Cancel</Button>
            <Button onClick={() => void submitNewRole()} disabled={!newSlug.trim() || creating}>
              {creating ? "Creating…" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit role dialog ─────────────────────────────────────────── */}
      <Dialog open={showEditRole} onOpenChange={o => { if (!o && !editSaving) setShowEditRole(false); }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Display name</label>
              <Input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                disabled={editSaving}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                disabled={editSaving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRole(false)} disabled={editSaving}>Cancel</Button>
            <Button onClick={() => void submitEditRole()} disabled={!editName.trim() || editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Discard unsaved changes guard ───────────────────────────── */}
      <ConfirmDialog
        open={showDiscardDialog}
        title="Discard unsaved changes?"
        description="You have unsaved permission changes on this role. Discard them and switch roles?"
        confirmLabel="Discard"
        cancelLabel="Stay"
        variant="destructive"
        onConfirm={() => {
          setShowDiscardDialog(false);
          if (pendingRole) { doSelectRole(pendingRole); setPendingRole(null); }
        }}
        onClose={() => { setShowDiscardDialog(false); setPendingRole(null); }}
      />

      {/* ── Delete role confirmation ─────────────────────────────────── */}
      <ConfirmDialog
        open={confirmRemoveRole}
        onClose={() => setConfirmRemoveRole(false)}
        onConfirm={performRemoveRole}
        title="Delete role"
        description={activeRole ? `Delete role "${activeRole.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}

interface AdminAssignmentsProps {
  admins: AdminAccount[];
  allAdmins: AdminAccount[];
  roles: RbacRole[];
  adminRoleMap: Record<string, string[]>;
  activeAdminId: string | null;
  activeAdminEffective: string[];
  onSelect: (a: AdminAccount) => void;
  onToggleRole: (adminId: string, roleId: string) => void;
  canManage: boolean;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
}

function AdminAssignments({
  admins, allAdmins, roles, adminRoleMap, activeAdminId, activeAdminEffective,
  onSelect, onToggleRole, canManage, loading, search, onSearchChange,
}: AdminAssignmentsProps) {
  const active = allAdmins.find(a => a.id === activeAdminId) ?? null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
      <aside className="border rounded-lg bg-white flex flex-col">
        <div className="p-3 border-b text-xs uppercase tracking-wider text-muted-foreground shrink-0">
          Admins ({allAdmins.length}) {loading && <span className="ml-2">loading…</span>}
        </div>
        <div className="p-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        </div>
        <ul className="divide-y max-h-[60vh] overflow-y-auto">
          {admins.map(a => (
            <li key={a.id}>
              <button
                onClick={() => onSelect(a)}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${activeAdminId === a.id ? "bg-indigo-50" : ""}`}
                data-testid={`admin-${a.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.name || a.username || a.email || a.id}</span>
                  {a.role && <Badge variant="secondary" className="text-[10px]">{a.role}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.email || a.username || a.id} · {(adminRoleMap[a.id] ?? []).length} extra role(s)
                </div>
              </button>
            </li>
          ))}
          {!admins.length && !loading && (
            <li className="p-3 text-sm text-muted-foreground">
              {search ? "No admins match the search." : "No admin accounts found."}
            </li>
          )}
        </ul>
      </aside>

      <section className="border rounded-lg bg-white">
        {!active ? (
          <div className="p-6 text-sm text-muted-foreground">Select an admin to manage their role assignments.</div>
        ) : (
          <>
            <div className="p-4 border-b">
              <h2 className="font-semibold">{active.name || active.username || active.email || active.id}</h2>
              <p className="text-xs text-muted-foreground">
                Legacy role: <code>{active.role || "—"}</code> · {(adminRoleMap[active.id] ?? []).length} RBAC role(s) assigned
              </p>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Roles</h3>
                <ul className="space-y-1">
                  {roles.map(r => {
                    const checked = (adminRoleMap[active.id] ?? []).includes(r.id);
                    return (
                      <li key={r.id}>
                        <label className={`flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer ${checked ? "bg-indigo-50/50" : "hover:bg-slate-50"}`}>
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => onToggleRole(active.id, r.id)}
                            disabled={!canManage}
                            data-testid={`assign-${r.slug}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{r.name}</span>
                              {r.isBuiltIn && (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Lock className="h-3 w-3 mr-1" />built-in
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{r.slug} · {r.permissions.length} perms</div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  <KeyRound className="inline h-3 w-3 mr-1" /> Effective permissions ({activeAdminEffective.length})
                </h3>
                {activeAdminEffective.length ? (
                  <ul className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
                    {activeAdminEffective.map(p => (
                      <li key={p}><code className="text-xs">{p}</code></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No permissions resolved yet. (Super admins implicitly have every permission.)
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

    </div>
  );
}
