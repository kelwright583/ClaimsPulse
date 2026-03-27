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
        <div className="w-10 h-10 rounded-lg bg-[#1B3A5C] flex items-center justify-center">
          <span className="text-white font-bold text-sm">CP</span>
        </div>
        <div>
          <div className="font-semibold text-[#2C2C2A] text-lg leading-tight">ClaimsPulse</div>
          <div className="text-xs text-[#5F5E5A]">Santam / SEB</div>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white border border-[#D3D1C7] rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <h1 className="text-xl font-semibold text-[#2C2C2A] mb-1">Sign in</h1>
        <p className="text-sm text-[#5F5E5A] mb-6">Access your claims dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#2C2C2A] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-[#D3D1C7] rounded-lg text-sm text-[#2C2C2A] placeholder-[#5F5E5A] focus:outline-none focus:border-[#1B3A5C] focus:ring-1 focus:ring-[#1B3A5C] bg-white"
              placeholder="you@seb.co.za"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#2C2C2A] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-[#D3D1C7] rounded-lg text-sm text-[#2C2C2A] placeholder-[#5F5E5A] focus:outline-none focus:border-[#1B3A5C] focus:ring-1 focus:ring-[#1B3A5C] bg-white"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-[#A32D2D]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1B3A5C] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#162f4a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[#5F5E5A] mt-6">
        Contact your Head of Claims to get access.
      </p>
    </div>
  );
}
