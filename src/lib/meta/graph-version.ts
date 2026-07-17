/**
 * Single source of truth for Meta Graph API version.
 * Reads META_GRAPH_API_VERSION (secret already configured); fallback v21.0.
 * All server code that talks to Graph MUST import this — no hardcoded strings.
 */
export const GRAPH_VERSION: string =
  (typeof process !== "undefined" && process.env?.META_GRAPH_API_VERSION) ||
  "v21.0";

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Resolve the version to use for a specific connection row (falls back to global). */
export function resolveGraphVersion(connectionVersion?: string | null): string {
  const v = (connectionVersion || "").trim();
  return v || GRAPH_VERSION;
}
