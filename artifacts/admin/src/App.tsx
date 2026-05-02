import { useEffect, useState, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { OnlineStatusBanner } from "@/components/OnlineStatusBanner";
import { useLanguage } from "@/lib/useLanguage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initSentry, setSentryUser } from "@/lib/sentry";
import { initAnalytics, identifyUser } from "@/lib/analytics";
import { registerPush } from "@/lib/push";
import { initErrorReporter, reportError } from "@/lib/error-reporter";
import { AdminAuthProvider, useAdminAuth } from "@/lib/adminAuthContext";
import { setupAdminFetcherHandlers } from "@/lib/adminFetcher";
import { setTokenHandlers } from "@/lib/api";
import { auditAdminEnv } from "@/lib/envValidation";
import { bootAccessibilitySettings } from "@/lib/useAccessibilitySettings";
import { useVersionCheck } from "@/hooks/useVersionCheck";

// Run env audit once at module load so warnings appear before any
// component depends on `import.meta.env.BASE_URL` etc.
auditAdminEnv();
// Apply persisted font-scale + contrast on boot so the very first paint
// already honours the admin's accessibility preferences.
bootAccessibilitySettings();

// Layout & Pages
import { AdminLayout } from "@/components/layout/AdminLayout";
import { FirstLoginCredentialsDialog } from "@/components/FirstLoginCredentialsDialog";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import SetNewPassword from "@/pages/set-new-password";
import RolesPermissions from "@/pages/roles-permissions";
import Dashboard from "@/pages/dashboard";
import Users from "@/pages/users";
import Orders from "@/pages/orders";
import Rides from "@/pages/rides";
import Pharmacy from "@/pages/pharmacy";
import Parcel from "@/pages/parcel";
import Products from "@/pages/products";
import Broadcast from "@/pages/broadcast";
import Transactions from "@/pages/transactions";
import RevenueAnalytics from "@/pages/revenue-analytics";
import Settings from "@/pages/settings";
import FlashDeals from "@/pages/flash-deals";
import Categories from "@/pages/categories";
import Banners from "@/pages/banners";
import AppManagement from "@/pages/app-management";
import AccessibilityPage from "@/pages/accessibility";
import ConsentLogPage from "@/pages/consent-log";
import VendorInventorySettingsPage from "@/pages/vendor-inventory-settings";
import Vendors from "@/pages/vendors";
import Riders from "@/pages/riders";
import PromoCodes from "@/pages/promo-codes";
import Notifications from "@/pages/notifications";
import Withdrawals from "@/pages/Withdrawals";
import DepositRequests from "@/pages/DepositRequests";
import Security from "@/pages/security";
// Heavy map/dashboard routes are code-split — react-leaflet, mapbox-gl,
// recharts, and the long error-monitor / communication panels add ~1MB
// of JS that should not block the initial admin shell. React.lazy +
// Suspense delivers the chunk only when the admin actually navigates to
// the route.
const LiveRidersMap = lazy(() => import("@/pages/live-riders-map"));
import SosAlerts from "@/pages/sos-alerts";
import ReviewsPage from "@/pages/reviews";
import KycPage from "@/pages/kyc";
import VanService from "@/pages/van";
import DeliveryAccess from "@/pages/delivery-access";
import AccountConditions from "@/pages/account-conditions";
import ConditionRules from "@/pages/condition-rules";
import Popups from "@/pages/popups";
import PromotionsHub from "@/pages/promotions-hub";
import SupportChat from "@/pages/support-chat";
import FaqManagement from "@/pages/faq-management";
import SearchAnalytics from "@/pages/search-analytics";
const ErrorMonitor = lazy(() => import("@/pages/error-monitor"));
const Communication = lazy(() => import("@/pages/communication"));
import Loyalty from "@/pages/loyalty";
import WalletTransfers from "@/pages/wallet-transfers";
import ChatMonitor from "@/pages/chat-monitor";
import WishlistInsights from "@/pages/wishlist-insights";
import QrCodes from "@/pages/qr-codes";
import Experiments from "@/pages/experiments";
import WebhookManager from "@/pages/webhook-manager";
import DeepLinks from "@/pages/deep-links";
import LaunchControl from "@/pages/launch-control";
import OtpControl from "@/pages/otp-control";
import SmsGateways from "@/pages/sms-gateways";
import AuthMethods from "@/pages/auth-methods";
import AuditLogs from "@/pages/audit-logs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

/* Auto-logout when an authenticated query returns 401.
   Guard: only remove token + redirect if we're actually logged in.
   This prevents pre-login query failures (expected 401s) from redirecting. */
interface QueryAuthError {
  message?: string;
  status?: number;
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const raw = event.action.error;
    const err: QueryAuthError =
      raw && typeof raw === "object" ? (raw as QueryAuthError) : {};
    const msg = (err.message || "").toLowerCase();
    const is401 =
      msg.includes("unauthorized") ||
      msg.includes("session expired") ||
      msg.includes("please log in") ||
      err.status === 401;
    // Note: Auth state is managed by adminAuthContext (in-memory only)
    // The fetcher will handle 401 with auto-refresh + redirect
    if (is401) {
      console.warn("[App] Received 401 from query - auth will be handled by fetcher");
    }
  }
});

function ProtectedRoute({
  component: Component,
  /**
   * When true, the route renders WITHOUT the standard AdminLayout chrome.
   * Used by the optional `/set-new-password` voluntary password-change
   * screen so it presents as a focused full-screen flow.
   *
   * Note: there is no longer a forced password-change gate. Admins who
   * land here just see the page; the optional first-login popup is
   * surfaced separately via <FirstLoginCredentialsDialog />.
   */
  bypassPasswordGate = false,
}: {
  component: React.ComponentType;
  bypassPasswordGate?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { state } = useAdminAuth();

  useEffect(() => {
    if (!state.isLoading && !state.accessToken) {
      setLocation("/login");
    }
  }, [state.accessToken, state.isLoading, setLocation]);

  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!state.accessToken) {
    return null;
  }

  // The set-new-password screen renders without the full admin chrome so the
  // user is not tempted to navigate elsewhere via the sidebar.
  if (bypassPasswordGate) {
    return (
      <ErrorBoundary fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-gray-900">Page crashed unexpectedly</h2>
          <p className="text-sm text-gray-500">An error occurred while loading this page.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Reload</button>
        </div>
      }>
        <Component />
      </ErrorBoundary>
    );
  }

  return (
    <AdminLayout>
      <ErrorBoundary fallback={
        <div className="flex flex-col items-center justify-center gap-4 p-12 text-center rounded-xl border border-red-100 bg-red-50 m-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-base font-bold text-red-900">This page crashed unexpectedly</h2>
          <p className="text-sm text-red-600">An error occurred while rendering this page. Other parts of the admin are unaffected.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Reload Page</button>
        </div>
      }>
        {/* Suspense fallback only matters for the lazy-loaded heavy
            routes (live-riders-map, error-monitor, communication).
            Eager-imported pages render synchronously and skip it. */}
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <Component />
        </Suspense>
      </ErrorBoundary>
      {/* Surfaces the OPTIONAL credentials popup whenever the admin is
          still on the seeded defaults and has not dismissed it for the
          session. Skipping is safe — defaults keep working. */}
      <FirstLoginCredentialsDialog />
    </AdminLayout>
  );
}

/* Root "/" gate: bounce authenticated users to the dashboard and
 * otherwise render the login page. The redirect must run from a
 * useEffect so wouter's navigate isn't called during render — calling
 * setLocation in a render body produces the "Cannot update a component
 * while rendering a different component" warning.
 */
function RootRedirect() {
  const { state } = useAdminAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (state.isLoading) return;
    if (state.accessToken) {
      setLocation("/dashboard");
    }
  }, [state.isLoading, state.accessToken, setLocation]);

  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (state.accessToken) {
    // Effect above will navigate; render nothing in the meantime.
    return null;
  }
  return <Login />;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      {/* Optional voluntary password-change screen. Reachable any time
          for admins who prefer the dedicated full-screen flow over the
          first-login popup. Renders without the AdminLayout chrome. */}
      <Route path="/set-new-password">
        <ProtectedRoute component={SetNewPassword} bypassPasswordGate />
      </Route>
      <Route path="/">
        <RootRedirect />
      </Route>

      {/* Protected Routes */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/orders"><ProtectedRoute component={Orders} /></Route>
      <Route path="/rides"><ProtectedRoute component={Rides} /></Route>
      <Route path="/pharmacy"><ProtectedRoute component={Pharmacy} /></Route>
      <Route path="/parcel"><ProtectedRoute component={Parcel} /></Route>
      <Route path="/products"><ProtectedRoute component={Products} /></Route>
      <Route path="/broadcast"><ProtectedRoute component={Broadcast} /></Route>
      <Route path="/transactions"><ProtectedRoute component={Transactions} /></Route>
      <Route path="/revenue-analytics"><ProtectedRoute component={RevenueAnalytics} /></Route>
      {/*
        Settings hub deep links: `/settings/:section` and
        `/settings/:section/:subsection`. The hub component reads route
        params via `useParams` from wouter and falls back to the legacy
        `?tab=` / `?cat=` query strings so existing bookmarks keep working.
      */}
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/settings/:section"><ProtectedRoute component={Settings} /></Route>
      <Route path="/settings/:section/:subsection"><ProtectedRoute component={Settings} /></Route>
      <Route path="/flash-deals"><ProtectedRoute component={FlashDeals} /></Route>
      <Route path="/categories"><ProtectedRoute component={Categories} /></Route>
      <Route path="/banners"><ProtectedRoute component={Banners} /></Route>
      <Route path="/app-management"><ProtectedRoute component={AppManagement} /></Route>
      <Route path="/vendors"><ProtectedRoute component={Vendors} /></Route>
      <Route path="/riders"><ProtectedRoute component={Riders} /></Route>
      <Route path="/promo-codes"><ProtectedRoute component={PromoCodes} /></Route>
      <Route path="/notifications"><ProtectedRoute component={Notifications} /></Route>
      <Route path="/withdrawals"><ProtectedRoute component={Withdrawals} /></Route>
      <Route path="/deposit-requests"><ProtectedRoute component={DepositRequests} /></Route>
      <Route path="/security"><ProtectedRoute component={Security} /></Route>
      <Route path="/sos-alerts"><ProtectedRoute component={SosAlerts} /></Route>
      <Route path="/live-riders-map"><ProtectedRoute component={LiveRidersMap} /></Route>
      <Route path="/reviews"><ProtectedRoute component={ReviewsPage} /></Route>
      <Route path="/kyc"><ProtectedRoute component={KycPage} /></Route>
      <Route path="/van"><ProtectedRoute component={VanService} /></Route>
      <Route path="/delivery-access"><ProtectedRoute component={DeliveryAccess} /></Route>
      <Route path="/account-conditions"><ProtectedRoute component={AccountConditions} /></Route>
      <Route path="/condition-rules"><ProtectedRoute component={ConditionRules} /></Route>
      <Route path="/popups"><ProtectedRoute component={Popups} /></Route>
      <Route path="/promotions"><ProtectedRoute component={PromotionsHub} /></Route>
      <Route path="/support-chat"><ProtectedRoute component={SupportChat} /></Route>
      <Route path="/faq-management"><ProtectedRoute component={FaqManagement} /></Route>
      <Route path="/search-analytics"><ProtectedRoute component={SearchAnalytics} /></Route>
      <Route path="/error-monitor"><ProtectedRoute component={ErrorMonitor} /></Route>
      <Route path="/communication"><ProtectedRoute component={Communication} /></Route>
      <Route path="/loyalty"><ProtectedRoute component={Loyalty} /></Route>
      <Route path="/wallet-transfers"><ProtectedRoute component={WalletTransfers} /></Route>
      <Route path="/chat-monitor"><ProtectedRoute component={ChatMonitor} /></Route>
      <Route path="/wishlist-insights"><ProtectedRoute component={WishlistInsights} /></Route>
      <Route path="/qr-codes"><ProtectedRoute component={QrCodes} /></Route>
      <Route path="/experiments"><ProtectedRoute component={Experiments} /></Route>
      <Route path="/webhooks"><ProtectedRoute component={WebhookManager} /></Route>
      <Route path="/deep-links"><ProtectedRoute component={DeepLinks} /></Route>
      <Route path="/launch-control"><ProtectedRoute component={LaunchControl} /></Route>
      <Route path="/otp-control"><ProtectedRoute component={OtpControl} /></Route>
      <Route path="/sms-gateways"><ProtectedRoute component={SmsGateways} /></Route>
      <Route path="/auth-methods"><ProtectedRoute component={AuthMethods} /></Route>
      <Route path="/roles-permissions"><ProtectedRoute component={RolesPermissions} /></Route>
      <Route path="/audit-logs"><ProtectedRoute component={AuditLogs} /></Route>
      <Route path="/accessibility"><ProtectedRoute component={AccessibilityPage} /></Route>
      <Route path="/consent-log"><ProtectedRoute component={ConsentLogPage} /></Route>
      <Route path="/vendor-inventory-settings"><ProtectedRoute component={VendorInventorySettingsPage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function VersionCheckInit() {
  useVersionCheck();
  return null;
}

function LanguageInit() {
  useLanguage();
  return null;
}

function IntegrationsInit() {
  const { state, refreshAccessToken } = useAdminAuth();

  useEffect(() => {
    // Setup fetcher with auth handlers
    setupAdminFetcherHandlers(
      () => state.accessToken,
      () => refreshAccessToken()
    );
    
    // Setup token handlers for api.ts bridge layer
    setTokenHandlers(
      () => state.accessToken,
      () => refreshAccessToken()
    );
  }, [state.accessToken, refreshAccessToken]);

  useEffect(() => {
    initErrorReporter();

    /* /api/* is proxied by Vite (and served by the api-server in production)
       regardless of BASE_URL. Prefixing with BASE_URL turned this into
       `/admin/api/platform-config`, which falls outside the proxy rule and
       returns the SPA index.html — silently breaking integrations init. */
    fetch(`/api/platform-config`)
      .then(r => r.ok ? r.json() : null)
      .then(raw => {
        if (!raw) return;
        const d = raw?.data ?? raw;
        const integ = d?.integrations;
        if (!integ) return;
        if (integ.sentry && integ.sentryDsn) {
          initSentry({
            dsn: integ.sentryDsn,
            environment: integ.sentryEnvironment || "production",
            sampleRate: integ.sentrySampleRate ?? 1.0,
            tracesSampleRate: integ.sentryTracesSampleRate ?? 0.1,
          });
        }
        if (integ.analytics && integ.analyticsTrackingId) {
          initAnalytics(integ.analyticsPlatform, integ.analyticsTrackingId, integ.analyticsDebug ?? false);
        }
      })
      .catch((err) => {
        console.error("[App] Platform config fetch failed:", err);
      });

    /* Register admin push when authenticated */
    if (state.accessToken && !state.isLoading) {
      if (typeof Notification !== "undefined" && Notification.requestPermission) {
        Notification.requestPermission()
          .then(perm => { if (perm === "granted") registerPush().catch((err: unknown) => { console.error("[App] Push registration failed:", err); }); })
          .catch((err: unknown) => { console.error("[App] Notification permission request failed:", err); });
      }
      setSentryUser(state.user?.id || "admin");
      identifyUser(state.user?.id || "admin");
    }
  }, [state.accessToken, state.user, state.isLoading]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <VersionCheckInit />
              <LanguageInit />
              <IntegrationsInit />
              <Router />
            </WouterRouter>
            <Toaster />
            <PwaInstallBanner />
            <OnlineStatusBanner />
          </TooltipProvider>
        </QueryClientProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}

export default App;
