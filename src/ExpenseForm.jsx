import { useState } from 'react';
import { computeSplits, itemizedTotal, fmt, toCents, symbol, CATEGORIES } from '../shared/money.js';
import { Chip } from './App.jsx';
import { Icon } from './Icon.jsx';

const MODES = [
  ['equal', 'Equally'],
  ['exact', 'Exact amounts'],
  ['percent', 'Percent'],
  ['shares', 'Shares'],
  ['adjust', 'Equal + extras'],
  ['itemized', 'Itemized receipt'],
];
const HELP = {
  equal: 'Everyone ticked pays the same.',
  exact: 'Type what each person owes. It has to add up to the total.',
  percent: 'Give each person a percentage. It has to add up to 100.',
  shares: 'A couple might be 2 shares and a single person 1.',
  adjust: 'Split equally, then add extras for anyone who had more (or less, with a minus).',
  itemized: 'List the receipt lines and tick who had each. Tax and tip are shared in proportion.',
};

const str = (c) => (c == null ? '' : (c / 100).toFixed(2));
const signedCents = (s) => (String(s).trim().startsWith('-') ? -toCents(String(s).trim().slice(1)) : toCents(s));
const mapVals = (o, f) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, f(v)]));
const filled = (o, f) => Object.fromEntries(Object.entries(o).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, f(v)]));

export default function ExpenseForm({ group, expense, onSave, onCancel }) {
  const ids = group.members.map((m) => m.id);
  const inp = expense?.input || {};
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(str(expense?.amount));
  const [paidBy, setPaidBy] = useState(expense?.paidBy || ids[0]);
  const [date, setDate] = useState(expense?.date || new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState(expense?.mode || 'equal');
  const [category, setCategory] = useState(expense?.category || 'food');
  const [members, setMembers] = useState(inp.members || ids);
  const [vals, setVals] = useState({
    exact: mapVals(inp.amounts, str),
    percent: mapVals(inp.percents, String),
    shares: mapVals(inp.shares, String),
    adjust: mapVals(inp.adjustments, str),
  });
  const [items, setItems] = useState((inp.items || [{ name: '', amount: null, members: [] }]).map((it) => ({ ...it, amount: str(it.amount) })));
  const [tax, setTax] = useState(str(inp.tax));
  const [tip, setTip] = useState(str(inp.tip));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setVal = (id, v) => setVals({ ...vals, [mode]: { ...vals[mode], [id]: v } });
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const optCents = (s) => (String(s).trim() ? toCents(s) : 0);

  const input = {
    equal: { members },
    exact: { amounts: filled(vals.exact, toCents) },
    percent: { percents: filled(vals.percent, Number) },
    shares: { shares: filled(vals.shares, Number) },
    adjust: { members, adjustments: filled(vals.adjust, signedCents) },
    itemized: { items: items.map((it) => ({ name: it.name.trim(), amount: toCents(it.amount), members: it.members })), tax: optCents(tax), tip: optCents(tip) },
  }[mode];
  const total = mode === 'itemized' ? itemizedTotal(input) : toCents(amount);

  let splits = [], preview = '';
  try {
    if (!description.trim()) throw new Error('Add a description');
    if (mode !== 'itemized' && Number.isNaN(total)) throw new Error('Enter the total, like 42.50');
    if (Object.values(input.amounts || input.adjustments || {}).some(Number.isNaN)) throw new Error('Use amounts like 12.50');
    if (mode === 'itemized' && (Number.isNaN(input.tax) || Number.isNaN(input.tip))) throw new Error('Use amounts like 4.20 for tax and tip');
    splits = computeSplits(total, mode, input);
  } catch (e) {
    preview = e.message;
  }

  async function submit(e) {
    e.preventDefault();
    if (preview) return;
    setBusy(true);
    try {
      await onSave({ description, amount: total, paidBy, date, mode, input, category });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const perPerson = mode !== 'equal' && mode !== 'itemized';

  return (
    <form className="xform" onSubmit={submit}>
      <h2>{expense ? 'Edit expense' : 'Add expense'}</h2>

      <div className="row">
        <label className="grow">
          What was it?
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Groceries" maxLength={120} autoFocus />
        </label>
        {mode !== 'itemized' && (
          <label className="money">
            Total
            <span className="prefix" data-cur={symbol(group.currency)}>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </span>
          </label>
        )}
      </div>

      <fieldset className="modes cats-pick">
        <legend>Category</legend>
        {Object.entries(CATEGORIES).map(([k, label]) => (
          <label key={k} className={`seg ${category === k ? 'on' : ''}`}>
            <input type="radio" name="category" value={k} checked={category === k} onChange={() => setCategory(k)} />
            <Icon name={k} /> {label}
          </label>
        ))}
      </fieldset>

      <div className="row">
        <label className="grow">
          Paid by
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      <fieldset className="modes">
        <legend>Split</legend>
        {MODES.map(([k, label]) => (
          <label key={k} className={`seg ${mode === k ? 'on' : ''}`}>
            <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="muted help">{HELP[mode]}</p>

      {mode !== 'itemized' && (
        <ul className="people">
          {group.members.map((m) => {
            const share = splits.find((s) => s.member === m.id)?.amount;
            return (
              <li key={m.id}>
                {(mode === 'equal' || mode === 'adjust') ? (
                  <label className="tick">
                    <input type="checkbox" checked={members.includes(m.id)} onChange={() => setMembers(toggle(members, m.id))} />
                    <Chip group={group} id={m.id} /> {m.name}
                  </label>
                ) : (
                  <span className="tick"><Chip group={group} id={m.id} /> {m.name}</span>
                )}
                {perPerson && (
                  <input
                    className="small"
                    aria-label={`${m.name} ${mode}`}
                    inputMode="decimal"
                    placeholder={{ exact: '0.00', percent: '%', shares: '0', adjust: '+0.00' }[mode]}
                    value={vals[mode][m.id] || ''}
                    onChange={(e) => setVal(m.id, e.target.value)}
                  />
                )}
                <span className="share">{share ? fmt(share, group.currency) : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'itemized' && (
        <div className="items">
          {items.map((it, i) => {
            const upd = (patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="item">
                <div className="row">
                  <input className="grow" aria-label="Item" placeholder="Item" value={it.name} onChange={(e) => upd({ name: e.target.value })} />
                  <span className="prefix" data-cur={symbol(group.currency)}>
                    <input className="small" aria-label="Price" inputMode="decimal" placeholder="0.00" value={it.amount} onChange={(e) => upd({ amount: e.target.value })} />
                  </span>
                  <button type="button" className="link danger" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>Remove</button>
                </div>
                <div className="who-had">
                  {group.members.map((m) => (
                    <label key={m.id} className={`pill ${it.members.includes(m.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={it.members.includes(m.id)} onChange={() => upd({ members: toggle(it.members, m.id) })} />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <button type="button" className="ghost" onClick={() => setItems([...items, { name: '', amount: '', members: [] }])}>Add item</button>
          <div className="row">
            <label>Tax<span className="prefix" data-cur={symbol(group.currency)}><input className="small" inputMode="decimal" placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} /></span></label>
            <label>Tip<span className="prefix" data-cur={symbol(group.currency)}><input className="small" inputMode="decimal" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} /></span></label>
          </div>
          {splits.length > 0 && (
            <ul className="people">
              {splits.map((s) => (
                <li key={s.member}><span className="tick"><Chip group={group} id={s.member} /> {group.members.find((m) => m.id === s.member)?.name}</span><span className="share">{fmt(s.amount, group.currency)}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="foot">
        <p className={preview || error ? 'error' : 'ok'} role="status">
          {preview || error || `${fmt(total, group.currency)} split between ${splits.length} ${splits.length === 1 ? 'person' : 'people'}`}
        </p>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!!preview || busy}>{busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}</button>
      </div>
    </form>
  );
}
