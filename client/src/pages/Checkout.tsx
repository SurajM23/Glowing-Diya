import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, money } from '../api';
import { useCart } from '../cart';
import { useConfig } from '../config';
import { Notice, Section } from '../components/shared';
import type { Estimate, PlacedOrder } from '../types';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-key`);

export default function Checkout() {
  const { products, site, contact, delivery } = useConfig();
  const { lines, set, clear } = useCart();
  const nav = useNavigate();
  const [f, setF] = useState({ customerName: '', phone: '', address: '', pin: '', landmark: '', preferredDate: '', preferredTime: '', notes: '' });
  const [est, setEst] = useState<Estimate | null>(null);
  const [estError, setEstError] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // The same key is reused for an identical retry so a double click or flaky network cannot create two orders.
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const items = useMemo(() => lines.filter((l) => products.some((p) => p.id === l.productId)), [lines, products]);
  const addressReady = f.address.trim().length >= 5 && /^\d{6}$/.test(f.pin);
  const itemsKey = JSON.stringify(items);

  useEffect(() => {
    if (!items.length) { setEst(null); return; }
    setEstimating(true);
    const t = setTimeout(() => {
      api<Estimate>('/orders/estimate', {
        body: { items, ...(addressReady ? { address: f.address.trim(), pin: f.pin } : {}), ...(f.preferredDate ? { preferredDate: f.preferredDate } : {}) },
      })
        .then((e) => { setEst(e); setEstError(''); })
        .catch((e: ApiError) => { setEst(null); setEstError(e.message); })
        .finally(() => setEstimating(false));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, addressReady, f.address, f.pin, f.preferredDate]);

  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const e: Record<string, string> = {};
    if (f.customerName.trim().length < 2) e.customerName = 'Enter your name';
    if (!/^[+\d][\d\s-]{8,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
    if (f.address.trim().length < 5) e.address = 'Enter your full address';
    if (!/^\d{6}$/.test(f.pin)) e.pin = 'Enter a 6-digit PIN code';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setError('');
    if (!validate()) return;
    const body = JSON.stringify({
      items, customerName: f.customerName.trim(), phone: f.phone.trim(), address: f.address.trim(), pin: f.pin,
      ...(f.landmark.trim() && { landmark: f.landmark.trim() }),
      ...(f.preferredDate && { preferredDate: f.preferredDate }),
      ...(f.preferredTime.trim() && { preferredTime: f.preferredTime.trim() }),
      ...(f.notes.trim() && { notes: f.notes.trim() }),
    });
    if (!attempt.current || attempt.current.body !== body) attempt.current = { body, key: newKey() };
    setSubmitting(true);
    try {
      const res = await api<{ order: PlacedOrder; whatsappUrl: string | null }>('/orders', {
        method: 'POST', headers: { 'Idempotency-Key': attempt.current.key }, body: JSON.parse(body),
      });
      try { sessionStorage.setItem(`gd_order_${res.order.ref}`, JSON.stringify(res)); } catch { /* optional */ }
      clear();
      nav(`/order/${res.order.ref}`, { state: res });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!items.length) {
    return (
      <Section title="Your cart is empty">
        <Link to="/shop" className="btn-primary">Browse diyas</Link>
      </Section>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Section title="Checkout">
      <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="card space-y-4">
            <h3 className="font-bold">Your boxes</h3>
            {items.map((l) => {
              const p = products.find((x) => x.id === l.productId)!;
              return (
                <div key={l.productId} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <input aria-label={`Boxes of ${p.name}`} type="number" min={0} max={p.stock} value={l.quantity} inputMode="numeric"
                      onChange={(e) => set(l.productId, Math.min(p.stock, Math.floor(Number(e.target.value)) || 0))} className="input w-20 text-center" />
                    <button type="button" className="text-sm underline" onClick={() => set(l.productId, 0)}>Remove</button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="card space-y-4">
            <h3 className="font-bold">Delivery details</h3>
            <Field id="customerName" label="Full name" error={fieldErrors.customerName}><input id="customerName" autoComplete="name" className="input" value={f.customerName} onChange={up('customerName')} /></Field>
            <Field id="phone" label="Phone number" error={fieldErrors.phone}><input id="phone" type="tel" autoComplete="tel" className="input" value={f.phone} onChange={up('phone')} /></Field>
            <Field id="address" label="Address" error={fieldErrors.address}><textarea id="address" rows={3} autoComplete="street-address" className="input" value={f.address} onChange={up('address')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pin" label="PIN code" error={fieldErrors.pin}><input id="pin" inputMode="numeric" maxLength={6} autoComplete="postal-code" className="input" value={f.pin} onChange={up('pin')} /></Field>
              <Field id="landmark" label="Landmark (optional)"><input id="landmark" className="input" value={f.landmark} onChange={up('landmark')} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="preferredDate" label="Preferred date (optional)"><input id="preferredDate" type="date" min={today} className="input" value={f.preferredDate} onChange={up('preferredDate')} /></Field>
              <Field id="preferredTime" label="Preferred time (optional)"><input id="preferredTime" placeholder="e.g. evening" className="input" value={f.preferredTime} onChange={up('preferredTime')} /></Field>
            </div>
            <Field id="notes" label="Notes (optional)"><textarea id="notes" rows={2} className="input" value={f.notes} onChange={up('notes')} /></Field>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-3" aria-live="polite">
            <h3 className="font-bold">Order summary</h3>
            {estError && <Notice tone="error">{estError}</Notice>}
            {est && (
              <>
                {est.lines.map((l) => (
                  <div key={l.productId} className="flex justify-between text-sm">
                    <span>{l.name} × {l.quantity} <span className="opacity-60">@ {money(l.unitPrice, site.currency)}</span></span>
                    <span>{money(l.total, site.currency)}</span>
                  </div>
                ))}
                {est.saved > 0 && <p className="text-sm text-green-800">You save {money(est.saved, site.currency)}</p>}
                <div className="flex justify-between border-t border-dark/10 pt-3 text-sm"><span>Products</span><span>{money(est.subtotal, site.currency)}</span></div>
                <div className="flex justify-between text-sm">
                  <span>Delivery{est.delivery?.status === 'ok' && est.delivery.billedKm != null ? ` (${est.delivery.billedKm} km × ${money(est.delivery.ratePerKm, site.currency)})` : ''}</span>
                  <span>{!addressReady ? 'Enter address' : est.delivery?.status === 'ok' ? money(est.deliveryFee, site.currency) : 'To be confirmed'}</span>
                </div>
                <div className="flex justify-between border-t border-dark/10 pt-3 text-lg font-bold">
                  <span>{est.totalIsFinal ? 'Estimated total' : 'Products total'}</span><span>{money(est.total, site.currency)}</span>
                </div>
                {!est.totalIsFinal && addressReady && <p className="text-xs opacity-70">The owner will confirm the delivery charge on WhatsApp.</p>}
                <p className="text-xs opacity-70">{est.window}</p>
                {est.notes.map((n) => <Notice key={n}>{n}</Notice>)}
              </>
            )}
            {estimating && !est && <p className="text-sm opacity-60">Calculating…</p>}
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-primary w-full" disabled={submitting || !est || est.delivery?.status === 'out_of_range'}>
              {submitting ? 'Saving your order…' : 'Place order and continue on WhatsApp'}
            </button>
            <p className="text-xs opacity-70">
              Your order is saved first, then WhatsApp opens with the details. It is confirmed only after the owner replies.
              {contact.whatsapp ? '' : ' (WhatsApp is not set up yet, so you will get your order reference instead.)'}
            </p>
            {delivery.maxRadiusKm != null && <p className="text-xs opacity-70">Delivery area: within {delivery.maxRadiusKm} km.</p>}          </div>
        </aside>
      </form>
    </Section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-800" role="alert">{error}</p>}
    </div>
  );
}
