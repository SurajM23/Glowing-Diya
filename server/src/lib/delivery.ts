import { env } from '../config';
import type { Settings } from './settings';

export type QuoteStatus = 'ok' | 'manual_review' | 'out_of_range';

export interface Quote {
  status: QuoteStatus;
  provider: string;
  distanceKm: number | null;
  billedKm: number | null;
  ratePerKm: number;
  fee: number;
  lat: number | null;
  lng: number | null;
  note: string;
}

export interface Router {
  name: string;
  /** One-way road distance in km plus the geocoded point, or null when the address cannot be resolved. */
  distance(
    base: { lat: number | null; lng: number | null; address: string },
    address: string,
    pin: string,
  ): Promise<{ km: number; lat: number | null; lng: number | null } | null>;
}

export function billedKm(distanceKm: number, roundUp: boolean) {
  return roundUp ? Math.ceil(distanceKm) : Math.round(distanceKm * 10) / 10;
}

export function buildQuote(
  d: { km: number; lat: number | null; lng: number | null } | null,
  provider: string,
  s: Settings['delivery'],
  inBasePin: boolean,
): Quote {
  const base = { provider, ratePerKm: s.ratePerKm, lat: d?.lat ?? null, lng: d?.lng ?? null };
  if (!d || !Number.isFinite(d.km)) {
    return {
      ...base, status: 'manual_review', distanceKm: null, billedKm: null, fee: 0,
      note: 'Address could not be located. The owner will confirm the delivery charge.',
    };
  }
  if (s.maxRadiusKm != null && d.km > s.maxRadiusKm) {
    return { ...base, status: 'out_of_range', distanceKm: d.km, billedKm: null, fee: 0, note: `Outside the ${s.maxRadiusKm} km delivery area.` };
  }
  const billed = billedKm(d.km, s.roundUpKm);
  const fee = s.freeWithinBasePin && inBasePin ? 0 : Math.round(billed * s.ratePerKm);
  return { ...base, status: 'ok', distanceKm: d.km, billedKm: billed, fee, note: 'Estimate. Confirmed by the owner when the address is validated.' };
}

async function ors<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.openrouteservice.org${path}`, {
    ...init,
    headers: { Authorization: env.orsKey, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  return (await res.json()) as T;
}

export const orsRouter: Router = {
  name: 'openrouteservice',
  async distance(base, address, pin) {
    let { lat: bLat, lng: bLng } = base;
    const geocode = async (text: string) => {
      const r = await ors<any>(`/geocode/search?text=${encodeURIComponent(text)}&boundary.country=IN&size=1`);
      const c = r.features?.[0]?.geometry?.coordinates;
      return c ? { lng: c[0] as number, lat: c[1] as number } : null;
    };
    if (bLat == null || bLng == null) {
      const b = await geocode(base.address);
      if (!b) return null;
      bLat = b.lat;
      bLng = b.lng;
    }
    const dest = await geocode(`${address}, ${pin}, India`);
    if (!dest) return null;
    const r = await ors<any>('/v2/directions/driving-car', {
      method: 'POST',
      body: JSON.stringify({ coordinates: [[bLng, bLat], [dest.lng, dest.lat]] }),
    });
    const meters = r.routes?.[0]?.summary?.distance;
    if (typeof meters !== 'number') return null;
    return { km: meters / 1000, lat: dest.lat, lng: dest.lng };
  },
};

/** Development-only router so the flow can be exercised without an API key. */
export const mockRouter: Router = {
  name: 'dev-mock',
  async distance() {
    return { km: env.mockKm as number, lat: null, lng: null };
  },
};

export function defaultRouter(): Router | null {
  if (env.mockKm != null && !env.isProd) return mockRouter;
  if (env.orsKey) return orsRouter;
  return null;
}

export async function quoteDelivery(
  s: Settings,
  address: string,
  pin: string,
  router: Router | null = defaultRouter(),
): Promise<Quote> {
  const inBasePin = pin === s.contact.pin;
  if (!router) return buildQuote(null, 'none', s.delivery, inBasePin);
  try {
    const d = await router.distance(
      { lat: s.delivery.baseLat, lng: s.delivery.baseLng, address: `${s.contact.address} ${s.contact.pin}` },
      address,
      pin,
    );
    return buildQuote(d, router.name, s.delivery, inBasePin);
  } catch {
    return buildQuote(null, router.name, s.delivery, inBasePin);
  }
}

/** True when `at` (server local time) falls inside the configured business hours. */
export function withinHours(open: string, close: string, at: Date) {
  const m = at.getHours() * 60 + at.getMinutes();
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  return m >= oh * 60 + om && m < ch * 60 + cm;
}
