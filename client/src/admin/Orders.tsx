import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Ban, Check, CircleDot, ClipboardList, History, MapPin, MessageCircle, Phone, ReceiptIndianRupee,
  Search, ShoppingBag, StickyNote, Truck, User, XCircle,
} from 'lucide-react';
import { api, money } from '../api';
import { useConfig } from '../config';
import { useSummary } from './AdminLayout';
import { ErrorBox, Msg, fmtDate, useAction, useLoad } from './hooks';
import { Empty, PageHeader, Panel, PaymentBadge, STATUS, Skeleton, StatusBadge, customerWhatsApp, mapsLink, relTime } from './ui';

const NEXT: Record<string, string[]> = {
  new_enquiry: ['awaiting_confirmation', 'confirmed', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'ready_for_delivery', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'ready_for_delivery', 'cancelled'],
  delivered: [], cancelled: [],
};
const STEPS = ['new_enquiry', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
const STEP_LABEL: Record<string, string> = { new_enquiry: 'Enquiry', confirmed: 'Confirmed', preparing: 'Preparing', ready_for_delivery: 'Ready', out_for_delivery: 'Out', delivered: 'Delivered' };
const ACTION_LABEL: Record<string, string> = {
  awaiting_confirmation: 'Waiting on customer', confirmed: 'Confirm order', preparing: 'Start preparing',
  ready_for_delivery: 'Mark ready', out_for_delivery: 'Send out for delivery', delivered: 'Mark delivered',
};
const TABS = ['', 'new_enquiry', 'awaiting_confirmation', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

// ---------- list ----------

export function Orders() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { summary } = useSummary();
  const f = { status: params.get('status') ?? '', q: params.get('q') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '', review: params.get('review') ?? '' };
  const [q, setQ] = useState(f.q);
  const set = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };
  // Search as you type, without a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => { if (q !== f.q) set({ q }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error } = useLoad<any[]>(`/admin/orders?${qs}`);
  const total = summary ? Object.values(summary.byStatus).reduce((a, b) => a + b, 0) : null;
  const filtered = Boolean(f.q || f.from || f.to || f.review);

  return (
    <>
      <PageHeader title="Orders" description="Every order is saved here before the customer opens WhatsApp. Nothing is confirmed until you confirm it." />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter by status">
        <div className="flex w-max gap-1 rounded-xl bg-dark/5 p-1">
          {TABS.map((s) => {
            const count = s ? summary?.byStatus[s] ?? 0 : total;
            const active = f.status === s;
            return (
              <button key={s || 'all'} role="tab" aria-selected={active} onClick={() => set({ status: s })}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-white text-dark shadow-sm' : 'text-ink/70 hover:text-dark'}`}>
                {s ? STATUS[s].short : 'All'}
                {count != null && count > 0 && <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-primary/30' : 'bg-dark/10'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <label htmlFor="q" className="sr-only">Search orders</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" aria-hidden />
          <input id="q" className="input !pl-9" placeholder="Search by ref, name, phone or PIN" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div><label className="label !text-xs" htmlFor="from">From</label><input id="from" type="date" className="input !py-2" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
        <div><label className="label !text-xs" htmlFor="to">To</label><input id="to" type="date" className="input !py-2" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${f.review ? 'border-amber-400 bg-amber-50' : 'border-dark/20 bg-white'}`}>
          <input type="checkbox" checked={f.review === '1'} onChange={(e) => set({ review: e.target.checked ? '1' : '' })} />Needs review
          {summary && summary.needsReview > 0 && <span className="rounded-full bg-amber-200 px-1.5 text-xs font-semibold">{summary.needsReview}</span>}
        </label>
      </div>

      <ErrorBox error={error} />
      <div className="overflow-hidden rounded-2xl border border-dark/10 bg-white shadow-sm">
        {!data ? <div className="p-5"><Skeleton rows={5} /></div> : data.length === 0 ? (
          <Empty icon={ShoppingBag} title={filtered || f.status ? 'No orders match' : 'No orders yet'}>
            {filtered || f.status ? 'Try another status or clear the search.' : 'Orders placed on the shop appear here straight away.'}
          </Empty>
        ) : (
          <>
            {/* Desktop table */}
            <table className="tbl hidden md:table">
              <thead><tr><th>Order</th><th>Customer</th><th>PIN</th><th className="text-right">Boxes</th><th className="text-right">Total</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/admin/orders/${o.id}`)}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`} className="font-semibold text-dark hover:underline" onClick={(e) => e.stopPropagation()}>{o.ref}</Link>
                      <span className="block text-xs text-ink/60" title={fmtDate(o.created_at)}>{relTime(o.created_at)}</span>
                    </td>
                    <td>{o.customer_name}<span className="block text-xs text-ink/60">{o.phone}</span></td>
                    <td>{o.pin}</td>
                    <td className="text-right">{o.boxes}</td>
                    <td className="text-right font-semibold">{money(o.total)}</td>
                    <td><span className="flex flex-wrap items-center gap-1"><StatusBadge s={o.status} />{o.needs_review && <span className="chip bg-amber-100 text-amber-900"><AlertTriangle size={12} aria-hidden />Review</span>}</span></td>
                    <td><PaymentBadge s={o.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phone cards */}
            <ul className="divide-y divide-dark/5 md:hidden">
              {data.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/orders/${o.id}`} className="block space-y-2 p-4 hover:bg-primary/5">
                    <div className="flex items-start justify-between gap-3">
                      <span><span className="block font-semibold text-dark">{o.customer_name}</span><span className="block text-xs text-ink/60">{o.ref} · {relTime(o.created_at)}</span></span>
                      <span className="text-right font-semibold">{money(o.total)}<span className="block text-xs font-normal text-ink/60">{o.boxes} box{o.boxes === 1 ? '' : 'es'} · {o.pin}</span></span>
                    </div>
                    <div className="flex flex-wrap gap-1"><StatusBadge s={o.status} /><PaymentBadge s={o.payment_status} />{o.needs_review && <span className="chip bg-amber-100 text-amber-900">Review</span>}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {data && data.length >= 500 && <p className="mt-2 text-xs text-ink/60">Showing the latest 500. Narrow the dates to see older orders.</p>}
    </>
  );
}

// ---------- detail ----------

function Stepper({ status }: { status: string }) {
  const at = STEPS.indexOf(status === 'awaiting_confirmation' ? 'new_enquiry' : status);
  return (
    <ol className="flex items-center" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i < at || status === 'delivered';
        const current = i === at && status !== 'delivered';
        return (
          <li key={s} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="flex flex-col items-center gap-1">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${done ? 'border-green-600 bg-green-600 text-white' : current ? 'border-accent bg-primary/20 text-accent' : 'border-dark/15 bg-white text-ink/40'}`}>
                {done ? <Check size={16} aria-hidden /> : i + 1}
              </span>
              <span className={`hidden text-xs sm:block ${current ? 'font-semibold text-dark' : 'text-ink/60'}`}>{STEP_LABEL[s]}</span>
            </span>
            {i < STEPS.length - 1 && <span className={`mx-1 mb-0 h-0.5 flex-1 sm:mb-5 ${i < at || status === 'delivered' ? 'bg-green-600' : 'bg-dark/10'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { brand } = useConfig();
  const { refresh } = useSummary();
  const { data: o, error, setData } = useLoad<any>(`/admin/orders/${id}`);
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [fail, setFail] = useState('');
  const [fee, setFee] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [pay, setPay] = useState({ kind: 'payment', method: 'upi', amount: '', reference: '' });

  if (!o) return error ? <ErrorBox error={error} /> : <Skeleton rows={6} />;

  const act = async (fn: () => Promise<any>, text?: string) => {
    const r = await run(fn, text);
    if (r) { setData(r); refresh(); }
    return r;
  };
  const post = (p: string, body: unknown) => api(`/admin/orders/${id}${p}`, { body });
  const paid = o.payments.reduce((a: number, p: any) => a + (p.kind === 'refund' ? -p.amount : p.amount), 0);
  const balance = Math.max(0, o.total - paid);
  const at = STEPS.indexOf(o.status === 'awaiting_confirmation' ? 'new_enquiry' : o.status);
  const primary = STEPS[at + 1] && NEXT[o.status].includes(STEPS[at + 1]) ? STEPS[at + 1] : null;
  const secondary = NEXT[o.status].filter((s) => s !== primary && s !== 'cancelled' && !(o.status === 'out_for_delivery' && s === 'ready_for_delivery'));
  const open = !['delivered', 'cancelled'].includes(o.status);
  const waText = `Hi ${o.customer_name}, this is ${brand.name} about your order ${o.ref}.`;

  return (
    <>
      <Link to="/admin/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/70 hover:text-dark"><ArrowLeft size={16} aria-hidden />All orders</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-dark sm:text-3xl">{o.ref}</h1>
            <StatusBadge s={o.status} /><PaymentBadge s={o.payment_status} />
          </div>
          <p className="mt-1 text-sm text-ink/70">Placed {fmtDate(o.created_at)} · {money(o.total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${o.phone}`} className="btn-outline btn-sm"><Phone size={14} aria-hidden />Call</a>
          <a href={customerWhatsApp(o.phone, waText)} target="_blank" rel="noopener" className="btn-primary btn-sm"><MessageCircle size={14} aria-hidden />WhatsApp customer</a>
        </div>
      </div>

      <div className="mb-4"><Msg m={msg} /></div>

      {o.status === 'cancelled' ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-stone-300 bg-stone-100 p-4 text-sm">
          <XCircle size={20} className="shrink-0 text-stone-600" aria-hidden />
          <div><p className="font-semibold">This order was cancelled</p>{o.cancel_reason && <p className="text-ink/80">Reason: {o.cancel_reason}</p>}</div>
        </div>
      ) : (
        <Panel className="mb-6">
          <Stepper status={o.status} />
          {o.status === 'awaiting_confirmation' && <p className="mt-3 text-sm text-ink/70">Waiting for the customer to reply before confirming.</p>}
          {open && (
            <div className="mt-5 space-y-3 border-t border-dark/5 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                {primary && <button disabled={busy} className="btn-dark" onClick={() => act(() => post('/status', { status: primary, note }), `Marked ${STATUS[primary].label.toLowerCase()}`).then(() => setNote(''))}>{ACTION_LABEL[primary]}</button>}
                {secondary.map((s) => <button key={s} disabled={busy} className="btn-outline btn-sm" onClick={() => act(() => post('/status', { status: s, note }), `Marked ${STATUS[s].label.toLowerCase()}`).then(() => setNote(''))}>{ACTION_LABEL[s]}</button>)}
              </div>
              <input aria-label="Note for this status change (optional)" className="input" placeholder="Add a note with this change (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              {o.status === 'out_for_delivery' && (
                <div className="flex flex-wrap gap-2 rounded-xl bg-orange-50 p-3">
                  <input aria-label="Why did delivery fail?" className="input min-w-[200px] flex-1" placeholder="Delivery failed? Why (e.g. customer not home)" value={fail} onChange={(e) => setFail(e.target.value)} />
                  <button disabled={busy || !fail.trim()} className="btn-outline btn-sm" onClick={() => act(() => post('/failed-attempt', { reason: fail }), 'Failed attempt recorded').then(() => setFail(''))}><Truck size={14} aria-hidden />Record failed attempt</button>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Customer" icon={User}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-ink/60">Name</dt><dd className="font-medium">{o.customer_name}</dd></div>
              <div><dt className="text-xs text-ink/60">Phone</dt><dd><a className="font-medium hover:underline" href={`tel:${o.phone}`}>{o.phone}</a></dd></div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink/60">Address</dt>
                <dd className="font-medium">{o.address}, {o.pin}{o.landmark && <span className="font-normal text-ink/70"> · near {o.landmark}</span>}</dd>
                <a href={mapsLink(o.address, o.pin)} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"><MapPin size={12} aria-hidden />Open in Maps</a>
              </div>
              {o.preferred_slot && <div><dt className="text-xs text-ink/60">Preferred delivery</dt><dd>{o.preferred_slot}</dd></div>}
              {o.customer_notes && <div className="sm:col-span-2"><dt className="text-xs text-ink/60">Customer's note</dt><dd className="rounded-lg bg-primary/10 p-2">{o.customer_notes}</dd></div>}
            </dl>
          </Panel>

          <Panel title="Items and charges" icon={ClipboardList}>
            <table className="w-full text-sm">
              <tbody>
                {o.items.map((i: any) => (
                  <tr key={i.id}><td className="py-1.5">{i.name} <span className="text-ink/60">× {i.quantity} @ {money(i.unit_price)}</span></td><td className="py-1.5 text-right">{money(i.unit_price * i.quantity)}</td></tr>
                ))}
                <tr className="border-t border-dark/10"><td className="py-1.5 text-ink/70">Products</td><td className="py-1.5 text-right">{money(o.subtotal)}</td></tr>
                <tr><td className="py-1.5 text-ink/70">Delivery{o.quote?.billed_km != null && ` (${o.quote.billed_km} km × ${money(o.quote.rate_per_km)})`}</td><td className="py-1.5 text-right">{money(o.delivery_fee)}</td></tr>
                <tr className="border-t border-dark/10 text-base font-bold"><td className="pt-2">Total</td><td className="pt-2 text-right">{money(o.total)}</td></tr>
              </tbody>
            </table>
            {o.quote && <p className="mt-3 text-xs text-ink/60">Quote at order time: {o.quote.note}{o.quote.distance_km != null && ` Road distance ${Number(o.quote.distance_km).toFixed(1)} km.`}</p>}
            {(o.needs_review || o.quote?.status !== 'ok') && open && (
              <div className={`mt-4 rounded-xl p-4 ${o.needs_review ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-dark/[0.03]'}`}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">{o.needs_review && <AlertTriangle size={16} className="text-amber-700" aria-hidden />}Set the delivery charge</p>
                <p className="mb-3 text-xs text-ink/70">The address could not be measured automatically. Agree the charge with the customer, then save it here.</p>
                <div className="flex gap-2">
                  <input aria-label="Delivery charge in rupees" type="number" min={0} className="input max-w-[160px]" placeholder={`₹ (now ${o.delivery_fee})`} value={fee} onChange={(e) => setFee(e.target.value)} />
                  <button disabled={busy || fee === ''} className="btn-dark btn-sm" onClick={() => act(() => api(`/admin/orders/${id}`, { method: 'PATCH', body: { deliveryFee: Number(fee) } }), 'Delivery charge saved').then(() => setFee(''))}>Save charge</button>
                </div>
              </div>
            )}
          </Panel>

          {open && (
            <details className="group rounded-2xl border border-red-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-semibold text-red-800"><Ban size={16} aria-hidden />Cancel this order</summary>
              <div className="space-y-3 border-t border-red-100 p-5">
                <p className="text-sm text-ink/70">Reserved boxes go back into stock. The customer is not notified automatically.</p>
                <textarea aria-label="Cancellation reason" rows={2} className="input" placeholder="Reason (required), e.g. customer changed their mind" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button disabled={busy || !reason.trim()} className="btn-danger btn-sm"
                  onClick={() => { if (window.confirm(`Cancel order ${o.ref}?`)) act(() => post('/status', { status: 'cancelled', note: reason }), 'Order cancelled'); }}>Cancel order</button>
              </div>
            </details>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Payment" icon={ReceiptIndianRupee}>
            <div className="mb-1 flex items-baseline justify-between text-sm"><span className="text-ink/70">Received</span><span><strong className="text-lg">{money(paid)}</strong> <span className="text-ink/60">of {money(o.total)}</span></span></div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-dark/10" role="progressbar" aria-valuemin={0} aria-valuemax={o.total} aria-valuenow={paid} aria-label="Amount paid">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${Math.min(100, o.total ? (paid / o.total) * 100 : 0)}%` }} />
            </div>
            {o.payments.length > 0 && (
              <ul className="mb-4 space-y-2 text-sm">
                {o.payments.map((p: any) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.kind === 'refund' ? 'Refund' : 'Payment'} · {p.method.toUpperCase()}{p.reference && <span className="text-ink/60"> · {p.reference}</span>}<span className="block text-xs text-ink/50">{fmtDate(p.paid_at)}</span></span>
                    <span className={p.kind === 'refund' ? 'text-red-700' : ''}>{p.kind === 'refund' ? '−' : ''}{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <form className="space-y-2 border-t border-dark/5 pt-4" onSubmit={(e) => {
              e.preventDefault();
              act(() => post('/payments', { ...pay, amount: Number(pay.amount) }), pay.kind === 'refund' ? 'Refund recorded' : 'Payment recorded').then((r) => r && setPay({ ...pay, amount: '', reference: '' }));
            }}>
              <p className="text-xs text-ink/60">Record money only after you have checked it arrived.</p>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Type" className="input !py-2" value={pay.kind} onChange={(e) => setPay({ ...pay, kind: e.target.value })}><option value="payment">Payment</option><option value="refund">Refund</option></select>
                <select aria-label="Method" className="input !py-2" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="upi">UPI</option><option value="cash">Cash</option><option value="other">Other</option></select>
                <input aria-label="Amount" type="number" min={1} className="input !py-2" placeholder={balance ? `₹ ${balance} due` : '₹'} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <input aria-label="Reference" className="input !py-2" placeholder="UPI ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button disabled={busy || !pay.amount} className="btn-dark btn-sm flex-1">Record {pay.kind}</button>
                {balance > 0 && pay.kind === 'payment' && <button type="button" className="btn-ghost btn-sm" onClick={() => setPay({ ...pay, amount: String(balance) })}>Full balance</button>}
              </div>
            </form>
          </Panel>

          <Panel title="Internal notes" icon={StickyNote}>
            <textarea aria-label="Internal notes (only visible to you)" rows={3} className="input" placeholder="Only visible to you" value={notes ?? o.internal_notes} onChange={(e) => setNotes(e.target.value)} />
            <button disabled={busy || notes === null || notes === o.internal_notes} className="btn-outline btn-sm mt-2"
              onClick={() => act(() => api(`/admin/orders/${id}`, { method: 'PATCH', body: { internalNotes: notes } }), 'Notes saved').then(() => setNotes(null))}>Save notes</button>
          </Panel>

          <Panel title="History" icon={History}>
            <ol className="relative space-y-4 border-l-2 border-dark/10 pl-5 text-sm">
              {[...o.history.map((h: any) => ({ ...h, kind: 'status' })), ...o.attempts.filter((a: any) => a.outcome === 'failed').map((a: any) => ({ ...a, kind: 'attempt' }))]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((h: any) => (
                  <li key={`${h.kind}-${h.id}`} className="relative">
                    <span className={`absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${h.kind === 'attempt' ? 'bg-orange-500' : 'bg-primary'}`}><CircleDot size={10} className="text-white" aria-hidden /></span>
                    <p className="font-medium text-dark">{h.kind === 'attempt' ? 'Delivery attempt failed' : STATUS[h.to_status]?.label ?? h.to_status}</p>
                    <p className="text-xs text-ink/60">{fmtDate(h.created_at)} · {h.actor}</p>
                    {(h.note || h.reason) && <p className="mt-0.5 text-ink/80">{h.note || h.reason}</p>}
                  </li>
                ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
