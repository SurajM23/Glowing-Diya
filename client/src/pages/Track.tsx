import { useState } from 'react';
import { api, money } from '../api';
import { useConfig } from '../config';
import { Notice, Section } from '../components/shared';
import type { PlacedOrder } from '../types';

const STEPS = ['new_enquiry', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
const LABEL: Record<string, string> = {
  new_enquiry: 'Order received', awaiting_confirmation: 'Waiting for confirmation', confirmed: 'Confirmed', preparing: 'Being prepared',
  ready_for_delivery: 'Ready for delivery', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
const when = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function Track() {
  const { site } = useConfig();
  const [f, setF] = useState({ phone: '', ref: '' });
  const [orders, setOrders] = useState<PlacedOrder[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Track your order">
      <form className="card max-w-md space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(''); setOrders(null);
        try { setOrders(await api<PlacedOrder[]>('/track', { body: { phone: f.phone, ref: f.ref } })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <p className="text-sm opacity-70">Your order ID (like GD-20261012-A1B2C3) is in the WhatsApp message you sent us.</p>
        <div><label className="label" htmlFor="tp">Mobile number</label><input id="tp" type="tel" autoComplete="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="label" htmlFor="tr">Order ID</label><input id="tr" className="input uppercase" placeholder="GD-…" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-primary w-full" disabled={busy || !f.phone || f.ref.length < 6}>{busy ? 'Finding…' : 'Track'}</button>
      </form>

      {orders && (
        <div className="mt-8 space-y-4">
          {orders.map((o) => {
            const at = STEPS.indexOf(o.status === 'awaiting_confirmation' ? 'new_enquiry' : o.status);
            return (
              <article key={o.ref} className="card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-display text-lg font-bold">{o.ref}</p>{o.createdAt && <p className="text-xs opacity-70">{when(o.createdAt)}</p>}</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${o.status === 'cancelled' ? 'bg-stone-200' : o.status === 'delivered' ? 'bg-green-100 text-green-900' : 'bg-primary/30'}`}>{LABEL[o.status] ?? o.status}</span>
                </div>
                {o.status !== 'cancelled' && (
                  <ol className="flex gap-1" aria-label={`Progress: ${LABEL[o.status] ?? o.status}`}>
                    {STEPS.map((s, i) => <li key={s} title={LABEL[s]} className={`h-2 flex-1 rounded-full ${i <= at ? 'bg-green-600' : 'bg-dark/10'}`} />)}
                  </ol>
                )}
                <div className="text-sm">
                  {o.items.map((i, k) => <p key={k}>{i.name} × {i.quantity}</p>)}
                  <p className="mt-1 font-semibold">Total {money(o.total, site.currency)}</p>
                </div>
                {o.history && o.history.length > 0 && (
                  <details className="text-sm"><summary className="cursor-pointer opacity-80">Status updates</summary>
                    <ul className="mt-2 space-y-1">{[...o.history].reverse().map((h, k) => <li key={k}>{LABEL[h.status] ?? h.status} · <span className="opacity-60">{when(h.at)}</span></li>)}</ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}
