import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersStore: OrdersStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createOrder(user: AuthenticatedUser, dto: CreateOrderDto): Promise<TransportOrder> {
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
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Yêu cầu vận chuyển mới: ${code}`,
      `Khách hàng ${customerDisplayName} (${user.email}) vừa gửi yêu cầu vận chuyển mới ${code} từ "${dto.originLocation}" đến "${dto.destinationLocation}" (${horseCount} ngựa). Vui lòng xem xét và duyệt đơn.`,
      'status_update',
      shipmentId,
    );

    return created;
  }

  async getMyOrders(user: AuthenticatedUser): Promise<TransportOrder[]> {
    return this.ordersStore.findShipmentsByCustomer(Number(user.id));
  }

  async getAllOrders(statusFilter?: ShipmentStatus): Promise<TransportOrder[]> {
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

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new BadRequestException(
        `Chỉ đơn hàng đang ở trạng thái "${ShipmentStatus.REQUESTED}" mới có thể phê duyệt. Trạng thái hiện tại: "${order.status}"`,
      );
    }

    const managerId = Number(manager.id);
    await this.ordersStore.updateShipmentApproval(
      orderId,
      managerId,
      ShipmentStatus.APPROVED,
      null,
      dto.totalCost ?? 0,
      dto.transportMode,
    );

    // 1. Gửi thông báo đến customer (dùng mã đơn của riêng khách hàng)
    const customerCode = order.customerRequestCode || order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      `Đơn vận chuyển ${customerCode} đã được phê duyệt`,
      `Yêu cầu vận chuyển ${customerCode} từ "${order.originLocation}" đến "${order.destinationLocation}" đã được Logistics Manager phê duyệt. Chuyên viên kiểm dịch đang rà soát quy chế nước đến và sẽ gửi danh mục hồ sơ cần nộp cho quý khách.`,
      'status_update',
      orderId,
    );

    // 2. Chuyển giao sang Flow 2: Gửi thông báo đến Transport Specialist (dùng mã hệ thống)
    const staffCode = `REQ-${String(orderId).padStart(3, '0')}`;
    const customerName = order.customerName || order.contactName || 'Khách hàng';
    await this.notificationsService.notifyRole(
      'Transport Specialist',
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

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new BadRequestException(
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

    if (order.status !== ShipmentStatus.REQUESTED) {
      throw new BadRequestException(
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

    if (
      order.status !== ShipmentStatus.CHANGE_REQUESTED &&
      order.status !== ShipmentStatus.REQUESTED
    ) {
      throw new BadRequestException(
        `Chỉ đơn hàng ở trạng thái "${ShipmentStatus.CHANGE_REQUESTED}" hoặc "${ShipmentStatus.REQUESTED}" mới có thể chỉnh sửa. Trạng thái hiện tại: "${order.status}"`,
      );
    }

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

    await this.ordersStore.completeShipment(orderId);

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

    if (order.status === ShipmentStatus.COMPLETED) {
      throw new BadRequestException('Không thể hủy đơn vận chuyển đã hoàn tất');
    }

    if (order.status === ShipmentStatus.IN_TRANSIT) {
      throw new BadRequestException('Không thể hủy đơn vận chuyển đang trong hành trình di chuyển');
    }

    if (order.status === ShipmentStatus.CANCELLED) {
      throw new BadRequestException('Đơn vận chuyển này đã được hủy trước đó');
    }

    await this.ordersStore.cancelShipment(orderId);

    const code = order.requestCode || `REQ-${String(orderId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      order.customerId,
      'Đơn vận chuyển đã được hủy',
      `Đơn vận chuyển mã ${code} đã được hủy theo yêu cầu của bạn. Trạng thái các chú ngựa trong đơn đã được mở lại.`,
      'status_update',
      orderId,
    );

    const updated = await this.ordersStore.findShipmentById(orderId);
    return updated!;
  }
}
