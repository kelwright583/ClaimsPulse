'use client';

import type { TopView, SubViewDef } from './types';
import { SUB_VIEWS } from './types';

interface SubViewSwitcherProps {
  view: TopView;
  active: string;
  onChange: (sub: string) => void;
}

export function SubViewSwitcher({ view, active, onChange }: SubViewSwitcherProps) {
  const subs: SubViewDef[] = SUB_VIEWS[view] ?? [];

  return (
    <div className="flex items-end gap-0 border-b border-[#E8EEF8] overflow-x-auto">
      {subs.map(s => {
        const isActive = s.key === active;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`
              px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150
              border-b-2 -mb-px
              ${isActive
                ? 'text-[#0D2761] border-[#F5A800]'
                : 'text-[#6B7280] border-transparent hover:text-[#0D2761] hover:border-[#E8EEF8]'
              }
            `}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
