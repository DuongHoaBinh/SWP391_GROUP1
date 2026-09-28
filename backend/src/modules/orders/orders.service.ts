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
    );

    // Gửi thông báo đến customer
    await this.notificationsService.createNotification(
      order.customerId,
      'Yêu cầu vận chuyển đã được phê duyệt',
      `Yêu cầu vận chuyển mã #${orderId} từ "${order.originLocation}" đến "${order.destinationLocation}" đã được Logistics Manager phê duyệt. Bộ phận điều phối sẽ chuẩn bị phương tiện và lộ trình tiếp theo.`,
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
    await this.notificationsService.createNotification(
      order.customerId,
      'Yêu cầu vận chuyển bị từ chối',
      `Yêu cầu vận chuyển mã #${orderId} đã bị từ chối bởi Logistics Manager. Lý do: ${dto.reason}`,
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
    await this.notificationsService.createNotification(
      order.customerId,
      'Yêu cầu chỉnh sửa thông tin vận chuyển',
      `Đơn vận chuyển mã #${orderId} cần được chỉnh sửa: "${dto.reason}". Vui lòng cập nhật lại thông tin và gửi lại đơn để tiếp tục xét duyệt.`,
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
}
