import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
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
import { ShipmentLifecycle } from '../../common/shipment-lifecycle';
import { applyConvoyCapacity, assertRoadCapacity } from '../fleet/capacity-policy';
import { jetStallCount } from '../fleet/allocation-policy';

@Injectable()
export class RoutesService implements OnModuleInit {
  constructor(
    private readonly routesStore: RoutesStore,
    private readonly ordersStore: OrdersStore,
    private readonly fleetStore: FleetStore,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    private readonly lifecycle: ShipmentLifecycle,
  ) {}

  onModuleInit() {
    this.lifecycle.onChange(shipmentId => this.evaluateReadyToDepartGate(shipmentId));
  }

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

  private redactRouteForCustomer(route: RouteEntity, order: { originLocation: string; destinationLocation: string }): RouteEntity {
    const visibleStops = (route.stops || [])
      .filter((s) => s.stopType !== RouteStopType.TRANSFER_HUB)
      .map((s, idx) => ({ ...s, sequenceNo: idx + 1 }));
    const rawLegs = route.legs || [];
    const maskedLegs = rawLegs.map((leg, idx) => {
      if (!leg.roadTripId) return leg;
      return {
        ...leg,
        roadTripId: null,
        originLocation: idx === 0 ? order.originLocation : leg.originLocation,
        destinationLocation: idx === rawLegs.length - 1 ? order.destinationLocation : leg.destinationLocation,
      };
    });
    return {
      ...route,
      stops: visibleStops,
      legs: maskedLegs,
    };
  }

  private async assertDriverAssignedToShipment(shipmentId: number, userId: number, message: string): Promise<void> {
    if (typeof this.fleetStore?.findAssignedStaff !== 'function') {
      throw new ForbiddenException(message);
    }
    const assigned = await this.fleetStore.findAssignedStaff(shipmentId);
    const isAssigned = assigned.some((s) => Number(s.userId) === Number(userId));
    if (!isAssigned) {
      throw new ForbiddenException(message);
    }
  }

  private async resolveRouteForViewer(
    shipmentId: number,
    user?: AuthenticatedUser,
  ): Promise<RouteEntity | null> {
    let customerOrder: { originLocation: string; destinationLocation: string; customerId: number } | undefined;
    if (user?.role === UserRole.CUSTOMER) {
      const order = await this.ordersStore.findById(shipmentId);
      if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
      if (order.customerId !== Number(user.id)) throw new ForbiddenException('Bạn chỉ được xem lộ trình đơn của mình');
      customerOrder = order;
    } else if (user?.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem lộ trình của chuyến đi được phân công cho mình',
      );
    }
    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) return null;
    return customerOrder ? this.redactRouteForCustomer(route, customerOrder) : route;
  }

  async getRouteByShipmentId(shipmentId: number, user?: AuthenticatedUser): Promise<RouteEntity> {
    const route = await this.resolveRouteForViewer(shipmentId, user);
    if (!route) {
      throw new NotFoundException(`Chưa có lộ trình nào được lập cho đơn vận chuyển #${shipmentId}`);
    }
    return route;
  }

  async findOptionalRouteByShipmentId(
    shipmentId: number,
    user?: AuthenticatedUser,
  ): Promise<{ route: RouteEntity | null }> {
    const route = await this.resolveRouteForViewer(shipmentId, user);
    return { route };
  }

  async getFullTripPlan(shipmentId: number, user?: AuthenticatedUser): Promise<FullTripPlan> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (user?.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem kế hoạch đơn của mình');
    }
    if (user?.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem kế hoạch của chuyến đi được phân công cho mình',
      );
    }

    const rawRoute = await this.routesStore.findRouteByShipmentId(shipmentId);
    const route = rawRoute && user?.role === UserRole.CUSTOMER ? this.redactRouteForCustomer(rawRoute, order) : rawRoute;
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

    const requiredSlots = typeof this.fleetStore.findRequiredStallSlots === 'function'
      ? await this.fleetStore.findRequiredStallSlots(shipmentId, order.requestedHorseCount)
      : order.requestedHorseCount;

    if (assignedVehicles.length === 0 && (!route?.legs || route.legs.some((l) => l.legType === 'road'))) {
      missingRequirements.push('Chưa phân công phương tiện vận chuyển cho các chặng đường bộ');
    } else if (totalCapacity < requiredSlots && totalCapacity > 0) {
      missingRequirements.push(
        `Sức chứa của phương tiện (${totalCapacity} chỗ) chưa đủ cho nhu cầu chuồng của đơn (${requiredSlots} chỗ, gồm chuồng riêng tính 2 chỗ)`,
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

    const existing = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (existing && ['confirmed', 'ready_to_depart', 'in_transit', 'completed'].includes(existing.planStatus)) {
      throw new ConflictException('Lộ trình đã xác nhận và phát hành hóa đơn; cần xử lý thay đổi qua quy trình điều chỉnh.');
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

    if (dto.legs.some(l => l.legType === 'road' && !l.vehicleId && l.vehiclePlate && !l.roadTripId)) {
      const vehicles = await this.fleetStore.findAllVehicles();
      dto = { ...dto, legs: dto.legs.map(leg => {
        if (leg.legType !== 'road' || leg.vehicleId || leg.roadTripId || !leg.vehiclePlate) return leg;
        const vehicle = vehicles.find(v => v.plateOrCode.toLowerCase() === leg.vehiclePlate!.trim().toLowerCase());
        return vehicle ? { ...leg, vehicleId: vehicle.id } : leg;
      }) };
    }

    // Step 9: số jet stall cho chặng bay (3 ngựa thường/stall, ngựa chuồng riêng 1 stall)
    const stallHorses = dto.legs.some(l => l.legType === 'flight') && typeof (this.fleetStore as any).findShipmentStallHorses === 'function'
      ? await (this.fleetStore as any).findShipmentStallHorses(shipmentId)
      : null;
    const jetStalls = stallHorses && stallHorses.length ? jetStallCount(stallHorses) : undefined;

    if (
      dto.legs.some(l => l.legType === 'flight') &&
      typeof (this.routesStore as any).findAllAirlines === 'function' &&
      typeof (this.routesStore as any).findAllAirports === 'function'
    ) {
      const [airlines, airports] = await Promise.all([
        this.routesStore.findAllAirlines(),
        this.routesStore.findAllAirports(),
      ]);
      dto = {
        ...dto,
        legs: dto.legs.map((leg) => {
          if (leg.legType !== 'flight') return leg;
          let airlineId = leg.airlineId ?? route?.managerAirlineId ?? undefined;
          let airlineName = leg.airlineName;
          if (!airlineId && airlineName) {
            const norm = airlineName.trim().toLowerCase();
            const matchedAirline = airlines.find(
              (a) =>
                a.name.toLowerCase() === norm ||
                norm.includes(a.name.toLowerCase()) ||
                a.name.toLowerCase().includes(norm) ||
                norm.includes(`(${a.code.toLowerCase()})`),
            );
            if (matchedAirline) {
              airlineId = matchedAirline.id;
              airlineName = matchedAirline.name;
            }
          }
          if (!airlineId && airlines.length > 0) {
            airlineId = airlines[0].id;
            if (!airlineName) airlineName = airlines[0].name;
          }

          const matchAirport = (text?: string, code?: string, fallbackId?: number | null) => {
            if (code) {
              const byCode = airports.find((ap) => ap.iataCode.toLowerCase() === code.trim().toLowerCase());
              if (byCode) return byCode;
            }
            if (text) {
              const normText = text.trim().toLowerCase();
              const byIataInText = airports.find(
                (ap) =>
                  normText.includes(`(${ap.iataCode.toLowerCase()}`) ||
                  normText.includes(` ${ap.iataCode.toLowerCase()} `) ||
                  normText.endsWith(` ${ap.iataCode.toLowerCase()}`),
              );
              if (byIataInText) return byIataInText;
              const byNameOrCity = airports.find(
                (ap) =>
                  normText.includes(ap.name.toLowerCase()) ||
                  normText.includes(ap.city.toLowerCase()) ||
                  normText.includes(ap.country.toLowerCase()),
              );
              if (byNameOrCity) return byNameOrCity;
            }
            if (fallbackId) {
              return airports.find((ap) => ap.id === Number(fallbackId));
            }
            return undefined;
          };

          const depAp =
            (leg.departureAirportId ? airports.find((ap) => ap.id === Number(leg.departureAirportId)) : undefined) ||
            matchAirport(leg.originLocation, leg.departureAirportCode, route?.managerDepartureAirportId) ||
            airports.find((ap) => ap.country.toLowerCase().includes('viet')) ||
            airports[0];

          const arrAp =
            (leg.arrivalAirportId ? airports.find((ap) => ap.id === Number(leg.arrivalAirportId)) : undefined) ||
            matchAirport(leg.destinationLocation, leg.arrivalAirportCode, route?.managerArrivalAirportId) ||
            matchAirport(order.destinationLocation, undefined, null) ||
            airports.find((ap) => !ap.country.toLowerCase().includes('viet')) ||
            airports[0];

          const requiredStalls = Math.max(Number(leg.stallsBooked || 0), Number(order.requestedHorseCount || 1));

          return {
            ...leg,
            airlineId: airlineId ?? leg.airlineId,
            airlineName: airlineName ?? leg.airlineName,
            departureAirportId: leg.departureAirportId ?? depAp?.id,
            departureAirportCode: leg.departureAirportCode ?? depAp?.iataCode,
            arrivalAirportId: leg.arrivalAirportId ?? arrAp?.id,
            arrivalAirportCode: leg.arrivalAirportCode ?? arrAp?.iataCode,
            stallsBooked: requiredStalls,
            jetStallCount: jetStalls ?? leg.jetStallCount,
          };
        }),
      };
    }

    const roadVehicles = [...new Set(dto.legs.filter(l => l.legType === 'road' && l.vehicleId && !l.roadTripId).map(l => l.vehicleId!))];
    if (roadVehicles.length) {
      const requiredSlots = typeof this.fleetStore.findRequiredStallSlots === 'function'
        ? await this.fleetStore.findRequiredStallSlots(shipmentId, order.requestedHorseCount)
        : order.requestedHorseCount;
      const reservations = typeof (this.fleetStore as any).findShipmentReservations === 'function'
        ? await (this.fleetStore as any).findShipmentReservations(shipmentId)
        : [];
      assertRoadCapacity(requiredSlots, roadVehicles, applyConvoyCapacity(await this.fleetStore.findVehiclesByIds(roadVehicles), reservations));
    }
    let routeId: number;
    if (!route) {
      routeId = await this.routesStore.createRoute(shipmentId, dto.routeName, dto.totalDistanceKm);
    } else {
      routeId = route.id;
    }

    if (dto.legs.length === 0) {
      throw new BadRequestException('Kế hoạch chuyến đi phải có ít nhất 1 chặng vận chuyển (Leg)');
    }

    // Step 5: Ràng buộc chặng hai chiều (direction) theo loại chuyến đi
    const isRoundTripOrder = order.tripType === 'round_trip';
    const returnLegs = dto.legs.filter((l) => l.direction === 'return');
    if (isRoundTripOrder && returnLegs.length === 0) {
      throw new BadRequestException('Đơn khứ hồi phải có ít nhất 1 chặng về (direction: return)');
    }
    if (!isRoundTripOrder && returnLegs.length > 0) {
      throw new BadRequestException('Đơn vận chuyển một chiều không được có chặng về (direction: return)');
    }
    if (isRoundTripOrder && order.returnDepartureAt) {
      const returnDepMinTime = new Date(order.returnDepartureAt).getTime();
      for (const rLeg of returnLegs) {
        if (rLeg.plannedDeparture) {
          const rDepTime = new Date(rLeg.plannedDeparture).getTime();
          if (rDepTime < returnDepMinTime) {
            throw new BadRequestException(
              `Chặng về #${rLeg.sequenceNo} có giờ xuất phát sớm hơn giờ hẹn đón chặng về (${new Date(returnDepMinTime).toISOString()})`,
            );
          }
        }
      }
    }

    // BR-F3-03: Enforce unique sequenceNo, valid per-leg window & non-overlapping chronological order
    const explicitSeqs = dto.legs.map((l) => l.sequenceNo).filter((s) => s !== undefined && s !== null);
    if (explicitSeqs.length !== new Set(explicitSeqs).size) {
      throw new BadRequestException('Thứ tự các chặng vận chuyển (sequenceNo) không được trùng lặp');
    }
    const orderedLegs = [...dto.legs].sort(
      (a, b) => Number(a.sequenceNo ?? 0) - Number(b.sequenceNo ?? 0),
    );
    for (let i = 0; i < orderedLegs.length; i++) {
      const curr = orderedLegs[i];
      const currStart = curr.plannedDeparture ? new Date(curr.plannedDeparture).getTime() : NaN;
      const currEnd = curr.plannedArrival ? new Date(curr.plannedArrival).getTime() : NaN;
      if (Number.isFinite(currStart) && Number.isFinite(currEnd) && currEnd <= currStart) {
        throw new BadRequestException(
          `Thời điểm đến dự kiến của chặng #${curr.sequenceNo ?? i + 1} phải sau thời điểm xuất phát`,
        );
      }
      if (i + 1 < orderedLegs.length) {
        const next = orderedLegs[i + 1];
        const nextStart = next.plannedDeparture ? new Date(next.plannedDeparture).getTime() : NaN;
        if (Number.isFinite(currEnd) && Number.isFinite(nextStart) && nextStart < currEnd) {
          throw new BadRequestException(
            `Chặng #${next.sequenceNo ?? i + 2} không được xuất phát trước thời điểm đến dự kiến của chặng #${curr.sequenceNo ?? i + 1}`,
          );
        }
      }
    }

    const emergencyReroute = route?.planStatus === PlanStatus.IN_TRANSIT && Boolean(route.activeIncident);
    if (route && !['draft', 'pending_approval'].includes(route.planStatus) && !emergencyReroute) throw new ConflictException('Chỉ sửa kế hoạch khi còn ở giai đoạn lập/duyệt hoặc đang xử lý sự cố trên đường.');

    if (this.isInternationalOrder(order)) {
      const effectiveStops = [
        ...(dto.stops || []),
        ...(emergencyReroute && route?.stops ? route.stops : []),
      ];
      const hasBorderOrQuarantine = effectiveStops.some(
        (s) => s.stopType === RouteStopType.BORDER_CHECK || s.stopType === RouteStopType.QUARANTINE,
      );
      if (!hasBorderOrQuarantine) {
        throw new BadRequestException(
          'Tuyến vận chuyển quốc tế bắt buộc phải có ít nhất 1 điểm dừng cửa khẩu hoặc kiểm dịch (border_check / quarantine) theo quy tắc BR-F3-03',
        );
      }
    }

    await this.routesStore.saveDetailedPlan(routeId, dto, Number(user.id));

    return (await this.routesStore.findRouteById(routeId))!;
  }

  private isInternationalOrder(order: {
    transportationType?: string | null;
    originLocation?: string | null;
    destinationLocation?: string | null;
  }): boolean {
    const tType = String(order.transportationType || '').toLowerCase();
    if (tType.includes('international')) return true;
    if (tType.includes('domestic')) return false;
    if (typeof this.documentsService?.detectRecognizedCountry === 'function') {
      const dest = this.documentsService.detectRecognizedCountry(order.destinationLocation);
      const orig = this.documentsService.detectRecognizedCountry(order.originLocation);
      if (dest && dest !== 'Vietnam') return true;
      if (orig && dest && orig !== dest) return true;
    }
    return false;
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

    if (route.planStatus !== PlanStatus.DRAFT) throw new BadRequestException('Chỉ gửi duyệt kế hoạch nháp.');
    await this.routesStore.updatePlanStatus(route.id, PlanStatus.PENDING_APPROVAL);

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Yêu cầu phê duyệt kế hoạch chuyến đi - Đơn ${code}`,
      `Kế hoạch chi tiết cho đơn ${code} gồm ${route.legs.length} chặng đã hoàn thiện và sẵn sàng phê duyệt.`,
      'status_update',
      shipmentId,
    );

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

    const canApproveDirectly =
      dto.status === 'approved' &&
      route.planStatus === PlanStatus.DRAFT &&
      (user.role === UserRole.LOGISTICS_MANAGER || user.role === UserRole.ADMIN) &&
      route.legs &&
      route.legs.length > 0;
    if (route.planStatus !== PlanStatus.PENDING_APPROVAL && !canApproveDirectly) {
      throw new ConflictException('Chỉ phê duyệt kế hoạch đang chờ duyệt.');
    }

    if (dto.status === 'approved') {
      if (dto.transportCost !== undefined && dto.transportCost !== null) {
        const nextTransportCost = Math.round(Number(dto.transportCost));
        const currentTransportCost = Math.round(
          Number(order.transportCost ?? Math.max(0, Number(order.totalCost || 0) - Number(order.insuranceFee || 0))),
        );
        if (
          Number.isFinite(nextTransportCost) &&
          nextTransportCost >= 0 &&
          nextTransportCost !== currentTransportCost &&
          typeof this.ordersStore.updatePricing === 'function'
        ) {
          const isPaidPrepaid =
            order.paymentFlow === 'prepaid' &&
            (order.paymentStatus === 'succeeded' ||
              ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit'].includes(order.status));
          if (isPaidPrepaid) {
            throw new ConflictException(
              'Đơn hàng trả trước đã thanh toán — không thể chỉnh sửa giá cước gốc. Nếu phát sinh chi phí, vui lòng tạo hóa đơn phụ phí.',
            );
          }
          const insuranceFee = Math.round(Number(order.insuranceFee || 0));
          await this.ordersStore.updatePricing(
            shipmentId,
            nextTransportCost,
            nextTransportCost + insuranceFee,
          );
        }
      }

      await this.routesStore.updatePlanStatus(
        route.id,
        PlanStatus.APPROVED,
        undefined,
        Number(user.id),
      );

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

    const allConfirmed = await this.routesStore.confirmAndInvoice(shipmentId, targetUserId, dto.confirmationNotes);
    if (allConfirmed) await this.evaluateReadyToDepartGate(shipmentId);

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

    await this.evaluateReadyToDepartGate(shipmentId);

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

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
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem đơn của mình');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem trạng thái sẵn sàng của chuyến đi được phân công cho mình',
      );
    }
    return this.evaluateReadyToDepartGate(shipmentId);
  }

  private async evaluateReadyToDepartGate(shipmentId: number): Promise<TripPlanReadiness> {
    const isLegalCompliant = await this.documentsService.isFlow2CompletedForPayment(shipmentId);
    const gate = await this.routesStore.applyDepartureReadiness(shipmentId, isLegalCompliant);
    const pendingConditions: string[] = [];
    if (!gate.isPlanConfirmed) pendingConditions.push('Đang chờ lộ trình được xác nhận đầy đủ và hóa đơn chính thức.');
    if (!gate.isLegalCompliant) pendingConditions.push('Hồ sơ pháp lý, xét nghiệm và kiểm dịch (Flow 2) chưa hoàn tất 100%.');
    if (!gate.isPaymentSucceeded) pendingConditions.push('Đang chờ khách hàng hoàn tất thanh toán cước vận chuyển qua SePay.');
    return { shipmentId, orderCode: `REQ-${String(shipmentId).padStart(3, '0')}`, ...gate, pendingConditions };
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
      if (![PlanStatus.DRAFT, PlanStatus.PENDING_APPROVAL].includes(route.planStatus)) {
        throw new ConflictException(
          `Không thể ghi đè lộ trình bằng endpoint cũ khi kế hoạch đang ở trạng thái "${route.planStatus}"`,
        );
      }
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
      await this.routesStore.updateStopScheduleWithHistory(
        item.stopId,
        item.plannedArrival,
        item.plannedDeparture,
        dto.reason,
        Number(user.id),
      );
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

    await this.evaluateReadyToDepartGate(route.shipmentId);

    return (await this.routesStore.findRouteById(routeId))!;
  }

  async publishTripPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: PublishTripDto,
  ): Promise<FullTripPlan> {
    const readiness = await this.getTripPlanReadiness(user, shipmentId);
    if (!readiness.isReadyToDepart) {
      throw new UnprocessableEntityException({
        message: readiness.pendingConditions.join('; '),
        missingRequirements: readiness.pendingConditions,
      });
    }
    const plan = await this.getFullTripPlan(shipmentId);

    if (!plan.isReadyToPublish) {
      throw new UnprocessableEntityException({
        message: `Không thể xuất bản kế hoạch chuyến đi do chưa đủ điều kiện: ${plan.missingRequirements.join('; ')}`,
        missingRequirements: plan.missingRequirements,
      });
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

    const route = await this.routesStore.findRouteById(stop.routeId);
    if (user.role === UserRole.DRIVER_ESCORT) {
      if (!route) {
        throw new ForbiddenException('Bạn chỉ được phép cập nhật điểm dừng thuộc chuyến đi được phân công cho mình');
      }
      await this.assertDriverAssignedToShipment(
        route.shipmentId,
        Number(user.id),
        'Bạn chỉ được phép cập nhật điểm dừng thuộc chuyến đi được phân công cho mình',
      );
    }

    await this.routesStore.createStopUpdate(stopId, Number(user.id), dto);

    const updatedStop = (await this.routesStore.findStopById(stopId))!;

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
    const allowedRoles = new Set<string>([
      UserRole.DRIVER_ESCORT,
      UserRole.LOGISTICS_MANAGER,
      UserRole.ADMIN,
    ]);
    if (!allowedRoles.has(user.role)) {
      throw new ForbiddenException('Chỉ nhân sự vận hành hoặc điều phối mới có quyền báo cáo sự cố chuyến đi');
    }

    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (user.role === UserRole.DRIVER_ESCORT && typeof this.fleetStore?.findAssignedStaff === 'function') {
      const assigned = await this.fleetStore.findAssignedStaff(shipmentId);
      const isAssigned = assigned.some((s) => Number(s.userId) === Number(user.id));
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ có thể báo cáo sự cố cho chuyến đi được phân công cho mình');
      }
    }

    const incidentId = await this.routesStore.reportIncident({
      shipmentId,
      reportedBy: Number(user.id),
      incidentType: dto.incidentType || 'traffic_delay',
      description: dto.description,
      severity: dto.severity || 'high',
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

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

  async getAllIncidents() {
    return this.routesStore.findAllIncidents();
  }
}
