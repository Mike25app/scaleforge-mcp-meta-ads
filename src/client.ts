/**
 * Thin HTTP wrapper for the ScaleForge REST API.
 *
 * Reads config from env at module load. We exit fast if SCALEFORGE_API_TOKEN is
 * missing — an MCP stdio server with no token can only return errors, so it's
 * better to fail the process and let the host surface the misconfiguration.
 */

const BASE = process.env.SCALEFORGE_API_URL ?? "https://getscaleforge.com";
const TOKEN = process.env.SCALEFORGE_API_TOKEN;

if (!TOKEN) {
  process.stderr.write(
    "ERROR: SCALEFORGE_API_TOKEN env var is required. Generate one at https://getscaleforge.com/api_keys\n",
  );
  process.exit(1);
}

/**
 * Serialize a flat object of query params into a URL-encoded string.
 * Skips `undefined` / `null` values so callers can pass optional args directly.
 */
export function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export interface ApiCallOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Call the ScaleForge API. Throws on non-2xx with a truncated body preview
 * so callers (tool handlers) surface meaningful errors to the agent.
 */
export async function apiCall<T = unknown>(
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  const { method = "GET", query, body } = options;
  const url = `${BASE}${path}${buildQuery(query)}`;

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ScaleForge API ${res.status} ${res.statusText} on ${method} ${path}: ${text.slice(0, 500)}`,
    );
  }

  // Some endpoints (e.g. DELETE) may return empty bodies.
  const raw = await res.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}
