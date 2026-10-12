import { useEffect, useState } from 'react';
import { FileText, Fuel, Hash, Phone, Plus, Store, Trash2, Truck, Upload, Wallet, type LucideIcon } from 'lucide-react';
import { api, assetUrl } from '../api';
import { ErrorBox, Msg, label, useAction, useLoad } from './hooks';
import { PageHeader, Skeleton } from './ui';

export async function uploadImage(file: File): Promise<string> {
  if (file.size > 2 * 1024 * 1024) throw new Error('Image must be under 2 MB');
  const dataBase64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
  return (await api<{ url: string }>('/admin/media', { body: { mime: file.type, dataBase64 } })).url;
}

export function ImageField({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const { msg, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value && <img src={assetUrl(value)} alt="" className="h-12 w-12 rounded border border-dark/10 object-cover" />}
        <input aria-label={`${name} URL`} className="input" value={value} placeholder="Image URL or upload" onChange={(e) => onChange(e.target.value)} />
        <label className="btn-outline btn-sm cursor-pointer whitespace-nowrap focus-within:outline focus-within:outline-2 focus-within:outline-accent"><Upload size={14} aria-hidden />Upload
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const u = await run(() => uploadImage(f), 'Uploaded'); if (u) onChange(u); } e.target.value = ''; }} />
        </label>
      </div>
      {msg && !msg.ok && <Msg m={msg} />}
    </div>
  );
}


// Plain-English names for setting keys. Nested keys can be addressed as "parent.key".
const LABELS: Record<string, string> = {
  name: 'Business name', tagline: 'Tagline', logoUrl: 'Logo', faviconUrl: 'Browser tab icon', ownerName: 'Owner name',
  whatsapp: 'WhatsApp number (receives orders)', phone: 'Phone', email: 'Email', address: 'Shop address', pin: 'PIN code',
  openTime: 'Opens at', closeTime: 'Closes at', instagram: 'Instagram link', facebook: 'Facebook link',
  ratePerKm: 'Charge per km (₹)', roundUpKm: 'Round the distance up to the next whole km', maxRadiusKm: 'Delivery area limit (km)',
  dailyCapacity: 'Most open orders you can handle at once', promiseHours: 'Usual delivery time (hours)', blackoutDates: "Dates you can't deliver",
  baseLat: 'Shop latitude (optional)', baseLng: 'Shop longitude (optional)', freeWithinBasePin: "Free delivery inside the shop's own PIN code",
  upi: 'Accept UPI', cash: 'Accept cash', upiId: 'UPI ID', upiNote: 'Payment note for customers',
  petrolPerLitre: 'Petrol price (₹ per litre)', bikeMileageKmPerLitre: 'Bike mileage (km per litre)',
  announcement: 'Announcement bar (leave empty to hide)', currency: 'Currency code', showSections: 'Show on the home page',
  'showSections.howItWorks': 'How it works', 'showSections.delivery': 'Delivery information', 'showSections.faq': 'Questions (FAQ)',
  howItWorks: 'How it works steps', title: 'Title', text: 'Text', faq: 'Questions (FAQ)', q: 'Question', a: 'Answer',
  footerText: 'Footer line', whatsappGreeting: 'First line of the WhatsApp order message', privacyText: 'Privacy policy', termsText: 'Terms',
  refPrefix: 'Order reference prefix (capital letters and numbers)',
};
// Settings that exist in data but have no effect on the site yet
const HIDDEN = new Set(['showSections.gallery']);
const nameFor = (path: string) => {
  const k = path.split('.').pop()!;
  return LABELS[path.split('.').slice(-2).join('.')] ?? LABELS[k] ?? label(k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
};
const TEXTAREA = new Set(['privacyText', 'termsText', 'footerText', 'announcement', 'upiNote', 'address', 'a', 'text']);

let fieldSeq = 0;
function Field({ path, v, onChange }: { path: string; v: any; onChange: (v: any) => void }) {
  const [id] = useState(() => `f-${++fieldSeq}`);
  const k = path.split('.').pop()!;
  const name = nameFor(path);
  if (HIDDEN.has(path.split('.').slice(-2).join('.'))) return null;
  if (typeof v === 'boolean') return <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4" checked={v} onChange={(e) => onChange(e.target.checked)} />{name}</label>;
  if (/Url$/.test(k)) return <div><span className="label">{name}</span><ImageField name={name} value={v} onChange={onChange} /></div>;
  if (typeof v === 'number' || v === null) {
    return (
      <div><label htmlFor={id} className="label">{name}{v === null && <span className="font-normal text-ink/50"> (no limit)</span>}</label>
        <input id={id} type="number" step="any" className="input max-w-xs" value={v ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} /></div>
    );
  }
  if (typeof v === 'string') {
    const time = k === 'openTime' || k === 'closeTime';
    return (
      <div><label htmlFor={id} className="label">{name}</label>
        {TEXTAREA.has(k) ? <textarea id={id} rows={k.endsWith('Text') && k !== 'footerText' ? 6 : 2} className="input" value={v} onChange={(e) => onChange(e.target.value)} />
          : <input id={id} type={time ? 'time' : 'text'} className={`input ${time ? 'max-w-[160px]' : ''}`} value={v} onChange={(e) => onChange(e.target.value)} />}</div>
    );
  }
  if (Array.isArray(v)) return <ListField path={path} v={v} onChange={onChange} />;
  return (
    <fieldset className="space-y-3 rounded-xl bg-dark/[0.03] p-4"><legend className="sr-only">{name}</legend>
      <p className="text-sm font-semibold text-dark" aria-hidden>{name}</p>
      {Object.entries(v).map(([kk, vv]) => <Field key={kk} path={`${path}.${kk}`} v={vv} onChange={(nv) => onChange({ ...v, [kk]: nv })} />)}</fieldset>
  );
}

function ListField({ path, v, onChange }: { path: string; v: any[]; onChange: (v: any[]) => void }) {
  const k = path.split('.').pop()!;
  const shapes: Record<string, any> = { howItWorks: { title: '', text: '' }, faq: { q: '', a: '' } };
  const blank = shapes[k] ?? (v.length > 0 && typeof v[0] === 'object' ? Object.fromEntries(Object.keys(v[0]).map((x) => [x, ''])) : '');
  const name = nameFor(path);
  return (
    <fieldset className="space-y-3"><legend className="label">{name}</legend>
      {v.length === 0 && <p className="text-sm text-ink/50">None yet.</p>}
      {v.map((item, i) => (
        <div key={i} className={`flex items-start gap-2 ${typeof item === 'object' ? 'rounded-xl bg-dark/[0.03] p-3' : ''}`}>
          {typeof item === 'object' && <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/30 text-xs font-bold">{i + 1}</span>}
          <div className="flex-1 space-y-2">
            {typeof item === 'object'
              ? Object.entries(item).map(([kk, vv]) => <Field key={kk} path={`${path}.${kk}`} v={vv} onChange={(nv) => onChange(v.map((x, j) => (j === i ? { ...x, [kk]: nv } : x)))} />)
              : <input aria-label={`${name} ${i + 1}`} className="input max-w-xs" type={k === 'blackoutDates' ? 'date' : 'text'} value={item} onChange={(e) => onChange(v.map((x, j) => (j === i ? e.target.value : x)))} />}
          </div>
          <button type="button" className="btn-ghost btn-sm" aria-label={`Remove ${name} ${i + 1}`} onClick={() => onChange(v.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...v, typeof blank === 'object' ? { ...blank } : blank])}><Plus size={14} aria-hidden />Add</button>
    </fieldset>
  );
}

const TABS: { key: string; name: string; icon: LucideIcon; help: string }[] = [
  { key: 'brand', name: 'Brand', icon: Store, help: 'Business name, tagline, logo and browser-tab icon shown across the shop.' },
  { key: 'contact', name: 'Contact', icon: Phone, help: 'WhatsApp number for orders, phone, address and opening hours. The address is also where delivery distance is measured from.' },
  { key: 'delivery', name: 'Delivery', icon: Truck, help: 'Charge per km, delivery area and blackout dates. Base latitude and longitude are optional; without them the Contact address is looked up.' },
  { key: 'payment', name: 'Payment', icon: Wallet, help: 'Which payment methods customers see, and your UPI ID.' },
  { key: 'costs', name: 'Costs', icon: Fuel, help: 'Used only for fuel cost in reports. Without both values, estimated profit is overstated and reports say so.' },
  { key: 'site', name: 'Site content', icon: FileText, help: 'Announcement bar, how-it-works steps, FAQ, footer and policy text.' },
  { key: 'orders', name: 'Orders', icon: Hash, help: 'Prefix for order references, e.g. GD-20251020-A1B2C3.' },
];

export default function Settings() {
  const { data, error, setData } = useLoad<Record<string, any>>('/admin/settings');
  const [tab, setTab] = useState('brand');
  const [draft, setDraft] = useState<any>(null);
  const { msg, busy, run } = useAction();
  useEffect(() => { if (data) setDraft(data[tab]); }, [data, tab]);
  const current = TABS.find((t) => t.key === tab)!;
  const dirty = data && draft && JSON.stringify(draft) !== JSON.stringify(data[tab]);

  return (
    <>
      <PageHeader title="Settings" description="Everything the shop shows comes from here. Changes go live as soon as you save." />
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" aria-label="Settings sections">
          <ul className="flex gap-1 lg:flex-col" role="tablist">
            {TABS.map(({ key, name, icon: Icon }) => (
              <li key={key}>
                <button role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${tab === key ? 'bg-white text-dark shadow-sm ring-1 ring-dark/10' : 'text-ink/70 hover:bg-dark/5 hover:text-dark'}`}>
                  <Icon size={16} className={tab === key ? 'text-accent' : ''} aria-hidden />{name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {!data || !draft ? <Skeleton rows={5} /> : (
          <form className="rounded-2xl border border-dark/10 bg-white shadow-sm" onSubmit={(e) => {
            e.preventDefault();
            run(async () => { await api(`/admin/settings/${tab}`, { method: 'PUT', body: draft }); setData({ ...data, [tab]: draft }); }, `${current.name} saved`);
          }}>
            <header className="border-b border-dark/5 px-5 py-4">
              <h2 className="font-sans text-base font-semibold text-dark">{current.name}</h2>
              <p className="mt-0.5 text-sm text-ink/70">{current.help}</p>
            </header>
            <div className="max-w-2xl space-y-4 p-5">
              {Object.entries(draft).map(([k, v]) => <Field key={k} path={`${tab}.${k}`} v={v} onChange={(nv) => setDraft({ ...draft, [k]: nv })} />)}
              <Msg m={msg} />
            </div>
            <footer className="sticky bottom-0 flex items-center gap-3 rounded-b-2xl border-t border-dark/5 bg-white/95 px-5 py-3 backdrop-blur">
              <button className="btn-dark btn-sm" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
              {dirty && <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(data[tab])}>Discard</button>}
              {dirty && <span className="text-xs text-amber-800">Unsaved changes</span>}
            </footer>
          </form>
        )}
      </div>
    </>
  );
}
