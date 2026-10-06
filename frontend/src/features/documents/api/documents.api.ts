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
  documents: ApiTransportDocument[];
  missingRegulations: RegulationItem[];
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

export const documentsApi = {
  // Regulations
  getRegulations: async (country?: string): Promise<RegulationItem[]> => {
    const query = country ? `?country=${encodeURIComponent(country)}` : '';
    return apiClient<RegulationItem[]>(`/documents/regulations${query}`);
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

  // Specialist review
  reviewDocument: async (
    id: number,
    data: {
      status: 'approved' | 'rejected' | 'expired';
      notes?: string;
      expiryDate?: string;
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
};
