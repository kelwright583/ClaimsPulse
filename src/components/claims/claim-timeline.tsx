'use client';

import { formatDate } from '@/lib/utils';

interface SnapshotPoint {
  claimId: string;
  claimStatus: string | null;
  secondaryStatus: string | null;
  snapshotDate: string;
  daysInCurrentStatus: number | null;
}

interface TimelineEntry {
  claimStatus: string | null;
  secondaryStatus: string | null;
  dateEntered: string;
  daysInStatus: number | null;
}

interface ClaimTimelineProps {
  snapshots: SnapshotPoint[];
}

function buildTimeline(snapshots: SnapshotPoint[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const seen = new Set<string>();

  for (const s of snapshots) {
    const key = `${s.claimStatus ?? ''}|${s.secondaryStatus ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({
        claimStatus: s.claimStatus,
        secondaryStatus: s.secondaryStatus,
        dateEntered: s.snapshotDate,
        daysInStatus: s.daysInCurrentStatus,
      });
    }
  }

  return entries;
}

function getStatusColor(entry: TimelineEntry, isLast: boolean): {
  dot: string;
  line: string;
  label: string;
} {
  const status = entry.claimStatus ?? '';
  if (status === 'Finalised') {
    return { dot: 'bg-[#065F46]', line: 'bg-[#065F46]/30', label: 'text-[#065F46]' };
  }
  if (status === 'Repudiated' || status === 'Cancelled') {
    return { dot: 'bg-[#991B1B]', line: 'bg-[#991B1B]/30', label: 'text-[#991B1B]' };
  }
  if (isLast) {
    return { dot: 'bg-[#0D2761]', line: 'bg-[#0D2761]/30', label: 'text-[#0D2761]' };
  }
  return { dot: 'bg-[#E8EEF8]', line: 'bg-[#E8EEF8]', label: 'text-[#6B7280]' };
}

export function ClaimTimeline({ snapshots }: ClaimTimelineProps) {
  const timeline = buildTimeline(snapshots);

  if (timeline.length === 0) {
    return (
      <div className="text-sm text-[#6B7280]">No status history available.</div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-3 top-4 bottom-4 w-px bg-[#E8EEF8]" />

      <div className="space-y-0">
        {timeline.map((entry, idx) => {
          const isLast = idx === timeline.length - 1;
          const colors = getStatusColor(entry, isLast);

          return (
            <div key={idx} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Dot */}
              <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${colors.dot}`}>
                {isLast && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold ${colors.label}`}>
                      {entry.claimStatus ?? 'Unknown'}
                    </p>
                    {entry.secondaryStatus && (
                      <p className="text-xs text-[#6B7280] mt-0.5">{entry.secondaryStatus}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-[#6B7280]">{formatDate(entry.dateEntered)}</p>
                    {entry.daysInStatus != null && (
                      <p className="text-xs font-medium text-[#0D2761] mt-0.5">
                        {entry.daysInStatus} day{entry.daysInStatus !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
