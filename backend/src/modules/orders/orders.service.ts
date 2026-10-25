import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrdersStore, OrderQueryParams, PaginatedOrders } from './orders.store';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
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

    // Kiểm tra microchip trùng lặp trước khi tạo đơn
    if (dto.horses && dto.horses.length > 0) {
      for (const h of dto.horses) {
        if (h.microchipNumber) {
          const exists = await this.ordersStore.checkMicrochipExists(h.microchipNumber);
          if (exists) {
            throw new BadRequestException(
              `Số microchip "${h.microchipNumber}" của ngựa "${h.name}" đã tồn tại trong hệ thống`,
            );
          }
        }
      }
    }

    const shipmentId = await this.ordersStore.createShipment(customerId, dto);
    const created = await this.ordersStore.findShipmentById(shipmentId);
    if (!created) {
      throw new NotFoundException('Failed to retrieve newly created shipment');
    }
    return created;
  }

  async getMyOrders(user: AuthenticatedUser, params: OrderQueryParams = {}): Promise<PaginatedOrders> {
    return this.ordersStore.findShipmentsByCustomer(Number(user.id), params);
  }

  async getAllOrders(params: OrderQueryParams = {}): Promise<PaginatedOrders> {
    return this.ordersStore.findAllShipments(params);
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
}
