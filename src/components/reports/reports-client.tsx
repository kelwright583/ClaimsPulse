'use client';

import { useState, useEffect } from 'react';
import { FileText, Users, Activity, Clock, Briefcase, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { CustomReportBuilder } from './custom-report-builder';
import type { UserRole } from '@/types/roles';

interface GeneratedReport {
  id: string;
  reportType: string;
  title: string;
  format: string;
  createdAt: string;
}

interface Handler {
  handler: string;
  openClaims: number;
}

interface Props {
  role: UserRole;
  userId: string;
}

type ModalType = 'daily_handler' | 'team_summary' | 'portfolio_health' | 'tat_compliance' | 'broker_performance' | 'custom' | null;

const DATE_RANGE_OPTIONS = [
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-90-days', label: 'Last 90 Days' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ReportCard({ icon: Icon, title, description, onGenerate }: {
  icon: LucideIcon;
  title: string;
  description: string;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-[0_1px_3px_rgba(13,39,97,0.06)] p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0D2761]/8 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[#0D2761]" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#0D2761]">{title}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onGenerate}
        className="mt-auto w-full py-2 text-sm font-medium bg-[#1E5BC6] text-white rounded-lg hover:bg-[#0D2761] transition-colors"
      >
        Generate
      </button>
    </div>
  );
}

// Daily handler modal
function DailyHandlerModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [handler, setHandler] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/handlers').then(r => r.json()).then((h: Handler[]) => {
      setHandlers(h);
      if (h.length > 0) setHandler(h[0].handler);
    }).catch(() => {});
  }, []);

  async function generate() {
    if (!handler) return;
    setLoading(true);
    try {
      const res = await fetch('/api/reports/daily-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handler, format }),
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily-handler-${handler.replace(/\s+/g, '-')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
      onClose();
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimpleModal title="Daily Handler Report" onClose={onClose} onGenerate={generate} loading={loading}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-[#6B7280] block mb-1">Handler</label>
          <select value={handler} onChange={e => setHandler(e.target.value)} className="w-full text-sm border border-[#E8EEF8] rounded-lg px-3 py-2 bg-white text-[#0D2761]">
            {handlers.map(h => <option key={h.handler} value={h.handler}>{h.handler} ({h.openClaims} open)</option>)}
          </select>
        </div>
        <FormatToggle format={format} onChange={setFormat} />
      </div>
    </SimpleModal>
  );
}

// Team summary modal
function TeamSummaryModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [dateRange, setDateRange] = useState('this-month');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/team-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange, format }),
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team-summary.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
      onClose();
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimpleModal title="Team Summary Report" onClose={onClose} onGenerate={generate} loading={loading}>
      <div className="space-y-4">
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        <FormatToggle format={format} onChange={setFormat} />
      </div>
    </SimpleModal>
  );
}

// Portfolio health modal
function PortfolioHealthModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [dateRange, setDateRange] = useState('this-month');
  const [productLine, setProductLine] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/portfolio-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange, productLine: productLine || undefined, format }),
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-health.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
      onClose();
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimpleModal title="Portfolio Health Report" onClose={onClose} onGenerate={generate} loading={loading}>
      <div className="space-y-4">
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        <div>
          <label className="text-xs text-[#6B7280] block mb-1">Product Line (optional)</label>
          <input
            type="text"
            value={productLine}
            onChange={e => setProductLine(e.target.value)}
            placeholder="All product lines"
            className="w-full text-sm border border-[#E8EEF8] rounded-lg px-3 py-2 bg-white text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
          />
        </div>
        <FormatToggle format={format} onChange={setFormat} />
      </div>
    </SimpleModal>
  );
}

// TAT compliance modal
function TatComplianceModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [dateRange, setDateRange] = useState('this-month');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/tat-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange, format }),
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tat-compliance.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
      onClose();
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimpleModal title="TAT Compliance Report" onClose={onClose} onGenerate={generate} loading={loading}>
      <div className="space-y-4">
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        <FormatToggle format={format} onChange={setFormat} />
      </div>
    </SimpleModal>
  );
}

// Broker performance modal
function BrokerPerformanceModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [dateRange, setDateRange] = useState('this-month');
  const [broker, setBroker] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/broker-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange, broker: broker || undefined, format }),
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `broker-performance.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
      onClose();
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimpleModal title="Broker Performance Report" onClose={onClose} onGenerate={generate} loading={loading}>
      <div className="space-y-4">
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        <div>
          <label className="text-xs text-[#6B7280] block mb-1">Broker (optional)</label>
          <input
            type="text"
            value={broker}
            onChange={e => setBroker(e.target.value)}
            placeholder="All brokers"
            className="w-full text-sm border border-[#E8EEF8] rounded-lg px-3 py-2 bg-white text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
          />
        </div>
        <FormatToggle format={format} onChange={setFormat} />
      </div>
    </SimpleModal>
  );
}

// Reusable sub-components
function DateRangeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-[#6B7280] block mb-1">Date Range</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full text-sm border border-[#E8EEF8] rounded-lg px-3 py-2 bg-white text-[#0D2761]">
        {DATE_RANGE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
  );
}

function FormatToggle({ format, onChange }: { format: 'pdf' | 'xlsx'; onChange: (f: 'pdf' | 'xlsx') => void }) {
  return (
    <div>
      <label className="text-xs text-[#6B7280] block mb-1">Format</label>
      <div className="flex gap-3">
        {(['pdf', 'xlsx'] as const).map(f => (
          <label key={f} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={format === f} onChange={() => onChange(f)} className="accent-[#1E5BC6]" />
            <span className="text-sm text-[#0D2761] uppercase">{f}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SimpleModal({ title, children, onClose, onGenerate, loading }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-[#0D2761] mb-4">{title}</h3>
        {children}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761]">Cancel</button>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold bg-[#1E5BC6] text-white rounded-lg hover:bg-[#0D2761] disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsClient({ role: _role }: Props) {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [history, setHistory] = useState<GeneratedReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports/history')
      .then(r => r.json())
      .then((d: GeneratedReport[]) => setHistory(d))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [openModal]); // Refresh after modal closes

  const REPORT_CARDS: {
    type: ModalType;
    icon: LucideIcon;
    title: string;
    description: string;
  }[] = [
    { type: 'daily_handler', icon: FileText, title: 'Daily Handler Report', description: 'Individual handler performance snapshot with metrics, portfolio and focus areas.' },
    { type: 'team_summary', icon: Users, title: 'Team Summary', description: 'Consolidated team KPIs, handler breakdown, top brokers and integrity flags.' },
    { type: 'portfolio_health', icon: Activity, title: 'Portfolio Health', description: 'Claims by status, age bucket, cause and product line.' },
    { type: 'tat_compliance', icon: Clock, title: 'TAT Compliance', description: 'Compliance % overall, by status and by handler. Current breach list.' },
    { type: 'broker_performance', icon: Briefcase, title: 'Broker Performance', description: 'Per-broker claim count, avg claim size, TAT compliance and big claims.' },
    { type: 'custom', icon: Wand2, title: 'Custom Builder', description: 'Build a report from any dataset with custom columns and filters.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#0D2761]">Reports</h1>
        <p className="text-sm text-[#6B7280] mt-1">Generate PDF or Excel reports from the latest snapshot data.</p>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_CARDS.map(card => (
          <ReportCard
            key={card.type}
            icon={card.icon}
            title={card.title}
            description={card.description}
            onGenerate={() => setOpenModal(card.type)}
          />
        ))}
      </div>

      {/* Recent reports */}
      <div>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">Recent Reports</h2>
        {historyLoading ? (
          <p className="text-sm text-[#6B7280]">Loading history...</p>
        ) : history.length === 0 ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-6 text-center">
            <p className="text-sm text-[#6B7280]">No reports generated yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                    {['Title', 'Type', 'Format', 'Generated'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, idx) => (
                    <tr key={r.id} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}>
                      <td className="px-4 py-3 text-[#0D2761] font-medium">{r.title}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{r.reportType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium uppercase text-[#0D2761] bg-[#F4F6FA] px-2 py-0.5 rounded">
                          {r.format}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] text-xs tabular-nums">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {openModal === 'daily_handler' && <DailyHandlerModal onClose={() => setOpenModal(null)} />}
      {openModal === 'team_summary' && <TeamSummaryModal onClose={() => setOpenModal(null)} />}
      {openModal === 'portfolio_health' && <PortfolioHealthModal onClose={() => setOpenModal(null)} />}
      {openModal === 'tat_compliance' && <TatComplianceModal onClose={() => setOpenModal(null)} />}
      {openModal === 'broker_performance' && <BrokerPerformanceModal onClose={() => setOpenModal(null)} />}
      {openModal === 'custom' && <CustomReportBuilder onClose={() => setOpenModal(null)} />}
    </div>
  );
}
