/* Taskboard — UI controller.
 * Renders the active board, handles drag-and-drop (store-driven indices),
 * the card editor, inline composers, and board switching.
 * Knows nothing about how data is persisted — that's Store's job.
 */
(() => {
  'use strict';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => (s ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // First run → believable sample workspace
  if (Store.isEmpty()) Store.seed();

  const canvas   = $('#canvas');
  const boardTabs = $('#boardTabs');

  /* ===================== render ===================== */
  function render() {
    renderTabs();
    renderBoard();
    renderProgress();
  }

  function renderTabs() {
    const active = Store.activeBoard();
    boardTabs.innerHTML = '';
    Store.boards().forEach(b => {
      const t = document.createElement('button');
      t.className = 'board-tab' + (active && b.id === active.id ? ' is-active' : '');
      t.textContent = b.name;
      t.title = 'Double-click to rename';
      t.addEventListener('click', () => { Store.setActiveBoard(b.id); render(); });
      t.addEventListener('dblclick', () => promptText('Rename board', 'Board name', b.name, v => {
        Store.renameBoard(b.id, v); render();
      }));
      boardTabs.appendChild(t);
    });
  }

  function renderProgress() {
    const { pct, done, total } = Store.boardStats(Store.activeBoard());
    $('#progressFill').style.width = pct + '%';
    $('#progressLabel').textContent = total ? `${done}/${total}` : '—';
  }

  function renderBoard() {
    const board = Store.activeBoard();
    canvas.innerHTML = '';
    if (!board) return;

    board.columns.forEach(col => canvas.appendChild(columnEl(board, col)));

    // trailing "add list" rail
    const add = document.createElement('button');
    add.className = 'add-list';
    add.textContent = '+ Add another list';
    add.addEventListener('click', () => promptText('New list', 'List name', '', v => {
      Store.addColumn(board.id, v); render();
    }));
    canvas.appendChild(add);
  }

  function columnEl(board, col) {
    const el = document.createElement('section');
    el.className = 'column';
    el.dataset.col = col.id;
    el.style.setProperty('--accent', col.accent);

    el.innerHTML = `
      <div class="column__top"></div>
      <header class="column__head">
        <span class="column__dot"></span>
        <span class="column__name" role="textbox" tabindex="0" contenteditable
              spellcheck="false">${esc(col.name)}</span>
        <span class="column__count">${col.cardIds.length}</span>
        <button class="icon-btn col-menu" aria-label="List options">⋯</button>
      </header>
      <div class="column__list" data-col="${col.id}"></div>
      <button class="column__add">+ Add a card</button>
    `;

    // editable name
    const nameEl = $('.column__name', el);
    const commitName = () => {
      const v = nameEl.textContent.trim();
      if (v && v !== col.name) { Store.renameColumn(board.id, col.id, v); }
      else nameEl.textContent = col.name;
    };
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      if (e.key === 'Escape') { nameEl.textContent = col.name; nameEl.blur(); }
    });
    nameEl.addEventListener('blur', commitName);

    // column menu (recolour / delete)
    $('.col-menu', el).addEventListener('click', (e) => columnMenu(e.currentTarget, board, col));

    // cards
    const list = $('.column__list', el);
    col.cardIds.forEach(id => list.appendChild(cardEl(board, col, board.cards[id])));
    wireDrop(board, col, list, el);

    // composer
    $('.column__add', el).addEventListener('click', () => openComposer(board, col, el));
    return el;
  }

  function cardEl(board, col, card) {
    if (!card) return document.createComment('missing');
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = card.id;
    el.draggable = true;

    const label = card.label && Store.LABELS[card.label];
    const meta = [];
    if (label) meta.push(`<span class="tag" style="--tag-bg:${label.color}">${esc(label.name)}</span>`);
    if (card.priority) {
      meta.push(`<span class="pri pri--${card.priority}"><i class="pri__dot"></i>${esc(Store.PRIORITIES[card.priority])}</span>`);
    }
    if (card.due) {
      const over = card.due < todayStr();
      meta.push(`<span class="due${over ? ' is-over' : ''}">📅 ${fmtDue(card.due)}</span>`);
    }
    if (card.notes && card.notes.trim()) meta.push(`<span class="notes-dot" title="Has notes">≡</span>`);

    el.innerHTML = `
      ${label ? `<span class="card__label" style="--label-color:${label.color}"></span>` : ''}
      <div class="card__title">${esc(card.title)}</div>
      <div class="card__meta">${meta.join('')}</div>
    `;

    el.addEventListener('click', () => openCard(board, card.id));
    el.addEventListener('dragstart', e => onDragStart(e, board, col, card, el));
    el.addEventListener('dragend', onDragEnd);
    return el;
  }

  /* ===================== drag & drop ===================== */
  let drag = null;                 // { id, fromCol, el }
  const placeholder = Object.assign(document.createElement('div'), { className: 'card ghost' });

  function onDragStart(e, board, col, card, el) {
    drag = { id: card.id, fromCol: col.id, el };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
    requestAnimationFrame(() => el.classList.add('dragging'));
  }

  function onDragEnd() {
    drag = null;
    placeholder.remove();
    $$('.column.drop-active').forEach(c => c.classList.remove('drop-active'));
    $$('.card.dragging').forEach(c => c.classList.remove('dragging'));
  }

  function wireDrop(board, col, list, colEl) {
    list.addEventListener('dragover', e => {
      if (!drag) return;
      e.preventDefault();
      colEl.classList.add('drop-active');
      const after = afterElement(list, e.clientY);
      if (after) list.insertBefore(placeholder, after);
      else list.appendChild(placeholder);
    });
    list.addEventListener('dragleave', e => {
      if (!list.contains(e.relatedTarget)) colEl.classList.remove('drop-active');
    });
    list.addEventListener('drop', e => {
      if (!drag) return;
      e.preventDefault();
      const beforeId = placeholder.nextElementSibling?.dataset?.id || null;
      const ids = col.cardIds.filter(id => id !== drag.id);
      const index = beforeId ? ids.indexOf(beforeId) : ids.length;
      Store.moveCard(board.id, drag.id, col.id, index < 0 ? ids.length : index);
      onDragEnd();
      render();
    });
  }

  function afterElement(list, y) {
    const cards = $$('.card:not(.dragging):not(.ghost)', list);
    return cards.find(c => {
      const box = c.getBoundingClientRect();
      return y < box.top + box.height / 2;
    }) || null;
  }

  /* ===================== composer (add card) ===================== */
  function openComposer(board, col, colEl) {
    if ($('.composer', colEl)) return;
    const addBtn = $('.column__add', colEl);
    addBtn.style.display = 'none';
    const list = $('.column__list', colEl);

    const box = document.createElement('div');
    box.className = 'composer';
    box.innerHTML = `
      <textarea rows="2" placeholder="Card title… (Enter to add)"></textarea>
      <div class="composer__row">
        <button class="btn btn--primary btn-add">Add card</button>
        <button class="icon-btn btn-cancel" aria-label="Cancel">✕</button>
      </div>`;
    colEl.insertBefore(box, addBtn);
    const ta = $('textarea', box);
    ta.focus();

    const close = () => { box.remove(); addBtn.style.display = ''; };
    const commit = () => {
      const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!lines.length) { close(); return; }
      lines.forEach(title => Store.addCard(board.id, col.id, { title }));
      render();
    };
    $('.btn-add', box).addEventListener('click', commit);
    $('.btn-cancel', box).addEventListener('click', close);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') close();
    });
    list.scrollTop = list.scrollHeight;
  }

  /* ===================== column menu ===================== */
  function columnMenu(anchor, board, col) {
    closeMenus();
    const m = document.createElement('div');
    m.className = 'menu__list pop-menu';
    m.innerHTML = `
      <button data-a="recolour">Change colour</button>
      <button data-a="clear">Clear cards</button>
      <button data-a="delete" class="is-danger">Delete list</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
    m.style.zIndex = 70;

    m.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'recolour') {
        const i = (Store.COLUMN_ACCENTS.indexOf(col.accent) + 1) % Store.COLUMN_ACCENTS.length;
        Store.setColumnAccent(board.id, col.id, Store.COLUMN_ACCENTS[i]);
      } else if (a === 'clear') {
        [...col.cardIds].forEach(id => Store.removeCard(board.id, id));
        toast('List cleared');
      } else if (a === 'delete') {
        if (board.columns.length <= 1) { toast('Keep at least one list'); }
        else { Store.removeColumn(board.id, col.id); toast('List deleted'); }
      }
      closeMenus(); render();
    });
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  }
  function closeMenus() { $$('.pop-menu').forEach(m => m.remove()); }

  /* ===================== card editor ===================== */
  const cardModal = $('#cardModal');
  let editing = null;             // { boardId, cardId }

  function openCard(board, cardId) {
    const card = board.cards[cardId];
    if (!card) return;
    editing = { boardId: board.id, cardId };
    $('#cardTitle').value = card.title;
    $('#cardNotes').value = card.notes || '';
    $('#cardPriority').value = card.priority || '';
    $('#cardDue').value = card.due || '';
    renderLabelChips(card.label);
    showModal(cardModal);
    $('#cardTitle').focus();
  }

  function renderLabelChips(active) {
    const wrap = $('#labelChips');
    wrap.innerHTML = '';
    const none = chip('No label', '#9aa0b3', !active);
    none.addEventListener('click', () => { selectLabel(null); });
    wrap.appendChild(none);
    Object.entries(Store.LABELS).forEach(([id, l]) => {
      const c = chip(l.name, l.color, active === id);
      c.addEventListener('click', () => selectLabel(id));
      wrap.appendChild(c);
    });
  }
  function chip(name, color, on) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (on ? ' is-on' : '');
    b.style.setProperty('--c', color);
    b.innerHTML = `<i class="chip__dot" style="background:${color}"></i>${esc(name)}`;
    b.dataset.color = color;
    return b;
  }
  let pendingLabel; // undefined = untouched; null = explicitly no label; string = label id
  function selectLabel(id) {
    pendingLabel = id;            // id is a string or null
    renderLabelChips(id);
  }
  function currentCard() {
    const b = Store.boards().find(x => x.id === editing?.boardId);
    return b?.cards[editing?.cardId];
  }

  $('#cardSave').addEventListener('click', () => {
    if (!editing) return;
    Store.updateCard(editing.boardId, editing.cardId, {
      title: $('#cardTitle').value.trim() || 'Untitled',
      notes: $('#cardNotes').value,
      priority: $('#cardPriority').value || null,
      due: $('#cardDue').value || null,
      label: pendingLabel !== undefined ? pendingLabel : (currentCard()?.label ?? null),
    });
    closeModal(cardModal); render();
  });
  $('#cardDelete').addEventListener('click', () => {
    if (!editing) return;
    Store.removeCard(editing.boardId, editing.cardId);
    closeModal(cardModal); render(); toast('Card deleted');
  });
  // when opening, reset pendingLabel to the card's current label
  cardModal.addEventListener('transitionend', () => {});

  /* ===================== prompt modal ===================== */
  const promptModal = $('#promptModal');
  let promptCb = null;
  function promptText(title, label, value, cb) {
    $('#promptTitle').textContent = title;
    $('#promptLabel').textContent = label;
    const input = $('#promptInput');
    input.value = value || '';
    promptCb = cb;
    showModal(promptModal);
    input.focus(); input.select();
  }
  $('#promptOk').addEventListener('click', commitPrompt);
  $('#promptInput').addEventListener('keydown', e => { if (e.key === 'Enter') commitPrompt(); });
  function commitPrompt() {
    const v = $('#promptInput').value.trim();
    closeModal(promptModal);
    if (v && promptCb) promptCb(v);
    promptCb = null;
  }

  /* ===================== modal plumbing ===================== */
  function showModal(m) {
    // reset card-specific pending state on open
    if (m === cardModal) pendingLabel = undefined;
    m.setAttribute('aria-hidden', 'false');
  }
  function closeModal(m) { m.setAttribute('aria-hidden', 'true'); }
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target.matches('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal[aria-hidden="false"]').forEach(closeModal);
  });

  /* ===================== top-bar actions ===================== */
  $('#newBoardBtn').addEventListener('click', () =>
    promptText('New board', 'Board name', '', v => { Store.addBoard(v); render(); }));

  const menuBtn = $('#menuBtn'), menuList = $('#menuList');
  menuBtn.addEventListener('click', () => {
    const open = menuList.hasAttribute('hidden');
    menuList.toggleAttribute('hidden', !open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu')) { menuList.setAttribute('hidden', ''); menuBtn.setAttribute('aria-expanded', 'false'); }
  });
  menuList.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'reseed') { Store.seed(); render(); toast('Sample data reloaded'); }
    if (act === 'reset')  {
      if (confirm('Clear all boards and cards? This cannot be undone.')) {
        Store.reset(); Store.seed(); render(); toast('Workspace cleared');
      }
    }
    menuList.setAttribute('hidden', '');
  });

  /* ===================== helpers ===================== */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function todayStr() {
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function fmtDue(s) {
    const [y, m, d] = s.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${d}`;
  }

  render();
})();
