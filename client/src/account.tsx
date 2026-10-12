import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Customer { id: number; name: string; phone: string }

interface AccountApi { customer: Customer | null; ready: boolean; setCustomer(c: Customer | null): void; refresh(): void; logout(): Promise<void> }
const Ctx = createContext<AccountApi | null>(null);
export const useAccount = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAccount outside provider');
  return c;
};

export function AccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => {
    api<Customer>('/account/me').then(setCustomer).catch(() => setCustomer(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => { await api('/account/logout', { method: 'POST', body: {} }).catch(() => {}); setCustomer(null); };
  return <Ctx.Provider value={{ customer, ready, setCustomer, refresh, logout }}>{children}</Ctx.Provider>;
}
