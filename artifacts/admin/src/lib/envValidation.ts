/**
 * envValidation — startup audit of the small number of `import.meta.env`
 * values the admin assumes exist. Logs (does not throw) so a missing
 * value falls back to its default but is observable in the browser
 * console. Called once from App.tsx on mount.
 */

interface EnvAuditResult {
  baseUrl: string;
  warnings: string[];
}

export function auditAdminEnv(): EnvAuditResult {
  const warnings: string[] = [];
  const env = import.meta.env;

  const baseUrl =
    typeof env.BASE_URL === "string" && env.BASE_URL.length > 0
      ? env.BASE_URL
      : "/";

  if (!env.BASE_URL) {
    warnings.push("import.meta.env.BASE_URL is missing — defaulting to '/'");
  } else if (typeof env.BASE_URL !== "string") {
    warnings.push(
      `import.meta.env.BASE_URL has unexpected type ${typeof env.BASE_URL} — defaulting to '/'`,
    );
  }

  if (typeof env.MODE !== "string") {
    warnings.push("import.meta.env.MODE missing or non-string");
  }
  if (typeof env.DEV !== "boolean" && env.DEV !== undefined) {
    warnings.push("import.meta.env.DEV has unexpected type — expected boolean");
  }

  for (const w of warnings) console.warn(`[envValidation] ${w}`);
  return { baseUrl, warnings };
}
