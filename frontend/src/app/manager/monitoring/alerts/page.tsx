'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy Coordinator alerts route consolidated into the unified Incidents & Alerts Hub (/manager/incidents).
 * Kept as a redirect wrapper for bookmark & legacy /coordinator/alerts compatibility.
 */
export default function MonitoringAlertsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manager/incidents');
  }, [router]);
  return null;
}
