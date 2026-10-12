import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { api, assetUrl } from '../api';
import { useConfig } from '../config';
import { Msg, useAction } from './hooks';

export default function Login() {
  const { brand } = useConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { msg, busy, run } = useAction();
  const nav = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark bg-[radial-gradient(ellipse_at_top,rgb(var(--primary)/0.25),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-bg">
          {brand.logoUrl && <img src={assetUrl(brand.logoUrl)} alt="" className="mb-3 h-20 w-20 object-contain drop-shadow-[0_0_24px_rgb(var(--primary)/0.5)]" />}
          <p className="font-display text-2xl font-bold">{brand.name}</p>
          <p className="text-sm text-bg/60">Shop admin</p>
        </div>
        <form className="space-y-4 rounded-2xl bg-white p-6 shadow-xl" onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api('/admin/login', { body: { email, password } }), 'Signed in')) nav('/admin');
        }}>
          <h1 className="flex items-center gap-2 font-sans text-lg font-semibold text-dark"><Lock size={18} className="text-accent" aria-hidden />Sign in</h1>
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Msg m={msg} />
          <button className="btn-dark w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-sm text-bg/70 hover:text-bg"><ArrowLeft size={14} aria-hidden />Back to the shop</Link>
      </div>
    </div>
  );
}
