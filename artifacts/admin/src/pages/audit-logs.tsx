import { useState } from "react";
import {
  ClipboardList, RefreshCw, Search, Filter, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, XCircle, Loader2, CalendarDays, User,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useAuditLog } from "@/hooks/use-admin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


const ACTION_OPTIONS = [
  { value: "all",                    label: "All Actions" },
  { value: "user_create",            label: "User Created" },
  { value: "user_approve",           label: "User Approved" },
  { value: "user_reject",            label: "User Rejected" },
  { value: "user_delete",            label: "User Deleted" },
  { value: "wallet_topup",           label: "Wallet Top-up" },
  { value: "vendor_payout",          label: "Vendor Payout" },
  { value: "vendor_credit",          label: "Vendor Credit" },
  { value: "rider_payout",           label: "Rider Payout" },
  { value: "rider_bonus",            label: "Rider Bonus" },
  { value: "waive_debt",             label: "Waive Debt" },
  { value: "revoke_sessions",        label: "Revoke Sessions" },
  { value: "user_ban",               label: "User Banned" },
  { value: "bulk_ban",               label: "Bulk Ban" },
  { value: "kyc_approve",            label: "KYC Approved" },
  { value: "kyc_reject",             label: "KYC Rejected" },
  { value: "admin_otp",              label: "OTP Actions" },
  { value: "admin_login",            label: "Admin Login" },
  { value: "admin_logout",           label: "Admin Logout" },
  { value: "product_approve",        label: "Product Approved" },
  { value: "product_reject",         label: "Product Rejected" },
  { value: "order_refund",           label: "Order Refund" },
];

const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  success: { label: "Success", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fail:    { label: "Failed",  cls: "bg-red-50 text-red-700 border-red-200" },
  failure: { label: "Failed",  cls: "bg-red-50 text-red-700 border-red-200" },
};

function ActionBadge({ action }: { action: string }) {
  const label = ACTION_OPTIONS.find(o => action.startsWith(o.value))?.label || action;
  const isAuth = action.includes("login") || action.includes("logout") || action.includes("mfa");
  const isBan  = action.includes("ban") || action.includes("block") || action.includes("delete");
  const isWallet = action.includes("wallet") || action.includes("topup") || action.includes("payout") || action.includes("bonus") || action.includes("credit") || action.includes("waive");
  const isKyc  = action.includes("kyc");
  const isOtp  = action.includes("otp");

  const cls = isBan ? "bg-red-50 text-red-700 border-red-200"
    : isWallet ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isKyc ? "bg-purple-50 text-purple-700 border-purple-200"
    : isOtp ? "bg-amber-50 text-amber-700 border-amber-200"
    : isAuth ? "bg-blue-50 text-blue-700 border-blue-200"
    : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0.5 max-w-[160px] truncate ${cls}`} title={action}>
      {action}
    </Badge>
  );
}

export default function AuditLogsPage() {
  const [page, setPage]           = useState(1);
  const [action, setAction]       = useState("all");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [searchAdmin, setSearchAdmin] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const params = {
    page,
    action: action !== "all" ? action : undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  };

  const { data, isLoading, isError, refetch, isFetching } = useAuditLog(params);

  const entries: any[] = data?.entries || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;
  const limit: number = data?.limit || 50;

  const filteredEntries = searchApplied
    ? entries.filter((e: any) =>
        (e.adminId || "").toLowerCase().includes(searchApplied.toLowerCase()) ||
        (e.action || "").toLowerCase().includes(searchApplied.toLowerCase()) ||
        (e.details || "").toLowerCase().includes(searchApplied.toLowerCase()) ||
        (e.ip || "").toLowerCase().includes(searchApplied.toLowerCase())
      )
    : entries;

  const handleSearch = () => {
    setSearchApplied(searchAdmin);
    setPage(1);
  };

  const handleClear = () => {
    setAction("all");
    setDateFrom("");
    setDateTo("");
    setSearchAdmin("");
    setSearchApplied("");
    setPage(1);
  };

  const hasFilters = action !== "all" || dateFrom || dateTo || searchApplied;

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        icon={ClipboardList}
        title="Audit Logs"
        subtitle={`Admin action trail — ${total.toLocaleString()} total entries`}
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-600"
        actions={
          <Button
            variant="outline"
            className="h-9 rounded-xl gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="rounded-2xl border border-border shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by admin ID, action, or IP..."
              value={searchAdmin}
              onChange={e => setSearchAdmin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="pl-9 h-9 rounded-xl"
            />
          </div>

          <Select value={action} onValueChange={v => { setAction(v); setPage(1); }}>
            <SelectTrigger className="h-9 rounded-xl w-[180px]">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Filter action" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 rounded-xl w-[140px] text-xs"
              title="From date"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 rounded-xl w-[140px] text-xs"
              title="To date"
            />
          </div>

          <Button
            variant="outline"
            className="h-9 rounded-xl gap-1.5 flex-shrink-0"
            onClick={handleSearch}
          >
            <Search className="w-3.5 h-3.5" /> Search
          </Button>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-xl text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <span className="text-sm">Loading audit logs...</span>
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm font-medium">Failed to load audit logs</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl">
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold text-muted-foreground text-xs w-[160px]">Timestamp</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-xs w-[180px]">Action</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-xs w-[140px]">Admin</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-xs w-[110px]">IP Address</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-xs w-[90px] text-center">Result</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-xs">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground font-medium">No audit log entries found</p>
                          {hasFilters && (
                            <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry: any, idx: number) => {
                      const resultInfo = RESULT_BADGE[entry.result] || { label: entry.result || "—", cls: "bg-gray-50 text-gray-600 border-gray-200" };
                      const ts = entry.timestamp ? new Date(entry.timestamp) : null;

                      return (
                        <TableRow key={`${entry.timestamp}-${idx}`} className="hover:bg-muted/30 transition-colors group">
                          <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                            {ts ? (
                              <div>
                                <span className="text-foreground font-semibold">{ts.toLocaleDateString()}</span>
                                <span className="block text-[10px]">{ts.toLocaleTimeString()}</span>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <ActionBadge action={entry.action || "—"} />
                          </TableCell>
                          <TableCell>
                            {entry.adminId ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                  <User className="w-3 h-3 text-indigo-600" />
                                </div>
                                <span className="text-xs font-mono text-foreground truncate max-w-[100px]" title={entry.adminId}>
                                  {entry.adminId.slice(0, 10)}…
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">System</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono text-muted-foreground">{entry.ip || "—"}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${resultInfo.cls}`}>
                              {entry.result === "success"
                                ? <><CheckCircle2 className="w-3 h-3 inline mr-0.5" />{resultInfo.label}</>
                                : entry.result === "fail" || entry.result === "failure"
                                  ? <><XCircle className="w-3 h-3 inline mr-0.5" />{resultInfo.label}</>
                                  : resultInfo.label
                              }
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground max-w-xs truncate group-hover:whitespace-normal group-hover:max-w-none group-hover:overflow-visible transition-all" title={entry.details}>
                              {entry.details || "—"}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total.toLocaleString()} entries
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || isFetching}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        className={`h-7 w-7 p-0 rounded-lg text-xs ${pageNum === page ? "bg-[#1A56DB] text-white" : ""}`}
                        onClick={() => setPage(pageNum)}
                        disabled={isFetching}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isFetching}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {filteredEntries.length > 0 && totalPages <= 1 && (
              <div className="px-4 py-2.5 border-t border-border/50 bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Showing {filteredEntries.length} of {total.toLocaleString()} entries
                </p>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
