import { z } from "zod";
import { metaGet } from "../client.js";
import type { ToolDef } from "./types.js";

/**
 * Meta's canonical date_preset values. `maximum` means the entire history of
 * the object (often useful for one-shot lifetime analytics).
 */
const DATE_PRESET = z.enum([
  "today",
  "yesterday",
  "this_week_mon_today",
  "this_week_sun_today",
  "last_week_mon_sun",
  "last_week_sun_sat",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "maximum",
]);

const DEFAULT_INSIGHTS_FIELDS =
  "spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,conversions,cost_per_conversion,cost_per_action_type,purchase_roas,video_30_sec_watched_actions,inline_link_clicks";

/**
 * Build the shared params bag for every insights call.
 *
 * `time_range` accepts a `{since, until}` object and takes precedence over
 * `date_preset` if both are provided (that's how Meta behaves).
 */
function insightsParams(args: Record<string, unknown>, level: string): Record<string, unknown> {
  const params: Record<string, unknown> = {
    level,
    fields: (args.fields as string[] | undefined)?.join(",") ?? DEFAULT_INSIGHTS_FIELDS,
  };
  if (args.time_range) params.time_range = args.time_range;
  else params.date_preset = args.date_preset ?? "last_7d";

  if (args.breakdowns) params.breakdowns = args.breakdowns;
  if (args.action_breakdowns) params.action_breakdowns = args.action_breakdowns;
  if (args.time_increment !== undefined) params.time_increment = args.time_increment;
  if (args.filtering) params.filtering = args.filtering;
  if (args.limit !== undefined) params.limit = args.limit;
  if (args.after) params.after = args.after;
  return params;
}

const SHARED_INPUT_SCHEMA = {
  date_preset: DATE_PRESET.optional().describe("Default last_7d"),
  time_range: z
    .object({ since: z.string(), until: z.string() })
    .optional()
    .describe("{since:'YYYY-MM-DD', until:'YYYY-MM-DD'} — overrides date_preset"),
  breakdowns: z
    .array(z.string())
    .optional()
    .describe("e.g. ['age','gender'] or ['country','publisher_platform']"),
  action_breakdowns: z
    .array(z.string())
    .optional()
    .describe("e.g. ['action_type']"),
  time_increment: z
    .union([z.number().int(), z.literal("monthly"), z.literal("all_days")])
    .optional()
    .describe("1 = per-day rows, 7 = weekly, 'monthly', etc."),
  filtering: z
    .array(z.record(z.unknown()))
    .optional()
    .describe("Meta filtering spec"),
  fields: z
    .array(z.string())
    .optional()
    .describe("Override default metric list"),
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
};

export const insightsTools: ToolDef[] = [
  {
    name: "get_campaign_insights",
    description:
      "Pull performance metrics for ONE campaign. Default fields: spend, impressions, clicks, " +
      "cpc, cpm, ctr, reach, frequency, actions, conversions, purchase_roas. Default range: " +
      "last_7d. Use `breakdowns` for cuts (age, gender, country, placement). Use `time_increment=1` " +
      "for day-by-day rows.",
    inputSchema: {
      campaign_id: z.string(),
      ...SHARED_INPUT_SCHEMA,
    },
    handler: async (args) =>
      metaGet(`/${String(args.campaign_id)}/insights`, insightsParams(args, "campaign")),
  },

  {
    name: "get_adset_insights",
    description:
      "Pull performance metrics for ONE ad set. Same fields/breakdowns as get_campaign_insights.",
    inputSchema: {
      adset_id: z.string(),
      ...SHARED_INPUT_SCHEMA,
    },
    handler: async (args) =>
      metaGet(`/${String(args.adset_id)}/insights`, insightsParams(args, "adset")),
  },

  {
    name: "get_ad_insights",
    description:
      "Pull performance metrics for ONE ad. Same fields/breakdowns as get_campaign_insights. " +
      "Use this to compare creative performance at the individual-ad level.",
    inputSchema: {
      ad_id: z.string(),
      ...SHARED_INPUT_SCHEMA,
    },
    handler: async (args) =>
      metaGet(`/${String(args.ad_id)}/insights`, insightsParams(args, "ad")),
  },
];
