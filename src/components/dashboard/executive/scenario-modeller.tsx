'use client';

import { useState } from 'react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';

interface Props { role: UserRole; userId: string; filters: FilterState }

interface Baseline { currentIncurred: number; currentNwp: number; currentLossRatio: number | null; lossRatioTarget: number | null }
interface ClaimsStressImpact {
  additionalClaims: number;
  avgClaimValue: number;
  additionalIncurred: number;
  newTotalIncurred: number;
  newLossRatio: number | null;
  lossRatioChange: number | null;
  budget: number | null;
  remainingBudget: number | null;
  breachDate: string | null;
  status: 'over-budget' | 'within-budget' | null;
}
interface GrowthImpact {
  newPolicies: number;
  avgPremiumPerPolicy: number;
  additionalNwpMonthly: number;
  additionalNwpYe: number;
  newTotalNwp: number;
  newLossRatio: number | null;
  lossRatioChange: number | null;
  status: 'over-target' | 'within-target' | null;
}
interface Result {
  scenarioType: string;
  baseline: Baseline;
  claimsStressImpact?: ClaimsStressImpact;
  growthImpact?: GrowthImpact;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function pctFmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]';

export function ScenarioModeller({ filters: _filters }: Props) {
  const [scenarioType, setScenarioType] = useState<'claims-stress' | 'growth' | 'combined'>('claims-stress');

  // Claims stress inputs
  const [additionalClaims, setAdditionalClaims] = useState('10');
  const [avgClaimValue, setAvgClaimValue] = useState('150000');
  const [claimType, setClaimType] = useState('Vehicle theft');

  // Growth inputs
  const [newPolicies, setNewPolicies] = useState('100');
  const [avgPremium, setAvgPremium] = useState('5000');
  const [productLine, setProductLine] = useState('Motor');
  const [startingFrom, setStartingFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { scenarioType };
      if (scenarioType === 'claims-stress' || scenarioType === 'combined') {
        body.claimsStress = {
          additionalClaims: Number(additionalClaims),
          avgClaimValue: Number(avgClaimValue),
          claimType,
          timeframe: 'rest-of-year',
        };
      }
      if (scenarioType === 'growth' || scenarioType === 'combined') {
        body.growth = {
          newPolicies: Number(newPolicies),
          avgPremiumPerPolicy: Number(avgPremium),
          productLine,
          startingFrom,
        };
      }

      const res = await fetch('/api/dashboard/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  const cs = result?.claimsStressImpact;
  const gi = result?.growthImpact;
  const base = result?.baseline;

  return (
    <div className="space-y-5">
      {/* Scenario type selector */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Scenario type</h3>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'claims-stress', label: 'Claims stress' },
            { value: 'growth', label: 'Growth scenario' },
            { value: 'combined', label: 'Combined' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setScenarioType(opt.value)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                scenarioType === opt.value ? 'bg-[#0D2761] text-white' : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claims stress */}
        {(scenarioType === 'claims-stress' || scenarioType === 'combined') && (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Claims stress inputs</h3>
            <div className="space-y-4">
              <InputRow label="Additional claims">
                <input type="number" min={1} value={additionalClaims} onChange={e => setAdditionalClaims(e.target.value)} className={inputCls} />
              </InputRow>
              <InputRow label="Average claim value (R)">
                <input type="number" min={0} value={avgClaimValue} onChange={e => setAvgClaimValue(e.target.value)} className={inputCls} />
              </InputRow>
              <InputRow label="Claim type">
                <select value={claimType} onChange={e => setClaimType(e.target.value)} className={inputCls}>
                  {['Vehicle theft', 'Vehicle hijack', 'Fire', 'Flood', 'Storm', 'Liability', 'Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </InputRow>
            </div>
          </div>
        )}

        {/* Growth */}
        {(scenarioType === 'growth' || scenarioType === 'combined') && (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Growth scenario inputs</h3>
            <div className="space-y-4">
              <InputRow label="New policies">
                <input type="number" min={1} value={newPolicies} onChange={e => setNewPolicies(e.target.value)} className={inputCls} />
              </InputRow>
              <InputRow label="Avg premium per policy (R)">
                <input type="number" min={0} value={avgPremium} onChange={e => setAvgPremium(e.target.value)} className={inputCls} />
              </InputRow>
              <InputRow label="Product line">
                <select value={productLine} onChange={e => setProductLine(e.target.value)} className={inputCls}>
                  {['Motor', 'Property', 'Liability', 'Commercial', 'Personal Lines'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </InputRow>
              <InputRow label="Starting from">
                <input type="date" value={startingFrom} onChange={e => setStartingFrom(e.target.value)} className={inputCls} />
              </InputRow>
            </div>
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
      >
        {loading ? 'Running scenario…' : 'Run scenario'}
      </button>

      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">{error}</div>
      )}

      {/* Results */}
      {result && base && (
        <div className="space-y-4">
          {/* Baseline */}
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Current baseline</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total incurred', value: fmt(base.currentIncurred) },
                { label: 'NWP (YTD)', value: fmt(base.currentNwp) },
                { label: 'Loss ratio', value: pctFmt(base.currentLossRatio) },
                { label: 'LR target', value: pctFmt(base.lossRatioTarget) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#F4F6FA] rounded-lg p-3">
                  <p className="text-[10px] text-[#6B7280] mb-1">{label}</p>
                  <p className="text-sm font-bold text-[#0D2761]">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Claims stress result */}
          {cs && (
            <div className={`bg-white border rounded-xl p-5 ${cs.status === 'over-budget' ? 'border-[#FCA5A5]' : 'border-[#6EE7B7]'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">Claims stress impact</h3>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: cs.status === 'over-budget' ? '#FEF2F2' : '#ECFDF5',
                    color: cs.status === 'over-budget' ? '#991B1B' : '#065F46',
                  }}
                >
                  {cs.status === 'over-budget' ? 'Over budget' : 'Within budget'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Additional incurred', value: fmt(cs.additionalIncurred) },
                  { label: 'New total incurred', value: fmt(cs.newTotalIncurred) },
                  { label: 'New loss ratio', value: pctFmt(cs.newLossRatio) },
                  { label: 'LR change', value: cs.lossRatioChange != null ? `${cs.lossRatioChange > 0 ? '+' : ''}${cs.lossRatioChange.toFixed(1)}pp` : '—' },
                  { label: 'Remaining budget', value: fmt(cs.remainingBudget) },
                  { label: 'Budget breach date', value: cs.breachDate ?? (cs.status === 'within-budget' ? 'No breach projected' : 'Already breached') },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#F4F6FA] rounded-lg p-3">
                    <p className="text-[10px] text-[#6B7280] mb-1">{label}</p>
                    <p className="text-sm font-bold text-[#0D2761]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Growth result */}
          {gi && (
            <div className={`bg-white border rounded-xl p-5 ${gi.status === 'over-target' ? 'border-[#FCA5A5]' : 'border-[#6EE7B7]'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">Growth scenario impact</h3>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: gi.status === 'over-target' ? '#FEF2F2' : '#ECFDF5',
                    color: gi.status === 'over-target' ? '#991B1B' : '#065F46',
                  }}
                >
                  {gi.status === 'over-target' ? 'Over target LR' : 'Within target LR'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Additional NWP / month', value: fmt(gi.additionalNwpMonthly) },
                  { label: 'Additional NWP (YE)', value: fmt(gi.additionalNwpYe) },
                  { label: 'New total NWP', value: fmt(gi.newTotalNwp) },
                  { label: 'New loss ratio', value: pctFmt(gi.newLossRatio) },
                  { label: 'LR change', value: gi.lossRatioChange != null ? `${gi.lossRatioChange > 0 ? '+' : ''}${gi.lossRatioChange.toFixed(1)}pp` : '—' },
                  { label: 'Product line', value: gi.productLine ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#F4F6FA] rounded-lg p-3">
                    <p className="text-[10px] text-[#6B7280] mb-1">{label}</p>
                    <p className="text-sm font-bold text-[#0D2761]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
