import type { Q } from '../db';
import { checkPassword, hashPassword } from '../auth';

export interface Customer { id: number; name: string; phone: string }

export const normalizePhone = (raw: string) => raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');

export async function verifyLogin(q: Q, phone: string, password: string): Promise<Customer | null> {
  const [row] = await q<any>('SELECT id, name, phone, password_hash FROM customers WHERE phone = $1', [normalizePhone(phone)]);
  if (!row || !(await checkPassword(password, row.password_hash))) return null;
  return { id: row.id, name: row.name, phone: row.phone };
}

/**
 * At checkout: creates an account for a new phone number, or signs in to an existing one.
 * A wrong password never blocks the order — the caller places it untracked and shows the error.
 */
export async function linkAtCheckout(q: Q, phone: string, name: string, password: string): Promise<{ customer: Customer } | { error: string }> {
  const p = normalizePhone(phone);
  const [existing] = await q<any>('SELECT id, name, phone, password_hash FROM customers WHERE phone = $1', [p]);
  if (existing) {
    if (!(await checkPassword(password, existing.password_hash))) {
      return { error: 'An account already exists for this phone number and the password did not match. Your order was placed but is not linked to it — sign in to see your orders.' };
    }
    return { customer: { id: existing.id, name: existing.name, phone: existing.phone } };
  }
  const [row] = await q<any>(
    `INSERT INTO customers(phone, name, password_hash) VALUES ($1,$2,$3)
     ON CONFLICT (phone) DO NOTHING RETURNING id, name, phone`,
    [p, name, await hashPassword(password)],
  );
  return row ? { customer: row } : { error: 'Could not create the account. Please try signing in.' };
}
