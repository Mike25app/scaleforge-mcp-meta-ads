import { z } from "zod";
import { metaGet, metaPost, metaDelete } from "../client.js";
import type { ToolDef } from "./types.js";

function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

const STATUS = z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]);

const DEFAULT_AD_FIELDS =
  "id,name,adset_id,campaign_id,creative,status,effective_status,created_time,updated_time,issues_info,preview_shareable_link";

export const adTools: ToolDef[] = [
  {
    name: "list_ads",
    description:
      "List ads. Pass either `ad_account_id` (all ads in account), `adset_id` (ads in one ad set), " +
      "or `campaign_id` (ads in a campaign). Returns id, name, adset_id, creative, status.",
    inputSchema: {
      ad_account_id: z.string().optional(),
      adset_id: z.string().optional(),
      campaign_id: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      after: z.string().optional(),
      effective_status: z.array(z.string()).optional(),
      fields: z.string().optional(),
    },
    handler: async (args) => {
      const parent = args.adset_id
        ? String(args.adset_id)
        : args.campaign_id
        ? String(args.campaign_id)
        : args.ad_account_id
        ? toAdAccountPath(String(args.ad_account_id))
        : null;
      if (!parent) {
        throw new Error(
          "Must provide one of: ad_account_id, adset_id, or campaign_id.",
        );
      }
      return metaGet(`/${parent}/ads`, {
        fields: args.fields ?? DEFAULT_AD_FIELDS,
        limit: args.limit ?? 100,
        after: args.after,
        effective_status: args.effective_status,
      });
    },
  },

  {
    name: "get_ad",
    description: "Get a single ad by ID. Returns full creative + issues + preview link.",
    inputSchema: {
      ad_id: z.string(),
      fields: z.string().optional(),
    },
    handler: async (args) =>
      metaGet(`/${String(args.ad_id)}`, {
        fields: args.fields ?? DEFAULT_AD_FIELDS,
      }),
  },

  {
    name: "update_ad",
    description:
      "WRITE: Update an ad's name, status, or swap its creative. To replace the creative pass " +
      "`creative: {creative_id: 'XXX'}`.",
    inputSchema: {
      ad_id: z.string(),
      name: z.string().optional(),
      status: STATUS.optional(),
      creative: z
        .record(z.unknown())
        .optional()
        .describe("e.g. {creative_id: '123456'}"),
    },
    handler: async (args) => {
      const { ad_id, ...rest } = args;
      return metaPost(`/${String(ad_id)}`, rest as Record<string, unknown>);
    },
  },

  {
    name: "delete_ad",
    description:
      "WRITE: Hard-delete an ad. Prefer update_ad status=ARCHIVED to keep history.",
    inputSchema: {
      ad_id: z.string(),
    },
    handler: async (args) => metaDelete(`/${String(args.ad_id)}`),
  },
];
