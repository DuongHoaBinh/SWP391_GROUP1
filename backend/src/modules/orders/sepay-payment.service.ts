import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersStore } from './orders.store';
import { SepayPaymentStore } from './sepay-payment.store';
import {
  ManualConfirmPaymentDto,
  PaymentConfigEntity,
  SepayWebhookPayloadDto,
  ShipmentPaymentEntity,
  SimulateSepayWebhookDto,
  UpdatePaymentConfigDto,
} from './sepay-payment.types';

@Injectable()
export class SepayPaymentService {
  constructor(
    private readonly store: SepayPaymentStore,
    private readonly ordersStore: OrdersStore,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private isDevSimulateEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    return (process.env.PAYMENT_DEV_SIMULATE ?? 'true') !== 'false';
  }

  private getExpectedWebhookApiKey(): string {
    return process.env.SEPAY_WEBHOOK_API_KEY || 'equitransit-sepay-test-apikey-2026';
  }

  private computeLockedVndAmount(totalCost: number): number {
    const raw = Number(totalCost || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Nếu báo giá < 100.000 thì là USD (quy đổi 1 USD = 25.400 VND), ngược lại là VND nguyên
    return raw < 100000 ? Math.round(raw * 25400) : Math.round(raw);
  }

  private buildQrUrls(config: PaymentConfigEntity, payment: ShipmentPaymentEntity | null) {
    if (!payment) return { qrUrl: null, vietQrUrl: null };
    const acc = encodeURIComponent(config.bankAccountNo);
    const bank = encodeURIComponent(config.bankCode);
    const amount = Math.round(Number(payment.amount));
    const des = encodeURIComponent(payment.paymentCode);
    const accName = encodeURIComponent(config.bankAccountName);

    return {
      qrUrl: `https://qr.sepay.vn/img?acc=${acc}&bank=${bank}&amount=${amount}&des=${des}`,
      vietQrUrl: `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=${des}&accountName=${accName}`,
    };
  }

  private async checkAndExpireIfNeeded(payment: ShipmentPaymentEntity | null): Promise<ShipmentPaymentEntity | null> {
    if (!payment) return null;
    if (payment.status === 'PENDING' && new Date(payment.expiresAt).getTime() <= Date.now()) {
      const updated = await this.store.updateStatus({
        paymentId: payment.paymentId,
        shipmentId: payment.shipmentId,
        oldStatus: payment.status,
        newStatus: 'EXPIRED',
        actor: 'SYSTEM',
        notes: 'Yêu cầu thanh toán đã quá thời hạn',
      });

      const order = await this.ordersStore.findById(payment.shipmentId);
      const staffCode = `REQ-${String(payment.shipmentId).padStart(3, '0')}`;
      const customerCode = order?.customerRequestCode || staffCode;

      await this.notificationsService.createNotification(
        payment.customerId,
        `Yêu cầu thanh toán đơn ${customerCode} đã hết hạn`,
        `Yêu cầu thanh toán mã ${payment.paymentCode} cho đơn ${customerCode} đã quá hạn thanh toán. Vui lòng liên hệ Quản lý vận chuyển để được cấp lại yêu cầu thanh toán mới.`,
        'status_update',
        payment.shipmentId,
      );

      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `Yêu cầu thanh toán đơn ${staffCode} đã hết hạn`,
        `Khoản thanh toán ${payment.paymentCode} của đơn ${staffCode} đã hết hạn mà chưa nhận được chuyển khoản. Quản lý có thể bấm "Gửi lại yêu cầu thanh toán".`,
        'status_update',
        payment.shipmentId,
      );

      return updated;
    }
    return payment;
  }

  async getConfig(user: AuthenticatedUser): Promise<PaymentConfigEntity & { devSimulateEnabled: boolean }> {
    const config = await this.store.getConfig();
    return {
      ...config,
      devSimulateEnabled: this.isDevSimulateEnabled(),
    };
  }

  async updateConfig(user: AuthenticatedUser, dto: UpdatePaymentConfigDto): Promise<PaymentConfigEntity> {
    if (user.role !== UserRole.LOGISTICS_MANAGER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Logistics Manager mới có quyền cập nhật cấu hình tài khoản nhận tiền');
    }
    return this.store.updateConfig(Number(user.id), dto);
  }

  async getOrderPaymentDetail(user: AuthenticatedUser, shipmentId: number) {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể xem thanh toán và hóa đơn của đơn hàng thuộc tài khoản của mình');
    }

    const isFlow2Completed = await this.documentsService.isFlow2CompletedForPayment(shipmentId);
    const config = await this.store.getConfig();
    let payment = await this.store.findByShipmentId(shipmentId);
    payment = await this.checkAndExpireIfNeeded(payment);

    const invoice = await this.store.findInvoiceByShipmentId(shipmentId);
    const history = await this.store.findHistoryByShipmentId(shipmentId);
    const { qrUrl, vietQrUrl } = this.buildQrUrls(config, payment);

    return {
      shipmentId,
      orderCode:
        user.role === UserRole.CUSTOMER
          ? order.customerRequestCode || order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`
          : order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`,
      quotedAmountVnd: this.computeLockedVndAmount(order.totalCost),
      isFlow2Completed,
      devSimulateEnabled: this.isDevSimulateEnabled(),
      config: {
        bankCode: config.bankCode,
        bankAccountNo: config.bankAccountNo,
        bankAccountName: config.bankAccountName,
        paymentCodePrefix: config.paymentCodePrefix,
        expireHours: config.expireHours,
      },
      payment,
      invoice,
      history,
      qrUrl,
      vietQrUrl,
    };
  }

  async getAllPaymentsOverview(user: AuthenticatedUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Chỉ nhân sự vận hành mới được xem tổng quan thanh toán các đơn');
    }

    const orders = await this.ordersStore.findAllShipments();
    const results = [];

    for (const o of orders) {
      const isFlow2Completed = await this.documentsService.isFlow2CompletedForPayment(o.id);
      let payment = await this.store.findByShipmentId(o.id);
      payment = await this.checkAndExpireIfNeeded(payment);
      const invoice = await this.store.findInvoiceByShipmentId(o.id);

      let paymentState: string = 'WAITING_FLOW2';
      if (payment) {
        paymentState = payment.status;
      } else if (isFlow2Completed) {
        paymentState = 'DOCUMENTS_APPROVED';
      }

      results.push({
        shipmentId: o.id,
        requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
        customerRequestCode: o.customerRequestCode,
        customerName: o.customerName || o.contactName || 'Khách hàng',
        customerEmail: o.customerEmail || o.contactEmail,
        quotedAmountVnd: this.computeLockedVndAmount(o.totalCost),
        isFlow2Completed,
        paymentState,
        payment,
        invoice,
      });
    }

    return results;
  }

  // --- Bước 1: Manager gửi / gửi lại yêu cầu thanh toán ---
  async sendPaymentRequest(user: AuthenticatedUser, shipmentId: number) {
    if (user.role !== UserRole.LOGISTICS_MANAGER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Logistics Manager mới được gửi yêu cầu thanh toán');
    }

    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    // Kiểm tra điều kiện kích hoạt duy nhất ở backend (Flow 2 hoàn tất)
    const isFlow2Completed = await this.documentsService.isFlow2CompletedForPayment(shipmentId);
    if (!isFlow2Completed) {
      throw new BadRequestException(
        'Đơn hàng chưa hoàn tất 100% hồ sơ kiểm dịch (Flow 2). Không thể gửi yêu cầu thanh toán khi chưa đủ giấy tờ.',
      );
    }

    const amountVnd = this.computeLockedVndAmount(order.totalCost);
    if (amountVnd <= 0) {
      throw new BadRequestException('Đơn hàng chưa có báo giá hợp lệ. Vui lòng cập nhật báo giá trước.');
    }

    const existing = await this.store.findByShipmentId(shipmentId);
    if (existing && existing.status === 'PAID') {
      throw new BadRequestException('Đơn hàng này đã được thanh toán hoàn tất.');
    }

    const config = await this.store.getConfig();
    const baseCode = `${config.paymentCodePrefix}${String(shipmentId).padStart(3, '0')}`;
    let paymentCode = baseCode;

    // Nếu gửi lại sau khi hết hạn hoặc đã tồn tại mã cũ, sinh mã duy nhất chữ + số liền nhau
    if (existing && existing.paymentCode === baseCode && existing.status === 'EXPIRED') {
      const randSuffix = Math.random().toString(36).substring(2, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
      paymentCode = `${baseCode}R${randSuffix}`;
    }

    const payment = await this.store.createOrRenewPaymentRequest({
      shipmentId,
      customerId: order.customerId,
      amount: amountVnd,
      paymentCode,
      expireHours: config.expireHours,
      managerId: Number(user.id),
    });

    const customerCode = order.customerRequestCode || order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      `Yêu cầu thanh toán cho đơn ${customerCode}`,
      `Hồ sơ kiểm dịch của đơn ${customerCode} đã hoàn tất. Quý khách vui lòng thanh toán số tiền ${amountVnd.toLocaleString('vi-VN')} VND qua mã QR chuyển khoản (Nội dung: ${payment.paymentCode}) trước hạn thanh toán.`,
      'status_update',
      shipmentId,
    );

    return this.getOrderPaymentDetail(user, shipmentId);
  }

  // --- Nhánh dự phòng Bước 1: Khách bấm "Tôi đã chuyển khoản" ---
  async reportCustomerTransferred(user: AuthenticatedUser, shipmentId: number) {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể thao tác trên đơn hàng của chính mình');
    }

    let payment = await this.store.findByShipmentId(shipmentId);
    payment = await this.checkAndExpireIfNeeded(payment);

    if (!payment) {
      throw new BadRequestException('Chưa có yêu cầu thanh toán cho đơn hàng này');
    }
    if (payment.status === 'PAID') {
      return this.getOrderPaymentDetail(user, shipmentId);
    }
    if (payment.status === 'EXPIRED') {
      throw new BadRequestException('Yêu cầu thanh toán đã hết hạn. Vui lòng nhờ Manager gửi lại yêu cầu mới.');
    }

    await this.store.updateStatus({
      paymentId: payment.paymentId,
      shipmentId,
      oldStatus: payment.status,
      newStatus: 'AWAITING_CONFIRMATION',
      actor: `CUSTOMER:${user.id}`,
      notes: 'Khách hàng bấm "Tôi đã chuyển khoản", chờ Manager đối chiếu sao kê xác nhận',
    });

    const staffCode = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    const payerName = order.customerName || order.contactName || 'Khách hàng';
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách báo đã chuyển khoản - Đơn ${staffCode} (Chờ xác nhận)`,
      `Khách hàng ${payerName} vừa báo đã chuyển khoản ${payment.amount.toLocaleString('vi-VN')} VND (Nội dung: ${payment.paymentCode}) cho đơn ${staffCode}. Vui lòng đối chiếu sao kê và bấm "Xác nhận đã nhận tiền".`,
      'status_update',
      shipmentId,
    );

    return this.getOrderPaymentDetail(user, shipmentId);
  }

  // --- Nhánh dự phòng Bước 2: Manager bấm "Xác nhận đã nhận tiền" ---
  async confirmManualByManager(
    user: AuthenticatedUser,
    shipmentId: number,
    dto?: ManualConfirmPaymentDto,
  ) {
    if (user.role !== UserRole.LOGISTICS_MANAGER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Logistics Manager mới có quyền xác nhận đã nhận tiền');
    }

    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    const payment = await this.store.findByShipmentId(shipmentId);
    if (!payment) {
      throw new BadRequestException('Chưa có yêu cầu thanh toán cho đơn hàng này');
    }
    if (payment.status === 'PAID') {
      return this.getOrderPaymentDetail(user, shipmentId);
    }

    const config = await this.store.getConfig();
    const staffCode = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    const customerCode = order.customerRequestCode || staffCode;
    const payerName = order.customerName || order.contactName || 'Khách hàng';
    const confirmedBy = `MANAGER:${user.id}`;
    const finalPaidAmount = payment.paidAmount ?? payment.amount;

    const { invoice } = await this.store.markPaidAndCreateInvoice({
      payment,
      confirmedBy,
      paidAmount: finalPaidAmount,
      orderCode: staffCode,
      payerName,
      payerEmail: order.customerEmail || order.contactEmail || null,
      config,
      notes: dto?.notes
        ? `Manager xác nhận thủ công: ${dto.notes}`
        : 'Manager đối chiếu sao kê và xác nhận đã nhận tiền',
    });

    // Thông báo cho Khách hàng
    await this.notificationsService.createNotification(
      order.customerId,
      `Thanh toán thành công - Đơn ${customerCode}`,
      `Khoản thanh toán ${finalPaidAmount.toLocaleString('vi-VN')} VND cho đơn ${customerCode} đã được xác nhận thành công. Hóa đơn điện tử số ${invoice.invoiceNumber} đã được phát hành.`,
      'status_update',
      shipmentId,
    );

    // Thông báo cho Manager
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách ${payerName} đã chuyển ${finalPaidAmount.toLocaleString('vi-VN')} VND cho đơn ${staffCode}`,
      `Đã xác nhận thanh toán thành công cho đơn ${staffCode} (Số hóa đơn: ${invoice.invoiceNumber}).`,
      'status_update',
      shipmentId,
    );

    return this.getOrderPaymentDetail(user, shipmentId);
  }

  // --- Bước 4: Xử lý Webhook từ SePay (`POST /api/webhooks/sepay`) ---
  async handleSepayWebhook(authHeader: string | undefined, payload: SepayWebhookPayloadDto) {
    // 1. Kiểm tra header Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
    const expectedKey = this.getExpectedWebhookApiKey();
    const rawHeader = (authHeader || '').trim();
    const prefixMatch = rawHeader.match(/^Apikey\s+(.+)$/i);
    const providedKey = prefixMatch ? prefixMatch[1].trim() : '';

    const expectedBuf = Buffer.from(expectedKey, 'utf8');
    const providedBuf = Buffer.from(providedKey, 'utf8');
    if (
      !providedKey ||
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('API Key của SePay Webhook không hợp lệ');
    }

    // 2. Chỉ xử lý transferType = "in" (tiền vào)
    const transferType = String(payload.transferType || '').toLowerCase();
    if (transferType !== 'in') {
      return { success: true, ignored: 'not_incoming_transfer' };
    }

    // 3. Chống trùng theo sepay_transaction_id
    const sepayTxId = payload.id != null ? String(payload.id).trim() : '';
    if (sepayTxId) {
      const exists = await this.store.hasExistingSepayTransaction(sepayTxId);
      if (exists) {
        return { success: true, deduplicated: true };
      }
    }

    // 4. Tìm Payment: ưu tiên trường `code`, nếu rỗng thì tìm `payment_code` trong `content`
    let matchedPayment: ShipmentPaymentEntity | null = null;
    if (payload.code && String(payload.code).trim()) {
      matchedPayment = await this.store.findByPaymentCode(String(payload.code).trim());
    }

    if (!matchedPayment && payload.content) {
      const normalizedContent = String(payload.content)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const allPayments = await this.store.findAllActivePayments();
      for (const candidate of allPayments) {
        const cleanCode = candidate.paymentCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleanCode && normalizedContent.includes(cleanCode)) {
          matchedPayment = candidate;
          break;
        }
      }
    }

    // 5. Không tìm thấy Payment hoặc đã PAID / CANCELLED: ghi log, vẫn trả 200 {"success": true}
    if (!matchedPayment || matchedPayment.status === 'PAID' || matchedPayment.status === 'CANCELLED') {
      return { success: true, matched: false };
    }

    const order = await this.ordersStore.findById(matchedPayment.shipmentId);
    if (!order) {
      return { success: true, matched: false };
    }

    const incomingAmount = Math.round(Number(payload.transferAmount || 0));
    const expectedAmount = Math.round(Number(matchedPayment.amount));
    const staffCode = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
    const customerCode = order.customerRequestCode || staffCode;
    const payerName = order.customerName || order.contactName || 'Khách hàng';
    const txIdToSave = sepayTxId || `SEPAY-${Date.now()}`;

    // 6. Đối chiếu số tiền
    if (incomingAmount !== expectedAmount) {
      await this.store.markNeedsReview({
        paymentId: matchedPayment.paymentId,
        shipmentId: matchedPayment.shipmentId,
        oldStatus: matchedPayment.status,
        sepayTxId: txIdToSave,
        referenceCode: payload.referenceCode ?? null,
        gateway: payload.gateway ?? null,
        paidAmount: incomingAmount,
        rawPayload: payload,
      });

      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `⚠️ Cảnh báo lệch số tiền thanh toán - Đơn ${staffCode}`,
        `Đơn ${staffCode} (Mã TT: ${matchedPayment.paymentCode}) yêu cầu ${expectedAmount.toLocaleString('vi-VN')} VND nhưng nhận được ${incomingAmount.toLocaleString('vi-VN')} VND từ SePay. Trạng thái chuyển sang NEEDS_REVIEW để Quản lý kiểm tra.`,
        'incident',
        matchedPayment.shipmentId,
      );

      return { success: true, status: 'NEEDS_REVIEW' };
    }

    // 7. Khớp số tiền -> PAID, tạo Invoice, bắn thông báo cho Customer & Manager
    const config = await this.store.getConfig();
    const { invoice } = await this.store.markPaidAndCreateInvoice({
      payment: matchedPayment,
      confirmedBy: 'WEBHOOK',
      sepayTxId: txIdToSave,
      referenceCode: payload.referenceCode ?? null,
      gateway: payload.gateway ?? config.bankCode,
      paidAmount: incomingAmount,
      rawPayload: payload,
      orderCode: staffCode,
      payerName,
      payerEmail: order.customerEmail || order.contactEmail || null,
      config,
      notes: `SePay Webhook tự động xác nhận chuyển khoản (Mã GD: ${txIdToSave})`,
    });

    await this.notificationsService.createNotification(
      order.customerId,
      `Thanh toán thành công - Đơn ${customerCode}`,
      `Hệ thống đã tự động xác nhận khoản chuyển khoản ${incomingAmount.toLocaleString('vi-VN')} VND cho đơn ${customerCode}. Hóa đơn số ${invoice.invoiceNumber} đã sẵn sàng.`,
      'status_update',
      matchedPayment.shipmentId,
    );

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách ${payerName} đã chuyển ${incomingAmount.toLocaleString('vi-VN')} VND cho đơn ${staffCode}`,
      `SePay Webhook đã xác nhận khoản thanh toán ${incomingAmount.toLocaleString('vi-VN')} VND cho đơn ${staffCode} (Mã hóa đơn: ${invoice.invoiceNumber}).`,
      'status_update',
      matchedPayment.shipmentId,
    );

    return { success: true, status: 'PAID', invoiceNumber: invoice.invoiceNumber };
  }

  // --- Mục 7: Endpoint giả lập Webhook SePay để dev & demo ---
  async simulateWebhook(user: AuthenticatedUser, dto: SimulateSepayWebhookDto) {
    if (!this.isDevSimulateEnabled()) {
      throw new ForbiddenException('Chức năng giả lập SePay Webhook chỉ bật khi PAYMENT_DEV_SIMULATE=true');
    }

    const payment = await this.store.findByShipmentId(dto.shipmentId);
    if (!payment) {
      throw new BadRequestException('Đơn hàng này chưa được Manager gửi yêu cầu thanh toán');
    }

    const config = await this.store.getConfig();
    const simulatedAmount =
      dto.transferAmount != null && Number(dto.transferAmount) > 0
        ? Math.round(Number(dto.transferAmount))
        : Math.round(Number(payment.amount));

    const simulatedPayload: SepayWebhookPayloadDto = {
      id: Math.floor(100000 + Math.random() * 900000),
      gateway: config.bankCode,
      transactionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      accountNumber: config.bankAccountNo,
      code: payment.paymentCode,
      content: dto.content || `${payment.paymentCode} chuyen khoan cuoc van chuyen ngua`,
      transferType: 'in',
      transferAmount: simulatedAmount,
      accumulated: simulatedAmount,
      subAccount: null,
      referenceCode: `FT${Date.now()}`,
      description: 'SePay Test Mode Simulated Transfer',
    };

    const apiKeyHeader = `Apikey ${this.getExpectedWebhookApiKey()}`;
    return this.handleSepayWebhook(apiKeyHeader, simulatedPayload);
  }
}

