import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { basename, join } from 'path';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  assertSafeExternalOrUploadUrl,
  verifyUploadedFileMagicBytes,
} from '../../common/utils/upload-validation';
import { UserRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApproveRefundDto,
  CreateDisbursementDto,
  GrantPaymentGraceDto,
  OperationalCancelDto,
  SubmitRefundBankInfoDto,
  TransferRefundDto,
} from './dto/orders-ops.dto';
import { DisbursementItem, OrdersOpsStore, RefundRecordItem } from './orders-ops.store';
import { RefundMode } from './refund-policy';

@Injectable()
export class OrdersOpsService {
  constructor(
    private readonly opsStore: OrdersOpsStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  private cleanupTempFile(file?: Express.Multer.File) {
    if (file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
  }

  async operationalCancel(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: OperationalCancelDto,
  ) {
    const result = await this.opsStore.operationalCancel(Number(user.id), shipmentId, dto);
    const code = `REQ-${String(shipmentId).padStart(3, '0')}`;
    const refundSummary = result.refundRecord
      ? result.refundRecord.refundMode === RefundMode.CASH_REFUND
        ? ` Hồ sơ hoàn tiền #${result.refundRecord.id} (${result.refundRecord.amount.toLocaleString('vi-VN')} VND) đã được tạo. Vui lòng vào trang chi tiết đơn hàng điền thông tin tài khoản ngân hàng để nhận hoàn tiền.`
        : ` Hồ sơ bảo lưu cước #${result.refundRecord.id} (${result.refundRecord.amount.toLocaleString('vi-VN')} VND - bảo lưu 30 ngày) đã được tạo chờ phê duyệt.`
      : '';
    await this.notificationsService.createNotification(
      result.customerId,
      `Hủy vận hành đơn ${code}`,
      `Đơn hàng ${code} đã được chuyển trạng thái hủy vận hành (${dto.category}). Lý do: ${dto.reason}.${refundSummary}`,
      'status_update',
      shipmentId,
    );
    return result;
  }

  async createDisbursement(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateDisbursementDto,
    file?: Express.Multer.File,
  ): Promise<DisbursementItem> {
    if (file) {
      verifyUploadedFileMagicBytes(file, 'document');
    } else if (dto.authorityReceiptUrl) {
      assertSafeExternalOrUploadUrl(dto.authorityReceiptUrl);
    }

    const receiptUrl = file
      ? `/uploads/disbursements/${file.filename}`
      : dto.authorityReceiptUrl?.trim() || null;

    try {
      return await this.opsStore.createDisbursement(shipmentId, Number(user.id), {
        authorityName: dto.authorityName,
        feeType: dto.feeType,
        amount: dto.amount,
        authorityReceiptUrl: receiptUrl,
        notes: dto.notes ?? null,
      });
    } catch (err) {
      this.cleanupTempFile(file);
      throw err;
    }
  }

  async getDisbursements(user: AuthenticatedUser, shipmentId: number): Promise<DisbursementItem[]> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem dữ liệu tài chính / phí ứng trước.');
    }
    const order = await this.opsStore.findOrderOwner(shipmentId);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem danh sách phí ứng trước của đơn hàng thuộc tài khoản mình.');
    }
    return this.opsStore.findDisbursementsByShipment(shipmentId);
  }

  async getAuthorizedDisbursementReceipt(user: AuthenticatedUser, disbursementId: number) {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem biên lai tài chính.');
    }
    const item = await this.opsStore.findDisbursementById(disbursementId);
    if (!item) throw new NotFoundException(`Không tìm thấy biên lai ứng trước #${disbursementId}`);
    if (user.role === UserRole.CUSTOMER && item.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền xem biên lai của khách hàng khác.');
    }
    if (!item.authorityReceiptUrl) {
      throw new NotFoundException('Khoản ứng trước này chưa có biên lai đính kèm.');
    }
    if (/^https?:\/\//i.test(item.authorityReceiptUrl)) {
      return { absolutePath: '', fileName: basename(item.authorityReceiptUrl), externalUrl: item.authorityReceiptUrl };
    }
    const safeName = basename(item.authorityReceiptUrl);
    const absolutePath = join(process.cwd(), 'uploads', 'disbursements', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp biên lai trên máy chủ.');
    }
    return { absolutePath, fileName: safeName };
  }

  async listRefunds(user: AuthenticatedUser, shipmentId?: number): Promise<RefundRecordItem[]> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem hồ sơ hoàn tiền.');
    }
    if (shipmentId !== undefined) {
      const order = await this.opsStore.findOrderOwner(shipmentId);
      if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
      if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
        throw new ForbiddenException('Bạn chỉ được xem hồ sơ hoàn tiền của đơn hàng thuộc tài khoản mình.');
      }
      return this.opsStore.findRefunds(shipmentId);
    }
    if (![UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role)) {
      throw new ForbiddenException('Chỉ Logistics Manager hoặc Admin được xem toàn bộ sổ hoàn tiền.');
    }
    return this.opsStore.findRefunds();
  }

  async approveRefund(user: AuthenticatedUser, refundId: number, dto: ApproveRefundDto): Promise<RefundRecordItem> {
    const updated = await this.opsStore.approveRefund(
      refundId,
      Number(user.id),
      dto.decision ?? 'approve',
      dto.notes,
    );
    const code = updated.requestCode;
    if (updated.status === 'converted_to_credit') {
      await this.notificationsService.createNotification(
        updated.customerId,
        `Bảo lưu cước 30 ngày đã kích hoạt (${code})`,
        `Khoản bảo lưu ${updated.amount.toLocaleString('vi-VN')} VND cho đơn ${code} đã được duyệt (hạn sử dụng đến ${updated.creditExpiresAt}).`,
        'status_update',
        updated.shipmentId,
      );
    } else if (updated.status === 'approved_for_transfer') {
      if (!updated.formSubmittedAt || !updated.recipientBankAccount) {
        await this.notificationsService.createNotification(
          updated.customerId,
          `Vui lòng cung cấp STK nhận hoàn tiền (${code})`,
          `Hồ sơ hoàn tiền #${updated.id} (${updated.amount.toLocaleString('vi-VN')} VND) đã được Logistics Manager phê duyệt. Quý khách vui lòng điền thông tin tài khoản ngân hàng trên trang đơn hàng để hoàn tất chuyển khoản.`,
          'status_update',
          updated.shipmentId,
        );
      } else {
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `Sẵn sàng chuyển khoản hoàn tiền (${code})`,
          `Hồ sơ hoàn tiền #${updated.id} (${updated.amount.toLocaleString('vi-VN')} VND) đã duyệt và có đủ STK khách hàng. Vui lòng thực hiện chuyển khoản và tải ủy nhiệm chi.`,
          'status_update',
          updated.shipmentId,
        );
      }
    }
    return updated;
  }

  async getRefundBankInfo(user: AuthenticatedUser, refundId: number) {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem thông tin hoàn tiền.');
    }
    const record = await this.opsStore.findRefundById(refundId);
    if (!record) throw new NotFoundException(`Không tìm thấy hồ sơ hoàn tiền #${refundId}`);
    if (user.role === UserRole.CUSTOMER && record.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem biểu mẫu hoàn tiền của đơn hàng thuộc tài khoản mình.');
    }
    return {
      refundId: record.id,
      shipmentId: record.shipmentId,
      requestCode: record.requestCode,
      cancellationCategory: record.cancellationCategory,
      refundMode: record.refundMode,
      status: record.status,
      amount: record.amount,
      freightRefundAmount: record.freightRefundAmount,
      insuranceRefundAmount: record.insuranceRefundAmount,
      disbursementDeduction: record.disbursementDeduction,
      nonRefundableAirDeduction: record.nonRefundableAirDeduction,
      bankName: record.recipientBankName,
      accountNumber: record.recipientBankAccount,
      accountHolder: record.recipientAccountHolder,
      customerNote: record.customerNote,
      formSubmittedAt: record.formSubmittedAt,
      slaDueAt: record.slaDueAt,
      transferReceiptUrl: record.transferReceiptUrl,
      bankTransactionRef: record.bankTransactionRef,
      canSubmit:
        user.role === UserRole.CUSTOMER &&
        record.refundMode === RefundMode.CASH_REFUND &&
        record.amount > 0 &&
        !record.formSubmittedAt &&
        ['pending_approval', 'approved_for_transfer'].includes(record.status),
    };
  }

  async submitRefundBankInfo(
    user: AuthenticatedUser,
    refundId: number,
    dto: SubmitRefundBankInfoDto,
  ): Promise<RefundRecordItem> {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Chỉ chủ ngựa sở hữu đơn mới được điền thông tin tài khoản nhận hoàn tiền.');
    }
    const updated = await this.opsStore.submitRefundBankInfo(refundId, Number(user.id), dto);
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Chủ ngựa đã cung cấp STK hoàn tiền (${updated.requestCode})`,
      `Khách hàng đã gửi STK nhận hoàn tiền (${updated.recipientBankName} · ${updated.recipientBankAccount} · ${updated.recipientAccountHolder}) cho hồ sơ #${updated.id} (${updated.amount.toLocaleString('vi-VN')} VND).`,
      'status_update',
      updated.shipmentId,
    );
    return updated;
  }

  async transferRefund(
    user: AuthenticatedUser,
    refundId: number,
    dto: TransferRefundDto,
    file?: Express.Multer.File,
  ): Promise<RefundRecordItem> {
    if (file) {
      verifyUploadedFileMagicBytes(file, 'document');
    } else if (dto.transferReceiptUrl) {
      assertSafeExternalOrUploadUrl(dto.transferReceiptUrl);
    }

    const receiptUrl = file
      ? `/uploads/refund-receipts/${file.filename}`
      : dto.transferReceiptUrl?.trim();
    if (!receiptUrl) {
      this.cleanupTempFile(file);
      throw new BadRequestException('Bắt buộc phải tải ảnh ủy nhiệm chi hoặc cung cấp đường dẫn chứng từ chuyển khoản.');
    }

    try {
      const updated = await this.opsStore.transferRefund(refundId, Number(user.id), {
        recipientBankAccount: dto.recipientBankAccount,
        bankTransactionRef: dto.bankTransactionRef,
        transferReceiptUrl: receiptUrl,
        notes: dto.notes,
        actorRole: user.role,
      });

      await this.notificationsService.createNotification(
        updated.customerId,
        `Hoàn tất chuyển khoản hoàn tiền (${updated.requestCode})`,
        `Khoản hoàn tiền ${updated.amount.toLocaleString('vi-VN')} VND cho đơn ${updated.requestCode} đã được chuyển khoản thủ công thành công (Mã GD: ${updated.bankTransactionRef}).`,
        'status_update',
        updated.shipmentId,
      );

      return updated;
    } catch (err) {
      this.cleanupTempFile(file);
      throw err;
    }
  }

  async getAuthorizedRefundReceipt(user: AuthenticatedUser, refundId: number) {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem ủy nhiệm chi hoàn tiền.');
    }
    const item = await this.opsStore.findRefundById(refundId);
    if (!item) throw new NotFoundException(`Không tìm thấy hồ sơ hoàn tiền #${refundId}`);
    if (user.role === UserRole.CUSTOMER && item.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem ủy nhiệm chi của đơn hàng thuộc tài khoản mình.');
    }
    if (!item.transferReceiptUrl) {
      throw new NotFoundException('Hồ sơ hoàn tiền này chưa có ảnh ủy nhiệm chi.');
    }
    if (/^https?:\/\//i.test(item.transferReceiptUrl)) {
      return { absolutePath: '', fileName: basename(item.transferReceiptUrl), externalUrl: item.transferReceiptUrl };
    }
    const safeName = basename(item.transferReceiptUrl);
    const absolutePath = join(process.cwd(), 'uploads', 'refund-receipts', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp ủy nhiệm chi trên máy chủ.');
    }
    return { absolutePath, fileName: safeName };
  }

  async grantPaymentGrace(user: AuthenticatedUser, shipmentId: number, dto: GrantPaymentGraceDto) {
    const res = await this.opsStore.grantPaymentGrace(Number(user.id), shipmentId, dto.reason);
    const code = `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      res.customerId,
      `Gia hạn thanh toán 1 lần duy nhất (${code})`,
      `Quản lý đã gia hạn thanh toán cho đơn ${code} tới hạn chót ${res.graceDueAt}. Nếu quá hạn này chưa thanh toán SePay, đơn sẽ tự động hủy vận hành.`,
      'status_update',
      shipmentId,
    );
    return res;
  }
}
