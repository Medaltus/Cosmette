// api/basecamp-callback.js
// Basecamp redirects here after you approve access.
// This exchanges the code for tokens and displays the refresh token on screen.
// DELETE this file after you have copied your refresh token into Vercel env vars.

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No authorization code received. Did you visit /api/basecamp-auth first?');
  }

  const clientId     = process.env.BASECAMP_CLIENT_ID;
  const clientSecret = process.env.BASECAMP_CLIENT_SECRET;
  const redirectUri  = 'https://cosmetteskincare.vercel.app/api/basecamp-callback';

  try {
    const tokenRes = await fetch(
      `https://launchpad.37signals.com/authorization/token?type=web_server&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(500).send('Token exchange failed: ' + err);
    }

    const data = await tokenRes.json();

    // Display the refresh token so you can copy it into Vercel env vars
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Basecamp Auth Success</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; }
          h2 { color: #001F60; }
          .token-box { background: #f5f6f9; border: 1px solid #ccd3d5; border-radius: 8px; padding: 16px; margin: 16px 0; word-break: break-all; font-family: monospace; font-size: 13px; }
          .warn { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <h2>✅ Basecamp Authorization Successful</h2>
        <p>Copy the refresh token below and add it to Vercel as <strong>BASECAMP_REFRESH_TOKEN</strong>:</p>
        <div class="token-box">${data.refresh_token}</div>
        <p style="font-size:12px;color:#6b7ba2;">Access token (expires in 2 weeks — you don't need to save this):<br>${data.access_token}</p>
        <div class="warn">
          ⚠️ <strong>Once you've saved the refresh token to Vercel, delete both <code>api/basecamp-auth.js</code> and <code>api/basecamp-callback.js</code> from your repo.</strong>
          These endpoints are a security risk if left live.
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    res.status(500).send('Error during token exchange: ' + err.message);
  }
}
