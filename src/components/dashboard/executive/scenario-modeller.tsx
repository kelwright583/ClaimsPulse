'use client';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';
interface Props { role: UserRole; userId: string; filters: FilterState }
export function ScenarioModeller(_p: Props) {
  return <div className="animate-pulse bg-[#E8EEF8] rounded-xl h-64 w-full" />;
}
