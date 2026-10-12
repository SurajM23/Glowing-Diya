import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assetUrl, money } from '../api';
import { useCart } from '../cart';
import { useConfig } from '../config';
import { Notice, PriceTiers, ProductCard, Section } from '../components/shared';

export function Shop() {
  const { products } = useConfig();
  return (
    <Section title="Shop">
      {products.length === 0 ? <Notice>No products are available right now. Please check back soon.</Notice> : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
    </Section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const { products, site } = useConfig();
  const { add } = useCart();
  const nav = useNavigate();
  const product = products.find((p) => p.slug === slug);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);

  if (!product) {
    return <Section title="Product not found"><Link className="underline" to="/shop">Back to shop</Link></Section>;
  }
  const img = product.images[active] ?? product.images[0];
  const tier = [...product.tiers].sort((a, b) => b.minQty - a.minQty).find((t) => t.minQty <= qty);

  return (
    <Section title={product.name}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          {img && <img src={assetUrl(img.url)} alt={img.alt || product.name} className="aspect-square w-full rounded-2xl bg-dark/5 object-cover" />}
          <p className="mt-1 text-xs opacity-60">Illustrative image</p>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {product.images.map((im, i) => (
                <button key={im.id} onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-current={i === active}
                  className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i === active ? 'border-accent' : 'border-transparent'}`}>
                  <img src={assetUrl(im.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="opacity-90">{product.description}</p>
          <p className="mt-2 text-sm opacity-70">{product.piecesPerBox} pieces per box</p>
          {product.specs.length > 0 && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {product.specs.map((s, i) => (<div key={i} className="contents"><dt className="font-medium">{s.label}</dt><dd className="opacity-80">{s.value}</dd></div>))}
            </dl>
          )}
          <div className="mt-6"><PriceTiers product={product} /></div>

          <div className="card mt-6">
            <label htmlFor="qty" className="label">Boxes</label>
            <div className="flex items-center gap-3">
              <button className="btn-outline !px-3" aria-label="Fewer boxes" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <input id="qty" type="number" min={1} max={product.stock || 1} value={qty} inputMode="numeric"
                onChange={(e) => setQty(Math.max(1, Math.min(product.stock || 1, Math.floor(Number(e.target.value)) || 1)))}
                className="input w-20 text-center" />
              <button className="btn-outline !px-3" aria-label="More boxes" onClick={() => setQty((q) => Math.min(product.stock || 1, q + 1))}>+</button>
            </div>
            {tier && <p className="mt-3 text-sm">Total for boxes: <strong>{money(tier.unitPrice * qty, site.currency)}</strong> <span className="opacity-70">({money(tier.unitPrice, site.currency)} each, delivery extra)</span></p>}
            {product.inStock && product.stock <= 10 && <p className="mt-1 text-sm text-accent">Only {product.stock} left</p>}
            <button className="btn-primary mt-4 w-full" disabled={!product.inStock} onClick={() => { add(product.id, qty); nav('/checkout'); }}>
              {product.inStock ? 'Order now' : 'Out of stock'}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
