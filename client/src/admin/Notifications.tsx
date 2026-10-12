import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react';
import { api } from '../api';
import { Msg, useAction } from './hooks';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

function toKey(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

/** Turns new-order push notifications on/off for this device. */
export default function Notifications() {
  const [on, setOn] = useState<boolean | null>(null);
  const { msg, busy, run } = useAction();

  useEffect(() => {
    if (!supported()) { setOn(false); return; }
    currentSubscription().then(({ sub }) => setOn(Boolean(sub) && Notification.permission === 'granted')).catch(() => setOn(false));
  }, []);

  const enable = () => run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your phone or browser settings, then try again.');
    const { reg } = await currentSubscription();
    const { publicKey } = await api<{ publicKey: string }>('/admin/push/key');
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    await api('/admin/push/subscribe', { body: sub.toJSON() });
    setOn(true);
  }, 'Notifications are on for this device');

  const disable = () => run(async () => {
    const { sub } = await currentSubscription();
    if (sub) { await api('/admin/push/unsubscribe', { body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
    setOn(false);
  }, 'Notifications turned off');

  const test = () => run(async () => {
    const r = await api<{ sent: number }>('/admin/push/test', { body: {} });
    if (!r.sent) throw new Error('No device received it. Turn notifications off and on again.');
  }, 'Test sent');

  const needsInstall = isIos() && !isInstalled();

  return (
    <section className={`mb-6 rounded-2xl border p-5 shadow-sm ${on ? 'border-green-300 bg-green-50' : 'border-primary bg-primary/10'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-green-600 text-white' : 'bg-primary text-dark'}`}>
          {on ? <BellRing size={22} aria-hidden /> : <Bell size={22} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-dark">{on ? 'New-order alerts are on for this device' : 'Get an alert on this phone for every new order'}</p>
          <p className="text-sm text-ink/70">
            {on ? 'You will be notified even when the app is closed.'
              : needsInstall ? 'On iPhone: tap Share → "Add to Home Screen", open GlowUtsav from your home screen, then turn this on.'
              : !supported() ? 'This browser cannot receive notifications. Use Chrome on Android, or Safari on iPhone after adding to Home Screen.'
              : 'Tip: install the app first (browser menu → "Install app" or "Add to Home screen").'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <button className="btn-outline btn-sm" disabled={busy} onClick={test}><Smartphone size={14} aria-hidden />Send test</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={disable}><BellOff size={14} aria-hidden />Turn off</button>
            </>
          ) : (
            <button className="btn-dark btn-sm" disabled={busy || on === null || !supported() || needsInstall} onClick={enable}><Bell size={14} aria-hidden />Turn on alerts</button>
          )}
        </div>
      </div>
      <div className="mt-3"><Msg m={msg} /></div>
    </section>
  );
}
