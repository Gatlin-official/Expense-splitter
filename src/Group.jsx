import { useEffect, useState } from 'react';
import { fmt, toCents, symbol, CATEGORIES, CURRENCIES } from '../shared/money.js';
import { api, Chip, Modal, CurrencySelect, useUI } from './App.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import { Icon } from './Icon.jsx';

const SPLIT_WORDS = { equal: 'equally', exact: 'by exact amounts', percent: 'by percent', shares: 'by shares', adjust: 'equally with extras', itemized: 'by receipt items' };
const CAT_COLORS = { rent: '#2E2B28', travel: '#A07A5B', food: '#C9A88B', fun: '#6E5A4B', utilities: '#8A9178', groceries: '#B9967A', transport: '#55504A', shopping: '#D8C3B1', other: '#E6D9CD' };

function stats(g) {
  const real = g.expenses.filter((e) => !e.isTransfer);
  const month = new Date().toISOString().slice(0, 7);
  const sum = (list) => list.reduce((a, e) => a + e.amount, 0);
  const byCat = {};
  for (const e of real) byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + e.amount;
  const months = [...Array(6)].map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const key = d.toISOString().slice(0, 7);
    return { key, label: d.toLocaleDateString(undefined, { month: 'short' }), total: sum(real.filter((e) => e.date.startsWith(key))) };
  });
  const people = g.members.map((m) => ({
    id: m.id,
    name: m.name,
    paid: sum(real.filter((e) => e.paidBy === m.id)),
    used: real.reduce((a, e) => a + (e.splits.find((s) => s.member === m.id)?.amount || 0), 0),
  }));
  return {
    spent: sum(real),
    thisMonth: sum(real.filter((e) => e.date.startsWith(month))),
    toSettle: g.settlements.reduce((a, s) => a + s.amount, 0),
    count: real.length,
    byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
    months,
    people,
  };
}

export default function Group({ id }) {
  const ui = useUI();
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | expense
  const [paying, setPaying] = useState(null); // null | {from, to, max}
  const [newMember, setNewMember] = useState('');
  const [party, setParty] = useState(0);

  const update = (ng) => { setG(ng); ui.remember(ng); };
  const refresh = () => api(`/groups/${id}`).then(update, (e) => setError(e.message));
  useEffect(() => {
    refresh();
    // ponytail: 4s polling for live updates; switch to SSE if groups get large or numerous.
    const t = setInterval(() => document.visibilityState === 'visible' && api(`/groups/${id}`).then(setG, () => {}), 4000);
    return () => clearInterval(t);
  }, [id]);

  const act = (p, msg) => p.then((ng) => { update(ng); msg && ui.toast(msg); return ng; }, (e) => { ui.toast(e.message, 'bad'); throw e; });

  if (error && !g) return <main className="welcome"><h1 className="hero small">{error}</h1><p className="lede">Check the invite link, or pick another group on the left.</p></main>;
  if (!g) return <main className="loading">Loading…</main>;

  const cur = g.currency;
  const nameOf = (mid) => g.members.find((m) => m.id === mid)?.name || 'Someone';
  const s = stats(g);
  const maxBal = Math.max(1, ...Object.values(g.balances).map(Math.abs));
  const maxMonth = Math.max(1, ...s.months.map((m) => m.total));
  const maxPerson = Math.max(1, ...s.people.flatMap((p) => [p.paid, p.used]));
  let acc = 0;
  const donut = s.byCat.map(([c, v]) => `${CAT_COLORS[c]} ${(acc / s.spent) * 360}deg ${((acc += v) / s.spent) * 360}deg`).join(', ');
  const feed = [...g.expenses].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt > a.createdAt ? 1 : -1));

  async function remove(e) {
    const label = e.isTransfer ? `${nameOf(e.paidBy)}’s payment to ${nameOf(e.splits[0]?.member)}` : `“${e.description}”`;
    const ok = await ui.confirm({ title: `Delete ${label}?`, body: 'Balances will update for everyone in the group.', action: 'Delete', danger: true });
    if (ok) act(api(`/groups/${id}/expenses/${e.id}`, 'DELETE'), e.isTransfer ? 'Payment deleted' : 'Expense deleted').catch(() => {});
  }

  return (
    <div className="dash">
      <header className="top">
        <div className="title">
          <h1>{g.name}</h1>
          <p className="muted">{g.members.length} people</p>
        </div>
        <div className="actions">
          <label className="cur-pick">
            <span className="sr">Currency</span>
            <CurrencySelect
              value={CURRENCIES[cur] ? cur : 'USD'}
              onChange={(e) => act(api(`/groups/${id}`, 'PATCH', { currency: e.target.value }), `Currency changed to ${e.target.value}`).catch(() => {})}
            />
          </label>
          <button className="ghost" onClick={() => navigator.clipboard.writeText(location.href).then(() => ui.toast('Invite link copied'), () => ui.toast('Couldn’t copy. Copy the address bar instead.', 'bad'))}>
            Copy invite link
          </button>
          <button className="gold" onClick={() => setPaying({})}>Record payment</button>
          <button className="primary" onClick={() => setEditing({})}>Add expense</button>
        </div>
      </header>

      <section className="marquee" aria-label="Summary">
        <div><p className="k">Total spent</p><p className="v">{fmt(s.spent, cur)}</p></div>
        <div><p className="k">This month</p><p className="v">{fmt(s.thisMonth, cur)}</p></div>
        <div className="hot"><p className="k">Left to settle</p><p className="v">{s.toSettle ? fmt(s.toSettle, cur) : 'All square'}</p></div>
        <div><p className="k">Expenses</p><p className="v">{s.count}</p></div>
      </section>

      <div className="grid">
        <section className="panel bal" aria-labelledby="bal">
          <h2 id="bal">Balances</h2>
          <ul className="tug">
            {g.members.map((m) => {
              const v = g.balances[m.id] || 0;
              return (
                <li key={m.id}>
                  <span className="who"><Chip group={g} id={m.id} />{m.name}</span>
                  <span className={`amt ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`}>
                    {v === 0 ? 'even' : v > 0 ? `gets back ${fmt(v, cur)}` : `owes ${fmt(-v, cur)}`}
                  </span>
                  <span className="track" aria-hidden>
                    <span className={`bar ${v < 0 ? 'neg' : 'pos'}`} style={{ '--w': `${(Math.abs(v) / maxBal) * 50}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <form className="addm" onSubmit={(e) => { e.preventDefault(); act(api(`/groups/${id}/members`, 'POST', { name: newMember }), `${newMember.trim()} joined`).then(() => setNewMember(''), () => {}); }}>
            <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Add a person" aria-label="New person’s name" maxLength={60} required />
            <button className="ghost">Add</button>
          </form>
        </section>

        <section className="panel settle" aria-labelledby="settle">
          <h2 id="settle">Settle up</h2>
          {g.settlements.length === 0 ? (
            <p className="muted">Everyone’s even. Nothing to pay.</p>
          ) : (
            <ul className="pays">
              {g.settlements.map((p) => (
                <li key={p.from + p.to}>
                  <span className="pay-line"><Chip group={g} id={p.from} /><b>{nameOf(p.from)}</b> pays <b>{nameOf(p.to)}</b><Chip group={g} id={p.to} /></span>
                  <span className="pay-amt">{fmt(p.amount, cur)}</span>
                  <button className="gold sm" onClick={() => setPaying({ from: p.from, to: p.to, max: p.amount })}>Record payment</button>
                </li>
              ))}
            </ul>
          )}
          {party > 0 && <Confetti key={party} />}
        </section>

        <section className="panel cats" aria-labelledby="cats">
          <h2 id="cats">Where it went</h2>
          {s.spent === 0 ? <p className="muted">Spending by category shows up after the first expense.</p> : (
            <div className="donut-wrap">
              <div className="donut" style={{ background: `conic-gradient(${donut})` }} role="img" aria-label="Spending by category" />
              <ul className="legend">
                {s.byCat.map(([c, v]) => (
                  <li key={c}><i style={{ '--c': CAT_COLORS[c] }} />{CATEGORIES[c]}<b>{fmt(v, cur)}</b></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel months" aria-labelledby="months">
          <h2 id="months">Last 6 months</h2>
          <ul className="cols">
            {s.months.map((m) => (
              <li key={m.key} title={fmt(m.total, cur)}>
                <span className="col-v">{m.total ? fmt(m.total, cur).replace(/\.\d+$/, '') : ''}</span>
                <span className="col" style={{ '--h': `${(m.total / maxMonth) * 100}%` }} />
                <span className="col-k">{m.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel pu" aria-labelledby="pu">
          <h2 id="pu">Paid vs used</h2>
          <p className="muted key"><i className="k-paid" /> paid for the group <i className="k-used" /> their share</p>
          <ul className="pairs">
            {s.people.map((p) => (
              <li key={p.id}>
                <span className="who"><Chip group={g} id={p.id} />{p.name}</span>
                <span className="duo">
                  <span className="b paid" style={{ '--w': `${(p.paid / maxPerson) * 100}%` }}><em>{fmt(p.paid, cur)}</em></span>
                  <span className="b used" style={{ '--w': `${(p.used / maxPerson) * 100}%` }}><em>{fmt(p.used, cur)}</em></span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel feed" aria-labelledby="feed">
          <div className="feed-head">
            <h2 id="feed">Activity</h2>
            <button className="ghost sm" onClick={() => setEditing({})}>Add expense</button>
          </div>
          {feed.length === 0 && (
            <p className="empty">Nothing logged yet. Add the first expense, like rent, groceries or that taxi, and the dashboard fills in.</p>
          )}
          <ul className="exps">
            {feed.map((e) => (
              <li key={e.id} className={`exp ${e.isTransfer ? 'transfer' : ''}`}>
                <span className="cat" style={{ '--c': e.isTransfer ? '#6F7D5C' : CAT_COLORS[e.category || 'other'] }} aria-hidden>
                  <Icon name={e.isTransfer ? 'transfer' : e.category || 'other'} />
                </span>
                <div className="exp-body">
                  <p className="exp-title">{e.isTransfer ? `${nameOf(e.paidBy)} paid ${nameOf(e.splits[0]?.member)}` : e.description}</p>
                  <p className="muted">
                    {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    {', '}
                    {e.isTransfer ? 'payment' : `${nameOf(e.paidBy)} paid, split ${SPLIT_WORDS[e.mode]} between ${e.splits.map((x) => nameOf(x.member)).join(', ')}`}
                  </p>
                </div>
                <span className="exp-amt">{fmt(e.amount, cur)}</span>
                <span className="exp-actions">
                  {!e.isTransfer && <button className="link" onClick={() => setEditing(e)}>Edit</button>}
                  <button className="link danger" onClick={() => remove(e)}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)}>
        <ExpenseForm
          group={g}
          expense={editing?.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSave={(body) =>
            act(api(editing.id ? `/groups/${id}/expenses/${editing.id}` : `/groups/${id}/expenses`, editing.id ? 'PUT' : 'POST', body), editing.id ? 'Changes saved' : 'Expense added')
              .then(() => setEditing(null))
          }
        />
      </Modal>

      <Modal open={!!paying} onClose={() => setPaying(null)} className="small">
        {paying && (
          <PaymentForm
            group={g}
            preset={paying}
            onCancel={() => setPaying(null)}
            onSave={(from, to, amount, owed) =>
              act(api(`/groups/${id}/expenses`, 'POST', { isTransfer: true, mode: 'exact', amount, paidBy: from, input: { amounts: { [to]: amount } } }),
                !owed ? 'Payment recorded' : amount >= owed ? `${nameOf(from)} and ${nameOf(to)} are square` : `Payment recorded, ${fmt(owed - amount, cur)} still to go`)
                .then(() => { setPaying(null); if (amount >= owed && owed > 0) setParty((n) => n + 1); })
            }
          />
        )}
      </Modal>
    </div>
  );
}

function PaymentForm({ group, preset, onSave, onCancel }) {
  const ids = group.members.map((m) => m.id);
  const [from, setFrom] = useState(preset.from || ids[0]);
  const [to, setTo] = useState(preset.to || ids.find((x) => x !== (preset.from || ids[0])));
  const owed = group.settlements.find((s) => s.from === from && s.to === to)?.amount || 0;
  const [amount, setAmount] = useState(preset.max ? (preset.max / 100).toFixed(2) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cents = toCents(amount);
  const cur = group.currency;

  let problem = '';
  if (from === to) problem = 'Pick two different people';
  else if (Number.isNaN(cents) || cents <= 0) problem = 'Enter an amount, like 20.00';
  else if (owed && cents > owed) problem = `That’s more than the ${fmt(owed, cur)} owed`;

  async function submit(e) {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    try { await onSave(from, to, cents, owed); } catch (err) { setError(err.message); setBusy(false); }
  }
  const quick = (f) => setAmount(((Math.round(owed * f)) / 100).toFixed(2));

  return (
    <form className="xform" onSubmit={submit}>
      <h2>Record payment</h2>
      <p className="muted">Paid part of it? Enter what changed hands. The rest stays in settle up.</p>
      <div className="row">
        <label className="grow">From<select value={from} onChange={(e) => setFrom(e.target.value)}>{group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="grow">To<select value={to} onChange={(e) => setTo(e.target.value)}>{group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      <label>
        Amount
        <span className="prefix" data-cur={symbol(cur)}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
        </span>
      </label>
      {owed > 0 && (
        <div className="quick">
          <span className="muted">{group.members.find((m) => m.id === from)?.name} owes {fmt(owed, cur)}</span>
          <button type="button" className="pill-btn" onClick={() => quick(1)}>All of it</button>
          <button type="button" className="pill-btn" onClick={() => quick(0.5)}>Half</button>
        </div>
      )}
      <div className="foot">
        <p className={problem || error ? 'error' : 'ok'} role="status">{problem || error || (owed ? (cents === owed ? 'Clears the debt' : `${fmt(owed - cents, cur)} left after this`) : '')}</p>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!!problem || busy}>{busy ? 'Saving…' : 'Record payment'}</button>
      </div>
    </form>
  );
}

function Confetti() {
  return (
    <span className="confetti" aria-hidden>
      {[...Array(28)].map((_, i) => (
        <i key={i} style={{ '--x': `${Math.cos(i * 0.9) * (60 + (i % 5) * 28)}px`, '--y': `${-40 - (i % 7) * 22}px`, '--r': `${i * 47}deg`, '--d': `${(i % 4) * 40}ms` }} />
      ))}
    </span>
  );
}
