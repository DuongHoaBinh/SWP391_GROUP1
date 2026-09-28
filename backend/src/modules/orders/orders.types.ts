export enum ShipmentStatus {
  REQUESTED = 'requested',
  CHANGE_REQUESTED = 'change_requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PLANNING = 'planning',
  IN_TRANSIT = 'in_transit',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface ShipmentAttachment {
  id: number;
  fileUrl: string;
  fileType: 'image' | 'document' | 'video';
  uploadedAt: string;
}

export interface OrderHorse {
  horseId: number;
  name: string;
  breed: string | null;
  gender: 'male' | 'female' | 'gelding' | null;
  age: number | null;
}

export interface TransportOrder {
  id: number;
  customerId: number;
  requestedBy: number;
  approvedBy: number | null;
  contactName: string | null;
  contactAddress: string | null;
  contactPhone: string;
  contactEmail: string;
  requestedHorseCount: number;
  originLocation: string;
  destinationLocation: string;
  requestedDate: string;
  departureDate: string | null;
  expectedArrivalDate: string | null;
  actualArrivalDate: string | null;
  specialRequirements: string | null;
  rejectionReason: string | null;
  changeRequestNotes: string | null;
  status: ShipmentStatus;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
  attachments?: ShipmentAttachment[];
  horses?: OrderHorse[];
  customerEmail?: string;
  approverName?: string;
}
