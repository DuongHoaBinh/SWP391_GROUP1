import {
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
  AssessIncidentDto,
  CreateChangeRequestDto,
  CreateIncidentDto,
  ResolveIncidentDto,
  ReviewChangeRequestDto,
} from './dto/incidents.dto';
import { IncidentsStore } from './incidents.store';
import { ChangeRequestRecord, IncidentRecord } from './incidents.types';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly incidentsStore: IncidentsStore,
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

  private sanitizeForCustomer(inc: IncidentRecord): IncidentRecord {
    return {
      ...inc,
      immediateActions: null,
      resolutionNotes: inc.resolutionNotes,
      resolvedBy: null,
      changeRequests: (inc.changeRequests || []).map((cr) => ({
        ...cr,
        estimatedExtraCost: cr.costAllocation === 'customer_addendum' ? cr.estimatedExtraCost : 0,
        decisionNotes: null,
      })),
    };
  }

  async listIncidents(
    user: AuthenticatedUser,
    query: { shipmentId?: number; status?: string },
  ): Promise<IncidentRecord[]> {
    if (user.role === UserRole.CUSTOMER) {
      const rows = await this.incidentsStore.findIncidents({
        shipmentId: query.shipmentId,
        status: query.status,
        customerId: Number(user.id),
      });
      return rows.map((r) => this.sanitizeForCustomer(r));
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      return this.incidentsStore.findIncidents({
        shipmentId: query.shipmentId,
        status: query.status,
        driverUserId: Number(user.id),
      });
    }
    return this.incidentsStore.findIncidents({
      shipmentId: query.shipmentId,
      status: query.status,
    });
  }

  async getIncidentById(user: AuthenticatedUser, incidentId: number): Promise<IncidentRecord> {
    const inc = await this.incidentsStore.findIncidentById(incidentId);
    if (!inc) throw new NotFoundException(`Không tìm thấy sự cố #${incidentId}`);

    if (user.role === UserRole.CUSTOMER) {
      if (inc.customerId !== Number(user.id)) {
        throw new ForbiddenException('Bạn chỉ được xem sự cố thuộc đơn hàng của chính mình.');
      }
      const { customerId: _cid, ...clean } = inc;
      return this.sanitizeForCustomer(clean);
    }

    if (user.role === UserRole.DRIVER_ESCORT) {
      const assigned = await this.incidentsStore.isDriverAssigned(inc.shipmentId, Number(user.id));
      if (!assigned) {
        throw new ForbiddenException('Bạn chỉ được xem sự cố của chuyến đi được phân công.');
      }
    }

    const { customerId: _cid, ...record } = inc;
    return record;
  }

  async createIncident(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateIncidentDto,
    files: Express.Multer.File[] = [],
  ): Promise<IncidentRecord> {
    try {
      for (const file of files) {
        verifyUploadedFileMagicBytes(file, 'document');
      }
      for (const u of dto.evidenceUrls || []) {
        assertSafeExternalOrUploadUrl(u);
      }

      const shipment = await this.incidentsStore.findShipmentSummary(shipmentId);
      if (!shipment) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);

      if (user.role === UserRole.DRIVER_ESCORT) {
        const assigned = await this.incidentsStore.isDriverAssigned(shipmentId, Number(user.id));
        if (!assigned) {
          throw new ForbiddenException('Bạn chỉ được báo cáo sự cố cho chuyến đi được phân công cho mình.');
        }
      }

      const fileUrls = files.map((f) => `/api/incidents/attachments/${f.filename}`);
      const mergedEvidence = [...fileUrls, ...(dto.evidenceUrls || [])].slice(0, 10);

      const created = await this.incidentsStore.createIncident({
        shipmentId,
        reportedBy: Number(user.id),
        incidentType: dto.incidentType,
        description: dto.description.trim(),
        severity: dto.severity || 'high',
        locationText: dto.locationText?.trim() || null,
        affectedBorderGate: dto.affectedBorderGate?.trim() || null,
        evidenceUrls: mergedEvidence,
      });

      const title = `🚨 Sự cố #${created.id} (${created.requestCode})`;
      const msg = `[${dto.incidentType} / ${created.severity}] ${dto.description.trim()}`;
      await this.notificationsService.notifyRole('Logistics Manager', title, msg, 'incident', shipmentId);

      return created;
    } catch (err) {
      this.cleanupFiles(files);
      throw err;
    }
  }

  async assessIncident(incidentId: number, dto: AssessIncidentDto): Promise<IncidentRecord> {
    return this.incidentsStore.assessIncident(incidentId, dto.immediateActions.trim(), dto.severity);
  }

  async listChangeRequests(query: { incidentId?: number; shipmentId?: number; status?: string }) {
    return this.incidentsStore.findChangeRequests(query);
  }

  async createChangeRequest(
    user: AuthenticatedUser,
    incidentId: number,
    dto: CreateChangeRequestDto,
  ): Promise<ChangeRequestRecord> {
    const inc = await this.incidentsStore.findIncidentById(incidentId);
    if (!inc) throw new NotFoundException(`Không tìm thấy sự cố #${incidentId}`);

    const shipment = await this.incidentsStore.findShipmentSummary(inc.shipmentId);
    if (!shipment) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${inc.shipmentId}`);

    const allocation = dto.costAllocation ?? 'none';
    if (allocation === 'emergency_vet_covered' && !shipment.hasEmergencyVetCoverage) {
      throw new UnprocessableEntityException(
        'Không thể hạch toán emergency_vet_covered vì chuyến đi không có ngựa sử dụng gói bảo hiểm Premium.',
      );
    }

    const created = await this.incidentsStore.createChangeRequest({
      shipmentId: inc.shipmentId,
      incidentId,
      requestedBy: Number(user.id),
      changeType: dto.changeType,
      oldValue: dto.oldValue?.trim() || null,
      newValue: dto.newValue?.trim() || null,
      reason: dto.reason.trim(),
      estimatedExtraCost: Number(dto.estimatedExtraCost || 0),
      costAllocation: allocation,
      crossesNewBorder: Boolean(dto.crossesNewBorder),
    });

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Đề xuất thay đổi #${created.id} (${created.requestCode})`,
      `Coordinator đề xuất [${dto.changeType}]: ${dto.reason.trim()} (Chi phí dự kiến: ${created.estimatedExtraCost.toLocaleString('vi-VN')} VND, phân bổ: ${allocation}).`,
      'incident',
      inc.shipmentId,
    );

    return created;
  }

  async reviewChangeRequest(
    user: AuthenticatedUser,
    changeId: number,
    dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestRecord> {
    const { record } = await this.incidentsStore.reviewChangeRequest(
      changeId,
      Number(user.id),
      dto.decision,
      dto.decisionNotes?.trim(),
    );

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Manager đã ${dto.decision === 'approved' ? 'PHÊ DUYỆT' : 'TỪ CHỐI'} đề xuất #${record.id} (${record.requestCode})`,
      `Quyết định: ${dto.decision}. ${dto.decisionNotes || ''}`.trim(),
      'status_update',
      record.shipmentId,
    );

    return record;
  }

  async publishChangeRequest(
    user: AuthenticatedUser,
    changeId: number,
  ): Promise<ChangeRequestRecord> {
    const { record, affectedBorderGate, affectedCustomers } =
      await this.incidentsStore.publishChangeRequest(changeId, Number(user.id));

    // Flow 5 Invariant 1: yêu cầu rà soát lại hồ sơ Flow 2 khi lộ trình mới đi qua cửa khẩu mới
    if (record.crossesNewBorder) {
      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `⚠️ Cảnh báo rà soát cửa khẩu mới (${record.requestCode})`,
        `Phương án thay đổi #${record.id} đã xuất bản làm thay đổi cửa khẩu/quốc gia quá cảnh${affectedBorderGate ? ` (${affectedBorderGate})` : ''}. Vui lòng kiểm tra lại bộ quy chuẩn kiểm dịch Flow 2.`,
        'document_missing',
        record.shipmentId,
      );
    }

    // Flow 5 Invariant 3: Shared Trip Ripple Effect with strict per-customer isolation (no cross-customer data leakage)
    for (const target of affectedCustomers) {
      await this.notificationsService.createNotification(
        target.customerId,
        `Cập nhật điều chỉnh hành trình (${target.requestCode})`,
        `Chuyến vận chuyển cho đơn ${target.requestCode} đã cập nhật phương án điều chỉnh vận hành (${record.changeType}): ${record.newValue || record.reason}.`,
        'status_update',
        target.shipmentId,
      );
    }

    return record;
  }

  async resolveIncident(
    user: AuthenticatedUser,
    incidentId: number,
    dto: ResolveIncidentDto,
  ): Promise<IncidentRecord> {
    return this.incidentsStore.resolveIncident(
      incidentId,
      Number(user.id),
      dto.resolutionNotes.trim(),
      Boolean(dto.close),
    );
  }

  async getAuthorizedAttachmentPath(
    user: AuthenticatedUser,
    filename: string,
  ): Promise<{ absolutePath: string; fileName: string }> {
    const safeName = basename(filename);
    const allowed = await this.incidentsStore.isIncidentAttachmentAccessibleToUser(
      safeName,
      Number(user.id),
      String(user.role),
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền truy cập tệp bằng chứng sự cố này.');
    }
    const absolutePath = join(process.cwd(), 'uploads', 'incidents', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp bằng chứng sự cố trên máy chủ.');
    }
    return { absolutePath, fileName: safeName };
  }
}
