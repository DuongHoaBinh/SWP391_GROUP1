import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as fs from 'fs';
import { basename, join } from 'path';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { verifyUploadedFileMagicBytes } from '../../common/utils/upload-validation';
import { UserRole } from '../auth/auth.types';
import { MailService } from '../auth/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_PAYOUT_RULES_V2,
  payoutTable,
  suggestPayout,
} from './insurance-policy';
import { CreateInsuranceClaimDto, ReviewInsuranceClaimDto } from './dto/insurance-claim.dto';
import { SubmitRefundFormDto } from './dto/prepaid-flow.dto';
import { InsuranceClaimStore } from './insurance-claim.store';
import { InsuranceClaimEventItem, InsuranceClaimItem } from './insurance-claim.types';
import { OrdersStore } from './orders.store';

const ALLOWED_REJECTION_REASONS = [
  'pre_existing_condition',
  'false_declaration',
  'customer_caused',
  'leg_not_operated_by_company',
  'insufficient_evidence',
  'out_of_window',
  'other',
] as const;

@Injectable()
export class InsuranceClaimService {
  constructor(
    private readonly claimStore: InsuranceClaimStore,
    private readonly ordersStore: OrdersStore,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private cleanupFiles(files?: Express.Multer.File[]) {
    if (!Array.isArray(files)) return;
    for (const f of files) {
      if (f?.path && fs.existsSync(f.path)) {
        try {
          fs.unlinkSync(f.path);
        } catch {}
      }
    }
  }

  async getShipmentPayoutTable(user: AuthenticatedUser, shipmentId: number) {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem bảng bồi thường bảo hiểm.');
    }
    const order = await this.ordersStore.findShipmentById(shipmentId);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem thông tin bồi thường của đơn hàng thuộc tài khoản mình.');
    }

    const rules = await this.claimStore.findRulesByVersion('equine-v2');

    const horses = (order.horses || []).map((h) => {
      const declaredVal = Number(h.declaredValueVnd || 0);
      const pkg = h.insurancePackage || 'basic';
      const breakdown = payoutTable({
        packageCode: pkg,
        declaredValueVnd: declaredVal,
        rules,
      });

      return {
        shipmentHorseId: h.shipmentHorseId ?? h.horseId,
        horseId: h.horseId,
        name: h.name,
        declaredValueVnd: declaredVal,
        insurancePackage: pkg,
        insurancePolicyVersion: h.insurancePolicyVersion || 'equine-v2',
        payoutTable: breakdown,
      };
    });

    return {
      shipmentId,
      requestCode: `REQ-${String(shipmentId).padStart(3, '0')}`,
      horses,
    };
  }

  async createClaim(
    user: AuthenticatedUser,
    shipmentId: number,
    shipmentHorseId: number,
    dto: CreateInsuranceClaimDto,
    files: Express.Multer.File[] = [],
  ): Promise<InsuranceClaimItem> {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Chỉ khách hàng chủ đơn mới có quyền gửi yêu cầu bồi thường bảo hiểm.');
    }

    const info = await this.claimStore.findHorseAndShipment(shipmentId, shipmentHorseId);
    if (!info) {
      this.cleanupFiles(files);
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId} hoặc cá thể ngựa #${shipmentHorseId}`);
    }

    if (info.customerId !== Number(user.id)) {
      this.cleanupFiles(files);
      throw new ForbiddenException('Bạn chỉ được gửi yêu cầu bồi thường cho đơn hàng thuộc tài khoản mình.');
    }

    // Eligibility check
    const isCompleted = info.shipmentStatus === 'completed';
    const hasHandover = Boolean(info.handoverId);
    const isInTransitOrReturn = ['in_transit', 'return_pending'].includes(info.shipmentStatus);

    if (dto.severity !== 'M4') {
      if (!isCompleted && !hasHandover) {
        this.cleanupFiles(files);
        throw new ConflictException(
          'Yêu cầu bồi thường sự cố M1–M3 chỉ được thực hiện sau khi ngựa đã được bàn giao (hoặc đơn hàng đã hoàn tất).',
        );
      }
    } else if (!isInTransitOrReturn && !isCompleted && !hasHandover) {
      this.cleanupFiles(files);
      throw new ConflictException(
        'Yêu cầu bồi thường mức M4 chỉ áp dụng khi chuyến đi đang vận chuyển, chờ chặng về hoặc đã bàn giao.',
      );
    }

    // Window check
    const deliveryTime = info.handoverDatetime ?? (isCompleted ? info.shipmentUpdatedAt : null);
    if (deliveryTime) {
      const windowHours = Number(process.env.INSURANCE_CLAIM_WINDOW_HOURS || 72);
      const windowMs = windowHours * 3600 * 1000;
      if (Date.now() - deliveryTime.getTime() > windowMs) {
        this.cleanupFiles(files);
        throw new ConflictException('Đã quá 72 giờ kể từ bàn giao');
      }
    }

    // Active claim check
    const hasActive = await this.claimStore.hasActiveClaimForHorse(shipmentHorseId);
    if (hasActive) {
      this.cleanupFiles(files);
      throw new ConflictException('Cá thể ngựa này đang có yêu cầu bồi thường đang được xử lý');
    }

    // Anti double-dip check across approved claims + delivery_handover dispute compensation
    if (typeof this.claimStore.sumPriorCompensationForHorse === 'function') {
      const prior = await this.claimStore.sumPriorCompensationForHorse(shipmentHorseId);
      const alreadyCompensated = prior.claimTotal + prior.handoverTotal;
      const cap = Number((info as any).maxCompensation || 0);
      if (cap > 0 && alreadyCompensated >= cap) {
        this.cleanupFiles(files);
        throw new ConflictException(
          `Cá thể ngựa này đã nhận đủ hạn mức bồi thường tối đa (${cap.toLocaleString('vi-VN')} VND) từ biên bản bàn giao hoặc hồ sơ bồi thường trước đó.`,
        );
      }
      if (cap > 0 && alreadyCompensated + dto.requestedAmount > cap) {
        this.cleanupFiles(files);
        const remaining = Math.max(0, cap - alreadyCompensated);
        throw new BadRequestException(
          `Tổng số tiền bồi thường (đã chi ${alreadyCompensated.toLocaleString('vi-VN')} VND + yêu cầu mới) vượt trần tối đa ${cap.toLocaleString('vi-VN')} VND. Mức tối đa còn lại có thể yêu cầu là ${remaining.toLocaleString('vi-VN')} VND.`,
        );
      }
    }

    // Uploaded files validation
    try {
      for (const f of files) {
        verifyUploadedFileMagicBytes(f, 'document');
      }
    } catch (err) {
      this.cleanupFiles(files);
      throw err;
    }

    const evidenceUrls = files.map((f) => `/uploads/claims/${f.filename}`);

    // Calculate suggested amount from policy rules
    const version = info.insurancePolicyVersion || 'equine-v2';
    const rules = await this.claimStore.findRulesByVersion(version);
    const matchedRule =
      rules.find((r) => r.packageCode === info.insurancePackage && r.severity === dto.severity) ||
      DEFAULT_PAYOUT_RULES_V2.find(
        (r) => r.packageCode === info.insurancePackage && r.severity === dto.severity,
      );

    if (!matchedRule) {
      this.cleanupFiles(files);
      throw new BadRequestException('Không tìm thấy quy tắc bồi thường phù hợp cho gói và mức độ này.');
    }

    const suggestion = suggestPayout({
      rule: matchedRule,
      declaredValueVnd: info.declaredValueVnd,
      vetCostVnd: dto.vetCostVnd ?? null,
    });

    const claim = await this.claimStore.createClaim({
      shipmentId,
      shipmentHorseId,
      customerId: Number(user.id),
      severity: dto.severity,
      description: dto.description,
      vetCostVnd: dto.vetCostVnd ?? null,
      evidenceUrls,
      vetReportDocumentId: dto.vetReportDocumentId ?? null,
      requestedAmount: dto.requestedAmount,
      suggestedAmount: suggestion.amount,
      policyVersion: version,
      packageCode: info.insurancePackage,
      declaredValueVnd: info.declaredValueVnd,
    });

    // Notify Logistics Managers
    const code = `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Yêu cầu bồi thường bảo hiểm mới (${code})`,
      `Khách hàng vừa nộp yêu cầu bồi thường mức ${dto.severity} cho ngựa "${info.horseName}". Số tiền yêu cầu: ${dto.requestedAmount.toLocaleString('vi-VN')} VND. Số tiền hệ thống gợi ý: ${suggestion.amount.toLocaleString('vi-VN')} VND.`,
      'incident',
      shipmentId,
    );

    return claim;
  }

  async listClaimsByShipment(user: AuthenticatedUser, shipmentId: number): Promise<InsuranceClaimItem[]> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem danh sách yêu cầu bồi thường bảo hiểm.');
    }
    const order = await this.ordersStore.findShipmentById(shipmentId);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem danh sách bồi thường của đơn hàng thuộc tài khoản mình.');
    }

    return this.claimStore.listClaimsByShipment(shipmentId);
  }

  async listAllClaims(user: AuthenticatedUser, status?: string): Promise<InsuranceClaimItem[]> {
    if (![UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role)) {
      throw new ForbiddenException('Chỉ Logistics Manager hoặc Admin mới có quyền xem toàn bộ yêu cầu bồi thường.');
    }
    return this.claimStore.listAllClaims(status);
  }

  async getClaimById(
    user: AuthenticatedUser,
    claimId: number,
  ): Promise<{ claim: InsuranceClaimItem; events: InsuranceClaimEventItem[] }> {
    const claim = await this.claimStore.findClaimById(claimId);
    if (!claim) throw new NotFoundException(`Không tìm thấy yêu cầu bồi thường #${claimId}`);

    if (user.role === UserRole.CUSTOMER && claim.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền xem yêu cầu bồi thường của khách hàng khác.');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem thông tin bồi thường bảo hiểm.');
    }

    const events = await this.claimStore.findClaimEvents(claimId);
    return { claim, events };
  }

  async getClaimEvidenceFile(user: AuthenticatedUser, claimId: number, fileIndex: number) {
    const claim = await this.claimStore.findClaimById(claimId);
    if (!claim) throw new NotFoundException(`Không tìm thấy yêu cầu bồi thường #${claimId}`);

    if (user.role === UserRole.CUSTOMER && claim.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền xem bằng chứng của khách hàng khác.');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền truy cập tệp bằng chứng bồi thường.');
    }

    if (!claim.evidenceUrls || fileIndex < 0 || fileIndex >= claim.evidenceUrls.length) {
      throw new NotFoundException('Không tìm thấy tệp bằng chứng yêu cầu.');
    }

    const relUrl = claim.evidenceUrls[fileIndex];
    const safeName = basename(relUrl);
    const absolutePath = join(process.cwd(), 'uploads', 'claims', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Tệp bằng chứng không tồn tại trên máy chủ.');
    }

    return { absolutePath, fileName: safeName };
  }

  async reviewClaim(
    user: AuthenticatedUser,
    claimId: number,
    dto: ReviewInsuranceClaimDto,
  ): Promise<{ claim: InsuranceClaimItem; events: InsuranceClaimEventItem[]; refundRecordId?: number }> {
    if (![UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role)) {
      throw new ForbiddenException('Chỉ Logistics Manager hoặc Admin mới có quyền thẩm định bồi thường.');
    }

    const claim = await this.claimStore.findClaimById(claimId);
    if (!claim) throw new NotFoundException(`Không tìm thấy yêu cầu bồi thường #${claimId}`);

    // Rules verification for approve
    if (dto.decision === 'approve') {
      const rules = await this.claimStore.findRulesByVersion(claim.policyVersion);
      const rule =
        rules.find((r) => r.packageCode === claim.packageCode && r.severity === claim.severity) ||
        DEFAULT_PAYOUT_RULES_V2.find(
          (r) => r.packageCode === claim.packageCode && r.severity === claim.severity,
        );

      if (!rule) {
        throw new BadRequestException('Không tìm thấy quy tắc bồi thường của gói bảo hiểm này.');
      }

      const suggestion = suggestPayout({
        rule,
        declaredValueVnd: claim.declaredValueVnd,
        vetCostVnd: claim.vetCostVnd,
      });

      if (!dto.approvedAmount || dto.approvedAmount <= 0) {
        throw new BadRequestException('Số tiền phê duyệt bồi thường phải lớn hơn 0.');
      }

      if (dto.approvedAmount > suggestion.maxAllowed) {
        throw new BadRequestException(
          `Số tiền duyệt (${dto.approvedAmount.toLocaleString('vi-VN')} VND) vượt trần quy định (${suggestion.maxAllowed.toLocaleString('vi-VN')} VND) cho mức độ ${claim.severity}.`,
        );
      }

      if (dto.approvedAmount !== suggestion.amount && (!dto.reason || !dto.reason.trim())) {
        throw new BadRequestException(
          'Bắt buộc nhập lý do chi tiết khi phê duyệt số tiền khác với số tiền hệ thống gợi ý.',
        );
      }
    }

    if (dto.decision === 'reject') {
      if (!dto.rejectionReasonCode || !ALLOWED_REJECTION_REASONS.includes(dto.rejectionReasonCode as any)) {
        throw new BadRequestException(
          `Mã lý do từ chối không hợp lệ. Các mã cho phép: ${ALLOWED_REJECTION_REASONS.join(', ')}`,
        );
      }
      if (!dto.reason || !dto.reason.trim()) {
        throw new BadRequestException('Bắt buộc nhập lý do chi tiết khi từ chối bồi thường.');
      }
    }

    const result = await this.claimStore.reviewClaim(
      claimId,
      Number(user.id),
      dto.decision,
      dto.approvedAmount,
      dto.rejectionReasonCode,
      dto.reason,
    );

    // Notify customer
    const code = claim.requestCode || `REQ-${String(claim.shipmentId).padStart(3, '0')}`;
    if (dto.decision === 'approve') {
      const formPath = `/customer/requests/${claim.shipmentId}/refund?claimId=${claimId}`;
      await this.notificationsService.createNotification(
        claim.customerId,
        `Yêu cầu bồi thường #${claimId} đã được phê duyệt — Vui lòng điền thông tin nhận tiền (${code})`,
        `Khoản bồi thường ${dto.approvedAmount?.toLocaleString('vi-VN')} VND cho ngựa "${claim.horseName}" đã được phê duyệt (Hồ sơ hoàn tiền #${result.refundRecordId}). Vui lòng truy cập trang chi tiết đơn hàng (${formPath}) để điền thông tin tài khoản ngân hàng nhận tiền bồi thường.`,
        'status_update',
        claim.shipmentId,
      );
      if (this.mailService && claim.customerEmail) {
        try {
          await this.mailService.sendNotificationEmail(
            claim.customerEmail,
            `[EquiTransit] Bồi thường bảo hiểm #${claimId} (${code}) đã duyệt — Điền thông tin nhận tiền`,
            `Xin chào ${claim.customerName || 'Quý khách'},<br/><br/>Yêu cầu bồi thường bảo hiểm #${claimId} cho ngựa <b>${claim.horseName || ''}</b> (đơn <b>${code}</b>) đã được phê duyệt với số tiền <b>${dto.approvedAmount?.toLocaleString('vi-VN')} VND</b>.<br/><br/>Vui lòng truy cập biểu mẫu nhận tiền bồi thường tại mục <b>Bảo hiểm & Khiếu nại</b> trên trang chi tiết đơn hàng (<code>${formPath}</code>) để cung cấp thông tin tài khoản ngân hàng thụ hưởng.<br/><br/>Trân trọng,<br/>EquiTransit Logistics`,
          );
        } catch {
          // Do not fail claim approval when SMTP is unavailable in dev/test
        }
      }
    } else if (dto.decision === 'reject') {
      await this.notificationsService.createNotification(
        claim.customerId,
        `Yêu cầu bồi thường #${claimId} bị từ chối (${code})`,
        `Yêu cầu bồi thường bảo hiểm cho ngựa "${claim.horseName}" đã bị từ chối (${dto.rejectionReasonCode}). Lý do: ${dto.reason}`,
        'status_update',
        claim.shipmentId,
      );
    }

    const events = await this.claimStore.findClaimEvents(claimId);
    return { claim: result.claim, events, refundRecordId: result.refundRecordId };
  }

  async getClaimRefundForm(user: AuthenticatedUser, claimId: number) {
    return this.claimStore.getClaimRefundFormInfo(claimId, Number(user.id), user.role);
  }

  async submitClaimRefundForm(user: AuthenticatedUser, claimId: number, dto: SubmitRefundFormDto) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Chỉ khách hàng chủ đơn mới có quyền nộp thông tin nhận tiền bồi thường.');
    }
    const result = await this.claimStore.submitClaimRefundForm(claimId, Number(user.id), dto);
    const code = `REQ-${String(result.shipmentId).padStart(3, '0')}`;
    const msg = `Khách hàng đã gửi thông tin tài khoản ngân hàng (${result.bankName} · ${result.accountNumber} · ${result.accountHolder}) để nhận bồi thường bảo hiểm #${claimId} (${result.amount.toLocaleString('vi-VN')} VND) cho đơn ${code}. Hồ sơ hoàn tiền #${result.refundId} sẵn sàng duyệt chi.`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách đã điền STK nhận bồi thường #${claimId} (${code})`,
      msg,
      'status_update',
      result.shipmentId,
    );
    return result;
  }
}
