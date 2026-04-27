/**
 * adminTiming — single source of truth for admin-side timeouts, polling
 * intervals, and reporter limits. Replaces the literals previously
 * scattered across CommandPalette, PullToRefresh, error-reporter,
 * launch-control, app-management, categories, and login.
 *
 * Each value can be overridden at runtime via `applyAdminTimingOverrides`,
 * which `loadPlatformConfig()` calls when the backend exposes matching
 * `admin_timing_*` settings.
 */

export interface AdminTimingConfig {
  commandPaletteDebounceMs: number;
  pullToRefreshIntervalMs: number;
  errorReporterFlushDelayMs: number;
  errorReporterEnqueueDelayMs: number;
  errorReporterDedupWindowMs: number;
  errorReporterMessageMax: number;
  errorReporterStackMax: number;
  errorReporterMessageKeyMax: number;
  errorReporterRecentMax: number;
  errorReporterQueueMax: number;
  refetchIntervalCategoriesMs: number;
  refetchIntervalLaunchControlMs: number;
  refetchIntervalAppManagementMs: number;
  loginRedirectDelayMs: number;
  layoutErrorPollIntervalMs: number;
}

const DEFAULTS: AdminTimingConfig = {
  commandPaletteDebounceMs: 300,
  pullToRefreshIntervalMs: 15_000,
  errorReporterFlushDelayMs: 1_000,
  errorReporterEnqueueDelayMs: 100,
  errorReporterDedupWindowMs: 30_000,
  errorReporterMessageMax: 5_000,
  errorReporterStackMax: 50_000,
  errorReporterMessageKeyMax: 200,
  errorReporterRecentMax: 100,
  errorReporterQueueMax: 50,
  refetchIntervalCategoriesMs: 30_000,
  refetchIntervalLaunchControlMs: 30_000,
  refetchIntervalAppManagementMs: 30_000,
  loginRedirectDelayMs: 1_500,
  layoutErrorPollIntervalMs: 60_000,
};

let _current: AdminTimingConfig = { ...DEFAULTS };

export function getAdminTiming(): AdminTimingConfig {
  return _current;
}

export function applyAdminTimingOverrides(
  overrides: Partial<Record<keyof AdminTimingConfig, unknown>> | null | undefined,
): void {
  if (!overrides) return;
  const next: AdminTimingConfig = { ..._current };
  for (const key of Object.keys(DEFAULTS) as (keyof AdminTimingConfig)[]) {
    const raw = overrides[key];
    if (raw === undefined || raw === null) continue;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      next[key] = numeric;
    }
  }
  _current = next;
}

export function resetAdminTiming(): void {
  _current = { ...DEFAULTS };
}

export const ADMIN_TIMING_DEFAULTS: Readonly<AdminTimingConfig> = DEFAULTS;
