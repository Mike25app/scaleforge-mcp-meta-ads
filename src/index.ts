#!/usr/bin/env node
/**
 * ScaleForge MCP Server — stdio entrypoint.
 *
 * Exposes ScaleForge's REST API as MCP tools so any MCP-compatible agent
 * (Claude Desktop, Claude Code, Cursor, ChatGPT Desktop, etc.) can list ad
 * accounts, inspect campaigns, pause/activate campaigns, check ads volume,
 * pull analytics, monitor bulk uploads, and watch competitor ads.
 *
 * Uses the modern @modelcontextprotocol/sdk 1.x McpServer.registerTool() API,
 * which accepts Zod raw shapes directly and converts them to JSON Schema
 * for the tools/list wire format.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { accountTools } from "./tools/accounts.js";
import { campaignTools } from "./tools/campaigns.js";
import { analyticsTools } from "./tools/analytics.js";
import { uploadTools } from "./tools/uploads.js";
import { watchlistTools } from "./tools/watchlist.js";
import type { ToolDef } from "./tools/types.js";

const allTools: ToolDef[] = [
  ...accountTools,
  ...campaignTools,
  ...analyticsTools,
  ...uploadTools,
  ...watchlistTools,
];

const server = new McpServer(
  { name: "scaleforge", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

for (const tool of allTools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    // The SDK's ToolCallback type infers the arg shape from inputSchema, but
    // our shared ToolDef uses a generic Record<string, unknown> signature for
    // portability. The cast here is intentional and isolated to the bridge.
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[scaleforge-mcp] Ready. ${allTools.length} tools registered.\n`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[scaleforge-mcp] Fatal: ${message}\n`);
  process.exit(1);
});
