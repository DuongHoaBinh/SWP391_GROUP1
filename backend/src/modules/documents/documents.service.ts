import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentsStore } from './documents.store';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';
import { NotifyMissingDocumentsDto } from './dto/notify-missing.dto';
import {
  DocumentStatus,
  HorseComplianceItem,
  OrderComplianceChecklist,
  Regulation,
  TransportDocument,
} from './documents.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsStore: DocumentsStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  // --- Regulations ---
  async getRegulations(countryFilter?: string): Promise<Regulation[]> {
    return this.documentsStore.findRegulations(countryFilter);
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
  ): Promise<TransportDocument> {
    const regulation = await this.documentsStore.findRegulationById(dto.regulationId);
    if (!regulation) {
      throw new BadRequestException(`Quy định ID #${dto.regulationId} không tồn tại trong hệ thống`);
    }

    const documentId = await this.documentsStore.createDocument(Number(user.id), dto);
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

    // Xác định quốc gia đích từ destination_location
    let destinationCountry = 'Singapore';
    const dest = order.destination_location.toLowerCase();
    if (dest.includes('singapore')) destinationCountry = 'Singapore';
    else if (dest.includes('malaysia')) destinationCountry = 'Malaysia';
    else if (dest.includes('vietnam') || dest.includes('việt nam')) destinationCountry = 'Vietnam';
    else if (dest.includes('thailand') || dest.includes('thái lan')) destinationCountry = 'Thailand';
    else if (dest.includes('hong kong') || dest.includes('hongkong')) destinationCountry = 'Hong Kong';

    // Lấy tất cả các quy định bắt buộc cho quốc gia đích
    const applicableRegulations = await this.documentsStore.findRegulations(destinationCountry);

    // Lấy danh sách ngựa trong đơn
    const horsesInOrder = await this.documentsStore.findHorsesInOrder(orderId);

    const horseItems: HorseComplianceItem[] = [];
    let totalApprovedDocs = 0;

    for (const h of horsesInOrder) {
      const docs = await this.documentsStore.findDocumentsByHorseId(h.horse_id);

      // Tìm những quy định đã có tài liệu approved
      const approvedRegIds = new Set(
        docs.filter((d) => d.status === DocumentStatus.APPROVED).map((d) => d.regulationId),
      );

      totalApprovedDocs += approvedRegIds.size;

      // Danh sách quy định còn thiếu hoặc chưa được approved
      const missingRegs = applicableRegulations.filter((reg) => !approvedRegIds.has(reg.id));

      const isCompliant = missingRegs.length === 0;

      horseItems.push({
        horseId: h.horse_id,
        horseName: h.name,
        documents: docs,
        missingRegulations: missingRegs,
        isCompliant,
      });
    }

    const totalRequiredDocs = applicableRegulations.length * horsesInOrder.length;
    const compliantHorsesCount = horseItems.filter((item) => item.isCompliant).length;
    const isFullyCompliant = compliantHorsesCount === horsesInOrder.length && horsesInOrder.length > 0;

    return {
      orderId,
      destinationLocation: order.destination_location,
      destinationCountry,
      totalHorses: horsesInOrder.length,
      compliantHorsesCount,
      totalRequiredDocuments: totalRequiredDocs,
      approvedDocumentsCount: totalApprovedDocs,
      isFullyCompliant,
      horses: horseItems,
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

    await this.documentsStore.updateDocumentReview(
      documentId,
      dto.status,
      dto.notes,
      dto.expiryDate,
    );

    // Gửi thông báo đến người đã nộp tài liệu
    const statusText =
      dto.status === DocumentStatus.APPROVED
        ? 'đã được phê duyệt hợp lệ'
        : dto.status === DocumentStatus.REJECTED
          ? `bị từ chối. Lý do: "${dto.notes}"`
          : 'được đánh dấu là đã hết hạn';

    await this.notificationsService.createNotification(
      doc.uploadedBy,
      'Cập nhật trạng thái thẩm định tài liệu kiểm dịch',
      `Tài liệu "${doc.docType}" (Mã số: #${documentId}) của ngựa "${doc.horseName ?? 'ngựa'}" ${statusText} bởi Chuyên viên Transport Specialist.`,
      'status_update',
    );

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

    // Nếu cơ quan chức năng phê duyệt, có thể đồng thời chuyển trạng thái tài liệu sang approved
    if (dto.status === 'approved' && doc.status !== DocumentStatus.APPROVED) {
      await this.documentsStore.updateDocumentReview(
        documentId,
        DocumentStatus.APPROVED,
        `Phê duyệt bởi cơ quan: ${dto.authorityName}. ${dto.notes ?? ''}`.trim(),
      );
    }

    // Gửi thông báo cho khách hàng
    await this.notificationsService.createNotification(
      doc.uploadedBy,
      'Cập nhật kết quả phê duyệt từ cơ quan chức năng',
      `Tài liệu "${doc.docType}" của ngựa "${doc.horseName ?? 'ngựa'}" đã có kết quả từ ${dto.authorityName}: ${dto.status.toUpperCase()}.`,
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

    // Tổng hợp danh sách tài liệu thiếu theo từng con ngựa
    const missingItemsText = checklist.horses
      .filter((h) => h.missingRegulations.length > 0)
      .map(
        (h) =>
          `• Ngựa ${h.horseName}: thiếu [${h.missingRegulations.map((r) => r.documentType).join(', ')}]`,
      )
      .join('\n');

    const customMsg = dto.customMessage ? `\nLời nhắn từ chuyên viên: "${dto.customMessage}"` : '';

    await this.notificationsService.createNotification(
      order.customer_id,
      'Yêu cầu bổ sung hồ sơ pháp lý / kiểm dịch',
      `Đơn vận chuyển mã #${orderId} đến ${checklist.destinationCountry} hiện chưa đủ điều kiện xuất phát do còn thiếu các chứng từ bắt buộc:\n${missingItemsText}${customMsg}\nVui lòng tải lên các tài liệu này sớm nhất có thể.`,
      'document_missing',
      orderId,
    );

    return {
      success: true,
      message: `Đã gửi thông báo nhắc nhở bổ sung hồ sơ tới khách hàng cho đơn #${orderId}.`,
      missingCount: checklist.totalRequiredDocuments - checklist.approvedDocumentsCount,
    };
  }
}
