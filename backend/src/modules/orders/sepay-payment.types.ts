import { RowDataPacket } from 'mysql2/promise';

export interface SepayPayment extends RowDataPacket {
  payment_id: number;
  shipment_id: number;
  customer_id: number;
  payment_code: string;
  amount: number | string;
  bank_code: string;
  account_number: string;
  account_name: string;
  status: 'pending' | 'review' | 'succeeded';
  transaction_id: number | string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
  shipment_status?: string;
  current_amount?: number | string;
  shipment_customer_id?: number;
}

export interface SepayTransaction {
  id: number;
  gateway: string;
  accountNumber: string;
  transferType: 'in' | 'out';
  transferAmount: number;
  content: string;
  code?: string | null;
  referenceCode?: string;
  transactionDate?: string;
  [key: string]: unknown;
}

export interface SepayConfig {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  prefix: string;
  suffixLength: number;
  secret: string;
}

export const PAYABLE_SHIPMENT_STATUSES = ['confirmed', 'ready_to_depart', 'in_transit', 'completed'];
