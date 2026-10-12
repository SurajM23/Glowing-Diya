// In development Vite proxies /api to the server. In production set VITE_API_URL to the API origin.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong');
  return data as T;
}

/** Image URLs saved by the admin upload are relative to the API. Static ones (/images/...) are served by the client. */
export const assetUrl = (u: string) => (u.startsWith('/api/') ? `${BASE}${u}` : u);

export const money = (n: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
