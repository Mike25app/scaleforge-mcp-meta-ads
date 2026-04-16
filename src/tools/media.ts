import { z } from "zod";
import { metaPost } from "../client.js";
import type { ToolDef } from "./types.js";

function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

export const mediaTools: ToolDef[] = [
  {
    name: "upload_video",
    description:
      "WRITE: Upload a video to an ad account. Returns {id, title}. Prefer `file_url` (remote " +
      "URL Meta fetches server-side) — streaming a local file over MCP stdio is awkward and " +
      "rarely needed when videos live in S3 / Dropbox / a CDN. Local `file_path` is accepted " +
      "for completeness but may be blocked on Windows / sandboxed MCP hosts.",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      file_url: z
        .string()
        .url()
        .optional()
        .describe("Remote URL Meta fetches (recommended for MCP usage)"),
      file_path: z
        .string()
        .optional()
        .describe("Local path — only works when Node can read the file"),
      title: z.string().optional().describe("Video title (shown in Ad Library)"),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    handler: async (args) => {
      if (!args.file_url && !args.file_path) {
        throw new Error(
          "upload_video needs either file_url (remote URL, recommended) or file_path (local).",
        );
      }
      if (args.file_path && !args.file_url) {
        // Local file path uploads would require multipart/form-data (which our
        // metaPost helper intentionally doesn't do, because form-data + fetch
        // without a polyfill is fiddly and most MCP callers use remote URLs).
        // Fail loudly with a clear message instead of silently sending a
        // broken request.
        throw new Error(
          "Local file_path upload is not supported from MCP stdio — please host the video at a URL and pass file_url instead. " +
            "Meta will fetch directly from file_url, which is faster and sandbox-safe.",
        );
      }
      const body: Record<string, unknown> = { file_url: args.file_url };
      if (args.title) body.title = args.title;
      if (args.name) body.name = args.name;
      if (args.description) body.description = args.description;
      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/advideos`,
        body,
      );
    },
  },

  {
    name: "upload_image",
    description:
      "WRITE: Upload an image to an ad account. Returns {images: {filename: {hash}}}. The " +
      "`hash` is what you pass to create_ad_creative as image_hash.\n\n" +
      "IMPORTANT: Meta image hashes are SCOPED TO THE AD ACCOUNT — a hash uploaded on " +
      "account A cannot be used on account B. If you need the same image across multiple " +
      "accounts, call this once per account. (ScaleForge's backend caches hashes per account " +
      "to avoid re-uploads within the same account.)",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      url: z.string().url().optional().describe("Remote URL (recommended)"),
      filename: z
        .string()
        .optional()
        .describe("Descriptive filename (Meta keys the response by this)"),
    },
    handler: async (args) => {
      if (!args.url) {
        throw new Error(
          "upload_image needs `url` (remote image URL). Local file uploads are not supported from MCP stdio.",
        );
      }
      const body: Record<string, unknown> = { url: args.url };
      if (args.filename) body.filename = args.filename;
      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/adimages`,
        body,
      );
    },
  },
];
