// api/holiday-schedule.js
// Finds the current Holiday Schedule PDF in the shared Google Drive folder
// and redirects to a download link. Always serves whatever is currently
// in the folder, so updating the PDF in Drive is the only maintenance needed.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const folderId    = process.env.GOOGLE_HOLIDAY_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    return res.status(500).json({ error: 'Missing Google Drive configuration' });
  }

  // ── Step 1: Build a signed JWT and exchange it for an access token ──
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(clientEmail, privateKey);
  } catch (err) {
    return res.status(500).json({ error: 'Google auth failed', detail: err.message });
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  // ── Step 2: Search the folder for the Holiday Schedule PDF ──────────
  let fileId;
  try {
    const query = encodeURIComponent(
      `'${folderId}' in parents and name contains 'Holiday Schedule' and mimeType = 'application/pdf' and trashed = false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
      { headers }
    );
    if (!searchRes.ok) {
      const err = await searchRes.text();
      return res.status(500).json({ error: 'Drive search failed', detail: err });
    }
    const data = await searchRes.json();
    if (!data.files || data.files.length === 0) {
      return res.status(404).json({ error: 'No Holiday Schedule PDF found in folder' });
    }
    fileId = data.files[0].id; // most recently modified match
  } catch (err) {
    return res.status(500).json({ error: 'Error searching Drive folder', detail: err.message });
  }

  // ── Step 3: Stream the file directly to the browser ──────────────────
  try {
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers }
    );
    if (!fileRes.ok) {
      const err = await fileRes.text();
      return res.status(500).json({ error: 'Could not download file', detail: err });
    }

    const buffer = await fileRes.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="2026 Holiday Schedule.pdf"');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Error streaming file', detail: err.message });
  }
}

// ── Helper: Create a signed JWT and exchange for a Google access token ──
async function getGoogleAccessToken(clientEmail, privateKey) {
  const crypto = await import('crypto');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsigned = `${base64url(header)}.${base64url(claimSet)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error('Token exchange failed: ' + err);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}
