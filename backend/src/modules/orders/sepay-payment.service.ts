import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { SepayPaymentStore } from './sepay-payment.store';
import { SepayConfig, SepayPayment, SepayTransaction } from './sepay-payment.types';

@Injectable()
export class SepayPaymentService {
  constructor(private readonly store: SepayPaymentStore) {}

  config(): SepayConfig {
    const secret = process.env.SEPAY_WEBHOOK_SECRET ?? '';
    const bankCode = process.env.SEPAY_BANK_CODE ?? '';
    const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER ?? '';
    const accountName = process.env.SEPAY_ACCOUNT_NAME ?? '';
    const prefix = process.env.SEPAY_PAYMENT_PREFIX ?? 'DH';
    const suffixLength = Number(process.env.SEPAY_CODE_LENGTH ?? 8);
    if (process.env.SEPAY_ENABLED !== 'true' || secret.length < 32 || !/^[A-Za-z0-9]{2,30}$/.test(bankCode) ||
        !/^\d{6,34}$/.test(accountNumber) || !accountName.trim() || accountName.length > 150 ||
        !/^[A-Z]{2,5}$/.test(prefix) || !Number.isInteger(suffixLength) || suffixLength < 6 || suffixLength > 10) {
      throw new ServiceUnavailableException('SePay chưa được cấu hình đầy đủ trên hệ thống');
    }
    return { secret, bankCode, accountNumber, accountName, prefix, suffixLength };
  }

  private customer(user: AuthenticatedUser) {
    if (user.role !== UserRole.CUSTOMER || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) throw new ForbiddenException('Chỉ khách hàng được tạo thanh toán cho đơn của mình');
    return Number(user.id);
  }

  private view(payment: SepayPayment | null) {
    if (!payment) return null;
    const query = new URLSearchParams({ acc: payment.account_number, bank: payment.bank_code, amount: String(payment.amount),
      des: payment.payment_code, template: 'compact', holder: payment.account_name });
    return { id: payment.payment_id, shipmentId: payment.shipment_id, provider: 'sepay' as const, currency: 'VND' as const,
      paymentCode: payment.payment_code, amount: Number(payment.amount), status: payment.status,
      bankCode: payment.bank_code, accountNumber: payment.account_number, accountName: payment.account_name,
      qrUrl: payment.status === 'pending' ? `https://vietqr.app/img?${query}` : null,
      transactionId: payment.transaction_id === null ? null : String(payment.transaction_id),
      paidAt: payment.paid_at ? new Date(payment.paid_at).toISOString() : null, updatedAt: new Date(payment.updated_at).toISOString() };
  }

  async get(user: AuthenticatedUser, shipmentId: number) {
    const staff = [UserRole.ADMIN, UserRole.LOGISTICS_MANAGER].includes(user.role);
    const payment = await this.store.latest(shipmentId, staff ? null : this.customer(user));
    let enabled = true;
    try { this.config(); } catch { enabled = false; }
    return { enabled, provider: 'sepay', payment: this.view(payment) };
  }

  async create(user: AuthenticatedUser, shipmentId: number) {
    return this.view(await this.store.reserve(shipmentId, this.customer(user), this.config()));
  }

  async webhook(raw: Buffer | undefined, signature: string | undefined, timestamp: string | undefined): Promise<{ success: true }> {
    const config = this.config();
    if (!raw || raw.length > 65536 || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature) ||
        !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new UnauthorizedException('Chữ ký webhook thiếu, không hợp lệ hoặc đã hết hạn');
    }
    const expected = createHmac('sha256', config.secret).update(`${timestamp}.`).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new UnauthorizedException('Chữ ký webhook không hợp lệ');
    let payload: SepayTransaction;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new BadRequestException('JSON không hợp lệ'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isSafeInteger(payload.id) || payload.id < 0 ||
        !Number.isSafeInteger(payload.transferAmount) || payload.transferAmount <= 0 || !['in', 'out'].includes(payload.transferType) ||
        typeof payload.gateway !== 'string' || payload.gateway.length > 50 || typeof payload.accountNumber !== 'string' || payload.accountNumber.length > 34 ||
        typeof payload.content !== 'string' || payload.content.length > 10000 ||
        (payload.code != null && (typeof payload.code !== 'string' || payload.code.length > 100)) ||
        (payload.referenceCode != null && (typeof payload.referenceCode !== 'string' || payload.referenceCode.length > 255))) {
      throw new BadRequestException('Dữ liệu giao dịch không hợp lệ');
    }
    // Dashboard samples never settle a real order, even if they contain its code.
    if (payload.id === 0) return { success: true };
    const pattern = new RegExp(`(?:^|[^A-Z0-9])(${config.prefix}[0-9]{${config.suffixLength}})(?=$|[^A-Z0-9])`, 'gi');
    const codes = [...payload.content.matchAll(pattern)].map(match => match[1].toUpperCase());
    const unique = [...new Set(codes)];
    const code = unique.length === 1 && (!payload.code || payload.code.toUpperCase() === unique[0]) ? unique[0] : null;
    await this.store.receive(payload, code, config);
    return { success: true };
  }
}
