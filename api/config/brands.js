/**
 * api/config/brands.js
 * Brand registry for Cosmette's own repo.
 *
 * Same single-brand-repo pattern as Skinuva's: this repo only ever
 * processes Cosmette itself, so a single-entry array is intentional here,
 * not a placeholder to fill in later.
 *
 * skuPrefix:       first 3 chars of all SKUs for this brand — confirmed
 *                   directly by Jaclyn 2026-08-20 (Master SKU List tab,
 *                   row 518, column D).
 * tabName:         slug used as the Google Sheet tab name — this is what
 *                   every readRows/ensureTab/appendRows call uses to select
 *                   which brand's tab to read/write on each shared,
 *                   multi-brand sheet (Business Report, Insights, Listing
 *                   Audit, Report Insights, etc.). Confirmed against
 *                   SHEET_CONFIG (the config grid's "cosmette" row) and
 *                   against the Report Insights file directly (tabs
 *                   "cosmette" gid 2109495361, "cosmette_events" gid
 *                   1869251435 — both already exist).
 * active:          set false to pause without deleting config.
 * amazonBrandName: EXACT string as registered in Amazon Brand Registry,
 *                   ALL CAPS. Confirmed by Jaclyn 2026-08-20 — Brand
 *                   Registry itself shows "Cosmette Skincare"; the
 *                   Subscribe & Save surface (which pulls from évolis's
 *                   repo) shows it fully capitalized as below.
 */
module.exports = [
  {
    id:              'cosmette',
    tabName:         'cosmette',
    skuPrefix:       'COS',
    displayName:     'Cosmette',
    amazonBrandName: 'COSMETTE SKINCARE',
    active:          true,
  },
];
