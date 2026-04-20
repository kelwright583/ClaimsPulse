'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { TargetAchievement } from '@/lib/compute/target-achievement';

const STATUS_STYLES = {
  on_track: { chip: 'bg-[#065F46]/10 text-[#065F46]', label: 'On Track' },
  at_risk:  { chip: 'bg-[#92400E]/10 text-[#92400E]', label: 'At Risk' },
  off_track: { chip: 'bg-[#991B1B]/10 text-[#991B1B]', label: 'Off Track' },
};

export function TargetAchievementView() {
  const [data, setData] = useState<TargetAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handlerFilter, setHandlerFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/target-achievement')
      .then(r => r.json())
      .then((d: TargetAchievement[]) => setData(d))
      .catch(() => setError('Failed to load target achievement data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading target achievement data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">
          No targets configured yet.{' '}
          <Link href="/settings/handler-targets" className="text-[#1E5BC6] underline">
            Set them in Settings &rsaquo; Handler Targets
          </Link>
        </p>
      </div>
    );
  }

  const handlers = [...new Set(data.map(d => d.handler))].sort();

  const filtered = handlerFilter === 'all'
    ? data
    : data.filter(d => d.handler === handlerFilter);

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#6B7280]">Handler:</label>
        <select
          value={handlerFilter}
          onChange={e => setHandlerFilter(e.target.value)}
          className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 text-[#0D2761] bg-white"
        >
          <option value="all">All handlers</option>
          {handlers.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Achievement cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(a => {
          const st = STATUS_STYLES[a.status];
          const isPct = a.unit === 'pct';
          return (
            <div
              key={`${a.handler}::${a.metricType}`}
              className="bg-white rounded-xl border border-[#E8EEF8] shadow-[0_1px_3px_rgba(13,39,97,0.06)] p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs text-[#6B7280]">{a.handler}</p>
                  <p className="text-sm font-semibold text-[#0D2761]">{a.label}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.chip}`}>
                  {st.label}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-[#0D2761] tabular-nums">
                  {a.actualValue.toFixed(isPct ? 1 : 0)}{isPct ? '%' : ''}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-[#6B7280]">
                <span>Target: {a.targetValue !== null ? `${a.targetValue}${isPct ? '%' : ''}` : '—'}</span>
                <span className="font-semibold">{a.achievementPct.toFixed(0)}% achieved</span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-[#F4F6FA] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${a.status === 'on_track' ? 'bg-[#065F46]' : a.status === 'at_risk' ? 'bg-[#F5A800]' : 'bg-[#991B1B]'}`}
                  style={{ width: `${Math.min(a.achievementPct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Leaderboard table */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
        <div className="px-5 py-3 border-b border-[#E8EEF8]">
          <h3 className="text-sm font-semibold text-[#0D2761]">Achievement Leaderboard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                {['Handler', 'Metric', 'Target', 'Actual', 'Achievement %', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#6B7280]">No data.</td>
                </tr>
              ) : (
                [...filtered]
                  .sort((a, b) => b.achievementPct - a.achievementPct)
                  .map((a, idx) => {
                    const st = STATUS_STYLES[a.status];
                    const isPct = a.unit === 'pct';
                    return (
                      <tr
                        key={`${a.handler}::${a.metricType}`}
                        className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#0D2761]">{a.handler}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{a.label}</td>
                        <td className="px-4 py-3 tabular-nums">{a.targetValue !== null ? `${a.targetValue}${isPct ? '%' : ''}` : '—'}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-[#0D2761]">
                          {a.actualValue.toFixed(isPct ? 1 : 0)}{isPct ? '%' : ''}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{a.achievementPct.toFixed(0)}%</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.chip}`}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
