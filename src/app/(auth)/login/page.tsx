'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Lazy-import to avoid SSR Supabase client initialisation
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 justify-center">
        <div className="w-10 h-10 rounded-lg bg-[#F5A800] flex items-center justify-center">
          <span className="text-[#0D2761] font-bold text-sm">CP</span>
        </div>
        <div>
          <div className="font-semibold text-[#0D2761] text-lg leading-tight">ClaimsPulse</div>
          <div className="text-xs text-[#6B7280]">Santam / SEB</div>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <h1 className="text-xl font-semibold text-[#0D2761] mb-1">Sign in</h1>
        <p className="text-sm text-[#6B7280] mb-6">Access your claims dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#0D2761] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-[#E8EEF8] rounded-lg text-sm text-[#0D2761] placeholder-[#6B7280] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761] bg-white"
              placeholder="you@seb.co.za"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#0D2761] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-[#E8EEF8] rounded-lg text-sm text-[#0D2761] placeholder-[#6B7280] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761] bg-white"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-[#991B1B]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0D2761] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#1E5BC6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[#6B7280] mt-6">
        Contact your Head of Claims to get access.
      </p>
    </div>
  );
}
