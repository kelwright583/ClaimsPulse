import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Compute next 1st of month after a given date. */
function nextFirstOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function escapeCsv(value: string | null | undefined): string {
  const str = value ?? '';
  // Wrap in quotes and escape internal quotes
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const uwNotifiedParam = searchParams.get('uwNotified') ?? 'false';
    const dateRangeParam = searchParams.get('dateRange');

    // Parse optional date range filter (format: YYYY-MM-DD,YYYY-MM-DD)
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (dateRangeParam) {
      const parts = dateRangeParam.split(',');
      if (parts[0]) dateFrom = new Date(parts[0]);
      if (parts[1]) dateTo = new Date(parts[1]);
    }

    // Step 1: Find claimIds that have a write_off ClaimAction (manually flagged)
    const manualWriteOffActions = await prisma.claimAction.findMany({
      where: { actionType: 'write_off', isComplete: true },
      select: { claimId: true },
    });
    const manualWriteOffClaimIds = [...new Set(manualWriteOffActions.map((a) => a.claimId))];

    // Step 2: Find claimIds already notified to UW (to optionally exclude)
    const uwNotifiedClaimIds = new Set<string>();
    if (uwNotifiedParam === 'false') {
      const notifiedActions = await prisma.claimAction.findMany({
        where: { actionType: 'uw_notified', isComplete: true },
        select: { claimId: true },
      });
      notifiedActions.forEach((a) => uwNotifiedClaimIds.add(a.claimId));
    }

    // Step 3: Fetch latest snapshot per claimId matching criteria
    // We use groupBy to get the latest snapshotDate per claimId, then fetch those records.
    const latestSnapshots = await prisma.claimSnapshot.groupBy({
      by: ['claimId'],
      _max: { snapshotDate: true },
      where: {
        OR: [
          {
            cause: { in: ['Vehicle theft', 'Vehicle hijack'] },
            claimStatus: 'Finalised',
          },
          {
            claimId: { in: manualWriteOffClaimIds },
          },
        ],
        ...(dateFrom || dateTo
          ? {
              dateOfLoss: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    });

    // Filter out UW-notified claims if requested
    const filteredLatest = latestSnapshots.filter(
      (g) => !uwNotifiedClaimIds.has(g.claimId)
    );

    if (filteredLatest.length === 0) {
      const csv = '"Policy Number","Claim Number","Insured Name","Date of Loss","Cause","Write-off Type","Effective Cancellation Date","Vehicle Registration","Make","Model","Year","Section Sum Insured","Handler","UW Notified"\n';
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="uw-cancellation-report.csv"',
        },
      });
    }

    // Fetch the actual snapshot records for the latest snapshotDate per claimId
    const snapshotConditions = filteredLatest.map((g) => ({
      claimId: g.claimId,
      snapshotDate: g._max.snapshotDate!,
    }));

    const snapshots = await prisma.claimSnapshot.findMany({
      where: {
        OR: snapshotConditions,
      },
      select: {
        claimId: true,
        policyNumber: true,
        insured: true,
        dateOfLoss: true,
        cause: true,
        sectionSumInsured: true,
        handler: true,
      },
    });

    // Build a set of manual write-off claimIds for write-off type detection
    const manualSet = new Set(manualWriteOffClaimIds);

    // Build CSV rows
    const THEFT_HIJACK = new Set(['Vehicle theft', 'Vehicle hijack']);

    const header = [
      'Policy Number',
      'Claim Number',
      'Insured Name',
      'Date of Loss',
      'Cause',
      'Write-off Type',
      'Effective Cancellation Date',
      'Vehicle Registration',
      'Make',
      'Model',
      'Year',
      'Section Sum Insured',
      'Handler',
      'UW Notified',
    ];

    const rows = snapshots.map((s) => {
      const writeOffType =
        THEFT_HIJACK.has(s.cause ?? '') && !manualSet.has(s.claimId)
          ? 'Auto-detected (theft/hijack)'
          : 'Manual flag';

      const effectiveCancellation = s.dateOfLoss ? nextFirstOfMonth(s.dateOfLoss) : null;
      const uwNotifiedValue = uwNotifiedParam === 'false' ? 'No' : '';

      return [
        escapeCsv(s.policyNumber),
        escapeCsv(s.claimId),
        escapeCsv(s.insured),
        escapeCsv(formatDate(s.dateOfLoss)),
        escapeCsv(s.cause),
        escapeCsv(writeOffType),
        escapeCsv(formatDate(effectiveCancellation)),
        escapeCsv(''), // Vehicle Registration — pending Policy Schedule report
        escapeCsv(''), // Make
        escapeCsv(''), // Model
        escapeCsv(''), // Year
        escapeCsv(s.sectionSumInsured ? s.sectionSumInsured.toNumber().toFixed(2) : ''),
        escapeCsv(s.handler),
        escapeCsv(uwNotifiedValue),
      ].join(',');
    });

    const csvLines = [header.map(escapeCsv).join(','), ...rows];
    const csv = csvLines.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="uw-cancellation-report.csv"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
