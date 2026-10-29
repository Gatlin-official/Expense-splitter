# Group Expense Splitter

Group expense splitter: React (Vite) + Express + MongoDB. No auth — a group is reachable by its share link `/g/<id>`.

## Commands
- `docker compose up -d` — local MongoDB (or set `MONGO_URL`)
- `npm run dev` — Express on :3000 with Vite in middleware mode (one process, HMR)
- `npm test` — `node:test` checks for the money logic
- `npm run build && npm start` — serve built `dist/` (`--prod` flag)

## Layout
- `shared/money.js` — ALL money logic (splits, balances, settle-up). Imported by both server and client.
- `server/index.js` — routes + DB. One `groups` collection; members and expenses are embedded arrays.
- `src/App.jsx` — SPA shell: sidebar of groups (localStorage `tab.groups`), pushState routing, `Modal`, toasts + promise `confirm` via `useUI()`, create-group modal.
- `src/Group.jsx` — group dashboard (stats, CSS-only charts, settle up, payment modal, feed).
- `src/ExpenseForm.jsx` — add/edit expense form.
- `CURRENCIES` (ISO codes, formatted with `Intl`) and `CATEGORIES` live in `shared/money.js`; server validates against them.

## Rules
- Money is always integer cents. Any new split mode must go through `allocate()` so splits sum exactly to the total.
- The server recomputes `splits` from `mode` + `input` on every write; never trust client-sent splits.
- Settlements are expenses with `isTransfer: true` (mode `exact`, debtor pays, creditor is the only split). Partial payments are just smaller transfers.
- Never use native `alert`/`confirm`; use `useUI().toast` / `useUI().confirm`. Navigate with the shell's pushState, never `location.href`.
- `ponytail:` comments mark deliberate simplifications and their upgrade path (polling vs SSE, embedded expenses, greedy settle-up).
