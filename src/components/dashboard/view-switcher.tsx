'use client';

import type { TopView } from './types';
import { TOP_VIEWS } from './types';
import type { UserRole } from '@/types/roles';

interface ViewSwitcherProps {
  role: UserRole;
  active: TopView;
  onChange: (view: TopView) => void;
}

export function ViewSwitcher({ role, active, onChange }: ViewSwitcherProps) {
  const accessible = TOP_VIEWS.filter(v => v.roles.includes(role));
  if (accessible.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 bg-[#F4F6FA] rounded-full p-1 w-fit">
      {accessible.map(v => {
        const isActive = v.key === active;
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key as TopView)}
            className={`
              px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-white text-[#0D2761] shadow-[0_1px_3px_rgba(0,0,0,0.10)]'
                : 'text-[#6B7280] hover:text-[#0D2761]'
              }
            `}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
