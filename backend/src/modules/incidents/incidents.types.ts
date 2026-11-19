export type IncidentType =
  | 'vehicle_breakdown'
  | 'traffic_delay'
  | 'horse_medical'
  | 'weather'
  | 'border_issue'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'in_review' | 'resolved' | 'closed';

export type ChangeRequestType = 'route' | 'cost' | 'schedule' | 'vehicle' | 'other';
export type ChangeCostAllocation = 'none' | 'operating_cost' | 'emergency_vet_covered' | 'customer_addendum';
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ChangeRequestRecord {
  id: number;
  shipmentId: number;
  requestCode: string;
  incidentId: number | null;
  requestedBy: number;
  requestedByName?: string;
  approvedBy: number | null;
  approvedByName?: string;
  changeType: ChangeRequestType;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  estimatedExtraCost: number;
  costAllocation: ChangeCostAllocation;
  crossesNewBorder: boolean;
  status: ChangeRequestStatus;
  decisionNotes: string | null;
  requestedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  publishedBy: number | null;
  rippleNotifiedCount: number;
}

export interface IncidentRecord {
  id: number;
  shipmentId: number;
  requestCode: string;
  reportedBy: number;
  reporterName?: string;
  incidentType: IncidentType | string;
  description: string;
  severity: IncidentSeverity | string;
  status: IncidentStatus | string;
  locationText?: string | null;
  immediateActions?: string | null;
  resolutionNotes?: string | null;
  resolvedBy?: number | null;
  affectedBorderGate?: string | null;
  evidenceUrls: string[];
  reportedAt: string;
  resolvedAt: string | null;
  changeRequests?: ChangeRequestRecord[];
}
