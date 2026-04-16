import { z } from "zod";
import { apiCall } from "../client.js";
import type { ToolDef } from "./types.js";

export const accountTools: ToolDef[] = [
  {
    name: "list_ad_accounts",
    description:
      "List the Meta Ad Accounts owned by the authenticated ScaleForge user. " +
      "Returns only visible accounts, ordered by position then name. Each item " +
      "includes id (ScaleForge), meta_account_id (act_XXX), page_id, pixel_id, " +
      "connection status, and rate-limit usage. Paginated via page / per_page.",
    inputSchema: {
      page: z.number().int().positive().optional().describe("Page number, defaults to 1"),
      per_page: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Items per page (max 100), defaults to 25"),
    },
    handler: async (args) =>
      apiCall("/api/v1/ad_accounts", {
        query: { page: args.page, per_page: args.per_page },
      }),
  },

  {
    name: "get_ads_volume",
    description:
      "Get Meta Page ads volume for a ScaleForge Ad Account — shows active_ads_count, " +
      "ads_limit (default 250), and remaining capacity on the associated Page. " +
      "Use this BEFORE launching a new batch of creatives to avoid hitting Meta's " +
      "per-Page limit (which is shared across all accounts using the same Page).",
    inputSchema: {
      id: z
        .number()
        .int()
        .positive()
        .describe("ScaleForge AdAccount ID (integer, not the Meta act_XXX string)"),
    },
    handler: async (args) => apiCall(`/api/v1/ad_accounts/${args.id}/ads_volume`),
  },
];
