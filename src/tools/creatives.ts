import { z } from "zod";
import { metaGet, metaPost } from "../client.js";
import type { ToolDef } from "./types.js";

function toAdAccountPath(idOrActId: string): string {
  return idOrActId.startsWith("act_") ? idOrActId : `act_${idOrActId}`;
}

const DEFAULT_CREATIVE_FIELDS =
  "id,name,object_story_spec,asset_feed_spec,status,thumbnail_url,image_hash,video_id,body,title,call_to_action_type,effective_object_story_id";

export const creativeTools: ToolDef[] = [
  {
    name: "list_creatives",
    description:
      "List ad creatives in an account. Returns id, name, object_story_spec, asset_feed_spec, " +
      "thumbnail_url, video_id, image_hash, body/title.",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      limit: z.number().int().positive().max(500).optional(),
      after: z.string().optional(),
      fields: z.string().optional(),
    },
    handler: async (args) =>
      metaGet(`/${toAdAccountPath(String(args.ad_account_id))}/adcreatives`, {
        fields: args.fields ?? DEFAULT_CREATIVE_FIELDS,
        limit: args.limit ?? 100,
        after: args.after,
      }),
  },

  {
    name: "get_creative",
    description: "Get a single ad creative by ID.",
    inputSchema: {
      creative_id: z.string(),
      fields: z.string().optional(),
    },
    handler: async (args) =>
      metaGet(`/${String(args.creative_id)}`, {
        fields: args.fields ?? DEFAULT_CREATIVE_FIELDS,
      }),
  },

  {
    name: "create_ad_creative",
    description:
      "WRITE: Create a single-text ad creative from an `object_story_spec`. Pass page_id plus " +
      "ONE of: video_data (for video ads — needs video_id from upload_video), link_data (for " +
      "image / link ads — needs image_hash from upload_image + link + message). If the Page is " +
      "not linked to Instagram, pass `instagram_user_id` from get_pbia() to enable IG placements. " +
      "\n\nNote: image hashes are per-ad-account in Meta — a hash uploaded on account A is NOT " +
      "valid on account B. Re-upload to each target account.",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      name: z.string().min(1),
      page_id: z.string().describe("Facebook Page ID (the advertiser)"),
      instagram_user_id: z
        .string()
        .optional()
        .describe("Instagram actor ID or PBIA id (from get_pbia). Optional."),
      video_id: z.string().optional().describe("From upload_video"),
      image_hash: z.string().optional().describe("From upload_image"),
      message: z.string().optional().describe("Primary text / body copy"),
      title: z.string().optional().describe("Headline for link_data"),
      link: z.string().url().optional().describe("Landing page URL (for link_data)"),
      call_to_action: z
        .record(z.unknown())
        .optional()
        .describe(
          "e.g. {type: 'SHOP_NOW', value: {link: 'https://...'}}",
        ),
      description: z.string().optional(),
      url_tags: z.string().optional().describe("UTM tracking params"),
      thumbnail_url: z.string().url().optional(),
    },
    handler: async (args) => {
      const story: Record<string, unknown> = { page_id: args.page_id };
      if (args.instagram_user_id) story.instagram_user_id = args.instagram_user_id;

      if (args.video_id) {
        const video_data: Record<string, unknown> = { video_id: args.video_id };
        if (args.message) video_data.message = args.message;
        if (args.title) video_data.title = args.title;
        if (args.call_to_action) video_data.call_to_action = args.call_to_action;
        if (args.thumbnail_url) video_data.image_url = args.thumbnail_url;
        story.video_data = video_data;
      } else if (args.image_hash) {
        const link_data: Record<string, unknown> = { image_hash: args.image_hash };
        if (args.link) link_data.link = args.link;
        if (args.message) link_data.message = args.message;
        if (args.title) link_data.name = args.title;
        if (args.description) link_data.description = args.description;
        if (args.call_to_action) link_data.call_to_action = args.call_to_action;
        story.link_data = link_data;
      } else {
        throw new Error(
          "create_ad_creative needs either video_id (video ad) or image_hash + link (image/link ad).",
        );
      }

      const body: Record<string, unknown> = {
        name: args.name,
        object_story_spec: story,
      };
      if (args.url_tags) body.url_tags = args.url_tags;

      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/adcreatives`,
        body,
      );
    },
  },

  {
    name: "create_ad_creative_with_asset_feed",
    description:
      "WRITE: Create a DYNAMIC (multi-text) creative using `asset_feed_spec`. Meta will auto-" +
      "combine the bodies/titles/descriptions and optimize the best mix. The parent ad set " +
      "MUST have is_dynamic_creative=true. Pass arrays of texts plus either video_id(s) or " +
      "image_hash(es).",
    inputSchema: {
      ad_account_id: z.string().describe("'act_123' or '123'"),
      name: z.string().min(1),
      page_id: z.string(),
      instagram_user_id: z.string().optional(),
      video_ids: z.array(z.string()).optional(),
      image_hashes: z.array(z.string()).optional(),
      bodies: z.array(z.string()).min(1).describe("Primary text variants"),
      titles: z.array(z.string()).optional().describe("Headline variants"),
      descriptions: z.array(z.string()).optional(),
      link_urls: z.array(z.string().url()).min(1).describe("Landing page variants"),
      call_to_action_types: z
        .array(z.string())
        .optional()
        .describe("e.g. ['SHOP_NOW','LEARN_MORE']"),
      url_tags: z.string().optional(),
    },
    handler: async (args) => {
      if (
        (!args.video_ids || (args.video_ids as string[]).length === 0) &&
        (!args.image_hashes || (args.image_hashes as string[]).length === 0)
      ) {
        throw new Error(
          "asset_feed_spec needs at least one of: video_ids or image_hashes.",
        );
      }

      const asset_feed_spec: Record<string, unknown> = {
        bodies: (args.bodies as string[]).map((text) => ({ text })),
        link_urls: (args.link_urls as string[]).map((website_url) => ({
          website_url,
        })),
        ad_formats: args.video_ids ? ["SINGLE_VIDEO"] : ["SINGLE_IMAGE"],
      };
      if (args.titles)
        asset_feed_spec.titles = (args.titles as string[]).map((text) => ({ text }));
      if (args.descriptions)
        asset_feed_spec.descriptions = (args.descriptions as string[]).map((text) => ({
          text,
        }));
      if (args.video_ids)
        asset_feed_spec.videos = (args.video_ids as string[]).map((video_id) => ({
          video_id,
        }));
      if (args.image_hashes)
        asset_feed_spec.images = (args.image_hashes as string[]).map((hash) => ({ hash }));
      if (args.call_to_action_types)
        asset_feed_spec.call_to_action_types = args.call_to_action_types;

      const object_story_spec: Record<string, unknown> = { page_id: args.page_id };
      if (args.instagram_user_id)
        object_story_spec.instagram_user_id = args.instagram_user_id;

      const body: Record<string, unknown> = {
        name: args.name,
        object_story_spec,
        asset_feed_spec,
      };
      if (args.url_tags) body.url_tags = args.url_tags;

      return metaPost(
        `/${toAdAccountPath(String(args.ad_account_id))}/adcreatives`,
        body,
      );
    },
  },
];
