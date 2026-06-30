// api/basecamp-todos.js
// Fetches top-level todos (no subtasks) from the "Brand Onboarding" todolist,
// which lives inside the project's Todoset.
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
  const todosetId     = process.env.COSMETTE_BASECAMP_TODOLIST_ID; // actually a Todoset ID
  const LIST_NAME     = 'Brand Onboarding'; // the specific list we want inside the todoset

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

  // ── Step 2: Look up the todolists inside the Todoset ──────────────
  let todolistId;
  try {
    const listsRes = await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todosets/${todosetId}/todolists.json`,
      { headers }
    );
    if (!listsRes.ok) {
      const err = await listsRes.text();
      return res.status(500).json({ error: 'Could not fetch todolists from todoset', detail: err });
    }
    const lists = await listsRes.json();

    // Find the list matching our target name (case-insensitive)
    const match = lists.find(l => l.title.trim().toLowerCase() === LIST_NAME.toLowerCase());

    if (!match) {
      return res.status(404).json({
        error: `No todolist named "${LIST_NAME}" found in this todoset`,
        available_lists: lists.map(l => l.title)
      });
    }
    todolistId = match.id;
  } catch (err) {
    return res.status(500).json({ error: 'Error looking up todolist', detail: err.message });
  }

  // ── Step 3: Fetch all todos from that specific todolist ───────────
  // Basecamp's default todos.json only returns incomplete items.
  // Pass completed=true explicitly to get the completed ones too.
  let incomplete = [];
  let completed  = [];

  try {
    const incRes = await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todolists/${todolistId}/todos.json`,
      { headers }
    );
    if (incRes.ok) {
      incomplete = await incRes.json();
    } else {
      const err = await incRes.text();
      console.warn('[basecamp] incomplete fetch failed:', incRes.status, err);
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch incomplete todos:', err.message);
  }

  try {
    const compRes = await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todolists/${todolistId}/todos.json?completed=true`,
      { headers }
    );
    if (compRes.ok) {
      completed = await compRes.json();
    } else {
      const err = await compRes.text();
      console.warn('[basecamp] completed fetch failed:', compRes.status, err);
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch completed todos:', err.message);
  }

  // ── Step 4: Merge and filter — top-level todos only (no subtasks) ─
  // Subtasks have a parent.type of 'Todo'; top-level have parent.type of 'Todolist'
  const allTodos = [...incomplete, ...completed];
  const topLevel = allTodos.filter(todo => {
    return !todo.parent || todo.parent.type === 'Todolist';
  });

  // ── Step 5: Shape the response ────────────────────────────────────
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
  res.status(200).json({
    todos: shaped,
    count: shaped.length,
    _debug: {
      todolistId,
      raw_incomplete_count: incomplete.length,
      raw_completed_count: completed.length
    }
  });
}
