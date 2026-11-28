import { assertNewBookingType } from './booking-policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrdersStore } from './orders.store';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { RequestChangesDto } from './dto/request-changes.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ShipmentStatus, TransportOrder } from './orders.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';
import { MailService } from '../auth/mail.service';
import { FeasibilityReviewDto, SubmitRefundFormDto } from './dto/prepaid-flow.dto';
import {
  currentReturnPolicy,
  calculateReturnCancellationRefund,
  calculateRescheduleFee,
} from './return-policy';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersStore: OrdersStore,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly documentsService?: DocumentsService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  async getOrderCutoffPolicy(input: {
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
    if (typeof this.documentsService?.computeOrderCutoffPolicy === 'function') {
      return this.documentsService.computeOrderCutoffPolicy(input);
    }
    const baseCutoffDays = input.bookingType === 'dedicated_charter' ? 2 : 3;
    const now = new Date();
    const earliestUtcMs =
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      baseCutoffDays * 86_400_000;
    return {
      minLeadDays: baseCutoffDays,
      baseCutoffDays,
      maxTierALead: 0,
      isInternational: String(input.transportationType || '').toLowerCase().includes('international'),
      destinationCountry: input.destinationLocation || 'Vietnam',
      earliestDepartureDate: new Date(earliestUtcMs).toISOString().split('T')[0],
    };
  }

  private async assertValidRequestedDate(
    requestedDate?: string,
    context?: {
      destinationLocation?: string;
      originLocation?: string;
      bookingType?: string;
      transportMode?: string | null;
      transportationType?: string | null;
    },
  ): Promise<void> {
    if (!requestedDate) return;
    const parsed = new Date(requestedDate);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException('Ngày khởi hành dự kiến không hợp lệ');
    }
    if (parsed.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Ngày khởi hành dự kiến không được nằm trong quá khứ');
    }

    const policy = await this.getOrderCutoffPolicy(context || {});
    const now = new Date();
    const earliestUtc =
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      policy.minLeadDays * 86_400_000;
    const requestedDayUtc = Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    );
    if (requestedDayUtc < earliestUtc) {
      throw new UnprocessableEntityException({
        message: `Ngày khởi hành dự kiến quá sát hạn đặt đơn. Tuyến đến ${policy.destinationCountry} yêu cầu đặt trước tối thiểu ${policy.minLeadDays} ngày (sớm nhất: ${policy.earliestDepartureDate}).`,
        code: 'ORDER_CUTOFF_VIOLATION',
        minLeadDays: policy.minLeadDays,
        maxTierALead: policy.maxTierALead,
        earliestDepartureDate: policy.earliestDepartureDate,
        destinationCountry: policy.destinationCountry,
      });
    }
  }

  async createOrder(user: AuthenticatedUser, dto: CreateOrderDto): Promise<TransportOrder> {
    // Bỏ gom chuyến (Step 3): đơn mới luôn bao chuyến, gửi shared_stall trả 400
    dto.bookingType = assertNewBookingType(dto.bookingType);
    if (dto.tripType === 'round_trip' && !dto.acceptReturnPolicy) {
      throw new BadRequestException('Bạn phải đồng ý chính sách hủy chặng về và no-show để đặt chuyến khứ hồi');
    }
    await this.assertValidRequestedDate(dto.requestedDate, {
      destinationLocation: dto.destinationLocation,
      originLocation: dto.originLocation,
      bookingType: dto.bookingType,
      transportationType: dto.transportationType,
      isLegacySeed: (dto as any).isLegacySeed,
      horseIds: dto.horses?.map((h: any) => h.horseId).filter(Boolean),
    } as any);
    if (!dto.quoteId && !(dto as any).isLegacySeed) {
      throw new BadRequestException('Vui lòng tạo báo giá trước khi đặt đơn');
    }
    const customerId = Number(user.id);
    const shipmentId = await this.ordersStore.createShipment(customerId, dto);
    const created = await this.ordersStore.findShipmentById(shipmentId);
    if (!created) {
      throw new NotFoundException('Failed to retrieve newly created shipment');
    }

    // 1. Tự động gửi thông báo đến Logistics Manager khi có đơn vận chuyển mới
    const code = created.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    const horseCount = dto.horses?.length || dto.requestedHorseCount || 1;
    const customerDisplayName = created.customerName || created.contactName || (user as any).fullName || user.email;
    const notifMsg = created.paymentFlow === 'prepaid'
      ? `Khách hàng ${customerDisplayName} (${user.email}) vừa tạo đơn trả trước ${code} từ báo giá #${dto.quoteId} (${horseCount} ngựa) và đang chờ thanh toán qua SePay.`
      : `Khách hàng ${customerDisplayName} (${user.email}) vừa gửi yêu cầu vận chuyển mới ${code} từ "${dto.originLocation}" đến "${dto.destinationLocation}" (${horseCount} ngựa). Vui lòng xem xét và duyệt đơn.`;

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Yêu cầu vận chuyển mới: ${code}`,
      notifMsg,
      'status_update',
      shipmentId,
    );

    return created;
  }

  async getMyOrders(user: AuthenticatedUser): Promise<TransportOrder[]> {
    const orders = await this.ordersStore.findShipmentsByCustomer(Number(user.id));
    return orders.map((order) => {
      if (order.customerRequestCode) {
        return {
          ...order,
          requestCode: order.customerRequestCode,
        };
      }
      return order;
    });
  }

  async getAllOrders(statusFilter?: ShipmentStatus, user?: AuthenticatedUser): Promise<TransportOrder[]> {
    if (user?.role === UserRole.DRIVER_ESCORT) {
      return this.ordersStore.findShipmentsByAssignedStaff(Number(user.id), statusFilter);
    }
    return this.ordersStore.findAllShipments(statusFilter);
  }

  async getOrderById(user: AuthenticatedUser, orderId: number): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('You can only view your own transport orders');
    }

    if (user.role === UserRole.DRIVER_ESCORT) {
      const assigned = await this.ordersStore.isStaffAssignedToShipment(orderId, Number(user.id));
      if (!assigned) {
        throw new ForbiddenException('You can only view transport orders assigned to you');
      }
    }

    if (user.role === UserRole.CUSTOMER && order.customerRequestCode) {
      return {
        ...order,
        requestCode: order.customerRequestCode,
      };
    }

    return order;
  }

  async approveOrder(
    manager: AuthenticatedUser,
    orderId: number,
    dto: ApproveOrderDto,
  ): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (order.paymentFlow === 'prepaid') {
      throw new ConflictException('Đơn trả trước dùng nút Duyệt khả thi');
    }

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new ConflictException(
        `Chỉ đơn hàng đang ở trạng thái "${ShipmentStatus.REQUESTED}" mới có thể phê duyệt. Trạng thái hiện tại: "${order.status}"`,
      );
    }

    const managerId = Number(manager.id);
    if (dto.transportCost !== undefined && dto.totalCost !== undefined && dto.transportCost !== dto.totalCost) {
      throw new BadRequestException('Chỉ gửi một giá trị cước vận chuyển cơ bản nhất quán');
    }
    await this.ordersStore.updateShipmentApproval(
      orderId,
      managerId,
      ShipmentStatus.APPROVED,
      null,
      dto.transportCost ?? dto.totalCost ?? 0,
      dto.transportMode,
      dto,
    );

    // 1. Gửi thông báo đến customer (dùng mã đơn của riêng khách hàng)
    const customerCode = order.customerRequestCode || order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      `Đơn vận chuyển ${customerCode} đã được phê duyệt`,
      `Yêu cầu vận chuyển ${customerCode} từ "${order.originLocation}" đến "${order.destinationLocation}" đã được duyệt sơ bộ. Báo giá hiện tại là dự kiến. Quý khách chưa cần thanh toán; hóa đơn và cổng thanh toán sẽ mở sau khi lộ trình chi tiết được xác nhận. Quản lý vận hành sẽ gửi danh mục hồ sơ cần nộp.`,
      'status_update',
      orderId,
    );

    // 2. Chuyển giao sang Flow 2: nhắc Manager thiết lập hồ sơ kiểm dịch (dùng mã hệ thống)
    const staffCode = `REQ-${String(orderId).padStart(3, '0')}`;
    const customerName = order.customerName || order.contactName || 'Khách hàng';
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Đơn hàng mới ${staffCode} cần thiết lập hồ sơ kiểm dịch`,
      `Đơn vận chuyển ${staffCode} của ${customerName} đi "${order.destinationLocation}" vừa được phê duyệt. Vui lòng rà soát quy chế nước đến và gửi yêu cầu danh mục hồ sơ cho khách hàng.`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  async rejectOrder(
    manager: AuthenticatedUser,
    orderId: number,
    dto: RejectOrderDto,
  ): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (order.paymentFlow === 'prepaid') {
      throw new ConflictException('Đơn trả trước dùng nút Duyệt khả thi');
    }

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new ConflictException(
        `Chỉ đơn hàng đang ở trạng thái "${ShipmentStatus.REQUESTED}" mới có thể từ chối. Trạng thái hiện tại: "${order.status}"`,
      );
    }

    const managerId = Number(manager.id);
    await this.ordersStore.updateShipmentApproval(
      orderId,
      managerId,
      ShipmentStatus.REJECTED,
      dto.reason,
    );

    // Gửi thông báo đến customer kèm lý do
    const rejectCode = order.customerRequestCode || order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      'Yêu cầu vận chuyển bị từ chối',
      `Yêu cầu vận chuyển mã ${rejectCode} đã bị từ chối bởi Logistics Manager. Lý do: ${dto.reason}`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  async requestChanges(
    manager: AuthenticatedUser,
    orderId: number,
    dto: RequestChangesDto,
  ): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (order.paymentFlow === 'prepaid') {
      throw new ConflictException('Đơn trả trước dùng nút Duyệt khả thi');
    }

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new ConflictException(
        `Chỉ đơn hàng đang ở trạng thái "${ShipmentStatus.REQUESTED}" mới có thể yêu cầu chỉnh sửa. Trạng thái hiện tại: "${order.status}"`,
      );
    }

    await this.ordersStore.updateShipmentChangeRequest(orderId, dto.reason);

    // Gửi thông báo đến customer kèm lý do cần chỉnh sửa
    const changeCode = order.customerRequestCode || order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      'Yêu cầu chỉnh sửa thông tin vận chuyển',
      `Đơn vận chuyển mã ${changeCode} cần được chỉnh sửa: "${dto.reason}". Vui lòng cập nhật lại thông tin và gửi lại đơn để tiếp tục xét duyệt.`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  async updateOrder(
    user: AuthenticatedUser,
    orderId: number,
    dto: UpdateOrderDto,
  ): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể chỉnh sửa đơn vận chuyển của chính mình');
    }

    if (order.status === ShipmentStatus.IN_TRANSIT || (order.status as string) === 'return_pending') {
      throw new ConflictException('Không thể chỉnh sửa đơn hàng hoặc thay đổi gói bảo hiểm khi đang trong hành trình vận chuyển');
    }

    if (order.status !== ShipmentStatus.CHANGE_REQUESTED) {
      throw new ConflictException(
        `Chỉ đơn hàng ở trạng thái "${ShipmentStatus.CHANGE_REQUESTED}" mới có thể chỉnh sửa. Trạng thái hiện tại: "${order.status}"`,
      );
    }

    await this.assertValidRequestedDate(dto.requestedDate, {
      destinationLocation: dto.destinationLocation ?? order.destinationLocation,
      originLocation: dto.originLocation ?? order.originLocation,
      bookingType: dto.bookingType ?? order.bookingType,
      transportMode: order.transportMode,
      transportationType: order.transportationType,
    });
    const customerId = Number(user.id);
    await this.ordersStore.updateAndResubmitShipment(customerId, orderId, dto);

    // Gửi thông báo xác nhận cập nhật cho customer
    await this.notificationsService.createNotification(
      order.customerId,
      'Đơn vận chuyển đã được gửi lại',
      `Đơn vận chuyển mã #${orderId} đã được cập nhật thành công và chuyển lại cho Logistics Manager xét duyệt.`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  async completeOrder(user: AuthenticatedUser, orderId: number): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (![UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.DRIVER_ESCORT].includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền hoàn tất chuyến');
    }
    if (order.status === ShipmentStatus.RETURN_PENDING) {
      const retStatus = String(order.returnStatus || '').toLowerCase();
      if (!['completed', 'cancelled', 'no_show'].includes(retStatus)) {
        throw new ConflictException('Không thể hoàn tất đơn khi chặng về chưa hoàn thành hoặc chưa bị hủy');
      }
    } else if (![ShipmentStatus.IN_TRANSIT, ShipmentStatus.COMPLETED].includes(order.status)) {
      throw new ConflictException('Chỉ được hoàn tất chuyến đã xuất phát');
    }
    const changed = await this.ordersStore.completeShipment(orderId, Number(user.id), user.role === UserRole.DRIVER_ESCORT);
    if (!changed) return order;

    const code = order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      'Chuyến vận chuyển đã hoàn thành',
      `Đơn vận chuyển mã ${code} đã hoàn tất thành công. Ngựa đã được bàn giao an toàn tại điểm đến (${order.destinationLocation}).`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  async cancelOrder(user: AuthenticatedUser, orderId: number): Promise<TransportOrder> {
    const order = await this.ordersStore.findShipmentById(orderId);
    if (!order) {
      throw new NotFoundException(`Transport order #${orderId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể hủy đơn vận chuyển của chính mình');
    }

    if (![UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role)) throw new ForbiddenException('Chỉ khách hàng sở hữu đơn hoặc Logistics Manager được hủy yêu cầu.');
    const wasAwaitingPayment = order.status === ShipmentStatus.AWAITING_PAYMENT;
    const changed = await this.ordersStore.cancelShipment(orderId, { id: Number(user.id), role: user.role });
    if (!changed) return order;

    const code = order.customerRequestCode || order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      'Đã hủy yêu cầu vận chuyển',
      wasAwaitingPayment
        ? `Đơn vận chuyển mã ${code} đã được hủy trước khi thanh toán. Hóa đơn và mã QR đã bị vô hiệu; quý khách không chuyển khoản cho mã QR cũ. Các chú ngựa trong đơn đã được mở lại.`
        : `Đơn vận chuyển mã ${code} đã được hủy theo yêu cầu của bạn. Trạng thái các chú ngựa trong đơn đã được mở lại.`,
      'status_update',
      orderId,
    );
    if (wasAwaitingPayment) {
      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `Khách hàng hủy đơn chờ thanh toán REQ-${String(orderId).padStart(3, '0')}`,
        `Đơn REQ-${String(orderId).padStart(3, '0')} đã được khách hàng hủy trước khi thanh toán. Xe giữ chỗ và ngựa đã được giải phóng.`,
        'status_update',
        orderId,
      );
    }

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }

  // --- Step 5: Vận chuyển khứ hồi, hủy chặng về và đổi ngày ---

  getReturnPolicy() {
    return currentReturnPolicy();
  }

  async getReturnCancellationPreview(user: AuthenticatedUser, shipmentId: number) {
    const order = await this.getOrderById(user, shipmentId);
    if (order.tripType !== 'round_trip') {
      throw new BadRequestException('Đơn vận chuyển không phải là chuyến khứ hồi');
    }
    if (!order.returnDepartureAt) {
      throw new BadRequestException('Đơn khứ hồi chưa có thời điểm khởi hành chặng về');
    }
    const activePaidStatuses = [
      'paid_pending_review',
      'approved',
      'planning',
      'confirmed',
      'ready_to_depart',
      'in_transit',
      'return_pending',
    ];
    if (!activePaidStatuses.includes(order.status)) {
      throw new ConflictException(
        order.status === 'cancelled' || order.status === 'rejected'
          ? 'Đơn hàng đã bị hủy — không thể hoàn tiền chặng về'
          : order.status === 'awaiting_payment'
            ? 'Đơn hàng chưa thanh toán — không có khoản hoàn tiền chặng về'
            : `Không thể xem tiền hoàn chặng về khi đơn đang ở trạng thái "${order.status}"`,
      );
    }
    if (order.returnStatus === 'in_progress') {
      throw new ConflictException('Chặng về đã xuất phát (in_progress), không thể hủy');
    }
    if (order.returnStatus !== 'scheduled') {
      throw new ConflictException(`Không thể xem phí hủy chặng về ở trạng thái "${order.returnStatus}"`);
    }

    const now = new Date();
    const returnDepartureDate = new Date(order.returnDepartureAt);
    const hoursUntilDeparture = Math.max(
      0,
      (returnDepartureDate.getTime() - now.getTime()) / (1000 * 3600),
    );
    const policy = order.returnPolicySnapshot || currentReturnPolicy();
    const calc = calculateReturnCancellationRefund({
      returnFreight: order.returnFreight || 0,
      returnInsuranceFee: order.returnInsuranceFee || 0,
      returnDepartureAt: returnDepartureDate,
      cancelledAt: now,
      cause: 'customer',
      policy,
    });

    const policyTierDescription =
      calc.tier === '>= 168h'
        ? 'Hủy trước ≥ 168 giờ (7 ngày)'
        : calc.tier === '72h-168h'
          ? 'Hủy từ 72 đến dưới 168 giờ'
          : 'Hủy dưới 72 giờ trước giờ đón';

    return {
      ...calc,
      shipmentId: order.id,
      tripType: order.tripType,
      returnStatus: order.returnStatus,
      returnDepartureAt: returnDepartureDate.toISOString(),
      currentTime: now.toISOString(),
      hoursUntilDeparture: Number(hoursUntilDeparture.toFixed(2)),
      returnFreightTotal: Number(order.returnFreight || 0),
      returnInsuranceTotal: Number(order.returnInsuranceFee || 0),
      freightRefundPercent: calc.refundPercent,
      freightRefundAmount: calc.freightRefund,
      insuranceRefundAmount: calc.insuranceRefund,
      totalRefundAmount: calc.total,
      requiresDualApproval: calc.total >= 20_000_000,
      policyTierDescription,
    };
  }

  async cancelReturnLegByCustomer(user: AuthenticatedUser, shipmentId: number, reason?: string) {
    const order = await this.getOrderById(user, shipmentId);
    if (order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được hủy chặng về của đơn hàng thuộc tài khoản mình');
    }
    if (order.tripType !== 'round_trip') {
      throw new BadRequestException('Đơn vận chuyển không phải là chuyến khứ hồi');
    }
    if (order.returnStatus === 'in_progress') {
      throw new ConflictException('Chặng về đã xuất phát (in_progress), không thể hủy');
    }
    if (order.returnStatus !== 'scheduled') {
      throw new ConflictException(`Không thể hủy chặng về ở trạng thái "${order.returnStatus}"`);
    }
    const activePaidStatuses = ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending'];
    if (!activePaidStatuses.includes(order.status)) {
      throw new ConflictException(
        order.status === 'awaiting_payment'
          ? 'Đơn hàng chưa thanh toán — vui lòng hủy đơn và đặt lại chuyến một chiều thay vì hủy chặng về'
          : `Không thể hủy chặng về khi đơn đang ở trạng thái "${order.status}"`,
      );
    }

    const policy = order.returnPolicySnapshot || currentReturnPolicy();
    const refund = calculateReturnCancellationRefund({
      returnFreight: order.returnFreight || 0,
      returnInsuranceFee: order.returnInsuranceFee || 0,
      returnDepartureAt: new Date(order.returnDepartureAt!),
      cancelledAt: new Date(),
      cause: 'customer',
      policy,
    });

    const finalReason = reason?.trim() || 'Khách hàng hủy chặng về';
    await this.ordersStore.cancelReturnLeg({
      shipmentId,
      actorId: Number(user.id),
      reason: finalReason,
      refund,
      cause: 'customer',
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách hàng hủy chặng về - Đơn ${code}`,
      `Khách hàng vừa hủy chặng về của đơn ${code}. Tiền hoàn dự kiến: ${refund.total.toLocaleString('vi-VN')} VND (Cước: ${refund.freightRefund.toLocaleString('vi-VN')}, Bảo hiểm: ${refund.insuranceRefund.toLocaleString('vi-VN')}). Lý do: ${finalReason}`,
      'status_update',
      shipmentId,
    );
    if (refund.total > 0) {
      await this.notificationsService.createNotification(
        order.customerId,
        `Đã hủy chặng về - Vui lòng cung cấp STK nhận hoàn tiền (${code})`,
        `Chặng về của đơn ${code} đã được hủy. Số tiền hoàn dự kiến ${refund.total.toLocaleString('vi-VN')} VND. Vui lòng vào trang chi tiết đơn hàng để điền thông tin tài khoản ngân hàng nhận hoàn tiền.`,
        'status_update',
        shipmentId,
      );
    }

    return {
      success: true,
      returnStatus: 'cancelled',
      refund,
    };
  }

  async cancelReturnLegByCompany(user: AuthenticatedUser, shipmentId: number, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('Bắt buộc phải nhập lý do hủy chặng về');
    }
    const order = await this.getOrderById(user, shipmentId);
    if (order.tripType !== 'round_trip') {
      throw new BadRequestException('Đơn vận chuyển không phải là chuyến khứ hồi');
    }
    if (order.returnStatus === 'in_progress') {
      throw new ConflictException('Chặng về đã xuất phát (in_progress), không thể hủy');
    }
    if (order.returnStatus !== 'scheduled') {
      throw new ConflictException(`Không thể hủy chặng về ở trạng thái "${order.returnStatus}"`);
    }
    const activePaidStatuses = ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending'];
    if (!activePaidStatuses.includes(order.status)) {
      throw new ConflictException(
        order.status === 'awaiting_payment'
          ? 'Đơn hàng chưa thanh toán — vui lòng hủy đơn và đặt lại chuyến một chiều thay vì hủy chặng về'
          : `Không thể hủy chặng về khi đơn đang ở trạng thái "${order.status}"`,
      );
    }

    const policy = order.returnPolicySnapshot || currentReturnPolicy();
    const refund = calculateReturnCancellationRefund({
      returnFreight: order.returnFreight || 0,
      returnInsuranceFee: order.returnInsuranceFee || 0,
      returnDepartureAt: new Date(order.returnDepartureAt!),
      cancelledAt: new Date(),
      cause: 'company',
      policy,
    });

    const finalReason = reason.trim();
    await this.ordersStore.cancelReturnLeg({
      shipmentId,
      actorId: Number(user.id),
      reason: finalReason,
      refund,
      cause: 'company',
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      `Công ty hủy chặng về - Đơn ${code}`,
      `Công ty rất tiếc phải hủy chặng về của đơn vận chuyển ${code}. Bạn được hoàn 100% chi phí chặng về (${refund.total.toLocaleString('vi-VN')} VND). Vui lòng vào chi tiết đơn hàng điền thông tin tài khoản ngân hàng để nhận hoàn tiền. Lý do: ${finalReason}`,
      'status_update',
      shipmentId,
    );

    return {
      success: true,
      returnStatus: 'cancelled',
      refund,
    };
  }

  async rescheduleReturnLeg(user: AuthenticatedUser, shipmentId: number, newReturnDepartureAt: string) {
    const order = await this.getOrderById(user, shipmentId);
    if (order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được đổi ngày về của đơn hàng thuộc tài khoản mình');
    }
    if (order.tripType !== 'round_trip') {
      throw new BadRequestException('Đơn vận chuyển không phải là chuyến khứ hồi');
    }
    const allowedRescheduleStatuses = [
      'paid_pending_review',
      'approved',
      'planning',
      'confirmed',
      'ready_to_depart',
      'in_transit',
      'return_pending',
    ];
    if (!allowedRescheduleStatuses.includes(String(order.status))) {
      throw new ConflictException(
        `Không thể đổi ngày chặng về khi đơn hàng đang ở trạng thái "${order.status}"`,
      );
    }
    if (order.returnStatus !== 'scheduled') {
      throw new ConflictException(`Không thể đổi ngày về khi chặng về ở trạng thái "${order.returnStatus}"`);
    }

    const newDate = new Date(newReturnDepartureAt);
    if (isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
      throw new BadRequestException('Thời điểm hẹn đón chặng về mới không hợp lệ hoặc ở quá khứ');
    }

    if (order.departureDate) {
      const depDate = new Date(order.departureDate);
      if (newDate <= depDate) {
        throw new BadRequestException('Thời điểm hẹn đón chặng về phải sau thời điểm khởi hành chặng đi');
      }
    }

    const policy = order.returnPolicySnapshot || currentReturnPolicy();
    const reschedule = calculateRescheduleFee({
      returnFreight: order.returnFreight || 0,
      returnDepartureAt: new Date(order.returnDepartureAt!),
      requestedAt: new Date(),
      policy,
    });

    await this.ordersStore.rescheduleReturnLeg({
      shipmentId,
      actorId: Number(user.id),
      oldAt: new Date(order.returnDepartureAt!),
      newAt: newDate,
      fee: reschedule.fee,
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Khách hàng đổi ngày chặng về - Đơn ${code}`,
      `Khách hàng đã đổi ngày chặng về đơn ${code} sang ${newDate.toISOString()} (Phí đổi: ${reschedule.fee.toLocaleString('vi-VN')} VND).`,
      'status_update',
      shipmentId,
    );

    return {
      success: true,
      newReturnDepartureAt: newDate.toISOString(),
      fee: reschedule.fee,
      free: reschedule.free,
    };
  }

  async feasibilityReview(
    manager: AuthenticatedUser,
    orderId: number,
    dto: FeasibilityReviewDto,
  ): Promise<TransportOrder> {
    const managerId = Number(manager.id);
    const updated = await this.ordersStore.feasibilityReview(orderId, managerId, dto);

    const customerCode = updated.customerRequestCode || updated.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    if (dto.decision === 'approve') {
      await this.notificationsService.createNotification(
        updated.customerId,
        `Đơn vận chuyển ${customerCode} đã được duyệt khả thi`,
        `Đơn hàng ${customerCode} đã được Quản lý vận hành xác nhận khả thi vận chuyển. Đội ngũ điều phối đang tiến hành xây dựng lộ trình chi tiết.`,
        'status_update',
        orderId,
      );
    } else {
      const reasonLabel = dto.reasonCode || 'Không đáp ứng được điều kiện vận chuyển';
      await this.notificationsService.createNotification(
        updated.customerId,
        `Thông báo không thể đáp ứng đơn ${customerCode}`,
        `Rất tiếc công ty không thể đáp ứng yêu cầu vận chuyển của quý khách (${reasonLabel}: ${dto.note}). Quý khách được hoàn tiền 100%. Vui lòng điền form thông tin tài khoản ngân hàng để nhận hoàn tiền.`,
        'status_update',
        orderId,
      );

      if (this.mailService && updated.contactEmail) {
        await this.mailService.sendNotificationEmail(
          updated.contactEmail,
          `Thông báo hoàn tiền đơn hàng ${customerCode}`,
          `Xin chào ${updated.contactName || 'Quý khách'},<br/><br/>Công ty rất tiếc phải thông báo hiện chưa thể đáp ứng đơn vận chuyển ${customerCode} vì lý do: <b>${reasonLabel}</b> (${dto.note}).<br/><br/>Quý khách sẽ được hoàn tiền 100% chi phí đã thanh toán (${Number(updated.totalCost).toLocaleString('vi-VN')} VND). Vui lòng truy cập trang chi tiết đơn hàng để điền thông tin tài khoản ngân hàng nhận tiền hoàn.<br/><br/>Trân trọng,<br/>EquiTransit Logistics`,
        );
      }
    }

    return updated;
  }

  async getOrderInvoice(user: AuthenticatedUser, orderId: number): Promise<any> {
    return this.ordersStore.getOrderInvoice(orderId, Number(user.id), user.role);
  }

  async getRefundFormInfo(user: AuthenticatedUser, orderId: number): Promise<any> {
    return this.ordersStore.getRefundFormInfo(orderId, Number(user.id), user.role);
  }

  async submitRefundForm(user: AuthenticatedUser, orderId: number, dto: SubmitRefundFormDto): Promise<any> {
    return this.ordersStore.submitRefundForm(orderId, Number(user.id), dto);
  }
}
