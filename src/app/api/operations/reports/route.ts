export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const latestImport = await prisma.importRun.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, reportType: true },
  });

  const reports = [
    {
      id: 'writeoff-uw-cancellation',
      category: 'Claims',
      title: 'Write-off UW Cancellation List',
      description: 'All write-off claims (theft/hijack + manual flags) with effective cancellation dates for underwriting to action.',
      endpoint: '/api/reports/writeoff-uw-cancellation',
      format: 'csv',
      lastDataDate: latestImport?.createdAt ?? null,
    },
    {
      id: 'sla-breach-summary',
      category: 'Claims',
      title: 'SLA Breach Summary',
      description: 'All currently open SLA breaches grouped by handler and secondary status.',
      endpoint: '/api/reports/sla-breach-summary',
      format: 'csv',
      lastDataDate: latestImport?.createdAt ?? null,
    },
    {
      id: 'handler-productivity',
      category: 'Claims',
      title: 'Handler Productivity Report',
      description: 'All handlers with finalisation rate, payment rate, workload score, and CS score.',
      endpoint: '/api/reports/handler-productivity',
      format: 'csv',
      lastDataDate: latestImport?.createdAt ?? null,
    },
    {
      id: 'big-claims-register',
      category: 'Claims',
      title: 'Big Claims Register',
      description: 'All claims over R250,000 incurred with current status and handler.',
      endpoint: '/api/reports/big-claims-register',
      format: 'csv',
      lastDataDate: latestImport?.createdAt ?? null,
    },
    {
      id: 'project-status-summary',
      category: 'Operations',
      title: 'Project Status Summary',
      description: 'All active projects with milestone status and completion rate.',
      endpoint: '/api/reports/project-status',
      format: 'csv',
      lastDataDate: null,
    },
  ];

  return NextResponse.json({ reports });
}
