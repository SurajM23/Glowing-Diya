import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface CartLine { productId: number; quantity: number }
const KEY = 'gd_cart';
const MAX = 500;

interface CartApi {
  lines: CartLine[];
  count: number;
  set(productId: number, quantity: number): void;
  add(productId: number, quantity?: number): void;
  clear(): void;
}
const Ctx = createContext<CartApi | null>(null);
export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside provider');
  return c;
};

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((l) => Number.isInteger(l?.productId) && Number.isInteger(l?.quantity) && l.quantity >= 1 && l.quantity <= MAX)
      : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable: cart lives in memory */ }
  }, [lines]);

  const set = useCallback((productId: number, quantity: number) => {
    const q = Math.min(MAX, Math.floor(quantity));
    setLines((ls) => (q < 1 ? ls.filter((l) => l.productId !== productId)
      : ls.some((l) => l.productId === productId) ? ls.map((l) => (l.productId === productId ? { ...l, quantity: q } : l))
      : [...ls, { productId, quantity: q }]));
  }, []);
  const add = useCallback((productId: number, quantity = 1) => {
    setLines((ls) => {
      const cur = ls.find((l) => l.productId === productId)?.quantity ?? 0;
      const q = Math.min(MAX, cur + quantity);
      return ls.some((l) => l.productId === productId) ? ls.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)) : [...ls, { productId, quantity: q }];
    });
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, count: lines.reduce((a, l) => a + l.quantity, 0), set, add, clear }), [lines, set, add, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
