import { z } from "zod";
import { metaGet, metaPost, metaDelete } from "../client.js";
import type { ToolDef } from "./types.js";

function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

/**
 * Supported Meta campaign objectives as of v24.0. The legacy (pre-2023) names
 * like LINK_CLICKS, CONVERSIONS, VIDEO_VIEWS were replaced with ODAX outcomes.
 */
const OBJECTIVE = z.enum([
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_AWARENESS",
]);

const STATUS = z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]);

const BID_STRATEGY = z.enum([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

const DEFAULT_CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,budget_remaining,special_ad_categories,start_time,stop_time,created_time,updated_time";

export const campaignTools: ToolDef[] = [
  {
    name: "list_campaigns",
    description:
      "List campaigns in an ad account. Returns id, name, status, objective, daily_budget, " +
      "lifetime_budget, bid_strategy, created_time. Paginated via `limit` + `after` cursor.",
    inputSchema: {
      ad_account_id: z
        .string()
        .describe("Ad Account ID — accepts 'act_123456' or just '123456'"),
      limit: z.number().int().positive().max(500).optional().describe("Default 100"),
      after: z.string().optional().describe("Pagination cursor"),
      effective_status: z
        .array(z.string())
        .optional()
        .describe("Filter by effective_status (e.g. ['ACTIVE','PAUSED'])"),
      fields: z.string().optional().describe("Override default field list"),
    },
    handler: async (args) =>
      metaGet(`/${toAdAccountPath(String(args.ad_account_id))}/campaigns`, {
        fields: args.fields ?? DEFAULT_CAMPAIGN_FIELDS,
        limit: args.limit ?? 100,
        after: args.after,
        effective_status: args.effective_status,
      }),
  },

  {
    name: "get_campaign",
    description:
      "Get a single campaign by ID. Returns all default fields plus anything in `fields`. " +
      "Use this for deep inspection of one campaign.",
    inputSchema: {
      campaign_id: z.string().describe("Meta Campaign ID"),
      fields: z.string().optional().describe("Override default field list"),
    },
    handler: async (args) =>
      metaGet(`/${String(args.campaign_id)}`, {
        fields: args.fields ?? DEFAULT_CAMPAIGN_FIELDS,
      }),
  },

  {
    name: "create_campaign",
    description:
      "WRITE: Create a new campaign. Default status is PAUSED (recommended — set ACTIVE only " +
      "after creating ad sets and ads). For CBO, pass daily_budget or lifetime_budget at this " +
      "level; for ABO leave budget off and set it on the ad set. `special_ad_categories` is " +
      "required (empty array [] is fine for normal advertising).",
    inputSchema: {
      ad_account_id: z.string().describe("Ad Account ID — 'act_123456' or '123456'"),
      name: z.string().min(1).describe("Campaign name"),
      objective: OBJECTIVE.describe("Campaign objective (ODAX v24.0 enum)"),
      status: STATUS.optional().describe("Default PAUSED"),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("CBO daily budget in account currency minor units (cents)"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("CBO lifetime budget in minor units"),
      bid_strategy: BID_STRATEGY.optional(),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe(
          "Required by Meta. Use [] for normal ads, or include 'HOUSING'/'EMPLOYMENT'/'CREDIT' etc. where legally required",
        ),
      buying_type: z
        .enum(["AUCTION", "RESERVED"])
        .optional()
        .describe("Defaults to AUCTION"),
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {
        name: args.name,
        objective: args.objective,
        status: args.status ?? "PAUSED",
        special_ad_categories: args.special_ad_categories ?? [],
      };
      if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
      if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
      if (args.bid_strategy) body.bid_strategy = args.bid_strategy;
      if (args.buying_type) body.buying_type = args.buying_type;
      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/campaigns`,
        body,
      );
    },
  },

  {
    name: "update_campaign",
    description:
      "WRITE: Update any mutable field on a campaign (name, status, daily_budget, " +
      "lifetime_budget, bid_strategy). Pass only the fields you want to change.",
    inputSchema: {
      campaign_id: z.string(),
      name: z.string().optional(),
      status: STATUS.optional(),
      daily_budget: z.number().int().positive().optional(),
      lifetime_budget: z.number().int().positive().optional(),
      bid_strategy: BID_STRATEGY.optional(),
      special_ad_categories: z.array(z.string()).optional(),
    },
    handler: async (args) => {
      const { campaign_id, ...rest } = args;
      return metaPost(`/${String(campaign_id)}`, rest as Record<string, unknown>);
    },
  },

  {
    name: "delete_campaign",
    description:
      "WRITE: Hard-delete a campaign (and its ad sets / ads). Prefer update_campaign with " +
      "status=ARCHIVED if you want to keep historical data.",
    inputSchema: {
      campaign_id: z.string(),
    },
    handler: async (args) => metaDelete(`/${String(args.campaign_id)}`),
  },
];
