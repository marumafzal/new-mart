import { useCallback, useState, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, StatCard } from "@/components/shared";
import { Users, ShoppingBag, Car, Pill, Box, Settings, TrendingUp, ArrowRight, Wallet, Download, Trophy, Star, AlertTriangle, DollarSign, LayoutDashboard, Loader2, X } from "lucide-react";
import { Link } from "wouter";
import { useStats, useRevenueTrend, useLeaderboard } from "@/hooks/use-admin";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { fetcher } from "@/lib/api";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useToast } from "@/hooks/use-toast";

function exportDashboard(
  trend: { date: string; revenue: number }[],
  onError: (msg: string) => void,
  setExporting: (v: boolean) => void,
) {
  setExporting(true);
  fetcher("/fleet/dashboard-export").then((data: any) => {
    const enriched = { ...data, trend: data.trend ?? trend };
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }).catch((err: any) => onError(err?.message || "Export failed")).finally(() => setExporting(false));
}

/* Shimmer skeleton block */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-100 rounded-2xl ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

/* Mini sparkline component */
function Sparkline({ data, color = "#6366F1" }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="w-20 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Clickable hero card wrapper — adds hover lift + cursor */
function HeroCardLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href}>
      <div className={`cursor-pointer transition-transform hover:-translate-y-0.5 ${className}`}>
        {children}
      </div>
    </Link>
  );
}

/* "Updated X min ago" helper */
function updatedAgo(ts: number): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SERVICE_SERIES = [
  { key: "mart",     label: "Mart",     color: "#f97316" },
  { key: "rides",    label: "Rides",    color: "#6366f1" },
  { key: "pharmacy", label: "Pharmacy", color: "#22c55e" },
  { key: "parcel",   label: "Parcel",   color: "#a855f7" },
  { key: "van",      label: "Van",      color: "#14b8a6" },
] as const;

type ServiceKey = typeof SERVICE_SERIES[number]["key"];

export default function Dashboard() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const qc = useQueryClient();
  const gradId = useId().replace(/:/g, "rev");
  const [isExporting, setIsExporting] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState<Record<ServiceKey, boolean>>({
    mart: true, rides: true, pharmacy: true, parcel: true, van: true,
  });

  const toggleSeries = (key: ServiceKey) =>
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  const { data, isLoading, isFetching, isError: statsError, dataUpdatedAt } = useStats();
  const { data: trendData, isError: trendError } = useRevenueTrend();
  const { data: lbData, isError: lbError }    = useLeaderboard();

  const hasError = (statsError || trendError || lbError) && !errorDismissed;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-stats"] }),
      qc.invalidateQueries({ queryKey: ["admin-revenue-trend"] }),
      qc.invalidateQueries({ queryKey: ["admin-leaderboard"] }),
    ]);
  }, [qc]);

  type TrendDay = {
    date: string;
    revenue: number;
    orderCount?: number;
    rideCount?: number;
    sosCount?: number;
    mart?: number;
    rides?: number;
    pharmacy?: number;
    parcel?: number;
    van?: number;
  };

  const rawTrend: TrendDay[] =
    Array.isArray(trendData?.trend) ? trendData.trend : [];

  const trend = [...rawTrend].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const revenueSparkData = trend.length >= 1
    ? trend.slice(-7).map(t => t.revenue || 0)
    : Array(7).fill(0);
  const ridesSparkData = trend.length >= 1
    ? trend.slice(-7).map(t => t.rideCount ?? 0)
    : Array(7).fill(0);
  const ordersSparkData = trend.length >= 1
    ? trend.slice(-7).map(t => t.orderCount ?? 0)
    : Array(7).fill(0);
  const sosSparkData = trend.length >= 1
    ? trend.slice(-7).map(t => t.sosCount ?? 0)
    : Array(7).fill(0);

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <SkeletonBlock className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => (
            <SkeletonBlock key={i} className="h-24" />
          ))}
        </div>
        <SkeletonBlock className="h-56" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-border/50 shadow-sm">
              <div className="px-6 py-4 border-b border-border/30">
                <SkeletonBlock className="h-5 w-36" />
              </div>
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map(j => (
                  <SkeletonBlock key={j} className="h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const vendors = lbData?.vendors || [];
  const riders  = lbData?.riders  || [];

  const statsData       = data as Record<string, unknown> | undefined;
  const activeSosCount  = typeof statsData?.activeSos    === "number" ? statsData.activeSos    : 0;
  const pendingOrders   = typeof statsData?.pendingOrders === "number" ? statsData.pendingOrders : 0;
  const activeRides     = typeof statsData?.activeRides  === "number" ? statsData.activeRides  : 0;
  const totalRiders     = typeof statsData?.totalRiders  === "number" ? statsData.totalRiders  : 0;
  const totalVendors    = typeof statsData?.totalVendors === "number" ? statsData.totalVendors : 0;

  const lastUpdated = dataUpdatedAt ? updatedAgo(dataUpdatedAt) : "";

  return (
    <PullToRefresh onRefresh={handleRefresh} className="space-y-6 sm:space-y-8">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Some data may be unavailable — one or more requests failed. Try refreshing.</span>
          <button onClick={() => setErrorDismissed(true)} className="shrink-0 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <PageHeader
        icon={LayoutDashboard}
        title={T("overview")}
        subtitle={`${T("welcomeBack")}${lastUpdated ? ` · Updated ${lastUpdated}` : ""}`}
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-600"
        actions={
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            )}
            <Button variant="outline" size="sm" disabled={isExporting} onClick={() => exportDashboard(trend, (msg) => toast({ title: "Export failed", description: msg, variant: "destructive" }), setIsExporting)} className="h-9 rounded-xl gap-2 shrink-0">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {T("export")}
            </Button>
          </div>
        }
      />

      {/* 4 Hero Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue → /transactions */}
        <HeroCardLink href="/transactions">
          <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-indigo-600 to-indigo-800 text-white overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <Sparkline data={revenueSparkData} color="rgba(255,255,255,0.8)" />
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Total Revenue</p>
              <h3 className="text-xl font-bold">{formatCurrency(data?.revenue?.total || 0)}</h3>
            </CardContent>
          </Card>
        </HeroCardLink>

        {/* Active Rides → /rides */}
        <HeroCardLink href="/rides">
          <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-white overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <Sparkline data={ridesSparkData} color="rgba(255,255,255,0.8)" />
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Active Rides</p>
              <h3 className="text-xl font-bold">{activeRides.toLocaleString()}</h3>
            </CardContent>
          </Card>
        </HeroCardLink>

        {/* Pending Orders → /orders */}
        <HeroCardLink href="/orders">
          <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-amber-500 to-orange-600 text-white overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <Sparkline data={ordersSparkData} color="rgba(255,255,255,0.8)" />
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Pending Orders</p>
              <h3 className="text-xl font-bold">{pendingOrders.toLocaleString()}</h3>
            </CardContent>
          </Card>
        </HeroCardLink>

        {/* Active SOS → /sos-alerts */}
        <Link href="/sos-alerts">
          <Card className={`rounded-2xl border-0 shadow-md overflow-hidden relative cursor-pointer transition-transform hover:-translate-y-0.5 ${activeSosCount > 0 ? "bg-gradient-to-br from-red-600 to-red-800" : "bg-gradient-to-br from-slate-500 to-slate-700"} text-white`}>
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center ${activeSosCount > 0 ? "animate-pulse" : ""}`}>
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <Sparkline data={sosSparkData} color="rgba(255,255,255,0.8)" />
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Active SOS</p>
              <h3 className="text-xl font-bold">{activeSosCount.toLocaleString()}</h3>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Total Riders & Total Vendors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <HeroCardLink href="/riders">
          <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-violet-500 to-violet-700 text-white overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Total Riders</p>
              <h3 className="text-xl font-bold">{totalRiders.toLocaleString()}</h3>
            </CardContent>
          </Card>
        </HeroCardLink>

        <HeroCardLink href="/vendors">
          <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-teal-500 to-teal-700 text-white overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-white/70 text-xs font-medium mb-1">Total Vendors</p>
              <h3 className="text-xl font-bold">{totalVendors.toLocaleString()}</h3>
            </CardContent>
          </Card>
        </HeroCardLink>
      </div>

      {/* Revenue Breakdown */}
      <div>
        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground mb-3 sm:mb-4">{T("revenueBreakdown")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card className="col-span-2 sm:col-span-3 lg:col-span-1 rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white shadow-lg shadow-primary/20 border-none">
            <CardContent className="p-4 sm:p-6">
              <p className="text-white/80 font-medium text-xs sm:text-sm mb-1 sm:mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> {T("revenueBreakdown")}
              </p>
              <p className="text-white/70 text-xs">across all services</p>
            </CardContent>
          </Card>
          <StatCard icon={ShoppingBag} label="Mart & Food" value={formatCurrency(data?.revenue?.orders || 0)} iconBgClass="bg-orange-100" iconColorClass="text-orange-600" />
          <StatCard icon={Car} label={T("ride")} value={formatCurrency(data?.revenue?.rides || 0)} iconBgClass="bg-blue-100" iconColorClass="text-blue-600" />
          <StatCard icon={Pill} label={T("pharmacy")} value={formatCurrency(data?.revenue?.pharmacy || 0)} iconBgClass="bg-green-100" iconColorClass="text-green-600" />
          <StatCard icon={Box} label={T("parcel")} value={formatCurrency(data?.revenue?.parcel || 0)} iconBgClass="bg-purple-100" iconColorClass="text-purple-600" />
          <StatCard icon={Car} label="Van" value={formatCurrency(data?.revenue?.van || 0)} iconBgClass="bg-teal-100" iconColorClass="text-teal-600" />
        </div>
      </div>

      {/* 7-Day Revenue Trend chart */}
      <Card className="rounded-2xl border-border/50 shadow-sm p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> 7-Day Revenue Trend
          </h2>
          {/* Series toggle legend */}
          {trend.length > 0 && trend.some(d => SERVICE_SERIES.some(s => s.key in d && typeof d[s.key] === "number")) && (
            <div className="flex flex-wrap gap-2">
              {SERVICE_SERIES.map(s => (
                <button
                  key={s.key}
                  role="checkbox"
                  aria-checked={visibleSeries[s.key]}
                  aria-label={`Toggle ${s.label} series`}
                  onClick={() => toggleSeries(s.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    visibleSeries[s.key]
                      ? "border-transparent text-white"
                      : "border-border bg-transparent text-muted-foreground"
                  }`}
                  style={visibleSeries[s.key] ? { backgroundColor: s.color } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: visibleSeries[s.key] ? "rgba(255,255,255,0.8)" : s.color }}
                  />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {trend.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No trend data available</div>
        ) : trend.some(d => SERVICE_SERIES.some(s => s.key in d && typeof d[s.key] === "number")) ? (
          /* Multi-series chart when per-service data is present */
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  {SERVICE_SERIES.map(s => (
                    <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={d => { const dt = new Date(d); return dt.toString() === "Invalid Date" ? "" : dt.toLocaleDateString("en-US", { weekday: "short" }); }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={40} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", fontSize: "12px", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number, name: string) => [`Rs. ${Math.round(v).toLocaleString()}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                  labelFormatter={l => { const dt = new Date(l); return dt.toString() === "Invalid Date" ? "" : dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); }}
                />
                {SERVICE_SERIES.map(s =>
                  visibleSeries[s.key] ? (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      fill={`url(#${gradId}-${s.key})`}
                      dot={false}
                      activeDot={{ r: 4, fill: s.color }}
                    />
                  ) : null
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Fallback: single total line when per-service data is absent */
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={d => { const dt = new Date(d); return dt.toString() === "Invalid Date" ? "" : dt.toLocaleDateString("en-US", { weekday: "short" }); }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={40} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", fontSize: "12px", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number) => [`Rs. ${Math.round(v).toLocaleString()}`, T("revenue")]}
                  labelFormatter={l => { const dt = new Date(l); return dt.toString() === "Invalid Date" ? "" : dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2}
                  fill={`url(#${gradId})`} dot={{ fill: "#6366F1", r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Top Vendors */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 flex items-center justify-between bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> {T("topVendors")}
            </h2>
            <Link href="/vendors" className="text-xs sm:text-sm font-semibold text-indigo-600 flex items-center hover:underline gap-1">
              {T("viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div>
            {!vendors.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{T("noVendorData")}</div>
            ) : vendors.slice(0, 5).map((v: any, idx: number) => (
              <div key={v.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 hover:bg-indigo-50/50 transition-colors">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0
                  ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{v.name || v.phone || "Unknown Vendor"}</p>
                  <p className="text-xs text-muted-foreground">{v.totalOrders ?? 0} {T("myOrders").toLowerCase()}</p>
                </div>
                <p className="font-bold text-sm text-foreground shrink-0">{formatCurrency(v.totalRevenue)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Riders */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 flex items-center justify-between bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" /> {T("topRiders")}
            </h2>
            <Link href="/riders" className="text-xs sm:text-sm font-semibold text-indigo-600 flex items-center hover:underline gap-1">
              {T("viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div>
            {!riders.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{T("noRiderData")}</div>
            ) : riders.slice(0, 5).map((r: any, idx: number) => (
              <div key={r.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 hover:bg-indigo-50/50 transition-colors">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0
                  ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.name || r.phone || "Unknown Rider"}</p>
                  <p className="text-xs text-muted-foreground">{r.completedTrips ?? 0} trips</p>
                </div>
                <p className="font-bold text-sm text-foreground shrink-0">{formatCurrency(r.totalEarned)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
        {/* Recent Orders */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 flex items-center justify-between bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-600" /> {T("recentOrders")}
            </h2>
            <Link href="/orders" className="text-xs sm:text-sm font-semibold text-indigo-600 flex items-center hover:underline gap-1">
              {T("viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div>
            {!data?.recentOrders?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{T("noRecentOrders")}</div>
            ) : (
              data.recentOrders.slice(0, 5).map((order: any) => (
                <div key={order.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-indigo-50/40 transition-colors flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">#{String(order.id).slice(-6).toUpperCase()}</span>
                      <span className="capitalize text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">{order.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm mb-1">{formatCurrency(order.total)}</p>
                    <StatusPill status={order.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Rides */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 flex items-center justify-between bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-600" /> {T("recentRides")}
            </h2>
            <Link href="/rides" className="text-xs sm:text-sm font-semibold text-indigo-600 flex items-center hover:underline gap-1">
              {T("viewAll")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div>
            {!data?.recentRides?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{T("noRecentRides")}</div>
            ) : (
              data.recentRides.slice(0, 5).map((ride: any) => (
                <div key={ride.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-indigo-50/40 transition-colors flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">#{String(ride.id).slice(-6).toUpperCase()}</span>
                      <span className="capitalize text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">{ride.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(ride.createdAt)}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm mb-1">{formatCurrency(ride.fare)}</p>
                    <StatusPill status={ride.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Quick Links on Mobile */}
      <div className="lg:hidden">
        <h2 className="text-base font-bold mb-3">{T("quickAccess")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: T("pharmacy"), href: "/pharmacy", icon: Pill, color: "text-pink-600", bg: "bg-pink-50 border-pink-200" },
            { label: T("parcel"), href: "/parcel", icon: Box, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
            { label: T("transactions"), href: "/transactions", icon: Wallet, color: "text-sky-600", bg: "bg-sky-50 border-sky-200" },
            { label: T("settings"), href: "/settings", icon: Settings, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer active:scale-95 transition-transform ${item.bg}`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className={`font-semibold text-sm ${item.color}`}>{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PullToRefresh>
  );
}

/* Rounded pill status badge */
function StatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase() || "";
  let cls = "bg-gray-100 text-gray-600";
  if (s === "completed" || s === "delivered") cls = "bg-emerald-100 text-emerald-700";
  else if (s === "cancelled" || s === "rejected") cls = "bg-red-100 text-red-600";
  else if (s === "pending") cls = "bg-amber-100 text-amber-700";
  else if (s === "in_transit" || s === "accepted" || s === "active") cls = "bg-indigo-100 text-indigo-700";
  else if (s === "searching" || s === "bargaining") cls = "bg-blue-100 text-blue-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>
      {(status ?? "").replace(/_/g, " ")}
    </span>
  );
}
