import type { Q } from '../db';

// Every business-specific value lives here (editable in admin). Nothing is hardcoded in the UI.
export const DEFAULT_SETTINGS = {
  brand: {
    name: 'Your Brand Name',
    tagline: 'Glowing flower-shaped diyas for every festival',
    logoUrl: '',
    faviconUrl: '',
    ownerName: 'Mayur Pawar',
  },
  contact: {
    whatsapp: '',
    phone: '',
    email: '',
    address: 'Ambegaon Khurd, Pune, Maharashtra, India',
    pin: '411046',
    openTime: '09:00',
    closeTime: '22:00',
    instagram: '',
    facebook: '',
  },
  delivery: {
    ratePerKm: 3,
    roundUpKm: true,
    maxRadiusKm: null as number | null,
    dailyCapacity: null as number | null,
    promiseHours: 24,
    blackoutDates: [] as string[],
    baseLat: null as number | null,
    baseLng: null as number | null,
    freeWithinBasePin: false,
  },
  payment: { upi: true, cash: true, upiId: '', upiNote: 'Pay after the owner confirms your order.' },
  costs: { petrolPerLitre: 0, bikeMileageKmPerLitre: 0 },
  site: {
    announcement: '',
    currency: 'INR',
    showSections: { howItWorks: true, delivery: true, gallery: true, faq: true },
    howItWorks: [
      { title: 'Choose your boxes', text: 'Pick how many boxes you need.' },
      { title: 'Share delivery details', text: 'Enter your address to see the delivery charge up front.' },
      { title: 'Send on WhatsApp', text: 'Your order is saved, then WhatsApp opens with the details ready to send.' },
      { title: 'We confirm and deliver', text: 'The owner confirms your order and arranges delivery.' },
    ] as { title: string; text: string }[],
    faq: [] as { q: string; a: string }[],
    footerText: '',
    whatsappGreeting: 'Hello! I would like to place an order.',
    privacyText:
      'We collect only the details needed to deliver your order: name, phone number and address. We use them to confirm and deliver your order and do not sell them. Contact us to have your details removed.',
    termsText:
      'Delivery charges and times shown are estimates until the owner confirms your order. Orders are confirmed only after the owner replies on WhatsApp. Prices and availability can change.',
  },
  orders: { refPrefix: 'GD' },
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

function merge<T>(base: T, over: any): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = k in (base as any) ? merge((base as any)[k], over[k]) : over[k];
  return out;
}

export async function getSettings(q: Q): Promise<Settings> {
  const rows = await q<{ key: string; value: any }>('SELECT key, value FROM settings');
  const out: any = {};
  for (const k of SETTING_KEYS) {
    const row = rows.find((r) => r.key === k);
    // null overrides are real values for nullable fields (e.g. no radius limit)
    out[k] = row ? mergeKeepNull(DEFAULT_SETTINGS[k], row.value) : DEFAULT_SETTINGS[k];
  }
  return out;
}

function mergeKeepNull(base: any, over: any): any {
  if (over === undefined) return base;
  if (over === null || Array.isArray(base) || typeof base !== 'object' || base === null) return over;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? mergeKeepNull(base[k], over[k]) : over[k];
  return out;
}
void merge;

export async function saveSetting(q: Q, key: SettingKey, value: unknown) {
  await q(
    `INSERT INTO settings(key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function audit(q: Q, actor: string, action: string, entity: string, entityId?: string | number, detail: unknown = {}) {
  await q('INSERT INTO audit_events(actor, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5::jsonb)', [
    actor, action, entity, entityId == null ? null : String(entityId), JSON.stringify(detail),
  ]);
}
