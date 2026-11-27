import { InsurancePackage, Severity } from './insurance-policy';

export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';

export interface InsuranceClaimItem {
  id: number;
  shipmentId: number;
  shipmentHorseId: number;
  customerId: number;
  severity: Severity;
  description: string;
  vetCostVnd: number | null;
  evidenceUrls: string[];
  vetReportDocumentId: number | null;
  requestedAmount: number;
  suggestedAmount: number;
  approvedAmount: number | null;
  policyVersion: string;
  packageCode: InsurancePackage;
  declaredValueVnd: number;
  status: ClaimStatus;
  rejectionReasonCode: string | null;
  decisionReason: string | null;
  decidedBy: number | null;
  decidedAt: string | null;
  refundRecordId: number | null;
  refundStatus?: string | null;
  refundBankName?: string | null;
  refundAccountNumber?: string | null;
  refundAccountHolder?: string | null;
  refundCustomerNote?: string | null;
  refundFormSubmittedAt?: string | null;
  refundSlaDueAt?: string | null;
  refundRequiresDualApproval?: boolean;
  refundBankTransactionRef?: string | null;
  refundTransferReceiptUrl?: string | null;
  createdAt: string;
  horseName?: string;
  requestCode?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface InsuranceClaimEventItem {
  id: number;
  claimId: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  actorName?: string;
  note: string | null;
  createdAt: string;
}
