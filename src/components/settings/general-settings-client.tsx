'use client';

import { useState, useEffect } from 'react';

interface Settings {
  monthlyClaimsBudget: number;
  lossRatioGreenThreshold: number;
  lossRatioAmberThreshold: number;
}

export function GeneralSettingsClient() {
  const [settings, setSettings] = useState<Settings>({
    monthlyClaimsBudget: 0,
    lossRatioGreenThreshold: 65,
    lossRatioAmberThreshold: 80,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.settings) setSettings(s => ({ ...s, ...d.settings }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: keyof Settings, value: string) {
    const num = parseFloat(value);
    setSettings(s => ({ ...s, [key]: isNaN(num) ? 0 : num }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 animate-spin" style={{ color: '#F5A800' }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: '#6B7280' }}>Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: '#0D2761' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: '#0D2761' }}>
          General Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
          Configure portfolio-wide financial thresholds and budgets.
        </p>
      </div>

      {/* Card */}
      <div
        className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] max-w-2xl overflow-hidden"
        style={{ borderColor: '#E8EEF8' }}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: '#E8EEF8', backgroundColor: '#F4F6FA' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
            Financial Thresholds
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Monthly Claims Budget */}
          <div>
            <label
              htmlFor="monthlyClaimsBudget"
              className="block text-sm font-medium mb-1.5"
              style={{ color: '#0D2761' }}
            >
              Monthly Claims Budget (ZAR)
            </label>
            <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
              The total rand value of claims the portfolio is budgeted to incur per month. Used for budget runway tracking on the dashboard.
            </p>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium select-none"
                style={{ color: '#6B7280' }}
              >
                R
              </span>
              <input
                id="monthlyClaimsBudget"
                type="number"
                min="0"
                step="1000"
                value={settings.monthlyClaimsBudget}
                onChange={e => handleChange('monthlyClaimsBudget', e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 tabular-nums"
                style={{
                  borderColor: '#E8EEF8',
                  color: '#0D2761',
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': '#F5A800',
                }}
              />
            </div>
          </div>

          {/* Loss Ratio Green Threshold */}
          <div>
            <label
              htmlFor="lossRatioGreenThreshold"
              className="block text-sm font-medium mb-1.5"
              style={{ color: '#0D2761' }}
            >
              Loss Ratio — Green Threshold (%)
            </label>
            <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
              Loss ratios below this value are considered healthy (green). Default: 65%.
            </p>
            <div className="relative">
              <input
                id="lossRatioGreenThreshold"
                type="number"
                min="0"
                max="100"
                step="1"
                value={settings.lossRatioGreenThreshold}
                onChange={e => handleChange('lossRatioGreenThreshold', e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 tabular-nums"
                style={{
                  borderColor: '#E8EEF8',
                  color: '#0D2761',
                }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium select-none"
                style={{ color: '#6B7280' }}
              >
                %
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#065F46' }}
              />
              <span className="text-xs" style={{ color: '#065F46' }}>
                Green zone: 0% – {settings.lossRatioGreenThreshold}%
              </span>
            </div>
          </div>

          {/* Loss Ratio Amber Threshold */}
          <div>
            <label
              htmlFor="lossRatioAmberThreshold"
              className="block text-sm font-medium mb-1.5"
              style={{ color: '#0D2761' }}
            >
              Loss Ratio — Amber Threshold (%)
            </label>
            <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
              Loss ratios above the green threshold and below this value are amber (watch). Above this is red (alert). Default: 80%.
            </p>
            <div className="relative">
              <input
                id="lossRatioAmberThreshold"
                type="number"
                min="0"
                max="200"
                step="1"
                value={settings.lossRatioAmberThreshold}
                onChange={e => handleChange('lossRatioAmberThreshold', e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 tabular-nums"
                style={{
                  borderColor: '#E8EEF8',
                  color: '#0D2761',
                }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium select-none"
                style={{ color: '#6B7280' }}
              >
                %
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#92400E' }}
                />
                <span className="text-xs" style={{ color: '#92400E' }}>
                  Amber: {settings.lossRatioGreenThreshold}% – {settings.lossRatioAmberThreshold}%
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#991B1B' }}
                />
                <span className="text-xs" style={{ color: '#991B1B' }}>
                  Red: above {settings.lossRatioAmberThreshold}%
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer: Save button + feedback */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between gap-4"
          style={{ borderColor: '#E8EEF8', backgroundColor: '#F4F6FA' }}
        >
          <div>
            {saved && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#065F46' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="text-sm font-medium" style={{ color: '#065F46' }}>
                  Settings saved successfully.
                </span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#991B1B' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: '#991B1B' }}>
                  {error}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: '#F5A800',
              color: '#0D2761',
            }}
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
