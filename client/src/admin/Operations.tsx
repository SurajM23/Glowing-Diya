import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, ArchiveRestore, BarChart3, CalendarRange, CheckCircle2, Fuel, IndianRupee, MapPin, Pencil, Plus, Receipt, Route,
  ScrollText, Sparkles, Trash2, Truck, Wallet, X,
} from 'lucide-react';
import { api, assetUrl, money } from '../api';
import { useSummary } from './AdminLayout';
import { ErrorBox, Msg, fmtDate, label, useAction, useLoad } from './hooks';
import { ImageField } from './Settings';
import { Empty, PageHeader, Panel, STATUS, Skeleton, Stat, StatusBadge } from './ui';

// ---------- campaigns ----------

const BLANK = {
  name: '', festival: '', startDate: '', endDate: '',
  theme: { primary: '#E9A820', accent: '#B45309', dark: '#2B1608', bg: '#FFF8EC', text: '#3A2412' },
  hero: { desktopImage: '', mobileImage: '', heading: '', subheading: '', ctaText: 'Shop now' },
  promoHeading: '', promoDescription: '', offerText: '',
};
type CampaignDraft = typeof BLANK;
const fromRow = (c: any): CampaignDraft => ({
  name: c.name, festival: c.festival, startDate: c.start_date?.slice(0, 10) ?? '', endDate: c.end_date?.slice(0, 10) ?? '',
  theme: c.theme, hero: c.hero, promoHeading: c.promo_heading, promoDescription: c.promo_description, offerText: c.offer_text,
});
const THEME_LABEL: Record<string, string> = { primary: 'Buttons and highlights', accent: 'Links and accents', dark: 'Dark panels', bg: 'Page background', text: 'Body text' };

function HeroPreview({ d }: { d: CampaignDraft }) {
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ background: d.theme.dark }} aria-label="Banner preview">
      {d.hero.desktopImage && (
        <div className="absolute inset-y-0 right-0 w-[60%]">
          <img src={assetUrl(d.hero.desktopImage)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${d.theme.dark}, transparent)` }} />
        </div>
      )}
      <div className="relative max-w-[55%] p-5">
        {d.offerText && <span className="mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: d.theme.primary, color: d.theme.dark }}>{d.offerText}</span>}
        <p className="font-display text-base font-bold leading-tight" style={{ color: d.theme.bg }}>{d.hero.heading || 'Banner heading'}</p>
        {d.hero.subheading && <p className="mt-1 text-[11px] leading-snug" style={{ color: d.theme.bg, opacity: 0.85 }}>{d.hero.subheading}</p>}
        <span className="mt-3 inline-block rounded-md px-2.5 py-1 text-[10px] font-semibold" style={{ background: d.theme.primary, color: d.theme.dark }}>{d.hero.ctaText || 'Shop now'}</span>
      </div>
    </div>
  );
}

function CampaignForm({ initial, id, onDone, onCancel }: { initial: CampaignDraft; id?: number; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = useState(initial);
  const { msg, busy, run } = useAction();
  const body = { ...d, startDate: d.startDate || null, endDate: d.endDate || null };
  const text = (k: 'name' | 'festival' | 'promoHeading' | 'offerText', n: string, ph = '') => (
    <div><label className="label" htmlFor={`c-${k}`}>{n}</label><input id={`c-${k}`} className="input" placeholder={ph} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>
  );
  const hero = (k: 'heading' | 'subheading' | 'ctaText', n: string) => (
    <div><label className="label" htmlFor={`h-${k}`}>{n}</label><input id={`h-${k}`} className="input" value={d.hero[k]} onChange={(e) => setD({ ...d, hero: { ...d.hero, [k]: e.target.value } })} /></div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-dark">Basics</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {text('name', 'Campaign name', 'e.g. Diwali 2025')}{text('festival', 'Festival', 'e.g. Diwali')}
            <div><label className="label" htmlFor="c-start">Starts</label><input id="c-start" type="date" className="input" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-end">Ends</label><input id="c-end" type="date" className="input" value={d.endDate} onChange={(e) => setD({ ...d, endDate: e.target.value })} /></div>
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-dark">Home page banner</legend>
          {hero('heading', 'Heading')}{hero('subheading', 'Subheading')}
          <div className="grid gap-3 sm:grid-cols-2">{hero('ctaText', 'Button text')}{text('offerText', 'Offer badge (optional)', 'e.g. 2+ boxes at ₹120 each')}</div>
          <div><span className="label">Banner photo</span><ImageField name="Banner photo" value={d.hero.desktopImage} onChange={(v) => setD({ ...d, hero: { ...d.hero, desktopImage: v } })} /></div>
          <div><span className="label">Phone banner photo (optional)</span><ImageField name="Phone banner photo" value={d.hero.mobileImage} onChange={(v) => setD({ ...d, hero: { ...d.hero, mobileImage: v } })} /></div>
          {text('promoHeading', 'Product section heading')}
          <div><label className="label" htmlFor="c-pd">Product section text (optional; the product description is used if empty)</label>
            <textarea id="c-pd" rows={2} className="input" value={d.promoDescription} onChange={(e) => setD({ ...d, promoDescription: e.target.value })} /></div>
        </fieldset>
      </div>
      <div className="space-y-6">
        <div><p className="mb-2 text-sm font-semibold text-dark">Preview</p><HeroPreview d={d} /></div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-dark">Colours</legend>
          <div className="space-y-2">
            {(Object.keys(d.theme) as (keyof CampaignDraft['theme'])[]).map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <input type="color" className="h-9 w-12 cursor-pointer rounded border border-dark/20 bg-white" value={d.theme[k]} onChange={(e) => setD({ ...d, theme: { ...d.theme, [k]: e.target.value } })} />
                <span className="flex-1">{THEME_LABEL[k]}</span><code className="text-xs text-ink/60">{d.theme[k]}</code>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-dark/5 pt-4 lg:col-span-2">
        <button className="btn-dark btn-sm" disabled={busy || !d.name} onClick={() => run(() => api(id ? `/admin/campaigns/${id}` : '/admin/campaigns', { method: id ? 'PUT' : 'POST', body }), id ? 'Campaign saved' : 'Campaign created').then((r) => r !== undefined && onDone())}>{id ? 'Save campaign' : 'Create campaign'}</button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <div className="w-full"><Msg m={msg} /></div>
      </div>
    </div>
  );
}

export function Campaigns() {
  const { data, error, reload } = useLoad<any[]>('/admin/campaigns');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const { msg, run } = useAction();
  if (!data) return error ? <ErrorBox error={error} /> : <Skeleton rows={3} />;
  const done = () => { setOpen(null); reload(); };
  return (
    <>
      <PageHeader title="Campaigns" description="A campaign sets the look of the shop for a festival: banner, colours and offer text. Prices, delivery and past orders are never changed."
        actions={<button className="btn-primary btn-sm" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />New campaign</button>} />
      <Msg m={msg} />
      {open === 'new' && <Panel title="New campaign" icon={Sparkles} className="mb-6"><CampaignForm initial={BLANK} onDone={done} onCancel={() => setOpen(null)} /></Panel>}
      <div className="space-y-4">
        {data.map((c) => (
          <section key={c.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${c.active ? 'border-primary ring-1 ring-primary' : 'border-dark/10'} ${c.archived ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex h-14 w-24 shrink-0 overflow-hidden rounded-lg" aria-hidden>
                {c.hero?.desktopImage ? <img src={assetUrl(c.hero.desktopImage)} alt="" className="h-full w-full object-cover" />
                  : Object.values(c.theme as Record<string, string>).map((v, i) => <span key={i} className="flex-1" style={{ background: v }} />)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-dark">{c.name}
                  {c.active && <span className="chip bg-green-100 text-green-900"><CheckCircle2 size={12} aria-hidden />Live on shop</span>}
                  {c.archived && <span className="chip bg-stone-200 text-stone-700">Archived</span>}
                </p>
                <p className="text-sm text-ink/60">{[c.festival, c.start_date && c.end_date ? `${c.start_date.slice(0, 10)} to ${c.end_date.slice(0, 10)}` : ''].filter(Boolean).join(' · ') || 'No dates set'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!c.active && !c.archived && <button className="btn-dark btn-sm" onClick={() => run(() => api(`/admin/campaigns/${c.id}/activate`, { body: {} }), `${c.name} is now live`).then(reload)}>Make live</button>}
                <button className="btn-outline btn-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? <><X size={14} aria-hidden />Close</> : <><Pencil size={14} aria-hidden />Edit</>}</button>
                {!c.active && <button className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/campaigns/${c.id}/archive`, { body: { archived: !c.archived } }), c.archived ? 'Restored' : 'Archived').then(reload)}>
                  {c.archived ? <><ArchiveRestore size={14} aria-hidden />Restore</> : <><Archive size={14} aria-hidden />Archive</>}</button>}
              </div>
            </div>
            {open === c.id && <div className="border-t border-dark/5 p-5"><CampaignForm initial={fromRow(c)} id={c.id} onDone={done} onCancel={() => setOpen(null)} /></div>}
          </section>
        ))}
      </div>
    </>
  );
}

// ---------- deliveries ----------

export function Deliveries() {
  const cand = useLoad<{ pin: string; orders: any[] }[]>('/admin/batches/candidates');
  const batches = useLoad<any[]>('/admin/batches');
  const { refresh } = useSummary();
  const [sel, setSel] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState<Record<number, string>>({});
  const { msg, busy, run } = useAction();
  const reload = () => { cand.reload(); batches.reload(); refresh(); };
  if (!cand.data || !batches.data) return cand.error || batches.error ? <ErrorBox error={cand.error || batches.error} /> : <Skeleton rows={4} />;
  const waiting = cand.data.reduce((a, g) => a + g.orders.length, 0);

  return (
    <>
      <PageHeader title="Deliveries" description="Group confirmed orders into trips, then enter the kilometres you actually rode so Reports can work out fuel cost." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title={`Waiting for a trip (${waiting})`} icon={MapPin} className="lg:col-span-3">
          {cand.data.length === 0 ? <Empty icon={CheckCircle2} title="Nothing waiting">Confirmed orders that are not in a trip yet appear here, grouped by PIN code.</Empty> : (
            <div className="space-y-5">
              {cand.data.map((g) => {
                const all = g.orders.every((o) => sel.includes(o.id));
                return (
                  <div key={g.pin}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-dark">PIN {g.pin} <span className="font-normal text-ink/60">· {g.orders.length} order{g.orders.length > 1 ? 's' : ''}</span></p>
                      <button className="text-xs font-medium text-accent hover:underline" onClick={() => setSel(all ? sel.filter((x) => !g.orders.some((o) => o.id === x)) : [...new Set([...sel, ...g.orders.map((o) => o.id)])])}>{all ? 'Clear' : 'Select all'}</button>
                    </div>
                    <ul className="space-y-1.5">
                      {g.orders.map((o) => (
                        <li key={o.id}>
                          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${sel.includes(o.id) ? 'border-primary bg-primary/10' : 'border-dark/10 hover:border-dark/20'}`}>
                            <input type="checkbox" className="mt-1" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
                            <span className="flex-1"><span className="font-medium">{o.customer_name}</span> <span className="text-ink/60">· {o.ref}</span><span className="block text-ink/70">{o.address}</span></span>
                            <span className="font-semibold">{money(o.total)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Plan a trip" icon={Route} className="lg:col-span-2 lg:self-start">
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            run(() => api('/admin/batches', { body: { name, plannedDate: date || undefined, orderIds: sel } }), 'Trip created').then((r) => { if (r) { setSel([]); setName(''); reload(); } });
          }}>
            <div><label className="label" htmlFor="bn">Trip name</label><input id="bn" className="input" placeholder="e.g. Evening, Ambegaon side" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="bd">Date</label><input id="bd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <p className="text-sm text-ink/70">{sel.length ? `${sel.length} order${sel.length > 1 ? 's' : ''} selected` : 'Select orders on the left.'}</p>
            <button className="btn-dark w-full" disabled={busy || !name.trim() || !sel.length}><Truck size={16} aria-hidden />Create trip</button>
            <Msg m={msg} />
          </form>
        </Panel>
      </div>

      <h2 className="mb-3 mt-8 font-sans text-sm font-semibold uppercase tracking-wide text-ink/60">Trips</h2>
      {batches.data.length === 0 ? <div className="rounded-2xl border border-dashed border-dark/20 bg-white"><Empty icon={Route} title="No trips yet" /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {batches.data.map((b) => (
            <section key={b.id} className="rounded-2xl border border-dark/10 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div><p className="font-semibold text-dark">{b.name}</p><p className="text-xs text-ink/60">{b.planned_date ? new Date(b.planned_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date'} · {b.orders.length} stop{b.orders.length === 1 ? '' : 's'}</p></div>
                {b.actual_km != null ? <span className="chip bg-green-100 text-green-900">{b.actual_km} km</span> : <span className="chip bg-amber-100 text-amber-900">km not entered</span>}
              </div>
              <ul className="mb-4 space-y-1.5 text-sm">
                {b.orders.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link to={`/admin/orders/${o.id}`} className="hover:underline">{o.customer_name} <span className="text-ink/60">· {o.pin}</span></Link><StatusBadge s={o.status} />
                  </li>
                ))}
              </ul>
              <div className="flex items-end gap-2 border-t border-dark/5 pt-3">
                <div className="flex-1"><label className="label !text-xs" htmlFor={`km${b.id}`}>Kilometres ridden (whole trip)</label>
                  <input id={`km${b.id}`} type="number" min={0} step="0.1" className="input !py-2" value={km[b.id] ?? b.actual_km ?? ''} onChange={(e) => setKm({ ...km, [b.id]: e.target.value })} /></div>
                <button className="btn-outline btn-sm" disabled={km[b.id] === undefined || km[b.id] === ''} onClick={() => run(() => api(`/admin/batches/${b.id}`, { method: 'PATCH', body: { actualKm: Number(km[b.id]) } }), 'Distance saved').then(reload)}>Save</button>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- reports ----------

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS: [string, () => { from: string; to: string }][] = [
  ['This month', () => { const d = new Date(); return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: '' }; }],
  ['Last month', () => { const d = new Date(); return { from: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: iso(new Date(d.getFullYear(), d.getMonth(), 0)) }; }],
  ['Last 7 days', () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: iso(d), to: '' }; }],
  ['All time', () => ({ from: '', to: '' })],
];

export function Reports() {
  const [range, setRange] = useState(PRESETS[0][1]());
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const { data: r, error } = useLoad<any>(`/admin/reports?${qs}`);
  const ex = useLoad<any[]>('/admin/expenses');
  const [e, setE] = useState({ description: '', amount: '', spentOn: '' });
  const { msg, busy, run } = useAction();
  const preset = PRESETS.find(([, f]) => JSON.stringify(f()) === JSON.stringify(range))?.[0];
  const Row = ({ k, v, sub, strong }: { k: string; v: number; sub?: boolean; strong?: boolean }) => (
    <div className={`flex justify-between py-1.5 ${strong ? 'border-t border-dark/10 pt-2.5 font-semibold text-dark' : ''}`}>
      <span className={sub ? 'text-ink/70' : ''}>{k}</span><span className={v < 0 ? 'text-red-700' : ''}>{sub ? '− ' : ''}{money(Math.abs(v))}</span>
    </div>
  );

  return (
    <>
      <PageHeader title="Reports" description="Money from delivered orders only. Open and cancelled orders are not counted. Product and delivery are kept separate." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-xl bg-dark/5 p-1">
          {PRESETS.map(([n, f]) => <button key={n} onClick={() => setRange(f())} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${preset === n ? 'bg-white text-dark shadow-sm' : 'text-ink/70 hover:text-dark'}`}>{n}</button>)}
        </div>
        <div className="flex items-end gap-2">
          <CalendarRange size={18} className="mb-2.5 text-ink/50" aria-hidden />
          <div><label className="label !text-xs" htmlFor="rf">From</label><input id="rf" type="date" className="input !py-2" value={range.from} onChange={(x) => setRange({ ...range, from: x.target.value })} /></div>
          <div><label className="label !text-xs" htmlFor="rt">To</label><input id="rt" type="date" className="input !py-2" value={range.to} onChange={(x) => setRange({ ...range, to: x.target.value })} /></div>
        </div>
      </div>
      <ErrorBox error={error} />
      {!r ? <Skeleton rows={3} /> : (
        <>
          {r.warnings.length > 0 && <div className="mb-4 space-y-2">{r.warnings.map((w: string) => <p key={w} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">{w}</p>)}</div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={CheckCircle2} label="Delivered orders" value={r.deliveredOrders} />
            <Stat icon={IndianRupee} label="Money in" value={money(r.productRevenue + r.deliveryRevenue)} hint={`${money(r.productRevenue)} products · ${money(r.deliveryRevenue)} delivery`} />
            <Stat icon={Wallet} label="Costs" value={money(r.productCost + r.fuelCost + r.otherExpenses)} hint="Stock, fuel and other expenses" />
            <Stat icon={BarChart3} label="Estimated profit" value={money(r.estimatedProfit)} tone={r.estimatedProfit >= 0 ? 'good' : 'warn'} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Products" icon={IndianRupee} className="text-sm">
              <Row k="Sales" v={r.productRevenue} /><Row k="Cost of boxes" v={r.productCost} sub /><Row k="Product profit" v={r.productProfit} strong />
            </Panel>
            <Panel title="Delivery" icon={Fuel} className="text-sm">
              <Row k="Delivery fees" v={r.deliveryRevenue} /><Row k={`Fuel (${r.actualKm} km ridden)`} v={r.fuelCost} sub /><Row k="Delivery profit" v={r.deliveryProfit} strong />
            </Panel>
            <Panel title="Orders placed in this period" icon={BarChart3} className="text-sm">
              {Object.keys(r.ordersByStatus).length === 0 ? <p className="text-ink/60">No orders.</p> : (
                <ul className="space-y-2">
                  {Object.entries(r.ordersByStatus as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                    <li key={s} className="flex items-center justify-between"><span>{STATUS[s]?.label ?? label(s)}</span><span className="font-semibold">{n}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <Panel title="Other expenses" icon={Receipt} className="mt-6">
        <p className="mb-4 text-sm text-ink/70">Packaging, printing and anything else not tied to a single order. These come off estimated profit.</p>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(x) => {
          x.preventDefault();
          run(() => api('/admin/expenses', { body: { description: e.description, amount: Number(e.amount), ...(e.spentOn && { spentOn: e.spentOn }) } }), 'Expense added')
            .then((res) => { if (res) { setE({ description: '', amount: '', spentOn: '' }); ex.reload(); } });
        }}>
          <div className="min-w-[200px] flex-1"><label className="label !text-xs" htmlFor="ed">What for</label><input id="ed" className="input !py-2" placeholder="e.g. Gift boxes" value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} /></div>
          <div><label className="label !text-xs" htmlFor="ea">Amount</label><input id="ea" type="number" min={0} className="input !w-28 !py-2" placeholder="₹" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></div>
          <div><label className="label !text-xs" htmlFor="eo">Date</label><input id="eo" type="date" className="input !py-2" value={e.spentOn} onChange={(x) => setE({ ...e, spentOn: x.target.value })} /></div>
          <button className="btn-dark btn-sm" disabled={busy || !e.description || e.amount === ''}><Plus size={14} aria-hidden />Add</button>
          <div className="w-full"><Msg m={msg} /></div>
        </form>
        {ex.data && ex.data.length > 0 && (
          <ul className="divide-y divide-dark/5 text-sm">
            {ex.data.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                <span><span className="font-medium">{x.description}</span><span className="block text-xs text-ink/60">{new Date(x.spent_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                <span className="flex items-center gap-2 font-semibold">{money(x.amount)}
                  <button className="btn-ghost btn-sm" aria-label={`Delete ${x.description}`} onClick={() => { if (window.confirm(`Delete "${x.description}"?`)) run(() => api(`/admin/expenses/${x.id}`, { method: 'DELETE' }), 'Expense deleted').then(() => ex.reload()); }}><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ---------- audit ----------

const ACTION_TEXT: Record<string, string> = {
  'admin.login': 'Signed in', 'settings.update': 'Changed settings', 'order.status': 'Changed order status', 'order.failed_attempt': 'Recorded failed delivery',
  'order.delivery_fee': 'Set delivery charge', 'payment.payment': 'Recorded payment', 'payment.refund': 'Recorded refund', 'product.create': 'Created product',
  'product.update': 'Edited product', 'product.tiers': 'Changed prices', 'inventory.move': 'Changed stock', 'campaign.create': 'Created campaign',
  'campaign.update': 'Edited campaign', 'campaign.activate': 'Made campaign live', 'campaign.archive': 'Archived campaign', 'campaign.restore': 'Restored campaign',
  'batch.create': 'Created trip', 'batch.update': 'Updated trip', 'expense.create': 'Added expense', 'expense.delete': 'Deleted expense',
};

export function Audit() {
  const { data, error } = useLoad<any[]>('/admin/audit');
  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of sensitive changes: who did what, and when. The latest 200 are shown." />
      <ErrorBox error={error} />
      <div className="overflow-hidden rounded-2xl border border-dark/10 bg-white shadow-sm">
        {!data ? <div className="p-5"><Skeleton rows={6} /></div> : data.length === 0 ? <Empty icon={ScrollText} title="Nothing recorded yet" /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {data.map((a) => {
                  const detail = JSON.stringify(a.detail);
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{fmtDate(a.created_at)}</td>
                      <td className="text-ink/70">{a.actor}</td>
                      <td>
                        {a.entity === 'order' ? <Link className="font-medium hover:underline" to={`/admin/orders/${a.entity_id}`}>{ACTION_TEXT[a.action] ?? a.action}</Link> : <span className="font-medium">{ACTION_TEXT[a.action] ?? a.action}</span>}
                        <span className="block text-xs text-ink/50">{a.entity}{a.entity_id && ` ${a.entity_id}`}</span>
                      </td>
                      <td className="max-w-md"><code className="block truncate text-xs text-ink/60" title={detail}>{detail === '{}' ? '' : detail}</code></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
