import { z } from "zod";
import { metaGet, metaPost, metaDelete } from "../client.js";
import type { ToolDef } from "./types.js";

function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

const STATUS = z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]);

/**
 * Common optimization goals. Meta accepts dozens — keeping this permissive
 * via z.string() in the handler, but the enum documents the usual ones.
 */
const OPTIMIZATION_GOAL = z.enum([
  "NONE",
  "LINK_CLICKS",
  "IMPRESSIONS",
  "REACH",
  "OFFSITE_CONVERSIONS",
  "LEAD_GENERATION",
  "LANDING_PAGE_VIEWS",
  "THRUPLAY",
  "VIDEO_VIEWS",
  "APP_INSTALLS",
  "POST_ENGAGEMENT",
  "QUALITY_LEAD",
  "VALUE",
]);

const BILLING_EVENT = z.enum([
  "IMPRESSIONS",
  "LINK_CLICKS",
  "THRUPLAY",
  "POST_ENGAGEMENT",
  "APP_INSTALLS",
]);

const DEFAULT_ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,bid_amount,bid_strategy,billing_event,optimization_goal,targeting,start_time,end_time,is_dynamic_creative,pacing_type,created_time,updated_time";

export const adsetTools: ToolDef[] = [
  {
    name: "list_adsets",
    description:
      "List ad sets. Pass either `ad_account_id` (lists all adsets in account) OR " +
      "`campaign_id` (lists adsets of one campaign). Returns id, name, campaign_id, status, " +
      "daily_budget, bid_amount, billing_event, optimization_goal, targeting, is_dynamic_creative.",
    inputSchema: {
      ad_account_id: z.string().optional().describe("'act_123' or '123'"),
      campaign_id: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      after: z.string().optional(),
      effective_status: z.array(z.string()).optional(),
      fields: z.string().optional(),
    },
    handler: async (args) => {
      if (!args.ad_account_id && !args.campaign_id) {
        throw new Error(
          "Must provide either ad_account_id or campaign_id to list ad sets.",
        );
      }
      const parent = args.campaign_id
        ? String(args.campaign_id)
        : toAdAccountPath(String(args.ad_account_id));
      return metaGet(`/${parent}/adsets`, {
        fields: args.fields ?? DEFAULT_ADSET_FIELDS,
        limit: args.limit ?? 100,
        after: args.after,
        effective_status: args.effective_status,
      });
    },
  },

  {
    name: "get_adset",
    description:
      "Get a single ad set by ID. Returns default fields plus anything in `fields`.",
    inputSchema: {
      adset_id: z.string(),
      fields: z.string().optional(),
    },
    handler: async (args) =>
      metaGet(`/${String(args.adset_id)}`, {
        fields: args.fields ?? DEFAULT_ADSET_FIELDS,
      }),
  },

  {
    name: "create_adset",
    description:
      "WRITE: Create an ad set under a campaign. Default status is PAUSED. `targeting` is a " +
      "Meta targeting spec object (geo_locations, age_min, age_max, interests, etc.). " +
      "`bid_amount` is in account currency minor units (cents). For multi-text / dynamic " +
      "creative ads you MUST set is_dynamic_creative=true — otherwise asset_feed_spec ads " +
      "will be rejected.",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      campaign_id: z.string(),
      name: z.string().min(1),
      targeting: z.record(z.unknown()).describe("Meta targeting spec object (JSON)"),
      optimization_goal: OPTIMIZATION_GOAL.describe("e.g. OFFSITE_CONVERSIONS"),
      billing_event: BILLING_EVENT,
      bid_amount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Bid in minor currency units (cents). Always set at adset level."),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("For ABO; omit under CBO"),
      lifetime_budget: z.number().int().positive().optional(),
      start_time: z
        .string()
        .optional()
        .describe("ISO 8601, e.g. '2026-01-15T00:00:00+0000'"),
      end_time: z.string().optional(),
      status: STATUS.optional(),
      is_dynamic_creative: z
        .boolean()
        .optional()
        .describe("Must be true for asset_feed_spec / multi-text creatives"),
      promoted_object: z
        .record(z.unknown())
        .optional()
        .describe(
          "e.g. {pixel_id: 'XXX', custom_event_type: 'PURCHASE'} for conversion optimization",
        ),
      pacing_type: z
        .array(z.string())
        .optional()
        .describe("e.g. ['standard'] or ['no_pacing']"),
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {
        campaign_id: args.campaign_id,
        name: args.name,
        targeting: args.targeting,
        optimization_goal: args.optimization_goal,
        billing_event: args.billing_event,
        status: args.status ?? "PAUSED",
      };
      if (args.bid_amount !== undefined) body.bid_amount = args.bid_amount;
      if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
      if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
      if (args.start_time) body.start_time = args.start_time;
      if (args.end_time) body.end_time = args.end_time;
      if (args.is_dynamic_creative !== undefined)
        body.is_dynamic_creative = args.is_dynamic_creative;
      if (args.promoted_object) body.promoted_object = args.promoted_object;
      if (args.pacing_type) body.pacing_type = args.pacing_type;
      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/adsets`,
        body,
      );
    },
  },

  {
    name: "update_adset",
    description:
      "WRITE: Update any mutable field on an ad set (status, bid_amount, daily_budget, " +
      "targeting, name, etc.). Pass only the fields you want to change.",
    inputSchema: {
      adset_id: z.string(),
      name: z.string().optional(),
      status: STATUS.optional(),
      bid_amount: z.number().int().positive().optional(),
      daily_budget: z.number().int().positive().optional(),
      lifetime_budget: z.number().int().positive().optional(),
      targeting: z.record(z.unknown()).optional(),
      optimization_goal: OPTIMIZATION_GOAL.optional(),
      billing_event: BILLING_EVENT.optional(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
    },
    handler: async (args) => {
      const { adset_id, ...rest } = args;
      return metaPost(`/${String(adset_id)}`, rest as Record<string, unknown>);
    },
  },

  {
    name: "delete_adset",
    description:
      "WRITE: Hard-delete an ad set (and its ads). Prefer update_adset status=ARCHIVED to keep history.",
    inputSchema: {
      adset_id: z.string(),
    },
    handler: async (args) => metaDelete(`/${String(args.adset_id)}`),
  },
];
