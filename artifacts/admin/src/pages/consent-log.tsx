import { FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared";
import { fetcher } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import type {
  ConsentLogEntry,
  TermsVersionRow,
  ApiPaginated,
} from "@/lib/adminApiTypes";

/**
 * Consent Log & Terms Versions — admin surface for the GDPR / consent
 * pipeline.
 *
 * Backend contract (documented in `bugs.md` → "Missing Privacy
 * Notification" / "Missing Privacy Settings"):
 *
 *   GET /api/legal/terms-versions
 *     → { items: TermsVersionRow[], total: number }
 *     Returns every version of every policy slug. The "current"
 *     version is the row with the latest `effectiveAt` timestamp
 *     (`isCurrent: true` set by the backend).
 *
 *   GET /api/legal/consent-log?policy=&version=&userId=&limit=&offset=
 *     → { items: ConsentLogEntry[], total: number }
 *     Paginated audit trail of every accept event. The backend MUST
 *     persist `acceptedAt`, `policy`, `version`, `userId`, IP, and UA.
 *
 *   POST /api/legal/terms-versions
 *     Body: { policy, version, effectiveAt, bodyMarkdown, changelog }
 *     Idempotent on (policy, version). Bumping the version forces a
 *     re-acceptance flow on the mobile clients on next launch.
 *
 * The page renders gracefully when these endpoints aren't yet
 * implemented — react-query surfaces an error and the
 * `<ErrorState>` directs the admin back to the engineering follow-up.
 */
export default function ConsentLogPage() {
  const versions = useQuery<ApiPaginated<TermsVersionRow>>({
    queryKey: ["legal", "terms-versions"],
    queryFn: () => fetcher("/legal/terms-versions") as Promise<ApiPaginated<TermsVersionRow>>,
    retry: false,
  });

  const log = useQuery<ApiPaginated<ConsentLogEntry>>({
    queryKey: ["legal", "consent-log"],
    queryFn: () => fetcher("/legal/consent-log?limit=50") as Promise<ApiPaginated<ConsentLogEntry>>,
    retry: false,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={FileText}
        title="Consent & Terms Versions"
        subtitle="GDPR / privacy audit trail. Bumping a version forces every user to re-accept on next app launch."
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
      />

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Current Terms Versions</h2>
        {versions.isLoading && <LoadingState label="Loading versions…" variant="card" />}
        {versions.isError && (
          <ErrorState
            title="Could not load terms versions"
            error={versions.error as Error}
            onRetry={() => versions.refetch()}
            variant="inline"
          />
        )}
        {versions.data && (
          <div className="space-y-2">
            {versions.data.items.length === 0 && (
              <p className="text-sm text-gray-500">No terms versions recorded yet.</p>
            )}
            {versions.data.items.map(v => (
              <div
                key={`${v.policy}:${v.version}`}
                className="flex items-center justify-between p-3 rounded-lg border bg-white"
              >
                <div>
                  <div className="font-medium text-sm">{v.policy}</div>
                  <div className="text-xs text-gray-500">
                    v{v.version} · effective {new Date(v.effectiveAt).toLocaleDateString()}
                  </div>
                </div>
                {v.isCurrent && <Badge variant="default">Current</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Consent Log (last 50)</h2>
        {log.isLoading && <LoadingState label="Loading consent log…" variant="card" />}
        {log.isError && (
          <ErrorState
            title="Could not load consent log"
            error={log.error as Error}
            onRetry={() => log.refetch()}
            variant="inline"
          />
        )}
        {log.data && (
          <>
            {/* Mobile card list */}
            <section className="md:hidden space-y-2 mb-2" aria-label="Consent log">
              {log.data.items.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No consent events recorded yet.</p>
              ) : log.data.items.map(entry => (
                <div key={entry.id} className="rounded-xl border border-border/50 p-3 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-medium truncate">{entry.userId}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(entry.acceptedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{entry.policy}</span>
                    <span className="text-muted-foreground">v{entry.version}</span>
                    {entry.source && <span className="text-muted-foreground">· {entry.source}</span>}
                  </div>
                  {entry.ipAddress && <span className="font-mono text-muted-foreground">{entry.ipAddress}</span>}
                </div>
              ))}
            </section>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Policy</th>
                    <th className="py-2 pr-3">Version</th>
                    <th className="py-2 pr-3">Accepted</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-gray-500">No consent events recorded yet.</td>
                    </tr>
                  )}
                  {log.data.items.map(entry => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{entry.userId}</td>
                      <td className="py-2 pr-3">{entry.policy}</td>
                      <td className="py-2 pr-3">{entry.version}</td>
                      <td className="py-2 pr-3 text-xs">{new Date(entry.acceptedAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs">{entry.source ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{entry.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
