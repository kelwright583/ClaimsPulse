interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`skeleton rounded ${className}`}
      style={{ width, height: height ?? '1rem' }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#E8EEF8] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <Skeleton width="60%" height="0.75rem" className="mb-3" />
      <Skeleton width="50%" height="1.75rem" className="mb-2" />
      <Skeleton width="40%" height="0.625rem" />
    </div>
  );
}

export function ClaimRowSkeleton() {
  return (
    <tr className="border-b border-[#E8EEF8]">
      {[80, 120, 100, 80, 60, 90, 70].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width={w} height="0.75rem" />
        </td>
      ))}
    </tr>
  );
}

export function HandlerCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#E8EEF8] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <Skeleton width="70%" height="0.875rem" className="mb-4" />
      {[1, 2, 3].map(i => (
        <div key={i} className="mb-3">
          <div className="flex justify-between mb-1">
            <Skeleton width="50%" height="0.625rem" />
            <Skeleton width="20%" height="0.625rem" />
          </div>
          <Skeleton width="100%" height="0.375rem" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-[#E8EEF8] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <Skeleton width="40%" height="0.875rem" className="mb-4" />
      <Skeleton width="100%" height={height} />
      <div className="flex gap-4 mt-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} width="20%" height="0.625rem" />
        ))}
      </div>
    </div>
  );
}
