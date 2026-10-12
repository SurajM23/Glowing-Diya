import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useConfig } from '../config';
import { useCart } from '../cart';
import { useAccount } from '../account';
import { assetUrl } from '../api';

export default function Layout() {
  const c = useConfig();
  const { count } = useCart();
  const { customer } = useAccount();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const link = ({ isActive }: { isActive: boolean }) => `px-2 py-1 text-sm font-medium ${isActive ? 'text-accent' : 'hover:text-accent'}`;
  const wa = c.contact.whatsapp.replace(/\D/g, '');

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      {c.site.announcement && <div className="bg-dark px-4 py-2 text-center text-sm text-bg">{c.site.announcement}</div>}
      <header className="sticky top-0 z-40 border-b border-dark/10 bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold text-dark">
            {c.brand.logoUrl && <img src={assetUrl(c.brand.logoUrl)} alt="" className="h-10 w-10 object-contain" />}
            {c.brand.name}
          </Link>
          <nav className="flex items-center gap-2" aria-label="Main">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/shop" className={link}>Shop</NavLink>
            <NavLink to={customer ? '/account/orders' : '/account/login'} className={link}>{customer ? 'My orders' : 'Track order'}</NavLink>
            <Link to="/checkout" className="btn-primary !px-4 !py-2" aria-label={`Cart, ${count} boxes`}>
              Cart{count > 0 && <span className="rounded-full bg-dark px-2 text-xs text-bg">{count}</span>}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1"><Outlet /></main>

      <footer className="mt-16 bg-dark text-bg">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              {c.brand.logoUrl && <img src={assetUrl(c.brand.logoUrl)} alt="" loading="lazy" className="h-9 w-9 object-contain" />}
              {c.brand.name}
            </p>
            <p className="mt-2 text-sm opacity-80">{c.brand.tagline}</p>
            {c.site.footerText && <p className="mt-2 text-sm opacity-80">{c.site.footerText}</p>}
          </div>
          <div className="text-sm">
            <p className="mb-2 font-semibold">Contact</p>
            {c.contact.address && <p className="opacity-80">{c.contact.address}</p>}
            {c.contact.phone && <p className="opacity-80">{c.contact.phone}</p>}
            {c.contact.email && <p className="opacity-80">{c.contact.email}</p>}
            <p className="opacity-80">Open {c.contact.openTime} to {c.contact.closeTime}</p>
            {wa && <a className="mt-2 inline-block underline" href={`https://wa.me/${wa.length === 10 ? '91' + wa : wa}`}>Chat on WhatsApp</a>}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <p className="mb-1 font-semibold">Info</p>
            <Link className="opacity-80 hover:underline" to="/privacy">Privacy</Link>
            <Link className="opacity-80 hover:underline" to="/terms">Terms</Link>
            {c.contact.instagram && <a className="opacity-80 hover:underline" href={c.contact.instagram}>Instagram</a>}
            {c.contact.facebook && <a className="opacity-80 hover:underline" href={c.contact.facebook}>Facebook</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
