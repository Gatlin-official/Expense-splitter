import express from 'express';
import { MongoClient } from 'mongodb';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeSplits, itemizedTotal, balances, settleUp, CURRENCIES, CATEGORIES } from '../shared/money.js';

const PORT = process.env.PORT || 3000;
const prod = process.argv.includes('--prod');
const client = await MongoClient.connect(process.env.MONGO_URL || 'mongodb://localhost:27017');
// ponytail: expenses embedded in the group doc (16MB cap ≈ tens of thousands of expenses); move to own collection if a group nears that.
const groups = client.db('splitter').collection('groups');

const app = express();
app.use(express.json({ limit: '100kb' }));

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const name = (s, max = 60) => {
  const t = String(s ?? '').trim();
  if (!t || t.length > max) throw bad(`Name must be 1–${max} characters`);
  return t;
};
const currency = (c) => {
  if (!CURRENCIES[c]) throw bad('Pick a currency from the list');
  return c;
};
const route = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }));

const load = async (id) => {
  const g = await groups.findOne({ _id: id });
  if (!g) throw Object.assign(new Error('Group not found'), { status: 404 });
  return g;
};
const view = (g) => {
  const bal = balances(g.members, g.expenses);
  return { ...g, id: g._id, balances: bal, settlements: settleUp(bal) };
};

// Validate client input and recompute splits server-side; never trust client splits.
function buildExpense(g, b) {
  const ids = new Set(g.members.map((m) => m.id));
  const amount = b.mode === 'itemized' ? itemizedTotal(b.input || {}) : b.amount;
  if (!ids.has(b.paidBy)) throw bad('Pick who paid');
  let splits;
  try { splits = computeSplits(amount, b.mode, b.input); } catch (e) { throw bad(e.message); }
  if (!splits.every((s) => ids.has(s.member))) throw bad('Unknown member in split');
  if (amount > 1e11) throw bad('Amount too large');
  if (b.isTransfer && (splits.length !== 1 || splits[0].member === b.paidBy)) throw bad('A payment goes from one person to someone else');
  if (b.category != null && !CATEGORIES[b.category]) throw bad('Unknown category');
  return {
    description: b.isTransfer ? 'Settlement' : name(b.description, 120),
    amount, paidBy: b.paidBy, mode: b.mode, input: b.input, splits,
    date: new Date(b.date || Date.now()).toISOString().slice(0, 10),
    isTransfer: !!b.isTransfer,
    category: b.isTransfer ? 'other' : b.category || 'other',
  };
}

app.post('/api/groups', route(async (req, res) => {
  const members = [...new Set((req.body.members || []).map((m) => name(m)))].map((n) => ({ id: randomUUID(), name: n }));
  if (!members.length) throw bad('Add at least one member');
  const g = { _id: randomBytes(9).toString('base64url'), name: name(req.body.name), currency: currency(req.body.currency), members, expenses: [], createdAt: new Date() };
  await groups.insertOne(g);
  res.json({ id: g._id });
}));

app.get('/api/groups/:id', route(async (req, res) => res.json(view(await load(req.params.id)))));

app.patch('/api/groups/:id', route(async (req, res) => {
  const g = await load(req.params.id);
  const set = {};
  if (req.body.name != null) set.name = name(req.body.name);
  if (req.body.currency != null) set.currency = currency(req.body.currency);
  await groups.updateOne({ _id: g._id }, { $set: set });
  res.json(view(await load(g._id)));
}));

app.post('/api/groups/:id/members', route(async (req, res) => {
  const g = await load(req.params.id);
  const n = name(req.body.name);
  if (g.members.some((m) => m.name.toLowerCase() === n.toLowerCase())) throw bad('That name is taken');
  await groups.updateOne({ _id: g._id }, { $push: { members: { id: randomUUID(), name: n } } });
  res.json(view(await load(g._id)));
}));

app.post('/api/groups/:id/expenses', route(async (req, res) => {
  const g = await load(req.params.id);
  const e = { id: randomUUID(), ...buildExpense(g, req.body), createdAt: new Date() };
  await groups.updateOne({ _id: g._id }, { $push: { expenses: e } });
  res.json(view(await load(g._id)));
}));

app.put('/api/groups/:id/expenses/:eid', route(async (req, res) => {
  const g = await load(req.params.id);
  const e = buildExpense(g, req.body);
  const set = Object.fromEntries(Object.entries(e).map(([k, v]) => [`expenses.$.${k}`, v]));
  const r = await groups.updateOne({ _id: g._id, 'expenses.id': req.params.eid }, { $set: set });
  if (!r.matchedCount) throw Object.assign(new Error('Expense not found'), { status: 404 });
  res.json(view(await load(g._id)));
}));

app.delete('/api/groups/:id/expenses/:eid', route(async (req, res) => {
  await groups.updateOne({ _id: req.params.id }, { $pull: { expenses: { id: req.params.eid } } });
  res.json(view(await load(req.params.id)));
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (prod) {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*any}', (req, res) => res.sendFile('index.html', { root: dist }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
