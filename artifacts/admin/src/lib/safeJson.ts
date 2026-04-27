/**
 * safeJson — defensive JSON parsing that never throws.
 *
 * Use these wrappers for any JSON.parse / JSON.stringify call where the
 * input is untrusted (network responses, localStorage payloads, query
 * strings, etc.). Failures are logged with a consistent prefix instead of
 * crashing the page.
 */

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[safeJson] parse failed:", err, { snippet: raw.slice(0, 200) });
    return fallback;
  }
}

export function safeJsonStringify(value: unknown, fallback = ""): string {
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.error("[safeJson] stringify failed:", err);
    return fallback;
  }
}

/**
 * Parse a Response body as JSON without throwing.
 * Returns the parsed object, or the provided fallback if the body is
 * empty or invalid.
 */
export async function safeResponseJson<T>(response: Response, fallback: T): Promise<T> {
  try {
    const text = await response.text();
    return safeJsonParse<T>(text, fallback);
  } catch (err) {
    console.error("[safeJson] response read failed:", err);
    return fallback;
  }
}
