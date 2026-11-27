'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy Departure Schedule route consolidated into Live Operations Monitoring (/manager/monitoring).
 * Kept as a client redirect wrapper so old bookmarks and deep links continue working cleanly.
 */
export default function DispatchScheduleRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/manager/monitoring');
  }, [router]);

  return null;
}
