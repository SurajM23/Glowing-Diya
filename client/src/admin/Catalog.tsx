import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownUp, Boxes, ImagePlus, ListChecks, Package, Plus, Tag, Trash2 } from 'lucide-react';
import { api, assetUrl, money } from '../api';
import { useSummary } from './AdminLayout';
import { ErrorBox, Msg, fmtDate, useAction, useLoad } from './hooks';
import { ImageField } from './Settings';
import { Empty, PageHeader, Panel, Skeleton } from './ui';

// ---------- inventory ----------

const MOVE: Record<string, { label: string; cls: string }> = {
  add: { label: 'Added', cls: 'bg-green-100 text-green-900' },
  reserve: { label: 'Reserved for order', cls: 'bg-sky-100 text-sky-900' },
  release: { label: 'Returned (cancelled)', cls: 'bg-teal-100 text-teal-900' },
  damaged: { label: 'Damaged', cls: 'bg-red-100 text-red-900' },
  lost: { label: 'Lost', cls: 'bg-red-100 text-red-900' },
  adjust: { label: 'Adjusted', cls: 'bg-stone-200 text-stone-800' },
};

export function Inventory() {
  const { data, error, reload } = useLoad<{ products: any[]; movements: any[] }>('/admin/inventory');
  const { refresh } = useSummary();
  const { msg, busy, run } = useAction();
  const [f, setF] = useState({ productId: 0, kind: 'add', quantity: '', note: '' });
  if (!data) return error ? <ErrorBox error={error} /> : <Skeleton rows={5} />;
  const pid = f.productId || data.products[0]?.id;

  return (
    <>
      <PageHeader title="Inventory" description="Stock goes down automatically when an order is placed and back up if it is cancelled. Record new stock and losses here." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.products.map((p) => (
          <div key={p.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${p.low ? 'border-amber-300' : 'border-dark/10'}`}>
            <p className="text-sm text-ink/70">{p.name}</p>
            <p className="mt-1 text-4xl font-bold text-dark">{p.stock}<span className="ml-1 text-base font-normal text-ink/60">boxes</span></p>
            {p.low
              ? <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-800"><AlertTriangle size={14} aria-hidden />Low stock: alert at {p.lowStockThreshold}</p>
              : <p className="mt-2 text-sm text-green-800">Healthy (alert at {p.lowStockThreshold})</p>}
          </div>
        ))}
      </div>

      <Panel title="Record a stock change" icon={ArrowDownUp} className="mt-6">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          run(() => api('/admin/inventory', { body: { productId: pid, kind: f.kind, quantity: Number(f.quantity), note: f.note } }), 'Stock updated')
            .then((r) => { if (r) { setF({ ...f, quantity: '', note: '' }); reload(); refresh(); } });
        }}>
          {data.products.length > 1 && (
            <div><label className="label" htmlFor="ip">Product</label><select id="ip" className="input" value={pid} onChange={(e) => setF({ ...f, productId: Number(e.target.value) })}>{data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <div><label className="label" htmlFor="ik">What happened</label>
            <select id="ik" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="add">New stock arrived</option><option value="damaged">Damaged</option><option value="lost">Lost</option><option value="adjust">Correction (+ or −)</option>
            </select></div>
          <div><label className="label" htmlFor="iq">Boxes</label><input id="iq" type="number" className="input w-28" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
          <div className="min-w-[200px] flex-1"><label className="label" htmlFor="in">Note (optional)</label><input id="in" className="input" placeholder="e.g. supplier batch 3" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <button className="btn-dark" disabled={busy || !f.quantity}>Save</button>
          <div className="w-full"><Msg m={msg} /></div>
        </form>
      </Panel>

      <Panel title="Stock history" icon={ListChecks} className="mt-6">
        {data.movements.length === 0 ? <Empty icon={Boxes} title="No stock recorded yet">Add your first boxes above.</Empty> : (
          <div className="-m-5 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>When</th>{data.products.length > 1 && <th>Product</th>}<th>Change</th><th className="text-right">Boxes</th><th>Note</th><th>By</th></tr></thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    {data.products.length > 1 && <td>{m.product_name}</td>}
                    <td><span className={`chip ${MOVE[m.kind]?.cls}`}>{MOVE[m.kind]?.label ?? m.kind}</span></td>
                    <td className={`text-right font-semibold ${m.delta > 0 ? 'text-green-700' : 'text-red-700'}`}>{m.delta > 0 ? '+' : '−'}{Math.abs(m.delta)}</td>
                    <td className="text-ink/80">{m.order_id ? <Link className="hover:underline" to={`/admin/orders/${m.order_id}`}>{m.note}</Link> : m.note}</td>
                    <td className="text-ink/60">{m.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------- products ----------

function ProductEditor({ p, onChange }: { p: any; onChange: () => void }) {
  const [d, setD] = useState({ name: p.name, slug: p.slug, description: p.description, piecesPerBox: p.pieces_per_box, unitCost: p.unit_cost, lowStockThreshold: p.low_stock_threshold, active: p.active, specs: p.specs as { label: string; value: string }[] });
  const [tiers, setTiers] = useState<{ minQty: number; unitPrice: number }[]>(p.tiers.map((t: any) => ({ minQty: t.min_qty, unitPrice: t.unit_price })));
  const [img, setImg] = useState({ url: '', alt: '' });
  const { msg, busy, run } = useAction();
  const num = (k: 'piecesPerBox' | 'unitCost' | 'lowStockThreshold') => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) });
  const after = (r: unknown) => { if (r !== undefined) onChange(); };
  const cover = p.images[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-dark/10 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-4 border-b border-dark/5 p-5">
        {cover ? <img src={assetUrl(cover.url)} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-dark/5"><Package size={20} aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-lg font-semibold text-dark">{p.name}</h2>
          <p className="text-sm text-ink/60">/shop/{p.slug} · {p.stock} in stock</p>
        </div>
        <span className={`chip ${p.active ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'}`}>{p.active ? 'Visible in shop' : 'Hidden'}</span>
      </header>

      <div className="grid gap-px bg-dark/5 lg:grid-cols-2">
        <div className="space-y-4 bg-white p-5">
          <h3 className="font-sans text-sm font-semibold text-dark">Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor={`n${p.id}`}>Name</label><input id={`n${p.id}`} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
            <div><label className="label" htmlFor={`s${p.id}`}>Web address</label><input id={`s${p.id}`} className="input" value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value })} /></div>
          </div>
          <div><label className="label" htmlFor={`d${p.id}`}>Description</label><textarea id={`d${p.id}`} rows={4} className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor={`pp${p.id}`}>Pieces per box</label><input id={`pp${p.id}`} type="number" min={1} className="input" value={d.piecesPerBox} onChange={num('piecesPerBox')} /></div>
            <div><label className="label" htmlFor={`uc${p.id}`}>Your cost per box</label><input id={`uc${p.id}`} type="number" min={0} className="input" value={d.unitCost} onChange={num('unitCost')} /></div>
            <div><label className="label" htmlFor={`ls${p.id}`}>Low-stock alert</label><input id={`ls${p.id}`} type="number" min={0} className="input" value={d.lowStockThreshold} onChange={num('lowStockThreshold')} /></div>
          </div>
          <p className="-mt-2 text-xs text-ink/60">Cost per box is private and used only for profit in Reports.</p>

          <fieldset className="space-y-2">
            <legend className="label">Specifications <span className="font-normal text-ink/60">(shown publicly; add only verified facts)</span></legend>
            {d.specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label="Spec name" className="input" value={s.label} placeholder="e.g. Material" onChange={(e) => setD({ ...d, specs: d.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input aria-label="Spec value" className="input" value={s.value} onChange={(e) => setD({ ...d, specs: d.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="btn-ghost btn-sm" aria-label="Remove spec" onClick={() => setD({ ...d, specs: d.specs.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setD({ ...d, specs: [...d.specs, { label: '', value: '' }] })}><Plus size={14} aria-hidden />Add specification</button>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark/5 pt-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />Visible in shop</label>
            <button className="btn-dark btn-sm" disabled={busy} onClick={() => run(() => api(`/admin/products/${p.id}`, { method: 'PUT', body: d }), 'Product saved').then(after)}>Save details</button>
          </div>
        </div>

        <div className="space-y-6 bg-white p-5">
          <div className="space-y-3">
            <h3 className="font-sans text-sm font-semibold text-dark">Prices</h3>
            <p className="text-xs text-ink/60">The highest tier reached applies to every box in the order. Past orders keep the price they were placed at.</p>
            <ul className="space-y-2">
              {tiers.map((t, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-dark/[0.03] p-3 text-sm">
                  <span>From</span>
                  <input aria-label="Minimum boxes" type="number" min={1} className="input !w-20 !py-1.5" value={t.minQty} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, minQty: Number(e.target.value) } : x)))} />
                  <span>box{t.minQty === 1 ? '' : 'es'}:</span>
                  <span className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/50">₹</span>
                    <input aria-label="Price per box" type="number" min={0} className="input !w-24 !py-1.5 !pl-6" value={t.unitPrice} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} /></span>
                  <span className="text-ink/60">each</span>
                  {tiers.length > 1 && <button type="button" className="btn-ghost btn-sm ml-auto" aria-label="Remove tier" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setTiers([...tiers, { minQty: (tiers.at(-1)?.minQty ?? 0) + 1, unitPrice: tiers.at(-1)?.unitPrice ?? 0 }])}><Plus size={14} aria-hidden />Add tier</button>
              <button type="button" className="btn-dark btn-sm" disabled={busy} onClick={() => run(() => api(`/admin/products/${p.id}/tiers`, { method: 'PUT', body: tiers }), 'Prices saved').then(after)}>Save prices</button>
            </div>
            <p className="text-xs text-ink/60">Example: 3 boxes cost {money((([...tiers].sort((a, b) => b.minQty - a.minQty).find((t) => t.minQty <= 3)?.unitPrice) ?? 0) * 3)}.</p>
          </div>

          <div className="space-y-3 border-t border-dark/5 pt-5">
            <h3 className="font-sans text-sm font-semibold text-dark">Photos</h3>
            <p className="text-xs text-ink/60">The first photo is the cover shown in the shop.</p>
            {p.images.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {p.images.map((im: any, i: number) => (
                  <li key={im.id} className="group relative">
                    <img src={assetUrl(im.url)} alt={im.alt} className="aspect-square w-full rounded-xl object-cover" />
                    {i === 0 && <span className="chip absolute left-1.5 top-1.5 bg-dark/80 text-bg">Cover</span>}
                    <button type="button" aria-label={`Remove photo ${i + 1}`} className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-red-700 opacity-100 shadow sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      onClick={() => { if (window.confirm('Remove this photo?')) run(() => api(`/admin/products/${p.id}/images/${im.id}`, { method: 'DELETE' }), 'Photo removed').then(after); }}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-xl border border-dashed border-dark/20 p-3">
              <ImageField name="New photo" value={img.url} onChange={(url) => setImg({ ...img, url })} />
              <input aria-label="Describe the photo" className="input" placeholder="Describe the photo (for screen readers)" value={img.alt} onChange={(e) => setImg({ ...img, alt: e.target.value })} />
              <button type="button" className="btn-outline btn-sm" disabled={busy || !img.url} onClick={() => run(() => api(`/admin/products/${p.id}/images`, { body: img }), 'Photo added').then((r) => { if (r !== undefined) { setImg({ url: '', alt: '' }); onChange(); } })}><ImagePlus size={14} aria-hidden />Add photo</button>
            </div>
          </div>
          <Msg m={msg} />
        </div>
      </div>
    </section>
  );
}

export function Products() {
  const { data, error, reload } = useLoad<any[]>('/admin/products');
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: '', slug: '' });
  const { msg, busy, run } = useAction();
  if (!data) return error ? <ErrorBox error={error} /> : <Skeleton rows={4} />;
  return (
    <>
      <PageHeader title="Products" description="What customers see in the shop: details, prices and photos."
        actions={<button className="btn-primary btn-sm" onClick={() => setAdding(!adding)}><Plus size={14} aria-hidden />New product</button>} />
      {adding && (
        <Panel title="New product" icon={Tag} className="mb-6">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
            e.preventDefault();
            run(() => api('/admin/products', { body: nw }), 'Product created').then((r) => { if (r) { setNw({ name: '', slug: '' }); setAdding(false); reload(); } });
          }}>
            <div className="min-w-[200px] flex-1"><label className="label" htmlFor="pn">Name</label><input id="pn" className="input" value={nw.name}
              onChange={(e) => setNw({ name: e.target.value, slug: e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></div>
            <div className="min-w-[200px] flex-1"><label className="label" htmlFor="ps">Web address</label><input id="ps" className="input" value={nw.slug} onChange={(e) => setNw({ ...nw, slug: e.target.value })} /></div>
            <button className="btn-dark" disabled={busy || !nw.name || !nw.slug}>Create</button>
            <p className="w-full text-xs text-ink/60">New products start hidden. Set prices and photos, then tick "Visible in shop".</p>
            <div className="w-full"><Msg m={msg} /></div>
          </form>
        </Panel>
      )}
      <div className="space-y-6">
        {data.length === 0 ? <Empty icon={Package} title="No products yet" /> : data.map((p) => <ProductEditor key={`${p.id}-${JSON.stringify([p.name, p.active, p.tiers, p.images.length])}`} p={p} onChange={reload} />)}
      </div>
    </>
  );
}
