import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TrackingStore } from './tracking.store';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  CheckInLegDto,
  CheckInStopDto,
  CoordinatorOverrideDto,
  CreateHealthLogDto,
  HorseHealthLogEntity,
  TrackingMilestoneItem,
  TripTrackingDetails,
} from './tracking.types';

@Injectable()
export class TrackingService {
  constructor(
    private readonly trackingStore: TrackingStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getMyTrips(user: AuthenticatedUser): Promise<any[]> {
    return this.trackingStore.findMyAssignedTrips(Number(user.id), String(user.role));
  }

  async getTrackingDetails(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<TripTrackingDetails> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    // Authorization check: Customer can only view their own shipment
    if (String(user.role).toUpperCase() === 'CUSTOMER' && shipment.customer_id !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin chuyến đi của khách hàng khác');
    }

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    const routeId = route?.route_id || shipment.route_id;

    let legs: any[] = [];
    let stops: any[] = [];
    if (routeId) {
      legs = await this.trackingStore.findLegsByRouteId(routeId);
      stops = await this.trackingStore.findStopsByRouteId(routeId);
    }

    const assignedStaff = await this.trackingStore.findAssignedStaff(shipmentId);
    const assignedHorses = await this.trackingStore.findAssignedHorses(shipmentId);
    const healthLogs = await this.trackingStore.findHorseHealthLogs(shipmentId);
    const statusLogs = await this.trackingStore.findTripStatusLogs(shipmentId);

    // Build timeline milestones dynamically from route_leg and route_stop
    const milestones = this.buildMilestonesTimeline(legs, stops);

    // Current active milestone
    const currentMilestoneItem =
      milestones.find((m) => m.status === 'CURRENT') ||
      milestones.find((m) => m.status === 'PENDING') ||
      milestones[milestones.length - 1];

    const currentMilestoneText = currentMilestoneItem
      ? `${currentMilestoneItem.title} (${currentMilestoneItem.location})`
      : 'Chờ xuất phát tại điểm tập kết';

    const driverStaff = assignedStaff.find((s) => s.role_in_shipment === 'driver');
    const escortStaff = assignedStaff.find((s) => s.role_in_shipment === 'escort');
    const assignedVehicle = legs.find((l) => l.vehicle_plate)?.vehicle_plate || 'Xe thùng chuyên dụng';

    return {
      shipmentId,
      requestCode: shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`,
      customerName: shipment.customer_name || shipment.contact_name,
      origin: shipment.origin_location,
      destination: shipment.destination_location,
      shipmentStatus: shipment.status,
      routePlanStatus: route?.plan_status || shipment.status,
      currentMilestone: currentMilestoneText,
      eta: legs[legs.length - 1]?.planned_arrival ? new Date(legs[legs.length - 1].planned_arrival).toLocaleString('vi-VN') : null,
      totalDistanceKm: route?.total_distance_km ? Number(route.total_distance_km) : null,
      assignedVehicle,
      assignedDriver: driverStaff ? `${driverStaff.full_name} (${driverStaff.phone || driverStaff.email})` : null,
      assignedEscort: escortStaff ? `${escortStaff.full_name} (${escortStaff.phone || escortStaff.email})` : null,
      assignedHorses: assignedHorses.map((h) => ({
        id: h.horse_id,
        name: h.name,
        breed: h.breed,
        microchipNo: h.microchip_no,
      })),
      milestones,
      healthLogs,
      statusLogs,
      lastUpdated: new Date().toISOString(),
    };
  }

  private buildMilestonesTimeline(legs: any[], stops: any[]): TrackingMilestoneItem[] {
    const items: TrackingMilestoneItem[] = [];
    let milestoneSeq = 1;
    let foundFirstIncomplete = false;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const legStops = stops.filter((s) => s.leg_id === leg.leg_id);

      // 1. Leg Start Milestone
      const isLegDeparted = leg.actual_departure !== null || leg.status === 'departed' || leg.status === 'in_transit' || leg.status === 'completed';
      let legStartStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
      if (isLegDeparted) {
        legStartStatus = 'COMPLETED';
      } else if (!foundFirstIncomplete) {
        legStartStatus = 'CURRENT';
        foundFirstIncomplete = true;
      }

      const legStartActions: string[] = [];
      if (legStartStatus === 'CURRENT') {
        legStartActions.push('start_leg');
      }

      items.push({
        id: `leg-${leg.leg_id}-start`,
        itemType: 'leg_start',
        legId: leg.leg_id,
        seq: milestoneSeq++,
        title: `Xuất phát chặng ${leg.sequence_no}: ${leg.origin_location}`,
        location: leg.origin_location,
        status: legStartStatus,
        plannedTime: leg.planned_departure ? new Date(leg.planned_departure).toISOString() : null,
        actualTime: leg.actual_departure ? new Date(leg.actual_departure).toISOString() : null,
        isCustomsBorder: false,
        legType: leg.leg_type || 'road',
        responsibleRole: leg.leg_type === 'flight' ? 'escort' : 'driver',
        notes: null,
        updatedBy: null,
        allowedActions: legStartActions,
      });

      // 2. Intermediate Stops for this Leg
      for (const stop of legStops) {
        const isCustoms = stop.stop_type === 'quarantine' || stop.stop_type === 'border_check';
        const isStopDone = stop.status === 'departed' || (isCustoms && stop.status === 'customs_cleared');

        let stopStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
        if (isStopDone) {
          stopStatus = 'COMPLETED';
        } else if (stop.status === 'arrived') {
          stopStatus = 'CURRENT';
          foundFirstIncomplete = true;
        } else if (!foundFirstIncomplete && isLegDeparted) {
          stopStatus = 'CURRENT';
          foundFirstIncomplete = true;
        }

        const stopActions: string[] = [];
        if (stopStatus === 'CURRENT') {
          if (stop.status === 'pending') {
            stopActions.push('arrive_stop');
          } else if (stop.status === 'arrived') {
            if (isCustoms) stopActions.push('clear_customs');
            stopActions.push('depart_stop');
          } else if (stop.status === 'customs_cleared') {
            stopActions.push('depart_stop');
          }
        }

        items.push({
          id: `stop-${stop.route_stop_id}`,
          itemType: 'stop',
          legId: leg.leg_id,
          stopId: stop.route_stop_id,
          seq: milestoneSeq++,
          title: `${stop.location_name} (${this.getStopTypeVi(stop.stop_type)})`,
          location: `${stop.location_name}, ${stop.country || 'Vietnam'}`,
          status: stopStatus,
          plannedTime: stop.planned_arrival ? new Date(stop.planned_arrival).toISOString() : null,
          actualTime: stop.actual_departure ? new Date(stop.actual_departure).toISOString() : (stop.actual_arrival ? new Date(stop.actual_arrival).toISOString() : null),
          isCustomsBorder: isCustoms,
          legType: leg.leg_type || 'road',
          responsibleRole: leg.leg_type === 'flight' ? 'escort' : 'driver',
          notes: stop.notes || null,
          updatedBy: stop.updated_by_name || null,
          allowedActions: stopActions,
        });
      }

      // 3. Leg End Milestone
      const isLegArrived = leg.actual_arrival !== null || leg.status === 'completed';
      let legEndStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
      if (isLegArrived) {
        legEndStatus = 'COMPLETED';
      } else if (!foundFirstIncomplete && isLegDeparted && legStops.every((s) => s.status === 'departed' || s.status === 'customs_cleared')) {
        legEndStatus = 'CURRENT';
        foundFirstIncomplete = true;
      }

      const legEndActions: string[] = [];
      if (legEndStatus === 'CURRENT') {
        legEndActions.push('arrive_leg');
      }

      items.push({
        id: `leg-${leg.leg_id}-end`,
        itemType: 'leg_end',
        legId: leg.leg_id,
        seq: milestoneSeq++,
        title: `Đến đích chặng ${leg.sequence_no}: ${leg.destination_location}`,
        location: leg.destination_location,
        status: legEndStatus,
        plannedTime: leg.planned_arrival ? new Date(leg.planned_arrival).toISOString() : null,
        actualTime: leg.actual_arrival ? new Date(leg.actual_arrival).toISOString() : null,
        isCustomsBorder: false,
        legType: leg.leg_type || 'road',
        responsibleRole: leg.leg_type === 'flight' ? 'escort' : 'driver',
        notes: null,
        updatedBy: null,
        allowedActions: legEndActions,
      });
    }

    return items;
  }

  private getStopTypeVi(type: string): string {
    const map: Record<string, string> = {
      rest: 'Nghỉ dưỡng ngựa',
      quarantine: 'Kiểm dịch thú y',
      refuel: 'Tiếp nhiên liệu',
      border_check: 'Cửa khẩu / Hải quan',
    };
    return map[type] || 'Trạm dừng';
  }

  // --- Step 2: Milestone updates with strict sequence and role checking ---

  async checkInLegStart(
    user: AuthenticatedUser,
    shipmentId: number,
    legId: number,
    dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    // Rule: Chỉ chuyến Ready to depart / In transit mới được cập nhật mốc
    if (shipment.status !== 'ready_to_depart' && shipment.status !== 'in_transit') {
      throw new BadRequestException(
        `Chuyến đi đang ở trạng thái "${shipment.status}". Chỉ chuyến "Ready to depart" hoặc "In transit" mới có thể xuất phát.`,
      );
    }

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const targetLeg = legs.find((l) => l.leg_id === Number(legId));
    if (!targetLeg) throw new NotFoundException(`Không tìm thấy chặng #${legId}`);

    // Role check: driver for road, escort for flight, coordinator/manager can override
    this.assertStaffCanUpdateLeg(user, targetLeg);

    // Sequence check: previous leg must be completed
    if (targetLeg.sequence_no > 1) {
      const prevLeg = legs.find((l) => l.sequence_no === targetLeg.sequence_no - 1);
      if (prevLeg && prevLeg.status !== 'completed' && !prevLeg.actual_arrival) {
        throw new BadRequestException(
          `Không thể xuất phát chặng #${targetLeg.sequence_no} khi chặng #${prevLeg.sequence_no} chưa hoàn thành!`,
        );
      }
    }

    const now = dto.actualTime ? new Date(dto.actualTime) : new Date();

    // Update leg status to 'active'
    await this.trackingStore.updateLegStatus(legId, 'active', now, null);

    // Transition shipment from 'ready_to_depart' to 'in_transit' if starting 1st leg
    if (targetLeg.sequence_no === 1 && shipment.status === 'ready_to_depart') {
      await this.trackingStore.updateShipmentStatus(shipmentId, 'in_transit');
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'in_transit');

      // Send auto notification to Customer
      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Chuyến vận chuyển ngựa đã xuất phát!',
        `Đơn vận chuyển #${shipment.request_code} đã bắt đầu khởi hành chặng 1 (${targetLeg.origin_location} → ${targetLeg.destination_location}).`,
        'status_update',
        shipmentId,
      );
    }

    // Record trip status log
    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route.route_id,
      legId,
      previousStatus: targetLeg.status,
      newStatus: 'in_transit',
      milestoneType: 'leg_departure',
      milestoneName: `Xuất phát chặng ${targetLeg.sequence_no}: ${targetLeg.origin_location}`,
      notes: dto.notes || 'Bắt đầu di chuyển chặng',
      updatedBy: Number(user.id),
      updatedByRole: user.role,
    });

    return this.getTrackingDetails(user, shipmentId);
  }

  async checkInStop(
    user: AuthenticatedUser,
    shipmentId: number,
    stopId: number,
    dto: CheckInStopDto,
  ): Promise<TripTrackingDetails> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
    const targetStop = stops.find((s) => s.route_stop_id === Number(stopId));
    if (!targetStop) throw new NotFoundException(`Không tìm thấy trạm dừng #${stopId}`);

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const parentLeg = legs.find((l) => l.leg_id === targetStop.leg_id);

    // Rule: Chặng phải bắt đầu rồi mới được check-in trạm dừng
    if (!parentLeg || (!parentLeg.actual_departure && parentLeg.status === 'pending')) {
      throw new BadRequestException('Chặng vận chuyển chưa xuất phát! Vui lòng bấm "Xuất phát" chặng trước khi cập nhật trạm dừng.');
    }

    // Sequence checking inside the stop
    if (dto.action === 'departed' && targetStop.status === 'pending') {
      throw new BadRequestException('Không thể bấm "Đã rời" khi xe chưa cập nhật "Đã tới" trạm dừng này!');
    }

    const now = dto.actualTime ? new Date(dto.actualTime) : new Date();
    const isDeparture = dto.action === 'departed';

    await this.trackingStore.updateStopStatus(
      stopId,
      dto.action,
      Number(user.id),
      now,
      isDeparture,
      dto.notes,
    );

    // If customs cleared, send notification to Customer
    if (dto.action === 'customs_cleared') {
      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Ngựa đã hoàn tất thông quan & kiểm dịch!',
        `Đoàn xe đơn #${shipment.request_code} đã hoàn tất kiểm tra thú y & hải quan tại "${targetStop.location_name}".`,
        'status_update',
        shipmentId,
      );
    }

    // Record trip status log
    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route.route_id,
      legId: targetStop.leg_id,
      routeStopId: stopId,
      previousStatus: targetStop.status,
      newStatus: dto.action,
      milestoneType: dto.action === 'customs_cleared' ? 'stop_customs_cleared' : (isDeparture ? 'stop_departure' : 'stop_arrival'),
      milestoneName: `${targetStop.location_name} - ${dto.action.toUpperCase()}`,
      notes: dto.notes,
      updatedBy: Number(user.id),
      updatedByRole: user.role,
    });

    return this.getTrackingDetails(user, shipmentId);
  }

  async checkInLegArrival(
    user: AuthenticatedUser,
    shipmentId: number,
    legId: number,
    dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const targetLeg = legs.find((l) => l.leg_id === Number(legId));
    if (!targetLeg) throw new NotFoundException(`Không tìm thấy chặng #${legId}`);

    // Rule: Chặng phải bắt đầu rồi mới được bấm đến
    if (!targetLeg.actual_departure && targetLeg.status === 'pending') {
      throw new BadRequestException('Không thể bấm "Đã đến" khi chặng này chưa bấm "Đã xuất phát"!');
    }

    // Rule: Tất cả các trạm dừng trong chặng phải đã hoàn thành
    const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
    const legStops = stops.filter((s) => s.leg_id === Number(legId));
    const unfinishedStops = legStops.filter((s) => s.status !== 'departed' && s.status !== 'customs_cleared');
    if (unfinishedStops.length > 0) {
      throw new BadRequestException(
        `Còn ${unfinishedStops.length} trạm dừng chưa hoàn tất rời trạm (${unfinishedStops.map((s) => s.location_name).join(', ')})!`,
      );
    }

    const now = dto.actualTime ? new Date(dto.actualTime) : new Date();

    // Complete this leg
    await this.trackingStore.updateLegStatus(legId, 'completed', undefined, now);

    // Check if this is the final leg of the entire trip
    const isFinalLeg = targetLeg.sequence_no === legs.length;
    if (isFinalLeg) {
      // Step 7: Chuyển sang 'completed' (hoặc 'arrived' / chờ bàn giao)
      await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');

      // Send auto notification to Customer
      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Ngựa đã tới địa điểm bàn giao an toàn!',
        `Chuyến vận chuyển #${shipment.request_code} đã hoàn thành toàn bộ lộ trình và cập bến tại ${targetLeg.destination_location}. Sẵn sàng bàn giao ngựa.`,
        'handover_complete',
        shipmentId,
      );
    }

    // Record trip status log
    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route.route_id,
      legId,
      previousStatus: targetLeg.status,
      newStatus: 'completed',
      milestoneType: 'leg_arrival',
      milestoneName: `Hoàn tất chặng ${targetLeg.sequence_no}: Đến ${targetLeg.destination_location}`,
      notes: dto.notes || (isFinalLeg ? 'Đã đến địa điểm bàn giao cuối cùng' : 'Đã kết thúc chặng'),
      updatedBy: Number(user.id),
      updatedByRole: user.role,
    });

    return this.getTrackingDetails(user, shipmentId);
  }

  // Coordinator override updates milestone on behalf of Driver
  async coordinatorOverrideMilestone(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CoordinatorOverrideDto,
  ): Promise<TripTrackingDetails> {
    const roleStr = String(user.role).toUpperCase();
    const isCoordinatorOrManager =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');

    if (!isCoordinatorOrManager) {
      throw new ForbiddenException('Chỉ Fleet Coordinator hoặc Logistics Manager mới có quyền cập nhật thay Driver');
    }

    const notesWithActor = `${dto.notes || 'Cập nhật thay mốc'} (Cập nhật bởi Coordinator: ${user.fullName || user.email})`;

    if (dto.milestoneId.startsWith('leg-') && dto.milestoneId.endsWith('-start')) {
      const legId = Number(dto.milestoneId.replace('leg-', '').replace('-start', ''));
      return this.checkInLegStart(user, shipmentId, legId, {
        actualTime: dto.actualTime,
        notes: notesWithActor,
      });
    }

    if (dto.milestoneId.startsWith('leg-') && dto.milestoneId.endsWith('-end')) {
      const legId = Number(dto.milestoneId.replace('leg-', '').replace('-end', ''));
      return this.checkInLegArrival(user, shipmentId, legId, {
        actualTime: dto.actualTime,
        notes: notesWithActor,
      });
    }

    if (dto.milestoneId.startsWith('stop-')) {
      const stopId = Number(dto.milestoneId.replace('stop-', ''));
      const action = (dto.action as any) || 'arrived';
      return this.checkInStop(user, shipmentId, stopId, {
        action,
        actualTime: dto.actualTime,
        notes: notesWithActor,
      });
    }

    throw new BadRequestException('Mã mốc không hợp lệ');
  }

  // --- Step 3: Horse Health Observation Logs ---

  async createHealthLog(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateHealthLogDto,
  ): Promise<HorseHealthLogEntity> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    const logId = await this.trackingStore.createHorseHealthLog({
      shipmentId,
      horseId: dto.horseId,
      horseName: dto.horseName,
      recordedBy: Number(user.id),
      conditionStatus: dto.conditionStatus,
      temperatureC: dto.temperatureC,
      heartRateBpm: dto.heartRateBpm,
      notes: dto.notes,
      attachmentsJson: dto.attachments ? JSON.stringify(dto.attachments) : null,
    });

    // Step 3 Rule: Nếu tình trạng là Bỏ ăn hoặc Căng thẳng -> Kích hoạt cảnh báo cho Coordinator & Manager
    if (dto.conditionStatus === 'not_eating' || dto.conditionStatus === 'stressed') {
      const assigned = await this.trackingStore.findAssignedStaff(shipmentId);
      const conditionText = dto.conditionStatus === 'not_eating' ? 'BỎ ĂN' : 'CĂNG THẲNG';

      // Send notification to customer & assigned staff
      await this.notificationsService.createNotification(
        shipment.customer_id,
        `Cảnh báo sức khỏe ngựa: ${dto.horseName}`,
        `Chuyên viên y tế ghi nhận ngựa ${dto.horseName} có biểu hiện ${conditionText} trong chuyến đi #${shipment.request_code}. Đang được chăm sóc tích cực.`,
        'incident',
        shipmentId,
      );

      for (const staff of assigned) {
        await this.notificationsService.createNotification(
          staff.user_id,
          `⚠️ Cảnh báo thú y: Ngựa ${dto.horseName} (${conditionText})`,
          `Ghi nhận tại chuyến #${shipment.request_code}: ${dto.notes || 'Cần kiểm tra điện giải và giảm rung lắc thùng xe'}. Vui lòng theo dõi sát hoặc báo sự cố nếu cần.`,
          'incident',
          shipmentId,
        );
      }
    }

    const logs = await this.trackingStore.findHorseHealthLogs(shipmentId);
    const created = logs.find((l) => l.id === logId);
    if (!created) throw new NotFoundException('Không tìm thấy nhật ký vừa tạo');
    return created;
  }

  // Step 7: Coordinator marks trip Completed
  async completeShipment(user: AuthenticatedUser, shipmentId: number): Promise<void> {
    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
    if (route) {
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');
    }

    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route?.route_id || 0,
      previousStatus: 'arrived',
      newStatus: 'completed',
      milestoneType: 'trip_status_change',
      milestoneName: 'Chuyến đi hoàn tất',
      notes: `Đánh dấu hoàn thành bởi ${user.fullName || user.email} (${user.role})`,
      updatedBy: Number(user.id),
      updatedByRole: user.role,
    });
  }

  private assertStaffCanUpdateLeg(user: AuthenticatedUser, leg: any): void {
    const roleStr = String(user.role).toUpperCase();
    const isManagerOrCoordinator =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');

    if (isManagerOrCoordinator) return;

    if (leg.leg_type === 'road') {
      const isDriver =
        user.specialization === 'driver' ||
        roleStr.includes('DRIVER') ||
        user.email.toLowerCase().includes('driver');
      if (!isDriver) {
        throw new ForbiddenException('Chỉ Tài xế lái xe (Driver) mới được cập nhật chặng đường bộ!');
      }
    } else if (leg.leg_type === 'flight') {
      const isEscort =
        user.specialization === 'escort' ||
        roleStr.includes('ESCORT') ||
        user.email.toLowerCase().includes('escort');
      if (!isEscort) {
        throw new ForbiddenException('Chỉ Chuyên viên y tế/hộ tống (Escort/Vet) mới được cập nhật mốc chặng bay!');
      }
    }
  }
}
