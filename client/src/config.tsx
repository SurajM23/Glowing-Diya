import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, assetUrl } from './api';
import type { SiteConfig } from './types';

const Ctx = createContext<SiteConfig | null>(null);
export const useConfig = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfig outside provider');
  return c;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

function applyBranding(c: SiteConfig) {
  const root = document.documentElement.style;
  const t = c.campaign?.theme;
  if (t) {
    root.setProperty('--primary', rgb(t.primary));
    root.setProperty('--accent', rgb(t.accent));
    root.setProperty('--dark', rgb(t.dark));
    root.setProperty('--bg', rgb(t.bg));
    root.setProperty('--text', rgb(t.text));
  }
  document.title = `${c.brand.name} | ${c.brand.tagline}`;
  const setMeta = (name: string, content: string) => {
    let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
    m.content = content;
  };
  setMeta('description', c.campaign?.promo_description || c.brand.tagline);
  if (c.brand.faviconUrl) {
    let l = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.href = assetUrl(c.brand.faviconUrl);
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api<SiteConfig>('/config').then((c) => { setConfig(c); applyBranding(c); }).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="mb-4">We could not load the shop right now.</p>
        <p className="mb-6 text-sm opacity-70">{error}</p>
        <button className="btn-dark" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!config) return <div className="p-10 text-center text-sm opacity-60" role="status">Loading…</div>;
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}
