import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
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
  CreateHandoverDto,
  ResolveHandoverDisputeDto,
  RespondHandoverDto,
} from './dto/handover.dto';
import { DeliveryHandoverRecord, HandoverStore } from './handover.store';

@Injectable()
export class HandoverService {
  constructor(
    private readonly handoverStore: HandoverStore,
    private readonly notificationsService: NotificationsService,
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

  async getHandoversByShipment(user: AuthenticatedUser, shipmentId: number): Promise<DeliveryHandoverRecord[]> {
    const order = await this.handoverStore.findShipmentOwner(shipmentId);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem biên bản bàn giao của đơn hàng thuộc tài khoản mình.');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      const assigned = await this.handoverStore.isDriverAssigned(shipmentId, Number(user.id));
      if (!assigned) {
        throw new ForbiddenException('Bạn chỉ được xem biên bản bàn giao của chuyến đi được phân công.');
      }
    }
    return this.handoverStore.findHandoversByShipment(shipmentId);
  }

  async listAllHandovers(status?: string): Promise<DeliveryHandoverRecord[]> {
    return this.handoverStore.findAllHandovers(status);
  }

  async createHandover(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateHandoverDto,
    files: Express.Multer.File[] = [],
  ): Promise<DeliveryHandoverRecord> {
    try {
      for (const file of files) {
        verifyUploadedFileMagicBytes(file, 'document');
      }
      for (const u of dto.evidenceUrls || []) {
        assertSafeExternalOrUploadUrl(u);
      }

      if (user.role === UserRole.DRIVER_ESCORT) {
        const assigned = await this.handoverStore.isDriverAssigned(shipmentId, Number(user.id));
        if (!assigned) {
          throw new ForbiddenException('Bạn chỉ được tạo biên bản bàn giao cho chuyến đi được phân công cho mình.');
        }
      }

      const target = await this.handoverStore.findShipmentAndHorse(shipmentId, dto.shipmentHorseId);
      if (!target) {
        throw new NotFoundException(`Không tìm thấy cá thể ngựa #${dto.shipmentHorseId} trong đơn #${shipmentId}`);
      }
      if (!['in_transit', 'completed'].includes(target.shipmentStatus)) {
        throw new ConflictException(
          `Chuyến đi đang ở trạng thái "${target.shipmentStatus}". Chỉ tạo biên bản bàn giao khi đang vận chuyển hoặc đã đến đích.`,
        );
      }

      const dt = dto.handoverDatetime ? new Date(dto.handoverDatetime) : new Date();
      if (!Number.isFinite(dt.getTime())) {
        throw new BadRequestException('Thời điểm handoverDatetime không hợp lệ.');
      }

      const fileUrls = files.map((f) => `/api/tracking/handovers/attachments/${f.filename}`);
      const mergedEvidence = [...fileUrls, ...(dto.evidenceUrls || [])].slice(0, 10);

      const created = await this.handoverStore.createHandover({
        shipmentId,
        shipmentHorseId: dto.shipmentHorseId,
        handedOverBy: Number(user.id),
        receivedByName: dto.receivedByName.trim(),
        handoverLocation: dto.handoverLocation?.trim() || target.destinationLocation,
        handoverDatetime: dt,
        deliveredQuantity: dto.deliveredQuantity ?? 1,
        horseConditionAtHandover: dto.horseConditionAtHandover ?? 'healthy',
        identityVerified: dto.identityVerified ?? true,
        documentsHandedOver: dto.documentsHandedOver ?? true,
        notes: dto.notes?.trim() || null,
        evidenceUrls: mergedEvidence,
      });

      await this.notificationsService.createNotification(
        target.customerId,
        `Biên bản bàn giao chờ ký (${created.requestCode})`,
        `Tài xế/Hộ tống đã lập biên bản bàn giao cá thể ngựa "${created.horseName}" cho người nhận "${created.receivedByName}". Vui lòng kiểm tra và ký xác nhận.`,
        'handover_complete',
        shipmentId,
        target.horseId,
      );

      return created;
    } catch (err) {
      this.cleanupFiles(files);
      throw err;
    }
  }

  async respondHandover(
    user: AuthenticatedUser,
    handoverId: number,
    dto: RespondHandoverDto,
    files: Express.Multer.File[] = [],
  ): Promise<DeliveryHandoverRecord> {
    try {
      for (const file of files) {
        verifyUploadedFileMagicBytes(file, 'document');
      }
      for (const u of dto.evidenceUrls || []) {
        assertSafeExternalOrUploadUrl(u);
      }

      const existing = await this.handoverStore.findHandoverWithOwner(handoverId);
      if (!existing) throw new NotFoundException(`Không tìm thấy biên bản bàn giao #${handoverId}`);
      if (user.role === UserRole.CUSTOMER && existing.customerId !== Number(user.id)) {
        throw new ForbiddenException('Bạn chỉ được xác nhận/tranh chấp biên bản bàn giao của đơn hàng thuộc tài khoản mình.');
      }

      const fileUrls = files.map((f) => `/api/tracking/handovers/attachments/${f.filename}`);
      const newEvidence = [...fileUrls, ...(dto.evidenceUrls || [])];

      if (dto.action === 'dispute') {
        if (!dto.disputeReason || !dto.disputeReason.trim()) {
          throw new BadRequestException('Bắt buộc nhập lý do ngoại lệ (disputeReason) khi khiếu nại bàn giao.');
        }
        if (newEvidence.length === 0) {
          throw new BadRequestException(
            'Khi chọn tranh chấp bàn giao (disputed), bắt buộc phải đính kèm tối thiểu 1 tệp bằng chứng (ảnh/biên bản).',
          );
        }
      }

      const updated = await this.handoverStore.respondHandover(handoverId, Number(user.id), {
        action: dto.action,
        horseConditionAtHandover: dto.horseConditionAtHandover,
        identityVerified: dto.identityVerified,
        documentsHandedOver: dto.documentsHandedOver,
        disputeReason: dto.disputeReason?.trim() || null,
        notes: dto.notes?.trim() || null,
        newEvidenceUrls: newEvidence,
      });

      if (dto.action === 'dispute') {
        await Promise.allSettled([
          this.notificationsService.notifyRole(
            'Logistics Manager',
            `⚠️ Tranh chấp bàn giao #${updated.id} (${updated.requestCode})`,
            `Khách hàng mở tranh chấp bàn giao ngựa "${updated.horseName}": ${updated.disputeReason}. Trần bảo hiểm tối đa: ${updated.maxCompensation.toLocaleString('vi-VN')} VND.`,
            'incident',
            updated.shipmentId,
          ),
          this.notificationsService.notifyRole(
            'Fleet & Route Coordinator',
            `⚠️ Tranh chấp bàn giao #${updated.id} (${updated.requestCode})`,
            `Ngựa "${updated.horseName}" bị đánh dấu disputed khi bàn giao.`,
            'incident',
            updated.shipmentId,
          ),
        ]);
      } else {
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `Hoàn tất ký nhận bàn giao (${updated.requestCode})`,
          `Khách hàng đã xác nhận bàn giao an toàn cá thể ngựa "${updated.horseName}".`,
          'handover_complete',
          updated.shipmentId,
        );
      }

      return updated;
    } catch (err) {
      this.cleanupFiles(files);
      throw err;
    }
  }

  async resolveDispute(
    user: AuthenticatedUser,
    handoverId: number,
    dto: ResolveHandoverDisputeDto,
  ): Promise<DeliveryHandoverRecord> {
    const existing = await this.handoverStore.findHandoverWithOwner(handoverId);
    if (!existing) throw new NotFoundException(`Không tìm thấy biên bản bàn giao #${handoverId}`);

    const compensation = Number(dto.compensationAmount || 0);
    if (compensation > existing.maxCompensation) {
      throw new UnprocessableEntityException(
        `Số tiền bồi thường (${compensation.toLocaleString('vi-VN')} VND) vượt trần bảo hiểm tối đa (${existing.maxCompensation.toLocaleString('vi-VN')} VND) của cá thể ngựa này.`,
      );
    }

    const resolved = await this.handoverStore.resolveDispute(
      handoverId,
      Number(user.id),
      dto.resolutionNotes.trim(),
      compensation,
    );

    await this.notificationsService.createNotification(
      existing.customerId,
      `Đã giải quyết tranh chấp bàn giao (${resolved.requestCode})`,
      `Logistics Manager đã chốt phương án xử lý tranh chấp ngựa "${resolved.horseName}" (Bồi thường: ${resolved.compensationAmount.toLocaleString('vi-VN')} VND). ${resolved.resolutionNotes}`,
      'handover_complete',
      resolved.shipmentId,
      resolved.horseId,
    );

    return resolved;
  }

  async getAuthorizedAttachmentPath(
    user: AuthenticatedUser,
    filename: string,
  ): Promise<{ absolutePath: string; fileName: string }> {
    const safeName = basename(filename);
    const allowed = await this.handoverStore.isAttachmentAccessibleToUser(
      safeName,
      Number(user.id),
      String(user.role),
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền truy cập bằng chứng bàn giao này.');
    }
    const absolutePath = join(process.cwd(), 'uploads', 'handovers', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp bằng chứng bàn giao trên máy chủ.');
    }
    return { absolutePath, fileName: safeName };
  }
}
