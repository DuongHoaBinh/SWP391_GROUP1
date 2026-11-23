export type TimelineStatus = 'done' | 'current' | 'upcoming' | 'skipped' | 'failed';

export type TimelineKind =
  | 'payment'
  | 'approval'
  | 'documents'
  | 'pickup'
  | 'depot'
  | 'rest'
  | 'border'
  | 'quarantine'
  | 'airport'
  | 'seaport'
  | 'transfer'
  | 'delivery'
  | 'handover'
  | 'return_start'
  | 'no_show'
  | 'refund'
  | 'other';

export interface TimelineVitalBadge {
  horseName: string;
  tier: 'green' | 'amber_observational' | 'amber_escalatable' | 'red';
  text: string;
}

export interface TimelinePhoto {
  url: string;
  alt: string;
}

export interface TimelineItem {
  id: string;
  group: 'pre_trip' | 'outbound' | 'return' | 'post_trip';
  kind: TimelineKind;
  title: string;                 // Vietnamese or translated
  subtitle?: string;             // Location or short description
  status: TimelineStatus;
  plannedAt?: string | null;     // ISO timestamp
  actualAt?: string | null;      // ISO timestamp
  delayMinutes?: number | null;  // > 0 delayed, < 0 early, 0 on-time
  progressPercent?: number;      // 0-100% for 'current' milestone
  locationSource?: 'gps' | 'simulated' | 'manual' | 'override' | null;
  flagged?: boolean;
  vitals?: TimelineVitalBadge[];
  photos?: TimelinePhoto[];
  actorLabel?: string;           // E.g. "Tài xế Nguyễn Văn A (driver)"
  note?: string;
}

export interface VerticalTimelineProps {
  items: TimelineItem[];
  viewer: 'customer' | 'manager' | 'driver';
  compact?: boolean;             // Compact mode: hide photos, simpler layout
  showGroups?: boolean;          // Default true
  emptyText?: string;
  renderCurrentActions?: (item: TimelineItem) => React.ReactNode;
  onItemClick?: (item: TimelineItem) => void;
  className?: string;
}

export interface ShipmentTimelineResponse {
  shipmentId: number;
  requestCode: string;
  isRoundTrip: boolean;
  currentMilestoneId?: string | null;
  items: TimelineItem[];
}
