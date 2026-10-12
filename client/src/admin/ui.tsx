import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

// ---------- order & payment status ----------

export const STATUS: Record<string, { label: string; short: string; cls: string }> = {
  new_enquiry: { label: 'New enquiry', short: 'New', cls: 'bg-sky-100 text-sky-900' },
  awaiting_confirmation: { label: 'Awaiting confirmation', short: 'Awaiting', cls: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Confirmed', short: 'Confirmed', cls: 'bg-indigo-100 text-indigo-900' },
  preparing: { label: 'Preparing', short: 'Preparing', cls: 'bg-violet-100 text-violet-900' },
  ready_for_delivery: { label: 'Ready for delivery', short: 'Ready', cls: 'bg-teal-100 text-teal-900' },
  out_for_delivery: { label: 'Out for delivery', short: 'Out', cls: 'bg-orange-100 text-orange-900' },
  delivered: { label: 'Delivered', short: 'Delivered', cls: 'bg-green-100 text-green-900' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', cls: 'bg-stone-200 text-stone-700' },
};
export const ORDER_FLOW = Object.keys(STATUS);

export const PAYMENT: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Unpaid', cls: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200' },
  payment_pending: { label: 'Payment pending', cls: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
  partially_paid: { label: 'Part paid', cls: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200' },
  refunded: { label: 'Refunded', cls: 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200' },
};

export const StatusBadge = ({ s }: { s: string }) => <span className={`chip ${STATUS[s]?.cls ?? 'bg-dark/10'}`}>{STATUS[s]?.label ?? s}</span>;
export const PaymentBadge = ({ s }: { s: string }) => <span className={`chip ${PAYMENT[s]?.cls ?? 'bg-dark/10'}`}>{PAYMENT[s]?.label ?? s}</span>;

// ---------- layout pieces ----------

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-dark sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink/70">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, icon: Icon, actions, children, className = '', tone }: {
  title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; tone?: 'warn' | 'danger';
}) {
  const border = tone === 'warn' ? 'border-amber-300' : tone === 'danger' ? 'border-red-200' : 'border-dark/10';
  return (
    <section className={`rounded-2xl border ${border} bg-white shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-dark/5 px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-dark">{Icon && <Icon size={16} className="text-accent" aria-hidden />}{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon: Icon, to, tone }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; to?: string; tone?: 'warn' | 'good';
}) {
  const iconCls = tone === 'warn' ? 'bg-amber-100 text-amber-800' : tone === 'good' ? 'bg-green-100 text-green-800' : 'bg-primary/20 text-accent';
  const body = (
    <div className="flex h-full items-start gap-4 rounded-2xl border border-dark/10 bg-white p-5 shadow-sm transition hover:border-primary hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconCls}`}><Icon size={20} aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm text-ink/70">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-dark">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink/60">{hint}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block rounded-2xl">{body}</Link> : body;
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-accent"><Icon size={22} aria-hidden /></span>
      <p className="font-semibold text-dark">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink/70">{children}</div>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-dark/5" />)}
    </div>
  );
}

// ---------- helpers ----------

export function relTime(s?: string | null) {
  if (!s) return '';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** wa.me link for messaging a customer from the owner's phone. */
export function customerWhatsApp(phone: string, text: string) {
  const d = phone.replace(/\D/g, '');
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export const mapsLink = (address: string, pin: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${pin}`)}`;
