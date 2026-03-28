import { createContext, useContext } from 'react';

export const RowingContext = createContext(null);

export function useRowing() {
  const ctx = useContext(RowingContext);
  if (!ctx) throw new Error('useRowing must be used inside ExperimentLayout');
  return ctx;
}
