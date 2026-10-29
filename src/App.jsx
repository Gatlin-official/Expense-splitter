import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CURRENCIES, symbol } from '../shared/money.js';
import Group from './Group.jsx';

export async function api(path, method = 'GET', body) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}). Try again.`);
  return data;
}

const HUES = ['#A07A5B', '#2E2B28', '#7D8A6A', '#8C6F5A', '#5E5650', '#B88E6E', '#6E5A4B', '#9A8F83'];
export const hue = (members, id) => HUES[Math.max(0, members.findIndex((m) => m.id === id)) % HUES.length];

export function Chip({ group, id, size }) {
  const m = group.members.find((x) => x.id === id);
  return (
    <span className={`chip ${size || ''}`} style={{ '--c': hue(group.members, id) }} title={m?.name}>
      {m?.name.slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

// Native <dialog> keeps focus trapping and Esc-to-close for free.
export function Modal({ open, onClose, children, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`sheet ${className}`} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && children}
    </dialog>
  );
}

export const CurrencySelect = (props) => (
  <select {...props}>
    {Object.entries(CURRENCIES).map(([code, label]) => (
      <option key={code} value={code}>{symbol(code)}  {label} ({code})</option>
    ))}
  </select>
);

const UI = createContext();
export const useUI = () => useContext(UI);

const load = () => { try { return JSON.parse(localStorage.getItem('tab.groups')) || []; } catch { return []; } };
const store = (list) => { try { localStorage.setItem('tab.groups', JSON.stringify(list)); } catch {} };

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [saved, setSaved] = useState(load);
  const [toasts, setToasts] = useState([]);
  const [ask, setAsk] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  useEffect(() => store(saved), [saved]);

  const navigate = (p) => { history.pushState(null, '', p); setPath(p); };
  const id = path.match(/^\/g\/([\w-]+)/)?.[1];

  const ui = {
    toast(text, kind = 'ok') {
      const t = { id: Math.random(), text, kind };
      setToasts((x) => [...x, t]);
      setTimeout(() => setToasts((x) => x.filter((y) => y !== t)), 3500);
    },
    confirm: (opts) => new Promise((resolve) => setAsk({ ...opts, resolve })),
    remember(g) {
      setSaved((list) => {
        const i = list.findIndex((x) => x.id === g.id);
        if (i >= 0 && list[i].name === g.name) return list;
        return i >= 0 ? list.map((x, j) => (j === i ? { id: g.id, name: g.name } : x)) : [{ id: g.id, name: g.name }, ...list];
      });
    },
  };
  const answer = (v) => { ask.resolve(v); setAsk(null); };

  async function forget(g) {
    if (!(await ui.confirm({ title: `Remove “${g.name}” from your list?`, body: 'The group isn’t deleted. You can get back in with its invite link.', action: 'Remove from list' }))) return;
    setSaved((l) => l.filter((x) => x.id !== g.id));
    if (g.id === id) navigate('/');
  }

  return (
    <UI.Provider value={ui}>
      <div className="shell">
        <nav className="rail" aria-label="Your groups">
          <a href="/" className="brand" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Tab</a>
          <button className="primary new" onClick={() => setCreating(true)}>New group</button>
          <ul className="groups">
            {saved.map((g) => (
              <li key={g.id} className={g.id === id ? 'on' : ''}>
                <a href={`/g/${g.id}`} onClick={(e) => { e.preventDefault(); navigate(`/g/${g.id}`); }} aria-current={g.id === id ? 'page' : undefined}>
                  <span className="gdot">{g.name.slice(0, 1).toUpperCase()}</span>
                  <span className="gname">{g.name}</span>
                </a>
                <button className="x" aria-label={`Remove ${g.name} from your list`} onClick={() => forget(g)}>×</button>
              </li>
            ))}
          </ul>
          {saved.length === 0 && <p className="muted rail-empty">Groups you create or open will show up here.</p>}
        </nav>

        <div className="stage">
          {id ? <Group key={id} id={id} /> : <Welcome onCreate={() => setCreating(true)} hasGroups={saved.length > 0} />}
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)}>
        <CreateGroup onCancel={() => setCreating(false)} onCreated={(g) => { ui.remember(g); setCreating(false); navigate(`/g/${g.id}`); ui.toast(`${g.name} is ready. Copy the invite link to add your people.`); }} />
      </Modal>

      <Modal open={!!ask} onClose={() => ask && answer(false)} className="small">
        {ask && (
          <div className="confirm">
            <h2>{ask.title}</h2>
            {ask.body && <p className="muted">{ask.body}</p>}
            <div className="foot">
              <button className="ghost" onClick={() => answer(false)}>Cancel</button>
              <button className={ask.danger ? 'danger-btn' : 'primary'} onClick={() => answer(true)} autoFocus>{ask.action}</button>
            </div>
          </div>
        )}
      </Modal>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <p key={t.id} className={`toast ${t.kind}`}>{t.text}</p>)}
      </div>
    </UI.Provider>
  );
}

function Welcome({ onCreate, hasGroups }) {
  return (
    <main className="welcome">
      <p className="eyebrow">Shared expenses, simply settled</p>
      <h1 className="hero">Who owes who,<br />worked out.</h1>
      <p className="lede">
        Start a tab for your flat, trip, or dinner club. Log what people paid, split it however you like,
        and get the shortest list of payments to make everyone even. No accounts, just a link.
      </p>
      <button className="primary big" onClick={onCreate}>Start a group</button>
      {hasGroups && <p className="muted hint">Or pick one of your groups on the left.</p>}
    </main>
  );
}

function CreateGroup({ onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [members, setMembers] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { id } = await api('/groups', 'POST', { name, currency, members: members.filter((m) => m.trim()) });
      onCreated({ id, name: name.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="xform" onSubmit={create}>
      <h2>New group</h2>
      <div className="row">
        <label className="grow">
          Group name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flat 4B" required maxLength={60} autoFocus />
        </label>
        <label className="grow">
          Currency
          <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
      </div>
      <fieldset className="names">
        <legend>Who’s in</legend>
        {members.map((m, i) => (
          <input
            key={i}
            value={m}
            aria-label={`Person ${i + 1}`}
            placeholder={['Alex', 'Sam', 'Jordan'][i] || 'Name'}
            maxLength={60}
            onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
        <button type="button" className="ghost" onClick={() => setMembers([...members, ''])}>Add another person</button>
      </fieldset>
      <div className="foot">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
      </div>
    </form>
  );
}
