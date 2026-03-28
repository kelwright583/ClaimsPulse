import { cn } from '@/lib/utils';
import type { SlaPriority } from '@/types/claims';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  className?: string;
}

interface SlaBadgeProps {
  priority: SlaPriority;
  label?: string;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-[#1B3A5C]/10 text-[#1B3A5C]',
  success: 'bg-[#0F6E56]/10 text-[#0F6E56]',
  warning: 'bg-[#854F0B]/10 text-[#854F0B]',
  danger: 'bg-[#A32D2D]/10 text-[#A32D2D]',
  info: 'bg-blue-50 text-blue-700',
  outline: 'border border-[#D3D1C7] text-[#5F5E5A]',
};

const priorityStyles: Record<SlaPriority, string> = {
  critical: 'bg-[#A32D2D] text-white',
  urgent: 'bg-[#854F0B] text-white',
  standard: 'bg-[#1B3A5C] text-white',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function SlaBadge({ priority, label, className }: SlaBadgeProps) {
  const labels: Record<SlaPriority, string> = {
    critical: 'Critical',
    urgent: 'Urgent',
    standard: 'Standard',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        priorityStyles[priority],
        className
      )}
    >
      {label ?? labels[priority]}
    </span>
  );
}
