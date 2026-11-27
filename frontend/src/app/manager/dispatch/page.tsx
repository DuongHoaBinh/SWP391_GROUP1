'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy Coordinator overview consolidated into the unified Planning & Dispatch Hub (/manager/planning).
 * Kept as a redirect wrapper for bookmark & legacy /coordinator -> /manager/dispatch compatibility.
 */
export default function DispatchOverviewRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manager/planning');
  }, [router]);
  return null;
}
