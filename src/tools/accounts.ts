import { z } from "zod";
import { metaGet } from "../client.js";
import type { ToolDef } from "./types.js";

/**
 * Accept either the bare numeric id ("123456789") or the act_-prefixed form
 * ("act_123456789"). Meta's /me/adaccounts returns the prefixed form, but
 * media buyers often paste without it.
 */
function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

const DEFAULT_ACCOUNT_FIELDS =
  "id,name,account_status,currency,business_name,business,spend_cap,amount_spent,balance,timezone_name,timezone_offset_hours_utc,disable_reason,funding_source_details";

export const accountTools: ToolDef[] = [
  {
    name: "list_ad_accounts",
    description:
      "List Meta Ad Accounts accessible to the current access token. Returns id (act_XXX), " +
      "name, account_status, currency, business_name, spend_cap, timezone_name. " +
      "Use this first to discover what you can work with.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Max accounts per page (Meta caps ~500, default 100)"),
      after: z
        .string()
        .optional()
        .describe("Cursor for next page (from previous response's paging.cursors.after)"),
    },
    handler: async (args) =>
      metaGet("/me/adaccounts", {
        fields:
          "id,name,account_status,currency,business_name,spend_cap,timezone_name",
        limit: args.limit ?? 100,
        after: args.after,
      }),
  },

  {
    name: "get_ad_account",
    description:
      "Get detailed info for a single Ad Account: status, spend cap, balance, funding source, " +
      "business, timezone, disable_reason. Returns the full configuration record — use this " +
      "for deep inspection of one account.",
    inputSchema: {
      ad_account_id: z
        .string()
        .describe("Ad Account ID — accepts 'act_123456' or just '123456'"),
      fields: z
        .string()
        .optional()
        .describe("Comma-separated Meta API field list (overrides default field set)"),
    },
    handler: async (args) =>
      metaGet(`/${toAdAccountPath(String(args.ad_account_id))}`, {
        fields: args.fields ?? DEFAULT_ACCOUNT_FIELDS,
      }),
  },

  {
    name: "get_ads_volume",
    description:
      "PRE-FLIGHT CHECK: Get per-Page ads-running-or-in-review counts and limits for an ad " +
      "account. Meta caps active ads per Page (default 250) and this limit is SHARED across " +
      "every account using the same Page. Always call this before a bulk activation to avoid " +
      "silent review failures. Returns one row per Page actor.",
    inputSchema: {
      ad_account_id: z
        .string()
        .describe("Ad Account ID — accepts 'act_123456' or just '123456'"),
    },
    handler: async (args) =>
      metaGet(`/${toAdAccountPath(String(args.ad_account_id))}/ads_volume`, {
        show_breakdown_by_actor: true,
        fields:
          "actor_id,actor_name,ads_running_or_in_review_count,limit_on_ads_running_or_in_review",
      }),
  },
];
