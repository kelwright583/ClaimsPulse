'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ComparisonMode = 'daily' | 'monthly' | 'annual' | null;

export interface ComparisonPeriod {
  mode: ComparisonMode;
  fromDate: string | null;
  toDate: string | null;
  fromMonth: string | null;
  toMonth: string | null;
  fromYear: number | null;
  toYear: number | null;
}

interface ComparisonContextValue {
  isComparing: boolean;
  period: ComparisonPeriod;
  activate: (mode: ComparisonMode) => void;
  deactivate: () => void;
  setPeriod: (period: Partial<ComparisonPeriod>) => void;
  resolvedFromDate: string | null;
  resolvedToDate: string | null;
}

const defaultPeriod: ComparisonPeriod = {
  mode: null,
  fromDate: null,
  toDate: null,
  fromMonth: null,
  toMonth: null,
  fromYear: null,
  toYear: null,
};

const ComparisonContext = createContext<ComparisonContextValue>({
  isComparing: false,
  period: defaultPeriod,
  activate: () => {},
  deactivate: () => {},
  setPeriod: () => {},
  resolvedFromDate: null,
  resolvedToDate: null,
});

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [isComparing, setIsComparing] = useState(false);
  const [period, setPeriodState] = useState<ComparisonPeriod>(defaultPeriod);

  const activate = useCallback((mode: ComparisonMode) => {
    setIsComparing(true);
    setPeriodState(prev => ({ ...prev, mode }));
  }, []);

  const deactivate = useCallback(() => {
    setIsComparing(false);
    setPeriodState(defaultPeriod);
  }, []);

  const setPeriod = useCallback((partial: Partial<ComparisonPeriod>) => {
    setPeriodState(prev => ({ ...prev, ...partial }));
  }, []);

  const resolvedFromDate = period.fromDate;
  const resolvedToDate = period.toDate;

  return (
    <ComparisonContext.Provider value={{
      isComparing, period, activate, deactivate, setPeriod,
      resolvedFromDate, resolvedToDate,
    }}>
      {children}
    </ComparisonContext.Provider>
  );
}

export const useComparison = () => useContext(ComparisonContext);
