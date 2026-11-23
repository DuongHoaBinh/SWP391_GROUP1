import { apiClient } from '@/lib/api-client';

export type RequirementStatus =
  | 'reusable'
  | 'pending_review'
  | 'expiring'
  | 'expired'
  | 'issued_too_early'
  | 'missing';

export interface HorseRequirementItem {
  regulationId: number;
  documentTypeCode: string;
  documentTypeName: string;
  tier: 'A' | 'B';
  status: RequirementStatus;
  documentId: number | null;
  expiryDate: string | null;
  submitDeadline: string;
  earliestIssueDate: string | null;
  canSubmitLater: boolean;
  requiresAuthorityApproval: boolean;
  reasonVi: string;
}

export interface HorseRequirementGroup {
  horseId: number;
  horseName: string;
  microchipNo: string | null;
  passportNo: string | null;
  requirements: HorseRequirementItem[];
}

export interface ComplianceRequirementsResponse {
  country: string;
  mode: 'road' | 'air' | 'sea';
  usingGlobalBaseline: boolean;
  departureDate: string;
  tripEndDate: string;
  earliestFeasibleDeparture: string;
  isDepartureFeasible: boolean;
  horses: HorseRequirementGroup[];
  summary: {
    reusable: number;
    pendingReview: number;
    missing: number;
    expired: number;
    blocking: string[];
  };
}

export interface DocumentReviewLogItem {
  reviewId: number;
  documentId: number;
  fromStatus: string;
  toStatus: string;
  reviewerId: number | null;
  reviewerName: string | null;
  reason: string | null;
  checkedFieldsJson: {
    microchipMatches?: boolean;
    passportMatches?: boolean;
    issueDateOk?: boolean;
    expiryOk?: boolean;
  } | null;
  createdAt: string;
}

export async function fetchComplianceRequirements(params: {
  country: string;
  mode?: 'road' | 'air' | 'sea';
  horseIds?: number[];
  departDate: string;
  returnDate?: string;
  borderGate?: string;
}): Promise<ComplianceRequirementsResponse> {
  const query = new URLSearchParams();
  query.set('country', params.country);
  query.set('departDate', params.departDate);
  if (params.mode) query.set('mode', params.mode);
  if (params.horseIds && params.horseIds.length > 0) {
    query.set('horseIds', params.horseIds.join(','));
  }
  if (params.returnDate) query.set('returnDate', params.returnDate);
  if (params.borderGate) query.set('borderGate', params.borderGate);

  return apiClient<ComplianceRequirementsResponse>(`/compliance/requirements?${query.toString()}`);
}

export async function fetchDocumentReviewHistory(documentId: number): Promise<DocumentReviewLogItem[]> {
  return apiClient<DocumentReviewLogItem[]>(`/compliance/documents/${documentId}/history`);
}

export async function runDocumentExpirySweep(): Promise<{
  success: boolean;
  message: string;
  expiredCount: number;
  reminderCount: number;
  demotedOrdersCount: number;
}> {
  return apiClient('/compliance/run-expiry-sweep', { method: 'POST' });
}
