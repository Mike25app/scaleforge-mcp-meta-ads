import { z } from "zod";
import { metaGet } from "../client.js";
import type { ToolDef } from "./types.js";

/**
 * Meta's public Ad Library archive — requires a regular access token, but
 * returns public ads (no permission scopes needed). Useful for competitive
 * research: "what is Competitor X running this week?".
 */

const DEFAULT_AD_ARCHIVE_FIELDS =
  "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,page_id,page_name,publisher_platforms,ad_creative_link_captions";

export const adsLibraryTools: ToolDef[] = [
  {
    name: "search_ads_library",
    description:
      "Search Meta's public Ad Library for competitive research. Returns active and inactive " +
      "ads matching `search_terms` OR `search_page_ids` in the selected countries. Default " +
      "country = ['US']. Returns ad_snapshot_url (preview), creative bodies/titles, page_id, " +
      "delivery times, publisher_platforms.\n\n" +
      "Note: only ads in categories subject to public transparency (political / housing / " +
      "employment / credit) return full metadata; other categories return lighter data.",
    inputSchema: {
      search_terms: z
        .string()
        .optional()
        .describe("Keywords to search ad text/creative"),
      search_page_ids: z
        .array(z.string())
        .optional()
        .describe("Specific Facebook Page IDs to look at"),
      ad_reached_countries: z
        .array(z.string().length(2))
        .optional()
        .describe("ISO-2 country codes. Default ['US']"),
      ad_type: z
        .enum([
          "ALL",
          "POLITICAL_AND_ISSUE_ADS",
          "HOUSING_ADS",
          "EMPLOYMENT_ADS",
          "CREDIT_ADS",
        ])
        .optional()
        .describe("Default ALL"),
      ad_active_status: z
        .enum(["ALL", "ACTIVE", "INACTIVE"])
        .optional()
        .describe("Default ACTIVE"),
      publisher_platforms: z
        .array(z.enum(["FACEBOOK", "INSTAGRAM", "AUDIENCE_NETWORK", "MESSENGER"]))
        .optional(),
      limit: z.number().int().positive().max(500).optional(),
      after: z.string().optional(),
      fields: z.string().optional().describe("Override default field list"),
    },
    handler: async (args) => {
      if (!args.search_terms && !args.search_page_ids) {
        throw new Error(
          "search_ads_library requires either `search_terms` or `search_page_ids`.",
        );
      }
      return metaGet("/ads_archive", {
        search_terms: args.search_terms,
        search_page_ids: args.search_page_ids,
        ad_reached_countries: args.ad_reached_countries ?? ["US"],
        ad_type: args.ad_type ?? "ALL",
        ad_active_status: args.ad_active_status ?? "ACTIVE",
        publisher_platforms: args.publisher_platforms,
        limit: args.limit ?? 50,
        after: args.after,
        fields: args.fields ?? DEFAULT_AD_ARCHIVE_FIELDS,
      });
    },
  },
];
