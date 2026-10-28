import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoutesStore } from './routes.store';
import { OrdersStore } from '../orders/orders.store';
import { FleetStore } from '../fleet/fleet.store';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import {
  AirlineEntity,
  AirportEntity,
  FullTripPlan,
  MasterStopEntity,
  PlanStatus,
  RouteEntity,
  RouteStatus,
  RouteStopEntity,
  RouteStopType,
  TripPlanReadiness,
} from './routes.types';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { PublishTripDto } from './dto/publish-trip.dto';
import { SetStrategicFrameworkDto } from './dto/set-strategic-framework.dto';
import { BuildDetailedPlanDto } from './dto/build-detailed-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { ConfirmAssignmentDto } from './dto/confirm-assignment.dto';
import { ShipmentStatus } from '../orders/orders.types';
import { MomoPaymentStore } from '../orders/momo-payment.store';

@Injectable()
export class RoutesService {
  constructor(
    private readonly routesStore: RoutesStore,
    private readonly ordersStore: OrdersStore,
    private readonly fleetStore: FleetStore,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    private readonly momoPaymentStore: MomoPaymentStore,
  ) {}

  // --- Master Data for Flow 3 ---
  async getMasterData(): Promise<{
    airlines: AirlineEntity[];
    airports: AirportEntity[];
    masterStops: MasterStopEntity[];
  }> {
    const [airlines, airports, masterStops] = await Promise.all([
      this.routesStore.findAllAirlines(),
      this.routesStore.findAllAirports(),
      this.routesStore.findAllMasterStops(),
    ]);
    return { airlines, airports, masterStops };
  }

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

    const missingRequirements: string[] = [];

    if (
      order.status !== ShipmentStatus.APPROVED &&
      order.status !== ShipmentStatus.PLANNING &&
      (order.status as any) !== 'confirmed' &&
      (order.status as any) !== 'ready_to_depart'
    ) {
      missingRequirements.push('Đơn vận chuyển phải được phê duyệt trước khi lập và xuất bản lịch trình');
    }

    if (!route || (!route.legs || route.legs.length === 0)) {
      missingRequirements.push('Cần dựng ít nhất 1 chặng vận chuyển cho kế hoạch');
    }

    if (assignedVehicles.length === 0 && (!route?.legs || route.legs.some((l) => l.legType === 'road'))) {
      missingRequirements.push('Chưa phân công phương tiện vận chuyển cho các chặng đường bộ');
    } else if (totalCapacity < order.requestedHorseCount && totalCapacity > 0) {
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

  // --- Step 1a: Manager Sets Strategic Framework ---
  async setStrategicFramework(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: SetStrategicFrameworkDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const routeId = await this.routesStore.saveStrategicFramework(shipmentId, dto);

    // Cập nhật trạng thái shipment sang planning nếu đang là approved
    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    // Thông báo cho Coordinator được chỉ định
    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    if (dto.assignedCoordinatorId) {
      await this.notificationsService.createNotification(
        dto.assignedCoordinatorId,
        `Giao nhiệm vụ lập chi tiết lộ trình - Đơn ${code}`,
        `Quản lý đã thiết lập khung chiến lược cho chuyến đi ${code} (${dto.managerVehicleType}${dto.managerMainCorridor ? ` qua ${dto.managerMainCorridor}` : ''}). Vui lòng dựng các chặng và điểm dừng chi tiết.`,
        'status_update',
        shipmentId,
      );
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  // --- Step 1b: Coordinator Builds Detailed Plan ---
  async buildDetailedPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: BuildDetailedPlanDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let route = await this.routesStore.findRouteByShipmentId(shipmentId);
    let routeId: number;
    if (!route) {
      routeId = await this.routesStore.createRoute(shipmentId, dto.routeName, dto.totalDistanceKm);
    } else {
      routeId = route.id;
    }

    if (dto.legs.length === 0) {
      throw new BadRequestException('Kế hoạch chuyến đi phải có ít nhất 1 chặng vận chuyển (Leg)');
    }

    await this.routesStore.saveDetailedPlan(routeId, dto);

    // Gán phương tiện từ các chặng đường bộ vào shipment_vehicle nếu có
    const vehicleIds = dto.legs
      .filter((l) => l.legType === 'road' && l.vehicleId)
      .map((l) => l.vehicleId as number);
    if (vehicleIds.length > 0) {
      const uniqueVehicles = Array.from(new Set(vehicleIds));
      await this.fleetStore.assignVehicles(shipmentId, uniqueVehicles);
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  // --- Coordinator Submits Plan For Manager Approval ---
  async submitPlanForApproval(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) {
      throw new BadRequestException('Chưa có kế hoạch lộ trình nào được lập cho đơn hàng này');
    }

    if (!route.legs || route.legs.length === 0) {
      throw new BadRequestException('Vui lòng dựng đầy đủ các chặng vận chuyển trước khi gửi duyệt');
    }

    await this.routesStore.updatePlanStatus(route.id, PlanStatus.PENDING_APPROVAL);

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    // Gửi thông báo đến Logistics Manager
    const staffList = await this.fleetStore.findAvailableStaff();
    const managers = staffList.filter((s) => s.roleName.toLowerCase().includes('manager'));
    for (const m of managers) {
      await this.notificationsService.createNotification(
        m.id,
        `Yêu cầu phê duyệt kế hoạch chuyến đi - Đơn ${code}`,
        `Coordinator ${user.email} đã hoàn thiện kế hoạch chi tiết cho đơn ${code} gồm ${route.legs.length} chặng. Vui lòng xem xét và phê duyệt.`,
        'status_update',
        shipmentId,
      );
    }

    return (await this.routesStore.findRouteById(route.id))!;
  }

  // --- Step 2: Manager Reviews Plan ---
  async reviewTripPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: ReviewPlanDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) {
      throw new NotFoundException(`Không tìm thấy kế hoạch chuyến đi #${shipmentId}`);
    }

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    if (dto.status === 'approved') {
      await this.routesStore.updatePlanStatus(
        route.id,
        PlanStatus.APPROVED,
        undefined,
        Number(user.id),
      );

      // Thông báo cho Coordinator phụ trách
      if (route.assignedCoordinatorId) {
        await this.notificationsService.createNotification(
          route.assignedCoordinatorId,
          `Kế hoạch lộ trình đơn ${code} ĐÃ ĐƯỢC DUYỆT`,
          `Quản lý ${user.email} đã phê duyệt kế hoạch chi tiết của chuyến đi ${code}. Kế hoạch sẵn sàng để phân công nhân sự.`,
          'status_update',
          shipmentId,
        );
      }
    } else {
      if (!dto.rejectionReason || dto.rejectionReason.trim().length === 0) {
        throw new BadRequestException('Bắt buộc phải nhập lý do trả về để Coordinator điều chỉnh');
      }

      await this.routesStore.updatePlanStatus(
        route.id,
        PlanStatus.DRAFT,
        dto.rejectionReason,
        Number(user.id),
      );

      // Thông báo trả về cho Coordinator
      if (route.assignedCoordinatorId) {
        await this.notificationsService.createNotification(
          route.assignedCoordinatorId,
          `Kế hoạch chuyến đi ${code} yêu cầu điều chỉnh`,
          `Quản lý đã trả về kế hoạch chuyến đi ${code} với lý do: "${dto.rejectionReason}". Vui lòng cập nhật lại.`,
          'status_update',
          shipmentId,
        );
      }
    }

    return (await this.routesStore.findRouteById(route.id))!;
  }

  // --- Step 3: Driver / Escort Confirms Assignment ---
  async confirmTripAssignment(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: ConfirmAssignmentDto,
  ): Promise<{ success: boolean; message: string; isFullyConfirmed: boolean }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let targetUserId = Number(user.id);
    if (isNaN(targetUserId) || user.role === UserRole.ADMIN) {
      if (dto.driverUserId) {
        targetUserId = Number(dto.driverUserId);
      } else {
        const staff = await this.fleetStore.findAssignedStaff(shipmentId);
        const driverOrEscort = staff.find((s) => !s.isConfirmed);
        if (driverOrEscort) {
          targetUserId = driverOrEscort.userId;
        }
      }
    }

    const success = await this.routesStore.confirmStaffAssignment(
      shipmentId,
      targetUserId,
      dto.confirmationNotes,
    );
    if (!success) {
      throw new BadRequestException('Bạn không nằm trong danh sách nhân sự được phân công cho chuyến đi này');
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    // Kiểm tra xem tất cả tài xế/hộ tống đã xác nhận chưa
    const allConfirmed = await this.routesStore.checkAllDriversConfirmed(shipmentId);
    if (allConfirmed && route) {
      await this.routesStore.updatePlanStatus(route.id, PlanStatus.CONFIRMED);
      await this.ordersStore.updateStatus(shipmentId, 'confirmed' as any);

      // Thông báo cho khách hàng lịch trình dự kiến đã chốt
      await this.notificationsService.createNotification(
        order.customerId,
        `Lịch trình vận chuyển đơn ${code} đã được xác nhận`,
        `Đội ngũ điều phối và tài xế đã hoàn tất việc xác nhận lịch trình chuyến đi ${code}.`,
        'status_update',
        shipmentId,
      );

      // Tự động kiểm tra cổng Ready to depart
      await this.evaluateReadyToDepartGate(user, shipmentId);
    }

    return {
      success: true,
      message: 'Đã xác nhận nhận nhiệm vụ chuyến đi thành công.',
      isFullyConfirmed: allConfirmed,
    };
  }

  async declineTripAssignment(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: { reason: string; driverUserId?: number },
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let targetUserId = Number(user.id);
    if (isNaN(targetUserId) || user.role === UserRole.ADMIN) {
      if (dto.driverUserId) {
        targetUserId = Number(dto.driverUserId);
      } else {
        const staff = await this.fleetStore.findAssignedStaff(shipmentId);
        const driverOrEscort = staff.find((s) => !s.isConfirmed);
        if (driverOrEscort) {
          targetUserId = driverOrEscort.userId;
        }
      }
    }

    const success = await this.routesStore.declineStaffAssignment(
      shipmentId,
      targetUserId,
      dto.reason || 'Lý do sức khỏe / việc đột xuất',
    );
    if (!success) {
      throw new BadRequestException('Bạn không nằm trong danh sách nhân sự được phân công cho chuyến đi này');
    }

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    // Bắn thông báo khẩn cấp đến các Logistics Manager
    const managers = await this.fleetStore.findAvailableStaff();
    const logisticsManagers = managers.filter((m) => m.roleName.toLowerCase().includes('manager'));
    for (const lm of logisticsManagers) {
      await this.notificationsService.createNotification(
        lm.id,
        `⚠️ Nhân sự TỪ CHỐI chuyến ${code}`,
        `Tài xế/Hộ tống phụ trách chuyến đi ${code} đã TỪ CHỐI nhận nhiệm vụ. Lý do: "${dto.reason}". Vui lòng chỉ định nhân sự thay thế.`,
        'incident',
        shipmentId,
      );
    }

    return {
      success: true,
      message: 'Đã từ chối nhận chuyến và thông báo khẩn tới Logistics Manager.',
    };
  }

  // --- Step 4: Ready to Depart Gate Evaluation ---
  async getTripPlanReadiness(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<TripPlanReadiness> {
    return this.evaluateReadyToDepartGate(user, shipmentId);
  }

  private async evaluateReadyToDepartGate(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<TripPlanReadiness> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    const isPlanConfirmed =
      route?.planStatus === PlanStatus.CONFIRMED ||
      route?.planStatus === PlanStatus.READY_TO_DEPART ||
      route?.planStatus === PlanStatus.IN_TRANSIT;

    let isLegalCompliant = false;
    try {
      const checklist = await this.documentsService.getOrderComplianceChecklist(user, shipmentId);
      isLegalCompliant = Boolean(checklist.isFullyCompliant);
    } catch {
      isLegalCompliant = false;
    }

    // Điều kiện 3: Thanh toán cước vận chuyển (MoMo/Thẻ ngân hàng)
    let isPaymentSucceeded = false;
    const totalCost = Number(order.totalCost || 0);
    if (totalCost > 0) {
      isPaymentSucceeded = await this.momoPaymentStore.isPaymentSucceeded(shipmentId);
    } else {
      // Nếu đơn hàng không có cước hoặc cước = 0 thì coi như đã thỏa mãn
      isPaymentSucceeded = true;
    }

    const pendingConditions: string[] = [];
    if (!isPlanConfirmed) {
      if (route?.planStatus === PlanStatus.DRAFT) {
        pendingConditions.push('Kế hoạch chuyến đi đang ở trạng thái Nháp (Draft), chưa hoàn tất gửi duyệt.');
      } else if (route?.planStatus === PlanStatus.PENDING_APPROVAL) {
        pendingConditions.push('Kế hoạch lộ trình đang chờ Logistics Manager phê duyệt.');
      } else if (route?.planStatus === PlanStatus.APPROVED) {
        pendingConditions.push('Kế hoạch đã duyệt nhưng đang chờ toàn bộ tài xế (Driver/Escort) bấm xác nhận nhận chuyến.');
      } else {
        pendingConditions.push('Kế hoạch vận chuyển chưa được xác nhận đầy đủ.');
      }
    }

    if (!isLegalCompliant) {
      pendingConditions.push('Hồ sơ pháp lý, xét nghiệm và kiểm dịch (Flow 2) chưa được duyệt hoàn tất 100%.');
    }

    if (!isPaymentSucceeded) {
      pendingConditions.push(
        `Đang chờ khách hàng hoàn tất thanh toán cước vận chuyển qua MoMo / Thẻ (${totalCost.toLocaleString('vi-VN')} VND).`,
      );
    }

    const isReadyToDepart = isPlanConfirmed && isLegalCompliant && isPaymentSucceeded;

    // Tự động chuyển trạng thái khi CẢ 3 điều kiện thỏa mãn
    if (
      isReadyToDepart &&
      route &&
      route.planStatus !== PlanStatus.READY_TO_DEPART &&
      route.planStatus !== PlanStatus.IN_TRANSIT
    ) {
      await this.routesStore.updatePlanStatus(route.id, PlanStatus.READY_TO_DEPART);
      await this.ordersStore.updateStatus(shipmentId, 'ready_to_depart' as any);

      // Thông báo chính thức cho khách hàng và tài xế
      await this.notificationsService.createNotification(
        order.customerId,
        `Chuyến đi ${code} ĐÃ ĐỦ ĐIỀU KIỆN XUẤT PHÁT (Ready to depart)`,
        `Kế hoạch lộ trình, hồ sơ kiểm dịch và thanh toán cước vận chuyển đã hoàn tất 100%. Đoàn vận chuyển sẵn sàng khởi hành.`,
        'status_update',
        shipmentId,
      );
    }

    return {
      shipmentId,
      orderCode: code,
      isPlanConfirmed,
      isLegalCompliant,
      isPaymentSucceeded,
      isReadyToDepart,
      currentShipmentStatus: order.status,
      currentPlanStatus: route?.planStatus || PlanStatus.DRAFT,
      pendingConditions,
    };
  }

  // --- Legacy Compatibility Methods ---
  async createOrUpdateRoute(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateRouteDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (dto.stops.length < 2) {
      throw new BadRequestException('Lộ trình phải có ít nhất 2 điểm dừng (Điểm xuất phát và Điểm kết thúc)');
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

    if (!plan.isReadyToPublish) {
      throw new BadRequestException(
        `Không thể xuất bản kế hoạch chuyến đi do chưa đủ điều kiện: ${plan.missingRequirements.join('; ')}`,
      );
    }

    await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.IN_TRANSIT);
    await this.routesStore.updateRouteStatus(plan.route!.id, RouteStatus.ACTIVE);
    await this.routesStore.updatePlanStatus(plan.route!.id, PlanStatus.IN_TRANSIT);

    await this.notificationsService.createNotification(
      plan.order.customerId,
      'Kế hoạch chuyến đi đã chính thức xuất phát',
      `Lịch trình vận chuyển cho ${plan.order.requestedHorseCount} con ngựa của bạn đã bắt đầu hành trình.`,
      'status_update',
      shipmentId,
    );

    for (const staff of plan.assignedStaff) {
      await this.notificationsService.createNotification(
        staff.userId,
        'Lịch trình chuyến đi đã xuất phát',
        `Chuyến đi #${plan.order.requestCode || shipmentId} đã chính thức lăn bánh. Vui lòng cập nhật nhật ký hành trình tại các trạm dừng.`,
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

  // --- Flow 5: Incident Reporting & Emergency Reroute ---
  async reportIncident(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: { incidentType: string; description: string; severity?: string },
  ): Promise<{ success: boolean; incidentId: number }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const incidentId = await this.routesStore.reportIncident({
      shipmentId,
      reportedBy: Number(user.id),
      incidentType: dto.incidentType || 'traffic_delay',
      description: dto.description,
      severity: dto.severity || 'high',
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    // Gửi thông báo khẩn tới tất cả Coordinator và Manager
    const staffList = await this.fleetStore.findAvailableStaff();
    const ops = staffList.filter(
      (s) =>
        s.roleName.toLowerCase().includes('coordinator') ||
        s.roleName.toLowerCase().includes('manager'),
    );
    for (const op of ops) {
      await this.notificationsService.createNotification(
        op.id,
        `🚨 SỰ CỐ TRÊN ĐƯỜNG: Đơn ${code}`,
        `Báo cáo sự cố [${dto.incidentType}]: "${dto.description}". Lộ trình của chuyến đi ${code} đã được mở quyền hiệu chỉnh chặng khẩn cấp.`,
        'incident',
        shipmentId,
      );
    }

    return { success: true, incidentId };
  }

  async resolveIncident(
    user: AuthenticatedUser,
    incidentId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.routesStore.resolveIncident(incidentId);
    return {
      success: true,
      message: 'Đã giải quyết sự cố và hoàn tất điều chỉnh lộ trình an toàn.',
    };
  }
}

