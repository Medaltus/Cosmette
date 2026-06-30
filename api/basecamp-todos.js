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
  // Brand Onboarding may be organized into groups like "Share Assets",
  // "Project Management", etc. Each group is itself a Todolist with todos.
  let todolistIds = [todolistId];
  try {
    const groupsRes = await fetch(
      `https://3.basecampapi.com/${accountId}/todolists/${todolistId}/groups.json`,
      { headers }
    );
    if (groupsRes.ok) {
      const groups = await groupsRes.json();
      if (Array.isArray(groups) && groups.length > 0) {
        todolistIds = groups.map(g => g.id); // groups replace the parent for todo-fetching
      }
    }
  } catch (err) {
    console.warn('[basecamp] Could not fetch groups, falling back to top list:', err.message);
  }

  // ── Step 4: Fetch all todos from every relevant todolist (flat routes) ─
  let incomplete = [];
  let completed  = [];

  for (const listId of todolistIds) {
    try {
      const incRes = await fetch(
        `https://3.basecampapi.com/${accountId}/todolists/${listId}/todos.json`,
        { headers }
      );
      if (incRes.ok) {
        const data = await incRes.json();
        incomplete = incomplete.concat(data);
      } else {
        const err = await incRes.text();
        console.warn('[basecamp] incomplete fetch failed for list', listId, incRes.status, err);
      }
    } catch (err) {
      console.warn('[basecamp] Could not fetch incomplete todos for list', listId, err.message);
    }

    try {
      const compRes = await fetch(
        `https://3.basecampapi.com/${accountId}/todolists/${listId}/todos.json?completed=true`,
        { headers }
      );
      if (compRes.ok) {
        const data = await compRes.json();
        completed = completed.concat(data);
      } else {
        const err = await compRes.text();
        console.warn('[basecamp] completed fetch failed for list', listId, compRes.status, err);
      }
    } catch (err) {
      console.warn('[basecamp] Could not fetch completed todos for list', listId, err.message);
    }
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
      resolvedTopListId: todolistId,
      fetchedFromListIds: todolistIds,
      raw_incomplete_count: incomplete.length,
      raw_completed_count: completed.length
    }
  });
}
