# Taskboard · Kanban Board

A fast, offline Kanban board for moving work across lanes. Drag cards between lists, label and prioritise them, switch between multiple boards — and everything saves to your browser instantly. No accounts, no servers, no sync to wait on.

Built with **vanilla JavaScript** (no framework, no build step). Open `index.html` and it runs.

![Taskboard board](assets/screenshot-board.png)

---

## Why it exists

Drag-and-drop is the thing most "Kanban clone" tutorials get wrong — they either reach for a library or end up with janky, index-confused reordering. Taskboard implements the whole interaction by hand with the native HTML5 drag-and-drop API, and keeps the logic honest by computing every drop position from the **data model**, not from fragile DOM bookkeeping. It also has a real visual identity: a light, calm workspace where each lane carries its own colour, so the board reads at a glance.

## Features

- **Drag and drop** — move cards within a lane or across lanes, with a live drop placeholder showing exactly where the card will land.
- **Multiple boards** — switch between boards from the header tabs; double-click a tab to rename. Ships with a *Product launch* board and a lighter *This week* board.
- **Rich cards** — title, notes, a colour **label**, a **priority** (low / medium / high), and a **due date** that turns red when overdue. A card editor opens on click.
- **Editable lists** — rename a list inline, recolour it from a palette, clear it, or delete it. Add as many lists as you like.
- **Quick add** — an inline composer at the bottom of every list; paste multiple lines to create several cards at once.
- **Board progress** — a header bar tracks how many cards have reached the final lane.
- **Persistent** — the entire workspace is one JSON object in `localStorage`; refresh and it's exactly as you left it.
- **Sample data** — first run seeds a believable in-flight project so the board looks real immediately. Reload or clear it from the ⋯ menu.
- **Responsive & accessible** — lanes scroll horizontally on small screens; semantic markup, focus-visible rings, `aria-live` toast, keyboard-friendly modals, and `prefers-reduced-motion` honoured.

## Tech

| Concern | Choice | Reason |
|---|---|---|
| UI | Vanilla JS + DOM | Zero build, easy to read, nothing to install |
| Drag & drop | Native HTML5 DnD | No library; indices derived from the data model |
| Storage | `localStorage` (one JSON key) | Fully offline + private |
| Type | Plus Jakarta Sans (display) · Inter (UI) | Self-hosted, no external requests |

Fonts are bundled locally, so the app makes **zero external network calls**.

## Project structure

```
taskboard/
├── index.html          # topbar, board canvas, card + prompt modals
├── css/
│   └── styles.css       # light theme, lanes, cards, drag states, modals
├── js/
│   ├── store.js         # data layer: boards/columns/cards, move, seed
│   └── app.js           # UI controller: render, drag & drop, editor, boards
├── vendor/              # self-hosted Plus Jakarta Sans + Inter (woff2)
└── assets/              # screenshots
```

The split is deliberate: `store.js` is pure data and never touches the DOM; `app.js` never reaches into storage. Want a real backend? Reimplement `store.js` and the UI is untouched.

## How drag-and-drop stays correct

The classic Kanban bug is computing the drop index from the live DOM while the dragged element is *also* in the DOM — off-by-ones everywhere. Taskboard sidesteps this:

1. During `dragover`, a placeholder is inserted purely for **visual** feedback.
2. On `drop`, the target index is recomputed from the store: take the destination list's card IDs, remove the dragged card, and find the position of the card the placeholder sits before.
3. `Store.moveCard()` performs the array splice and persists.

The DOM is a view; the array is the truth.

## Run it

No tooling required.

```bash
# open directly…
open index.html

# …or serve it (recommended)
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Because it's fully static, it hosts anywhere. For **GitHub Pages**: push the folder to a repo, then enable Pages (Settings → Pages → deploy from `main`, root). Your board will be live at `https://<user>.github.io/<repo>/`.

## Privacy

There is no backend. Your boards live in `localStorage` under the key `taskboard.v1`. Nothing is transmitted; clear your browser data and it's gone.

## Possible extensions

- Card cover colours and checklists
- Filtering by label or assignee
- Export / import the workspace JSON
- Multi-select drag, keyboard reordering
- A sync backend (swap the storage layer)

## License

MIT — see [LICENSE](LICENSE). Bundled fonts (Plus Jakarta Sans, Inter) are licensed under the SIL Open Font License and are free to redistribute.
