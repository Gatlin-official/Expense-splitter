// All money is integer cents. Every split mode routes through allocate() so totals always balance.

const isInt = (n) => Number.isInteger(n);

// Largest-remainder rounding: integer parts proportional to weights, summing exactly to total.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new Error('Nothing to split across');
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length][1]]++;
  return out;
}

const toSplits = (ids, amounts) =>
  ids.map((member, i) => ({ member, amount: amounts[i] })).filter((s) => s.amount !== 0);

function entries(obj, label) {
  const e = Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null && Number(v) !== 0);
  if (!e.length) throw new Error(`Enter at least one ${label}`);
  for (const [, v] of e) if (!Number.isFinite(Number(v)) || Number(v) < 0) throw new Error(`Invalid ${label}`);
  return [e.map(([k]) => k), e.map(([, v]) => Number(v))];
}

// Returns [{member, amount}] summing to amount; throws Error with a user-facing message on bad input.
// For itemized, amount is ignored and derived from items + tax + tip (use itemizedTotal).
export function computeSplits(amount, mode, input = {}) {
  if (mode !== 'itemized' && (!isInt(amount) || amount <= 0)) throw new Error('Amount must be positive');
  switch (mode) {
    case 'equal': {
      const ids = [...new Set(input.members || [])];
      if (!ids.length) throw new Error('Pick at least one person');
      return toSplits(ids, allocate(amount, ids.map(() => 1)));
    }
    case 'exact': {
      const [ids, vals] = entries(input.amounts, 'amount');
      if (!vals.every(isInt)) throw new Error('Amounts must be whole cents');
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== amount) throw new Error(`Amounts add up to ${fmt(sum)}, not ${fmt(amount)}`);
      return toSplits(ids, vals);
    }
    case 'percent': {
      const [ids, vals] = entries(input.percents, 'percent');
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 1e-9) throw new Error(`Percents add up to ${+sum.toFixed(4)}%, not 100%`);
      return toSplits(ids, allocate(amount, vals));
    }
    case 'shares': {
      const [ids, vals] = entries(input.shares, 'share');
      return toSplits(ids, allocate(amount, vals));
    }
    case 'adjust': {
      const ids = [...new Set(input.members || [])];
      if (!ids.length) throw new Error('Pick at least one person');
      const adj = input.adjustments || {};
      const extra = {};
      for (const [k, v] of Object.entries(adj)) {
        if (v === '' || v == null || Number(v) === 0) continue;
        if (!isInt(Number(v))) throw new Error('Adjustments must be whole cents');
        extra[k] = Number(v);
      }
      const all = [...new Set([...ids, ...Object.keys(extra)])];
      const rest = amount - Object.values(extra).reduce((a, b) => a + b, 0);
      if (rest < 0) throw new Error('Adjustments exceed the total');
      const base = allocate(rest, ids.map(() => 1));
      const out = all.map((m) => (base[ids.indexOf(m)] || 0) + (extra[m] || 0));
      if (out.some((v) => v < 0)) throw new Error('Adjustments make a share negative');
      return toSplits(all, out);
    }
    case 'itemized': {
      const items = input.items || [];
      if (!items.length) throw new Error('Add at least one item');
      const sub = {};
      for (const it of items) {
        const ids = [...new Set(it.members || [])];
        if (!isInt(it.amount) || it.amount <= 0) throw new Error(`Item "${it.name || '?'}" needs a price`);
        if (!ids.length) throw new Error(`Item "${it.name || '?'}" needs at least one person`);
        allocate(it.amount, ids.map(() => 1)).forEach((v, i) => (sub[ids[i]] = (sub[ids[i]] || 0) + v));
      }
      const extras = (input.tax || 0) + (input.tip || 0);
      if (!isInt(extras) || extras < 0) throw new Error('Invalid tax/tip');
      const ids = Object.keys(sub);
      const spread = allocate(extras, ids.map((m) => sub[m]));
      return toSplits(ids, ids.map((m, i) => sub[m] + spread[i]));
    }
    default:
      throw new Error('Unknown split mode');
  }
}

export const itemizedTotal = (input) =>
  (input.items || []).reduce((a, it) => a + (it.amount || 0), 0) + (input.tax || 0) + (input.tip || 0);

// Net per member: positive = owed money, negative = owes.
export function balances(members, expenses) {
  const bal = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const e of expenses) {
    bal[e.paidBy] = (bal[e.paidBy] || 0) + e.amount;
    for (const s of e.splits) bal[s.member] = (bal[s.member] || 0) - s.amount;
  }
  return bal;
}

// ponytail: greedy largest-debtor ↔ largest-creditor, ≤ n-1 payments. True minimum is NP-hard; greedy is what Splitwise-style apps ship.
export function settleUp(bal) {
  const cred = Object.entries(bal).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debt = Object.entries(bal).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out = [];
  while (cred.length && debt.length) {
    cred.sort((a, b) => b.v - a.v);
    debt.sort((a, b) => b.v - a.v);
    const c = cred[0], d = debt[0], x = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount: x });
    if (!(c.v -= x)) cred.shift();
    if (!(d.v -= x)) debt.shift();
  }
  return out;
}

export const CURRENCIES = {
  USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', INR: 'Indian rupee', JPY: 'Japanese yen',
  CNY: 'Chinese yuan', AUD: 'Australian dollar', CAD: 'Canadian dollar', CHF: 'Swiss franc',
  SGD: 'Singapore dollar', AED: 'UAE dirham', BRL: 'Brazilian real', MXN: 'Mexican peso',
  ZAR: 'South African rand', KRW: 'South Korean won',
};
export const CATEGORIES = {
  food: 'Food & drink', groceries: 'Groceries', rent: 'Rent', utilities: 'Utilities', transport: 'Transport',
  travel: 'Travel', fun: 'Fun', shopping: 'Shopping', other: 'Other',
};

const fmts = {};
// ponytail: amounts are hundredths for every currency; zero-decimal ones (JPY/KRW) just display rounded.
export const fmt = (cents, code = 'USD') => {
  const c = CURRENCIES[code] ? code : 'USD'; // legacy groups stored a symbol like '$'
  fmts[c] ||= new Intl.NumberFormat(undefined, { style: 'currency', currency: c });
  return fmts[c].format(cents / 100);
};
export const symbol = (code) =>
  fmt(0, code).replace(/[\d\s., ]/g, '') || code;

// "12.34" → 1234; returns NaN for junk.
export const toCents = (s) => {
  const t = String(s ?? '').trim();
  return /^\d*(\.\d{0,2})?$/.test(t) && t !== '' && t !== '.' ? Math.round(Number(t) * 100) : NaN;
};
