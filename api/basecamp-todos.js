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

  // ── Step 2: Look up the todolists inside the Todoset (flat route) ─
  let todolistId;
  try {
    const listsRes = await fetch(
      `https://3.basecampapi.com/${accountId}/todosets/${todosetId}/todolists.json`,
      { headers }
    );
    if (!listsRes.ok) {
      const err = await listsRes.text();
      return res.status(500).json({ error: 'Could not fetch todolists from todoset', detail: err });
    }
    const lists = await listsRes.json();

    const match = lists.find(l => l.title.trim().toLowerCase() === LIST_NAME.toLowerCase());

    if (!match) {
      return res.status(404).json({
        error: `No todolist named "${LIST_NAME}" found in this todoset`,
        available_lists: lists.map(l => ({ id: l.id, title: l.title }))
      });
    }
    todolistId = match.id;
  } catch (err) {
    return res.status(500).json({ error: 'Error looking up todolist', detail: err.message });
  }

  // ── Step 3: Check for todolist groups (sub-lists) inside this list ─
  // Brand Onboarding is organized into named groups like "Share Assets",
  // "Project Management", etc. Each group is itself a Todolist with todos.
  let groups = [];
  try {
    const groupsRes = await fetch(
      `https://3.basecampapi.com/${accountId}/todolists/${todolistId}/groups.json`,
      { headers }
    );
    if (groupsRes.ok) {
      const data = await groupsRes.json();
      if (Array.isArray(data) && data.length > 0) {
        groups = data.map(g => ({ id: g.id, title: g.title }));
      }
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch groups, falling back to top list:', err.message);
  }

  // If no groups exist, treat the top-level list itself as a single group
  if (groups.length === 0) {
    groups = [{ id: todolistId, title: LIST_NAME }];
  }

  // ── Step 4: Fetch todos for each group separately (flat routes) ──
  const sections = [];

  for (const group of groups) {
    let incomplete = [];
    let completed  = [];

    try {
      const incRes = await fetch(
        `https://3.basecampapi.com/${accountId}/todolists/${group.id}/todos.json`,
        { headers }
      );
      if (incRes.ok) {
        incomplete = await incRes.json();
      } else {
        const err = await incRes.text();
        console.warn('[basecamp] incomplete fetch failed for group', group.id, incRes.status, err);
      }
    } catch (err) {
      console.warn('[basecamp] Could not fetch incomplete todos for group', group.id, err.message);
    }

    try {
      const compRes = await fetch(
        `https://3.basecampapi.com/${accountId}/todolists/${group.id}/todos.json?completed=true`,
        { headers }
      );
      if (compRes.ok) {
        completed = await compRes.json();
      } else {
        const err = await compRes.text();
        console.warn('[basecamp] completed fetch failed for group', group.id, compRes.status, err);
      }
    } catch (err) {
      console.warn('[basecamp] Could not fetch completed todos for group', group.id, err.message);
    }

    // Top-level todos only (no subtasks) — subtasks have parent.type === 'Todo'
    const allTodos = [...incomplete, ...completed];
    const topLevel = allTodos.filter(todo => !todo.parent || todo.parent.type === 'Todolist');

    const shaped = topLevel.map(todo => ({
      id:         todo.id,
      title:      todo.title,
      completed:  todo.completed,
      assignees:  (todo.assignees || []).map(a => a.name),
      url:        todo.app_url || null,
    }));

    // Sort: incomplete first, then completed
    shaped.sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });

    sections.push({
      id:    group.id,
      title: group.title,
      todos: shaped,
      done:  shaped.filter(t => t.completed).length,
      total: shaped.length,
    });
  }

  // ── Step 5: Overall stats across all sections ─────────────────────
  const allShapedTodos = sections.flatMap(s => s.todos);
  const totalCount     = allShapedTodos.length;
  const doneCount      = allShapedTodos.filter(t => t.completed).length;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    sections,
    stats: {
      done:      doneCount,
      total:     totalCount,
      remaining: totalCount - doneCount,
      percent:   totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
    }
  });
}
