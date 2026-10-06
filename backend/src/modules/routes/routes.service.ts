import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoutesStore } from './routes.store';
import { OrdersStore } from '../orders/orders.store';
import { FleetStore } from '../fleet/fleet.store';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  FullTripPlan,
  RouteEntity,
  RouteStatus,
  RouteStopEntity,
  RouteStopType,
  RouteStopUpdateEntity,
} from './routes.types';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { PublishTripDto } from './dto/publish-trip.dto';
import { ShipmentStatus } from '../orders/orders.types';

@Injectable()
export class RoutesService {
  constructor(
    private readonly routesStore: RoutesStore,
    private readonly ordersStore: OrdersStore,
    private readonly fleetStore: FleetStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getRouteByShipmentId(shipmentId: number): Promise<RouteEntity> {
    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) {
      throw new NotFoundException(`Chưa có lộ trình nào được lập cho đơn vận chuyển #${shipmentId}`);
    }
    return route;
  }

  async getFullTripPlan(shipmentId: number): Promise<FullTripPlan> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    const assignedVehicles = await this.fleetStore.findAssignedVehicles(shipmentId);
    const assignedStaff = await this.fleetStore.findAssignedStaff(shipmentId);

    const totalCapacity = assignedVehicles.reduce((sum, v) => sum + v.vehicle.capacity, 0);

    // Evaluate readiness to publish according to Flow 3 rules:
    const missingRequirements: string[] = [];

    if (order.status !== ShipmentStatus.APPROVED && order.status !== ShipmentStatus.PLANNING) {
      missingRequirements.push('Đơn vận chuyển phải được phê duyệt trước khi xuất bản lịch trình');
    }

    if (!route || !route.stops || route.stops.length < 2) {
      missingRequirements.push('Cần lập lộ trình di chuyển với tối thiểu 2 điểm dừng (Điểm đi và Điểm đến)');
    }

    if (assignedVehicles.length === 0) {
      missingRequirements.push('Chưa phân công phương tiện vận chuyển cho chuyến đi');
    } else if (totalCapacity < order.requestedHorseCount) {
      missingRequirements.push(
        `Sức chứa của phương tiện (${totalCapacity} con) chưa đủ cho số lượng ngựa của đơn (${order.requestedHorseCount} con)`,
      );
    }

    const hasDriverOrEscort = assignedStaff.some(
      (s) => s.roleInShipment === 'driver' || s.roleInShipment === 'escort',
    );
    if (!hasDriverOrEscort) {
      missingRequirements.push('Cần phân công ít nhất một tài xế (driver) hoặc hộ tống (escort) cho chuyến đi');
    }

    return {
      order,
      route: route ?? null,
      assignedVehicles,
      assignedStaff,
      totalCapacity,
      isReadyToPublish: missingRequirements.length === 0,
      missingRequirements,
    };
  }

  async createOrUpdateRoute(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateRouteDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (
      order.status !== ShipmentStatus.APPROVED &&
      order.status !== ShipmentStatus.PLANNING &&
      order.status !== ShipmentStatus.IN_TRANSIT
    ) {
      throw new BadRequestException(
        `Không thể lập lộ trình cho đơn hàng đang ở trạng thái "${order.status}"`,
      );
    }

    if (dto.stops.length < 2) {
      throw new BadRequestException('Lộ trình phải có ít nhất 2 điểm dừng (Điểm xuất phát và Điểm kết thúc)');
    }

    // Key rule Flow 3: A route must identify required border, quarantine, and handover stops for international orders.
    const isCrossBorder =
      order.originLocation.toLowerCase().includes('singapore') ||
      order.originLocation.toLowerCase().includes('malaysia') ||
      order.originLocation.toLowerCase().includes('thailand') ||
      order.destinationLocation.toLowerCase().includes('singapore') ||
      order.destinationLocation.toLowerCase().includes('malaysia') ||
      order.destinationLocation.toLowerCase().includes('thailand');

    if (isCrossBorder) {
      const hasBorderOrQuarantine = dto.stops.some(
        (s) => s.stopType === RouteStopType.BORDER_CHECK || s.stopType === RouteStopType.QUARANTINE,
      );
      if (!hasBorderOrQuarantine) {
        throw new BadRequestException(
          'Đơn vận chuyển xuyên quốc gia bắt buộc phải có ít nhất 1 điểm dừng Cửa khẩu (border_check) hoặc Trạm kiểm dịch (quarantine)',
        );
      }
    }

    let route = await this.routesStore.findRouteByShipmentId(shipmentId);
    let routeId: number;

    if (route) {
      routeId = route.id;
      await this.routesStore.updateRouteDetails(routeId, dto.routeName, dto.totalDistanceKm);
    } else {
      routeId = await this.routesStore.createRoute(shipmentId, dto.routeName, dto.totalDistanceKm);
    }

    await this.routesStore.replaceRouteStops(routeId, dto.stops);

    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  async updateSchedule(
    user: AuthenticatedUser,
    routeId: number,
    dto: UpdateScheduleDto,
  ): Promise<RouteEntity> {
    const route = await this.routesStore.findRouteById(routeId);
    if (!route) {
      throw new NotFoundException(`Không tìm thấy lộ trình #${routeId}`);
    }

    // Key rule Flow 3: Schedule changes after publication must preserve the old schedule and record a reason.
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('Bắt buộc phải cung cấp lý do điều chỉnh lịch trình (reason)');
    }

    for (const item of dto.stops) {
      await this.routesStore.updateStopSchedule(item.stopId, item.plannedArrival, item.plannedDeparture);
    }

    const order = await this.ordersStore.findById(route.shipmentId);
    if (order) {
      await this.notificationsService.createNotification(
        order.customerId,
        'Cập nhật điều chỉnh lịch trình vận chuyển',
        `Lịch trình chuyến đi #${order.requestCode || order.id} đã được điều chỉnh. Lý do: "${dto.reason}".`,
        'status_update',
        route.shipmentId,
      );
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  async publishTripPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: PublishTripDto,
  ): Promise<FullTripPlan> {
    const plan = await this.getFullTripPlan(shipmentId);

    // Key rule Flow 3: A trip cannot be published without an approved order, assigned capacity, route, and responsible staff.
    if (!plan.isReadyToPublish) {
      throw new BadRequestException(
        `Không thể xuất bản kế hoạch chuyến đi do chưa đủ điều kiện: ${plan.missingRequirements.join('; ')}`,
      );
    }

    // Xuất bản chuyến đi: đổi status sang in_transit, route sang active
    await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.IN_TRANSIT);
    await this.routesStore.updateRouteStatus(plan.route!.id, RouteStatus.ACTIVE);

    // Thông báo cho khách hàng
    await this.notificationsService.createNotification(
      plan.order.customerId,
      'Kế hoạch chuyến đi đã chính thức phát hành',
      `Lịch trình vận chuyển cho ${plan.order.requestedHorseCount} con ngựa của bạn đã được xuất bản. Chuyến đi sẵn sàng xuất phát.`,
      'status_update',
      shipmentId,
    );

    // Thông báo cho toàn bộ nhân sự được phân công
    for (const staff of plan.assignedStaff) {
      await this.notificationsService.createNotification(
        staff.userId,
        'Lịch trình chuyến đi đã được xuất bản',
        `Kế hoạch chuyến đi #${plan.order.requestCode || shipmentId} đã phát hành chính thức. Vui lòng kiểm tra lộ trình và sẵn sàng thực hiện nhiệm vụ.`,
        'status_update',
        shipmentId,
      );
    }

    return this.getFullTripPlan(shipmentId);
  }

  async recordStopProgress(
    user: AuthenticatedUser,
    stopId: number,
    dto: RecordStopProgressDto,
  ): Promise<RouteStopEntity> {
    const stop = await this.routesStore.findStopById(stopId);
    if (!stop) {
      throw new NotFoundException(`Không tìm thấy điểm dừng #${stopId}`);
    }

    await this.routesStore.createStopUpdate(stopId, Number(user.id), dto);

    const updatedStop = (await this.routesStore.findStopById(stopId))!;
    const route = await this.routesStore.findRouteById(stop.routeId);

    if (route) {
      const order = await this.ordersStore.findById(route.shipmentId);
      if (order) {
        await this.notificationsService.createNotification(
          order.customerId,
          `Cập nhật lộ trình: ${stop.locationName}`,
          `Đoàn vận chuyển đã cập nhật trạng thái "${dto.status}" tại ${stop.locationName}${dto.notes ? `: ${dto.notes}` : ''}.`,
          'status_update',
          route.shipmentId,
        );
      }
    }

    return updatedStop;
  }
}
