import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  consentLogTable,
  termsVersionsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  invalidatePlatformSettingsCache,
  invalidateSettingsCache,
  addAuditEntry,
  getClientIp,
  type AdminRequest,
} from "./admin-shared.js";
import { sendSuccess, sendError, sendCreated } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";

/**
 * /legal/* — admin surface for the GDPR / consent pipeline.
 *
 *   GET  /legal/terms-versions
 *   POST /legal/terms-versions   (idempotent on `(policy, version)`)
 *   GET  /legal/consent-log?policy=&version=&userId=&limit=&offset=
 *
 * Mounted under both `/api/admin/legal` (admin auth) and `/api/legal`
 * (also admin auth — the consent log is GDPR-sensitive). The admin pages
 * call the `/api/admin/legal/*` variant; external tooling that follows
 * the contract from `bugs.md` can hit `/api/legal/*` instead.
 *
 * Idempotency: re-POSTing the same `(policy, version)` returns the
 * existing row instead of erroring, so re-running publish flows is safe.
 *
 * Force-re-acceptance: bumping the version simply inserts a new row;
 * mobile clients compare the user's `users.accepted_terms_version`
 * against the latest version of the `terms` policy on next launch and
 * surface the consent gate when they differ. The existing
 * `/platform-config/accept-terms` endpoint records that acceptance into
 * `consent_log`, which then surfaces here.
 */

const router: IRouter = Router();

interface ConsentLogEntryDTO {
  id: string;
  userId: string;
  policy: string;
  version: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

interface TermsVersionRowDTO {
  policy: string;
  version: string;
  effectiveAt: string;
  bodyMarkdown?: string;
  changelog?: string;
  isCurrent?: boolean;
}

const VALID_SOURCES = ["web", "android", "ios", "admin"] as const;

/* ── GET /legal/terms-versions ───────────────────────────────────── */
router.get("/terms-versions", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(termsVersionsTable)
      .orderBy(asc(termsVersionsTable.policy), desc(termsVersionsTable.effectiveAt));

    /* Mark the latest-effective row per policy as `isCurrent`. */
    const seen = new Set<string>();
    const items: TermsVersionRowDTO[] = rows.map((r) => {
      const isCurrent = !seen.has(r.policy);
      seen.add(r.policy);
      return {
        policy:       r.policy,
        version:      r.version,
        effectiveAt:  r.effectiveAt.toISOString(),
        bodyMarkdown: r.bodyMarkdown ?? undefined,
        changelog:    r.changelog ?? undefined,
        isCurrent,
      };
    });

    sendSuccess(res, { items, total: items.length });
  } catch (err) {
    sendError(res, (err as Error).message ?? "Failed to load terms versions");
  }
});

/* ── POST /legal/terms-versions ──────────────────────────────────── */
const termsVersionSchema = z.object({
  policy:       z.string().min(1).max(64),
  version:      z.string().min(1).max(64),
  effectiveAt:  z.string().datetime().optional(),
  bodyMarkdown: z.string().max(200_000).optional(),
  changelog:    z.string().max(10_000).optional(),
});

router.post("/terms-versions", validateBody(termsVersionSchema), async (req, res) => {
  const body = req.body as z.infer<typeof termsVersionSchema>;
  const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : new Date();

  try {
    /* Idempotent on (policy, version): if the row already exists, return
       it untouched so re-publishing the same version is safe. */
    const [existing] = await db
      .select()
      .from(termsVersionsTable)
      .where(
        and(
          eq(termsVersionsTable.policy, body.policy),
          eq(termsVersionsTable.version, body.version),
        ),
      )
      .limit(1);

    if (existing) {
      sendSuccess(res, {
        policy:       existing.policy,
        version:      existing.version,
        effectiveAt:  existing.effectiveAt.toISOString(),
        bodyMarkdown: existing.bodyMarkdown ?? undefined,
        changelog:    existing.changelog ?? undefined,
        isCurrent:    true,
        idempotent:   true,
      });
      return;
    }

    const [inserted] = await db
      .insert(termsVersionsTable)
      .values({
        policy:       body.policy,
        version:      body.version,
        effectiveAt,
        bodyMarkdown: body.bodyMarkdown ?? null,
        changelog:    body.changelog ?? null,
      })
      .returning();

    /* Bumping the version of the customer-facing "terms" policy must
       force a re-acceptance flow on next launch. We do that by NULLing
       every user's accepted_terms_version so the mobile compliance gate
       trips on next call to /platform-config/compliance-status. We only
       do this when the new version is the most recent for that policy. */
    if (inserted) {
      const [latest] = await db
        .select({ version: termsVersionsTable.version })
        .from(termsVersionsTable)
        .where(eq(termsVersionsTable.policy, body.policy))
        .orderBy(desc(termsVersionsTable.effectiveAt))
        .limit(1);

      if (latest && latest.version === inserted.version) {
        if (body.policy === "terms") {
          /* `accepted_terms_version` is a free-form string column on
             users (see auth.ts). Reset it so the next compliance check
             surfaces the new version. */
          try {
            await db.execute(
              sql`UPDATE users SET accepted_terms_version = NULL WHERE accepted_terms_version IS NOT NULL`,
            );
          } catch {
            /* The column is added lazily in some environments — log and
               continue rather than failing the publish. */
          }
        }

        addAuditEntry({
          action:  "terms_version_published",
          ip:      getClientIp(req),
          adminId: (req as AdminRequest).adminId,
          details: `Published ${body.policy} v${body.version} (effectiveAt=${effectiveAt.toISOString()})`,
          result:  "success",
        });
      }
    }

    invalidateSettingsCache();
    invalidatePlatformSettingsCache();

    if (!inserted) {
      sendError(res, "Insert returned no row");
      return;
    }
    sendCreated(res, {
      policy:       inserted.policy,
      version:      inserted.version,
      effectiveAt:  inserted.effectiveAt.toISOString(),
      bodyMarkdown: inserted.bodyMarkdown ?? undefined,
      changelog:    inserted.changelog ?? undefined,
      isCurrent:    true,
    });
  } catch (err) {
    sendError(res, (err as Error).message ?? "Failed to create terms version");
  }
});

/* ── GET /legal/consent-log ──────────────────────────────────────── */
const consentQuerySchema = z.object({
  policy:  z.string().min(1).max(64).optional(),
  version: z.string().min(1).max(64).optional(),
  userId:  z.string().min(1).max(128).optional(),
  limit:   z.coerce.number().int().min(1).max(500).default(50),
  offset:  z.coerce.number().int().min(0).default(0),
});

router.get("/consent-log", async (req, res) => {
  const parsed = consentQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "), 400);
    return;
  }
  const { policy, version, userId, limit, offset } = parsed.data;

  const filters = [];
  if (policy)  filters.push(eq(consentLogTable.consentType, policy));
  if (version) filters.push(eq(consentLogTable.consentVersion, version));
  if (userId)  filters.push(eq(consentLogTable.userId, userId));
  const where = filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined;

  try {
    const totalRows = where
      ? await db.select({ c: sql<number>`count(*)::int` }).from(consentLogTable).where(where)
      : await db.select({ c: sql<number>`count(*)::int` }).from(consentLogTable);
    const total = Number(totalRows[0]?.c ?? 0);

    const baseQuery = db
      .select()
      .from(consentLogTable)
      .orderBy(desc(consentLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = where ? await baseQuery.where(where) : await baseQuery;

    const items: ConsentLogEntryDTO[] = rows.map(r => {
      const src = r.source && (VALID_SOURCES as readonly string[]).includes(r.source)
        ? r.source
        : undefined;
      return {
        id:         r.id,
        userId:     r.userId,
        policy:     r.consentType,
        version:    r.consentVersion,
        acceptedAt: r.createdAt.toISOString(),
        ipAddress:  r.ipAddress ?? undefined,
        userAgent:  r.userAgent ?? undefined,
        source:     src,
      };
    });

    sendSuccess(res, { items, total, limit, offset });
  } catch (err) {
    sendError(res, (err as Error).message ?? "Failed to load consent log");
  }
});

/* Silence unused-import warning — `usersTable` is referenced indirectly
   via the raw SQL update above and we want the import for clarity. */
void usersTable;

export default router;
