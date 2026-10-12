import { Link } from 'react-router-dom';
import { assetUrl, money } from '../api';
import { useCart } from '../cart';
import { useConfig } from '../config';
import type { Product } from '../types';

export function PriceTiers({ product }: { product: Product }) {
  const { site } = useConfig();
  const tiers = [...product.tiers].sort((a, b) => a.minQty - b.minQty);
  const base = tiers[0];
  return (
    <ul className="space-y-2">
      {tiers.map((t, i) => {
        const next = tiers[i + 1];
        const label = next ? (next.minQty - 1 === t.minQty ? `${t.minQty} box` : `${t.minQty} to ${next.minQty - 1} boxes`) : `${t.minQty}+ boxes`;
        const save = base && t.unitPrice < base.unitPrice ? base.unitPrice - t.unitPrice : 0;
        return (
          <li key={t.minQty} className="flex items-center justify-between rounded-lg border border-dark/10 bg-white px-4 py-3">
            <span className="font-medium">{label}</span>
            <span>
              <strong>{money(t.unitPrice, site.currency)}</strong> <span className="text-sm opacity-70">per box</span>
              {save > 0 && <span className="ml-2 rounded-full bg-primary/30 px-2 py-0.5 text-xs font-semibold">Save {money(save, site.currency)} per box</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { site } = useConfig();
  const from = Math.min(...product.tiers.map((t) => t.unitPrice));
  const img = product.images[0];
  return (
    <article className="card flex flex-col overflow-hidden !p-0">
      <Link to={`/shop/${product.slug}`} className="block aspect-square overflow-hidden bg-dark/5">
        {img && <img src={assetUrl(img.url)} alt={img.alt || product.name} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg font-bold"><Link to={`/shop/${product.slug}`}>{product.name}</Link></h3>
        <p className="text-sm opacity-80">From {money(from, site.currency)} per box</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          {product.inStock ? <span className="text-sm text-green-800">In stock</span> : <span className="text-sm text-red-800">Out of stock</span>}
          <button className="btn-primary !px-4 !py-2" disabled={!product.inStock} onClick={() => add(product.id)}>Add to cart</button>
        </div>
      </div>
    </article>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="mb-6 text-2xl font-bold text-dark sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: React.ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 text-sm ${tone === 'error' ? 'bg-red-100 text-red-900' : 'bg-primary/20 text-dark'}`}>
      {children}
    </p>
  );
}
