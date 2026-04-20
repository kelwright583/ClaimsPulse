'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import type { UserRole } from '@/types/roles';

interface FilterState {
  dateRange: string;
  productLine: string;
  handler: string;
  broker: string;
  cause: string;
  status: string;
  area: string;
  actionType: string;
  slaPosition: string;
  period: string;
  netGross: 'net' | 'gross';
  uwYear: string;
}

interface CsSlaData {
  handler: string;
  csScore: {
    total: number;
    lastMonth: number | null;
    speed: number;
    quality: number;
    coverage: number;
    finalisation: number;
    coachingNote: string | null;
  } | null;
  slaBreachByStatus: Array<{ secondaryStatus: string; breachCount: number }>;
  notificationGap: { avg: number | null; teamAvg: number | null };
  weeklyTrend: Array<{ week: string; csScore: number | null }>;
  breachingClaims: Record<string, Array<{ claimId: string; daysInCurrentStatus: number | null }>>;
}

export default function CsSlaHealth({
  role,
  userId,
  filters,
  handlerName,
  onHandlerChange,
}: {
  role: UserRole;
  userId: string;
  filters: FilterState;
  handlerName: string;
  onHandlerChange: (name: string) => void;
}) {
  const [data, setData] = useState<CsSlaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [handlers, setHandlers] = useState<string[]>([]);

  const canSelectHandler =
    role === 'SENIOR_MANAGEMENT' ||
    role === 'HEAD_OF_CLAIMS' ||
    role === 'TEAM_LEADER';

  useEffect(() => {
    if (!handlerName) return;

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/dashboard/my-work/cs-sla-health?handler=${encodeURIComponent(handlerName)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        if (json.allHandlers && Array.isArray(json.allHandlers)) {
          setHandlers(json.allHandlers);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [handlerName]);

  if (loading) {
    return <div className="animate-pulse bg-[#E8EEF8] rounded-xl h-64 w-full" />;
  }

  const cs = data?.csScore ?? null;
  const trendDiff =
    cs && cs.lastMonth !== null ? cs.total - cs.lastMonth : null;

  const scoreComponents: Array<{ label: string; score: number }> = cs
    ? [
        { label: 'Speed (days to first payment)', score: cs.speed },
        { label: 'Quality', score: cs.quality },
        { label: 'Coverage', score: cs.coverage },
        { label: 'Finalisation', score: cs.finalisation },
      ]
    : [];

  const notifGap = data?.notificationGap ?? { avg: null, teamAvg: null };
  const avgHigher =
    notifGap.avg !== null &&
    notifGap.teamAvg !== null &&
    notifGap.avg > notifGap.teamAvg;

  return (
    <div className="space-y-4">
      {/* Handler selector */}
      {canSelectHandler && handlers.length > 0 && (
        <div className="flex justify-end">
          <select
            className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
            value={handlerName}
            onChange={(e) => onHandlerChange(e.target.value)}
          >
            {handlers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* CS Score card */}
      <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#0D2761] uppercase tracking-wide">
            CS Score — {data?.handler ?? handlerName}
          </h3>
        </div>

        {cs ? (
          <>
            <div className="flex items-end gap-3 mt-1">
              <span className="text-4xl font-bold text-[#0D2761]">
                {cs.total}
                <span className="text-xl font-medium text-[#6B7280]"> / 100</span>
              </span>
              {trendDiff !== null && (
                <span
                  className={`flex items-center gap-1 text-sm font-medium mb-1 ${
                    trendDiff >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {trendDiff >= 0 ? (
                    <TrendingUp size={16} />
                  ) : (
                    <TrendingDown size={16} />
                  )}
                  {trendDiff >= 0 ? '+' : ''}
                  {trendDiff} vs last month
                </span>
              )}
            </div>

            <div className="border-t border-[#E8EEF8] my-4" />

            <div className="space-y-3">
              {scoreComponents.map(({ label, score }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#6B7280]">{label}</span>
                    <span className="font-medium text-[#0D2761]">
                      {score} / 25
                    </span>
                  </div>
                  <div className="bg-[#E8EEF8] rounded-full h-2">
                    <div
                      className="bg-[#F5A800] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(score / 25) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {cs.coachingNote && (
              <div className="bg-gray-50 rounded-lg p-3 mt-4">
                <p className="text-xs font-semibold text-[#0D2761] mb-1">
                  COACHING NOTE:
                </p>
                <p className="text-sm text-[#6B7280]">{cs.coachingNote}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-[#6B7280] mt-2">No CS score data available.</p>
        )}
      </div>

      {/* TAT breach analysis */}
      <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
        <h3 className="text-sm font-semibold text-[#0D2761] mb-3">
          TAT breach analysis
        </h3>
        {data?.slaBreachByStatus && data.slaBreachByStatus.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                layout="vertical"
                data={data.slaBreachByStatus}
                onClick={(e: unknown) => {
                  const payload = (e as any)?.activePayload?.[0]?.payload;
                  if (payload) {
                    const status: string = payload.secondaryStatus;
                    setSelectedStatus((prev) =>
                      prev === status ? null : status
                    );
                  }
                }}
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  type="category"
                  dataKey="secondaryStatus"
                  width={200}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={(v: string) =>
                    v.length > 30 ? v.slice(0, 30) + '…' : v
                  }
                />
                <Tooltip
                  formatter={(v: unknown) =>
                    [`${v}`, 'Breaches'] as [string, string]
                  }
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E8EEF8',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="breachCount"
                  fill="#1E5BC6"
                  activeBar={{ fill: '#F5A800' }}
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>

            {selectedStatus &&
              data.breachingClaims[selectedStatus] &&
              data.breachingClaims[selectedStatus].length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#0D2761] mb-2 uppercase tracking-wide">
                    Claims in: {selectedStatus}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#E8EEF8]">
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-medium text-xs">
                            Claim ID
                          </th>
                          <th className="text-left py-2 text-[#6B7280] font-medium text-xs">
                            Days in status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.breachingClaims[selectedStatus].map((claim) => (
                          <tr
                            key={claim.claimId}
                            className="border-b border-[#E8EEF8] hover:bg-[#F8FAFF] transition-colors"
                          >
                            <td className="py-2 pr-4">
                              <Link
                                href={`/claims/${claim.claimId}`}
                                className="text-[#1E5BC6] hover:underline font-medium"
                              >
                                {claim.claimId}
                              </Link>
                            </td>
                            <td className="py-2 text-[#6B7280]">
                              {claim.daysInCurrentStatus !== null
                                ? `${claim.daysInCurrentStatus} days`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </>
        ) : (
          <p className="text-sm text-[#6B7280]">No TAT breach data available.</p>
        )}
      </div>

      {/* Notification gap */}
      <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
        <h3 className="text-sm font-semibold text-[#0D2761] mb-3">
          Notification gap
        </h3>
        <div className="flex divide-x divide-[#E8EEF8]">
          <div className="flex-1 pr-4">
            <p className="text-xs text-[#6B7280] mb-1">Your avg</p>
            <p
              className={`text-2xl font-bold ${
                avgHigher ? 'text-[#F5A800]' : 'text-[#0D2761]'
              }`}
            >
              {notifGap.avg !== null ? `${notifGap.avg} days` : '—'}
            </p>
          </div>
          <div className="flex-1 pl-4">
            <p className="text-xs text-[#6B7280] mb-1">Team avg</p>
            <p className="text-2xl font-bold text-[#0D2761]">
              {notifGap.teamAvg !== null ? `${notifGap.teamAvg} days` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Week-on-week trend */}
      <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
        <h3 className="text-sm font-semibold text-[#0D2761] mb-3">
          12-week CS score trend
        </h3>
        {data?.weeklyTrend && data.weeklyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={data.weeklyTrend}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: '#6B7280' }}
                tickFormatter={(v: string) => {
                  const parts = v.split('-');
                  return parts.length >= 2 ? `W${parts[parts.length - 1]}` : v;
                }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#6B7280' }}
                width={28}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  [`${v}`, 'CS Score'] as [string, string]
                }
                labelFormatter={(label: unknown) => `Week: ${label}`}
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #E8EEF8',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="csScore"
                stroke="#F5A800"
                strokeWidth={2}
                dot={{ fill: '#F5A800', r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-[#6B7280]">No trend data available.</p>
        )}
      </div>
    </div>
  );
}
