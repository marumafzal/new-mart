/**
 * Single source of truth for the admin sidebar navigation.
 *
 * Extracted from `components/layout/AdminLayout.tsx` so it can be reused
 * by the command palette, breadcrumb generator, the in-sidebar search
 * filter, and any new "favorites/pinned" UI without having to import the
 * heavy layout file.
 *
 * Each `NavGroup` has:
 *   - `key`              — stable string id used for persistence (collapsed
 *                          state, pinned ordering). Independent from i18n.
 *   - `labelKey`         — TranslationKey for the group header.
 *   - `color`            — accent colour for the active-state pill +
 *                          group dot.
 *   - `items`            — array of { nameKey, href, icon, optional badges }.
 *
 * Adding a new route? Add it here and it will appear in the sidebar AND in
 * any consumer (command palette item index, breadcrumbs, favorites star
 * picker) automatically.
 */

import type React from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Car,
  Pill,
  PackageSearch,
  Receipt,
  Settings2,
  Zap,
  Store,
  Ticket,
  BellRing,
  Shield,
  Navigation,
  AlertTriangle,
  BadgeCheck,
  Layers,
  Wallet,
  CreditCard,
  FileText,
  Lock,
  ToggleLeft,
  Bus,
  Truck,
  Megaphone,
  MessageCircle,
  HelpCircle,
  BarChart2,
  Bug,
  Radio,
  Star,
  Heart,
  QrCode,
  FlaskConical,
  Webhook,
  Link2,
  Rocket,
  KeyRound,
  Server,
  Menu,
  ClipboardList,
} from "lucide-react";
import type { TranslationKey } from "@workspace/i18n";

export type NavItem = {
  /** Translation key for the visible label. */
  nameKey: TranslationKey;
  /** Wouter route. */
  href: string;
  /** Lucide icon component. */
  icon: React.ElementType;
  /** Show pulsing red dot when active SOS alerts exist. */
  sosBadge?: boolean;
  /** Show amber dot when there are uncleared error reports. */
  errorBadge?: boolean;
  /**
   * RBAC permission(s) gating this item; super always sees everything.
   * Layout reads this lazily — kept here so a permission audit can be
   * generated from one file.
   */
  requirePermission?: string | string[];
};

export type NavGroup = {
  /** Stable id for persistence and lookups (NOT translated). */
  key: string;
  labelKey: TranslationKey;
  /** Hex accent colour for active-state pill + group dot. */
  color: string;
  items: NavItem[];
};

/**
 * Seven logical groups — System, Finance, Fleet & Logistics, Marketing,
 * Customer Support, Analytics, Integrations. Order is the rendered order.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "system",
    labelKey: "navSystem" as TranslationKey,
    color: "#6366F1",
    items: [
      { nameKey: "navDashboard",                          href: "/dashboard",          icon: LayoutDashboard },
      { nameKey: "navUserPermissions",                    href: "/users",              icon: Lock },
      { nameKey: "navRolesPermissions" as TranslationKey, href: "/roles-permissions",  icon: Shield },
      { nameKey: "navSettings",                            href: "/settings",           icon: Settings2 },
      { nameKey: "navFeatureToggles",                      href: "/app-management",     icon: ToggleLeft },
      { nameKey: "navLaunchControl" as TranslationKey,    href: "/launch-control",     icon: Rocket },
      { nameKey: "navAuthMethods" as TranslationKey,      href: "/auth-methods",       icon: KeyRound },
      { nameKey: "navOtpControl" as TranslationKey,       href: "/otp-control",        icon: KeyRound },
      { nameKey: "navSmsGateways" as TranslationKey,      href: "/sms-gateways",       icon: Server },
      { nameKey: "navConditionsHub",                       href: "/account-conditions", icon: Shield },
      { nameKey: "navConditionRules",                      href: "/condition-rules",    icon: Settings2 },
      { nameKey: "navActionLog" as TranslationKey,         href: "/audit-logs",         icon: ClipboardList },
    ],
  },
  {
    key: "finance",
    labelKey: "navFinance" as TranslationKey,
    color: "#22C55E",
    items: [
      { nameKey: "navOrders",                                href: "/orders",            icon: ShoppingBag },
      { nameKey: "navTransactions",                          href: "/transactions",      icon: Receipt },
      { nameKey: "navRevenueAnalytics" as TranslationKey,   href: "/revenue-analytics", icon: BarChart2 },
      { nameKey: "navWithdrawals",                            href: "/withdrawals",        icon: Wallet },
      { nameKey: "navDepositRequests",                       href: "/deposit-requests",  icon: CreditCard },
      { nameKey: "navWalletTransfers" as TranslationKey,    href: "/wallet-transfers",  icon: Wallet },
      { nameKey: "navLoyaltyPoints" as TranslationKey,      href: "/loyalty",           icon: Star },
      { nameKey: "navKyc",                                    href: "/kyc",                icon: BadgeCheck },
      { nameKey: "navVendors",                                href: "/vendors",            icon: Store },
      { nameKey: "navProducts",                              href: "/products",          icon: PackageSearch },
      { nameKey: "navPromotionsHub",                          href: "/promotions",        icon: Megaphone },
    ],
  },
  {
    key: "fleet",
    labelKey: "navFleet" as TranslationKey,
    color: "#EF4444",
    items: [
      { nameKey: "navRides",          href: "/rides",            icon: Car },
      { nameKey: "navVanService",     href: "/van",              icon: Bus },
      { nameKey: "navPharmacy",       href: "/pharmacy",         icon: Pill },
      { nameKey: "navLiveRidersMap",  href: "/live-riders-map",  icon: Navigation },
      { nameKey: "navSosAlerts",       href: "/sos-alerts",       icon: AlertTriangle, sosBadge: true },
      { nameKey: "navErrorMonitor",    href: "/error-monitor",    icon: Bug,           errorBadge: true },
      { nameKey: "navAuditLogs",       href: "/security",         icon: FileText },
      { nameKey: "navDeliveryAccess",  href: "/delivery-access",  icon: Truck },
    ],
  },
  {
    key: "marketing",
    labelKey: "navMarketing",
    color: "#EC4899",
    items: [
      { nameKey: "navOffersCoupons" as TranslationKey,      href: "/promotions",                 icon: Ticket },
      { nameKey: "navFlashDeals",                            href: "/flash-deals",                icon: Zap },
      { nameKey: "navBanners",                               href: "/banners",                    icon: Layers },
      { nameKey: "navPopups",                                href: "/popups",                     icon: Megaphone },
      { nameKey: "navCampaignsCalendar" as TranslationKey,  href: "/promotions?tab=campaigns",   icon: BellRing },
    ],
  },
  {
    key: "support",
    labelKey: "navCustomerSupport",
    color: "#06B6D4",
    items: [
      { nameKey: "navInboxChatModeration" as TranslationKey, href: "/support-chat",   icon: MessageCircle },
      { nameKey: "navFaqMgmt",                                href: "/faq-management", icon: HelpCircle },
      { nameKey: "navSendBroadcast" as TranslationKey,        href: "/broadcast",      icon: Radio },
      { nameKey: "navNotificationsLog" as TranslationKey,     href: "/notifications",  icon: BellRing },
    ],
  },
  {
    key: "analytics",
    labelKey: "navAnalytics" as TranslationKey,
    color: "#F472B6",
    items: [
      { nameKey: "navSearchAnalytics",                      href: "/search-analytics",  icon: BarChart2 },
      { nameKey: "navMessagingKpis" as TranslationKey,     href: "/communication",     icon: MessageCircle },
      { nameKey: "navWishlistInsights" as TranslationKey,  href: "/wishlist-insights", icon: Heart },
      { nameKey: "navQrCodes" as TranslationKey,           href: "/qr-codes",          icon: QrCode },
      { nameKey: "navExperiments" as TranslationKey,        href: "/experiments",       icon: FlaskConical },
    ],
  },
  {
    key: "integrations",
    labelKey: "navIntegrations" as TranslationKey,
    color: "#10B981",
    items: [
      { nameKey: "navWebhooks" as TranslationKey,  href: "/webhooks",   icon: Webhook },
      { nameKey: "navDeepLinks" as TranslationKey, href: "/deep-links", icon: Link2 },
    ],
  },
];

/** Flat list of every nav item — used by command palette & breadcrumbs. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(g => g.items);

/**
 * One-line descriptions for each nav route. Surfaced as tooltips when the
 * sidebar is collapsed to icons-only mode (desktop), and as the secondary
 * line in the in-sidebar search dropdown.
 */
export const NAV_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "/dashboard":            "Overview KPIs and live activity",
  "/users":                "Customers, admins and roles",
  "/roles-permissions":   "Admin RBAC matrix and role assignment",
  "/settings":             "Single source of truth for platform settings",
  "/app-management":       "Service status overview, admin accounts and audit log",
  "/launch-control":       "Pre-launch readiness checklist",
  "/auth-methods":         "Per-role login methods (Phone, Email, OAuth, 2FA, Biometric)",
  "/otp-control":          "OTP delivery providers and policies",
  "/sms-gateways":         "SMS provider routing and credits",
  "/account-conditions":   "Apply or lift restrictions on accounts",
  "/condition-rules":      "Default rules per condition type",
  "/orders":                "All marketplace orders and refunds",
  "/transactions":         "Wallet, payouts and ledger entries",
  "/revenue-analytics":    "Monthly revenue breakdown, category totals, and top vendors",
  "/withdrawals":           "Vendor and rider withdrawal requests",
  "/deposit-requests":     "Customer top-ups awaiting approval",
  "/wallet-transfers":     "Internal wallet movements",
  "/loyalty":              "Loyalty point ledger and rules",
  "/kyc":                  "KYC submissions and verification",
  "/vendors":              "Stores, catalogues and payouts",
  "/products":             "Global catalogue and curation",
  "/promotions":            "Offers, coupons and campaigns",
  "/flash-deals":          "Time-bound flash deal calendar",
  "/banners":              "Home and category banner slots",
  "/popups":               "In-app popup campaigns",
  "/rides":                 "Ride bookings and disputes",
  "/van":                  "Van service requests",
  "/pharmacy":              "Pharmacy orders and pre-orders",
  "/live-riders-map":      "Real-time rider positions",
  "/sos-alerts":            "Active safety alerts",
  "/error-monitor":         "Client and server error stream",
  "/security":              "Audit log of admin actions",
  "/audit-logs":            "Paginated log of all admin actions with filters",
  "/delivery-access":      "Pilot whitelist and access requests",
  "/support-chat":          "Inbox plus chat moderation",
  "/faq-management":        "Help centre and FAQ articles",
  "/broadcast":             "Send notifications to segments",
  "/notifications":         "Outbound notifications log",
  "/communication":         "Messaging KPIs and dashboards",
  "/search-analytics":      "Search queries and zero-result terms",
  "/wishlist-insights":     "Most-wished products and trends",
  "/qr-codes":              "Branded QR codes and campaigns",
  "/experiments":           "A/B tests and rollouts",
  "/webhooks":              "Outgoing webhook endpoints",
  "/deep-links":            "Deep link generator and analytics",
};

/**
 * Bottom-nav (mobile) — fixed 4 items + a "More" trigger that opens the
 * sidebar drawer. Kept stable for muscle memory.
 *
 * The "More" entry uses `href: "__more__"` as a sentinel — the layout
 * detects this and opens the mobile drawer instead of routing.
 */
export const BOTTOM_NAV: readonly {
  nameKey: TranslationKey;
  href: string;
  icon: React.ElementType;
  isSos?: boolean;
}[] = [
  { nameKey: "navDashboard", href: "/dashboard",  icon: LayoutDashboard },
  { nameKey: "navOrders",    href: "/orders",     icon: ShoppingBag },
  { nameKey: "navRides",     href: "/rides",      icon: Car },
  { nameKey: "navSosAlerts", href: "/sos-alerts", icon: AlertTriangle, isSos: true },
  { nameKey: "navMore",      href: "__more__",    icon: Menu },
];

/** Wouter active-route helper — matches /dashboard for both `/` and `/dashboard`. */
export function isActivePath(location: string, href: string): boolean {
  if (href === "/dashboard") return location === "/dashboard" || location === "/";
  // Strip query params from the configured href before comparing — `/promotions?tab=campaigns`
  // should still consider `/promotions` the active root.
  const root = href.split("?")[0]!;
  return location.startsWith(root);
}

/**
 * Pinned-favorites: persisted as a comma-separated list of hrefs in
 * localStorage. Order is preserved as the user drags / re-pins.
 */
export const FAVORITES_STORAGE_KEY = "ajkmart_sidebar_favorites";

export function readFavorites(safeLocalGet: (k: string) => string | null): string[] {
  const raw = safeLocalGet(FAVORITES_STORAGE_KEY);
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export function writeFavorites(
  safeLocalSet: (k: string, v: string) => unknown,
  favorites: string[],
): void {
  // Failures are surfaced by safeLocalSet itself; we always update
  // in-memory state separately so the click is never ignored.
  safeLocalSet(FAVORITES_STORAGE_KEY, favorites.join(","));
}
