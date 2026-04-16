'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DrillDownClaim, DrillDownType } from './types';

function fmtR(v: number | null | undefined) {
  if (v == null) return '—';
  return `R ${Math.round(v).toLocaleString('en-ZA')}`;
}

function fmtN(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('en-ZA');
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return v.split('T')[0];
}

interface Column {
  key: string;
  label: string;
  render: (c: DrillDownClaim) => React.ReactNode;
  sortKey?: string;
}

function getColumns(type: DrillDownType): Column[] {
  const base: Column[] = [
    { key: 'claimId', label: 'Claim', render: c => <span className="font-mono text-xs text-[#0D2761]">{c.claimId}</span>, sortKey: 'claimId' },
  ];

  switch (type) {
    case 'sla_breaches':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'daysInCurrentStatus', label: 'Days in status', render: c => fmtN(c.daysInCurrentStatus), sortKey: 'daysInCurrentStatus' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOutstanding' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
      ];

    case 'red_flags':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—' },
        { key: 'flagType', label: 'Flag type', render: c => c.flagType ?? '—' },
        { key: 'flagDetail', label: 'Flag detail', render: c => (
          <span className="truncate max-w-[200px] block" title={c.flagDetail ?? ''}>{c.flagDetail ?? '—'}</span>
        ) },
        { key: 'flaggedAt', label: 'Date flagged', render: c => fmtDate(c.flaggedAt), sortKey: 'flaggedAt' },
        { key: 'totalIncurred', label: 'Total incurred', render: c => fmtR(c.totalIncurred), sortKey: 'totalIncurred' },
        { key: 'claimStatus', label: 'Status', render: c => c.claimStatus ?? '—' },
      ];

    case 'big_claims':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'cause', label: 'Cause', render: c => c.cause ?? '—' },
        { key: 'intimatedAmount', label: 'Intimated', render: c => fmtR(c.intimatedAmount), sortKey: 'intimatedAmount' },
        { key: 'totalPaid', label: 'Total paid', render: c => fmtR(c.totalPaid), sortKey: 'totalPaid' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOutstanding' },
        { key: 'totalIncurred', label: 'Total incurred', render: c => fmtR(c.totalIncurred), sortKey: 'totalIncurred' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
        { key: 'dateOfLoss', label: 'DOL', render: c => fmtDate(c.dateOfLoss) },
      ];

    case 'unassigned_payment':
      return [
        ...base,
        { key: 'claimStatus', label: 'Status', render: c => c.claimStatus ?? '—' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'totalPaid', label: 'Total paid', render: c => fmtR(c.totalPaid), sortKey: 'totalPaid' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOutstanding' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
        { key: 'broker', label: 'Broker', render: c => c.broker ?? '—' },
        { key: 'dateOfLoss', label: 'DOL', render: c => fmtDate(c.dateOfLoss) },
      ];

    case 'ready_to_close':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'claimStatus', label: 'Status', render: c => c.claimStatus ?? '—' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'totalPaid', label: 'Total paid', render: c => fmtR(c.totalPaid), sortKey: 'totalPaid' },
        { key: 'totalRecovery', label: 'Total recovery', render: c => fmtR(c.totalRecovery) },
        { key: 'totalSalvage', label: 'Total salvage', render: c => fmtR(c.totalSalvage) },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
      ];

    case 'newly_breached':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'daysInCurrentStatus', label: 'Days in status', render: c => fmtN(c.daysInCurrentStatus), sortKey: 'daysInCurrentStatus' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOs' },
      ];

    case 'value_jumps':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—' },
        { key: 'valueChange', label: 'Value change', render: c => (
          <span className="text-xs">
            <span className="text-[#6B7280]">{fmtR(c.prevValue)}</span>
            {' → '}
            <span className="text-[#0D2761] font-medium">{fmtR(c.totalIncurred)}</span>
          </span>
        ) },
        { key: 'daysInCurrentStatus', label: 'Days in status', render: c => fmtN(c.daysInCurrentStatus), sortKey: 'daysInCurrentStatus' },
        { key: 'totalIncurred', label: 'Total incurred', render: c => fmtR(c.totalIncurred), sortKey: 'totalIncurred' },
      ];

    case 'stagnant':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'daysInCurrentStatus', label: 'Days in status', render: c => fmtN(c.daysInCurrentStatus), sortKey: 'daysInCurrentStatus' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOs' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
      ];

    case 'reserve_by_handler':
      return [
        ...base,
        { key: 'handler', label: 'Handler', render: c => c.handler ?? '—', sortKey: 'handler' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'intimatedAmount', label: 'Reserve set', render: c => fmtR(c.intimatedAmount), sortKey: 'intimatedAmount' },
        { key: 'totalPaid', label: 'Cost to date', render: c => fmtR(c.totalPaid), sortKey: 'totalPaid' },
        { key: 'totalOutstanding', label: 'Outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOs' },
        { key: 'totalIncurred', label: 'Total incurred', render: c => fmtR(c.totalIncurred), sortKey: 'totalIncurred' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
      ];

    case 'handler':
    default:
      return [
        ...base,
        { key: 'claimStatus', label: 'Status', render: c => c.claimStatus ?? '—' },
        { key: 'secondaryStatus', label: 'Secondary status', render: c => c.secondaryStatus ?? '—' },
        { key: 'cause', label: 'Cause', render: c => c.cause ?? '—' },
        { key: 'daysInCurrentStatus', label: 'Days in status', render: c => fmtN(c.daysInCurrentStatus), sortKey: 'daysInCurrentStatus' },
        { key: 'totalOutstanding', label: 'Total outstanding', render: c => fmtR(c.totalOutstanding), sortKey: 'totalOutstanding' },
        { key: 'totalIncurred', label: 'Total incurred', render: c => fmtR(c.totalIncurred), sortKey: 'totalIncurred' },
        { key: 'insured', label: 'Insured', render: c => c.insured ?? '—' },
      ];
  }
}

interface Props {
  type: DrillDownType;
  claims: DrillDownClaim[];
  total: number;
  page: number;
  totalPages: number;
  sort: string;
  dir: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onSort: (key: string, dir: 'asc' | 'desc') => void;
  onRowClick: (claim: DrillDownClaim) => void;
  loading?: boolean;
}

export function ClaimsTable({
  type, claims, total, page, totalPages, sort, dir,
  onPageChange, onSort, onRowClick, loading,
}: Props) {
  const columns = getColumns(type);

  function handleSort(key: string) {
    if (sort === key) {
      onSort(key, dir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(key, 'desc');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-[#E8EEF8]">
        <table className="w-full text-xs text-[#374151]">
          <thead>
            <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`text-left px-3 py-2.5 font-semibold text-[#0D2761] whitespace-nowrap ${col.sortKey ? 'cursor-pointer select-none hover:bg-[#E8EEF8]' : ''}`}
                  onClick={() => col.sortKey && handleSort(col.sortKey)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortKey && sort === col.sortKey && (
                      dir === 'desc'
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#E8EEF8]">
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="animate-pulse bg-[#E8EEF8] rounded h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : claims.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-[#9CA3AF]">
                  No claims found
                </td>
              </tr>
            ) : (
              claims.map(claim => (
                <tr
                  key={claim.claimId}
                  className="border-b border-[#E8EEF8] hover:bg-[#F4F6FA] cursor-pointer transition-colors"
                  onClick={() => onRowClick(claim)}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-3 py-2.5">
                      {col.render(claim)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-[#6B7280]">
        <span>{total.toLocaleString('en-ZA')} total</span>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1 rounded hover:bg-[#F4F6FA] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2">Page {page} of {totalPages || 1}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1 rounded hover:bg-[#F4F6FA] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
