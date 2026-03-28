import type { LucideIcon } from 'lucide-react';

interface IconCircleProps {
  icon: LucideIcon;
  size?: 'sm' | 'md';
  className?: string;
}

export function IconCircle({ icon: Icon, size = 'md', className = '' }: IconCircleProps) {
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';
  const iconDim = size === 'md' ? 'w-6 h-6' : 'w-4 h-4';

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center flex-shrink-0 icon-circle ${className}`}
      style={{ backgroundColor: '#1E5BC6' }}
    >
      <Icon className={`${iconDim} text-white`} strokeWidth={2} />
    </div>
  );
}
