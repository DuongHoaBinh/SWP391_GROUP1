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
  RETURN_PENDING = 'return_pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CANCELLED_OPERATIONAL = 'cancelled_operational',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID_PENDING_REVIEW = 'paid_pending_review',
  REFUND_REQUESTED = 'refund_requested',
  REFUNDED = 'refunded',
}

export interface ShipmentAttachment {
  id: number;
  fileUrl: string;
  fileType: 'image' | 'document' | 'video';
  uploadedAt: string;
}

export interface OrderHorse {
  shipmentHorseId?: number;
  horseId: number;
  name: string;
  breed: string | null;
  /** @deprecated Bỏ giới tính sau review 11/2026; chỉ còn ở dữ liệu cũ */
  gender: 'male' | 'female' | 'other' | 'gelding' | null;
  age: number | null;
  /** Cần chuồng riêng (Step 2): dùng khi xếp ngựa lên phương tiện */
  requiresPrivateStall?: boolean;
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
  transportMode?: 'road' | 'air' | 'sea' | null;
  seaMode?: 'vessel' | null;
  quoteId?: number | null;
  pricingSnapshot?: any | null;
  distanceKm?: number | null;
  distanceSource?: 'ors' | 'estimated' | 'table' | null;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
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
  cancellationCategory?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  paymentOverdue?: boolean;
  slaEscalationStatus?: string | null;
  slaFallbackOption?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: ShipmentAttachment[];
  horses?: OrderHorse[];
  customerEmail?: string;
  customerName?: string;
  approverName?: string;
  tripType?: 'one_way' | 'round_trip' | null;
  returnDepartureAt?: string | null;
  returnWaitMinutes?: number | null;
  returnStatus?: 'not_applicable' | 'scheduled' | 'in_progress' | 'cancelled' | 'no_show' | 'completed' | null;
  returnNoShow?: boolean | null;
  returnFreight?: number | null;
  returnInsuranceFee?: number | null;
  returnPolicySnapshot?: any | null;
  returnPolicyAcceptedAt?: string | null;
  returnCancelledAt?: string | null;
  returnCancelReason?: string | null;
  paymentFlow?: 'postpaid_legacy' | 'prepaid';
  paymentDueAt?: string | null;
  cancelReasonCode?: string | null;
  feasibilityDecidedBy?: number | null;
  feasibilityDecidedAt?: string | null;
  feasibilityReasonCode?: string | null;
  feasibilityNote?: string | null;
  returnRescheduleFee?: number | null;
  customerProposedPrice?: number | null;
  deferredDocuments?: Array<{
    horseId: number;
    documentTypeCode: string;
    documentTypeName?: string;
    submitDeadline?: string | null;
  }>;
}
