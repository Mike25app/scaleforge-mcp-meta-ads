import { z } from "zod";
import { apiCall } from "../client.js";
import type { ToolDef } from "./types.js";

export const uploadTools: ToolDef[] = [
  {
    name: "list_uploads",
    description:
      "List bulk upload sessions (paginated). Each upload represents a batch of " +
      "campaigns being pushed to Meta. Fields: id, name, status (queued / " +
      "processing / paused / cancelled / completed / failed), total_campaigns, " +
      "completed_campaigns, failed_campaigns, multi_account, started_at, " +
      "completed_at.",
    inputSchema: {
      status: z
        .string()
        .optional()
        .describe("Filter by upload status (e.g. 'processing', 'completed')"),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().positive().max(100).optional(),
    },
    handler: async (args) =>
      apiCall("/api/v1/uploads", {
        query: { status: args.status, page: args.page, per_page: args.per_page },
      }),
  },

  {
    name: "get_upload",
    description:
      "Get a single bulk upload session with its campaigns. Shows current " +
      "progress (completed / failed / total) and the list of child campaign " +
      "jobs. Use this to monitor a running upload.",
    inputSchema: {
      id: z.number().int().positive().describe("ScaleForge Upload ID"),
    },
    handler: async (args) => apiCall(`/api/v1/uploads/${args.id}`),
  },
];
