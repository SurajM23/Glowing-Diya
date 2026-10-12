import webpush from 'web-push';
import type { Q } from '../db';

// VAPID keys are generated once and kept in the database, so there is nothing to configure.
let keys: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys(q: Q) {
  if (keys) return keys;
  const [row] = await q<{ value: any }>(`SELECT value FROM settings WHERE key = 'vapid'`);
  if (row) keys = row.value;
  else {
    const k = webpush.generateVAPIDKeys();
    await q(`INSERT INTO settings(key, value) VALUES ('vapid', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(k)]);
    const [saved] = await q<{ value: any }>(`SELECT value FROM settings WHERE key = 'vapid'`);
    keys = saved.value;
  }
  return keys!;
}

export interface PushMessage { title: string; body: string; url: string; tag?: string }

/** Sends to every subscribed admin device. Never throws: a failed push must not break an order. */
export async function notifyAdmins(q: Q, msg: PushMessage) {
  try {
    const subs = await q<any>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
    if (!subs.length) return 0;
    const k = await vapidKeys(q);
    webpush.setVapidDetails('mailto:admin@glowutsav.local', k.publicKey, k.privateKey);
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 24 * 3600, urgency: 'high' });
        sent++;
      } catch (e: any) {
        // Device unsubscribed or app removed: forget it
        if (e?.statusCode === 404 || e?.statusCode === 410) await q('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        else console.error('[push] send failed', e?.statusCode ?? e?.message);
      }
    }));
    return sent;
  } catch (e) {
    console.error('[push] notify failed', e);
    return 0;
  }
}
