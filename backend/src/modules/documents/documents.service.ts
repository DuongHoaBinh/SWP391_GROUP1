import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentsStore } from './documents.store';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { ApplyRegulationTemplateDto } from './dto/apply-regulation-template.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';
import { NotifyMissingDocumentsDto } from './dto/notify-missing.dto';
import {
  DocumentStatus,
  HorseComplianceItem,
  OrderComplianceChecklist,
  Regulation,
  RegulationTemplatePreset,
  TransportDocument,
} from './documents.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { REGULATION_PRESET_TEMPLATES } from './constants/regulation-presets.constant';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsStore: DocumentsStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * ĐIỀU KIỆN KÍCH HOẠT THANH TOÁN DUY NHẤT (Single Source of Truth):
   * Mọi chứng từ bắt buộc của đơn hàng đã được Specialist duyệt thành công (Flow 2 hoàn tất / Dossier Complete).
   */
  async isFlow2CompletedForPayment(orderId: number): Promise<boolean> {
    try {
      const systemUser: AuthenticatedUser = {
        id: '0',
        email: 'system@equitransit.local',
        role: UserRole.LOGISTICS_MANAGER,
      };
      const checklist = await this.getOrderComplianceChecklist(systemUser, orderId);
      return Boolean(checklist.isFullyCompliant);
    } catch {
      return false;
    }
  }

  private async checkAndNotifyManagerWhenFlow2Completed(horseId: number): Promise<void> {
    try {
      const shipmentIds = await this.documentsStore.findActiveShipmentIdsByHorseId(horseId);
      for (const orderId of shipmentIds) {
        const isComplete = await this.isFlow2CompletedForPayment(orderId);
        if (!isComplete) continue;

        const alreadyNotified = await this.documentsStore.hasDocumentsApprovedManagerNotifSent(orderId);
        if (alreadyNotified) continue;

        const code = `REQ-${String(orderId).padStart(3, '0')}`;
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `Đơn ${code} đã đủ hồ sơ, có thể gửi yêu cầu thanh toán`,
          `Toàn bộ chứng từ pháp lý và kiểm dịch (Flow 2) của đơn ${code} đã được Chuyên viên thẩm định phê duyệt 100% (Documents approved). Quý quản lý đã có thể gửi yêu cầu thanh toán QR cho khách hàng.`,
          'status_update',
          orderId,
        );
      }
    } catch (err) {
      console.warn('[DocumentsService] Warning notifying manager after Flow 2 completion:', err);
    }
  }

  // --- Regulations ---
  async getRegulations(countryFilter?: string): Promise<Regulation[]> {
    return this.documentsStore.findRegulations(countryFilter);
  }

  getPresetTemplates(): RegulationTemplatePreset[] {
    return REGULATION_PRESET_TEMPLATES;
  }

  async applyPresetTemplate(
    user: AuthenticatedUser,
    dto: ApplyRegulationTemplateDto,
  ): Promise<Regulation[]> {
    const preset = REGULATION_PRESET_TEMPLATES.find((p) => p.key === dto.templateKey);
    if (!preset) {
      throw new BadRequestException(`Không tìm thấy mẫu quy định có mã "${dto.templateKey}"`);
    }

    const effectiveDate = dto.effectiveDate || new Date().toISOString().split('T')[0];
    const country = dto.country.trim();

    for (const item of preset.items) {
      await this.documentsStore.upsertRegulation(
        country,
        item.documentType,
        item.description,
        effectiveDate,
      );
    }

    return this.documentsStore.findRegulations(country);
  }

  async deleteRegulation(
    user: AuthenticatedUser,
    id: number,
  ): Promise<{ success: boolean; message: string }> {
    const reg = await this.documentsStore.findRegulationById(id);
    if (!reg) {
      throw new NotFoundException(`Quy định mã #${id} không tồn tại`);
    }

    const linkedCount = await this.documentsStore.countDocumentsByRegulationId(id);
    if (linkedCount > 0) {
      throw new BadRequestException(
        `Không thể xóa quy định "${reg.description || reg.documentType}" vì đã có ${linkedCount} hồ sơ/chứng từ của khách hàng liên kết.`,
      );
    }

    await this.documentsStore.deleteRegulation(id);
    return { success: true, message: `Đã xóa quy định #${id} thành công` };
  }

  async createRegulation(user: AuthenticatedUser, dto: CreateRegulationDto): Promise<Regulation> {
    const id = await this.documentsStore.createRegulation(dto);
    const created = await this.documentsStore.findRegulationById(id);
    if (!created) {
      throw new NotFoundException('Không tìm thấy quy định sau khi tạo');
    }
    return created;
  }

  // --- Documents Upload & Retrieval ---
  async uploadDocument(
    user: AuthenticatedUser,
    dto: UploadDocumentDto,
    file?: Express.Multer.File,
  ): Promise<TransportDocument> {
    const regulation = await this.documentsStore.findRegulationById(dto.regulationId);
    if (!regulation) {
      throw new BadRequestException(`Quy định ID #${dto.regulationId} không tồn tại trong hệ thống`);
    }

    let finalUrl = dto.fileUrl;
    if (file) {
      finalUrl = `/uploads/documents/${file.filename}`;
    }

    if (!finalUrl || finalUrl.trim().length === 0) {
      throw new BadRequestException('Vui lòng chọn file từ máy tính hoặc cung cấp fileUrl');
    }

    const payload: UploadDocumentDto = {
      ...dto,
      fileUrl: finalUrl,
    };

    const documentId = await this.documentsStore.createDocument(Number(user.id), payload);
    const created = await this.documentsStore.findDocumentById(documentId);
    if (!created) {
      throw new NotFoundException('Không tìm thấy tài liệu sau khi tạo');
    }

    return created;
  }

  async getDocumentById(
    user: AuthenticatedUser,
    documentId: number,
  ): Promise<TransportDocument> {
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại`);
    }

    if (user.role === UserRole.CUSTOMER && doc.uploadedBy !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể xem tài liệu do tài khoản của mình tải lên');
    }

    return doc;
  }

  async getDocumentsByHorse(
    user: AuthenticatedUser,
    horseId: number,
  ): Promise<TransportDocument[]> {
    return this.documentsStore.findDocumentsByHorseId(horseId);
  }

  async getDocuments(
    user: AuthenticatedUser,
    status?: string,
    horseId?: number,
  ): Promise<TransportDocument[]> {
    const filter: { uploadedBy?: number; status?: string; horseId?: number } = {};
    if (user.role === UserRole.CUSTOMER) {
      filter.uploadedBy = Number(user.id);
    }
    if (status) {
      filter.status = status;
    }
    if (horseId) {
      filter.horseId = horseId;
    }
    return this.documentsStore.findDocuments(filter);
  }

  detectDestinationCountry(location: string): string {
    const dest = (location || '').toLowerCase();
    if (dest.includes('singapore')) return 'Singapore';
    if (dest.includes('malaysia') || dest.includes('kuala lumpur') || dest.includes('penang')) return 'Malaysia';
    if (dest.includes('vietnam') || dest.includes('việt nam') || dest.includes('hà nội') || dest.includes('hồ chí minh') || dest.includes('saigon') || dest.includes('đà nẵng')) return 'Vietnam';
    if (dest.includes('thailand') || dest.includes('thái lan') || dest.includes('bangkok')) return 'Thailand';
    if (dest.includes('hong kong') || dest.includes('hongkong') || dest.includes('hồng kông')) return 'Hong Kong';
    if (dest.includes('japan') || dest.includes('nhật bản') || dest.includes('tokyo') || dest.includes('osaka')) return 'Japan';
    if (dest.includes('uae') || dest.includes('dubai') || dest.includes('abu dhabi') || dest.includes('emirates')) return 'United Arab Emirates';
    if (dest.includes('qatar') || dest.includes('doha')) return 'Qatar';
    if (dest.includes('australia') || dest.includes('úc') || dest.includes('sydney') || dest.includes('melbourne')) return 'Australia';
    if (dest.includes('france') || dest.includes('pháp') || dest.includes('paris')) return 'France';
    if (dest.includes('germany') || dest.includes('đức') || dest.includes('berlin')) return 'Germany';
    if (dest.includes('united kingdom') || dest.includes('uk') || dest.includes('anh') || dest.includes('london')) return 'United Kingdom';
    if (dest.includes('usa') || dest.includes('united states') || dest.includes('mỹ') || dest.includes('hoa kỳ')) return 'United States';
    if (dest.includes('korea') || dest.includes('hàn quốc') || dest.includes('seoul')) return 'South Korea';
    if (dest.includes('cambodia') || dest.includes('campuchia') || dest.includes('phnom penh')) return 'Cambodia';
    if (dest.includes('laos') || dest.includes('lào') || dest.includes('vientiane')) return 'Laos';
    if (dest.includes('indonesia') || dest.includes('jakarta')) return 'Indonesia';
    if (dest.includes('philippines') || dest.includes('manila')) return 'Philippines';
    return location.trim() || 'Global Baseline';
  }

  private computeTripTargetDate(order?: {
    expected_arrival_date?: Date | string | null;
    departure_date?: Date | string | null;
    requested_date?: Date | string | null;
  }): string | null {
    const raw = order?.expected_arrival_date || order?.departure_date || order?.requested_date;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  private evaluateDocumentExpiry(
    expiryDate: string | null,
    tripTargetDate: string | null,
  ): { isExpiredForTrip: boolean; isExpiringSoonForTrip: boolean; expiryNotice?: string } {
    if (!expiryDate || !tripTargetDate) {
      return { isExpiredForTrip: false, isExpiringSoonForTrip: false };
    }
    if (expiryDate < tripTargetDate) {
      return {
        isExpiredForTrip: true,
        isExpiringSoonForTrip: false,
        expiryNotice: `Hết hạn vào ${expiryDate}, trước ngày đến dự kiến (${tripTargetDate})`,
      };
    }
    const diffDays = Math.floor(
      (new Date(expiryDate).getTime() - new Date(tripTargetDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays <= 3) {
      return {
        isExpiredForTrip: false,
        isExpiringSoonForTrip: true,
        expiryNotice: `Sắp hết hạn (${diffDays} ngày sau khi đến nơi)`,
      };
    }
    return { isExpiredForTrip: false, isExpiringSoonForTrip: false };
  }

  // --- Order Compliance Checklist ---
  async getOrderComplianceChecklist(
    user: AuthenticatedUser,
    orderId: number,
  ): Promise<OrderComplianceChecklist> {
    const order = await this.documentsStore.findOrderDetails(orderId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển mã #${orderId} không tồn tại`);
    }

    if (user.role === UserRole.CUSTOMER && order.customer_id !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể xem hồ sơ đơn hàng của chính mình');
    }

    // Xác định quốc gia đích thông minh từ destination_location
    const destinationCountry = this.detectDestinationCountry(order.destination_location);

    // Lấy tất cả các quy định bắt buộc cho quốc gia đích
    let applicableRegulations = await this.documentsStore.findRegulations(destinationCountry);
    let isUsingGlobalBaseline = false;
    let complianceNotice: string | undefined = undefined;

    // NẾU QUỐC GIA ĐÍCH CHƯA ĐƯỢC THIẾT LẬP QUY CHẾ RIÊNG:
    // Tự động kích hoạt Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI (Global Baseline)
    if (applicableRegulations.length === 0) {
      applicableRegulations = await this.documentsStore.findRegulations('Global Baseline');
      isUsingGlobalBaseline = true;
      complianceNotice = `Quốc gia đến "${destinationCountry}" hiện chưa có danh mục quy chế riêng. Hệ thống tự động áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI.`;
    }

    // Lấy danh sách ngựa trong đơn
    const horsesInOrder = await this.documentsStore.findHorsesInOrder(orderId);
    const tripTargetDate = this.computeTripTargetDate(order);

    const horseItems: HorseComplianceItem[] = [];
    let totalApprovedDocs = 0;
    let hasExpiredDocuments = false;

    for (const h of horsesInOrder) {
      const rawDocs = await this.documentsStore.findDocumentsByHorseId(h.horse_id);
      const docs = rawDocs.map((d) => {
        const expiryEval = this.evaluateDocumentExpiry(d.expiryDate, tripTargetDate);
        if (expiryEval.isExpiredForTrip) {
          hasExpiredDocuments = true;
        }
        return {
          ...d,
          ...expiryEval,
        };
      });

      // Tìm những quy định đã có tài liệu approved VÀ còn hạn đến ngày kết thúc chuyến đi
      const approvedRegIds = new Set(
        docs
          .filter((d) => d.status === DocumentStatus.APPROVED && !d.isExpiredForTrip)
          .map((d) => d.regulationId),
      );

      // Tìm những quy định đã có bất kỳ tài liệu nào được nộp (approved, submitted hoặc rejected)
      const uploadedRegIds = new Set(
        docs.filter((d) => d.regulationId).map((d) => d.regulationId),
      );

      totalApprovedDocs += approvedRegIds.size;

      // Danh sách quy định thực sự CHƯA TỪNG ĐƯỢC TẢI LÊN lần nào
      const missingRegs = applicableRegulations.filter((reg) => !uploadedRegIds.has(reg.id));

      // Một con ngựa CHỈ ĐẠT CHUẨN (isCompliant) khi TẤT CẢ các quy định đều ĐÃ ĐƯỢC PHÊ DUYỆT (DocumentStatus.APPROVED)
      const isCompliant =
        applicableRegulations.length > 0 &&
        applicableRegulations.every((reg) => approvedRegIds.has(reg.id));

      horseItems.push({
        horseId: h.horse_id,
        horseName: h.name,
        microchipNo: h.microchip_no ?? null,
        passportNo: h.passport_no ?? null,
        documents: docs,
        missingRegulations: missingRegs,
        isCompliant,
      });
    }

    const totalRequiredDocs = applicableRegulations.length * horsesInOrder.length;
    const compliantHorsesCount = horseItems.filter((item) => item.isCompliant).length;

    const isFullyCompliant =
      horsesInOrder.length > 0 &&
      totalRequiredDocs > 0 &&
      totalApprovedDocs >= totalRequiredDocs &&
      compliantHorsesCount === horsesInOrder.length;

    const requirementsSent = await this.documentsStore.hasRequirementsSent(orderId, order.customer_id);

    return {
      orderId,
      destinationLocation: order.destination_location,
      destinationCountry,
      totalHorses: horsesInOrder.length,
      compliantHorsesCount,
      totalRequiredDocuments: totalRequiredDocs,
      approvedDocumentsCount: totalApprovedDocs,
      isFullyCompliant,
      isUsingGlobalBaseline,
      complianceNotice,
      requirementsSent,
      tripTargetDate,
      hasExpiredDocuments,
      horses: horseItems,
    };
  }

  // --- Orders Awaiting Compliance Setup (Flow 1 -> Flow 2 Handover) ---
  async getOrdersAwaitingCompliance(user: AuthenticatedUser): Promise<any[]> {
    const shipments = await this.documentsStore.findApprovedShipmentsForSpecialist();
    const result = [];

    for (const s of shipments) {
      try {
        const checklist = await this.getOrderComplianceChecklist(user, s.orderId);
        result.push({
          ...s,
          destinationCountry: checklist.destinationCountry,
          totalRequiredDocs: checklist.totalRequiredDocuments,
          approvedDocsCount: checklist.approvedDocumentsCount,
          isFullyCompliant: checklist.isFullyCompliant,
          isUsingGlobalBaseline: checklist.isUsingGlobalBaseline,
          complianceNotice: checklist.complianceNotice,
        });
      } catch (err) {
        result.push({
          ...s,
          destinationCountry: this.detectDestinationCountry(s.destinationLocation),
          totalRequiredDocs: 0,
          approvedDocsCount: 0,
          isFullyCompliant: false,
        });
      }
    }

    return result;
  }

  async sendComplianceRequirements(
    user: AuthenticatedUser,
    orderId: number,
    dto?: { customNotes?: string },
  ): Promise<{ success: boolean; message: string; checklist: OrderComplianceChecklist }> {
    const order = await this.documentsStore.findOrderDetails(orderId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${orderId} không tồn tại`);
    }

    const checklist = await this.getOrderComplianceChecklist(user, orderId);
    const destinationCountry = checklist.destinationCountry;

    const reqTitles = new Set<string>();
    for (const h of checklist.horses) {
      for (const m of h.missingRegulations) {
        reqTitles.add(m.description || m.documentType);
      }
    }
    const docListText = Array.from(reqTitles).slice(0, 4).join(', ');

    const code = order.request_code || `REQ-${String(orderId).padStart(3, '0')}`;
    const customText = dto?.customNotes?.trim() ? `\nLưu ý từ chuyên viên: "${dto.customNotes.trim()}"` : '';

    await this.notificationsService.createNotification(
      order.customer_id,
      `Yêu cầu nộp hồ sơ kiểm dịch & hải quan - Đơn ${code}`,
      `Chuyên viên kiểm dịch đã thiết lập danh mục hồ sơ bắt buộc cho chuyến đi đến "${destinationCountry}". Vui lòng kiểm tra và tải lên các chứng từ: [${docListText || 'Hộ chiếu FEI, Giấy kiểm dịch, Tiêm phòng'}].${customText}`,
      'document_missing',
      orderId,
    );

    return {
      success: true,
      message: `Đã gửi thông báo yêu cầu hồ sơ kiểm dịch cho khách hàng thành công!`,
      checklist,
    };
  }

  // --- Document Review by Transport Specialist ---
  async reviewDocument(
    specialist: AuthenticatedUser,
    documentId: number,
    dto: ReviewDocumentDto,
  ): Promise<TransportDocument> {
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại`);
    }

    if (dto.status === DocumentStatus.REJECTED && (!dto.notes || dto.notes.trim().length === 0)) {
      throw new BadRequestException('Khi từ chối tài liệu, bắt buộc phải có lý do cụ thể');
    }

    if (dto.status === DocumentStatus.APPROVED && dto.expiryDate) {
      const activeShipmentIds = await this.documentsStore.findActiveShipmentIdsByHorseId(doc.horseId);
      for (const sid of activeShipmentIds) {
        const orderDetails = await this.documentsStore.findOrderDetails(sid);
        const tripTargetDate = this.computeTripTargetDate(orderDetails);
        if (tripTargetDate && dto.expiryDate < tripTargetDate) {
          throw new BadRequestException(
            `Tài liệu hết hạn vào ngày ${dto.expiryDate}, trước ngày dự kiến hoàn thành chuyến đi (${tripTargetDate}). Không thể phê duyệt; vui lòng từ chối để khách hàng bổ sung giấy tờ mới.`,
          );
        }
      }
    }

    await this.documentsStore.updateDocumentReview(
      documentId,
      dto.status,
      dto.notes,
      dto.expiryDate,
      dto.docNumber,
    );

    const statusText =
      dto.status === DocumentStatus.APPROVED
        ? 'đã được phê duyệt hợp lệ'
        : dto.status === DocumentStatus.REJECTED
          ? `bị từ chối. Lý do: "${dto.notes}"`
          : 'được đánh dấu là đã hết hạn';

    const docTitleMap: Record<string, string> = {
      health_certificate: 'Giấy chứng nhận kiểm dịch',
      horse_passport: 'Hộ chiếu ngựa FEI',
      import_permit: 'Giấy phép nhập khẩu',
      export_permit: 'Giấy phép xuất khẩu',
      customs_declaration: 'Tờ khai hải quan',
    };
    const friendlyDocTitle = doc.regulationTitle || docTitleMap[doc.docType] || doc.docType;
    const orderText = doc.requestCode ? ` (Đơn ${doc.requestCode})` : '';

    await this.notificationsService.createNotification(
      doc.uploadedBy,
      'Cập nhật trạng thái thẩm định tài liệu kiểm dịch',
      `Tài liệu "${friendlyDocTitle}" của ngựa "${doc.horseName ?? 'ngựa'}"${orderText} ${statusText} bởi Chuyên viên Transport Specialist.`,
      'status_update',
    );

    if (dto.status === DocumentStatus.APPROVED) {
      await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);
    }

    const updated = await this.documentsStore.findDocumentById(documentId);
    return updated!;
  }

  // --- Authority Approval Tracking ---
  async recordAuthorityApproval(
    specialist: AuthenticatedUser,
    documentId: number,
    dto: RecordAuthorityApprovalDto,
  ): Promise<TransportDocument> {
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại`);
    }

    await this.documentsStore.createAuthorityApproval(
      documentId,
      Number(specialist.id),
      dto,
    );

    if (dto.status === 'approved' && doc.status !== DocumentStatus.APPROVED) {
      await this.documentsStore.updateDocumentReview(
        documentId,
        DocumentStatus.APPROVED,
        `Phê duyệt bởi cơ quan: ${dto.authorityName}. ${dto.notes ?? ''}`.trim(),
        undefined,
        dto.referenceNumber,
      );
      await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);
    }

    const docTitleMap: Record<string, string> = {
      health_certificate: 'Giấy chứng nhận kiểm dịch',
      horse_passport: 'Hộ chiếu ngựa FEI',
      import_permit: 'Giấy phép nhập khẩu',
      export_permit: 'Giấy phép xuất khẩu',
      customs_declaration: 'Tờ khai hải quan',
    };
    const friendlyDocTitle = doc.regulationTitle || docTitleMap[doc.docType] || doc.docType;
    const docCode = `DOC-${String(documentId).padStart(3, '0')}`;

    await this.notificationsService.createNotification(
      doc.uploadedBy,
      'Cập nhật kết quả phê duyệt từ cơ quan chức năng',
      `Tài liệu "${friendlyDocTitle}" (Mã: ${docCode}) của ngựa "${doc.horseName ?? 'ngựa'}" đã có kết quả từ ${dto.authorityName}: ${dto.status.toUpperCase()}.`,
      'status_update',
    );

    const updated = await this.documentsStore.findDocumentById(documentId);
    return updated!;
  }

  // --- Notify Customer about Missing Documents ---
  async notifyMissingDocuments(
    specialist: AuthenticatedUser,
    orderId: number,
    dto: NotifyMissingDocumentsDto,
  ): Promise<{ success: boolean; message: string; missingCount: number }> {
    const order = await this.documentsStore.findOrderDetails(orderId);
    if (!order) {
      throw new NotFoundException(`Đơn vận chuyển #${orderId} không tồn tại`);
    }

    const checklist = await this.getOrderComplianceChecklist(specialist, orderId);

    if (checklist.isFullyCompliant) {
      return {
        success: true,
        message: 'Tất cả các tài liệu của đơn hàng đã đầy đủ và hợp lệ, không cần gửi nhắc nhở.',
        missingCount: 0,
      };
    }

    const missingItemsText = checklist.horses
      .map((h) => {
        const unsubmittedNames = h.missingRegulations.map((r) => r.documentType);
        const rejectedNames = h.documents
          .filter((d) => d.status === DocumentStatus.REJECTED)
          .map((d) => `${d.regulationDocType || d.docType} (bị từ chối)`);
        const allItems = [...unsubmittedNames, ...rejectedNames];
        return allItems.length > 0
          ? `• Ngựa ${h.horseName}: thiếu hoặc cần nộp lại [${allItems.join(', ')}]`
          : '';
      })
      .filter(Boolean)
      .join('\n');

    const customMsg = dto.customMessage ? `\nLời nhắn từ chuyên viên: "${dto.customMessage}"` : '';

    const code = order.request_code || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customer_id,
      `Yêu cầu bổ sung hồ sơ pháp lý / kiểm dịch - Đơn ${code}`,
      `Đơn vận chuyển mã ${code} đến "${checklist.destinationCountry}" hiện chưa đủ điều kiện xuất phát do còn thiếu các chứng từ bắt buộc:\n${missingItemsText}${customMsg}\nVui lòng tải lên các tài liệu này sớm nhất có thể.`,
      'document_missing',
      orderId,
    );

    return {
      success: true,
      message: `Đã gửi thông báo nhắc nhở bổ sung hồ sơ tới khách hàng cho đơn ${code}.`,
      missingCount: checklist.totalRequiredDocuments - checklist.approvedDocumentsCount,
    };
  }

  async reuploadDocument(
    user: AuthenticatedUser,
    documentId: number,
    file?: Express.Multer.File,
    dto?: { fileUrl?: string; docNumber?: string; notes?: string },
  ): Promise<TransportDocument> {
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại`);
    }

    if (user.role === UserRole.CUSTOMER && doc.uploadedBy !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể cập nhật tài liệu do chính mình tải lên');
    }

    let finalUrl = dto?.fileUrl || doc.fileUrl;
    if (file) {
      finalUrl = `/uploads/documents/${file.filename}`;
    }

    if (!finalUrl || finalUrl.trim().length === 0) {
      throw new BadRequestException('Vui lòng chọn file mới từ máy tính để cập nhật');
    }

    await this.documentsStore.updateDocumentFile(
      documentId,
      finalUrl,
      dto?.docNumber,
      dto?.notes ? `[Cập nhật lại]: ${dto.notes}` : null,
    );

    const updated = await this.documentsStore.findDocumentById(documentId);
    return updated!;
  }

  async deleteDocument(
    user: AuthenticatedUser,
    documentId: number,
  ): Promise<{ success: boolean; message: string }> {
    const isAdminOrSpecialist =
      user.role === UserRole.ADMIN || user.role === UserRole.TRANSPORT_SPECIALIST;
    const deleted = await this.documentsStore.deleteDocument(
      documentId,
      Number(user.id),
      isAdminOrSpecialist,
    );
    if (!deleted) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại hoặc bạn không có quyền xóa`);
    }
    return { success: true, message: `Tài liệu #${documentId} đã được xóa thành công` };
  }
}
