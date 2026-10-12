import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money } from '../api';
import { useAccount, type Customer } from '../account';
import { useConfig } from '../config';
import { Notice, Section } from '../components/shared';
import type { PlacedOrder } from '../types';

const STEPS = ['new_enquiry', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
const LABEL: Record<string, string> = {
  new_enquiry: 'Order received', awaiting_confirmation: 'Waiting for confirmation', confirmed: 'Confirmed', preparing: 'Being prepared',
  ready_for_delivery: 'Ready for delivery', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};

export function AccountLogin() {
  const { customer, setCustomer } = useAccount();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (customer) nav('/account/orders', { replace: true }); }, [customer, nav]);

  return (
    <Section title="Track your orders">
      <form className="card max-w-sm space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try { setCustomer(await api<Customer>('/account/login', { body: { phone, password } })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div><label className="label" htmlFor="ap">Phone number</label><input id="ap" type="tel" autoComplete="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-dark w-full" disabled={busy || !phone || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-xs opacity-70">No account? Tick "Track this order" when you check out and choose a password.</p>
      </form>
    </Section>
  );
}

export function AccountOrders() {
  const { customer, ready, logout } = useAccount();
  const { site } = useConfig();
  const nav = useNavigate();
  const [orders, setOrders] = useState<PlacedOrder[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!ready) return;
    if (!customer) { nav('/account/login', { replace: true }); return; }
    api<PlacedOrder[]>('/account/orders').then(setOrders).catch((e) => setError(e.message));
  }, [ready, customer, nav]);

  if (!customer) return null;
  return (
    <Section title="My orders">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>Signed in as <strong>{customer.name}</strong> ({customer.phone})</p>
        <button className="underline" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {orders?.length === 0 && <p>No orders yet. <Link className="underline" to="/shop">Browse diyas</Link></p>}
      <div className="space-y-4">
        {orders?.map((o) => {
          const at = STEPS.indexOf(o.status === 'awaiting_confirmation' ? 'new_enquiry' : o.status);
          return (
            <article key={o.ref} className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-display text-lg font-bold">{o.ref}</p><p className="text-xs opacity-70">{o.createdAt && new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${o.status === 'cancelled' ? 'bg-stone-200' : o.status === 'delivered' ? 'bg-green-100 text-green-900' : 'bg-primary/30'}`}>{LABEL[o.status] ?? o.status}</span>
              </div>
              {o.status !== 'cancelled' && (
                <ol className="flex gap-1" aria-label="Progress">
                  {STEPS.map((s, i) => <li key={s} title={LABEL[s]} className={`h-2 flex-1 rounded-full ${i <= at ? 'bg-green-600' : 'bg-dark/10'}`} />)}
                </ol>
              )}
              <div className="text-sm">
                {o.items.map((i, k) => <p key={k}>{i.name} × {i.quantity}</p>)}
                <p className="mt-1 font-semibold">Total {money(o.total, site.currency)}</p>
              </div>
              {o.history && o.history.length > 0 && (
                <details className="text-sm"><summary className="cursor-pointer opacity-80">Status updates</summary>
                  <ul className="mt-2 space-y-1">{[...o.history].reverse().map((h, k) => <li key={k}>{LABEL[h.status] ?? h.status} · <span className="opacity-60">{new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>)}</ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </Section>
  );
}
