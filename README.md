# ScaleForge MCP Server

> **Control bulk Meta Ads campaigns from Claude, ChatGPT, Cursor, or any MCP-compatible AI agent.**

[![npm](https://img.shields.io/npm/v/@getscaleforge/mcp-meta-ads.svg)](https://www.npmjs.com/package/@getscaleforge/mcp-meta-ads)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-blue.svg)](#prerequisites)

---

## The problem

Running Meta (Facebook/Instagram) Ads at scale is a coordination nightmare:

- **Manual campaign creation** — even with Meta Ads Manager's bulk import, setting up 50 campaigns across 10 ad accounts with varied bids and creatives takes hours of clicking.
- **Rate-limit whack-a-mole** — Meta caps API calls per account; without backoff logic, your scripts 429 halfway through a launch.
- **No unified view** — Meta Ads insights don't merge with your RedTrack/conversion data, so ROAS numbers never match.
- **Glue code rots** — every media buyer eventually writes the same Python script to pause underperformers; it breaks whenever Meta changes a field.
- **Agent-unfriendly** — the Meta Marketing API has no MCP server, no OpenAPI spec, and no LLM-friendly docs.

## The solution

**ScaleForge** is a managed Rails 8 platform that solves all of the above, and this package exposes its public API to AI agents via the **Model Context Protocol**.

With this MCP server installed, you can do things like:

> "Pause all campaigns on Account-17 whose CPL exceeds $5 and activate the ones with ROAS > 2.0 from the last 7 days."

— and Claude (or ChatGPT, Cursor, etc.) actually does it.

---

## Architecture

```
┌──────────────┐      MCP stdio      ┌───────────────────┐     HTTPS + Bearer    ┌──────────────────┐
│ Claude / GPT │ ◄─────────────────► │  scaleforge-mcp   │ ◄───────────────────► │ ScaleForge API   │
│   Cursor     │   JSON-RPC over     │  (this package)   │    /api/v1/*          │ getscaleforge    │
│ ChatGPT Desk │     stdin/stdout    │                   │                       │     .com         │
└──────────────┘                     └───────────────────┘                       └────────┬─────────┘
                                                                                          │
                                                                                          ▼
                                                                          ┌───────────────────────────┐
                                                                          │ Meta Marketing API v24.0  │
                                                                          │ Meta Conversions API      │
                                                                          │ RedTrack, Firebase, etc.  │
                                                                          └───────────────────────────┘
```

Your agent never touches Meta's API directly — ScaleForge handles rate limits, batch ops, PBIA provisioning, and dual-source analytics. The MCP server is a thin translation layer (Zod-validated tools → HTTP calls).

---

## What it does

- **Accounts & pre-flight checks** — list Meta ad accounts, inspect per-Page ads volume and capacity (avoid the 250-ads-per-Page cap before launching).
- **Campaign ops** — list, inspect, pause, and activate campaigns (Meta Batch API on the backend — no rate-limit flaps).
- **Analytics** — pull combined Meta + RedTrack summaries (spend, leads, conversions, ROI) over any date range.
- **Bulk uploads** — monitor long-running upload sessions with progress and error detail.
- **Watchlist** — track competitor ad pages and see which new ads appeared since your last scan.

10 tools total; see [Tools reference](#tools-reference) below.

---

## vs. the native alternative

| | Meta Ads Manager UI | Meta Marketing API (raw) | **ScaleForge MCP** |
|---|---|---|---|
| Bulk create 50 campaigns from template | 30-60 min clicking | Write + maintain a Python wrapper | One prompt |
| Automatic rate-limit retry | N/A | You build it | Built-in (Batch API + backoff) |
| Combined Meta + RedTrack ROAS | No | Custom pipeline | One API call |
| Usable by AI agent | No | OpenAPI you maintain yourself | Installed in 30 seconds |
| Multi-account unified | Partial (Business Manager) | Every call is per-account | Single token, all accounts |

---

## Quick start — one command

### Claude Code

```bash
claude mcp add scaleforge \
  --env SCALEFORGE_API_TOKEN=sf_live_your_token \
  -- npx -y @getscaleforge/mcp-meta-ads
```

### Claude Desktop / Cursor / Windsurf / Continue — via Smithery

```bash
npx -y @smithery/cli install @getscaleforge/mcp-meta-ads --client claude
# also: --client cursor | windsurf | continue
```

Smithery auto-writes the config file for the selected client and prompts you for the API token. One command, works on macOS / Linux / Windows.

### Just test locally (no client setup)

```bash
SCALEFORGE_API_TOKEN=sf_live_your_token npx -y @getscaleforge/mcp-meta-ads
```

The server starts on stdio; use `@modelcontextprotocol/inspector` to poke it interactively:

```bash
npx -y @modelcontextprotocol/inspector npx -y @getscaleforge/mcp-meta-ads
```

---

## Prerequisites

- **Node.js 20+**
- A **ScaleForge account** — sign up at [getscaleforge.com](https://getscaleforge.com)
- A **ScaleForge API token** — generate one at [getscaleforge.com/api_keys](https://getscaleforge.com/api_keys)

---

## Install

```bash
npm install -g @getscaleforge/mcp-meta-ads
```

For local development before publish:

```bash
git clone https://github.com/Mike25app/scaleforge-mcp-meta-ads.git
cd scaleforge-mcp-meta-ads
npm install
npm run build
# binary lives at: dist/index.js
```

---

## Claude Desktop setup

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) — create it if missing:

```json
{
  "mcpServers": {
    "scaleforge": {
      "command": "npx",
      "args": ["-y", "@getscaleforge/mcp-meta-ads"],
      "env": {
        "SCALEFORGE_API_TOKEN": "sf_live_your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop. The 10 ScaleForge tools appear under the hammer icon.

## Claude Code setup

```bash
claude mcp add scaleforge \
  --env SCALEFORGE_API_TOKEN=sf_live_your_token_here \
  -- npx -y @getscaleforge/mcp-meta-ads
```

Verify with `claude mcp list`.

## Cursor setup

Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "scaleforge": {
      "command": "npx",
      "args": ["-y", "@getscaleforge/mcp-meta-ads"],
      "env": {
        "SCALEFORGE_API_TOKEN": "sf_live_your_token_here"
      }
    }
  }
}
```

## ChatGPT Desktop setup

ChatGPT Desktop's MCP catalog uses the same stdio transport. Point it at the `scaleforge-mcp` binary with `SCALEFORGE_API_TOKEN` in the environment.

---

## Tools reference

| Name | Description | Scope required |
| --- | --- | --- |
| `list_ad_accounts` | List Meta ad accounts owned by the user | `accounts:read` |
| `get_ads_volume` | Per-Page running-ads count + limit + remaining (pre-flight check) | `accounts:read` |
| `list_campaigns` | Paginated campaigns list with Meta status + ids + bid + budget | `campaigns:read` |
| `get_campaign` | Single campaign details | `campaigns:read` |
| `pause_campaigns` | **WRITE** — pause campaigns on Meta (batch job) | `campaigns:write` |
| `activate_campaigns` | **WRITE** — activate campaigns on Meta (batch job) | `campaigns:write` |
| `get_analytics_summary` | Per-account totals: spend / revenue / conversions / ROI for a date range | `analytics:read` |
| `list_uploads` | Paginated bulk upload sessions with progress | `uploads:read` |
| `get_upload` | Single upload with its child campaign jobs | `uploads:read` |
| `list_watchlist` | Tracked competitor pages + latest scan (new/removed ads) | `watchlist:read` |

---

## Example prompts

Once the server is connected, try these in your agent:

### Read-only monitoring

- *"Show me my top 10 active campaigns by ROAS over the last 7 days."*
- *"What's my ads_volume utilization across all pages? Flag any over 85%."*
- *"Which bulk uploads failed in the last 24h and why?"*
- *"Which competitor pages added the most new ads this week?"*
- *"Compare my Meta-reported spend vs RedTrack revenue for March — where's the biggest ROAS gap?"*

### Interactive with confirmation

- *"Pause every campaign on Account-17 with CPL greater than $5 — list them first and confirm before pausing."*
- *"Activate the top 5 campaigns by ROAS from yesterday's dashboard — show me which they are first."*

> **Write operations require user confirmation.** `pause_campaigns` and `activate_campaigns` change live Meta Ads state. A well-behaved agent (Claude, GPT-4) will always show you the target list and ask "proceed?" before calling these tools.

---

## FAQ

### How is this different from LangChain's Meta Ads toolkit?

LangChain toolkits typically wrap the raw Meta API — meaning you inherit all the rate-limit, batch, and multi-account pain. This MCP server talks to ScaleForge's managed API, which already solved those problems for thousands of campaign launches.

### Does this work with self-hosted ScaleForge?

Yes — set `SCALEFORGE_API_URL=https://your-domain.com` in the env. Auth still uses Bearer tokens.

### Can my agent accidentally spend my whole budget?

Write tools are flagged in their descriptions, and a properly-configured agent (Claude, GPT-4, Cursor) will ask before calling them. For stronger guarantees, issue a **read-only token** (`*:read` scopes only) to monitoring agents, and reserve `*:write` tokens for interactive sessions where you supervise every action.

### What happens if I hit a rate limit?

ScaleForge returns `429 Too Many Requests` with a `Retry-After` header. The MCP server surfaces this error to the agent, which typically retries after the indicated delay. Rate limits are per plan: Free 100/h, Starter 500/h, Pro 1000/h, Agency 5000/h.

### Can I use this without a ScaleForge account?

No — every API call requires a valid ScaleForge token tied to a paid account. See [pricing](https://getscaleforge.com/pricing).

### Is the source open?

Yes — MIT license, code at [github.com/Mike25app/scaleforge-mcp-meta-ads](https://github.com/Mike25app/scaleforge-mcp-meta-ads). PRs welcome.

---

## Configuration

Set via environment variables:

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SCALEFORGE_API_TOKEN` | yes | — | Bearer token from `/api_keys` |
| `SCALEFORGE_API_URL` | no | `https://getscaleforge.com` | Override for staging / self-hosted |

---

## Security

- **Generate least-privilege tokens.** The token-creation UI lets you grant only specific scopes — use a read-only token (`*:read`) for monitoring-only agents, and reserve `*:write` scopes for tokens used by agents that need to pause/activate.
- **Revoke at any time** from the dashboard's API Keys page — revocation takes effect immediately.
- **Rotate periodically.** Tokens have no built-in expiry; rotate them on a schedule that matches your team's policy.
- **Never commit tokens** to source control. The MCP server reads from env vars; keep them in your agent host's secret store.
- **Rate limits apply per token**, per your ScaleForge plan: Free 100/h, Starter 500/h, Pro 1000/h, Agency 5000/h. `429 Too Many Requests` is returned on exceed.

---

## Links

- **Website:** [getscaleforge.com](https://getscaleforge.com)
- **OpenAPI spec:** [getscaleforge.com/api-docs/v1/swagger.yaml](https://getscaleforge.com/api-docs/v1/swagger.yaml)
- **Interactive API docs:** [getscaleforge.com/api-docs](https://getscaleforge.com/api-docs)
- **LLM-friendly summary:** [getscaleforge.com/llms.txt](https://getscaleforge.com/llms.txt)
- **Support:** [michael@getscaleforge.com](mailto:michael@getscaleforge.com)
- **Issues:** [github.com/Mike25app/scaleforge-mcp-meta-ads/issues](https://github.com/Mike25app/scaleforge-mcp-meta-ads/issues)

---

## License

MIT — see [LICENSE](LICENSE).

Built by the [ScaleForge](https://getscaleforge.com) team.
