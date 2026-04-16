import { apiCall } from "../client.js";
import type { ToolDef } from "./types.js";

export const watchlistTools: ToolDef[] = [
  {
    name: "list_watchlist",
    description:
      "List tracked competitor ad pages from the Facebook Ad Library watchlist. " +
      "Returns each item with its most recent scan (new_ads, removed_ads, " +
      "total_ads counters). Response envelope is { watchlist: [...] }. Useful for " +
      "monitoring competitor activity and spotting new creatives in the market.",
    inputSchema: {},
    handler: async () => apiCall("/api/v1/watchlist"),
  },
];
