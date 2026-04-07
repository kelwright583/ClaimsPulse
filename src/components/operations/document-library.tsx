'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FileText, FileSpreadsheet, Presentation, Image, File, Download } from 'lucide-react';
import type { UserRole } from '@/types/roles';

interface Doc {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSizeKb: number | null;
  createdAt: string;
  project: { id: string; title: string };
}

const FILE_TYPES = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'csv'];

function FileIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t === 'pdf') return <FileText className="w-8 h-8 text-[#991B1B]" strokeWidth={1.5} />;
  if (['xlsx', 'xls', 'csv'].includes(t)) return <FileSpreadsheet className="w-8 h-8 text-[#065F46]" strokeWidth={1.5} />;
  if (['docx', 'doc'].includes(t)) return <FileText className="w-8 h-8 text-[#1E40AF]" strokeWidth={1.5} />;
  if (['pptx', 'ppt'].includes(t)) return <Presentation className="w-8 h-8 text-[#92400E]" strokeWidth={1.5} />;
  if (['png', 'jpg', 'jpeg', 'gif'].includes(t)) return <Image className="w-8 h-8 text-[#F5A800]" strokeWidth={1.5} />;
  return <File className="w-8 h-8 text-[#6B7280]" strokeWidth={1.5} />;
}

export function DocumentLibrary({ role: _role }: { role: UserRole }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fileType, setFileType] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debounced) params.set('search', debounced);
    if (fileType) params.set('fileType', fileType);
    const res = await fetch(`/api/operations/documents?${params}`);
    if (res.ok) {
      const { documents } = await res.json();
      setDocs(documents);
    }
    setLoading(false);
  }, [debounced, fileType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Document Library</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">All documents attached across projects.</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6] w-64"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFileType('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${!fileType ? 'bg-[#0D2761] text-white' : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'}`}
          >
            All types
          </button>
          {FILE_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFileType(fileType === t ? '' : t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase ${fileType === t ? 'bg-[#0D2761] text-white' : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-[#6B7280]">
          <p className="text-sm font-medium text-[#0D2761] mb-1">No documents found</p>
          <p className="text-sm">Documents are attached inside projects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => (
            <div key={doc.id} className="bg-white border border-[#E8EEF8] rounded-xl p-4 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <FileIcon type={doc.fileType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0D2761] truncate">{doc.title}</p>
                  <Link
                    href={`/operations/projects/${doc.project.id}`}
                    className="text-xs text-[#1E5BC6] hover:underline truncate block"
                  >
                    {doc.project.title}
                  </Link>
                </div>
              </div>
              <div className="text-[11px] text-[#6B7280] mb-3">
                {doc.fileSizeKb ? `${doc.fileSizeKb}KB · ` : ''}
                {new Date(doc.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="mt-auto">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E5BC6] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={2} />
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
