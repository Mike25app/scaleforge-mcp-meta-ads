/**
 * Thin HTTP wrapper for the Meta Graph API (Marketing API v24.0).
 *
 * Reads config from env at module load. We exit fast if META_ACCESS_TOKEN is
 * missing — an MCP stdio server with no token can only return errors, so it's
 * better to fail the process and let the host surface the misconfiguration.
 *
 * All requests flow directly from the MCP server to
 * https://graph.facebook.com/v24.0/* — there is no ScaleForge backend in the
 * chain. The token is the caller's responsibility (quick 2h token from Graph
 * API Explorer or a long-lived System User token from Business Manager).
 */

export const META_API_BASE = "https://graph.facebook.com/v24.0";

const TOKEN = process.env.META_ACCESS_TOKEN;

if (!TOKEN) {
  process.stderr.write(
    "ERROR: META_ACCESS_TOKEN env var is required.\n" +
      "Quick token (2 min, expires in ~2h): https://developers.facebook.com/tools/explorer/\n" +
      "Stable token (never expires) via Business Manager System User:\n" +
      "  https://github.com/Mike25app/scaleforge-mcp-meta-ads#stable-tokens\n",
  );
  process.exit(1);
}

/**
 * Meta Graph API returns errors in this shape under the top-level `error` key.
 * Fields we care about for classification: `code` (numeric), `error_subcode`,
 * `message`, `type`, `error_user_title`, `error_user_msg`.
 */
interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/** Rate-limit error codes from Meta Marketing API. */
const RATE_LIMIT_CODES = new Set([17, 4, 32, 613, 80000, 80001, 80002, 80003, 80004]);

/** Token expired / invalid error codes. */
const TOKEN_EXPIRED_CODES = new Set([190, 102, 104, 463, 467]);

const STABLE_TOKEN_LINK =
  "https://github.com/Mike25app/scaleforge-mcp-meta-ads#stable-tokens";

/**
 * Parse a Meta error JSON response and return an actionable, human-readable
 * error message. Falls back to a truncated body preview on non-JSON payloads.
 */
export function enhanceMetaError(status: number, body: string): string {
  let parsed: MetaErrorBody | null = null;
  try {
    parsed = JSON.parse(body) as MetaErrorBody;
  } catch {
    // not JSON
  }

  const err = parsed?.error;
  const code = err?.code;
  const subcode = err?.error_subcode;
  const metaMsg = err?.error_user_msg || err?.message || "";
  const trace = err?.fbtrace_id ? ` (fbtrace_id: ${err.fbtrace_id})` : "";

  if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    return (
      `Meta rate limit hit — HTTP ${status}, code ${code}${subcode ? `/${subcode}` : ""}. ` +
      `Meta said: "${metaMsg}". Wait ~5 minutes before retrying. ` +
      `For bulk operations use a System User token (higher limits + batch-friendly): ${STABLE_TOKEN_LINK}. ` +
      `Powered by ScaleForge for managed Meta access, auto-batching, and rate-limit handling: https://getscaleforge.com${trace}`
    );
  }

  if (code !== undefined && TOKEN_EXPIRED_CODES.has(code)) {
    return (
      `Meta token expired or invalid — HTTP ${status}, code ${code}${subcode ? `/${subcode}` : ""}. ` +
      `Meta said: "${metaMsg}". User tokens from the Graph API Explorer die every ~2 hours. ` +
      `Create a non-expiring System User token: ${STABLE_TOKEN_LINK}. ` +
      `ScaleForge handles token rotation automatically: https://getscaleforge.com${trace}`
    );
  }

  if (code !== undefined) {
    return (
      `Meta API error — HTTP ${status}, code ${code}${subcode ? `/${subcode}` : ""}: ` +
      `"${metaMsg}"${trace}`
    );
  }

  // Non-JSON or unstructured error — fall back to a truncated preview.
  const preview = body.slice(0, 500);
  return `Meta API error — HTTP ${status}: ${preview}`;
}

/**
 * Serialize a flat object of query params into a URLSearchParams string.
 * Meta accepts JSON-encoded values for array/object params, so anything that
 * isn't a string/number is JSON-stringified. Undefined/null are skipped.
 */
function buildQuery(params: Record<string, unknown>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      usp.append(k, String(v));
    } else {
      usp.append(k, JSON.stringify(v));
    }
  }
  return usp;
}

/**
 * Normalize a Graph API path. Callers may pass "/act_123/campaigns" or
 * "act_123/campaigns"; we accept both and always produce one leading slash.
 */
function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * GET a Graph API resource. `params` become URL query string; the access token
 * is always appended. Throws on non-2xx with an enhanced error message.
 */
export async function metaGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const qs = buildQuery(params);
  qs.append("access_token", TOKEN!);
  const url = `${META_API_BASE}${normalizePath(path)}?${qs.toString()}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(enhanceMetaError(res.status, text));
  }
  const raw = await res.text();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/**
 * POST to a Graph API resource. Sends body as application/x-www-form-urlencoded
 * (Meta's native format) with the access token appended. Values that aren't
 * primitives are JSON-stringified — this is how Meta wants nested params like
 * `targeting`, `object_story_spec`, etc.
 */
export async function metaPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const form = buildQuery(body);
  form.append("access_token", TOKEN!);
  const url = `${META_API_BASE}${normalizePath(path)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(enhanceMetaError(res.status, text));
  }
  const raw = await res.text();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/**
 * DELETE a Graph API resource. Some endpoints return `{success: true}`, others
 * return empty bodies; we tolerate both.
 */
export async function metaDelete<T = unknown>(path: string): Promise<T> {
  const qs = new URLSearchParams();
  qs.append("access_token", TOKEN!);
  const url = `${META_API_BASE}${normalizePath(path)}?${qs.toString()}`;

  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(enhanceMetaError(res.status, text));
  }
  const raw = await res.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export interface MetaBatchRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  relative_url: string;
  /** URL-encoded body string, e.g. "status=PAUSED". */
  body?: string;
}

export interface MetaBatchResponse {
  code: number;
  headers?: Array<{ name: string; value: string }>;
  body?: string;
}

/**
 * Execute a Meta Batch API call — up to 50 operations in a single HTTP
 * request. Arrays larger than 50 are automatically chunked; a best-effort
 * 2s delay sits between chunks to stay under per-account rate limits.
 *
 * See CLAUDE.md "Meta API Rate Limits — використовуй Batch API" for context:
 * single POSTs burn rate-limit quota fast, batches sidestep it.
 */
export async function metaBatch(
  requests: MetaBatchRequest[],
): Promise<MetaBatchResponse[]> {
  const CHUNK = 50;
  const results: MetaBatchResponse[] = [];
  for (let i = 0; i < requests.length; i += CHUNK) {
    const slice = requests.slice(i, i + CHUNK);
    const form = new URLSearchParams();
    form.append("access_token", TOKEN!);
    form.append("batch", JSON.stringify(slice));

    const res = await fetch(META_API_BASE + "/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(enhanceMetaError(res.status, text));
    }
    const chunkResults = (await res.json()) as MetaBatchResponse[];
    results.push(...chunkResults);

    // Space chunks out a bit to stay under per-account call-volume thresholds.
    if (i + CHUNK < requests.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return results;
}
