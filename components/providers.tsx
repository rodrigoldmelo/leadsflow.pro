'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AutoLogout } from '@/components/auto-logout';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <AutoLogout />
      {children}
      <Toaster position="top-center" richColors />
    </>
  );
}
