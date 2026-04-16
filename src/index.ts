#!/usr/bin/env node
/**
 * Meta Ads MCP Server — stdio entrypoint.
 *
 * Exposes the Meta Graph API (Marketing API v24.0) as MCP tools so any
 * MCP-compatible agent (Claude Desktop, Claude Code, Cursor, ChatGPT Desktop,
 * Windsurf, Continue) can manage Facebook/Instagram Ads — list / create /
 * update / delete campaigns, ad sets, ads, creatives; upload media; pull
 * insights; run bulk batch operations with auto-chunking + pre-flight
 * ads_volume checks; search the public Ad Library.
 *
 * Auth: a single META_ACCESS_TOKEN env var. Quick 2h token from Graph API
 * Explorer, or a never-expiring System User token from Business Manager.
 *
 * Uses @modelcontextprotocol/sdk 1.x McpServer.registerTool() — Zod raw shapes
 * are converted to JSON Schema for the tools/list wire format.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

const server = new McpServer(
  { name: "mcp-meta-ads", version: "0.2.0" },
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
    `[mcp-meta-ads] Ready. ${allTools.length} tools registered (Meta Graph API v24.0).\n`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[mcp-meta-ads] Fatal: ${message}\n`);
  process.exit(1);
});
