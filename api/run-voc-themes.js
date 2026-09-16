/**
 * api/run-voc-themes.js
 * GET/POST /api/run-voc-themes
 *
 * Reads Cosmette's Amazon reviews (SHEET_AMAZON_REVIEWS), groups them by
 * product_category, and asks Claude to identify recurring THEMES per
 * category — what customers keep bringing up, positive or negative.
 * Writes results to a new sheet (SHEET_VOC_THEMES) that the external
 * Inventory page's "VOC Themes — {category}" card reads from. That card
 * currently shows a static placeholder ("Not automated yet") — this is
 * what wires it up to real data.
 *
 * BUILT 2026-09-15 per Jaclyn, modeled directly on run-analysis.js's
 * established pattern: deterministic work (grouping, date bucketing,
 * "which themes still have supporting evidence") happens in code, and
 * Claude's only job is turning real review text into a structured theme
 * list — same division of labor as everywhere else in this file's
 * sibling crons, so Claude is never asked to invent or recall anything
 * it wasn't just handed directly in the prompt.
 *
 * UNLIKE run-analysis.js (explicitly documented there as manually
 * triggered from a dashboard button, intentionally not a cron): Jaclyn
 * asked for this one AS a cron specifically, so this checks CRON_SECRET
 * the way Vercel's own scheduled-function docs describe, matching this
 * project's other real crons (sync-oos-history.js etc. per earlier
 * project notes) rather than run-analysis.js's own no-auth pattern.
 * Still callable manually too (see handler below) for testing before
 * trusting the schedule.
 *
 * THE "RESOLVED THEME" REQUIREMENT — the actual hard part of this build,
 * per Jaclyn directly: older reviews can surface a theme (e.g. "packaging
 * leaks in transit") that's since been fixed by a real packaging or
 * pricing change, and that theme shouldn't keep showing as a current
 * issue just because it's sitting in the historical review pool. This is
 * handled the same way run-analysis.js handles "is this recommendation
 * still relevant" (see its historicalCtx / buildListingImplementationStatus
 * pattern) — NOT by silently aging old reviews out, but by explicitly
 * feeding Claude BOTH (a) this category's theme list from the last run
 * and (b) only RECENT reviews (last RECENT_WINDOW_DAYS, see below), and
 * asking it to mark each carried-over theme as "active" (recent reviews
 * still support it) or "resolved" (no longer showing up in recent
 * reviews, despite being real in the past) — a judgment Claude can only
 * make correctly because it's being handed the real recent-review
 * evidence, not asked to guess from memory.
 *
 * ASSUMPTIONS BELOW THAT NEED A REAL LOOK, NOT JUST A GUESS:
 *   - sheets.amazonReviews / sheets.vocThemes: NEITHER of these keys
 *     exists yet in config/sheets.js as of what I have access to (only
 *     Skinuva's copy of that file, not Cosmette's own — Cosmette's may
 *     already differ). Both need to be added there, pointing at real env
 *     vars (SHEET_AMAZON_REVIEWS, SHEET_VOC_THEMES), before this will run
 *     at all — see the two require()'d fallback constants below, which
 *     exist ONLY so this file doesn't hard-crash on require() if those
 *     keys are still missing; they are not a substitute for actually
 *     adding the real config.
 *   - RECENT_WINDOW_DAYS = 730 (2 years) — CONFIRMED per Jaclyn (2026-09-16)
 *     after the first real run: 90 days was too tight and left Cleansers/
 *     Eyes with zero recent reviews (skipped entirely) and Moisturizer
 *     with only 1 (not enough to write a real theme from).
 *   - product_category values come directly from the review sheet's own
 *     column (same convention the frontend's initExternalReviews() already
 *     uses) — whatever distinct values exist there is what this groups
 *     by, no hardcoded category list.
 *   - CRON_SECRET: assumed to already exist as a Vercel env var, matching
 *     this project's other real crons — not independently verified here.
 */

const { readRows, ensureTab, appendRows } = require('./config/_sheets_client');
const sheets = require('./config/sheets');
const brands = require('./config/brands');

// See the ASSUMPTIONS note above — these are the real env var names this
// needs; sheets.amazonReviews / sheets.vocThemes should be added to
// config/sheets.js pointing at these exact same env vars, so every other
// cron/endpoint that ever needs these sheets has one shared source of
// truth instead of a second copy living only in this file.
const AMAZON_REVIEWS_SHEET_ID = sheets.amazonReviews || process.env.SHEET_AMAZON_REVIEWS;
const VOC_THEMES_SHEET_ID = sheets.vocThemes || process.env.SHEET_VOC_THEMES;
// Master SKU List — CONFIRMED against the dashboard's own
// csFetchProductNames() logic (cosmette_index.html): column K holds
// "Product Category" as a verbose breadcrumb like "COS • Cleansers",
// and the dashboard strips everything up to and including "• " to get
// the clean category name. Used here for the SAME reason the dashboard
// uses it instead of the reviews sheet's own product_category column
// (see the category-grouping note above groupByCategory()) — themes
// need to land under the exact category key the frontend groups
// reviews by, or the VOC Themes card will never find a matching row.
const MASTER_SKU_LIST_SHEET_ID = sheets.masterSkuList || process.env.SHEET_MASTER_SKU_LIST;

const VOC_THEMES_HEADERS = ['date', 'category', 'themes_json', 'review_count', 'uploaded_at'];

// How far back counts as "recent enough to reflect current reality" for
// judging whether an older theme is still active. See ASSUMPTIONS above.
const RECENT_WINDOW_DAYS = 730; // 2 years — confirmed 90 was too tight (2026-09-16 run: Cleansers/Eyes had zero reviews within 90 days, Moisturizer only had 1)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cron auth — GET requests (Vercel's own scheduled-function trigger)
  // must carry the shared secret. POST is left open the same way
  // run-analysis.js's manual trigger is, for testing this from a
  // dashboard button before trusting the schedule — tighten this if
  // that manual path shouldn't be unauthenticated in production.
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    if (!process.env.CRON_SECRET) {
      return res.status(500).json({ error: 'CRON_SECRET not configured' });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const brandId = (req.body && req.body.brand) || req.query.brand || 'cosmette';
  const brand = brands.find(b => b.id === brandId && b.active);
  if (!brand) return res.status(400).json({ error: `Brand '${brandId}' not found or not active` });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  if (!AMAZON_REVIEWS_SHEET_ID) {
    return res.status(500).json({ error: 'SHEET_AMAZON_REVIEWS not configured (sheets.amazonReviews / env var) — see file header.' });
  }
  if (!VOC_THEMES_SHEET_ID) {
    return res.status(500).json({ error: 'SHEET_VOC_THEMES not configured (sheets.vocThemes / env var) — see file header.' });
  }
  if (!MASTER_SKU_LIST_SHEET_ID) {
    return res.status(500).json({ error: 'SHEET_MASTER_SKU_LIST not configured — needed to match the dashboard\'s own category grouping. See file header.' });
  }

  try {
    const t0 = Date.now();
    const results = await runVocThemesForBrand(brand, apiKey);
    console.log(`[run-voc-themes] ${brand.id} — done in ${Date.now() - t0}ms, ${results.length} categories processed`);
    return res.status(200).json({ ok: true, categories: results.map(r => r.category) });
  } catch (err) {
    console.error(`[run-voc-themes] ${brand.id} failed:`, err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
};

// ── Deterministic grouping/date logic — same "compute in code, Claude only
// writes prose against real numbers" split as run-analysis.js. ──────────────

// Matches cosmette_index.html's csBaseSku() exactly (strip trailing
// "-SF", uppercase, trim) — needed so review rows' sku column joins to
// the Master SKU List the same way the dashboard's own lookups do.
function baseSku(s) {
  return (s || '').trim().toUpperCase().replace(/-SF$/i, '');
}

// Matches cosmette_index.html's csFetchProductNames() category-parsing
// exactly: column K is a verbose breadcrumb like "COS • Cleansers" —
// strip everything up to and including "• " to get the clean name the
// rest of the dashboard actually groups by.
function buildCategoryBySku(masterSkuRows) {
  const categoryBySku = {};
  masterSkuRows.forEach(r => {
    const sku = baseSku(r.SKU || r.sku);
    const rawCategory = (r['Product Category'] || r.product_category || '').trim();
    const category = rawCategory.replace(/^[^•]*•\s*/, '').trim();
    if (sku && category) categoryBySku[sku] = category;
  });
  return categoryBySku;
}

// Groups by the SAME clean category the frontend's initExternalReviews()
// groups by (Master SKU List category via SKU lookup) — NOT this sheet's
// own product_category column, which is a different, more verbose Amazon
// taxonomy string. A theme written under the wrong category key would
// simply never be found by the VOC Themes card, which reads by this
// clean category name.
function groupByCategory(reviews, categoryBySku) {
  const byCategory = new Map();
  reviews.forEach(r => {
    const sku = baseSku(r.sku);
    const cat = categoryBySku[sku] || 'Uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(r);
  });
  return byCategory;
}

function splitRecentVsOlder(categoryReviews) {
  const now = Date.now();
  const cutoff = now - RECENT_WINDOW_DAYS * MS_PER_DAY;
  const recent = [], older = [];
  categoryReviews.forEach(r => {
    const t = Date.parse(r.date);
    if (!isNaN(t) && t >= cutoff) recent.push(r);
    else older.push(r);
  });
  return { recent, older };
}

// Pulls this category's theme list from the LAST run only (not every
// historical run — an old theme that's already been marked resolved once
// shouldn't need re-litigating every single run forever; if it genuinely
// recurs, it'll show up again in a future run's recent-review evidence
// and get re-flagged as active then).
function getPreviousThemesForCategory(themeHistoryRows, category) {
  const rowsForCat = themeHistoryRows
    .filter(r => (r.category || '') === category)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!rowsForCat.length) return null;
  const last = rowsForCat[rowsForCat.length - 1];
  try {
    return JSON.parse(last.themes_json || '[]');
  } catch (e) {
    console.warn(`[run-voc-themes] ${category} — could not parse previous themes_json, treating as no prior history:`, e.message);
    return null;
  }
}

function trimReviewForPrompt(r) {
  // Only what Claude actually needs — keeps the prompt from ballooning on
  // a category with hundreds of reviews, and avoids sending reviewer PII
  // (name) that has no bearing on theme extraction.
  return {
    date: r.date,
    rating: r.star_rating,
    title: (r.review_title || '').slice(0, 200),
    text: (r.review_text || '').slice(0, 600),
  };
}

async function runVocThemesForBrand(brand, apiKey) {
  const [reviewRows, themeHistoryRows, masterSkuRows] = await Promise.all([
    readRows(AMAZON_REVIEWS_SHEET_ID, brand.tabName).catch(() => []),
    readRows(VOC_THEMES_SHEET_ID, brand.tabName).catch(() => []),
    // Master SKU List is one shared tab across all brands, literally
    // named "Product Short Name" — confirmed directly, not brand.tabName.
    readRows(MASTER_SKU_LIST_SHEET_ID, 'Product Short Name').catch(() => []),
  ]);
  console.log(`[run-voc-themes] ${brand.id} — reviewRows:${reviewRows.length} themeHistoryRows:${themeHistoryRows.length} masterSkuRows:${masterSkuRows.length}`);

  const categoryBySku = buildCategoryBySku(masterSkuRows);
  const byCategory = groupByCategory(reviewRows, categoryBySku);
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  // Sequential, not Promise.all — matches run-analysis.js's own caution
  // around Claude calls (see its 250s-per-call timeout note): running
  // every category's Claude call in parallel risks several long
  // generations stacking against Vercel's function-level time budget at
  // once, where sequential at least fails one category at a time instead
  // of risking the whole run.
  for (const [category, categoryReviews] of byCategory.entries()) {
    const { recent, older } = splitRecentVsOlder(categoryReviews);
    const previousThemes = getPreviousThemesForCategory(themeHistoryRows, category);

    if (!recent.length) {
      console.log(`[run-voc-themes] ${brand.id}/${category} — no reviews in the last ${RECENT_WINDOW_DAYS} days, skipping (nothing new to judge resolution against).`);
      continue;
    }

    const themes = await extractThemesForCategory({
      brand, category, recentReviews: recent, olderReviewCount: older.length, previousThemes, apiKey,
    });

    const row = [today, category, JSON.stringify(themes), String(categoryReviews.length), new Date().toISOString()];
    const token = await ensureTab(VOC_THEMES_SHEET_ID, brand.tabName, VOC_THEMES_HEADERS);
    await appendRows(VOC_THEMES_SHEET_ID, brand.tabName, [row], token);
    console.log(`[run-voc-themes] ${brand.id}/${category} — wrote ${themes.length} themes (${recent.length} recent reviews, ${older.length} older).`);
    results.push({ category, themes });
  }

  return results;
}

async function extractThemesForCategory({ brand, category, recentReviews, olderReviewCount, previousThemes, apiKey }) {
  const recentTrimmed = recentReviews.map(trimReviewForPrompt);

  const previousThemesSection = previousThemes && previousThemes.length
    ? `PREVIOUSLY IDENTIFIED THEMES FOR THIS CATEGORY (from the last run):\n${JSON.stringify(previousThemes)}\n\nFor each of these, decide based ONLY on the recent reviews below whether it's still "active" (recent reviews still support it) or "resolved" (recent reviews no longer show this issue, even though it was real before — likely because of a packaging, formula, or pricing change). Do not resolve a theme just because a run happened; only resolve it if the recent evidence genuinely doesn't support it anymore.`
    : `No prior theme history exists for this category yet — this is the first run.`;

  const systemPrompt = `You are analyzing real Amazon customer reviews for ${brand.displayName || brand.id}, product category "${category}". Identify recurring THEMES — specific, concrete things multiple customers bring up, not generic restatements of the star rating. A theme needs real supporting evidence from the reviews you're given; never invent one.

Return ONLY a JSON array, no prose outside it. Each theme object:
{
  "theme": "short, specific label (e.g. 'Packaging leaks during shipping', 'Scent is stronger than expected')",
  "status": "active" | "resolved" | "new",
  "sentiment": "positive" | "negative" | "mixed",
  "supporting_review_count": <number of the RECENT reviews that support this theme>,
  "example_quote": "<one short real quote, under 25 words, from an actual review below — never paraphrase this into something no review said>",
  "note": "<1 sentence: what this means for the brand, e.g. 'worth revisiting the shipping box insert' — only if genuinely useful, otherwise empty string>"
}

Rules:
- "resolved" only applies to a theme carried over from PREVIOUSLY IDENTIFIED THEMES below that the recent reviews no longer support.
- "new" is for a real theme with no match in the previous list.
- "active" is for a theme (whether carried over or newly spotted) that the recent reviews currently support.
- Do not fabricate a quote — every example_quote must be copyable verbatim from one of the reviews you're given.
- Skip anything that only one review mentions unless it's a safety/quality concern worth flagging regardless of volume.`;

  const userPrompt = `${previousThemesSection}

RECENT REVIEWS (last ${RECENT_WINDOW_DAYS} days, ${recentReviews.length} total — this is the evidence to judge both new and carried-over themes against):
${JSON.stringify(recentTrimmed)}

(${olderReviewCount} additional older reviews exist for this category but are intentionally excluded from judging current themes — only used historically to originally identify carried-over themes.)`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 250000); // same 250s client-side abort as run-analysis.js, see that file's comment for why

  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      console.error(`[run-voc-themes] ${category} — Claude call aborted after 250s. Returning empty theme list for this category rather than failing the whole run.`);
      return [];
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    console.error(`[run-voc-themes] ${category} — Claude API error ${claudeRes.status}: ${errText.slice(0, 300)}`);
    return []; // one category's failure shouldn't take down every other category's run
  }

  const data = await claudeRes.json();
  const text = (data.content || []).map(b => b.text || '').join('');
  try {
    const cleaned = text.replace(/^```json\s*|```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[run-voc-themes] ${category} — could not parse Claude's response as JSON:`, e.message, '— raw response:', text.slice(0, 500));
    return [];
  }
}
