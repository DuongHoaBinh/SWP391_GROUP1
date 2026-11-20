import { apiClient } from '@/lib/api-client';

export interface ChangeRequestItem {
  id: number;
  shipmentId: number;
  requestCode: string;
  incidentId: number | null;
  requestedBy: number;
  requestedByName?: string;
  approvedBy: number | null;
  approvedByName?: string;
  changeType: 'route' | 'cost' | 'schedule' | 'vehicle' | 'other';
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  estimatedExtraCost: number;
  costAllocation: 'none' | 'operating_cost' | 'emergency_vet_covered' | 'customer_addendum';
  crossesNewBorder: boolean;
  status: 'pending' | 'approved' | 'rejected';
  decisionNotes: string | null;
  requestedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  publishedBy: number | null;
  rippleNotifiedCount: number;
}

export interface IncidentDetailItem {
  id: number;
  shipmentId: number;
  requestCode: string;
  reportedBy: number;
  reporterName?: string;
  incidentType: string;
  description: string;
  severity: string;
  status: string;
  locationText?: string | null;
  immediateActions?: string | null;
  resolutionNotes?: string | null;
  affectedBorderGate?: string | null;
  evidenceUrls: string[];
  reportedAt: string;
  resolvedAt: string | null;
  changeRequests?: ChangeRequestItem[];
}

export const incidentsApi = {
  listIncidents: async (params?: { shipmentId?: number; status?: string }): Promise<IncidentDetailItem[]> => {
    const q = new URLSearchParams();
    if (params?.shipmentId) q.set('shipmentId', String(params.shipmentId));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return apiClient<IncidentDetailItem[]>(`/incidents${qs ? `?${qs}` : ''}`);
  },

  createIncident: async (
    shipmentId: number,
    payload: {
      incidentType: string;
      description: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      locationText?: string;
      affectedBorderGate?: string;
      files?: File[];
    },
  ): Promise<IncidentDetailItem> => {
    const fd = new FormData();
    fd.append('incidentType', payload.incidentType);
    fd.append('description', payload.description);
    if (payload.severity) fd.append('severity', payload.severity);
    if (payload.locationText) fd.append('locationText', payload.locationText);
    if (payload.affectedBorderGate) fd.append('affectedBorderGate', payload.affectedBorderGate);
    for (const file of payload.files || []) {
      fd.append('files', file);
    }
    return apiClient<IncidentDetailItem>(`/incidents/shipments/${shipmentId}`, {
      method: 'POST',
      body: fd,
    });
  },

  assessIncident: async (
    incidentId: number,
    data: { immediateActions: string; severity?: 'low' | 'medium' | 'high' | 'critical' },
  ): Promise<IncidentDetailItem> => {
    return apiClient<IncidentDetailItem>(`/incidents/${incidentId}/assess`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  listChangeRequests: async (params?: {
    incidentId?: number;
    shipmentId?: number;
    status?: string;
  }): Promise<ChangeRequestItem[]> => {
    const q = new URLSearchParams();
    if (params?.incidentId) q.set('incidentId', String(params.incidentId));
    if (params?.shipmentId) q.set('shipmentId', String(params.shipmentId));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return apiClient<ChangeRequestItem[]>(`/incidents/change-requests${qs ? `?${qs}` : ''}`);
  },

  createChangeRequest: async (
    incidentId: number,
    data: {
      changeType: 'route' | 'cost' | 'schedule' | 'vehicle' | 'other';
      oldValue?: string;
      newValue?: string;
      reason: string;
      estimatedExtraCost?: number;
      costAllocation?: 'none' | 'operating_cost' | 'emergency_vet_covered' | 'customer_addendum';
      crossesNewBorder?: boolean;
    },
  ): Promise<ChangeRequestItem> => {
    return apiClient<ChangeRequestItem>(`/incidents/${incidentId}/change-requests`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  reviewChangeRequest: async (
    changeId: number,
    data: { decision: 'approved' | 'rejected'; decisionNotes?: string },
  ): Promise<ChangeRequestItem> => {
    return apiClient<ChangeRequestItem>(`/incidents/change-requests/${changeId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  publishChangeRequest: async (changeId: number): Promise<ChangeRequestItem> => {
    return apiClient<ChangeRequestItem>(`/incidents/change-requests/${changeId}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  resolveIncident: async (
    incidentId: number,
    data: { resolutionNotes: string; close?: boolean },
  ): Promise<IncidentDetailItem> => {
    return apiClient<IncidentDetailItem>(`/incidents/${incidentId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
