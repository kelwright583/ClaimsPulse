'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { AlertTriangle, Clock, Flag, Package, TrendingUp, CreditCard, Check, X } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface MorningBriefData {
  alertCards: {
    slaBreaches: number;
    unacknowledgedFlags: number;
    partsOnBackorder: number;
    bigClaimsOpen: number;
    unassignedWithPayment: number;
  };
  delta: {
    uploadDate: string | null;
    statusChanges: number;
    valueJumps: number;
    reopened: number;
    newlyStale: number;
    newPayments: number;
    finalised: number;
  };
  handlerHealth: Array<{
    handler: string;
    openCount: number;
    breachCount: number;
    lastActivity: string | null;
  }>;
  partsBackorder: Array<{
    claimId: string;
    insured: string | null;
    handler: string | null;
    daysInStatus: number | null;
    hasAcknowledgedDelay: boolean;
    expectedDate: string | null;
  }>;
}

interface SubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
}

function useCountUp(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const steps = 30;
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setCount(Math.round((target * current) / steps));
      if (current >= steps) { clearInterval(timer); setCount(target); }
    }, interval);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function AlertCard({
  label,
  value,
  icon: Icon,
  isRed,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  isRed?: boolean;
}) {
  const count = useCountUp(value);
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${
        isRed && value > 0 ? 'border-[#E24B4A]' : 'border-[#E8EEF8]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-full bg-[#1E5BC6] flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        {isRed && value > 0 && (
          <span className="text-xs font-semibold text-[#E24B4A] bg-[#FEE2E2] rounded-full px-2 py-0.5">
            Action needed
          </span>
        )}
      </div>
      <div>
        <p
          className={`text-3xl font-bold tabular-nums ${
            isRed && value > 0 ? 'text-[#E24B4A]' : 'text-[#0D2761]'
          }`}
        >
          {count}
        </p>
        <p className="text-xs text-[#6B7280] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

type BackorderRow = MorningBriefData['partsBackorder'][number];
const colHelper = createColumnHelper<BackorderRow>();

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';

export function MorningBrief({ role: _role, userId: _userId, filters: _filters }: SubViewProps) {
  const [data, setData] = useState<MorningBriefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch('/api/dashboard/claims/morning-brief', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: MorningBriefData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const today = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const columns = [
    colHelper.accessor('claimId', {
      header: 'Claim ID',
      cell: i => (
        <Link href={`/claims/${encodeURIComponent(i.getValue())}`} className="font-mono text-[#1E5BC6] text-xs hover:underline">
          {i.getValue()}
        </Link>
      ),
    }),
    colHelper.accessor('insured', {
      header: 'Insured',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('handler', {
      header: 'Handler',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('daysInStatus', {
      header: 'Days in status',
      cell: i => <span className="text-sm tabular-nums text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('hasAcknowledgedDelay', {
      header: 'Delay acknowledged',
      cell: i =>
        i.getValue() ? (
          <Check className="w-4 h-4 text-[#065F46]" strokeWidth={2} />
        ) : (
          <X className="w-4 h-4 text-[#E24B4A]" strokeWidth={2} />
        ),
    }),
    colHelper.accessor('expectedDate', {
      header: 'Expected date',
      cell: i => <span className="text-xs text-[#6B7280]">{i.getValue() ?? '—'}</span>,
    }),
  ];

  const tableData = data?.partsBackorder ?? [];
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      </div>
    );
  }

  const alerts = data?.alertCards;
  const delta = data?.delta;
  const health = data?.handlerHealth ?? [];
  const backorder = data?.partsBackorder ?? [];

  const deltaItems = delta
    ? [
        { label: 'Status changes', value: delta.statusChanges },
        { label: 'Value jumps', value: delta.valueJumps },
        { label: 'Re-opened', value: delta.reopened },
        { label: 'Newly stale', value: delta.newlyStale },
        { label: 'New payments', value: delta.newPayments },
        { label: 'Finalised', value: delta.finalised },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Section 1 — Alert cards */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-4">
          Daily snapshot — {today}
        </h2>
        {!alerts ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <AlertCard label="SLA breaches" value={alerts.slaBreaches} icon={AlertTriangle} isRed />
            <AlertCard label="Unacknowledged flags" value={alerts.unacknowledgedFlags} icon={Flag} />
            <AlertCard label="Parts on backorder" value={alerts.partsOnBackorder} icon={Package} />
            <AlertCard label="Big claims open" value={alerts.bigClaimsOpen} icon={TrendingUp} />
            <AlertCard label="Unassigned + payment" value={alerts.unassignedWithPayment} icon={CreditCard} isRed />
          </div>
        )}
      </section>

      {/* Section 2 — Delta pills */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-1">
          What changed since yesterday&apos;s upload
          {delta?.uploadDate ? ` — ${delta.uploadDate}` : ''}
        </h2>
        {!delta ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-3">
            {deltaItems.map(item => (
              <button
                key={item.label}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  item.value > 0
                    ? 'bg-[#FFF9EC] border-[#F5A800] text-[#92400E]'
                    : 'bg-[#F4F6FA] border-[#E8EEF8] text-[#6B7280]'
                }`}
              >
                <span className="tabular-nums font-bold">{item.value}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Section 3 — Handler health */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-4">Handler health</h2>
        {health.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {health.map(h => (
              <div key={h.handler} className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
                <p className="font-semibold text-[#0D2761] text-sm truncate">{h.handler}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-[#6B7280]">
                    Open: <span className="font-semibold text-[#0D2761]">{h.openCount}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        h.breachCount > 0 ? 'bg-[#E24B4A]' : 'bg-[#059669]'
                      }`}
                    />
                    {h.breachCount} {h.breachCount === 1 ? 'breach' : 'breaches'}
                  </span>
                </div>
                {h.lastActivity === null && (
                  <p className="text-xs text-[#6B7280] mt-1 italic">No activity</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 4 — Parts on backorder table */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-4">Parts on backorder watchlist</h2>
        {backorder.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {hg.headers.map(header => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
