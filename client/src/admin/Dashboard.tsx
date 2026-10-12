import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, IndianRupee, Inbox, Package, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { money } from '../api';
import { useSummary } from './AdminLayout';
import { useLoad } from './hooks';
import Notifications from './Notifications';
import { Empty, PageHeader, Panel, PaymentBadge, Skeleton, Stat, StatusBadge, relTime } from './ui';

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function Dashboard() {
  const { summary: s } = useSummary();
  const recent = useLoad<any[]>('/admin/orders');
  const month = useLoad<any>(`/admin/reports?from=${monthStart()}`);
  const n = (k: string) => s?.byStatus[k] ?? 0;
  const toConfirm = n('new_enquiry') + n('awaiting_confirmation');
  const toDeliver = n('confirmed') + n('preparing') + n('ready_for_delivery') + n('out_for_delivery');
  const low = s?.stock.filter((p) => p.low) ?? [];
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });

  const alerts = [
    s && s.needsReview > 0 && { to: '/admin/orders?review=1', text: `${s.needsReview} order${s.needsReview > 1 ? 's need' : ' needs'} a delivery charge set by you` },
    ...low.map((p) => ({ to: '/admin/inventory', text: `${p.name}: only ${p.stock} box${p.stock === 1 ? '' : 'es'} left` })),
    s && s.deliveredUnpaid > 0 && { to: '/admin/orders?status=delivered', text: `${s.deliveredUnpaid} delivered order${s.deliveredUnpaid > 1 ? 's are' : ' is'} not fully paid` },
  ].filter(Boolean) as { to: string; text: string }[];

  return (
    <>
      <PageHeader
        title="Overview"
        description={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<Link to="/admin/orders" className="btn-dark btn-sm"><ShoppingBag size={14} aria-hidden />All orders</Link>}
      />

      <Notifications />

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a) => (
            <Link key={a.text} to={a.to} className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100">
              <AlertTriangle size={18} className="shrink-0 text-amber-700" aria-hidden />
              <span className="flex-1">{a.text}</span>
              <ArrowRight size={16} aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Inbox} label="Waiting for you to confirm" value={s ? toConfirm : '–'} hint="New enquiries and awaiting replies" to="/admin/orders?status=new_enquiry" tone={toConfirm ? 'warn' : undefined} />
        <Stat icon={Truck} label="To prepare and deliver" value={s ? toDeliver : '–'} hint={s ? `${n('out_for_delivery')} out right now` : ''} to="/admin/deliveries" />
        <Stat icon={Clock} label="Orders today" value={s ? s.today.orders : '–'} hint={s ? `${money(s.today.value)} order value` : ''} />
        <Stat icon={Package} label="Boxes in stock" value={s ? s.stock.reduce((a, p) => a + p.stock, 0) : '–'} hint={low.length ? `${low.length} product low` : 'Stock is healthy'} to="/admin/inventory" tone={low.length ? 'warn' : 'good'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Latest orders" icon={ShoppingBag} className="lg:col-span-2"
          actions={<Link to="/admin/orders" className="text-sm font-medium text-accent hover:underline">View all</Link>}>
          {!recent.data ? <Skeleton rows={4} /> : recent.data.length === 0 ? (
            <Empty icon={ShoppingBag} title="No orders yet">Orders placed on the shop appear here straight away.</Empty>
          ) : (
            <ul className="-my-2 divide-y divide-dark/5">
              {recent.data.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/orders/${o.id}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-primary/5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-dark">{o.customer_name}</span>
                      <span className="block text-xs text-ink/60">{o.ref} · {o.boxes} box{o.boxes === 1 ? '' : 'es'} · {relTime(o.created_at)}</span>
                    </span>
                    <span className="font-semibold">{money(o.total)}</span>
                    <StatusBadge s={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`${monthName} so far`} icon={IndianRupee}
          actions={<Link to="/admin/reports" className="text-sm font-medium text-accent hover:underline">Reports</Link>}>
          {!month.data ? <Skeleton rows={3} /> : (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink/70">Delivered orders</dt><dd className="font-semibold">{month.data.deliveredOrders}</dd></div>
              <div className="flex justify-between"><dt className="text-ink/70">Product sales</dt><dd className="font-semibold">{money(month.data.productRevenue)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink/70">Delivery fees</dt><dd className="font-semibold">{money(month.data.deliveryRevenue)}</dd></div>
              <div className="flex justify-between border-t border-dark/10 pt-3"><dt className="font-semibold text-dark">Estimated profit</dt><dd className="text-lg font-bold text-dark">{money(month.data.estimatedProfit)}</dd></div>
              {month.data.warnings.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{month.data.warnings[0]}</p>}
            </dl>
          )}
        </Panel>
      </div>

      {s && (
        <Panel title="Payments to collect" icon={Wallet} className="mt-6">
          {(() => {
            const due = (recent.data ?? []).filter((o) => o.status !== 'cancelled' && ['unpaid', 'partially_paid', 'payment_pending'].includes(o.payment_status) && o.status !== 'new_enquiry');
            if (!due.length) return <p className="flex items-center gap-2 text-sm text-green-800"><CheckCircle2 size={16} aria-hidden />Nothing outstanding on confirmed orders.</p>;
            return (
              <ul className="flex flex-wrap gap-2">
                {due.slice(0, 12).map((o) => (
                  <li key={o.id}><Link to={`/admin/orders/${o.id}`} className="flex items-center gap-2 rounded-full border border-dark/10 px-3 py-1.5 text-sm hover:border-primary">
                    {o.customer_name} · {money(o.total)} <PaymentBadge s={o.payment_status} /></Link></li>
                ))}
              </ul>
            );
          })()}
        </Panel>
      )}
    </>
  );
}
