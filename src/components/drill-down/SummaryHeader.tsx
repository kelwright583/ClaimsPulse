'use client';

import { MiniChart } from './MiniChart';
import type { DrillDownSummary, DrillDownType } from './types';

function fmtR(v: number | undefined | null) {
  if (v == null) return 'R —';
  return `R ${Math.round(v).toLocaleString('en-ZA')}`;
}

function fmtN(v: number | undefined | null, decimals = 0) {
  if (v == null) return '—';
  return typeof v === 'number'
    ? v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : '—';
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className="text-base font-bold text-[#0D2761] tabular-nums">{value}</span>
    </div>
  );
}

interface Props {
  type: DrillDownType;
  summary: DrillDownSummary;
}

export function SummaryHeader({ type, summary }: Props) {
  const stats: { label: string; value: string }[] = [];
  let chartType: 'bar' | 'horizontal-bar' | 'donut' = 'horizontal-bar';
  let chartData: { label: string; value: number }[] = [];

  switch (type) {
    case 'sla_breaches':
      stats.push(
        { label: 'Total breaches', value: fmtN(summary.totalClaims) },
        { label: 'Total outstanding', value: fmtR(summary.totalOutstanding) },
        { label: 'Worst breach (days over)', value: fmtN(summary.worstBreachDays) },
        { label: 'Avg days over SLA', value: fmtN(summary.avgDaysOverSla, 1) },
      );
      chartType = 'horizontal-bar';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;

    case 'red_flags':
      stats.push(
        { label: 'Total flags', value: fmtN(summary.totalClaims) },
        { label: 'Oldest flag age', value: fmtN(summary.avgDaysInStatus, 0) + ' days' },
      );
      chartType = 'donut';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;

    case 'big_claims':
      stats.push(
        { label: 'Total big claims', value: fmtN(summary.totalClaims) },
        { label: 'Combined incurred', value: fmtR(summary.totalIncurred) },
        { label: 'Combined outstanding', value: fmtR(summary.totalOutstanding) },
        { label: 'Avg incurred', value: fmtR(summary.totalClaims ? summary.totalIncurred / summary.totalClaims : 0) },
      );
      chartType = 'bar';
      chartData = (summary.byCause ?? []).map(c => ({ label: c.cause, value: c.count }));
      break;

    case 'unassigned_payment':
      stats.push(
        { label: 'Total unassigned', value: fmtN(summary.totalClaims) },
        { label: 'Total paid', value: fmtR(summary.totalPaid) },
        { label: 'Latest payment date', value: summary.latestPaymentDate ?? '—' },
      );
      chartType = 'bar';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;

    case 'ready_to_close':
      stats.push(
        { label: 'Ready to close', value: fmtN(summary.totalClaims) },
        { label: 'Total paid out', value: fmtR(summary.totalPaid) },
        { label: 'Avg days in status', value: fmtN(summary.avgDaysInStatus, 1) },
      );
      chartType = 'horizontal-bar';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;

    case 'newly_breached':
      stats.push(
        { label: 'Newly breached', value: fmtN(summary.totalClaims) },
        { label: 'Total outstanding at risk', value: fmtR(summary.totalOutstanding) },
        { label: 'Worst breach (days over)', value: fmtN(summary.worstBreachDays) },
      );
      chartType = 'bar';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;

    case 'value_jumps':
      stats.push(
        { label: 'Count', value: fmtN(summary.totalClaims) },
        { label: 'Total incurred', value: fmtR(summary.totalIncurred) },
        { label: 'Avg days in status', value: fmtN(summary.avgDaysInStatus, 1) },
      );
      chartType = 'horizontal-bar';
      chartData = (summary.byHandler ?? []).map(h => ({ label: h.handler, value: h.count }));
      break;

    case 'stagnant':
      stats.push(
        { label: 'Stagnant claims', value: fmtN(summary.totalClaims) },
        { label: 'Avg days stuck', value: fmtN(summary.avgDaysInStatus, 1) },
        { label: 'Total outstanding', value: fmtR(summary.totalOutstanding) },
      );
      chartType = 'bar';
      chartData = (summary.byHandler ?? []).map(h => ({ label: h.handler, value: h.count }));
      break;

    case 'handler':
      stats.push(
        { label: 'Open claims', value: fmtN(summary.totalClaims) },
        { label: 'SLA breaches', value: fmtN(summary.slaBreachCount) },
        { label: 'Total outstanding', value: fmtR(summary.totalOutstanding) },
        { label: 'Avg days in status', value: fmtN(summary.avgDaysInStatus, 1) },
      );
      chartType = 'donut';
      chartData = (summary.byStatus ?? []).map(s => ({ label: s.status, value: s.count }));
      break;
  }

  return (
    <div className="flex gap-6 items-start">
      <div className="flex flex-wrap gap-6 flex-1">
        {stats.map(s => (
          <StatItem key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      {chartData.length > 0 && (
        <div className="w-72 flex-shrink-0">
          <MiniChart type={chartType} data={chartData} height={120} />
        </div>
      )}
    </div>
  );
}
