export enum DocumentStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum AuthorityApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export type RegulationTransportMode = 'road' | 'air' | 'sea' | 'both';
export type RegulationDocTier = 'A' | 'B';

export interface Regulation {
  id: number;
  country: string;
  borderGate?: string | null;
  transportMode: RegulationTransportMode;
  docTier: RegulationDocTier;
  leadTimeDays: number;
  maxIssueAgeDays?: number | null;
  requiresAuthorityApproval: boolean;
  minValidityBufferHours: number;
  documentType: string;
  documentTypeCode?: string | null;
  description: string | null;
  effectiveDate: string | null;
  legalReference?: string | null;
  isDemoData?: boolean;
  isActive?: boolean;
  createdAt: string;
}

/** Danh mục loại giấy tờ (bảng document_type). */
export interface DocumentTypeDefinition {
  code: string;
  nameVi: string;
  nameEn: string;
  defaultValidityDays: number | null;
  isIdentity: boolean;
  sortOrder: number;
}

/** Trạng thái hạn tính khi đọc: valid (xanh), expiring_soon (vàng, < 30 ngày), expired (đỏ), no_expiry. */
export type DocumentValidityStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

export interface DocumentApproval {
  id: number;
  documentId: number;
  approvedBy: number | null;
  approverName?: string;
  authorityName: string;
  status: AuthorityApprovalStatus;
  approvalDate: string | null;
  notes: string | null;
}

export interface TransportDocument {
  id: number;
  horseId: number;
  ownerId?: number;
  horseName?: string;
  requestCode?: string;
  /** NULL với giấy tờ chung của ngựa (hộ chiếu...) không thuộc riêng quy định nào */
  regulationId: number | null;
  documentTypeCode?: string | null;
  documentTypeNameVi?: string | null;
  documentTypeNameEn?: string | null;
  validityStatus?: DocumentValidityStatus;
  daysUntilExpiry?: number | null;
  regulationCountry?: string;
  regulationDocType?: string;
  regulationTitle?: string;
  uploadedBy: number;
  uploaderName?: string;
  uploaderEmail?: string;
  docType: string;
  docNumber: string | null;
  fileUrl: string;
  issueDate: string | null;
  expiryDate: string | null;
  status: DocumentStatus;
  reviewerNotes: string | null;
  createdAt: string;
  isArchived?: boolean;
  supersededByDocumentId?: number | null;
  approvals?: DocumentApproval[];
  isExpiredForTrip?: boolean;
  isExpiringSoonForTrip?: boolean;
  expiryNotice?: string;
  earlyIssuanceWarning?: string | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewerName?: string | null;
  matchedBy?: 'regulation' | 'document_type';
}

export interface DocumentReviewLogEntry {
  reviewId: number;
  documentId: number;
  fromStatus: string;
  toStatus: string;
  reviewerId: number | null;
  reviewerName?: string | null;
  reason: string | null;
  checkedFieldsJson: {
    microchipMatches?: boolean;
    passportMatches?: boolean;
    issueDateOk?: boolean;
    expiryOk?: boolean;
  } | null;
  createdAt: string;
}

export interface HorseComplianceItem {
  horseId: number;
  horseName: string;
  microchipNo?: string | null;
  passportNo?: string | null;
  documents: TransportDocument[];
  missingRegulations: Regulation[];
  isCompliant: boolean;
}

export interface OrderComplianceChecklist {
  orderId: number;
  destinationLocation: string;
  destinationCountry: string;
  totalHorses: number;
  compliantHorsesCount: number;
  totalRequiredDocuments: number;
  approvedDocumentsCount: number;
  isFullyCompliant: boolean;
  isUsingGlobalBaseline?: boolean;
  complianceNotice?: string;
  requirementsSent?: boolean;
  tripTargetDate?: string | null;
  hasExpiredDocuments?: boolean;
  effectiveTierALeadDays?: number;
  orderCutoffDate?: string | null;
  tierADeadline?: string | null;
  tierBWindowStart?: string | null;
  tierBWindowEnd?: string | null;
  inTransitComplianceAlert?: boolean;
  isInternational?: boolean;
  transportMode?: 'road' | 'air' | 'sea' | null;
  matchedBorderGates?: string[];
  horses: HorseComplianceItem[];
}

export interface RegulationTemplateItem {
  documentType: string;
  documentTypeCode?: string;
  description: string;
  docTier?: RegulationDocTier;
  leadTimeDays?: number;
  maxIssueAgeDays?: number | null;
  requiresAuthorityApproval?: boolean;
  minValidityBufferHours?: number;
  transportMode?: RegulationTransportMode;
  borderGate?: string | null;
  legalReference?: string | null;
  isDemoData?: boolean;
}

export interface RegulationTemplatePreset {
  key: string;
  name: string;
  region: string;
  description: string;
  recommendedCountries: string[];
  items: RegulationTemplateItem[];
}
