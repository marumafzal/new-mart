import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search, CheckCircle2, XCircle, Wallet, RefreshCw, Trash2,
  Activity, ShoppingBag, Car, Pill, Package, Shield, UserCog,
  Ban, KeyRound, Save, AlertTriangle, MapPin, CreditCard, Truck, Building2,
  Download, FileText, CalendarDays, Eye, AlertCircle, MessageSquare,
  Users as UsersIcon, Loader2, AtSign, Phone, Mail, User as UserIcon,
  Gavel, Lock, Copy, UserPlus, Monitor, ChevronDown,
} from "lucide-react";
import { PageHeader, StatCard, FilterBar, ActionBar } from "@/components/shared";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useUsers, useUpdateUser, useDeleteUser, useUserActivity, usePendingUsers, useApproveUser, useRejectUser, useRequestUserCorrection, useBulkBanUsers, useBulkDeleteUsers, useBulkRestoreUsers, useCreateUser, useAdminUserSessions, useRevokeUserSession, useRevokeAllUserSessions, type CreateUserInput } from "@/hooks/use-admin";
import { WalletAdjustModal } from "@/components/WalletAdjustModal";
import { fetcher } from "@/lib/api";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobileDrawer } from "@/components/MobileDrawer";

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-blue-100 text-blue-700 border-blue-200",
  rider:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  vendor:   "bg-orange-100 text-orange-700 border-orange-200",
  admin:    "bg-purple-100 text-purple-700 border-purple-200",
};

function SkeletonRow() {
  return (
    <TableRow className="animate-pulse">
      <TableCell><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-muted" /><div className="space-y-1.5"><div className="h-4 w-28 bg-muted rounded" /><div className="h-3 w-20 bg-muted rounded" /></div></div></TableCell>
      <TableCell><div className="h-4 w-24 bg-muted rounded" /></TableCell>
      <TableCell><div className="h-5 w-16 bg-muted rounded-full" /></TableCell>
      <TableCell className="text-right"><div className="h-4 w-16 bg-muted rounded ml-auto" /></TableCell>
      <TableCell className="text-center"><div className="h-5 w-12 bg-muted rounded-full mx-auto" /></TableCell>
      <TableCell className="text-right"><div className="h-4 w-20 bg-muted rounded ml-auto" /></TableCell>
      <TableCell className="text-right"><div className="h-8 w-32 bg-muted rounded ml-auto" /></TableCell>
    </TableRow>
  );
}

function formatStatus(s: string): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PaginationControl({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground">
      <p>Page {page} of {totalPages} · {total} total</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  );
}

function UserActivityModal({ userId, userName, user: userData, onClose }: { userId: string; userName: string; user: any; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useUserActivity(userId);
  const userRoles = (userData.roles || userData.role || "customer").split(",").filter(Boolean);
  const isRider  = userRoles.includes("rider");
  const isVendor = userRoles.includes("vendor");

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={<><Activity className="w-5 h-5 text-indigo-600" /> Activity — {userName}</>}
      dialogClassName="w-[95vw] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl"
    >

        <div className="bg-gradient-to-r from-[#1A56DB]/5 to-blue-50 rounded-xl p-3 space-y-2 border border-blue-100">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Profile Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {userData.email && (
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-muted-foreground">✉</span>
                <span className="text-foreground">{userData.email}</span>
              </div>
            )}
            {userData.cnic && (
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="text-muted-foreground text-xs">CNIC:</span>
                <span className="font-mono text-xs font-semibold">{userData.cnic}</span>
              </div>
            )}
            {userData.city && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#1A56DB] flex-shrink-0" />
                <span className="text-muted-foreground text-xs">City:</span>
                <span className="font-semibold text-xs">{userData.city}</span>
              </div>
            )}
            {userData.address && (
              <div className="flex items-center gap-2 col-span-2">
                <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{userData.address}</span>
              </div>
            )}
            {isRider && userData.vehicleType && (
              <div className="flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span className="text-muted-foreground text-xs">Vehicle:</span>
                <span className="font-semibold text-xs capitalize">{userData.vehicleType}</span>
              </div>
            )}
            {isRider && userData.vehiclePlate && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{userData.vehiclePlate}</span>
              </div>
            )}
            {isRider && userData.emergencyContact && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Emergency:</span>
                <span className="text-xs font-semibold">{userData.emergencyContact}</span>
              </div>
            )}
            {isVendor && userData.businessType && (
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                <span className="text-muted-foreground text-xs">Business:</span>
                <span className="font-semibold text-xs capitalize">{userData.businessType}</span>
              </div>
            )}
            {(isRider || isVendor) && userData.bankName && (
              <div className="flex items-center gap-2 col-span-2 bg-sky-50 border border-sky-200 rounded-xl px-2 py-1.5">
                <span className="text-xs font-bold text-sky-700">Bank:</span>
                <span className="text-xs text-sky-800">{userData.bankName}</span>
                {userData.bankAccountTitle && <span className="text-xs text-muted-foreground">· {userData.bankAccountTitle}</span>}
                {userData.bankAccount && <span className="font-mono text-xs font-bold text-sky-900">{userData.bankAccount}</span>}
              </div>
            )}
            <div className="flex items-center gap-2 col-span-2">
              <Lock className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="text-muted-foreground text-xs">MPIN Status:</span>
              {(() => {
                const hasMpin = !!userData.walletPinHash;
                const isLocked = !!userData.isMpinLocked;
                if (!hasMpin) return <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-600 border-gray-300">Not Set</Badge>;
                if (isLocked) {
                  return <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300">Locked</Badge>;
                }
                return <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">Active</Badge>;
              })()}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-[#1A56DB]" />
            <span className="text-sm">Loading activity...</span>
          </div>
        ) : isError ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-red-500">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-sm">Failed to load activity data.</span>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><ShoppingBag className="w-4 h-4 text-indigo-600" /> Recent Orders ({data?.orders?.length || 0})</h3>
              {data?.orders?.length === 0 ? <p className="text-xs text-muted-foreground italic">No orders yet.</p> : (
                <div className="space-y-2">
                  {data?.orders?.map((o: any) => (
                    <div key={o.id} className="flex justify-between items-center text-sm bg-muted/30 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                      <div><span className="font-mono font-bold text-xs">{o.id.slice(-6).toUpperCase()}</span><span className="ml-2 text-muted-foreground capitalize">{o.type}</span></div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(o.status)}`}>{formatStatus(o.status)}</span>
                        <span className="font-bold">{formatCurrency(o.total)}</span>
                        <button
                          onClick={() => { onClose(); navigate(`/orders?id=${o.id}`); }}
                          className="text-[#1A56DB] hover:underline text-xs font-semibold"
                          title="View order"
                        >→</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Car className="w-4 h-4 text-emerald-600" /> Recent Rides ({data?.rides?.length || 0})</h3>
              {data?.rides?.length === 0 ? <p className="text-xs text-muted-foreground italic">No rides yet.</p> : (
                <div className="space-y-2">
                  {data?.rides?.map((r: any) => (
                    <div key={r.id} className="flex justify-between items-center text-sm bg-muted/30 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                      <div><span className="font-mono font-bold text-xs">{r.id.slice(-6).toUpperCase()}</span><span className="ml-2 text-muted-foreground capitalize">{r.type}</span><span className="ml-2 text-muted-foreground">{r.distance}km</span></div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(r.status)}`}>{formatStatus(r.status)}</span>
                        <span className="font-bold">{formatCurrency(r.fare)}</span>
                        <button
                          onClick={() => { onClose(); navigate(`/rides?id=${r.id}`); }}
                          className="text-emerald-600 hover:underline text-xs font-semibold"
                          title="View ride"
                        >→</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {(data?.pharmacy?.length || 0) > 0 && (
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Pill className="w-4 h-4 text-pink-600" /> Pharmacy Orders ({data.pharmacy.length})</h3>
                <div className="space-y-2">
                  {data.pharmacy.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-sm bg-muted/30 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span className="font-mono text-xs">{p.id.slice(-6).toUpperCase()}</span>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(p.status)}`}>{formatStatus(p.status)}</span>
                        <span className="font-bold">{formatCurrency(p.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(data?.parcels?.length || 0) > 0 && (
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Package className="w-4 h-4 text-orange-600" /> Parcel Bookings ({data.parcels.length})</h3>
                <div className="space-y-2">
                  {data.parcels.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-sm bg-muted/30 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span className="font-mono text-xs">{p.id.slice(-6).toUpperCase()}</span>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(p.status)}`}>{formatStatus(p.status)}</span>
                        <span className="font-bold">{formatCurrency(p.fare)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-sky-600" /> Wallet History ({data?.transactions?.length || 0})</h3>
              {data?.transactions?.length === 0 ? <p className="text-xs text-muted-foreground italic">No wallet activity.</p> : (
                <div className="space-y-1.5">
                  {data?.transactions?.map((t: any) => (
                    <div key={t.id} className="flex justify-between items-center text-sm bg-muted/30 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground truncate max-w-[180px]">{t.description}</span>
                      <span className={`font-bold ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>{t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
    </MobileDrawer>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createUser = useCreateUser();

  const [name,         setName]         = useState("");
  const [phone,        setPhone]        = useState("");
  const [email,        setEmail]        = useState("");
  const [username,     setUsername]     = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role,         setRole]         = useState<NonNullable<CreateUserInput["role"]>>("customer");
  const [city,         setCity]         = useState("");
  const [area,         setArea]         = useState("");
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [createdUser, setCreatedUser]   = useState<{ tempPassword?: string; phone?: string; role?: string } | null>(null);
  const [showAdminConfirm, setShowAdminConfirm] = useState(false);
  const [pendingAdminSubmit, setPendingAdminSubmit] = useState(false);

  const reset = () => {
    setName(""); setPhone(""); setEmail("");
    setUsername(""); setTempPassword("");
    setRole("customer"); setCity(""); setArea("");
    setErrors({}); setCreatedUser(null);
    setShowAdminConfirm(false); setPendingAdminSubmit(false);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim() && !phone.trim()) {
      errs.general = "Name ya phone mein se koi ek zaroor dein";
    }
    if (phone.trim() && !/^(\+?92|0)?3\d{9}$/.test(phone.trim().replace(/[\s\-()+]/g, ""))) {
      errs.phone = "Valid Pakistani mobile number enter karein (e.g. 03001234567)";
    }
    if (email.trim() && !email.trim().includes("@")) {
      errs.email = "Valid email address darj karein";
    }
    if (username.trim() && username.trim().replace(/[^a-z0-9_]/gi, "").length < 3) {
      errs.username = "Username kam az kam 3 characters ka hona chahiye";
    }
    if (tempPassword.trim()) {
      const pw = tempPassword.trim();
      if (pw.length < 8) {
        errs.tempPassword = "Password kam az kam 8 characters ka hona chahiye";
      } else if (!/[A-Z]/.test(pw)) {
        errs.tempPassword = "Password mein kam az kam ek capital letter hona chahiye";
      } else if (!/[0-9]/.test(pw)) {
        errs.tempPassword = "Password mein kam az kam ek number hona chahiye";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const doSubmit = () => {
    if (!validate()) return;
    const payload: CreateUserInput = { role };
    if (name.trim())         payload.name         = name.trim();
    if (phone.trim())        payload.phone        = phone.trim();
    if (email.trim())        payload.email        = email.trim();
    if (username.trim())     payload.username     = username.trim();
    if (tempPassword.trim()) payload.tempPassword = tempPassword.trim();
    if (city.trim())         payload.city         = city.trim();
    if (area.trim())         payload.area         = area.trim();
    createUser.mutate(payload, {
      onSuccess: () => {
        setCreatedUser({
          tempPassword: tempPassword.trim() || undefined,
          phone: phone.trim() || undefined,
          role,
        });
      },
      onError: (e: Error) => {
        const msg = e.message?.toLowerCase() ?? "";
        if (msg.includes("409") || msg.includes("already exists") || msg.includes("duplicate") || msg.includes("already taken")) {
          setErrors({ general: e.message || "Yeh phone, email, ya username already registered hai" });
        } else {
          toast({ title: "Failed to create user", description: e.message, variant: "destructive" });
        }
      },
    });
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (role === "admin" && !pendingAdminSubmit) {
      setShowAdminConfirm(true);
      return;
    }
    doSubmit();
  };

  const handleClose = () => { reset(); onClose(); };

  if (createdUser) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" /> User Created Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
              {createdUser.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-mono font-bold">{createdUser.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <UserIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-muted-foreground">Role:</span>
                <span className="font-semibold capitalize">{createdUser.role}</span>
              </div>
            </div>
            {createdUser.tempPassword ? (
              <>
                <p className="text-sm text-muted-foreground">Share the temporary password below with the user — they will be prompted to change it on first login.</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Temporary Password</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-base font-bold text-amber-900 bg-amber-100 px-3 py-2 rounded-lg select-all">{createdUser.tempPassword}</code>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => { navigator.clipboard?.writeText(createdUser!.tempPassword!); toast({ title: "Copied!" }); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">User account has been created. They can log in using their phone number and OTP.</p>
            )}
            <Button className="w-full rounded-xl bg-[#1A56DB] hover:bg-[#1A56DB]/90 text-white" onClick={handleClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (showAdminConfirm) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) { setShowAdminConfirm(false); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <Shield className="w-5 h-5" /> Create Admin Account?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <p className="text-sm text-purple-800">You are about to create an <strong>Admin</strong> account. Admin users have elevated privileges and full access to the admin panel.</p>
              <p className="text-sm text-purple-700 mt-2 font-semibold">Are you sure you want to proceed?</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowAdminConfirm(false)}>Cancel</Button>
              <Button
                className="flex-1 rounded-xl bg-purple-700 hover:bg-purple-800 text-white gap-2"
                onClick={() => { setShowAdminConfirm(false); setPendingAdminSubmit(true); doSubmit(); }}
              >
                <Shield className="w-4 h-4" /> Yes, Create Admin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1A56DB]">
            <UserPlus className="w-5 h-5" /> Create User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {errors.general && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{errors.general}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name <span className="text-muted-foreground font-normal normal-case">(required if no phone)</span></label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ali Khan"
                className="pl-9 h-10 rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={phone}
                onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: "" })); }}
                placeholder="e.g. 03001234567 or +923001234567"
                className={`pl-9 h-10 rounded-xl ${errors.phone ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={email}
                onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: "" })); }}
                placeholder="e.g. ali@example.com"
                type="email"
                className={`pl-9 h-10 rounded-xl ${errors.email ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Username <span className="text-muted-foreground font-normal normal-case">(optional, for password login)</span></label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={username}
                onChange={e => { setUsername(e.target.value); setErrors(prev => ({ ...prev, username: "" })); }}
                placeholder="e.g. ali_khan"
                className={`pl-9 h-10 rounded-xl ${errors.username ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.username && <p className="text-xs text-red-600">{errors.username}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Temporary Password <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={tempPassword}
                onChange={e => { setTempPassword(e.target.value); setErrors(prev => ({ ...prev, tempPassword: "" })); }}
                placeholder="Set a temporary password for this user"
                type="text"
                className={`pl-9 h-10 rounded-xl font-mono ${errors.tempPassword ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.tempPassword
              ? <p className="text-xs text-red-600">{errors.tempPassword}</p>
              : <p className="text-[11px] text-muted-foreground">Min 8 chars, 1 uppercase letter, 1 number. User must change on first login.</p>
            }
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
            <Select value={role} onValueChange={v => setRole(v as NonNullable<CreateUserInput["role"]>)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="rider">Rider</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="admin">Admin (Elevated Access)</SelectItem>
              </SelectContent>
            </Select>
            {role === "admin" && (
              <p className="text-xs text-purple-700 font-semibold flex items-center gap-1 mt-1">
                <Shield className="w-3.5 h-3.5" /> Admin users have full panel access — you will be asked to confirm
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Lahore" className="pl-9 h-10 rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Area <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
              <Input value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Gulberg" className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={handleClose} disabled={createUser.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-[#1A56DB] hover:bg-[#1A56DB]/90 text-white gap-2"
              onClick={handleSubmit}
              disabled={createUser.isPending}
            >
              {createUser.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><UserPlus className="w-4 h-4" /> Create User</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ALL_SERVICES = [
  { key: "mart",     label: "Mart",      icon: "🛒" },
  { key: "food",     label: "Food",      icon: "🍔" },
  { key: "rides",    label: "Rides",     icon: "🚗" },
  { key: "pharmacy", label: "Pharmacy",  icon: "💊" },
  { key: "parcel",   label: "Parcel",    icon: "📦" },
];
const ALL_ROLES = [
  { key: "customer", label: "Customer", icon: "👤", desc: "Can place orders, book rides" },
  { key: "rider",    label: "Rider",    icon: "🚴", desc: "Can accept & deliver orders" },
  { key: "vendor",   label: "Vendor",   icon: "🏪", desc: "Can manage a store/menu" },
];

function SecurityModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const userRoles  = (user.roles || user.role || "customer").split(",").map((r: string) => r.trim()).filter(Boolean);
  const blockedSvc = (user.blockedServices || "").split(",").map((s: string) => s.trim()).filter(Boolean);

  const [roles,           setRoles]           = useState<string[]>(userRoles);
  const [isActive,        setIsActive]        = useState<boolean>(user.isActive);
  const [isBanned,        setIsBanned]        = useState<boolean>(user.isBanned || false);
  const [banReason,       setBanReason]       = useState<string>(user.banReason || "");
  const [blockedServices, setBlockedServices] = useState<string[]>(blockedSvc);
  const [securityNote,    setSecurityNote]    = useState<string>(user.securityNote || "");
  const [totpEnabled,     setTotpEnabled]     = useState<boolean>(user.totpEnabled || false);

  const [editUsername, setEditUsername] = useState<string>(user.username || "");
  const [editEmail,   setEditEmail]    = useState<string>(user.email || "");
  const [editName,    setEditName]     = useState<string>(user.name || "");
  const [showMpinResetConfirm, setShowMpinResetConfirm] = useState(false);

  /* ── OTP Tools state ── */
  const [bypassMinutes, setBypassMinutes] = useState<15 | 30 | 60>(15);
  const [bypassActive, setBypassActive] = useState<boolean>(
    !!(user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date())
  );
  const [bypassUntil, setBypassUntil] = useState<string | null>(
    user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date() ? user.otpBypassUntil : null
  );

  const securityMutation = useMutation({
    mutationFn: (body: any) => fetcher(`/users/${user.id}/security`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_data, vars: any) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      const changedParts: string[] = [];
      const origRoles = (user.roles || user.role || "customer").split(",").map((r: string) => r.trim()).filter(Boolean);
      const newRoles  = (vars.roles || "customer").split(",").map((r: string) => r.trim()).filter(Boolean);
      if (newRoles.sort().join(",") !== origRoles.sort().join(",")) {
        const roleLabels = newRoles.map((r: string) => r.charAt(0).toUpperCase() + r.slice(1)).join(" + ");
        changedParts.push(`Roles: ${roleLabels}`);
      }
      if (vars.isActive !== user.isActive || vars.isBanned !== (user.isBanned || false)) {
        const statusLabel = vars.isBanned ? "Banned" : vars.isActive ? "Active" : "Blocked";
        changedParts.push(`Status: ${statusLabel}`);
      }
      if (vars.securityNote !== (user.securityNote || "")) changedParts.push("Security note updated");
      if (vars.blockedServices !== (user.blockedServices || "")) changedParts.push("Service restrictions updated");
      toast({
        title: "Security settings saved",
        description: changedParts.length ? changedParts.join(" · ") : undefined,
      });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const resetOtpMutation = useMutation({
    mutationFn: () => fetcher(`/users/${user.id}/reset-otp`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "OTP cleared", description: "User must re-authenticate on next login." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const setBypassMutation = useMutation({
    mutationFn: (minutes: number) => fetcher(`/users/${user.id}/otp/bypass`, { method: "POST", body: JSON.stringify({ minutes }) }),
    onSuccess: (d: any) => {
      setBypassActive(true);
      setBypassUntil(d.bypassUntil);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "OTP bypass enabled", description: `User can log in without OTP until ${new Date(d.bypassUntil).toLocaleTimeString()}` });
    },
    onError: (e: any) => toast({ title: "Failed to set bypass", description: e.message, variant: "destructive" }),
  });

  const cancelBypassMutation = useMutation({
    mutationFn: () => fetcher(`/users/${user.id}/otp/bypass`, { method: "DELETE", body: "{}" }),
    onSuccess: () => {
      setBypassActive(false);
      setBypassUntil(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "OTP bypass cancelled" });
    },
    onError: (e: any) => toast({ title: "Failed to cancel bypass", description: e.message, variant: "destructive" }),
  });

  const disable2faMutation = useMutation({
    mutationFn: () => fetcher(`/users/${user.id}/2fa/disable`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      setTotpEnabled(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "2FA disabled", description: "Two-factor authentication has been turned off for this user." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resetWalletPinMutation = useMutation({
    mutationFn: () => fetcher(`/users/${user.id}/reset-wallet-pin`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "MPIN reset", description: "User's wallet MPIN has been cleared. They will need to create a new one." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  /* ── Sessions ── */
  const [showSessions, setShowSessions] = useState(false);
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useAdminUserSessions(showSessions ? user.id : null);
  const revokeSession = useRevokeUserSession();
  const revokeAll = useRevokeAllUserSessions();

  const identityMutation = useMutation({
    mutationFn: (body: any) => fetcher(`/users/${user.id}/identity`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Identity updated", description: "User identity fields saved successfully." });
    },
    onError: (e: any) => toast({ title: "Identity update failed", description: e.message, variant: "destructive" }),
  });

  const handleIdentitySave = () => {
    const body: Record<string, string> = {};
    if (editName.trim() !== (user.name || "")) body.name = editName.trim();
    if (editUsername.trim().toLowerCase() !== (user.username || "")) body.username = editUsername.trim();
    if (editEmail.trim().toLowerCase() !== (user.email || "")) body.email = editEmail.trim();
    if (Object.keys(body).length === 0) { toast({ title: "No changes", description: "No identity fields were modified." }); return; }
    identityMutation.mutate(body);
  };

  const toggleRole = (r: string) => {
    setRoles(prev => {
      if (prev.includes(r)) {
        if (prev.length <= 1) {
          toast({ title: "At least one role required", description: "A user must have at least one role assigned.", variant: "destructive" });
          return prev;
        }
        return prev.filter(x => x !== r);
      }
      return [...prev, r];
    });
  };
  const toggleService = (s: string) => {
    setBlockedServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleSave = () => {
    const newRoles = roles.length > 0 ? roles : ["customer"];
    securityMutation.mutate({
      isActive,
      isBanned,
      banReason: isBanned ? banReason : null,
      roles: newRoles.join(","),
      blockedServices: blockedServices.join(","),
      securityNote,
      notify: isBanned && !user.isBanned,
    });
  };

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={<><Shield className="w-5 h-5 text-indigo-600" /> Security — {user.name || user.phone}</>}
      dialogClassName="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl"
    >
        <div className="space-y-5 mt-2">
          <div className="bg-gradient-to-r from-[#1A56DB]/5 to-blue-50 rounded-xl px-4 py-3 flex items-center gap-3 border border-blue-100">
            <div className="w-10 h-10 rounded-full bg-[#1A56DB]/10 flex items-center justify-center text-[#1A56DB] font-bold">
              {(user.name || user.phone || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm">{user.name || user.phone}</p>
              <p className="text-xs text-muted-foreground">{user.phone} · Wallet: <strong>{formatCurrency(user.walletBalance)}</strong></p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><AtSign className="w-4 h-4 text-[#1A56DB]"/> Identity Fields</h3>
            <div className="space-y-2">
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Full name" value={editName} onChange={e => setEditName(e.target.value)} className="h-10 pl-9 rounded-xl" />
              </div>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Username (min 3 chars, lowercase)" value={editUsername} onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} className="h-10 pl-9 rounded-xl font-mono" />
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Email address" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-10 pl-9 rounded-xl" />
              </div>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={user.phone || ""} disabled className="h-10 pl-9 rounded-xl bg-muted/50 text-muted-foreground cursor-not-allowed" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Primary (read-only)</span>
              </div>
            </div>
            <Button size="sm" onClick={handleIdentitySave} disabled={identityMutation.isPending} className="w-full h-9 rounded-xl bg-[#1A56DB] hover:bg-[#1A56DB]/90 text-white gap-2">
              {identityMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              Save Identity
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><UserCog className="w-4 h-4 text-[#1A56DB]"/> Account Status</h3>
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() => { setIsActive(true); setIsBanned(false); }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${isActive && !isBanned ? "bg-emerald-50 border-emerald-400 shadow-sm" : "bg-muted/30 border-border hover:border-emerald-300"}`}
              >
                <CheckCircle2 className={`w-5 h-5 mb-1 ${isActive && !isBanned ? "text-emerald-600" : "text-muted-foreground"}`}/>
                <p className="text-sm font-bold">Active</p>
                <p className="text-xs text-muted-foreground">Full access</p>
              </div>
              <div
                onClick={() => { setIsActive(false); setIsBanned(false); }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${!isActive && !isBanned ? "bg-amber-50 border-amber-400 shadow-sm" : "bg-muted/30 border-border hover:border-amber-300"}`}
              >
                <XCircle className={`w-5 h-5 mb-1 ${!isActive && !isBanned ? "text-amber-600" : "text-muted-foreground"}`}/>
                <p className="text-sm font-bold">Blocked</p>
                <p className="text-xs text-muted-foreground">Temp suspend</p>
              </div>
              <div
                onClick={() => { setIsBanned(true); setIsActive(false); }}
                className={`p-3 rounded-xl border cursor-pointer transition-all col-span-2 ${isBanned ? "bg-red-50 border-red-400 shadow-sm" : "bg-muted/30 border-border hover:border-red-300"}`}
              >
                <div className="flex items-center gap-2">
                  <Ban className={`w-5 h-5 ${isBanned ? "text-red-600" : "text-muted-foreground"}`}/>
                  <div>
                    <p className="text-sm font-bold">Permanently Banned</p>
                    <p className="text-xs text-muted-foreground">Cannot log in at all — requires ban reason</p>
                  </div>
                </div>
              </div>
            </div>
            {isBanned && (
              <Input
                placeholder="Ban reason (required — shown to user)"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                className="h-11 rounded-xl border-red-200 focus:ring-red-300"
              />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">Roles <span className="text-xs font-normal text-muted-foreground ml-1">Multiple roles allowed</span></h3>
            <div className="space-y-2">
              {ALL_ROLES.map(r => (
                <div
                  key={r.key}
                  onClick={() => toggleRole(r.key)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${roles.includes(r.key) ? "bg-[#1A56DB]/5 border-[#1A56DB]/30 shadow-sm" : "bg-muted/30 border-border hover:border-[#1A56DB]/20"}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${roles.includes(r.key) ? "bg-[#1A56DB] border-[#1A56DB]" : "border-gray-300"}`}>
                    {roles.includes(r.key) && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{r.icon} {r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600"/> Freeze Wallet
            </h3>
            <div
              onClick={() => toggleService("wallet")}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${blockedServices.includes("wallet") ? "bg-amber-50 border-amber-400 shadow-sm" : "bg-muted/30 border-border hover:border-amber-300"}`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${blockedServices.includes("wallet") ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                {blockedServices.includes("wallet") && <span className="text-white text-xs font-bold">✕</span>}
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold">🔒 Freeze Wallet</span>
                <p className="text-xs text-muted-foreground">Blocks all wallet operations (send, receive, topup, pay)</p>
              </div>
              {blockedServices.includes("wallet") && <Badge variant="outline" className="ml-auto text-[10px] bg-amber-50 text-amber-600 border-amber-200">FROZEN</Badge>}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Service Restrictions
              <span className="text-xs font-normal text-muted-foreground">Checked = blocked for this user</span>
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {ALL_SERVICES.map(s => {
                const isBlocked = blockedServices.includes(s.key);
                return (
                  <div
                    key={s.key}
                    onClick={() => toggleService(s.key)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isBlocked ? "bg-red-50 border-red-300 shadow-sm" : "bg-muted/30 border-border hover:border-red-200"}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isBlocked ? "bg-red-500 border-red-500" : "border-gray-300"}`}>
                      {isBlocked && <span className="text-white text-xs font-bold">✕</span>}
                    </div>
                    <span className="text-sm font-semibold">{s.icon} {s.label}</span>
                    {isBlocked && <Badge variant="outline" className="ml-auto text-[10px] bg-red-50 text-red-600 border-red-200">BLOCKED</Badge>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">Admin Security Note <span className="text-xs font-normal text-muted-foreground">(internal)</span></h3>
            <textarea
              rows={3}
              placeholder="e.g. Suspected fraud — monitor activity. Or: VIP user — do not block."
              value={securityNote}
              onChange={e => setSecurityNote(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
            />
          </div>

          {/* ── OTP Tools ── */}
          <div className="border border-violet-200 rounded-xl overflow-hidden">
            <div className="bg-violet-50 px-4 py-2.5 flex items-center gap-2 border-b border-violet-200">
              <KeyRound className="w-4 h-4 text-violet-600 flex-shrink-0" />
              <span className="text-sm font-bold text-violet-800">OTP Tools</span>
              <span className="text-xs text-violet-500 ml-1">Admin support — no notifications sent to user</span>
            </div>
            <div className="p-3 space-y-3">
              {/* Bypass OTP */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Bypass OTP</p>
                    <p className="text-xs text-muted-foreground">Allow login without OTP for a limited window</p>
                  </div>
                  <Select
                    value={String(bypassMinutes)}
                    onValueChange={(v) => setBypassMinutes(Number(v) as 15 | 30 | 60)}
                  >
                    <SelectTrigger className="w-24 h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                  {!bypassActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-400 text-amber-700 hover:bg-amber-50 rounded-lg text-xs shrink-0"
                      onClick={() => setBypassMutation.mutate(bypassMinutes)}
                      disabled={setBypassMutation.isPending}
                    >
                      {setBypassMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Enabling...</> : "Enable"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-xs shrink-0"
                      onClick={() => cancelBypassMutation.mutate()}
                      disabled={cancelBypassMutation.isPending}
                    >
                      {cancelBypassMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Cancelling...</> : "Cancel"}
                    </Button>
                  )}
                </div>
                {bypassActive && bypassUntil && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-800">
                      Bypass active — expires {new Date(bypassUntil).toLocaleTimeString()}
                    </p>
                    <Badge variant="outline" className="ml-auto text-[10px] bg-amber-100 text-amber-700 border-amber-300">ACTIVE</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-600 flex-shrink-0"/>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Force Re-Authentication</p>
              <p className="text-xs text-amber-700">Clears saved OTP — user must verify phone again</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-100 rounded-lg text-xs"
              onClick={() => resetOtpMutation.mutate()}
              disabled={resetOtpMutation.isPending}
            >
              {resetOtpMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Clearing...</> : "Reset OTP"}
            </Button>
          </div>

          {totpEnabled && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
              <Shield className="w-5 h-5 text-purple-600 flex-shrink-0"/>
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-800">Two-Factor Authentication</p>
                <p className="text-xs text-purple-700">User has 2FA enabled — disable only if they lost access</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-100 rounded-lg text-xs"
                onClick={() => disable2faMutation.mutate()}
                disabled={disable2faMutation.isPending}
              >
                {disable2faMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Disabling...</> : "Disable 2FA"}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600"/> MPIN Status
            </h3>
            {(() => {
              const hasMpin = !!user.walletPinHash;
              const isLocked = !!user.isMpinLocked;

              const statusLabel = !hasMpin ? "Not Set" : isLocked ? "Locked" : "Active";
              const statusColor = !hasMpin ? "bg-gray-50 border-gray-200" : isLocked ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200";
              const statusTextColor = !hasMpin ? "text-gray-600" : isLocked ? "text-red-700" : "text-emerald-700";
              const badgeClass = !hasMpin ? "bg-gray-100 text-gray-600 border-gray-300" : isLocked ? "bg-red-100 text-red-700 border-red-300" : "bg-emerald-100 text-emerald-700 border-emerald-300";

              return (
                <div className={`rounded-xl p-3 border ${statusColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className={`w-5 h-5 flex-shrink-0 ${statusTextColor}`}/>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${statusTextColor}`}>Wallet MPIN</p>
                          <Badge variant="outline" className={`text-[10px] font-bold ${badgeClass}`}>{statusLabel}</Badge>
                        </div>
                        {!hasMpin && <p className="text-xs text-gray-500 mt-0.5">User has not configured a wallet MPIN yet</p>}
                        {hasMpin && !isLocked && <p className="text-xs text-emerald-600 mt-0.5">MPIN is active — reset only if user cannot recover it</p>}
                        {isLocked && (
                          <p className="text-xs text-red-600 mt-0.5">
                            MPIN is currently locked due to too many failed attempts
                          </p>
                        )}
                      </div>
                    </div>
                    {hasMpin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`rounded-lg text-xs ${isLocked ? "border-red-300 text-red-700 hover:bg-red-100" : "border-emerald-300 text-emerald-700 hover:bg-emerald-100"}`}
                        onClick={() => setShowMpinResetConfirm(true)}
                        disabled={resetWalletPinMutation.isPending}
                      >
                        {resetWalletPinMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Resetting...</> : isLocked ? "Unlock/Reset MPIN" : "Reset MPIN"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {showMpinResetConfirm && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-bold text-amber-800">Confirm MPIN Reset</p>
                  <p className="text-xs text-amber-700 mt-1">This will clear the user's wallet MPIN. They will need to create a new one before making any wallet transactions that require MPIN verification.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => setShowMpinResetConfirm(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="rounded-lg text-xs bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    resetWalletPinMutation.mutate();
                    setShowMpinResetConfirm(false);
                  }}
                  disabled={resetWalletPinMutation.isPending}
                >
                  {resetWalletPinMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Resetting...</> : "Yes, Reset MPIN"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Active Sessions ── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSessions(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2"><Monitor className="w-4 h-4 text-slate-500" /> Active Sessions</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSessions ? "rotate-180" : ""}`} />
            </button>
            {showSessions && (
              <div className="p-3 space-y-2">
                {sessionsLoading && <p className="text-xs text-muted-foreground text-center py-2">Loading sessions…</p>}
                {!sessionsLoading && (!sessionsData?.sessions || sessionsData.sessions.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-2">No active sessions</p>
                )}
                {!sessionsLoading && sessionsData?.sessions?.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{s.deviceInfo ?? s.userAgent ?? "Unknown device"}</p>
                      <p className="text-[10px] text-muted-foreground">{s.ipAddress} · {new Date(s.createdAt).toLocaleString()}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs px-2 h-7 shrink-0"
                      disabled={revokeSession.isPending}
                      onClick={() => revokeSession.mutate({ userId: user.id, sessionId: s.id }, {
                        onSuccess: () => { toast({ title: "Session revoked" }); refetchSessions(); },
                        onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
                      })}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
                {sessionsData?.sessions?.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg"
                    disabled={revokeAll.isPending}
                    onClick={() => revokeAll.mutate(user.id, {
                      onSuccess: () => { toast({ title: "All sessions revoked", description: "User will be logged out on all devices." }); refetchSessions(); },
                      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
                    })}
                  >
                    {revokeAll.isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1"/>Revoking…</> : "Revoke All Sessions"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {isBanned && !user.isBanned && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5"/>
              <p className="text-xs text-red-700">User will be permanently banned and notified via push notification.</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={securityMutation.isPending || (isBanned && !banReason)}
              className="flex-1 rounded-xl gap-2 bg-[#1A56DB] hover:bg-[#1A56DB]/90"
            >
              {securityMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>}
              {securityMutation.isPending ? "Saving..." : "Save Security"}
            </Button>
          </div>
        </div>
    </MobileDrawer>
  );
}

/* ── CSV Export helper ── */
function exportUsersCSV(users: any[]) {
  const header = "ID,Name,Phone,Email,Role,Status,Wallet,Joined";
  const rows = users.map((u: any) =>
    [u.id, u.name || "", u.phone || "", u.email || "", u.role || "customer",
     u.isBanned ? "banned" : u.isActive ? "active" : "blocked",
     u.walletBalance, u.createdAt?.slice(0,10) || ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `users-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ── KYC Doc Viewer ── */
function parseUserDocuments(user: any): { files: { type: string; url: string; label: string }[]; note?: string } {
  const result: { files: { type: string; url: string; label: string }[]; note?: string } = { files: [] };
  const seenUrls = new Set<string>();
  if (user.vehiclePhoto) {
    result.files.push({ type: "vehicle_photo", url: user.vehiclePhoto, label: "Vehicle Photo" });
    seenUrls.add(user.vehiclePhoto);
  }
  if (user.documents) {
    try {
      const parsed = JSON.parse(user.documents);
      if (parsed.files && Array.isArray(parsed.files)) {
        for (const f of parsed.files) {
          if (f.url && !seenUrls.has(f.url)) {
            const label = DOC_TYPE_LABELS[f.type] || f.label || f.type;
            result.files.push({ type: f.type, url: f.url, label });
            seenUrls.add(f.url);
          }
        }
        if (parsed.note) result.note = parsed.note;
      } else if (Array.isArray(parsed)) {
        for (const f of parsed) {
          if (f.url && !seenUrls.has(f.url)) {
            const label = DOC_TYPE_LABELS[f.type] || f.label || f.type;
            result.files.push({ type: f.type, url: f.url, label });
            seenUrls.add(f.url);
          }
        }
      }
    } catch (err) {
      console.error("[Users] Failed to parse user documents JSON:", err);
    }
  }
  return result;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cnic_front: "CNIC Front",
  cnic_back: "CNIC Back",
  cnic: "CNIC Front",
  driving_license: "Driving License",
  vehicle_photo: "Vehicle Photo",
};

function KycDocModal({ user, onClose, canRequestCorrection }: { user: any; onClose: () => void; canRequestCorrection: boolean }) {
  const { has } = usePermissions();
  const canApproveKyc = has("finance.kyc.approve");
  const correctionMutation = useRequestUserCorrection();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [corrField, setCorrField] = useState("");
  const [corrNote, setCorrNote]   = useState("");
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const kycApproveMutation = useMutation({
    mutationFn: () => fetcher(`/users/${user.id}/kyc-approve`, { method: "PATCH", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "KYC Approved", description: "User's KYC status has been set to verified." });
      onClose();
    },
    onError: (e: any) => toast({ title: "KYC approval failed", description: e.message, variant: "destructive" }),
  });

  const parsed = parseUserDocuments(user);
  const docs = parsed.files;
  const riderNote = parsed.note;
  const hasDocuments = docs.length > 0;

  const allChecked = ["cnic_legible", "photo_match", "details_correct", "not_expired"].every(k => checklist[k]);

  const handleRequestCorrection = () => {
    if (!user.id) return;
    if (!corrField && !corrNote.trim()) {
      toast({ title: "Correction details required", description: "Select a document field or add a note before requesting correction.", variant: "destructive" });
      return;
    }
    correctionMutation.mutate({ id: user.id, field: corrField || "document", note: corrNote.trim() || undefined }, {
      onSuccess: () => {
        toast({ title: "Correction requested", description: "User will be notified to re-upload." });
        setShowCorrForm(false);
        onClose();
      },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const toggleCheck = (key: string) => setChecklist(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={<><FileText className="w-5 h-5 text-indigo-600" /> KYC Documents — {user.name || user.phone}</>}
      dialogClassName="w-[95vw] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
        <div className="flex flex-wrap gap-3 mt-1">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs">
            <span className="font-semibold text-muted-foreground">CNIC:</span>
            <span className="font-mono">{user.cnic || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs">
            <span className="font-semibold text-muted-foreground">Vehicle:</span>
            <span>{user.vehicleType || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs">
            <span className="font-semibold text-muted-foreground">Plate:</span>
            <span className="font-mono">{user.vehiclePlate || user.vehicleRegNo || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs">
            <span className="font-semibold text-muted-foreground">License #:</span>
            <span className="font-mono">{user.drivingLicense || "N/A"}</span>
          </div>
        </div>

        {riderNote && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Rider's Note
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">{riderNote}</p>
          </div>
        )}

        {docs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No documents uploaded yet.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-3 mb-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Uploaded Documents ({docs.length})
              </p>
              {docs.length < 4 && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {4 - docs.length} missing
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {docs.map((doc, i) => (
                <div key={`${doc.type}-${i}`} className="space-y-1 group">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {DOC_TYPE_LABELS[doc.type] || doc.label}
                  </p>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block relative rounded-xl overflow-hidden border border-border/50">
                    <img src={doc.url} alt={doc.label} className="w-full h-32 object-cover group-hover:opacity-80 transition-opacity" />
                    <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                      Click to zoom
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Verification Checklist</p>
          {[
            { key: "cnic_legible", label: "CNIC is legible and valid" },
            { key: "photo_match", label: "Photo matches ID / person" },
            { key: "details_correct", label: "Name, DOB, and details are correct" },
            { key: "not_expired", label: "Documents are not expired" },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!checklist[item.key]} onChange={() => toggleCheck(item.key)} className="w-4 h-4 rounded accent-green-600" />
              <span className={checklist[item.key] ? "text-green-700 font-medium" : ""}>{item.label}</span>
            </label>
          ))}
          {allChecked && (
            <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All checks passed — ready to approve
            </p>
          )}
        </div>

        {user.kycStatus === "verified" ? (
          <div className="mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">KYC Already Verified</p>
              <p className="text-xs text-emerald-600">This user's KYC has already been approved.</p>
            </div>
          </div>
        ) : (
          <>
            {!hasDocuments && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                No KYC documents are uploaded for this user. Please request correction or verify uploads before approving.
              </div>
            )}
            <Button
              className="mt-4 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => kycApproveMutation.mutate()}
              disabled={!hasDocuments || !allChecked || kycApproveMutation.isPending || !canApproveKyc}
              title={!canApproveKyc ? "You do not have permission to approve KYC" : !hasDocuments ? "Missing documents" : undefined}
            >
              {kycApproveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> {hasDocuments ? (allChecked ? "Approve KYC" : "Complete checklist to approve") : "Missing documents"}</>
              )}
            </Button>
          </>
        )}

        {!showCorrForm ? (
          <button
            onClick={() => setShowCorrForm(true)}
            disabled={!canRequestCorrection}
            title={!canRequestCorrection ? "Permission required" : undefined}
            className={`mt-4 text-xs flex items-center gap-1 font-semibold ${canRequestCorrection ? "text-amber-600 hover:underline" : "text-muted-foreground cursor-not-allowed"}`}
          >
            <AlertCircle className="w-3.5 h-3.5" /> Request document correction
          </button>
        ) : (
          <div className="mt-4 space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-800">Request Correction</p>
            <select value={corrField} onChange={e => setCorrField(e.target.value)} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm">
              <option value="">Select document</option>
              <option value="cnic_front">CNIC Front</option>
              <option value="cnic_back">CNIC Back</option>
              <option value="driving_license">Driving License</option>
              <option value="vehicle_photo">Vehicle Photo</option>
              <option value="all">All Documents</option>
            </select>
            <Input placeholder="Note to user (e.g., photo is blurry, CNIC not readable)..." value={corrNote} onChange={e => setCorrNote(e.target.value)} className="h-9 rounded-lg text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setShowCorrForm(false)} className="flex-1 h-9 border border-border/50 rounded-lg text-xs font-semibold">Cancel</button>
              <button onClick={handleRequestCorrection} disabled={!canRequestCorrection || correctionMutation.isPending}
                title={!canRequestCorrection ? "Permission required" : undefined}
                className="flex-1 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold disabled:opacity-60">
                {correctionMutation.isPending ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        )}
    </MobileDrawer>
  );
}

function AddressBookModal({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-addresses", user.id],
    queryFn: () => fetcher(`/users/${user.id}/addresses`),
  });
  const addresses = data?.addresses || [];

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editLabel, setEditLabel]   = useState("");
  const [editAddr,  setEditAddr]    = useState("");
  const [editCity,  setEditCity]    = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel]     = useState("");
  const [newAddr,  setNewAddr]      = useState("");
  const [newCity,  setNewCity]      = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-user-addresses", user.id] });

  const updateMut = useMutation({
    mutationFn: ({ addressId, label, address, city }: { addressId: string; label: string; address: string; city: string }) =>
      fetcher(`/users/${user.id}/addresses/${addressId}`, { method: "PATCH", body: JSON.stringify({ label, address, city }) }),
    onSuccess: () => { invalidate(); setEditingId(null); toast({ title: "Address updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (addressId: string) =>
      fetcher(`/users/${user.id}/addresses/${addressId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setDeleteConfirmId(null); toast({ title: "Address deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: ({ label, address, city }: { label: string; address: string; city: string }) =>
      fetcher(`/users/${user.id}/addresses`, { method: "POST", body: JSON.stringify({ label, address, city }) }),
    onSuccess: () => {
      invalidate();
      setShowAddForm(false);
      setNewLabel(""); setNewAddr(""); setNewCity("");
      toast({ title: "Address added" });
    },
    onError: (e: any) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
  });

  const startEdit = (addr: any) => {
    setEditingId(addr.id);
    setEditLabel(addr.label || "");
    setEditAddr(addr.address || "");
    setEditCity(addr.city || "");
  };

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={<><MapPin className="w-5 h-5 text-teal-600" /> Addresses — {user.name || user.phone}</>}
      dialogClassName="w-[95vw] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : addresses.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No saved addresses</p>
        </div>
      ) : (
        <div className="space-y-3 mt-2">
          {addresses.map((addr: any) => (
            <div key={addr.id} className={`rounded-xl border p-3 ${addr.isDefault ? "border-teal-300 bg-teal-50" : "border-border bg-muted/20"}`}>
              {editingId === addr.id ? (
                <div className="space-y-2">
                  <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label (e.g. Home)" className="h-9 rounded-lg text-sm" />
                  <Input value={editAddr} onChange={e => setEditAddr(e.target.value)} placeholder="Full address" className="h-9 rounded-lg text-sm" />
                  <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City (optional)" className="h-9 rounded-lg text-sm" />
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="flex-1 rounded-lg text-xs bg-teal-600 hover:bg-teal-700 text-white"
                      disabled={updateMut.isPending}
                      onClick={() => updateMut.mutate({ addressId: addr.id, label: editLabel, address: editAddr, city: editCity })}
                    >
                      {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              ) : deleteConfirmId === addr.id ? (
                <div className="space-y-2">
                  <p className="text-sm text-red-700 font-semibold">Delete "{addr.label}"?</p>
                  <p className="text-xs text-muted-foreground">This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg text-xs" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                    <Button size="sm" className="flex-1 rounded-lg text-xs bg-red-600 hover:bg-red-700 text-white" disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate(addr.id)}
                    >
                      {deleteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{addr.label}</span>
                      {addr.isDefault && (
                        <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-200 bg-teal-50">DEFAULT</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50" onClick={() => startEdit(addr)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:bg-red-50" onClick={() => setDeleteConfirmId(addr.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{addr.address}</p>
                  {addr.city && <p className="text-xs text-muted-foreground mt-0.5">{addr.city}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="mt-3 space-y-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
          <p className="text-xs font-bold text-teal-800">Add New Address</p>
          <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (e.g. Home, Work)" className="h-9 rounded-lg text-sm" />
          <Input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="Full address" className="h-9 rounded-lg text-sm" />
          <Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="City (optional)" className="h-9 rounded-lg text-sm" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 rounded-lg text-xs" onClick={() => { setShowAddForm(false); setNewLabel(""); setNewAddr(""); setNewCity(""); }}>Cancel</Button>
            <Button
              size="sm"
              className="flex-1 rounded-lg text-xs bg-teal-600 hover:bg-teal-700 text-white"
              disabled={createMut.isPending || !newLabel.trim() || !newAddr.trim()}
              onClick={() => createMut.mutate({ label: newLabel, address: newAddr, city: newCity })}
            >
              {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Address"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full rounded-xl border-teal-300 text-teal-700 hover:bg-teal-50 gap-2"
          onClick={() => setShowAddForm(true)}
        >
          <MapPin className="w-4 h-4" /> Add Address
        </Button>
      )}
    </MobileDrawer>
  );
}

/* ══════════ Main Users Page ══════════ */

export default function Users() {
  const [, navigate] = useLocation();
  const { logout } = useAdminAuth();
  const { language } = useLanguage();
  const { has } = usePermissions();
  const canViewUsers = has("users.view");
  const canEditUsers = has("users.edit");
  const canApproveUsers = has("users.approve");
  const canBanUsers = has("users.ban");
  const canDeleteUsers = has("users.delete");
  const canApproveKyc = has("finance.kyc.approve");
  const canTopupWallet = has("finance.wallet.topup");
  const canAdjustWallet = has("finance.wallet.adjust");
  const canRequestCorrection = canApproveKyc;
  const T = (key: TranslationKey) => tDual(key, language);
  const [conditionTier, setConditionTier] = useState("all");
  const [page, setPage] = useState(1);
  const LIMIT = 25;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [walletUser, setWalletUser] = useState<any>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, refetch, isFetching, isError } = useUsers({
    conditionTier: conditionTier !== "all" ? conditionTier : undefined,
    search: debouncedSearch || undefined,
    role: roleFilter !== "all" ? roleFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    createdFrom: dateFrom || undefined,
    createdTo: dateTo || undefined,
    page,
    limit: LIMIT,
  }, canViewUsers);
  const { data: pendingData, refetch: refetchPending } = usePendingUsers(canApproveUsers);
  const updateMutation   = useUpdateUser();
  const deleteMutation   = useDeleteUser();
  const approveMutation  = useApproveUser();
  const rejectMutation   = useRejectUser();
  const bulkBanMutation  = useBulkBanUsers();
  const bulkDeleteMutation = useBulkDeleteUsers();
  const bulkRestoreMutation = useBulkRestoreUsers();
  const { toast } = useToast();
  const qc = useQueryClient();
  const waiveDebtMutation = useMutation({
    mutationFn: (userId: string) => fetcher(`/admin/users/${userId}/waive-debt`, { method: "PATCH" }),
    onSuccess: (data: any, userId: string) => {
      toast({ title: "Debt Waived", description: `${formatCurrency(Number(data.waived?.toFixed(0) || 0))} cancellation debt cleared.` });
      qc.setQueryData(["admin-users"], (old: any) => {
        if (!old?.users) return old;
        return {
          ...old,
          users: old.users.map((u: any) =>
            u.id === userId ? { ...u, cancellationDebt: 0 } : u
          ),
        };
      });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    setPage(1);
  }, [conditionTier, debouncedSearch, roleFilter, statusFilter, dateFrom, dateTo]);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [activityUser, setActivityUser] = useState<any>(null);
  const [securityUser, setSecurityUser] = useState<any>(null);
  const [rejectUser, setRejectUser]     = useState<any>(null);
  const [rejectNote, setRejectNote]     = useState("");
  const [kycUser, setKycUser]           = useState<any>(null);
  const [addressUser, setAddressUser]   = useState<any>(null);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [waiveConfirmUser, setWaiveConfirmUser] = useState<any>(null);

  const pendingUsers = pendingData?.users || [];

  if (!canViewUsers) {
    return (
      <Card className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-2xl font-semibold text-red-700">Access denied</p>
          <p className="mt-3 text-sm text-red-600">You do not have permission to view users. Contact your administrator if this looks wrong.</p>
        </div>
      </Card>
    );
  }

  const handleApprove = (userId: string) => {
    if (!canApproveUsers) { toast({ title: "Permission denied", description: "You do not have permission to approve users.", variant: "destructive" }); return; }
    approveMutation.mutate({ id: userId }, {
      onSuccess: () => { toast({ title: "User approved!", description: "User can now log in." }); },
      onError: err => toast({ title: "Failed to approve", description: err.message, variant: "destructive" }),
    });
  };

  const handleReject = () => {
    if (!rejectUser) return;
    if (!canApproveUsers) {
      toast({ title: "Permission denied", description: "You do not have permission to reject users.", variant: "destructive" });
      return;
    }
    rejectMutation.mutate({ id: rejectUser.id, note: rejectNote || "Rejected by admin" }, {
      onSuccess: () => {
        toast({ title: "User rejected", description: "Account rejected and user notified." });
        setRejectUser(null); setRejectNote("");
      },
      onError: err => toast({ title: "Failed to reject", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (id: string, updates: any) => {
    if (!canEditUsers) {
      toast({ title: "Permission denied", description: "You do not have permission to update users.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id, ...updates }, {
      onSuccess: () => toast({ title: "User updated" }),
      onError: err => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!deleteUser) return;
    if (!canDeleteUsers) {
      toast({ title: "Permission denied", description: "You do not have permission to delete users.", variant: "destructive" });
      return;
    }
    deleteMutation.mutate(deleteUser.id, {
      onSuccess: () => { toast({ title: "User deleted" }); setDeleteUser(null); },
      onError: err => toast({ title: "Delete failed", description: err.message, variant: "destructive" })
    });
  };

  const users = data?.users || [];
  const filtered = users;
  const totalUsers = data?.total ?? users.length;
  const bannedCount  = data?.bannedCount ?? users.filter((u: any) => u.isBanned).length;
  const blockedCount = data?.blockedCount ?? users.filter((u: any) => !u.isActive && !u.isBanned).length;
  const activeCount  = data?.activeCount ?? users.filter((u: any) => u.isActive && !u.isBanned).length;

  const allSelected = filtered.length > 0 && filtered.every((u: any) => selectedIds.has(u.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u: any) => u.id)));
    }
  };

  const handleBulkBan = (action: "ban" | "unban") => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    bulkBanMutation.mutate({ ids, action }, {
      onSuccess: (d: any) => {
        toast({ title: `${action === "ban" ? "Banned" : "Unbanned"} ${d.affected} user(s)` });
        setSelectedIds(new Set());
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} user(s)? This action cannot be undone.`)) return;
    bulkDeleteMutation.mutate({ ids }, {
      onSuccess: (d: any) => {
        toast({ title: `Deleted ${d.count} user(s)` });
        setSelectedIds(new Set());
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleBulkRestore = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    bulkRestoreMutation.mutate({ ids }, {
      onSuccess: (d: any) => {
        toast({ title: `Restored ${d.count} user(s)` });
        setSelectedIds(new Set());
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleBanUser = (user: any) => {
    const action = user.isBanned ? "unban" : "ban";
    if (!confirm(`${action === "ban" ? "Ban" : "Unban"} user ${user.name || user.phone}?`)) return;
    bulkBanMutation.mutate({ ids: [user.id], action }, {
      onSuccess: () => {
        toast({ title: `User ${action}ned` });
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleDeleteUser = (user: any) => {
    if (!confirm(`Delete user ${user.name || user.phone}? This action cannot be undone.`)) return;
    deleteMutation.mutate(user.id, {
      onSuccess: () => {
        toast({ title: "User deleted" });
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-users"] }),
      qc.invalidateQueries({ queryKey: ["admin-users-pending"] }),
    ]);
  }, [qc]);

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle={`${totalUsers} total${activeCount > 0 ? ` · ${activeCount} active` : ""}${bannedCount > 0 ? ` · ${bannedCount} banned` : ""}${blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}`}
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportUsersCSV(filtered)} className="h-9 rounded-xl gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {canEditUsers && (
              <Button variant="secondary" size="sm" onClick={() => setCreateUserOpen(true)} className="h-9 rounded-xl gap-2">
                <UserPlus className="w-4 h-4" /> Create User
              </Button>
            )}
          </div>
        }
      />

      {canApproveUsers && pendingUsers.length > 0 && (
        <Card className="p-4 rounded-2xl border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="font-semibold text-amber-800 text-sm">Pending Approval ({pendingUsers.length})</h3>
              <span className="text-xs text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">Action Required</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchPending()} className="h-7 text-xs text-amber-700 hover:bg-amber-100">
              {T("refresh")}
            </Button>
          </div>
          <div className="space-y-2">
            {pendingUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {(u.name || u.phone || "U")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{u.name || "New User"}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground font-mono">{u.phone}</p>
                      {u.email && <p className="text-xs text-muted-foreground">· {u.email}</p>}
                      <Badge variant="outline" className={`text-[10px] capitalize px-1.5 border ${ROLE_COLORS[u.role] || ROLE_COLORS.customer}`}>{u.role || "customer"}</Badge>
                      {(() => { const d = parseUserDocuments(u); return d.files.length > 0 ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${d.files.length >= 4 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {d.files.length} doc{d.files.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">No docs</span>
                      ); })()}
                      {(() => { const d = parseUserDocuments(u); return d.note ? <MessageSquare className="w-3 h-3 text-blue-500" /> : null; })()}
                      <p className="text-xs text-amber-600">{formatDate(u.createdAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setKycUser(u)}
                    className="h-8 px-3 border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg text-xs gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Documents
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(u.id)}
                    disabled={!canApproveUsers || approveMutation.isPending}
                    title={!canApproveUsers ? "Permission required" : undefined}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs gap-1 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setRejectUser(u); setRejectNote(""); }}
                    disabled={!canApproveUsers || rejectMutation.isPending}
                    title={!canApproveUsers ? "Permission required" : undefined}
                    className="h-8 px-3 border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs gap-1 disabled:opacity-60"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {rejectUser && (
        <Dialog open onOpenChange={open => { if (!open) { setRejectUser(null); setRejectNote(""); } }}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="w-5 h-5" /> Reject User
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to reject <strong>{rejectUser.name || rejectUser.phone}</strong>? They will not be able to log in.
              </p>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Rejection Reason (optional)</label>
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  placeholder="e.g. Documents incomplete, suspicious activity..."
                  rows={3}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setRejectUser(null); setRejectNote(""); }}>Cancel</Button>
                <Button onClick={handleReject} disabled={rejectMutation.isPending} className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2">
                  {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-3">
        <div className="flex flex-col gap-2">
          <ActionBar
            primary={canEditUsers ? (
              <Button
                size="sm"
                onClick={() => setCreateUserOpen(true)}
                className="h-10 rounded-xl gap-2 bg-[#1A56DB] hover:bg-[#1A56DB]/90 text-white font-semibold px-4"
              >
                <UserPlus className="w-4 h-4" /> Create User
              </Button>
            ) : null}
          />
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search by name, phone, or email..."
            filters={<>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border/50 w-full sm:w-40">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border/50 w-full sm:w-44">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={conditionTier} onValueChange={setConditionTier}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border/50 w-full sm:w-48">
                  <SelectValue placeholder="Condition Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="clean">Clean (No Conditions)</SelectItem>
                  <SelectItem value="has_conditions">Has Conditions</SelectItem>
                  <SelectItem value="warnings">Warnings</SelectItem>
                  <SelectItem value="restrictions">Restrictions</SelectItem>
                  <SelectItem value="suspensions">Suspensions</SelectItem>
                  <SelectItem value="bans">Bans</SelectItem>
                </SelectContent>
              </Select>
            </>}
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-muted/30 border-border/50 text-sm" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-xl bg-muted/30 border-border/50 text-sm" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-[#1A56DB] hover:underline shrink-0">Clear</button>
            )}
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground font-semibold">{selectedIds.size} selected</span>
              <button onClick={() => handleBulkBan("ban")} disabled={!canBanUsers || bulkBanMutation.isPending}
                className="px-3 py-1.5 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-200 disabled:opacity-60 transition-colors">
                Ban All
              </button>
              <button onClick={() => handleBulkBan("unban")} disabled={!canBanUsers || bulkBanMutation.isPending}
                className="px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-200 disabled:opacity-60 transition-colors">
                Unban All
              </button>
              <button onClick={() => handleBulkDelete()} disabled={!canDeleteUsers || bulkDeleteMutation.isPending}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-60 transition-colors">
                Delete All
              </button>
              <button onClick={() => handleBulkRestore()} disabled={!canEditUsers || bulkRestoreMutation.isPending}
                className="px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-200 disabled:opacity-60 transition-colors">
                Restore All
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Deselect</button>
            </div>
          )}
        </div>
      </Card>

      {isError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50/60 shadow-sm p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-red-800">Failed to load users</p>
              <p className="text-sm text-red-600 mt-1">Your session may have expired. Please log in again.</p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl border-red-200 text-red-700 hover:bg-red-100">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
              <Button variant="outline" size="sm" onClick={async () => { try { await logout(); } finally { window.location.href = (import.meta.env.BASE_URL?.replace(/\/$/, "") || "") + "/login"; } }} className="rounded-xl border-red-200 text-red-700 hover:bg-red-100">
                Re-Login
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            [1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)
          ) : filtered.length === 0 ? (
            <Card className="rounded-2xl p-12 text-center border-border/50">
              <UsersIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No users found</p>
            </Card>
          ) : filtered.map((user: any) => {
            const userRoles = (user.roles || user.role || "customer").split(",").filter(Boolean);
            const isBanned  = user.isBanned;
            const isBlocked = !user.isActive && !isBanned;
            return (
              <Card key={user.id} className={`rounded-2xl border-border/50 shadow-sm p-4 ${isBanned ? "bg-red-50/30 border-red-200/60" : isBlocked ? "bg-amber-50/30 border-amber-200/60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isBanned ? "bg-red-100 text-red-600" : isBlocked ? "bg-amber-100 text-amber-600" : "bg-[#1A56DB]/10 text-[#1A56DB]"}`}>
                    {(user.name || user.phone || "U")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground truncate">{user.name || user.phone}</p>
                      {isBanned && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200 px-1">BANNED</Badge>}
                      {isBlocked && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200 px-1">BLOCKED</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{user.phone}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {userRoles.map((r: string) => (
                        <Badge key={r} variant="outline" className={`text-[10px] capitalize px-1.5 border ${ROLE_COLORS[r] || "bg-gray-100 text-gray-700 border-gray-200"}`}>{r}</Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">{formatCurrency(user.walletBalance)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setKycUser(user)} className="h-8 px-2.5 rounded-lg border-purple-200 text-purple-700 text-xs">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSecurityUser(user)} disabled={!canEditUsers} title={!canEditUsers ? "Permission required" : "Security Settings"} className="h-8 px-2.5 rounded-lg border-slate-200 text-slate-600 text-xs disabled:opacity-50">
                      <Shield className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/account-conditions?userId=${user.id}`)} className="h-8 px-2.5 rounded-lg border-violet-200 text-violet-600 text-xs gap-1" title="Conditions">
                      <Gavel className="w-3.5 h-3.5" />
                      {user.conditionCount > 0 && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5 min-w-[18px] text-center">{user.conditionCount}</span>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setWalletUser(user)} disabled={!canTopupWallet} title={!canTopupWallet ? "Permission required" : "Wallet Topup"} className="h-8 px-2.5 rounded-lg border-emerald-200 text-emerald-700 text-xs disabled:opacity-50">
                      <Wallet className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Desktop table */}
        <Card className="hidden md:block rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-[#1A56DB]/5 to-blue-50/50 border-b border-blue-100">
                  <TableHead className="w-8 px-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded" />
                  </TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80">User</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80">Phone</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80">Roles</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80 text-right">Wallet</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80 text-center">Status</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80 text-right">Joined</TableHead>
                  <TableHead className="font-semibold text-[#1A56DB]/80 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <UsersIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-muted-foreground">No users found</p>
                        {(search || roleFilter !== "all" || statusFilter !== "all" || conditionTier !== "all" || dateFrom || dateTo) && (
                          <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((user: any) => {
                    const userRoles = (user.roles || user.role || "customer").split(",").filter(Boolean);
                    const isBanned  = user.isBanned;
                    const isBlocked = !user.isActive && !isBanned;
                    const isChecked = selectedIds.has(user.id);
                    return (
                      <TableRow key={user.id} className={`hover:bg-muted/40 transition-colors ${isBanned ? "bg-red-50/40" : isBlocked ? "bg-amber-50/40" : ""} ${isChecked ? "bg-blue-50/40" : ""}`}>
                        <TableCell className="px-3">
                          <input type="checkbox" checked={isChecked}
                            onChange={e => {
                              const s = new Set(selectedIds);
                              e.target.checked ? s.add(user.id) : s.delete(user.id);
                              setSelectedIds(s);
                            }}
                            className="w-4 h-4 rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {user.profilePictureUrl ? (
                              <img
                                src={user.profilePictureUrl}
                                alt={`${user.name || user.phone} profile`}
                                className={`w-10 h-10 rounded-full object-cover flex-shrink-0 ${isBanned ? "ring-2 ring-red-300" : isBlocked ? "ring-2 ring-amber-300" : "ring-2 ring-[#1A56DB]/20"}`}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${user.profilePictureUrl ? 'hidden' : ''} ${isBanned ? "bg-red-100 text-red-600" : isBlocked ? "bg-amber-100 text-amber-600" : "bg-[#1A56DB]/10 text-[#1A56DB]"}`}>
                              {(user.name || user.phone || "U")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-foreground truncate">{user.name || user.phone}</p>
                                {isBanned && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200 px-1">BANNED</Badge>}
                                {isBlocked && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200 px-1">BLOCKED</Badge>}
                                {(user.blockedServices || "").split(",").map((s: string) => s.trim()).includes("wallet") && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200 px-1">🔒 Wallet</Badge>}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground font-mono">{user.id.slice(-8).toUpperCase()}</p>
                                {user.username && <span className="flex items-center gap-0.5 text-[10px] font-mono text-violet-600">@{user.username}</span>}
                                {user.email && <span className="flex items-center gap-0.5 text-[10px] text-blue-600 truncate max-w-[140px]"><Mail className="w-2.5 h-2.5 flex-shrink-0"/>{user.email}</span>}
                                {user.city && <span className="flex items-center gap-0.5 text-[10px] text-[#1A56DB]"><MapPin className="w-2.5 h-2.5"/>{user.city}</span>}
                                {userRoles.includes("rider") && user.vehiclePlate && <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 px-1.5 rounded">{user.vehiclePlate}</span>}
                                {userRoles.includes("vendor") && user.businessType && <span className="text-[10px] text-orange-600 capitalize">{user.businessType}</span>}
                                {user.cnic && <span className="flex items-center gap-0.5 text-[10px] text-amber-700"><CreditCard className="w-2.5 h-2.5"/>ID✓</span>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{user.phone}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {userRoles.map((r: string) => (
                              <Badge key={r} variant="outline" className={`text-[10px] capitalize px-1.5 py-0.5 border ${ROLE_COLORS[r] || "bg-gray-100 text-gray-700 border-gray-200"}`}>{r}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-foreground">{formatCurrency(user.walletBalance)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isBanned ? (
                              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">Banned</Badge>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <Switch checked={user.isActive} disabled={!canEditUsers} onCheckedChange={(val) => canEditUsers && handleUpdate(user.id, { isActive: val })} />
                                {user.isActive ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
                              </div>
                            )}
                            {user.conditionCount > 0 && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                user.maxConditionSeverity === "ban" ? "bg-red-50 text-red-600 border-red-200" :
                                user.maxConditionSeverity === "suspension" ? "bg-orange-50 text-orange-600 border-orange-200" :
                                (user.maxConditionSeverity === "restriction_normal" || user.maxConditionSeverity === "restriction_strict") ? "bg-amber-50 text-amber-600 border-amber-200" :
                                "bg-yellow-50 text-yellow-600 border-yellow-200"
                              }`}>
                                {user.conditionCount} {user.maxConditionSeverity === "restriction_normal" ? "restriction" : user.maxConditionSeverity === "restriction_strict" ? "strict restriction" : user.maxConditionSeverity}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => setKycUser(user)} className="h-8 w-8 rounded-lg border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 p-0 flex items-center justify-center transition-colors" title="KYC Docs">
                              <Eye className="w-3.5 h-3.5"/>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setSecurityUser(user)} disabled={!canEditUsers} title={!canEditUsers ? "Permission required" : "Security Settings"} className="h-8 w-8 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 p-0 flex items-center justify-center transition-colors disabled:opacity-50">
                              <Shield className="w-3.5 h-3.5"/>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => navigate(`/account-conditions?userId=${user.id}`)} className="h-8 rounded-lg border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 px-2 flex items-center justify-center gap-1 transition-colors" title="Conditions">
                              <Gavel className="w-3.5 h-3.5"/>
                              {user.conditionCount > 0 && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5 min-w-[18px] text-center">{user.conditionCount}</span>}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setAddressUser(user)} className="h-8 w-8 rounded-lg border-teal-200 text-teal-600 hover:bg-teal-50 hover:border-teal-300 p-0 flex items-center justify-center transition-colors" title="Addresses">
                              <MapPin className="w-3.5 h-3.5"/>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setActivityUser(user)} className="h-8 w-8 rounded-lg border-[#1A56DB]/20 text-[#1A56DB] hover:bg-[#1A56DB]/5 hover:border-[#1A56DB]/30 p-0 flex items-center justify-center transition-colors" title="Activity">
                              <Activity className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleBanUser(user)} disabled={!canBanUsers} title={!canBanUsers ? "Permission required" : user.isBanned ? "Unban User" : "Ban User"} className="h-8 w-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 p-0 flex items-center justify-center transition-colors disabled:opacity-50">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteUser(user)} disabled={!canDeleteUsers} title={!canDeleteUsers ? "Permission required" : "Delete User"} className="h-8 w-8 rounded-lg border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 p-0 flex items-center justify-center transition-colors disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setWalletUser(user)} disabled={!canTopupWallet} title={!canTopupWallet ? "Permission required" : "Wallet Topup"} className="h-8 rounded-lg text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors disabled:opacity-50">
                              <Wallet className="w-3.5 h-3.5" /> Top Up
                            </Button>
                            {canAdjustWallet && parseFloat(user.cancellationDebt || "0") > 0 && (
                              <Button
                                variant="outline" size="sm"
                                onClick={() => setWaiveConfirmUser(user)}
                                disabled={waiveDebtMutation.isPending && waiveDebtMutation.variables === user.id}
                                className="h-8 rounded-lg text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-colors"
                                title={`Waive Rs. ${parseFloat(user.cancellationDebt).toFixed(0)} debt`}
                              >
                                {(waiveDebtMutation.isPending && waiveDebtMutation.variables === user.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-xs">⚡</span>} Waive Debt
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setDeleteUser(user)} disabled={!canDeleteUsers} title={!canDeleteUsers ? "Permission required" : "Delete User"} className="h-8 w-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 p-0 flex items-center justify-center transition-colors disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {!isLoading && filtered.length > 0 && (
            <PaginationControl page={page} total={totalUsers} limit={LIMIT} onPage={setPage} />
          )}
        </Card>
        </>
      )}

      {walletUser && (
        <WalletAdjustModal
          mode="customer"
          subject={{
            id: walletUser.id,
            name: walletUser.name,
            phone: walletUser.phone,
            walletBalance: Number(walletUser.walletBalance) || 0,
          }}
          onClose={() => setWalletUser(null)}
        />
      )}

      <Dialog open={!!deleteUser} onOpenChange={open => { if (!open) setDeleteUser(null); }}>
        <DialogContent className="w-[95vw] max-w-sm rounded-2xl p-6">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-5 h-5" /> Delete User?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">Are you sure you want to permanently delete <strong>"{deleteUser?.name || deleteUser?.phone}"</strong>? This cannot be undone.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1 rounded-xl gap-2" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {activityUser && <UserActivityModal userId={activityUser.id} userName={activityUser.name || activityUser.phone} user={activityUser} onClose={() => setActivityUser(null)} />}

      {securityUser && <SecurityModal user={securityUser} onClose={() => setSecurityUser(null)} />}

      {/* KYC Document Modal */}
      {kycUser && <KycDocModal user={kycUser} onClose={() => setKycUser(null)} canRequestCorrection={canRequestCorrection} />}

      {addressUser && <AddressBookModal user={addressUser} onClose={() => setAddressUser(null)} />}

      <CreateUserDialog open={createUserOpen} onClose={() => setCreateUserOpen(false)} />

      <Dialog open={!!waiveConfirmUser} onOpenChange={open => { if (!open) setWaiveConfirmUser(null); }}>
        <DialogContent className="w-[95vw] max-w-sm rounded-2xl p-6">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><span className="text-lg">⚡</span> Waive Cancellation Debt?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            This will clear <strong>Rs. {parseFloat(waiveConfirmUser?.cancellationDebt || "0").toFixed(0)}</strong> of cancellation debt for{" "}
            <strong>{waiveConfirmUser?.name || waiveConfirmUser?.phone}</strong>. This action cannot be undone.
          </p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setWaiveConfirmUser(null)}>Cancel</Button>
            <Button
              className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white gap-2"
              disabled={waiveDebtMutation.isPending}
              onClick={() => {
                const u = waiveConfirmUser;
                setWaiveConfirmUser(null);
                waiveDebtMutation.mutate(u.id);
              }}
            >
              {waiveDebtMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>⚡</span>}
              Waive Debt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
