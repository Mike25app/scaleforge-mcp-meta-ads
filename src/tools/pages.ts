import { z } from "zod";
import { metaGet, metaPost } from "../client.js";
import type { ToolDef } from "./types.js";

interface PageAccessTokenResponse {
  id: string;
  access_token?: string;
}

interface PbiaListResponse {
  data?: Array<{ id: string; username?: string }>;
}

interface PbiaCreateResponse {
  id?: string;
}

export const pageTools: ToolDef[] = [
  {
    name: "list_pages",
    description:
      "List Facebook Pages the current user/System User manages. Each row has id, name, " +
      "access_token (Page Access Token — needed for PBIA provisioning), category, tasks " +
      "(what this token can do on the Page, e.g. 'MANAGE', 'CREATE_CONTENT', 'ADVERTISE').",
    inputSchema: {
      limit: z.number().int().positive().max(500).optional(),
      after: z.string().optional(),
    },
    handler: async (args) =>
      metaGet("/me/accounts", {
        fields: "id,name,access_token,category,tasks",
        limit: args.limit ?? 100,
        after: args.after,
      }),
  },

  {
    name: "get_pbia",
    description:
      "Get (or auto-create) a Page-Backed Instagram Account for a Facebook Page. Use this " +
      "when the Page has no linked Instagram account but you want to run ads with IG " +
      "placements — Meta lets a Page act as its own IG presence via PBIA (same option as " +
      "'Use Facebook Page for Instagram' in Ads Manager).\n\n" +
      "Flow: GET the Page's access_token, list existing PBIAs, create one if none exists. " +
      "Returns {page_backed_instagram_account_id, created (bool)}.",
    inputSchema: {
      page_id: z.string().describe("Facebook Page ID"),
    },
    handler: async (args) => {
      const pageId = String(args.page_id);

      // Step 1: Fetch the Page Access Token — PBIA endpoints require the
      // Page's own token, not the System User token directly.
      const pageInfo = await metaGet<PageAccessTokenResponse>(`/${pageId}`, {
        fields: "access_token",
      });
      const pageToken = pageInfo.access_token;
      if (!pageToken) {
        throw new Error(
          `Could not fetch Page Access Token for ${pageId} — does the current token have pages_manage_metadata / MANAGE task permission?`,
        );
      }

      // Step 2: Check for an existing PBIA using the page token.
      // metaGet uses the module-level META_ACCESS_TOKEN, so we do a direct
      // fetch here to use the Page-scoped token.
      const base = "https://graph.facebook.com/v24.0";
      const listRes = await fetch(
        `${base}/${pageId}/page_backed_instagram_accounts?access_token=${encodeURIComponent(pageToken)}`,
      );
      if (!listRes.ok) {
        const body = await listRes.text().catch(() => "");
        throw new Error(
          `Failed to list PBIAs for page ${pageId} — HTTP ${listRes.status}: ${body.slice(0, 300)}`,
        );
      }
      const listJson = (await listRes.json()) as PbiaListResponse;
      const existing = listJson.data?.[0]?.id;
      if (existing) {
        return { page_backed_instagram_account_id: existing, created: false };
      }

      // Step 3: No PBIA — create one.
      const createForm = new URLSearchParams();
      createForm.append("access_token", pageToken);
      const createRes = await fetch(
        `${base}/${pageId}/page_backed_instagram_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: createForm.toString(),
        },
      );
      if (!createRes.ok) {
        const body = await createRes.text().catch(() => "");
        throw new Error(
          `Failed to create PBIA for page ${pageId} — HTTP ${createRes.status}: ${body.slice(0, 300)}`,
        );
      }
      const created = (await createRes.json()) as PbiaCreateResponse;
      if (!created.id) {
        throw new Error(
          `PBIA create returned no id: ${JSON.stringify(created)}`,
        );
      }
      // Swallow the unused metaPost import warning — we intentionally hand-
      // rolled the POST above to use the Page token rather than the default.
      void metaPost;
      return { page_backed_instagram_account_id: created.id, created: true };
    },
  },
];
