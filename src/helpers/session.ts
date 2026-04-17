/**
 * Per-request Meta token storage using Node's AsyncLocalStorage.
 *
 * Stdio mode uses `process.env.META_ACCESS_TOKEN` directly via client.ts
 * fallback; HTTP mode wraps each request in `runWithToken(token, handler)`
 * so tool handlers can read the current token via `getMetaToken()` without
 * threading it through every call-site.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface SessionContext {
  token: string;
}

const tokenStorage = new AsyncLocalStorage<SessionContext>();

export function runWithToken<T>(token: string, fn: () => T): T {
  return tokenStorage.run({ token }, fn);
}

export function getMetaToken(): string | undefined {
  return tokenStorage.getStore()?.token;
}
