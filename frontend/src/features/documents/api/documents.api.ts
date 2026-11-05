import { apiClient } from '@/lib/api-client';

export interface RegulationItem {
  id: number;
  country: string;
  documentType: string;
  description: string | null;
  effectiveDate: string | null;
  createdAt: string;
}

export interface AuthorityApprovalRecord {
  id: number;
  documentId: number;
  approvedBy: number | null;
  approverName?: string;
  authorityName: string;
  status: 'pending' | 'approved' | 'rejected';
  approvalDate: string | null;
  notes: string | null;
}

export interface ApiTransportDocument {
  id: number;
  horseId: number;
  horseName?: string;
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
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired';
  reviewerNotes: string | null;
  createdAt: string;
  approvals?: AuthorityApprovalRecord[];
}

export interface HorseComplianceItem {
  horseId: number;
  horseName: string;
  microchipNo?: string | null;
  passportNo?: string | null;
  documents: ApiTransportDocument[];
  missingRegulations: RegulationItem[];
  isCompliant: boolean;
}

export interface RegulationTemplateItem {
  documentType: string;
  description: string;
}

export interface RegulationTemplatePreset {
  key: string;
  name: string;
  region: string;
  description: string;
  recommendedCountries: string[];
  items: RegulationTemplateItem[];
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
  requirementsSent?: boolean;
  isUsingGlobalBaseline?: boolean;
  complianceNotice?: string;
  horses: HorseComplianceItem[];
}

export interface ComplianceOrderSummary {
  orderId: number;
  requestCode: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  originLocation: string;
  destinationLocation: string;
  destinationCountry: string;
  status: string;
  createdAt: string;
  horsesCount: number;
  horseNames?: string;
  totalRequiredDocs: number;
  approvedDocsCount: number;
  isFullyCompliant: boolean;
  requirementsSent: boolean;
  isUsingGlobalBaseline?: boolean;
  complianceNotice?: string;
}

export const documentsApi = {
  // Regulations
  getRegulations: async (country?: string): Promise<RegulationItem[]> => {
    const query = country ? `?country=${encodeURIComponent(country)}` : '';
    return apiClient<RegulationItem[]>(`/documents/regulations${query}`);
  },

  getPresetTemplates: async (): Promise<RegulationTemplatePreset[]> => {
    return apiClient<RegulationTemplatePreset[]>('/documents/regulations/templates');
  },

  applyPresetTemplate: async (data: {
    country: string;
    templateKey: string;
    effectiveDate?: string;
  }): Promise<RegulationItem[]> => {
    return apiClient<RegulationItem[]>('/documents/regulations/apply-template', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteRegulation: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient<{ success: boolean; message: string }>(`/documents/regulations/${id}`, {
      method: 'DELETE',
    });
  },

  createRegulation: async (data: {
    country: string;
    documentType: string;
    description?: string;
    effectiveDate?: string;
  }): Promise<RegulationItem> => {
    return apiClient<RegulationItem>('/documents/regulations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Document list & detail
  getDocuments: async (params?: {
    status?: string;
    horseId?: number;
  }): Promise<ApiTransportDocument[]> => {
    const queryParts: string[] = [];
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.horseId) queryParts.push(`horseId=${encodeURIComponent(params.horseId)}`);
    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return apiClient<ApiTransportDocument[]>(`/documents${query}`);
  },

  getDocumentById: async (id: number): Promise<ApiTransportDocument> => {
    return apiClient<ApiTransportDocument>(`/documents/${id}`);
  },

  getDocumentsByHorse: async (horseId: number): Promise<ApiTransportDocument[]> => {
    return apiClient<ApiTransportDocument[]>(`/documents/horse/${horseId}`);
  },

  // Upload document with multipart/form-data
  uploadDocument: async (formData: FormData): Promise<ApiTransportDocument> => {
    return apiClient<ApiTransportDocument>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  // Re-upload / Update document file
  reuploadDocument: async (id: number, formData: FormData): Promise<ApiTransportDocument> => {
    return apiClient<ApiTransportDocument>(`/documents/${id}/re-upload`, {
      method: 'POST',
      body: formData,
    });
  },

  // Specialist review
  reviewDocument: async (
    id: number,
    data: {
      status: 'approved' | 'rejected' | 'expired';
      notes?: string;
      expiryDate?: string;
      docNumber?: string;
    }
  ): Promise<ApiTransportDocument> => {
    return apiClient<ApiTransportDocument>(`/documents/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Authority approval
  recordAuthorityApproval: async (
    id: number,
    data: {
      authorityName: string;
      status: 'pending' | 'approved' | 'rejected';
      referenceNumber?: string;
      notes?: string;
    }
  ): Promise<any> => {
    return apiClient(`/documents/${id}/authority-approval`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Order checklist
  getOrderComplianceChecklist: async (orderId: number): Promise<OrderComplianceChecklist> => {
    return apiClient<OrderComplianceChecklist>(`/documents/order/${orderId}/checklist`);
  },

  // Send reminder / notification to customer
  notifyMissingDocuments: async (
    orderId: number,
    data: { message?: string } = {}
  ): Promise<{ success: boolean; notificationId: number }> => {
    return apiClient<{ success: boolean; notificationId: number }>(
      `/documents/order/${orderId}/notify-missing`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  // Delete a document
  deleteDocument: async (id: number): Promise<{ success: boolean; message?: string }> => {
    return apiClient<{ success: boolean; message?: string }>(`/documents/${id}`, {
      method: 'DELETE',
    });
  },

  // Handover Flow 1 -> Flow 2: Orders awaiting compliance setup
  getComplianceOrders: async (): Promise<ComplianceOrderSummary[]> => {
    return apiClient<ComplianceOrderSummary[]>('/documents/compliance-orders');
  },

  sendComplianceRequirements: async (
    orderId: number,
    data?: { customNotes?: string }
  ): Promise<{ success: boolean; message: string; checklist: OrderComplianceChecklist }> => {
    return apiClient<{ success: boolean; message: string; checklist: OrderComplianceChecklist }>(
      `/documents/order/${orderId}/send-requirements`,
      {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }
    );
  },
};
