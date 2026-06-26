// api/basecamp-auth.js
// Visit /api/basecamp-auth once in your browser to kick off the OAuth flow.
// DELETE this file after you have your refresh token.

export default function handler(req, res) {
  const clientId    = process.env.BASECAMP_CLIENT_ID;
  const redirectUri = 'https://cosmetteskincare.vercel.app/api/basecamp-callback';

  const url = `https://launchpad.37signals.com/authorization/new?type=web_server&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.redirect(url);
}
