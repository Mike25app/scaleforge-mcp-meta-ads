# Meta Ads MCP by ScaleForge

> **Control Facebook & Instagram Ads from Claude, ChatGPT, Cursor, or any MCP-compatible agent.**
>
> Direct Meta Graph API v24.0 wrapper. 32 tools. No backend required — just bring your own Meta access token.

[![npm](https://img.shields.io/npm/v/@getscaleforge/mcp-meta-ads.svg)](https://www.npmjs.com/package/@getscaleforge/mcp-meta-ads)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-blue.svg)](#prerequisites)

---

## The problem

Meta's Marketing API is powerful but punishing. Anyone who's tried to automate Meta Ads has run into these five walls:

1. **Rate-limit whack-a-mole (error code #17).** Your script hits `User request limit reached` halfway through a launch and leaves campaigns in a half-configured state. Meta's per-account budget of calls resets over 5 minutes, but nothing in the API tells you that without context.
2. **Token expiry chaos.** User access tokens from the Graph API Explorer die every ~2 hours. You fix a bug, come back from lunch, and every request is suddenly `(#190) Error validating access token`.
3. **v22 → v24 deprecations (Sept 2025).** `instagram_actor_id` → `instagram_user_id`, `degrees_of_freedom_spec` is gone entirely, `asset_feed_id` has been deprecated since v3.1. Copy-pasted sample code from Stack Overflow breaks silently.
4. **Image hashes are per-ad-account.** An image uploaded on Account A cannot be used on Account B — you get `Image Not Found` on the second account. Video IDs are global, but image hashes are not. This trips up 100% of first-time multi-account automations.
5. **The 250-ads-per-Page cap.** Meta limits ads-running-or-in-review per Page (not per account) — and this limit is shared across every account using that Page. Overshoot and the 251st ad silently fails review.

## The solution

This MCP is a thin, typed wrapper over Meta's Graph API with those five pains baked out:

- **Auto-batch for bulk ops** (`pause_campaigns_batch`, `activate_campaigns_batch`, `update_bids_batch`) — up to 50 ops per HTTP request, chunked automatically. Sidesteps rate-limit code #17 for bulk work.
- **Pre-flight ads_volume check** before every bulk activation — warns you when a Page is near the 250-ad cap, per ad account, before Meta silently fails the reviews.
- **Enhanced error messages** with actionable links — when your token expires or a rate limit fires, the MCP tells your agent exactly what to do (create a System User token, wait 5 min, etc.).
- **v24.0 everywhere** — current field names, no deprecated spec shapes.
- **PBIA auto-provisioning** (`get_pbia`) — when a Page has no linked Instagram account, the MCP creates a Page-Backed Instagram Account on demand so IG placements work.

No ScaleForge backend is in the chain. Your agent → this MCP → `https://graph.facebook.com/v24.0/*`. That's it.

---

## Quick start — pick one

### Smithery (easiest, auto-configures the client)

```bash
npx -y @smithery/cli install @getscaleforge/mcp-meta-ads --client claude
# also: --client cursor | --client windsurf | --client continue
```

Smithery will prompt you for the Meta access token and write the config file.

### Claude Code CLI

```bash
claude mcp add scaleforge \
  --env META_ACCESS_TOKEN=YOUR_TOKEN \
  -- npx -y @getscaleforge/mcp-meta-ads
```

Verify with `claude mcp list`.

### Claude Desktop (manual JSON config)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or the Windows / Linux equivalent — Claude Desktop creates it if missing):

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@getscaleforge/mcp-meta-ads"],
      "env": {
        "META_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Restart Claude Desktop. The 32 tools appear under the hammer icon.

### Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@getscaleforge/mcp-meta-ads"],
      "env": { "META_ACCESS_TOKEN": "YOUR_TOKEN_HERE" }
    }
  }
}
```

### Local test (no client setup)

```bash
META_ACCESS_TOKEN=YOUR_TOKEN npx -y @getscaleforge/mcp-meta-ads
```

The server starts on stdio. Poke it interactively with `@modelcontextprotocol/inspector`:

```bash
npx -y @modelcontextprotocol/inspector \
  env META_ACCESS_TOKEN=YOUR_TOKEN npx -y @getscaleforge/mcp-meta-ads
```

---

## Architecture

```
┌──────────────┐       MCP stdio        ┌───────────────────┐    HTTPS + OAuth token    ┌──────────────────────┐
│ Claude / GPT │ ◄────────────────────► │  mcp-meta-ads     │ ◄───────────────────────► │  Meta Graph API v24  │
│   Cursor     │   JSON-RPC over stdio  │  (this package)   │   graph.facebook.com      │  Marketing API       │
│ ChatGPT Desk │                        │                   │                           │                      │
└──────────────┘                        └───────────────────┘                           └──────────────────────┘
```

The MCP is a thin, typed translation layer. It does not cache, does not proxy, does not phone home. Every call goes from your machine straight to Meta's servers with your token.

---

## Get a Meta Access Token

You need an access token with `ads_management`, `ads_read`, `business_management`, and (for Page-scoped work like PBIA provisioning) `pages_read_engagement` + `pages_manage_ads`.

There are two kinds of tokens. Pick based on your use case.

### Option 1 — Quick token (2 minutes, expires in ~2 hours)

Good for: trying the MCP, quick experiments, one-off scripts.

1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. In the **User or Page** dropdown, select **User Token**.
3. Click **Add a Permission** and select: `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_manage_ads`.
4. Click **Generate Access Token** and approve the dialog.
5. Copy the token at the top. That's your `META_ACCESS_TOKEN`.

The token expires in ~2 hours. When it dies, the MCP will return an enhanced error pointing you here.

### Option 2 — Stable token (never expires) <a id="stable-tokens"></a>

Good for: production, scheduled jobs, anything you don't want to re-auth every 2 hours.

You generate a **System User** token inside **Meta Business Manager**. System User tokens have no expiry and can be scoped to specific assets (ad accounts + Pages). This is the same token type ScaleForge and every production Meta integration uses.

1. **Create a Facebook App** (if you don't have one) at [developers.facebook.com/apps](https://developers.facebook.com/apps/). Any app works — Business type is fine.
2. **Create a Business Manager** at [business.facebook.com](https://business.facebook.com/). You need this as the container for your System User.
3. **Add your ad accounts and Pages to the Business** under Business Settings → Accounts → Ad Accounts / Pages. (If they're owned by another Business, request access.)
4. **Create a System User:** Business Settings → Users → **System Users** → **Add** → name it (e.g. `mcp-meta-ads`) → role **Admin**.
    *[screenshot: Business Settings → Users → System Users tab with "Add" button]*
5. **Assign ad accounts to the System User:** click the System User → **Add Assets** → pick Ad Accounts → select yours → turn on **Manage** permission. Repeat for Pages.
    *[screenshot: Add Assets dialog with "Manage" toggle highlighted]*
6. **Generate the token:** click **Generate New Token** → select your Facebook App → pick scopes:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_read_engagement`
   - `pages_manage_ads`
   - `read_insights` (optional — needed for some insight breakdowns)
   *[screenshot: Generate Token dialog with scopes checklist]*
7. **Click Generate** and copy the token. It never expires. Store it in a secret manager / env var / password manager.

Now use it:

```bash
META_ACCESS_TOKEN=EAAB...your-token... npx -y @getscaleforge/mcp-meta-ads
```

If you revoke or regenerate later, the old token stops working immediately.

---

## Baked-in pain point fixes

| Meta pain point | How this MCP handles it |
| --- | --- |
| Rate limit code #17 in bulk ops | `pause_campaigns_batch`, `activate_campaigns_batch`, `update_bids_batch` use Meta Batch API (up to 50 ops/request) with auto-chunking and a 2s gap between chunks. |
| 250-ads-per-Page silent cap | `get_ads_volume` + automatic pre-flight check inside `activate_campaigns_batch` — warnings come back in the response before Meta starts any review. |
| Token-expired errors | `enhanceMetaError` detects codes 190 / 102 / 104 / 463 / 467 and returns a message pointing to the [stable-token setup](#stable-tokens). |
| Instagram placements without IG login | `get_pbia` auto-creates a Page-Backed Instagram Account and returns the `instagram_user_id` for your `object_story_spec`. |
| v22 deprecations | Uses `instagram_user_id`, no `degrees_of_freedom_spec`, no `asset_feed_id`. |
| Image hash scoping | Documented on `upload_image` + `create_ad_creative` — hashes are per-account, you must re-upload to each target account. (Cached per-account caching logic lives in ScaleForge's backend and will be added here in a later release.) |

---

## Tools reference

**32 tools** across 10 categories.

### Accounts (3)
| Name | Purpose |
| --- | --- |
| `list_ad_accounts` | List Ad Accounts accessible to the token |
| `get_ad_account` | Detailed info for one account (status, spend cap, balance) |
| `get_ads_volume` | Per-Page running-ads count + limit + remaining slots (pre-flight check) |

### Campaigns (5)
| Name | Purpose |
| --- | --- |
| `list_campaigns` | Paginated campaign list |
| `get_campaign` | Single campaign by ID |
| `create_campaign` | **WRITE** — create new campaign (defaults to PAUSED) |
| `update_campaign` | **WRITE** — update any mutable field |
| `delete_campaign` | **WRITE** — hard delete |

### Ad Sets (5)
| Name | Purpose |
| --- | --- |
| `list_adsets` | List by ad_account_id OR campaign_id |
| `get_adset` | Single ad set by ID |
| `create_adset` | **WRITE** — create ad set under a campaign |
| `update_adset` | **WRITE** — update targeting, bid, budget, status |
| `delete_adset` | **WRITE** — hard delete |

### Ads (4)
| Name | Purpose |
| --- | --- |
| `list_ads` | List by ad_account_id, adset_id, or campaign_id |
| `get_ad` | Single ad by ID (incl. creative + issues + preview link) |
| `update_ad` | **WRITE** — update name, status, swap creative |
| `delete_ad` | **WRITE** — hard delete |

### Creatives (4)
| Name | Purpose |
| --- | --- |
| `list_creatives` | List all creatives in an ad account |
| `get_creative` | Single creative by ID |
| `create_ad_creative` | **WRITE** — single-text creative via `object_story_spec` |
| `create_ad_creative_with_asset_feed` | **WRITE** — dynamic/multi-text creative via `asset_feed_spec` |

### Media (2)
| Name | Purpose |
| --- | --- |
| `upload_video` | **WRITE** — upload video via remote URL (returns video_id) |
| `upload_image` | **WRITE** — upload image via remote URL (returns image_hash, scoped to account) |

### Insights (3)
| Name | Purpose |
| --- | --- |
| `get_campaign_insights` | Metrics at campaign level with breakdowns |
| `get_adset_insights` | Metrics at ad set level |
| `get_ad_insights` | Metrics at ad level (compare creatives) |

### Bulk (3)
| Name | Purpose |
| --- | --- |
| `pause_campaigns_batch` | **WRITE (BULK)** — pause many campaigns via Batch API |
| `activate_campaigns_batch` | **WRITE (BULK)** — activate many + pre-flight ads_volume check |
| `update_bids_batch` | **WRITE (BULK)** — update `bid_amount` on many ad sets |

### Pages (2)
| Name | Purpose |
| --- | --- |
| `list_pages` | Facebook Pages the token can manage |
| `get_pbia` | Get or auto-create a Page-Backed Instagram Account |

### Ads Library (1)
| Name | Purpose |
| --- | --- |
| `search_ads_library` | Public Meta Ad Library search for competitive research |

---

## Example prompts

Once the server is connected, try these in your agent.

### Read-only

- *"List my Meta ad accounts and show me which ones are active, currency, and spend cap."*
- *"For campaign `1234567890`, pull last_14d insights with breakdown by placement — which placement has the lowest CPL?"*
- *"Show me the ads_volume for account `act_555` — any Page over 85% of its limit?"*
- *"Search the Meta Ad Library for ads from Competitor X running in the US in the last month."*
- *"List all ad sets in campaign `ABCD` and show which ones have is_dynamic_creative=true."*

### Write (confirm first)

> Write operations change live Meta Ads state — spend starts or stops immediately. A well-behaved agent (Claude, GPT-4) will show you the target list and ask "proceed?" before calling these.

- *"Pause campaigns `111`, `222`, `333` — show me their names and current spend first, then pause."*
- *"Activate campaigns `444` and `555`. Run the ads_volume pre-flight first; if any Page is over 85%, abort and tell me which."*
- *"Bump the bid on ad sets `6001` and `6002` to $4.50. Convert to cents for me."*
- *"Create a new campaign in `act_777` called 'Spring Promo Test', OUTCOME_LEADS objective, daily_budget 5000 cents, PAUSED."*

---

## FAQ

### How do I get a Meta access token?

See [Get a Meta Access Token](#get-a-meta-access-token) above. Two options: quick 2-hour token (Graph API Explorer) or stable System User token (Business Manager, never expires).

### Why does my token keep expiring?

You're using a **User access token** from the Graph API Explorer. Those expire in ~2 hours by design. For anything beyond experimentation, generate a **System User token** via Business Manager — those never expire. [Full steps here.](#stable-tokens)

### What's ads_volume?

Meta limits how many ads can be "running or in review" per Facebook Page — default 250 — and this limit is shared across every ad account using that Page. The `get_ads_volume` tool shows you how much headroom each Page has. `activate_campaigns_batch` calls it automatically as a pre-flight check.

### Is this free?

Yes. MIT license, npm package is free. You pay Meta for ads as usual. There is no ScaleForge account or subscription needed to use this MCP.

### How does this compare to Pipeboard / other MCPs?

- **Pipeboard / hosted MCPs** — run on their server, you send your token to them, they rate-limit you. Fine for very light usage, but the token lives on someone else's machine.
- **This MCP** — runs locally, your token never leaves your box, direct path to Meta. 32 tools (more coverage than any other Meta MCP we've seen).
- **ScaleForge managed platform** (see below) — a separate product for teams that want managed Meta access, RedTrack integration, scheduled auto-rules, UI dashboards. This MCP is a standalone tool that does not depend on it.

### Can I use this without ScaleForge?

Yes. This MCP is a standalone npm package — it talks straight to `graph.facebook.com`. No account anywhere.

### Can I contribute more tools?

Please do. PRs welcome at [github.com/Mike25app/scaleforge-mcp-meta-ads](https://github.com/Mike25app/scaleforge-mcp-meta-ads). Each tool is a small file in `src/tools/` — copy one of the existing files as a template.

---

## Powered by ScaleForge

Built and maintained by the [ScaleForge](https://getscaleforge.com) team. If you need managed Meta access (System User provisioning, RedTrack integration, scheduled auto-rules, dashboards), check out the full platform — this MCP stays free and standalone regardless.

---

## Security

- **Generate least-privilege tokens.** Scope your System User to only the ad accounts + Pages it needs. Revoking a token takes effect immediately.
- **Never commit tokens** to source control. The MCP reads from `META_ACCESS_TOKEN` env var — keep it in your agent host's secret store (Claude Desktop's env block, shell profile with 600 perms, 1Password, etc.).
- **Rotate periodically.** Even non-expiring System User tokens should be rotated on a team policy. Regenerating in Business Manager invalidates the old one.
- **No telemetry.** This MCP does not phone home. The only outbound requests it makes are to `https://graph.facebook.com/v24.0/*`.
- **Rate limits apply per token / per ad account** (Meta-side). Bulk tools automatically use Meta Batch API to stay under.

---

## Links

- **npm:** [@getscaleforge/mcp-meta-ads](https://www.npmjs.com/package/@getscaleforge/mcp-meta-ads)
- **GitHub:** [Mike25app/scaleforge-mcp-meta-ads](https://github.com/Mike25app/scaleforge-mcp-meta-ads)
- **Issues:** [github.com/Mike25app/scaleforge-mcp-meta-ads/issues](https://github.com/Mike25app/scaleforge-mcp-meta-ads/issues)
- **ScaleForge (managed platform):** [getscaleforge.com](https://getscaleforge.com)
- **Meta Marketing API docs:** [developers.facebook.com/docs/marketing-apis](https://developers.facebook.com/docs/marketing-apis)

---

## License

MIT — see [LICENSE](LICENSE).
