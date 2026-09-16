/**
 * api/config/sheets.js
 * Google Sheet IDs for each data type — Cosmette's repo.
 * Add new sheet IDs here as env vars — never hardcode them.
 *
 * ADAPTED from the same brand-agnostic pattern already established on
 * Skinuva's/évolis's own repos (just names → env var values — see
 * config/brands.js for the actual brand-scoping via tabName). NOT
 * independently confirmed that Cosmette's repo doesn't already have its
 * own version of this file with different key names — if it does,
 * reconcile against that rather than blindly overwriting it, since
 * anything already working depends on whatever names are already live.
 *
 * IMPORTANT — this is a DIFFERENT env var layer than the frontend's own
 * SHEET_CONFIG: cosmette_index.html's window.SHEET_CFG is populated from
 * ONE combined SHEET_CONFIG env var (a JSON blob, read by
 * api/sheet-config.js). This file instead expects each sheet as its OWN
 * SEPARATE env var (SHEET_ORDERS, SHEET_ADVERTISING, etc.) — matching
 * how run-analysis.js/run-ppc-analysis.js already read them. These two
 * env var layers need to be kept in sync by hand (the same real sheet ID
 * has to be entered twice — once inside the SHEET_CONFIG JSON blob, once
 * as its own individual env var here) unless/until someone consolidates
 * them into one source of truth. Worth flagging to Jaclyn rather than
 * assuming either layer is authoritative.
 *
 * amazonReviews / vocThemes — ADDED 2026-09-15 for the new
 * run-voc-themes.js cron (see that file). Neither existed in this
 * config before; both need real SHEET_AMAZON_REVIEWS / SHEET_VOC_THEMES
 * env vars set in Vercel. SHEET_AMAZON_REVIEWS is the SAME shared,
 * cross-brand reviews sheet the frontend already reads (confirmed
 * elsewhere in this project) — same real sheet ID, just also needs its
 * own individual env var here per the note above. SHEET_VOC_THEMES is
 * brand new — a sheet that doesn't exist yet needs to be created before
 * this env var points at anything real.
 *
 * ── Env var → sheet mapping ──────────────────────────────────────────────────
 * SHEET_ORDERS                    rolling ~120-day order cache, per-brand tabs
 * SHEET_ORDERS_HISTORICAL         permanent historical order archive, per-brand tabs
 * SHEET_MASTER_SKU_LIST           Master SKU/ASIN list across all brands (Product Short Name tab)
 * SHEET_ADVERTISING               advertising cache (ad summary), per-brand tabs
 * SHEET_SUBSCRIPTIONS             subscribe & save sync
 * SHEET_REVENUE                   revenue history (monthly totals by brand)
 * SHEET_RETURNS                   FBA customer returns
 * SHEET_AD_ORDERS                 ad orders cache (ASIN-level ad performance)
 * SHEET_AD_SEARCH_TERMS           Amazon Ads search-term report, per-brand tabs
 * SHEET_LISTING_AUDIT             listing audit results, per-brand tabs — used by run-listing-audit.js
 * SHEET_INSIGHTS                  brand insights / monthly takeaways — used by run-analysis.js
 * SHEET_REPORT_INSIGHTS           editable report content + approval status for the dashboard (Exec Summary, Key Insights, Opportunity cards) — NOT the same sheet as SHEET_INSIGHTS
 * SHEET_BUSINESS_REPORT           Sales & Traffic business report (sessions/units), per-brand tabs — used by run-analysis.js, run-ppc-analysis.js
 * SHEET_SEARCH_QUERY_PERFORMANCE  Brand Analytics Search Query Performance, per-brand tabs — used by run-analysis.js
 * SHEET_KEYWORD_TRACKER           organic keyword rank tracking, per-brand tabs — used by run-analysis.js
 * SHEET_KEYWORD_TRACKER_SUMMARY   per-ASIN daily BSR/review/rating summary — separate tab on the same file as SHEET_KEYWORD_TRACKER, different gid, do not assume it's the same
 * SHEET_PRODUCT_INVENTORY         dated daily product+inventory snapshots, per-brand tabs — used by run-listing-audit.js, run-analysis.js
 * SHEET_STEWARDSHIP_SUMMARY       pre-computed monthly Brand Stewardship metrics (ads_spend, vine_total, promos_total, etc.)
 * SHEET_AMAZON_REVIEWS            shared, cross-brand Amazon review data, per-brand tabs — used by run-voc-themes.js
 * SHEET_VOC_THEMES                NEW — VOC theme output, written by run-voc-themes.js, read by the dashboard's VOC Themes card
 */

module.exports = {
  orders:                 process.env.SHEET_ORDERS,
  ordersHistorical:       process.env.SHEET_ORDERS_HISTORICAL,
  masterSkuList:          process.env.SHEET_MASTER_SKU_LIST,
  advertising:            process.env.SHEET_ADVERTISING,
  subscriptions:          process.env.SHEET_SUBSCRIPTIONS,
  revenue:                process.env.SHEET_REVENUE,
  returns:                process.env.SHEET_RETURNS,
  adOrders:               process.env.SHEET_AD_ORDERS,
  adSearchTerms:          process.env.SHEET_AD_SEARCH_TERMS,
  listingAudit:           process.env.SHEET_LISTING_AUDIT,
  insights:               process.env.SHEET_INSIGHTS,
  reportInsights:         process.env.SHEET_REPORT_INSIGHTS,
  businessReport:         process.env.SHEET_BUSINESS_REPORT,
  searchQueryPerformance: process.env.SHEET_SEARCH_QUERY_PERFORMANCE,
  keywordTracker:         process.env.SHEET_KEYWORD_TRACKER,
  keywordTrackerSummary:  process.env.SHEET_KEYWORD_TRACKER_SUMMARY,
  productInventory:       process.env.SHEET_PRODUCT_INVENTORY,
  stewardshipSummary:     process.env.SHEET_STEWARDSHIP_SUMMARY,
  amazonReviews:          process.env.SHEET_AMAZON_REVIEWS,
  vocThemes:              process.env.SHEET_VOC_THEMES,
};
