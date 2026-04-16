'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Flag, TrendingUp, CreditCard } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';
import { DrillDownModal } from '@/components/drill-down/DrillDownModal';
import type { DrillDownContext } from '@/components/drill-down/types';

interface MorningBriefData {
  alertCards: {
    slaBreaches: number;
    redFlags: number;
    bigClaimsOpen: number;
    unassignedWithPayment: number;
  };
  attention: {
    uploadDate: string | null;
    readyToClose: number;
    newlyBreached: number;
    valueJumps: number;
    stagnant: number;
  };
  handlerHealth: Array<{
    handler: string;
    openCount: number;
    breachCount: number;
    lastActivity: string | null;
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
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  isRed?: boolean;
  onClick?: () => void;
}) {
  const count = useCountUp(value);
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 transition-colors ${
        isRed && value > 0 ? 'border-[#E24B4A]' : 'border-[#E8EEF8]'
      } ${onClick ? 'cursor-pointer hover:bg-[#F4F6FA] hover:shadow-md' : ''}`}
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

function formatUploadTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (diffHours < 24) {
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? `Today, ${time}` : `Yesterday, ${time}`;
  }
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + `, ${time}`;
}

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';

export function MorningBrief({ role: _role, userId: _userId, filters: _filters }: SubViewProps) {
  const [data, setData] = useState<MorningBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownContext | null>(null);

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
  const attention = data?.attention;
  const health = data?.handlerHealth ?? [];

  const attentionItems = attention
    ? [
        {
          label: 'Ready to close',
          subtitle: 'R0 outstanding, not terminal',
          value: attention.readyToClose,
          type: 'ready_to_close' as const,
        },
        {
          label: 'Newly breached',
          subtitle: 'SLA breached since last upload',
          value: attention.newlyBreached,
          type: 'newly_breached' as const,
        },
        {
          label: 'Value jumps',
          subtitle: 'Incurred up >20% vs prior',
          value: attention.valueJumps,
          type: 'value_jumps' as const,
        },
        {
          label: 'Stagnant claims',
          subtitle: 'Breached + no status movement',
          value: attention.stagnant,
          type: 'stagnant' as const,
        },
      ]
    : [];

  return (
    <>
      <div className="space-y-8">
        {/* Section 1 — Alert cards */}
        <section>
          <h2 className="text-base font-semibold text-[#0D2761] mb-4">
            Daily snapshot — {today}
          </h2>
          {!alerts ? (
            <p className="text-sm text-[#6B7280]">{EMPTY}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <AlertCard
                label="SLA breaches"
                value={alerts.slaBreaches}
                icon={AlertTriangle}
                isRed
                onClick={() => setDrillDown({ type: 'sla_breaches', title: 'SLA Breaches' })}
              />
              <AlertCard
                label="Red flags"
                value={alerts.redFlags}
                icon={Flag}
                onClick={() => setDrillDown({ type: 'red_flags', title: 'Red Flags' })}
              />
              <AlertCard
                label="Big claims open"
                value={alerts.bigClaimsOpen}
                icon={TrendingUp}
                onClick={() => setDrillDown({ type: 'big_claims', title: 'Big Claims Open' })}
              />
              <AlertCard
                label="Unassigned + payment"
                value={alerts.unassignedWithPayment}
                icon={CreditCard}
                isRed
                onClick={() => setDrillDown({ type: 'unassigned_payment', title: 'Unassigned Claims with Payment' })}
              />
            </div>
          )}
        </section>

        {/* Section 2 — What needs attention */}
        <section>
          {!attention ? (
            <p className="text-sm text-[#6B7280]">{EMPTY}</p>
          ) : (
            <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-semibold text-[#0D2761]">What needs attention</h2>
                {attention.uploadDate && (
                  <p className="text-xs text-[#6B7280]">vs {formatUploadTime(attention.uploadDate)}</p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {attentionItems.map(item => (
                  <button
                    key={item.label}
                    onClick={() => setDrillDown({ type: item.type, title: item.label })}
                    className={`rounded-lg p-3 text-left transition-colors ${
                      item.value > 0
                        ? 'bg-[#FFF9EC] border border-[#F5A800]'
                        : 'bg-[#F4F6FA] border border-transparent'
                    }`}
                  >
                    <p className={`text-2xl font-bold tabular-nums leading-none ${
                      item.value > 0 ? 'text-[#92400E]' : 'text-[#6B7280]'
                    }`}>
                      {item.value.toLocaleString()}
                    </p>
                    <p className={`text-[11px] mt-1 leading-tight ${
                      item.value > 0 ? 'text-[#92400E]' : 'text-[#6B7280]'
                    }`}>
                      {item.label}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${
                      item.value > 0 ? 'text-[#B45309] opacity-70' : 'text-[#9CA3AF]'
                    }`}>
                      {item.subtitle}
                    </p>
                  </button>
                ))}
              </div>
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
                <div
                  key={h.handler}
                  onClick={() => setDrillDown({ type: 'handler', title: `${h.handler} — Portfolio`, handlerName: h.handler })}
                  className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4 cursor-pointer hover:bg-[#F4F6FA] hover:shadow-md transition-colors"
                >
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
      </div>

      {/* Drill-down modal */}
      {drillDown && (
        <DrillDownModal
          context={drillDown}
          onClose={() => setDrillDown(null)}
        />
      )}
    </>
  );
}
