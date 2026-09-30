'use client';

import { createContext, useContext } from 'react';
import type { RoleKey, Hooks } from '@/lib/types';

export interface RoleContextValue {
  role: RoleKey;
  setRole: (key: RoleKey) => void;
  /** The seam to the WebGL layer. Mutated in place by Plate/CuriousMode. */
  hooks: React.MutableRefObject<Hooks>;
  reduce: boolean;
}

export const RoleContext = createContext<RoleContextValue | null>(null);

export function useRole() {
  const v = useContext(RoleContext);
  if (!v) throw new Error('useRole must be used inside <Portfolio>');
  return v;
}
