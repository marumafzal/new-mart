/**
 * sanitizeMarkerHtml — defense-in-depth allowlist sanitizer for the small
 * static HTML snippets used by `UniversalMap`'s marker icons.
 *
 * The marker `iconHtml` strings are constructed by the admin app itself
 * (e.g. `<div style="background:#3b82f6;border-radius:50%">👤</div>`),
 * so no user input flows through them. This sanitizer enforces that
 * contract at runtime: anything outside the allowlist is stripped.
 *
 * Specifically:
 *   - Only the listed tags are kept; all others are dropped (children
 *     promoted up the tree).
 *   - Only the listed attributes survive, and `style` / `href` values
 *     are scanned for `javascript:` and CSS `expression(...)` payloads.
 *   - Event-handler attributes (`onclick`, `onerror`, ...) are always
 *     stripped — even if a future caller accidentally builds them.
 *
 * Returns the sanitized HTML as a string suitable for
 * `dangerouslySetInnerHTML` or Leaflet `divIcon({ html })`.
 */

const ALLOWED_TAGS = new Set([
  "div", "span", "img",
  "svg", "g", "circle", "rect", "path", "line", "polyline",
  "polygon", "ellipse", "text", "tspan", "title", "defs",
]);

const ALLOWED_ATTRS = new Set([
  "style", "class",
  "width", "height", "viewbox",
  "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform",
  "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-opacity",
  "opacity",
  "src", "alt",
  "xmlns", "preserveaspectratio",
  "font-size", "font-family", "font-weight", "text-anchor", "dy",
]);

const UNSAFE_VALUE = /(javascript:|vbscript:|data:text\/html|expression\s*\()/i;

function stripUnsafeValue(value: string): string | null {
  if (UNSAFE_VALUE.test(value)) return null;
  return value;
}

function sanitizeNode(node: Element): void {
  // Walk children first so we can safely promote/remove without
  // breaking the iteration.
  Array.from(node.children).forEach(sanitizeNode);

  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Promote children, then remove the node. This preserves any safe
    // sub-content while dropping the disallowed wrapper.
    const parent = node.parentNode;
    if (parent) {
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
    return;
  }

  // Strip any attribute that isn't in the allowlist or that contains
  // an unsafe value.
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      node.removeAttribute(attr.name);
      continue;
    }
    if (!ALLOWED_ATTRS.has(name)) {
      node.removeAttribute(attr.name);
      continue;
    }
    const safe = stripUnsafeValue(attr.value);
    if (safe === null) {
      node.removeAttribute(attr.name);
    }
  }
}

export function sanitizeMarkerHtml(raw: string): string {
  if (!raw) return "";
  if (typeof DOMParser === "undefined") {
    // SSR / non-browser fallback: treat the input as plain text.
    return raw.replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch] as string));
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";
    sanitizeNode(root);
    return root.innerHTML;
  } catch (err) {
    console.error("[sanitizeMarkerHtml] parse failed, dropping payload:", err);
    return "";
  }
}
