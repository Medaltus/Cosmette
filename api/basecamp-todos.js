// api/basecamp-todos.js
// Fetches top-level todos (no subtasks) from the Brand Onboarding todolist
// Uses refresh token to get a fresh access token on every call

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId      = process.env.BASECAMP_CLIENT_ID;
  const clientSecret  = process.env.BASECAMP_CLIENT_SECRET;
  const refreshToken  = process.env.BASECAMP_REFRESH_TOKEN;
  const accountId     = process.env.BASECAMP_ACCOUNT_ID;
  const projectId     = process.env.COSMETTE_BASECAMP_PROJECT_ID;
  const todolistId    = process.env.COSMETTE_BASECAMP_TODOLIST_ID;

  // ── Step 1: Exchange refresh token for a fresh access token ──────
  let accessToken;
  try {
    const tokenRes = await fetch(
      `https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(500).json({ error: 'Token refresh failed', detail: err });
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (err) {
    return res.status(500).json({ error: 'Token refresh error', detail: err.message });
  }

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent':    'Medaltus Dashboard (jaclyn@medaltus.com)',
    'Content-Type':  'application/json'
  };

  // ── Step 2: Fetch all todos from the todolist ─────────────────────
  // We request both completed and incomplete by hitting the endpoint twice
  let incomplete = [];
  let completed  = [];

  try {
    const incRes = await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todolists/${todolistId}/todos.json?status=active`,
      { headers }
    );
    if (incRes.ok) {
      incomplete = await incRes.json();
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch incomplete todos:', err.message);
  }

  try {
    const compRes = await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todolists/${todolistId}/todos.json?status=completed`,
      { headers }
    );
    if (compRes.ok) {
      completed = await compRes.json();
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch completed todos:', err.message);
  }

  // ── Step 3: Merge and filter — top-level todos only (no subtasks) ─
  // Subtasks have a parent.type of 'Todo'; top-level have parent.type of 'Todolist'
  const allTodos = [...incomplete, ...completed];
  const topLevel = allTodos.filter(todo => {
    return !todo.parent || todo.parent.type === 'Todolist';
  });

  // ── Step 4: Shape the response ────────────────────────────────────
  const shaped = topLevel.map(todo => ({
    id:          todo.id,
    title:       todo.title,
    completed:   todo.completed,
    due_on:      todo.due_on || null,
    assignees:   (todo.assignees || []).map(a => a.name),
    created_at:  todo.created_at,
    updated_at:  todo.updated_at,
    url:         todo.app_url || null,
  }));

  // Sort: incomplete first, then completed; within each group preserve Basecamp order
  shaped.sort((a, b) => {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({ todos: shaped, count: shaped.length });
}
