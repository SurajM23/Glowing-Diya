import { Link } from 'react-router-dom';
import { assetUrl, money } from '../api';
import { useConfig } from '../config';
import { PriceTiers, ProductCard, Section } from '../components/shared';

export default function Home() {
  const c = useConfig();
  const hero = c.campaign?.hero;
  const product = c.products[0];
  const wa = c.contact.whatsapp.replace(/\D/g, '');

  return (
    <>
      <section className="relative isolate overflow-hidden bg-dark text-bg">
        {/* Photo sits on top on phones and fills the right side on wider screens, fading into the dark panel. */}
        {hero?.desktopImage && (
          <div className="relative md:absolute md:inset-y-0 md:right-0 md:w-[60%]">
            <picture>
              {hero.mobileImage && <source media="(max-width: 767px)" srcSet={assetUrl(hero.mobileImage)} />}
              <img src={assetUrl(hero.desktopImage)} alt="" className="aspect-[4/3] w-full object-cover md:aspect-auto md:h-full" />
            </picture>
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-dark via-dark/10 to-transparent md:bg-gradient-to-r md:via-dark/30" />
          </div>
        )}
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-2 md:py-28">
          <div className="max-w-xl md:max-w-[46%]">
          {c.campaign?.offer_text && <p className="mb-5 inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-dark shadow-lg shadow-primary/20">{c.campaign.offer_text}</p>}
          <h1 className="bg-gradient-to-b from-bg to-primary bg-clip-text pb-1 text-4xl font-bold leading-tight text-transparent sm:text-5xl">{hero?.heading || c.brand.tagline}</h1>
          {hero?.subheading && <p className="mt-4 text-lg opacity-90">{hero.subheading}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/shop" className="btn-primary">{hero?.ctaText || 'Shop now'}</Link>
            {wa && <a className="btn border border-bg/40 text-bg hover:bg-bg/10" href={`https://wa.me/${wa.length === 10 ? '91' + wa : wa}`}>Ask on WhatsApp</a>}
          </div>
          </div>
        </div>
      </section>

      {product && (
        <Section title={c.campaign?.promo_heading || 'Our diyas'}>
          <div className="grid items-start gap-8 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl bg-dark/5">
              {product.images[0] && <img src={assetUrl(product.images[0].url)} alt={product.images[0].alt || product.name} className="aspect-square w-full object-cover" />}
              <p className="px-4 py-2 text-xs opacity-60">Illustrative image</p>
            </div>
            <div>
              <h3 className="text-2xl font-bold">{product.name}</h3>
              <p className="mt-3 opacity-90">{c.campaign?.promo_description || product.description}</p>
              <p className="mt-2 text-sm opacity-70">{product.piecesPerBox} pieces per box</p>
              <div className="mt-6"><PriceTiers product={product} /></div>
              <Link to={`/shop/${product.slug}`} className="btn-dark mt-6">View details and order</Link>
            </div>
          </div>
        </Section>
      )}

      {c.products.length > 1 && (
        <Section title="More to explore">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{c.products.slice(1).map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </Section>
      )}

      {c.site.showSections.howItWorks && c.site.howItWorks.length > 0 && (
        <Section title="How it works">
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.site.howItWorks.map((s, i) => (
              <li key={i} className="card">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-dark">{i + 1}</span>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm opacity-80">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {c.site.showSections.delivery && (
        <Section title="Delivery">
          <div className="card max-w-2xl space-y-2 text-sm">
            {c.delivery.flatFee != null ? (
              <p>Delivery is a flat <strong>{money(c.delivery.flatFee, c.site.currency)}</strong> on every order, wherever you are in our delivery area.</p>
            ) : (
              <>
                <p>Delivery is charged by distance: <strong>{money(c.delivery.ratePerKm, c.site.currency)} per km</strong>{c.delivery.roundUpKm ? ', with the distance rounded up to the next whole km' : ''}, measured one way from {c.contact.address || 'our location'}.</p>
                <p>You see the delivery charge before you place your order. If we cannot locate your address, the owner confirms the charge with you on WhatsApp.</p>
              </>
            )}
            {c.delivery.maxRadiusKm != null && c.delivery.flatFee == null && <p>We deliver within {c.delivery.maxRadiusKm} km.</p>}
            <p>Orders are usually delivered within {c.delivery.promiseHours} hours of confirmation, between {c.contact.openTime} and {c.contact.closeTime}.</p>
          </div>
        </Section>
      )}

      {c.site.showSections.faq && c.site.faq.length > 0 && (
        <Section title="Questions">
          <div className="max-w-2xl space-y-2">
            {c.site.faq.map((f, i) => (
              <details key={i} className="card !py-3">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="mt-2 text-sm opacity-80">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
