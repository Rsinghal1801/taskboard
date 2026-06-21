/* Taskboard — data layer.
 * Pure data + persistence. Knows nothing about the DOM.
 * One localStorage key holds the whole workspace as JSON.
 *
 * Shape:
 *   state = {
 *     activeBoardId,
 *     boards: [
 *       { id, name, columns: [ { id, name, accent, cardIds:[...] } ],
 *         cards: { [id]: { id, title, notes, label, priority, due, createdAt } } }
 *     ]
 *   }
 */
const Store = (() => {
  const KEY = 'taskboard.v1';

  // Label palette a card can wear (id -> name + colour).
  const LABELS = {
    design:   { name: 'Design',   color: '#7c6cff' },
    feature:  { name: 'Feature',  color: '#27ae8f' },
    bug:      { name: 'Bug',      color: '#ef4d61' },
    research: { name: 'Research', color: '#e0922f' },
    ops:      { name: 'Ops',      color: '#3a93ff' },
  };

  // Accent palette offered when creating a column.
  const COLUMN_ACCENTS = ['#8a93a5', '#3a93ff', '#e0922f', '#27ae8f', '#7c6cff', '#ef4d61'];

  const PRIORITIES = { low: 'Low', med: 'Medium', high: 'High' };

  const uid = (p = 'id') =>
    p + '_' + (crypto?.randomUUID?.().slice(0, 8) ||
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { activeBoardId: null, boards: [] };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  const isEmpty = () => state.boards.length === 0;
  const getState = () => state;
  const boards = () => state.boards;
  const activeBoard = () =>
    state.boards.find(b => b.id === state.activeBoardId) || state.boards[0] || null;

  function setActiveBoard(id) {
    state.activeBoardId = id;
    save();
  }

  /* ---- boards ---- */
  function addBoard(name) {
    const b = {
      id: uid('b'),
      name: name?.trim() || 'Untitled board',
      columns: [
        { id: uid('c'), name: 'To do',       accent: '#3a93ff', cardIds: [] },
        { id: uid('c'), name: 'In progress', accent: '#e0922f', cardIds: [] },
        { id: uid('c'), name: 'Done',        accent: '#27ae8f', cardIds: [] },
      ],
      cards: {},
    };
    state.boards.push(b);
    state.activeBoardId = b.id;
    save();
    return b;
  }

  function renameBoard(id, name) {
    const b = state.boards.find(x => x.id === id);
    if (b) { b.name = name.trim() || b.name; save(); }
  }

  function removeBoard(id) {
    state.boards = state.boards.filter(b => b.id !== id);
    if (state.activeBoardId === id)
      state.activeBoardId = state.boards[0]?.id || null;
    save();
  }

  /* ---- columns ---- */
  function addColumn(boardId, name, accent) {
    const b = state.boards.find(x => x.id === boardId);
    if (!b) return;
    b.columns.push({
      id: uid('c'),
      name: name?.trim() || 'New list',
      accent: accent || COLUMN_ACCENTS[b.columns.length % COLUMN_ACCENTS.length],
      cardIds: [],
    });
    save();
  }

  function renameColumn(boardId, columnId, name) {
    const col = colOf(boardId, columnId);
    if (col) { col.name = name.trim() || col.name; save(); }
  }

  function setColumnAccent(boardId, columnId, accent) {
    const col = colOf(boardId, columnId);
    if (col) { col.accent = accent; save(); }
  }

  function removeColumn(boardId, columnId) {
    const b = state.boards.find(x => x.id === boardId);
    if (!b) return;
    const col = b.columns.find(c => c.id === columnId);
    if (col) col.cardIds.forEach(id => delete b.cards[id]);  // drop its cards
    b.columns = b.columns.filter(c => c.id !== columnId);
    save();
  }

  /* ---- cards ---- */
  function addCard(boardId, columnId, data) {
    const b = state.boards.find(x => x.id === boardId);
    const col = b?.columns.find(c => c.id === columnId);
    if (!col) return null;
    const card = {
      id: uid('k'),
      title: (data.title || '').trim() || 'Untitled',
      notes: data.notes || '',
      label: data.label || null,
      priority: data.priority || null,
      due: data.due || null,
      createdAt: Date.now(),
    };
    b.cards[card.id] = card;
    col.cardIds.push(card.id);
    save();
    return card;
  }

  function updateCard(boardId, cardId, patch) {
    const b = state.boards.find(x => x.id === boardId);
    if (!b || !b.cards[cardId]) return;
    Object.assign(b.cards[cardId], patch);
    save();
  }

  function removeCard(boardId, cardId) {
    const b = state.boards.find(x => x.id === boardId);
    if (!b) return;
    delete b.cards[cardId];
    b.columns.forEach(c => { c.cardIds = c.cardIds.filter(id => id !== cardId); });
    save();
  }

  /* Move a card to (toColumnId, toIndex). Works within and across columns. */
  function moveCard(boardId, cardId, toColumnId, toIndex) {
    const b = state.boards.find(x => x.id === boardId);
    if (!b) return;
    const from = b.columns.find(c => c.cardIds.includes(cardId));
    const to = b.columns.find(c => c.id === toColumnId);
    if (!from || !to) return;
    from.cardIds = from.cardIds.filter(id => id !== cardId);
    const idx = Math.max(0, Math.min(toIndex ?? to.cardIds.length, to.cardIds.length));
    to.cardIds.splice(idx, 0, cardId);
    save();
  }

  /* ---- helpers ---- */
  function colOf(boardId, columnId) {
    return state.boards.find(x => x.id === boardId)?.columns.find(c => c.id === columnId);
  }

  function boardStats(board) {
    if (!board) return { total: 0, done: 0, pct: 0 };
    const total = Object.keys(board.cards).length;
    // treat the last column as the "done" lane
    const last = board.columns[board.columns.length - 1];
    const done = last ? last.cardIds.length : 0;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function reset() {
    state = { activeBoardId: null, boards: [] };
    save();
  }

  /* ---- sample workspace (first run) ---- */
  function seed() {
    state = { activeBoardId: null, boards: [] };

    // Board 1 — a product launch, in mid-flight (four lanes)
    const launch = addBoard('Product launch');
    launch.columns = [
      { id: uid('c'), name: 'Backlog',     accent: '#8a93a5', cardIds: [] },
      { id: uid('c'), name: 'To do',       accent: '#3a93ff', cardIds: [] },
      { id: uid('c'), name: 'In progress', accent: '#e0922f', cardIds: [] },
      { id: uid('c'), name: 'Done',        accent: '#27ae8f', cardIds: [] },
    ];
    const [backlog, todo, doing, done] = launch.columns;

    const seedCards = [
      [backlog, { title: 'Write launch blog post', label: 'research', priority: 'med' }],
      [backlog, { title: 'Pricing page copy pass', label: 'design', priority: 'low' }],
      [backlog, { title: 'Set up status page', label: 'ops' }],
      [todo,    { title: 'Design hero illustration', label: 'design', priority: 'high', notes: 'Two concepts — abstract vs. product shot.' }],
      [todo,    { title: 'Email capture on landing page', label: 'feature', priority: 'med' }],
      [todo,    { title: 'Fix Safari flexbox bug', label: 'bug', priority: 'high' }],
      [doing,   { title: 'Onboarding flow polish', label: 'design', priority: 'med', notes: 'Empty states + first-run tips.' }],
      [doing,   { title: 'Load-test the API', label: 'ops', priority: 'high' }],
      [done,    { title: 'Finalise brand palette', label: 'design' }],
      [done,    { title: 'Ship marketing site skeleton', label: 'feature' }],
      [done,    { title: 'Pick analytics provider', label: 'research' }],
    ];
    seedCards.forEach(([col, data]) => addCard(launch.id, col.id, data));

    // Board 2 — a personal "this week" board, lighter
    const week = addBoard('This week');
    const [w1, w2, w3] = week.columns;
    [
      [w1, { title: 'Read 30 pages', priority: 'low' }],
      [w1, { title: 'Plan weekend trip', label: 'research' }],
      [w2, { title: 'Reply to landlord', priority: 'high' }],
      [w3, { title: 'Renew gym membership' }],
    ].forEach(([col, data]) => addCard(week.id, col.id, data));

    state.activeBoardId = launch.id;
    save();
  }

  return {
    LABELS, COLUMN_ACCENTS, PRIORITIES,
    isEmpty, getState, boards, activeBoard, setActiveBoard,
    addBoard, renameBoard, removeBoard,
    addColumn, renameColumn, setColumnAccent, removeColumn,
    addCard, updateCard, removeCard, moveCard,
    boardStats, reset, seed,
  };
})();
