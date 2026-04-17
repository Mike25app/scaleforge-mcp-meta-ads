#!/usr/bin/env node
/**
 * Meta Ads MCP Server — HTTP Streamable entry point.
 *
 * For Smithery Gateway / Docker deployment behind getscaleforge.com/mcp.
 * Mirrors the stdio index.ts tool set but accepts per-request Meta tokens
 * via ?config=<base64(JSON)> query (Smithery standard), Authorization: Bearer
 * header, or env var (local dev).
 *
 * Stateless mode — new server + transport instance per request so concurrent
 * callers never share context (including each other's token via AsyncLocalStorage).
 */
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { runWithToken } from "./helpers/session.js";
import { accountTools } from "./tools/accounts.js";
import { campaignTools } from "./tools/campaigns.js";
import { adsetTools } from "./tools/adsets.js";
import { adTools } from "./tools/ads.js";
import { creativeTools } from "./tools/creatives.js";
import { mediaTools } from "./tools/media.js";
import { insightsTools } from "./tools/insights.js";
import { bulkTools } from "./tools/bulk.js";
import { pageTools } from "./tools/pages.js";
import { adsLibraryTools } from "./tools/adslibrary.js";
import type { ToolDef } from "./tools/types.js";

const allTools: ToolDef[] = [
  ...accountTools,
  ...campaignTools,
  ...adsetTools,
  ...adTools,
  ...creativeTools,
  ...mediaTools,
  ...insightsTools,
  ...bulkTools,
  ...pageTools,
  ...adsLibraryTools,
];

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "mcp-meta-ads", version: "0.3.0" },
    { capabilities: { tools: {} } },
  );
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: unknown) => {
        try {
          const result = await tool.handler(args as Record<string, unknown>);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}

/**
 * Resolve the caller's Meta Access Token. Priority:
 *   1. ?metaAccessToken=<token> query — Smithery Gateway default (plain query)
 *   2. ?config=<base64(JSON)> query — Smithery Gateway legacy / other clients
 *   3. Authorization: Bearer <token> — direct MCP clients / MCP Inspector
 *   4. META_ACCESS_TOKEN env — local dev
 * Returns undefined if none present; client.ts will surface the error
 * back through the MCP protocol only when a tool actually needs the token
 * (tools/list and initialize work without one so Smithery can scan).
 */
function extractToken(url: URL, headers: http.IncomingHttpHeaders): string | undefined {
  const directParam = url.searchParams.get("metaAccessToken");
  if (directParam) return directParam;

  const configParam = url.searchParams.get("config");
  if (configParam) {
    try {
      const decoded = Buffer.from(configParam, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as { metaAccessToken?: string };
      if (typeof parsed.metaAccessToken === "string" && parsed.metaAccessToken) {
        return parsed.metaAccessToken;
      }
    } catch {
      // Bad base64 or JSON — fall through to next source
    }
  }

  const authHeader = headers["authorization"];
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  return process.env.META_ACCESS_TOKEN || undefined;
}

const PORT = Number(process.env.PORT ?? 4000);

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  try {
    if (path === "/mcp/health" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: allTools.length }));
      return;
    }

    // Static server card so Smithery Gateway picks up our configSchema
    // (Meta access token prompt) without needing it re-entered on every publish.
    // See https://smithery.ai/docs/build/publish#server-scanning
    if (path === "/mcp/.well-known/mcp/server-card.json" && method === "GET") {
      const card = {
        serverInfo: { name: "mcp-meta-ads", version: "0.3.0" },
        authentication: { required: true, schemes: ["bearer"] },
        configSchema: {
          type: "object",
          required: ["metaAccessToken"],
          properties: {
            metaAccessToken: {
              type: "string",
              title: "Meta Access Token",
              description:
                "Meta Marketing API token. Graph API Explorer (2h) or System User (stable).",
              "x-from": { query: "metaAccessToken" },
            },
          },
        },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(card));
      return;
    }

    if (path === "/mcp" && (method === "POST" || method === "GET" || method === "DELETE")) {
      const token = extractToken(url, req.headers);
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      await server.connect(transport);

      const handle = () => transport.handleRequest(req, res);
      if (token) {
        await runWithToken(token, handle);
      } else {
        await handle();
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp-meta-ads http] ${method} ${path} error: ${message}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  }
});

httpServer.listen(PORT, () => {
  process.stdout.write(
    `[mcp-meta-ads http] Listening on :${PORT} — ${allTools.length} tools, stateless.\n`,
  );
});

function shutdown(signal: string): void {
  process.stdout.write(`[mcp-meta-ads http] ${signal} received, closing.\n`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
