import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, ExternalLink, LayoutDashboard, LogOut, Menu, Package, ScrollText, Settings, ShoppingBag, Sparkles, Tag, Truck, X,
  type LucideIcon,
} from 'lucide-react';
import { api, assetUrl } from '../api';
import { useConfig } from '../config';
import { ToastProvider } from './hooks';

export interface Summary {
  byStatus: Record<string, number>;
  needsReview: number;
  deliveredUnpaid: number;
  today: { orders: number; value: number };
  stock: { id: number; name: string; stock: number; threshold: number; low: boolean }[];
}

const SummaryCtx = createContext<{ summary: Summary | null; refresh: () => void }>({ summary: null, refresh: () => {} });
/** Order counts shared by the sidebar badges, dashboard and orders tabs. Call refresh() after changing an order. */
export const useSummary = () => useContext(SummaryCtx);

const NAV: { to: string; label: string; icon: LucideIcon; badge?: (s: Summary) => number }[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, badge: (s) => (s.byStatus.new_enquiry ?? 0) + (s.byStatus.awaiting_confirmation ?? 0) },
  { to: '/admin/deliveries', label: 'Deliveries', icon: Truck, badge: (s) => (s.byStatus.ready_for_delivery ?? 0) + (s.byStatus.out_for_delivery ?? 0) },
  { to: '/admin/inventory', label: 'Inventory', icon: Package, badge: (s) => s.stock.filter((p) => p.low).length },
  { to: '/admin/products', label: 'Products', icon: Tag },
  { to: '/admin/campaigns', label: 'Campaigns', icon: Sparkles },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout() {
  const { brand } = useConfig();
  const [email, setEmail] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    api<{ email: string }>('/admin/me').then((m) => setEmail(m.email)).catch(() => nav('/admin/login', { replace: true }));
  }, [nav]);
  const refresh = useCallback(() => { api<Summary>('/admin/summary').then(setSummary).catch(() => {}); }, []);
  useEffect(() => { if (email) refresh(); }, [email, pathname, refresh]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (!email) return <div className="flex min-h-screen items-center justify-center bg-bg text-sm text-ink/60" role="status">Loading…</div>;

  const signOut = async () => { await api('/admin/logout', { method: 'POST', body: {} }).catch(() => {}); nav('/admin/login'); };

  const sidebar = (
    <div className="flex h-full flex-col bg-dark text-bg">
      <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
        {brand.logoUrl && <img src={assetUrl(brand.logoUrl)} alt="" className="h-10 w-10 object-contain" />}
        <span className="leading-tight">
          <span className="block font-display text-lg font-bold">{brand.name}</span>
          <span className="block text-xs text-bg/60">Shop admin</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Admin">
        {NAV.map(({ to, label, icon: Icon, badge }) => {
          const n = summary && badge ? badge(summary) : 0;
          return (
            <NavLink key={to} to={to} end={to === '/admin'}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-dark' : 'text-bg/80 hover:bg-bg/10 hover:text-bg'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={18} aria-hidden />
                  <span className="flex-1">{label}</span>
                  {n > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? 'bg-dark text-bg' : 'bg-primary text-dark'}`} aria-label={`${n} need attention`}>{n}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-bg/10 p-3 text-sm">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2 text-bg/80 hover:bg-bg/10 hover:text-bg">
          <ExternalLink size={16} aria-hidden />View shop
        </a>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-bg/80 hover:bg-bg/10 hover:text-bg">
          <LogOut size={16} aria-hidden /><span className="flex-1 truncate">Sign out<span className="block truncate text-xs text-bg/50">{email}</span></span>
        </button>
      </div>
    </div>
  );

  return (
    <SummaryCtx.Provider value={{ summary, refresh }}>
      <ToastProvider>
        <div className="min-h-screen bg-bg">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

          {/* Phone and tablet: top bar with a slide-out menu */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-dark/10 bg-dark px-4 py-3 text-bg lg:hidden">
            <Link to="/admin" className="flex items-center gap-2 font-display font-bold">
              {brand.logoUrl && <img src={assetUrl(brand.logoUrl)} alt="" className="h-8 w-8 object-contain" />}{brand.name}
            </Link>
            <button className="rounded-lg p-2 hover:bg-bg/10" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}><Menu size={22} /></button>
          </header>
          {menuOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">
                {sidebar}
                <button className="absolute right-3 top-5 rounded-lg p-2 text-bg hover:bg-bg/10" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button>
              </div>
            </div>
          )}

          <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
            <div className="mx-auto max-w-6xl"><Outlet /></div>
          </main>
        </div>
      </ToastProvider>
    </SummaryCtx.Provider>
  );
}
