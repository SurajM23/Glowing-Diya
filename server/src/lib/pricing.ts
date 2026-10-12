export interface Tier { min_qty: number; unit_price: number }

export const MAX_QTY_PER_ITEM = 500;

export function validQuantity(qty: unknown): qty is number {
  return typeof qty === 'number' && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_ITEM;
}

/** The highest tier whose min_qty <= quantity applies to all boxes. */
export function unitPriceFor(tiers: Tier[], quantity: number): number {
  if (!validQuantity(quantity)) throw new Error('Invalid quantity');
  const eligible = tiers.filter((t) => t.min_qty <= quantity).sort((a, b) => b.min_qty - a.min_qty);
  if (!eligible.length) throw new Error('No price tier for quantity');
  return eligible[0].unit_price;
}

export function lineTotal(tiers: Tier[], quantity: number) {
  const unitPrice = unitPriceFor(tiers, quantity);
  return { unitPrice, total: unitPrice * quantity };
}

/** What the customer saves versus paying the first-tier price for every box. */
export function savings(tiers: Tier[], quantity: number): number {
  const base = [...tiers].sort((a, b) => a.min_qty - b.min_qty)[0];
  if (!base) return 0;
  return Math.max(0, base.unit_price * quantity - lineTotal(tiers, quantity).total);
}
