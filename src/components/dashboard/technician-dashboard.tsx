'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { SlaBadge } from '@/components/ui/badge';
import { ClaimsTable } from '@/components/claims/claims-table';
import { AcknowledgedDelayModal } from '@/components/claims/acknowledged-delay-modal';
import { formatZAR } from '@/lib/utils';
import type { SlaPriority } from '@/types/claims';

interface ClaimRow {
  id: string;
  claimId: string;
  handler: string | null;
  insured: string | null;
  cause: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  isSlaBreach: boolean;
  daysInCurrentStatus: number | null;
  totalIncurred: number | null;
  totalOs: number | null;
  snapshotDate: string;
  slaPriority: SlaPriority | null;
  slaMaxDays: number | null;
}

interface MyData {
  data: ClaimRow[];
  total: number;
  snapshotDate: string | null;
}

interface DelayTarget {
  claimId: string;
  secondaryStatus: string;
}

function computeCsScore(claims: ClaimRow[]) {
  if (claims.length === 0) return null;

  const total = claims.length;
  const finalised = claims.filter(c => c.claimStatus === 'Finalised').length;
  const reopened = claims.filter(c => c.claimStatus === 'Re-opened').length;
  const open = claims.filter(c => !['Finalised', 'Repudiated', 'Cancelled'].includes(c.claimStatus ?? ''));
  const slaBreaches = open.filter(c => c.isSlaBreach).length;

  // Finalisation score: % finalised vs 40% target → cap at 100
  const finalisationPct = (finalised / total) * 100;
  const finalisationScore = Math.min(100, (finalisationPct / 40) * 100);

  // Quality score: re-open rate (target ≤ 5%)
  const reopenRate = total > 0 ? (reopened / total) * 100 : 0;
  const qualityScore = Math.max(0, 100 - (reopenRate / 5) * 100);

  // Coverage score: % of open claims with no SLA breach
  const coveragePct = open.length > 0 ? ((open.length - slaBreaches) / open.length) * 100 : 100;
  const coverageScore = coveragePct;

  // Speed score: based on avg daysInCurrentStatus for open claims (lower is better, target ≤ 30)
  const avgDays = open.length > 0
    ? open.reduce((s, c) => s + (c.daysInCurrentStatus ?? 0), 0) / open.length
    : 0;
  const speedScore = Math.max(0, 100 - (avgDays / 30) * 100);

  const overall = Math.round(
    finalisationScore * 0.30 +
    qualityScore * 0.20 +
    coverageScore * 0.25 +
    speedScore * 0.25
  );

  const grade = overall >= 80 ? 'A' : overall >= 65 ? 'B' : overall >= 50 ? 'C' : 'D';
  const gradeColor = overall >= 80 ? '#065F46' : overall >= 65 ? '#92400E' : overall >= 50 ? '#0D2761' : '#991B1B';

  return {
    overall,
    grade,
    gradeColor,
    components: {
      finalisation: { score: Math.round(finalisationScore), label: 'Finalisation Rate', value: `${finalisationPct.toFixed(1)}%` },
      quality: { score: Math.round(qualityScore), label: 'Quality (Re-open)', value: `${reopenRate.toFixed(1)}%` },
      coverage: { score: Math.round(coverageScore), label: 'SLA Coverage', value: `${coveragePct.toFixed(1)}%` },
      speed: { score: Math.round(speedScore), label: 'Speed (Avg Days)', value: `${avgDays.toFixed(0)}d` },
    },
  };
}

export function TechnicianDashboard() {
  const [myData, setMyData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [delayTarget, setDelayTarget] = useState<DelayTarget | null>(null);

  useEffect(() => {
    fetch('/api/claims/my')
      .then(r => r.json())
      .then((d: MyData) => setMyData(d))
      .catch(() => setMyData({ data: [], total: 0, snapshotDate: null }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[#6B7280]">Loading your dashboard...</div>
      </div>
    );
  }

  const claims = myData?.data ?? [];
  const snapshotDate = myData?.snapshotDate ?? null;

  // Stats
  const openClaims = claims.filter(
    c => c.claimStatus !== 'Finalised' && c.claimStatus !== 'Repudiated' && c.claimStatus !== 'Cancelled'
  );
  const slaBreaches = claims.filter(c => c.isSlaBreach);
  const avgOutstanding = openClaims.length > 0
    ? openClaims.reduce((s, c) => s + (c.totalOs ?? 0), 0) / openClaims.length
    : 0;
  const finalisedThisMonth = claims.filter(c => c.claimStatus === 'Finalised').length;

  const csScore = computeCsScore(claims);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">My Dashboard</h1>
        {snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Snapshot: {new Date(snapshotDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="My Open Claims"
          value={openClaims.length}
          variant="default"
        />
        <StatCard
          label="SLA Breaches"
          value={slaBreaches.length}
          variant={slaBreaches.length > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Avg Outstanding"
          value={formatZAR(avgOutstanding)}
          variant="default"
        />
        <StatCard
          label="Finalised (Current)"
          value={finalisedThisMonth}
          variant="success"
        />
      </div>

      {/* CS Score section */}
      {csScore && (
        <div className="mb-8 bg-white border border-[#E8EEF8] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-base font-semibold text-[#0D2761] mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />
            My CS Score
          </h2>

          {/* Score circle + grade */}
          <div className="flex items-center gap-6 mb-5">
            <div className="flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 border-[#F5A800] bg-[#F9FBFF]">
              <span className="text-2xl font-bold text-[#0D2761] leading-none">{csScore.overall}</span>
              <span className="text-xs text-[#6B7280] leading-none mt-0.5">/ 100</span>
            </div>
            <div className="flex flex-col gap-1">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-xl font-bold text-white"
                style={{ backgroundColor: csScore.gradeColor }}
              >
                {csScore.grade}
              </span>
              <span className="text-xs text-[#6B7280]">Grade</span>
            </div>
          </div>

          {/* Component bars */}
          <div className="flex flex-col gap-3">
            {(Object.values(csScore.components) as { score: number; label: string; value: string }[]).map(component => (
              <div key={component.label} className="flex items-center gap-3">
                <span className="w-36 flex-shrink-0 text-xs text-[#374151] truncate">{component.label}</span>
                <div className="flex-1 h-2 rounded-full bg-[#E8EEF8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F5A800] transition-all duration-500"
                    style={{ width: `${component.score}%` }}
                  />
                </div>
                <span className="w-10 flex-shrink-0 text-right text-xs font-medium text-[#0D2761]">{component.value}</span>
                <span className="w-14 flex-shrink-0 text-right text-xs text-[#6B7280]">{component.score}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SLA Alert strip */}
      {slaBreaches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-[#0D2761] mb-3">
            SLA Alerts
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#991B1B] text-white">
              {slaBreaches.length}
            </span>
          </h2>
          <div className="bg-white border border-[#991B1B]/20 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {slaBreaches.map((claim, idx) => (
              <div
                key={claim.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${
                  idx < slaBreaches.length - 1 ? 'border-b border-[#E8EEF8]' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="relative flex-shrink-0 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#991B1B]" />
                  </span>
                  <a
                    href={`/claims/${encodeURIComponent(claim.claimId)}`}
                    className="font-mono text-sm font-medium text-[#0D2761] hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {claim.claimId}
                  </a>
                  <span className="text-sm text-[#6B7280] truncate">{claim.secondaryStatus ?? '—'}</span>
                  {claim.slaPriority && <SlaBadge priority={claim.slaPriority} />}
                  {claim.daysInCurrentStatus != null && (
                    <span className="text-xs text-[#6B7280]">{claim.daysInCurrentStatus} days</span>
                  )}
                </div>
                <button
                  onClick={() => setDelayTarget({
                    claimId: claim.claimId,
                    secondaryStatus: claim.secondaryStatus ?? '',
                  })}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-[#0D2761] border border-[#0D2761] rounded-lg hover:bg-[#0D2761] hover:text-white transition-colors"
                >
                  Log Delay
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Portfolio table */}
      <div>
        <h2 className="text-base font-semibold text-[#0D2761] mb-4">My Portfolio</h2>
        {claims.length === 0 ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">No claims assigned to you in the latest snapshot.</p>
          </div>
        ) : (
          <ClaimsTable
            initialData={claims}
            initialTotal={claims.length}
            initialPage={1}
            pageSize={50}
            snapshotDate={snapshotDate}
            showHandlerFilter={false}
          />
        )}
      </div>

      {/* Acknowledged Delay Modal */}
      {delayTarget && (
        <AcknowledgedDelayModal
          claimId={delayTarget.claimId}
          secondaryStatus={delayTarget.secondaryStatus}
          onClose={() => setDelayTarget(null)}
          onSuccess={() => {
            // Refresh data after logging delay
            fetch('/api/claims/my')
              .then(r => r.json())
              .then((d: MyData) => setMyData(d))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
