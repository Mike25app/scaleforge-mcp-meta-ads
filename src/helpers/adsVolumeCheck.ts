/**
 * Pre-flight check for Meta's per-Page ads volume cap.
 *
 * Meta enforces a limit (default 250) on ads-running-or-in-review *per Page*
 * — and this limit is shared across every ad account that uses the same Page.
 * Overshooting causes campaign activation to silently fail reviews. Always
 * call this before a bulk activation.
 *
 * The endpoint: GET /{ad_account_id}/ads_volume?show_breakdown_by_actor=true
 * Returns one row per Page ("actor") used by the account.
 */

import { metaGet } from "../client.js";

export interface AdsVolumePage {
  actor_id: string;
  actor_name?: string;
  ads_running_or_in_review_count: number;
  limit_on_ads_running_or_in_review?: number;
}

export interface AdsVolumeResult {
  pages: AdsVolumePage[];
  warnings: string[];
}

/**
 * Fetch the ad account's ads_volume breakdown and flag pages that would be
 * pushed over (or near) the limit by `plannedAdsCount` new ads.
 *
 * Threshold rules:
 *   - Hard warning ("only N slots left") when remaining < plannedAdsCount.
 *   - Soft warning ("approaching limit") when remaining < plannedAdsCount * 1.2.
 *
 * Callers should surface `warnings` to the user before proceeding.
 */
export async function checkAdsVolume(
  accountId: string,
  plannedAdsCount: number,
): Promise<AdsVolumeResult> {
  const path = accountId.startsWith("act_")
    ? `/${accountId}/ads_volume`
    : `/act_${accountId}/ads_volume`;

  const volume = await metaGet<{ data?: AdsVolumePage[] }>(path, {
    show_breakdown_by_actor: true,
    fields:
      "actor_id,actor_name,ads_running_or_in_review_count,limit_on_ads_running_or_in_review",
  });

  const pages = volume.data ?? [];
  const warnings: string[] = [];

  for (const page of pages) {
    const limit = page.limit_on_ads_running_or_in_review ?? 250;
    const running = page.ads_running_or_in_review_count ?? 0;
    const remaining = limit - running;
    const label = page.actor_name ?? page.actor_id ?? "unknown page";

    if (remaining < plannedAdsCount) {
      warnings.push(
        `⚠️ Page "${label}": only ${remaining} slots left (limit ${limit}, running ${running}) for ${plannedAdsCount} planned ads.`,
      );
    } else if (remaining < plannedAdsCount * 1.2) {
      warnings.push(
        `ℹ️ Page "${label}": approaching limit — ${remaining} slots left (limit ${limit}, running ${running}).`,
      );
    }
  }

  return { pages, warnings };
}
