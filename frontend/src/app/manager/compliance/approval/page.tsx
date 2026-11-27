'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route consolidated into the unified Compliance Review Desk (/manager/compliance).
 * Kept as a redirect wrapper for bookmark & legacy /specialist/approval compatibility.
 */
export default function ComplianceApprovalRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manager/compliance');
  }, [router]);
  return null;
}
