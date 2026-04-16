import { z } from "zod";
import { metaBatch, metaGet } from "../client.js";
import { checkAdsVolume } from "../helpers/adsVolumeCheck.js";
import type { ToolDef } from "./types.js";
import type { MetaBatchRequest } from "../client.js";

/**
 * Turn a flat {key: value} body into the URL-encoded string Meta's Batch API
 * expects in the `body` field of each operation. Values that aren't primitives
 * are JSON-stringified (Meta accepts nested JSON for fields like `targeting`).
 */
function encodeBatchBody(obj: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      p.append(k, String(v));
    } else {
      p.append(k, JSON.stringify(v));
    }
  }
  return p.toString();
}

/**
 * For activate_campaigns_batch we need the `account_id` of each campaign so
 * we can group pre-flight ads_volume checks. Fetch them in parallel.
 */
async function groupCampaignsByAccount(
  campaign_ids: string[],
): Promise<Map<string, string[]>> {
  const groups = new Map<string, string[]>();
  const lookups = await Promise.all(
    campaign_ids.map(async (id) => {
      try {
        const camp = await metaGet<{ account_id?: string }>(`/${id}`, {
          fields: "account_id",
        });
        return { id, account_id: camp.account_id };
      } catch {
        return { id, account_id: undefined };
      }
    }),
  );
  for (const { id, account_id } of lookups) {
    if (!account_id) continue;
    const key = account_id.startsWith("act_") ? account_id : `act_${account_id}`;
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  }
  return groups;
}

export const bulkTools: ToolDef[] = [
  {
    name: "pause_campaigns_batch",
    description:
      "WRITE (BULK): Pause many campaigns in a single Meta Batch API call (up to 50/request; " +
      "arrays bigger than 50 are chunked automatically with a 2s delay between chunks to " +
      "sidestep rate-limit code 17). Returns {results: Array<{code, body}>} — one entry per " +
      "campaign. `code: 200` = success.",
    inputSchema: {
      campaign_ids: z
        .array(z.string())
        .min(1)
        .describe("Meta Campaign IDs to pause"),
    },
    handler: async (args) => {
      const ids = Array.from(new Set(args.campaign_ids as string[]));
      const requests: MetaBatchRequest[] = ids.map((id) => ({
        method: "POST",
        relative_url: id,
        body: encodeBatchBody({ status: "PAUSED" }),
      }));
      const results = await metaBatch(requests);
      return { requested: ids.length, results };
    },
  },

  {
    name: "activate_campaigns_batch",
    description:
      "WRITE (BULK): Activate many campaigns in one Batch API call. BEFORE activation we run " +
      "a per-Page ads_volume pre-flight for every distinct ad account — warnings are returned " +
      "in the response so the agent / user can abort if a Page is over capacity. Agents MUST " +
      "confirm with the user before calling this (activation starts spend immediately).",
    inputSchema: {
      campaign_ids: z.array(z.string()).min(1),
      skip_preflight: z
        .boolean()
        .optional()
        .describe("Skip the ads_volume check (not recommended)"),
    },
    handler: async (args) => {
      const ids = Array.from(new Set(args.campaign_ids as string[]));

      const preflight: Array<{
        ad_account_id: string;
        campaigns: number;
        warnings: string[];
      }> = [];

      if (!args.skip_preflight) {
        const groups = await groupCampaignsByAccount(ids);
        for (const [accountId, campaigns] of groups.entries()) {
          try {
            const { warnings } = await checkAdsVolume(accountId, campaigns.length);
            preflight.push({
              ad_account_id: accountId,
              campaigns: campaigns.length,
              warnings,
            });
          } catch (err) {
            preflight.push({
              ad_account_id: accountId,
              campaigns: campaigns.length,
              warnings: [
                `Could not fetch ads_volume: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              ],
            });
          }
        }
      }

      const requests: MetaBatchRequest[] = ids.map((id) => ({
        method: "POST",
        relative_url: id,
        body: encodeBatchBody({ status: "ACTIVE" }),
      }));
      const results = await metaBatch(requests);
      return { requested: ids.length, preflight, results };
    },
  },

  {
    name: "update_bids_batch",
    description:
      "WRITE (BULK): Update `bid_amount` on many ad sets in one Batch API call. Input is an " +
      "array of {adset_id, bid_amount_cents} pairs. Bid values are in minor currency units " +
      "(cents). Chunks of 50 automatically.",
    inputSchema: {
      updates: z
        .array(
          z.object({
            adset_id: z.string(),
            bid_amount_cents: z.number().int().positive(),
          }),
        )
        .min(1)
        .describe("Array of {adset_id, bid_amount_cents} to apply"),
    },
    handler: async (args) => {
      const updates = args.updates as Array<{
        adset_id: string;
        bid_amount_cents: number;
      }>;
      const requests: MetaBatchRequest[] = updates.map((u) => ({
        method: "POST",
        relative_url: u.adset_id,
        body: encodeBatchBody({ bid_amount: u.bid_amount_cents }),
      }));
      const results = await metaBatch(requests);
      return { requested: updates.length, results };
    },
  },
];
