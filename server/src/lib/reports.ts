import type { Q } from '../db';
import type { Settings } from './settings';

export interface ReportRange { from?: string; to?: string }

/**
 * Realised figures only: delivered orders count as revenue, cancelled and open orders do not.
 * Product and delivery are kept separate. Gross order value is never reported as profit.
 */
/** WHERE-clause pieces and their own parameter list for one query. `inclusiveTo` is for DATE columns; timestamps use < to + 1 day. */
function between(col: string, range: ReportRange, inclusiveTo = false) {
  const params: unknown[] = [];
  const parts: string[] = [];
  if (range.from) { params.push(range.from); parts.push(`${col} >= $${params.length}::date`); }
  if (range.to) { params.push(range.to); parts.push(inclusiveTo ? `${col} <= $${params.length}::date` : `${col} < ($${params.length}::date + 1)`); }
  return { sql: parts.join(' AND '), params };
}
const and = (sql: string) => (sql ? ` AND ${sql}` : '');
const where = (sql: string) => (sql ? ` WHERE ${sql}` : '');

export async function buildReport(q: Q, s: Settings, range: ReportRange) {
  const placed = between('o.created_at', range);

  const [rev] = await q<any>(
    `SELECT COUNT(*)::int AS orders,
            COALESCE(SUM(o.subtotal),0)::int AS product_revenue,
            COALESCE(SUM(o.delivery_fee),0)::int AS delivery_revenue,
            COALESCE(SUM((SELECT SUM(i.unit_cost * i.quantity) FROM order_items i WHERE i.order_id = o.id)),0)::int AS product_cost
     FROM orders o WHERE o.status = 'delivered'${and(placed.sql)}`,
    placed.params,
  );

  const counts = await q<{ status: string; n: number }>(
    `SELECT status, COUNT(*)::int AS n FROM orders o${where(placed.sql)} GROUP BY status`,
    placed.params,
  );

  const trips = between('planned_date', range, true);
  const [km] = await q<{ km: number }>(
    `SELECT COALESCE(SUM(actual_km),0)::float AS km FROM delivery_batches${where(trips.sql)}`,
    trips.params,
  );

  const spent = between('spent_on', range, true);
  const [exp] = await q<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0)::int AS total FROM expenses${where(spent.sql)}`,
    spent.params,
  );

  const { petrolPerLitre, bikeMileageKmPerLitre } = s.costs;
  const fuelKnown = petrolPerLitre > 0 && bikeMileageKmPerLitre > 0;
  const fuelCost = fuelKnown ? Math.round((km.km / bikeMileageKmPerLitre) * petrolPerLitre) : 0;

  const productProfit = rev.product_revenue - rev.product_cost;
  const deliveryProfit = rev.delivery_revenue - fuelCost;
  const estimatedProfit = productProfit + deliveryProfit - exp.total;

  return {
    range,
    deliveredOrders: rev.orders,
    ordersByStatus: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    productRevenue: rev.product_revenue,
    deliveryRevenue: rev.delivery_revenue,
    productCost: rev.product_cost,
    actualKm: km.km,
    fuelCost,
    otherExpenses: exp.total,
    productProfit,
    deliveryProfit,
    estimatedProfit,
    warnings: [
      ...(fuelKnown ? [] : ['Petrol price or bike mileage is not set, so fuel cost is counted as 0. Estimated profit is overstated.']),
      ...(rev.product_cost === 0 && rev.orders > 0 ? ['Product cost per box is 0, so product profit equals revenue. Set it on the product.'] : []),
    ],
  };
}
