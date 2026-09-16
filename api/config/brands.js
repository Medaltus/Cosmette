/**
 * api/config/brands.js
 * Brand registry for Cosmette's own repo.
 *
 * Single-entry, matching Skinuva's own repo pattern (not évolis's
 * multi-brand registry) — Cosmette has its own dedicated repo, so
 * run-analysis.js / run-ppc-analysis.js / any future cron here always
 * gets called with { brand: "cosmette" }.
 *
 * skuPrefix:       first 3 chars of all SKUs for this brand — CONFIRMED
 *                   throughout this project's own dashboard work
 *                   (cosmette_index.html's BRAND_SKU_PREFIX convention,
 *                   e.g. COS0001, COS0002).
 * tabName:         slug used as the Google Sheet tab name on every
 *                   shared, multi-brand sheet this reads/writes
 *                   (Business Report, Insights, Listing Audit, Keyword
 *                   Tracker, Amazon Reviews, etc.) — MUST exactly match
 *                   the "cosmette" tab name already used on those sheets,
 *                   same as the frontend's own BRAND_SLUG convention
 *                   (window.SHEET_CFG.BRAND_SLUG, confirmed 'cosmette'
 *                   throughout the dashboard).
 * active:          set false to pause without deleting config.
 * amazonBrandName: EXACT string as registered in Amazon Brand Registry,
 *                   ALL CAPS. NOT CONFIRMED — placeholder below, matching
 *                   the brand name used elsewhere ("Cosmette Skincare")
 *                   but not independently verified against Brand
 *                   Registry. Confirm before any cron logic depends on
 *                   an exact match against this value.
 */
module.exports = [
  {
    id:              'cosmette',
    tabName:         'cosmette',
    skuPrefix:       'COS',
    displayName:     'Cosmette',
    amazonBrandName: 'COSMETTE SKINCARE', // NOT CONFIRMED — see header comment
    active:          true,
  },
];
