import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../api';

/** Loads admin data and exposes reload. Errors are shown by the caller. */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api<T>(path).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, setData };
}

// ---------- toasts ----------

const ToastCtx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const next = useRef(0);
  const show = useCallback((text: string) => {
    const id = ++next.current;
    setItems((xs) => [...xs, { id, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-xl bg-dark px-4 py-3 text-sm font-medium text-bg shadow-lg">
            <CheckCircle2 size={16} className="text-green-400" aria-hidden />{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Runs a mutation: success shows a toast, failure is kept in `msg` for an inline error. */
export function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText = 'Saved'): Promise<T | undefined> => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      toast(okText);
      return r;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { msg, busy, run, clear: () => setMsg(null) };
}

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m || m.ok) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-inset ring-red-200">{m.text}</p>;
}

export const ErrorBox = ({ error }: { error: string }) => (error ? <Msg m={{ ok: false, text: error }} /> : null);

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
