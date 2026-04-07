import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import Link from 'next/link';
import { Sun, FolderKanban, Library, FileDown } from 'lucide-react';

export default async function OperationsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const cards = [
    {
      label: 'Daily Snapshot',
      description: 'Start here every morning — live summary of claims, payments, mailbox and financials.',
      href: '/operations/snapshot',
      Icon: Sun,
      cta: 'View snapshot',
    },
    {
      label: 'Projects',
      description: 'Track business initiatives, milestones and deliverables.',
      href: '/operations/projects',
      Icon: FolderKanban,
      cta: 'View projects',
    },
    {
      label: 'Documents',
      description: 'Search across all documents attached to projects.',
      href: '/operations/documents',
      Icon: Library,
      cta: 'Browse documents',
    },
    {
      label: 'Reports',
      description: 'Generate and download operational reports on demand.',
      href: '/operations/reports',
      Icon: FileDown,
      cta: 'View reports',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Operations</h1>
        <p className="text-sm text-[#6B7280] mt-1">Your daily workspace for projects, reporting and oversight.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {cards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white border border-[#E8EEF8] rounded-xl p-6 hover:border-[#1E5BC6] hover:shadow-sm transition-all duration-150"
          >
            <div className="w-10 h-10 rounded-full bg-[#1E5BC6] flex items-center justify-center mb-4">
              <card.Icon className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-sm font-semibold text-[#0D2761] mb-1">{card.label}</h2>
            <p className="text-xs text-[#6B7280] leading-relaxed mb-3">{card.description}</p>
            <span className="text-xs font-medium text-[#1E5BC6]">{card.cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
