// api/sheet-config.js
//
// Reconstructed 2026-08-19 for Cosmette based on the documented behavior in
// Skinuva's/évolis's HTML (comment: "Resolves this brand's sheet file IDs/gids
// server-side from the SHEET_CONFIG env var and sets window.SHEET_CFG before
// any other inline script below runs — keeps raw sheet IDs out of
// client-visible source."). This is NOT a copy of the original file — I don't
// have repo access to Skinuva's/évolis's actual api/sheet-config.js. If you
// want Cosmette's byte-for-byte identical to theirs, diff this against the
// real one before relying on it in production.
//
// Expects: process.env.SHEET_CONFIG to be a JSON string shaped like
//   { "SHEET_ORDERS": { "fileId": "...", "gid": "..." }, ... }
// (exactly the shape of cosmette_sheet_config.json generated earlier).
//
// Serves it back as executable JS (not JSON) so it can be loaded via
// <script src="/api/sheet-config"></script> in <head>, before any other
// inline script that reads window.SHEET_CFG.

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  // Short cache — sheet config changes rarely, but a bad deploy shouldn't be
  // stuck cached for long. Adjust if Vercel's edge cache behavior differs
  // from what's assumed here.
  res.setHeader('Cache-Control', 'public, max-age=300');

  const raw = process.env.SHEET_CONFIG;

  if (!raw) {
    console.error('[sheet-config] SHEET_CONFIG env var is not set.');
    res.status(200).send('window.SHEET_CFG = {};');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[sheet-config] SHEET_CONFIG env var is not valid JSON:', err.message);
    res.status(200).send('window.SHEET_CFG = {};');
    return;
  }

  // JSON.stringify output is valid JS object-literal syntax, so this is safe
  // to inline directly — no risk of breaking out of the assignment.
  res.status(200).send(`window.SHEET_CFG = ${JSON.stringify(parsed)};`);
};
