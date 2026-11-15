import { BookingType } from './booking-policy';

export enum ShipmentStatus {
  REQUESTED = 'requested',
  CHANGE_REQUESTED = 'change_requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PLANNING = 'planning',
  CONFIRMED = 'confirmed',
  READY_TO_DEPART = 'ready_to_depart',
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
  quantity?: number;
  declaredValue: number;
  declaredCurrency: 'VND' | 'USD';
  exchangeRate: number;
  declaredValueVnd: number;
  insurancePackage: 'basic' | 'standard' | 'premium';
  insuranceFee: number;
  maxCompensation: number;
  emergencyVetCovered: boolean;
  insurancePolicyVersion: string;
}

export interface TransportOrder {
  transportMode?: 'road' | 'air' | null;
  bookingType: BookingType;
  stallUnitPrice: number | null;
  id: number;
  requestCode?: string;
  customerRequestCode?: string;
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
  transportationType: string | null;
  specialRequirements: string | null;
  rejectionReason: string | null;
  changeRequestNotes: string | null;
  status: ShipmentStatus;
  totalCost: number;
  transportCost: number | null;
  insuranceFee: number;
  paymentStatus?: 'unpaid' | 'pending' | 'review' | 'succeeded';
  paymentCode?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: ShipmentAttachment[];
  horses?: OrderHorse[];
  customerEmail?: string;
  customerName?: string;
  approverName?: string;
}
