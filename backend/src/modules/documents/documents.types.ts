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

export interface Regulation {
  id: number;
  country: string;
  documentType: string;
  description: string | null;
  effectiveDate: string | null;
  createdAt: string;
}

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
  horseName?: string;
  requestCode?: string;
  regulationId: number;
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
  approvals?: DocumentApproval[];
}

export interface HorseComplianceItem {
  horseId: number;
  horseName: string;
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
  horses: HorseComplianceItem[];
}
