'use client';

import { useState, useEffect } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import type { UserRole } from '@/types/roles';

interface Report {
  id: string;
  category: string;
  title: string;
  description: string;
  endpoint: string;
  format: string;
  lastDataDate: string | null;
}

export function ReportsCatalogue({ role: _role }: { role: UserRole }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/operations/reports')
      .then(r => r.json())
      .then(d => { setReports(d.reports ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function download(report: Report) {
    setDownloading(report.id);
    try {
      const res = await fetch(report.endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.id}.${report.format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate report. Please try again.');
    }
    setDownloading(null);
  }

  const categories = [...new Set(reports.map(r => r.category))];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Reports</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Generate and download operational reports on demand.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-[#F4F6FA] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(cat => (
            <section key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">{cat}</h2>
              <div className="space-y-3">
                {reports.filter(r => r.category === cat).map(report => (
                  <div
                    key={report.id}
                    className="bg-white border border-[#E8EEF8] rounded-xl p-5 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#1E5BC6] flex items-center justify-center flex-shrink-0">
                      <FileDown className="w-5 h-5 text-white" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-semibold text-[#0D2761]">{report.title}</h3>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F6FA] text-[#6B7280] uppercase">{report.format}</span>
                      </div>
                      <p className="text-xs text-[#6B7280] leading-relaxed mb-1">{report.description}</p>
                      {report.lastDataDate && (
                        <p className="text-[11px] text-[#6B7280]">
                          Data as of: {new Date(report.lastDataDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => download(report)}
                      disabled={downloading === report.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
                    >
                      {downloading === report.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <FileDown className="w-3.5 h-3.5" strokeWidth={2} />
                      )}
                      {downloading === report.id ? 'Generating…' : 'Download CSV'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
