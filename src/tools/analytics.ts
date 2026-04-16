import { z } from "zod";
import { apiCall } from "../client.js";
import type { ToolDef } from "./types.js";

export const analyticsTools: ToolDef[] = [
  {
    name: "get_analytics_summary",
    description:
      "Get combined Meta + RedTrack analytics totals aggregated per ad account " +
      "for a date range. Returns ad_account_id, account_name, total_spend, " +
      "total_revenue, total_conversions, total_impressions, total_clicks, and " +
      "roi (percent). Defaults to the last 7 days. Use this for high-level " +
      "account performance snapshots.",
    inputSchema: {
      date_from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("ISO date (YYYY-MM-DD), defaults to 7 days ago"),
      date_to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("ISO date (YYYY-MM-DD), defaults to today"),
    },
    handler: async (args) =>
      apiCall("/api/v1/analytics/summary", {
        query: { date_from: args.date_from, date_to: args.date_to },
      }),
  },
];
