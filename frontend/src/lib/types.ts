export type UserRole =
  | 'CUSTOMER'
  | 'LOGISTICS_MANAGER'
  | 'TRANSPORT_SPECIALIST'
  | 'FLEET_ROUTE_COORDINATOR'
  | 'DRIVER_ESCORT'
  | 'ADMIN';

export interface UserProfile {
  id: string;
  name: string;
  fullName?: string;
  phone?: string;
  address?: string;
  email: string;
  role: UserRole;
  organization?: string;
  avatarUrl?: string;
  initials: string;
}

export type TransportStatus =
  | 'requested'
  | 'change_requested'
  | 'approved'
  | 'rejected'
  | 'planning'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface MedicalHistoryItem {
  id: string;
  date: string;
  title: string;
  examiner: string;
  status: string;
}

export interface HorseDocument {
  id: string;
  title: string;
  type: string;
  uploadedDate?: string;
  expiryDate?: string;
  status: 'Approved' | 'Under Review' | 'Missing';
  fileUrl?: string;
}

export interface Horse {
  id: string;
  backendId?: number;
  code?: string; // e.g. HOR-2026-001
  name: string;
  breed: string;
  age: number;
  quantity?: number;
  gender: 'Stallion' | 'Mare' | 'Gelding' | string;
  microchipNumber: string;
  passportNumber: string;
  ownerName: string;
  photoUrl?: string;
  avatarUrl?: string;
  dob?: string;
  color?: string;
  weight?: string;
  location?: string;
  availabilityStatus?: 'In Transit' | 'Scheduled' | 'Available' | 'Not Cleared' | 'Delivered' | 'Retired';
  status?: 'active' | 'in_transit' | 'delivered' | 'retired' | 'deceased' | string;
  medicalStatus?: 'Healthy' | 'Monitoring' | 'Requires Review' | 'Medical Attention' | 'Treatment';
  documentStatus?: 'Valid' | 'Expiring Soon' | 'Missing';
  vaccinationStatus?: string;
  quarantineStatus?: 'Approved' | 'Pending' | 'In Progress';
  lastExamDate?: string;
  veterinarian?: string;
  specialRequirements?: string;
  documents?: HorseDocument[];
  medicalHistory?: MedicalHistoryItem[];
}

export interface RouteTransitPoint {
  code: string;
  name: string;
  type: 'AIRPORT' | 'BORDER_GATE' | 'REST_STOP' | 'HARBOR';
  estimatedArrival?: string;
  actualArrival?: string;
  status: 'PENDING' | 'ARRIVED' | 'DEPARTED';
}

export interface RequestTimelineStage {
  stage: number;
  name: string;
  status: 'completed' | 'active' | 'pending';
  icon?: string;
}

export interface RequestActivityItem {
  id: string;
  timestamp: string;
  description: string;
  actor: string;
  type?: 'system' | 'customer' | 'specialist';
}

export interface TransportRequest {
  id: string | number;
  requestCode: string; // e.g. TR-2026-001
  title?: string;
  transportationType?: 'International' | 'Domestic';
  createdDate?: string;
  horseId: string;
  horse: Horse;
  horses?: Array<{
    horse?: Horse;
    horseId?: number;
    name?: string;
    breed?: string | null;
    gender?: string | null;
    age?: number | null;
    medicalStatus?: string;
    docsSummary?: string;
    isComplete?: boolean;
  }>;
  origin: string; // e.g. Ho Chi Minh (SGN, VN)
  originCode: string; // SGN, VN
  originLocation?: string; // from BE
  transitPoint?: string; // BKK, TH
  transitName?: string;
  destination: string; // Singapore (SIN, SG)
  destinationCode: string; // SIN, SG
  destinationLocation?: string; // from BE
  estimatedDistance?: string;
  estimatedDuration?: string;
  departureDate: string; // 23 Sep 2026, 08:00 AM
  estimatedArrivalDate: string;
  requestedDate?: string;
  contactName?: string | null;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string | null;
  totalCost?: number;
  rejectionReason?: string | null;
  changeRequestNotes?: string | null;
  status: TransportStatus;
  statusLabel: string;
  activeStepIndex: number;
  totalSteps: number;
  pendingDocumentsCount: number;
  notes?: string;
  specialRequirements?: string | null;
  timeline?: RequestTimelineStage[];
  documents?: Array<{
    id: string;
    title: string;
    uploadedDate?: string;
    status: 'Approved' | 'Under Review' | 'Missing';
    warning?: string;
  }>;
  activities?: RequestActivityItem[];
}

export interface DocumentItem {
  id: string;
  requestCode: string;
  horseName: string;
  title: string;
  documentType: 'PASSPORT' | 'HEALTH_CERT' | 'EXPORT_PERMIT' | 'IMPORT_PERMIT' | 'CUSTOMS_DECLARATION';
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  dueDate?: string;
  fileUrl?: string;
  rejectionReason?: string;
}

export interface NotificationItem {
  id: string;
  type: 'CRITICAL' | 'INFO' | 'SUCCESS';
  title: string;
  message: string;
  actionText?: string;
  actionUrl?: string;
  timeAgo: string;
  isRead: boolean;
  relatedRequestCode?: string;
}

export interface DashboardMetrics {
  activeRequests: number;
  pendingApproval: number;
  inTransit: number;
  pendingDocuments: number;
  completedTrips: number;
}
