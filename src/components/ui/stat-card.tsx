'use client';

import { cn } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'info';
}

const variantAccent: Record<string, string> = {
  default: 'border-l-[#F5A800]',
  warning: 'border-l-[#F5A800]',
  danger:  'border-l-[#991B1B]',
  success: 'border-l-[#065F46]',
  info:    'border-l-[#1E5BC6]',
};

const variantValueColor: Record<string, string> = {
  default: 'text-[#0D2761]',
  warning: 'text-[#92400E]',
  danger:  'text-[#991B1B]',
  success: 'text-[#065F46]',
  info:    'text-[#1E5BC6]',
};

function TrendArrow({ trend, value }: { trend: 'up' | 'down' | 'neutral'; value?: string }) {
  if (trend === 'up') {
    return (
      <div className="flex items-center gap-1 text-[#065F46] text-xs">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
        </svg>
        {value && <span>{value}</span>}
      </div>
    );
  }
  if (trend === 'down') {
    return (
      <div className="flex items-center gap-1 text-[#991B1B] text-xs">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
        </svg>
        {value && <span>{value}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-[#6B7280] text-xs">
      <span>—</span>
      {value && <span>{value}</span>}
    </div>
  );
}

// Animated number display — only counts if value is a pure number
function AnimatedValue({ value, className }: { value: string | number; className: string }) {
  const isNumber = typeof value === 'number';
  const counted = useCountUp(isNumber ? value : 0, 900, 0);

  if (!isNumber) {
    return <p className={className}>{value}</p>;
  }

  return (
    <p className={className}>
      {Math.round(counted).toLocaleString()}
    </p>
  );
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  trendValue,
  variant = 'default',
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-[#E8EEF8] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 border-l-4',
        variantAccent[variant]
      )}
    >
      <p className="text-xs font-semibold text-[#F5A800] uppercase tracking-wide mb-2">{label}</p>
      <AnimatedValue
        value={value}
        className={cn('text-2xl font-bold tabular-nums', variantValueColor[variant])}
      />
      {sub && <p className="text-xs text-[#6B7280] mt-1">{sub}</p>}
      {trend && (
        <div className="mt-2">
          <TrendArrow trend={trend} value={trendValue} />
        </div>
      )}
    </div>
  );
}
