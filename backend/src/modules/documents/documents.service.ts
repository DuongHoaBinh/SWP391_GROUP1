import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { basename, join } from 'path';
import { DocumentsStore } from './documents.store';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { UpdateRegulationDto } from './dto/update-regulation.dto';
import { ApplyRegulationTemplateDto } from './dto/apply-regulation-template.dto';
import {
  assertSafeExternalOrUploadUrl,
  verifyUploadedFileMagicBytes,
} from '../../common/utils/upload-validation';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';
import { NotifyMissingDocumentsDto } from './dto/notify-missing.dto';
import {
  AuthorityApprovalStatus,
  DocumentStatus,
  HorseComplianceItem,
  OrderComplianceChecklist,
  Regulation,
  RegulationTemplatePreset,
  TransportDocument,
  DocumentTypeDefinition,
} from './documents.types';
import { UploadHorseDocumentDto } from './dto/upload-horse-document.dto';
import {
  computeDefaultExpiryDate,
  computeDocumentValidity,
  isExpiryBeforeIssue,
} from './document-validity.policy';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { REGULATION_PRESET_TEMPLATES } from './constants/regulation-presets.constant';
import { ShipmentLifecycle } from '../../common/shipment-lifecycle';

@Injectable()
export class DocumentsService {
  private static readonly INTERNATIONAL_ONLY_DOC_TYPES = new Set([
    'import_permit',
    'export_permit',
    'customs_declaration',
    'export_certificate',
    'import_certificate',
  ]);

  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documentsStore: DocumentsStore,
    private readonly notificationsService: NotificationsService,
    private readonly lifecycle: ShipmentLifecycle,
  ) {}

  /**
   * Compliance is a departure prerequisite. Payment unlocks separately after Flow 3 confirmation.
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
        await this.lifecycle.changed(orderId);
        const orderDetails = await this.documentsStore.findOrderDetails(orderId);
        const isComplete = await this.isFlow2CompletedForPayment(orderId);

        if (orderDetails?.status === 'in_transit' || orderDetails?.status === 'return_pending') {
          if (!isComplete) {
            await this.flagInTransitComplianceAlert(orderId);
          } else if (orderDetails.in_transit_compliance_alert && typeof this.documentsStore.setInTransitComplianceAlert === 'function') {
            await this.documentsStore.setInTransitComplianceAlert(orderId, false);
          }
          continue;
        }

        if (!isComplete) continue;

        const alreadyNotified = await this.documentsStore.hasDocumentsApprovedManagerNotifSent(orderId);
        if (alreadyNotified) continue;

        const code = `REQ-${String(orderId).padStart(3, '0')}`;
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `Đơn ${code} đã đủ hồ sơ kiểm dịch`,
          `Hồ sơ pháp lý và kiểm dịch của đơn ${code} đã được phê duyệt 100%. Thanh toán chỉ mở khi lộ trình Flow 3 được xác nhận; chuyến đi chỉ được xuất phát khi cả ba điều kiện hoàn tất.`,
          'status_update',
          orderId,
        );
      }
    } catch (err) {
      this.logger.warn('Warning notifying manager after Flow 2 completion', err as Error);
    }
  }

  async flagInTransitComplianceAlert(orderId: number, reason?: string): Promise<void> {
    if (typeof this.documentsStore.setInTransitComplianceAlert === 'function') {
      await this.documentsStore.setInTransitComplianceAlert(orderId, true);
    }
    const code = `REQ-${String(orderId).padStart(3, '0')}`;
    const title = `🚨 CẢNH BÁO ĐỎ HỒ SƠ ĐANG VẬN CHUYỂN (${code})`;
    const message =
      reason ||
      `Đơn ${code} đang in_transit nhưng phát sinh hồ sơ hết hạn hoặc không đạt chuẩn (BR-F2-06). Thao tác thông quan customs_cleared đã bị khóa cho đến khi gia hạn hoặc mở sự cố biên giới (Flow 5).`;
    await this.notificationsService.notifyRole('Logistics Manager', title, message, 'incident', orderId);
  }

  // --- Regulations ---
  async getRegulations(
    countryOrFilter?:
      | string
      | { country?: string; borderGate?: string; transportMode?: string; docTier?: string },
  ): Promise<Regulation[]> {
    return this.documentsStore.findRegulations(countryOrFilter);
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
        {
          borderGate: item.borderGate ?? null,
          transportMode: item.transportMode ?? 'both',
          docTier: item.docTier,
          leadTimeDays: item.leadTimeDays,
          requiresAuthorityApproval: item.requiresAuthorityApproval,
          minValidityBufferHours: item.minValidityBufferHours,
        },
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

  async updateRegulation(
    _user: AuthenticatedUser,
    id: number,
    dto: UpdateRegulationDto,
  ): Promise<Regulation> {
    const existing = await this.documentsStore.findRegulationById(id);
    if (!existing) {
      throw new NotFoundException(`Quy định mã #${id} không tồn tại`);
    }
    await this.documentsStore.updateRegulation(id, dto);
    const updated = await this.documentsStore.findRegulationById(id);
    return updated!;
  }

  // --- Documents Upload & Retrieval ---
  async uploadDocument(
    user: AuthenticatedUser,
    dto: UploadDocumentDto,
    file?: Express.Multer.File,
  ): Promise<TransportDocument> {
    if (file) {
      verifyUploadedFileMagicBytes(file, 'document');
    }

    if (user.role === UserRole.CUSTOMER && typeof this.documentsStore.isHorseOwnedByUser === 'function') {
      const ownsHorse = await this.documentsStore.isHorseOwnedByUser(dto.horseId, Number(user.id));
      if (!ownsHorse) {
        if (file?.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        throw new ForbiddenException('Bạn chỉ có thể tải chứng từ cho ngựa thuộc tài khoản của mình');
      }
    }

    const regulation = await this.documentsStore.findRegulationById(dto.regulationId);
    if (!regulation) {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new BadRequestException(`Quy định ID #${dto.regulationId} không tồn tại trong hệ thống`);
    }

    let finalUrl = dto.fileUrl;
    if (file) {
      finalUrl = `/uploads/documents/${file.filename}`;
    } else {
      assertSafeExternalOrUploadUrl(dto.fileUrl);
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

    if (user.role === UserRole.CUSTOMER && (doc.ownerId ?? doc.uploadedBy) !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể xem tài liệu của ngựa thuộc tài khoản của mình');
    }

    return doc;
  }

  async getDocumentsByHorse(
    user: AuthenticatedUser,
    horseId: number,
  ): Promise<TransportDocument[]> {
    if (
      user.role === UserRole.CUSTOMER &&
      typeof this.documentsStore.isHorseOwnedByUser === 'function'
    ) {
      const ownsHorse = await this.documentsStore.isHorseOwnedByUser(horseId, Number(user.id));
      if (!ownsHorse) {
        throw new ForbiddenException('Bạn chỉ có thể xem tài liệu của ngựa thuộc tài khoản của mình');
      }
    }
    return this.documentsStore.findDocumentsByHorseId(horseId);
  }

  async getAuthorizedDocumentFilePath(
    user: AuthenticatedUser,
    documentId: number,
  ): Promise<{ absolutePath: string; fileName: string; externalUrl?: string }> {
    const doc = await this.getDocumentById(user, documentId);
    if (!doc.fileUrl) {
      throw new NotFoundException('Tài liệu này chưa có tệp đính kèm');
    }
    if (/^https?:\/\//i.test(doc.fileUrl)) {
      return { absolutePath: '', fileName: basename(doc.fileUrl), externalUrl: doc.fileUrl };
    }
    const safeName = basename(doc.fileUrl);
    const absolutePath = join(process.cwd(), 'uploads', 'documents', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp chứng từ trên máy chủ lưu trữ');
    }
    return { absolutePath, fileName: safeName };
  }

  async getDocuments(
    user: AuthenticatedUser,
    status?: string,
    horseId?: number,
  ): Promise<TransportDocument[]> {
    const filter: { ownerId?: number; status?: string; horseId?: number } = {};
    if (user.role === UserRole.CUSTOMER) {
      filter.ownerId = Number(user.id);
    }
    if (status) {
      filter.status = status;
    }
    if (horseId) {
      filter.horseId = horseId;
    }
    return this.documentsStore.findDocuments(filter);
  }

  private static readonly RECOGNIZED_COUNTRY_TOKENS: ReadonlyArray<[string, readonly string[]]> = [
    ['Singapore', ['singapore']],
    ['Malaysia', ['malaysia', 'kuala lumpur', 'penang']],
    ['Vietnam', [
      'vietnam', 'việt nam', 'hà nội', 'hanoi', 'hồ chí minh', 'ho chi minh',
      'tp.hcm', 'tphcm', 'hcm', 'saigon', 'sài gòn', 'củ chi', 'cu chi',
      'đà nẵng', 'da nang', 'bình dương', 'binh duong', 'nha trang',
      'hải phòng', 'cần thơ', 'huế', 'đồng nai', 'long an', 'vũng tàu',
    ]],
    ['Thailand', ['thailand', 'thái lan', 'bangkok']],
    ['Hong Kong', ['hong kong', 'hongkong', 'hồng kông']],
    ['Japan', ['japan', 'nhật bản', 'tokyo', 'osaka']],
    ['United Arab Emirates', ['uae', 'dubai', 'abu dhabi', 'emirates']],
    ['Qatar', ['qatar', 'doha']],
    ['Australia', ['australia', 'úc', 'sydney', 'melbourne']],
    ['France', ['france', 'pháp', 'paris']],
    ['Germany', ['germany', 'đức', 'berlin']],
    ['United Kingdom', ['united kingdom', 'uk', 'anh', 'london']],
    ['United States', ['usa', 'united states', 'mỹ', 'hoa kỳ']],
    ['South Korea', ['korea', 'hàn quốc', 'seoul']],
    ['Cambodia', ['cambodia', 'campuchia', 'phnom penh']],
    ['Laos', ['laos', 'lào', 'vientiane']],
    ['Indonesia', ['indonesia', 'jakarta']],
    ['Philippines', ['philippines', 'manila']],
    ['China', ['china', 'trung quốc', 'beijing', 'shanghai']],
    ['Canada', ['canada']],
    ['Belgium', ['belgium']],
    ['Bahrain', ['bahrain']],
  ];

  detectRecognizedCountry(location?: string | null): string | null {
    const normalized = (location || '').toLowerCase();
    if (!normalized.trim()) return null;
    for (const [country, tokens] of DocumentsService.RECOGNIZED_COUNTRY_TOKENS) {
      if (tokens.some((token) => normalized.includes(token))) {
        return country;
      }
    }
    return null;
  }

  detectDestinationCountry(location: string): string {
    return this.detectRecognizedCountry(location) ?? (location.trim() || 'Global Baseline');
  }

  private async resolveApplicableRegulations(
    destinationCountry: string,
    orderMode: 'road' | 'air' | null,
    gateTokens: string[],
    isInternational = true,
  ): Promise<{
    applicableRegulations: Regulation[];
    isUsingGlobalBaseline: boolean;
    matchedBorderGates: string[];
  }> {
    let rawRegulations = await this.documentsStore.findRegulations(destinationCountry);
    let isUsingGlobalBaseline = false;
    if (rawRegulations.length === 0) {
      rawRegulations = await this.documentsStore.findRegulations('Global Baseline');
      isUsingGlobalBaseline = true;
    }

    const lowerGateTokens = gateTokens.map((g) => g.toLowerCase().trim()).filter(Boolean);
    const matchedBorderGates = new Set<string>();
    const applicableRegulations = rawRegulations.filter((reg) => {
      if (!isInternational) {
        const docType = String(reg.documentType || '').toLowerCase().trim();
        if (DocumentsService.INTERNATIONAL_ONLY_DOC_TYPES.has(docType)) {
          return false;
        }
        if (reg.borderGate && reg.borderGate.trim().length > 0) {
          return false;
        }
      }
      if (orderMode && reg.transportMode && reg.transportMode !== 'both' && reg.transportMode !== orderMode) {
        return false;
      }
      if (reg.borderGate && reg.borderGate.trim().length > 0) {
        const needle = reg.borderGate.toLowerCase().trim();
        const matchesGate = lowerGateTokens.some(
          (tok) => tok === needle || tok.includes(needle) || needle.includes(tok),
        );
        if (!matchesGate) return false;
        matchedBorderGates.add(reg.borderGate.trim());
      }
      return true;
    });

    return {
      applicableRegulations,
      isUsingGlobalBaseline,
      matchedBorderGates: Array.from(matchedBorderGates),
    };
  }

  async computeOrderCutoffPolicy(input: {
    destinationLocation?: string;
    originLocation?: string;
    bookingType?: string;
    transportMode?: string | null;
    transportationType?: string | null;
  }): Promise<{
    minLeadDays: number;
    baseCutoffDays: number;
    maxTierALead: number;
    isInternational: boolean;
    destinationCountry: string;
    earliestDepartureDate: string;
  }> {
    const baseCutoffDays = input.bookingType === 'dedicated_charter' ? 2 : 3;
    const destinationCountry = input.destinationLocation
      ? this.detectDestinationCountry(input.destinationLocation)
      : 'Vietnam';
    const originCountry = this.detectDestinationCountry(input.originLocation || 'Vietnam');
    const explicitDom = String(input.transportationType || '').toLowerCase().includes('domestic');
    const isInternational =
      !explicitDom &&
      (destinationCountry !== originCountry ||
        destinationCountry !== 'Vietnam' ||
        String(input.transportationType || '').toLowerCase().includes('international') ||
        String(input.transportMode || '').toLowerCase() === 'air');

    const normalizedMode =
      input.transportMode === 'road' || input.transportMode === 'air'
        ? input.transportMode
        : null;
    const gateTokens = input.destinationLocation ? [input.destinationLocation] : [];
    const { applicableRegulations } = await this.resolveApplicableRegulations(
      destinationCountry,
      normalizedMode,
      gateTokens,
      isInternational,
    );

    const tierARegs = applicableRegulations.filter((r) => (r.docTier || 'A') === 'A');
    const maxTierALead =
      tierARegs.length > 0 ? Math.max(...tierARegs.map((r) => Number(r.leadTimeDays ?? 2))) : 0;
    const minLeadDays = Math.max(baseCutoffDays, maxTierALead + 2);
    const now = new Date();
    const earliestUtcMs =
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      minLeadDays * 86_400_000;
    const earliestDepartureDate = new Date(earliestUtcMs).toISOString().split('T')[0];

    return {
      minLeadDays,
      baseCutoffDays,
      maxTierALead,
      isInternational,
      destinationCountry,
      earliestDepartureDate,
    };
  }

  private parseTripTimestamp(raw: Date | string | null | undefined): Date | null {
    if (!raw) return null;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      const parsed = new Date(`${raw.trim()}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private computeTripArrivalDateTime(order?: {
    route_expected_arrival?: Date | string | null;
    stop_expected_arrival?: Date | string | null;
    expected_arrival_date?: Date | string | null;
    departure_date?: Date | string | null;
    requested_date?: Date | string | null;
  }): Date | null {
    const arrivalCandidates = [
      order?.route_expected_arrival,
      order?.stop_expected_arrival,
      order?.expected_arrival_date,
    ]
      .map((raw) => this.parseTripTimestamp(raw))
      .filter((d): d is Date => d !== null);

    if (arrivalCandidates.length > 0) {
      return arrivalCandidates.reduce((latest, cur) =>
        cur.getTime() > latest.getTime() ? cur : latest,
      );
    }

    return this.parseTripTimestamp(order?.departure_date || order?.requested_date);
  }

  private computeTripTargetDate(order?: {
    route_expected_arrival?: Date | string | null;
    stop_expected_arrival?: Date | string | null;
    expected_arrival_date?: Date | string | null;
    departure_date?: Date | string | null;
    requested_date?: Date | string | null;
  }): string | null {
    const d = this.computeTripArrivalDateTime(order);
    return d ? d.toISOString().split('T')[0] : null;
  }

  private isDocumentApprovedForCompliance(doc: TransportDocument, reg?: Regulation): boolean {
    if (doc.status !== DocumentStatus.APPROVED || doc.isExpiredForTrip || doc.isArchived) {
      return false;
    }
    if (reg?.requiresAuthorityApproval) {
      return Boolean(
        doc.approvals &&
        doc.approvals.length > 0 &&
        doc.approvals[0].status === AuthorityApprovalStatus.APPROVED,
      );
    }
    if (doc.approvals && doc.approvals.length > 0) {
      return doc.approvals[0].status === AuthorityApprovalStatus.APPROVED;
    }
    return true;
  }

  private evaluateDocumentExpiry(
    expiryDate: string | null,
    tripArrival: Date | string | null,
    bufferHours: number = 0,
  ): { isExpiredForTrip: boolean; isExpiringSoonForTrip: boolean; expiryNotice?: string } {
    if (!expiryDate || !tripArrival) {
      return { isExpiredForTrip: false, isExpiringSoonForTrip: false };
    }

    const expiryMs = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim())
      ? new Date(`${expiryDate.trim()}T23:59:59.999Z`).getTime()
      : new Date(expiryDate).getTime();

    const arrivalMs =
      tripArrival instanceof Date
        ? tripArrival.getTime()
        : /^\d{4}-\d{2}-\d{2}$/.test(tripArrival.trim())
          ? new Date(`${tripArrival.trim()}T00:00:00.000Z`).getTime()
          : new Date(tripArrival).getTime();

    if (!Number.isFinite(expiryMs) || !Number.isFinite(arrivalMs)) {
      return { isExpiredForTrip: false, isExpiringSoonForTrip: false };
    }

    const requiredUntilMs = arrivalMs + Math.max(0, Number(bufferHours || 0)) * 3600 * 1000;
    const requiredDateLabel = new Date(requiredUntilMs).toISOString().split('T')[0];

    if (expiryMs < requiredUntilMs) {
      return {
        isExpiredForTrip: true,
        isExpiringSoonForTrip: false,
        expiryNotice:
          bufferHours > 0
            ? `Hết hạn ${expiryDate}, không đủ biên an toàn +${bufferHours}h sau khi đến (${requiredDateLabel})`
            : `Hết hạn vào ${expiryDate}, trước ngày đến dự kiến (${requiredDateLabel})`,
      };
    }

    const diffDays = Math.floor((expiryMs - requiredUntilMs) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) {
      return {
        isExpiredForTrip: false,
        isExpiringSoonForTrip: true,
        expiryNotice: `Sắp hết hạn (${diffDays} ngày sau mốc an toàn)`,
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

    // Xác định quốc gia đích & ngữ cảnh đa chiều (cửa khẩu, phương thức, quốc tế)
    const destinationCountry = this.detectDestinationCountry(order.destination_location);
    const originCountry = this.detectDestinationCountry(order.origin_location || 'Vietnam');
    const explicitDom = String(order.transportation_type || '').toLowerCase().includes('domestic');
    const isInternational =
      !explicitDom &&
      (destinationCountry !== originCountry ||
        destinationCountry !== 'Vietnam' ||
        String(order.transportation_type || '').toLowerCase().includes('international') ||
        String(order.transport_mode || '').toLowerCase() === 'air');
    const orderMode = (order.transport_mode as 'road' | 'air' | null) ?? null;

    const gateTokens: string[] = [];
    if (order.arrival_airport_codes) {
      for (const tok of String(order.arrival_airport_codes).split(',')) {
        if (tok.trim()) gateTokens.push(tok.trim());
      }
    }
    if (order.border_stop_names) {
      for (const tok of String(order.border_stop_names).split(',')) {
        if (tok.trim()) gateTokens.push(tok.trim());
      }
    }
    if (order.destination_location) {
      gateTokens.push(String(order.destination_location).trim());
    }
    // Lấy tất cả các quy định bắt buộc cho quốc gia đích và lọc theo mode + border_gate
    const { applicableRegulations, isUsingGlobalBaseline, matchedBorderGates } =
      await this.resolveApplicableRegulations(destinationCountry, orderMode, gateTokens, isInternational);
    const complianceNotice: string | undefined = isUsingGlobalBaseline
      ? `Quốc gia đến "${destinationCountry}" hiện chưa có danh mục quy chế riêng. Hệ thống tự động áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI.`
      : undefined;

    const baseDays = order.booking_type === 'dedicated_charter' ? 1 : 2;
    const tierARegs = applicableRegulations.filter((r) => (r.docTier || 'A') === 'A');
    const maxTierALead = tierARegs.length > 0 ? Math.max(...tierARegs.map((r) => Number(r.leadTimeDays ?? 2))) : 0;
    const effectiveTierALeadDays = Math.max(baseDays, maxTierALead);
    const orderCutoffDays = Math.max(order.booking_type === 'dedicated_charter' ? 2 : 3, maxTierALead + 2);

    const depRaw = order.departure_date || order.requested_date;
    const depMs = depRaw ? new Date(depRaw).getTime() : NaN;
    const orderCutoffDate = Number.isFinite(depMs)
      ? new Date(depMs - orderCutoffDays * 86400 * 1000).toISOString().split('T')[0]
      : null;
    const tierADeadline = Number.isFinite(depMs)
      ? new Date(depMs - effectiveTierALeadDays * 86400 * 1000).toISOString().split('T')[0]
      : null;
    const tierBWindowStart = Number.isFinite(depMs)
      ? new Date(depMs - (isInternational ? 48 : 24) * 3600 * 1000).toISOString()
      : null;
    const tierBWindowEnd = Number.isFinite(depMs)
      ? new Date(depMs - 6 * 3600 * 1000).toISOString()
      : null;

    // Lấy danh sách ngựa trong đơn
    const horsesInOrder = await this.documentsStore.findHorsesInOrder(orderId);
    const tripArrivalDateTime = this.computeTripArrivalDateTime(order);
    const tripTargetDate = this.computeTripTargetDate(order);

    const horseItems: HorseComplianceItem[] = [];
    let totalApprovedDocs = 0;
    let hasExpiredDocuments = false;

    const applicableRegMap = new Map(applicableRegulations.map((r) => [r.id, r]));

    for (const h of horsesInOrder) {
      const rawDocs = await this.documentsStore.findDocumentsByHorseId(h.horse_id);
      // Giấy tờ chung của ngựa (regulationId = null) chưa được đối chiếu ở đây; Step 8 sẽ dùng lại theo document_type_code.
      const applicableRawDocs = rawDocs.filter(
        (d): d is TransportDocument & { regulationId: number } =>
          !d.isArchived && d.regulationId !== null && applicableRegMap.has(d.regulationId),
      );
      const evalDocs = applicableRawDocs.map((d) => {
        const reg = applicableRegMap.get(d.regulationId);
        const bufferHours =
          reg && reg.minValidityBufferHours !== undefined && reg.minValidityBufferHours !== null
            ? Number(reg.minValidityBufferHours)
            : isInternational
              ? 48
              : 0;
        const expiryEval = this.evaluateDocumentExpiry(d.expiryDate, tripArrivalDateTime, bufferHours);
        let earlyIssuanceWarning: string | null = null;
        if (reg && (reg.docTier || 'A') === 'B' && d.issueDate && Number.isFinite(depMs)) {
          const issueMs = new Date(d.issueDate).getTime();
          const earliestRecommendedMs = depMs - (isInternational ? 10 : 2) * 86400 * 1000;
          if (Number.isFinite(issueMs) && issueMs < earliestRecommendedMs) {
            earlyIssuanceWarning = isInternational
              ? 'Cảnh báo: Hồ sơ kiểm dịch ngắn hạn (Tầng B) được cấp sớm hơn D-10 có thể hết hạn trước khi thông quan; cần kiểm tra lại biên an toàn +48h.'
              : 'Cảnh báo: Giấy kiểm dịch nội địa (Tầng B) thường chỉ cấp từ D-1 (24h–6h trước khởi hành); cấp quá sớm có nguy cơ hết hạn trước khi đến nơi.';
          }
        }
        return {
          ...d,
          ...expiryEval,
          earlyIssuanceWarning,
        };
      });

      // Giữ duy nhất 1 bản hồ sơ mới nhất / đạt chuẩn cho mỗi quy định áp dụng của đơn hàng này
      const dedupedByReg = new Map<number, (typeof evalDocs)[number]>();
      for (const d of evalDocs) {
        const existing = dedupedByReg.get(d.regulationId);
        if (!existing) {
          dedupedByReg.set(d.regulationId, d);
          continue;
        }
        const reg = applicableRegMap.get(d.regulationId);
        const existingApproved = Boolean(reg) && this.isDocumentApprovedForCompliance(existing, reg);
        const candidateApproved = Boolean(reg) && this.isDocumentApprovedForCompliance(d, reg);
        if (!existingApproved && candidateApproved) {
          dedupedByReg.set(d.regulationId, d);
        }
      }
      const docs = Array.from(dedupedByReg.values());
      if (docs.some((d) => d.isExpiredForTrip)) {
        hasExpiredDocuments = true;
      }

      // Tìm những quy định đã có tài liệu approved, đạt chuẩn cơ quan chức năng (2 tầng) VÀ còn hạn + biên an toàn
      const approvedRegIds = new Set(
        docs
          .filter((d) => {
            const reg = applicableRegMap.get(d.regulationId);
            return Boolean(reg) && this.isDocumentApprovedForCompliance(d, reg);
          })
          .map((d) => d.regulationId),
      );

      // Tìm những quy định đã có bất kỳ tài liệu nào được nộp (approved, submitted hoặc rejected)
      const uploadedRegIds = new Set(
        docs.filter((d) => d.regulationId).map((d) => d.regulationId),
      );

      totalApprovedDocs += approvedRegIds.size;

      // Danh sách quy định thực sự CHƯA TỪNG ĐƯỢC TẢI LÊN lần nào
      const missingRegs = applicableRegulations.filter((reg) => !uploadedRegIds.has(reg.id));

      // Một con ngựa CHỈ ĐẠT CHUẨN (isCompliant) khi TẤT CẢ các quy định đều ĐÃ ĐƯỢC PHÊ DUYỆT ĐỦ 2 TẦNG
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
      effectiveTierALeadDays,
      orderCutoffDate,
      tierADeadline,
      tierBWindowStart,
      tierBWindowEnd,
      inTransitComplianceAlert: Boolean(order.in_transit_compliance_alert),
      isInternational,
      transportMode: orderMode,
      matchedBorderGates: Array.from(matchedBorderGates),
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
      const reg = doc.regulationId !== null && typeof this.documentsStore.findRegulationById === 'function'
        ? await this.documentsStore.findRegulationById(doc.regulationId)
        : undefined;
      const activeShipmentIds = await this.documentsStore.findActiveShipmentIdsByHorseId(doc.horseId);
      for (const sid of activeShipmentIds) {
        const orderDetails = await this.documentsStore.findOrderDetails(sid);
        const arrivalDt = this.computeTripArrivalDateTime(orderDetails);
        const destCountry = this.detectDestinationCountry(orderDetails?.destination_location || '');
        const bufferHours =
          reg && reg.minValidityBufferHours !== undefined && reg.minValidityBufferHours !== null
            ? Number(reg.minValidityBufferHours)
            : destCountry !== 'Vietnam'
              ? 48
              : 24;
        const evalResult = this.evaluateDocumentExpiry(dto.expiryDate, arrivalDt, bufferHours);
        if (evalResult.isExpiredForTrip) {
          throw new BadRequestException(
            evalResult.expiryNotice ||
              `Tài liệu hết hạn vào ngày ${dto.expiryDate}, không đủ biên an toàn +${bufferHours}h sau khi đến. Không thể phê duyệt.`,
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
      doc.ownerId ?? doc.uploadedBy,
      'Cập nhật trạng thái thẩm định tài liệu kiểm dịch',
      `Tài liệu "${friendlyDocTitle}" của ngựa "${doc.horseName ?? 'ngựa'}"${orderText} ${statusText} bởi Chuyên viên Transport Specialist.`,
      'status_update',
    );

    await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);

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

    if (dto.status === AuthorityApprovalStatus.APPROVED && doc.status !== DocumentStatus.APPROVED) {
      await this.documentsStore.updateDocumentReview(
        documentId,
        DocumentStatus.APPROVED,
        `Phê duyệt bởi cơ quan: ${dto.authorityName}. ${dto.notes ?? ''}`.trim(),
        undefined,
        dto.referenceNumber,
      );
    } else if (dto.status === AuthorityApprovalStatus.REJECTED) {
      await this.documentsStore.updateDocumentReview(
        documentId,
        DocumentStatus.REJECTED,
        `Bị từ chối bởi cơ quan: ${dto.authorityName}. ${dto.notes ?? ''}`.trim(),
        undefined,
        dto.referenceNumber,
      );
    }
    await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);

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
      doc.ownerId ?? doc.uploadedBy,
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
    if (file) {
      verifyUploadedFileMagicBytes(file, 'document');
    }

    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc) {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại`);
    }

    if (doc.isArchived) {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new ConflictException(`Tài liệu #${documentId} đã được thay thế bởi phiên bản mới hơn`);
    }

    if (user.role === UserRole.CUSTOMER && (doc.ownerId ?? doc.uploadedBy) !== Number(user.id)) {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new ForbiddenException('Bạn chỉ có thể cập nhật tài liệu của ngựa thuộc tài khoản mình');
    }

    let finalUrl = dto?.fileUrl || doc.fileUrl;
    if (file) {
      finalUrl = `/uploads/documents/${file.filename}`;
    } else if (dto?.fileUrl) {
      assertSafeExternalOrUploadUrl(dto.fileUrl);
    }

    if (!finalUrl || finalUrl.trim().length === 0) {
      throw new BadRequestException('Vui lòng chọn file mới từ máy tính để cập nhật');
    }

    const newDocumentId = await this.documentsStore.supersedeDocument(
      documentId,
      Number(user.id),
      finalUrl,
      dto?.docNumber,
      dto?.notes ? `[Cập nhật lại]: ${dto.notes}` : null,
    );
    await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);

    const updated = await this.documentsStore.findDocumentById(newDocumentId);
    return updated!;
  }

  async deleteDocument(
    user: AuthenticatedUser,
    documentId: number,
  ): Promise<{ success: boolean; message: string }> {
    const isAdminOrSpecialist =
      user.role === UserRole.ADMIN || user.role === UserRole.LOGISTICS_MANAGER;
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc || doc.isArchived) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại hoặc đã bị lưu trữ`);
    }
    if (!isAdminOrSpecialist && (doc.ownerId ?? doc.uploadedBy) !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể xóa tài liệu của ngựa thuộc tài khoản mình');
    }
    if (!isAdminOrSpecialist && doc.status === DocumentStatus.APPROVED) {
      throw new ConflictException('Không thể xóa tài liệu đã được phê duyệt');
    }

    const deleted = await this.documentsStore.deleteDocument(
      documentId,
      Number(user.id),
      isAdminOrSpecialist,
    );
    if (!deleted) {
      throw new NotFoundException(`Tài liệu #${documentId} không tồn tại hoặc không thể lưu trữ`);
    }
    await this.checkAndNotifyManagerWhenFlow2Completed(doc.horseId);
    return { success: true, message: `Tài liệu #${documentId} đã được lưu trữ thành công` };
  }
  // --- Kho giấy tờ của ngựa (Step 2, review 11/2026) ---
  // Giấy tờ thuộc về con ngựa và dùng lại cho nhiều đơn; quyền truy cập kiểm tra theo chủ sở hữu ngựa.

  async getDocumentTypes(): Promise<DocumentTypeDefinition[]> {
    return this.documentsStore.findDocumentTypes();
  }

  private async assertHorseDocumentAccess(user: AuthenticatedUser, horseId: number): Promise<void> {
    const ownerId = await this.documentsStore.findHorseOwnerId(horseId);
    if (ownerId === undefined) {
      throw new NotFoundException(`Ngựa #${horseId} không tồn tại`);
    }
    const isStaff = user.role === UserRole.LOGISTICS_MANAGER || user.role === UserRole.ADMIN;
    if (!isStaff && ownerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể truy cập giấy tờ của ngựa thuộc tài khoản của mình');
    }
  }

  private withValidity(doc: TransportDocument): TransportDocument {
    return { ...doc, ...computeDocumentValidity(doc.expiryDate) };
  }

  async listHorseDocuments(user: AuthenticatedUser, horseId: number): Promise<TransportDocument[]> {
    await this.assertHorseDocumentAccess(user, horseId);
    const docs = await this.documentsStore.findDocumentsByHorseId(horseId);
    return docs.map((d) => this.withValidity(d));
  }

  async uploadHorseDocument(
    user: AuthenticatedUser,
    horseId: number,
    dto: UploadHorseDocumentDto,
    file?: Express.Multer.File,
  ): Promise<TransportDocument> {
    const discardFile = () => {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
    };
    try {
      if (file) {
        verifyUploadedFileMagicBytes(file, 'document');
      }
      await this.assertHorseDocumentAccess(user, horseId);

      const docType = await this.documentsStore.findDocumentTypeByCode(dto.documentTypeCode);
      if (!docType) {
        throw new BadRequestException(`Loại giấy tờ "${dto.documentTypeCode}" không có trong danh mục`);
      }

      const expiryDate = dto.expiryDate ?? computeDefaultExpiryDate(dto.issueDate, docType.defaultValidityDays);
      if (isExpiryBeforeIssue(dto.issueDate, expiryDate)) {
        throw new BadRequestException('Ngày hết hạn không được trước ngày cấp');
      }

      let fileUrl = dto.fileUrl;
      if (file) {
        fileUrl = `/uploads/documents/${file.filename}`;
      } else {
        assertSafeExternalOrUploadUrl(dto.fileUrl);
      }
      if (!fileUrl || fileUrl.trim().length === 0) {
        throw new BadRequestException('Vui lòng chọn file từ máy tính hoặc cung cấp fileUrl');
      }

      const documentId = await this.documentsStore.createHorseDocument(Number(user.id), {
        horseId,
        documentTypeCode: docType.code,
        docType: docType.code,
        docNumber: dto.docNumber?.trim() || null,
        fileUrl,
        issueDate: dto.issueDate ?? null,
        expiryDate,
      });
      const created = await this.documentsStore.findDocumentById(documentId);
      if (!created) {
        throw new NotFoundException('Không tìm thấy giấy tờ sau khi tạo');
      }
      return this.withValidity(created);
    } catch (error) {
      discardFile();
      throw error;
    }
  }

  private async findHorseDocumentOrThrow(
    user: AuthenticatedUser,
    horseId: number,
    documentId: number,
  ): Promise<TransportDocument> {
    await this.assertHorseDocumentAccess(user, horseId);
    const doc = await this.documentsStore.findDocumentById(documentId);
    if (!doc || doc.horseId !== horseId) {
      throw new NotFoundException(`Giấy tờ #${documentId} không thuộc ngựa #${horseId}`);
    }
    return doc;
  }

  async getHorseDocumentHistory(
    user: AuthenticatedUser,
    horseId: number,
    documentId: number,
  ): Promise<TransportDocument[]> {
    const doc = await this.findHorseDocumentOrThrow(user, horseId, documentId);
    const history = await this.documentsStore.findDocumentHistory(
      horseId,
      doc.documentTypeCode ?? null,
      doc.docType,
    );
    return history.map((d) => this.withValidity(d));
  }

  async getHorseDocumentFilePath(
    user: AuthenticatedUser,
    horseId: number,
    documentId: number,
  ): Promise<{ absolutePath: string; fileName: string; externalUrl?: string }> {
    await this.findHorseDocumentOrThrow(user, horseId, documentId);
    return this.getAuthorizedDocumentFilePath(user, documentId);
  }
}
