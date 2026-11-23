import { apiClient } from '@/lib/api-client';
import { ReturnPolicyConfig } from './quote-api';

export interface ReturnCancellationPreview {
  shipmentId: number;
  tripType: string;
  returnStatus: string;
  returnDepartureAt: string;
  currentTime: string;
  hoursUntilDeparture: number;
  returnFreightTotal: number;
  returnInsuranceTotal: number;
  freightRefundPercent: number;
  freightRefundAmount: number;
  insuranceRefundAmount: number;
  totalRefundAmount: number;
  requiresDualApproval: boolean;
  policyTierDescription: string;
}

export interface ReturnPolicyAgreementSnapshot {
  agreed_at: string;
  policy_version: string;
  policy_snapshot: ReturnPolicyConfig;
}

export async function getReturnPolicy(): Promise<ReturnPolicyConfig> {
  return apiClient<ReturnPolicyConfig>('/orders/return-policy');
}

export async function getReturnCancellationPreview(shipmentId: number): Promise<ReturnCancellationPreview> {
  return apiClient<ReturnCancellationPreview>(`/orders/${shipmentId}/return/cancellation-preview`);
}

export async function cancelReturnLeg(shipmentId: number, reason: string): Promise<any> {
  return apiClient(`/orders/${shipmentId}/return/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function companyCancelReturnLeg(shipmentId: number, reason: string): Promise<any> {
  return apiClient(`/orders/${shipmentId}/return/company-cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function rescheduleReturnLeg(shipmentId: number, newReturnDepartureAt: string): Promise<any> {
  return apiClient(`/orders/${shipmentId}/return/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ newReturnDepartureAt }),
  });
}

export async function markReturnNoShow(
  shipmentId: number,
  payload: { notes?: string; evidenceUrls?: string[] },
): Promise<any> {
  return apiClient(`/tracking/shipments/${shipmentId}/return/no-show`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
