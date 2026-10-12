import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { money } from '../api';
import { useConfig } from '../config';
import { Section } from '../components/shared';
import type { PlacedOrder } from '../types';

type State = { order: PlacedOrder; whatsappUrl: string | null };

function restore(ref: string | undefined, fromNav: State | null): State | null {
  if (fromNav?.order?.ref === ref) return fromNav;
  try {
    const raw = sessionStorage.getItem(`gd_order_${ref}`);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

export default function OrderDone() {
  const { ref } = useParams();
  const loc = useLocation();
  const { site } = useConfig();
  const data = restore(ref, loc.state as State | null);
  const opened = useRef(false);

  // Try once to open WhatsApp. Browsers may block it after an async call, so the button below is the reliable path.
  useEffect(() => {
    if (data?.whatsappUrl && !opened.current) {
      opened.current = true;
      window.open(data.whatsappUrl, '_blank', 'noopener');
    }
  }, [data]);

  if (!data) {
    return (
      <Section title="Order">
        <p>We could not find the details of this order on this device. If you placed an order, please message us on WhatsApp with the reference <strong>{ref}</strong>.</p>
        <Link to="/" className="btn-outline mt-4">Back to home</Link>
      </Section>
    );
  }
  const { order, whatsappUrl } = data;
  return (
    <Section title="Your order is saved">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <p className="text-sm opacity-70">Order reference</p>
          <p className="font-display text-3xl font-bold">{order.ref}</p>
          <p className="rounded-lg bg-primary/20 px-4 py-3 text-sm">
            <strong>Not confirmed yet.</strong> Your order is confirmed only after the owner replies on WhatsApp. Please send us the message so we can start.
          </p>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener" className="btn-primary w-full">Open WhatsApp and send the order</a>
          ) : (
            <p className="text-sm">WhatsApp is not available right now. Keep your reference <strong>{order.ref}</strong> and contact us to confirm.</p>
          )}
          {whatsappUrl && <p className="text-xs opacity-70">WhatsApp did not open? Tap the button again. Your order stays saved.</p>}
          <p className="text-xs opacity-70">Track it any time: tap <Link className="underline" to="/track">Track order</Link> and enter your mobile number and order ID <strong>{order.ref}</strong>.</p>
          <Link to="/" className="btn-outline w-full">Back to home</Link>
        </div>
        <div className="card space-y-2 text-sm">
          <h3 className="font-bold">Summary</h3>
          {order.items.map((i, k) => <div key={k} className="flex justify-between"><span>{i.name} × {i.quantity}</span><span>{money(i.unitPrice * i.quantity, site.currency)}</span></div>)}
          <div className="flex justify-between border-t border-dark/10 pt-2"><span>Delivery</span><span>{order.quote?.status === 'ok' ? money(order.deliveryFee, site.currency) : 'To be confirmed'}</span></div>
          <div className="flex justify-between text-base font-bold"><span>{order.quote?.status === 'ok' ? 'Estimated total' : 'Products total'}</span><span>{money(order.total, site.currency)}</span></div>
          <p className="pt-2 opacity-80">Deliver to: {order.customerName}, {order.address}, {order.pin}</p>
        </div>
      </div>
    </Section>
  );
}
