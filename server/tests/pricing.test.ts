import { describe, expect, it } from 'vitest';
import { lineTotal, savings, unitPriceFor, validQuantity } from '../src/lib/pricing';
import { billedKm, buildQuote, withinHours } from '../src/lib/delivery';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

const tiers = [{ min_qty: 1, unit_price: 150 }, { min_qty: 2, unit_price: 120 }];

describe('pricing', () => {
  it('charges 150 for one box', () => expect(lineTotal(tiers, 1)).toEqual({ unitPrice: 150, total: 150 }));
  it('charges 120 each from two boxes', () => {
    expect(lineTotal(tiers, 2)).toEqual({ unitPrice: 120, total: 240 });
    expect(lineTotal(tiers, 7).total).toBe(840);
  });
  it('is independent of tier order', () => expect(unitPriceFor([...tiers].reverse(), 3)).toBe(120));
  it('reports savings against the first tier', () => {
    expect(savings(tiers, 1)).toBe(0);
    expect(savings(tiers, 5)).toBe(150);
  });
  it('rejects invalid quantities', () => {
    for (const q of [0, -1, 1.5, NaN, 501, '2', null]) expect(validQuantity(q)).toBe(false);
    expect(() => unitPriceFor(tiers, 0)).toThrow();
  });
});

describe('delivery quote', () => {
  const d = DEFAULT_SETTINGS.delivery;
  it('rounds the one-way distance up and applies the rate', () => {
    expect(buildQuote({ km: 4.2, lat: null, lng: null }, 't', d, false)).toMatchObject({ status: 'ok', billedKm: 5, fee: 15 });
    expect(buildQuote({ km: 4, lat: null, lng: null }, 't', d, false)).toMatchObject({ billedKm: 4, fee: 12 });
  });
  it('honours a changed rate', () => {
    expect(buildQuote({ km: 2.1, lat: null, lng: null }, 't', { ...d, ratePerKm: 5 }, false).fee).toBe(15);
  });
  it('does not invent a fee when the address cannot be located', () => {
    expect(buildQuote(null, 't', d, false)).toMatchObject({ status: 'manual_review', fee: 0, distanceKm: null });
  });
  it('flags addresses beyond the radius', () => {
    expect(buildQuote({ km: 12, lat: null, lng: null }, 't', { ...d, maxRadiusKm: 10 }, false).status).toBe('out_of_range');
  });
  it('supports exact km when rounding is off', () => expect(billedKm(4.26, false)).toBe(4.3));
});

describe('business hours', () => {
  it('checks the window', () => {
    expect(withinHours('09:00', '22:00', new Date(2025, 0, 1, 10, 0))).toBe(true);
    expect(withinHours('09:00', '22:00', new Date(2025, 0, 1, 23, 0))).toBe(false);
  });
});
