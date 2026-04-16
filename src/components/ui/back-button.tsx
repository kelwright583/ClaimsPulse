'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  label?: string;
  href?: string; // explicit href overrides router.back()
}

export function BackButton({ label = 'Back', href }: BackButtonProps) {
  const router = useRouter();

  if (href) {
    return (
      <a
        href={href}
        className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#0D2761] transition-colors mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
        {label}
      </a>
    );
  }

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#0D2761] transition-colors mb-4"
    >
      <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
      {label}
    </button>
  );
}
