import { z } from "zod";
import { apiCall } from "../client.js";
import type { ToolDef } from "./types.js";

export const campaignTools: ToolDef[] = [
  {
    name: "list_campaigns",
    description:
      "List campaigns owned by the user (paginated, joined through uploads). " +
      "Each entry includes campaign_name, adset_name, ad_name, bid_amount, status " +
      "(queued / processing / completed / failed), meta_status (ACTIVE / PAUSED / " +
      "DELETED / ARCHIVED), meta_campaign_id, meta_adset_id, meta_ad_id, bid_strategy, " +
      "daily_budget.",
    inputSchema: {
      status: z
        .string()
        .optional()
        .describe("Filter by campaign-job status (e.g. 'completed', 'failed', 'processing')"),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().positive().max(100).optional(),
    },
    handler: async (args) =>
      apiCall("/api/v1/campaigns", {
        query: { status: args.status, page: args.page, per_page: args.per_page },
      }),
  },

  {
    name: "get_campaign",
    description:
      "Get a single campaign by ScaleForge ID. Returns the same fields as list_campaigns " +
      "for one campaign record.",
    inputSchema: {
      id: z.number().int().positive().describe("ScaleForge Campaign ID"),
    },
    handler: async (args) => apiCall(`/api/v1/campaigns/${args.id}`),
  },

  {
    name: "pause_campaigns",
    description:
      "WRITE OPERATION: Pause one or more campaigns on Meta Ads. This enqueues a " +
      "batch job that flips the given campaigns and their adsets to PAUSED using " +
      "Meta's Batch API. Agents MUST confirm with the user before calling this — " +
      "paused campaigns stop spend immediately. Returns { queued, account_id }.",
    inputSchema: {
      account_id: z
        .number()
        .int()
        .positive()
        .describe("ScaleForge AdAccount ID that owns these campaigns"),
      campaign_ids: z
        .array(z.number().int().positive())
        .min(1)
        .describe("Array of ScaleForge Campaign IDs to pause"),
    },
    handler: async (args) =>
      apiCall("/api/v1/campaigns/pause", {
        method: "POST",
        body: { account_id: args.account_id, campaign_ids: args.campaign_ids },
      }),
  },

  {
    name: "activate_campaigns",
    description:
      "WRITE OPERATION: Activate one or more campaigns on Meta Ads. Enqueues a " +
      "batch job that flips the given campaigns and adsets to ACTIVE via Meta " +
      "Batch API. Agents MUST confirm with the user before calling this — " +
      "activation starts spend immediately. Also verify ads_volume capacity first " +
      "(use get_ads_volume). Returns { queued, account_id }.",
    inputSchema: {
      account_id: z
        .number()
        .int()
        .positive()
        .describe("ScaleForge AdAccount ID that owns these campaigns"),
      campaign_ids: z
        .array(z.number().int().positive())
        .min(1)
        .describe("Array of ScaleForge Campaign IDs to activate"),
    },
    handler: async (args) =>
      apiCall("/api/v1/campaigns/activate", {
        method: "POST",
        body: { account_id: args.account_id, campaign_ids: args.campaign_ids },
      }),
  },
];
