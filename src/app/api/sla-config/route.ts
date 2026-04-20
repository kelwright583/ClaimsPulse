import { NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SLA_DEFAULTS = [
  { secondaryStatus: 'Repair Authorisation Pending Approval from Broker', maxDays: 1, alertRole: 'handler', priority: 'critical' },
  { secondaryStatus: 'Problematic Claim - Escalated to Management', maxDays: 2, alertRole: 'head_of_claims', priority: 'critical' },
  { secondaryStatus: 'Authorisation Pending Approval from Management', maxDays: 2, alertRole: 'both', priority: 'critical' },
  { secondaryStatus: 'Signed AOL NOT received', maxDays: 2, alertRole: 'head_of_claims', priority: 'critical' },
  { secondaryStatus: 'Validations Documentation Outstanding', maxDays: 2, alertRole: 'handler', priority: 'critical' },
  { secondaryStatus: 'Signed AOL received - Awaiting supporting document', maxDays: 2, alertRole: 'handler', priority: 'urgent' },
  { secondaryStatus: 'Assessor Appointed', maxDays: 3, alertRole: 'handler', priority: 'urgent' },
  { secondaryStatus: 'Possible Rejection - Claim Under Review', maxDays: 5, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Premium Outstanding - Possible Rejection', maxDays: 5, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Investigator Appointed', maxDays: 7, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Claim Authorised, Awaiting Repair Invoice', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Vehicle repair - WIP', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Vehicle repair - Parts on Back Order', maxDays: 14, alertRole: 'head_of_claims', priority: 'standard' },
  { secondaryStatus: 'Repair Completed - Awaiting Invoice', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Salvage Recovery in Process', maxDays: 30, alertRole: 'both', priority: 'standard' },
  { secondaryStatus: 'Own damage claim finalised, TP claim in Process', maxDays: 60, alertRole: 'tp_handler', priority: 'standard' },
  { secondaryStatus: 'None', maxDays: 3, alertRole: 'head_of_claims', priority: 'urgent' },
];

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const configs = await prisma.tatConfig.findMany({
      orderBy: [{ priority: 'asc' }, { maxDays: 'asc' }],
    });

    return Response.json({ configs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'HEAD_OF_CLAIMS') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json() as { id: string; maxDays: number; alertRole: string; priority: string; isActive: boolean };

    const updated = await prisma.tatConfig.update({
      where: { id: body.id },
      data: {
        maxDays: body.maxDays,
        alertRole: body.alertRole,
        priority: body.priority,
        isActive: body.isActive,
        updatedBy: ctx.userId,
      },
    });

    return Response.json({ config: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'HEAD_OF_CLAIMS') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json() as { action: string };
    if (body.action !== 'reset') return Response.json({ error: 'Unknown action' }, { status: 400 });

    // Reset all configs to defaults
    for (const d of SLA_DEFAULTS) {
      await prisma.tatConfig.upsert({
        where: { secondaryStatus: d.secondaryStatus },
        create: { ...d, updatedBy: ctx.userId },
        update: { maxDays: d.maxDays, alertRole: d.alertRole, priority: d.priority, isActive: true, updatedBy: ctx.userId },
      });
    }

    const configs = await prisma.tatConfig.findMany({
      orderBy: [{ priority: 'asc' }, { maxDays: 'asc' }],
    });

    return Response.json({ configs, reset: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
