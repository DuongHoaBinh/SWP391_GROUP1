import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { TrackingStore } from './tracking.store';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { CheckInLegDto, CheckInStopDto, CoordinatorOverrideDto, CreateHealthLogDto, HealthLogQueryDto, HealthLogPage, HorseHealthLogEntity, TrackingAlert, TrackingMilestoneItem, TripTrackingDetails } from './tracking.types';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  constructor(private readonly trackingStore: TrackingStore, private readonly notificationsService: NotificationsService) {}

  private async authorize(user: AuthenticatedUser, shipmentId: number, write = false): Promise<any> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');
    if ([UserRole.ADMIN, UserRole.LOGISTICS_MANAGER].includes(user.role)) return shipment;
    if (user.role === UserRole.CUSTOMER && !write && Number(shipment.customer_id) === Number(user.id)) return shipment;
    const staff = await this.trackingStore.findAssignedStaff(shipmentId);
    const assignment = staff.find(s => Number(s.user_id) === Number(user.id));
    if (user.role === UserRole.FLEET_ROUTE_COORDINATOR && (!write || assignment?.role_in_shipment === 'fleet_coordinator')) return shipment;
    if (user.role === UserRole.DRIVER_ESCORT && assignment && ['driver', 'escort'].includes(assignment.role_in_shipment)) return shipment;
    throw new ForbiddenException('Bạn không có quyền truy cập hoặc cập nhật chuyến đi này');
  }

  async getMyTrips(user: AuthenticatedUser): Promise<any[]> {
    if (![UserRole.CUSTOMER, UserRole.ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.FLEET_ROUTE_COORDINATOR, UserRole.DRIVER_ESCORT].includes(user.role)) throw new ForbiddenException();
    return this.trackingStore.findMyAssignedTrips(Number(user.id), user.role);
  }

  async getHealthLogs(user: AuthenticatedUser, shipmentId: number, query: HealthLogQueryDto): Promise<HealthLogPage> {
    await this.authorize(user, shipmentId);
    const result = await this.trackingStore.findHorseHealthLogs(shipmentId, query);
    if (user.role === UserRole.CUSTOMER) result.items = result.items.map(log => ({ ...log, notes: null }));
    return result;
  }

  async getTrackingDetails(user: AuthenticatedUser, shipmentId: number): Promise<TripTrackingDetails> {
    const shipment = await this.authorize(user, shipmentId);
    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    const [legs, stops, assignedStaff, assignedHorses, healthPage, statusLogs, checkIns, latestHealth, telemetry] = await Promise.all([
      route ? this.trackingStore.findLegsByRouteId(route.route_id) : Promise.resolve([]),
      route ? this.trackingStore.findStopsByRouteId(route.route_id) : Promise.resolve([]),
      this.trackingStore.findAssignedStaff(shipmentId), this.trackingStore.findAssignedHorses(shipmentId),
      this.trackingStore.findHorseHealthLogs(shipmentId), this.trackingStore.findTripStatusLogs(shipmentId),
      this.trackingStore.findStopUpdates(shipmentId), this.trackingStore.findLatestHorseHealth(shipmentId),
      this.trackingStore.findVehicleTelemetry(shipmentId),
    ]);
    const milestones = this.buildMilestonesTimeline(legs, stops);
    const canWrite = [UserRole.ADMIN, UserRole.LOGISTICS_MANAGER].includes(user.role) || assignedStaff.some(s => Number(s.user_id) === Number(user.id) &&
      ((user.role === UserRole.DRIVER_ESCORT && Boolean(s.is_confirmed)) || (user.role === UserRole.FLEET_ROUTE_COORDINATOR && s.role_in_shipment === 'fleet_coordinator')));
    const myAssignment = assignedStaff.find(s => Number(s.user_id) === Number(user.id));
    for (const milestone of milestones) {
      if (!canWrite || !['ready_to_depart', 'in_transit'].includes(shipment.status) ||
        (user.role === UserRole.DRIVER_ESCORT && milestone.responsibleRole !== myAssignment?.role_in_shipment)) milestone.allowedActions = [];
      if (user.role === UserRole.CUSTOMER) milestone.notes = null;
    }
    const alerts: TrackingAlert[] = latestHealth.filter(h => h.temperatureC != null && h.temperatureC > 38.5).map(h => ({
      type: 'horse_fever', message: `Ngựa ${h.horseName} sốt: ${h.temperatureC}°C (vượt 38.5°C)`, value: h.temperatureC!, recordedAt: h.recordedAt, horseId: h.horseId!,
    }));
    if (telemetry.vehicleTemperatureC != null && (telemetry.vehicleTemperatureC < 16 || telemetry.vehicleTemperatureC > 22)) alerts.push({
      type: 'vehicle_temperature', message: `Nhiệt độ thùng xe ${telemetry.vehicleTemperatureC}°C ngoài ngưỡng 16–22°C`, value: telemetry.vehicleTemperatureC, recordedAt: telemetry.recordedAt!,
    });
    const driver = assignedStaff.find(s => s.role_in_shipment === 'driver');
    const escort = assignedStaff.find(s => s.role_in_shipment === 'escort');
    const { items, ...healthLogsPagination } = healthPage;
    const timestamps = [shipment.created_at, ...statusLogs.map(l => l.createdAt), ...latestHealth.map(l => l.recordedAt), ...checkIns.map(l => l.createdAt)].filter(Boolean).map(t => new Date(t).getTime());
    return {
      shipmentId, requestCode: shipment.request_code, requestTitle: shipment.request_title,
      customerName: shipment.customer_name ?? shipment.contact_name, origin: shipment.origin_location, destination: shipment.destination_location,
      shipmentStatus: shipment.status, routePlanStatus: route?.plan_status ?? shipment.status,
      currentMilestone: statusLogs[statusLogs.length - 1]?.milestoneName ?? 'Chưa ghi nhận mốc thực tế',
      eta: legs[legs.length - 1]?.planned_arrival ? new Date(legs[legs.length - 1].planned_arrival).toISOString() : null,
      totalDistanceKm: route?.total_distance_km == null ? null : Number(route.total_distance_km),
      assignedVehicle: legs.find(l => l.vehicle_plate)?.vehicle_plate ?? null,
      assignedDriver: driver?.full_name ?? null, assignedEscort: escort?.full_name ?? null,
      assignedHorses: assignedHorses.map(h => ({ id: h.horse_id, name: h.name, breed: h.breed, microchipNo: h.microchip_no })),
      milestones, healthLogs: user.role === UserRole.CUSTOMER ? items.map(l => ({ ...l, notes: null })) : items,
      healthLogsPagination, latestHorseHealth: user.role === UserRole.CUSTOMER ? latestHealth.map(l => ({ ...l, notes: null })) : latestHealth, alerts, telemetry,
      checkIns: user.role === UserRole.CUSTOMER ? checkIns.map(l => ({ ...l, notes: null })) : checkIns,
      statusLogs: user.role === UserRole.CUSTOMER ? statusLogs.map(l => ({ ...l, notes: null })) : statusLogs,
      lastUpdated: new Date(Math.max(...timestamps)).toISOString(),
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
      const isLegDeparted = leg.actual_departure != null || leg.status === 'active' || leg.status === 'departed' || leg.status === 'in_transit' || leg.status === 'completed';
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
        const isStopDone = stop.status === 'departed';

        let stopStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
        if (isStopDone) {
          stopStatus = 'COMPLETED';
        } else if ((stop.status === 'arrived' || stop.status === 'customs_cleared' || stop.status === 'cleared') && !foundFirstIncomplete) {
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
            else stopActions.push('depart_stop');
          } else if ((stop.status === 'customs_cleared' || stop.status === 'cleared')) {
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
      const isLegArrived = leg.actual_arrival != null || leg.status === 'completed';
      let legEndStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
      if (isLegArrived) {
        legEndStatus = 'COMPLETED';
      } else if (!foundFirstIncomplete && isLegDeparted && legStops.every((s) => s.status === 'departed')) {
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

  private eventTime(dto: CheckInLegDto, lastTime?: Date | string | null): Date {
    const time = dto.actualTime ? new Date(dto.actualTime) : new Date();
    if (!Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 60000 || (lastTime && time.getTime() < new Date(lastTime).getTime())) {
      throw new BadRequestException('Thời gian mốc phải hợp lệ, không ở tương lai và không trước mốc trước đó');
    }
    return time;
  }

  private async notifyMilestone(shipment: any, title: string, message: string): Promise<void> {
    try { await this.notificationsService.createNotification(shipment.customer_id, title, message, 'status_update', shipment.shipment_id); }
    catch (error) { this.logger.error('Không thể gửi thông báo tracking', error instanceof Error ? error.stack : undefined); }
  }

  private async applyMilestone(user: AuthenticatedUser, shipmentId: number, kind: 'start' | 'stop' | 'end', targetId: number | undefined, dto: CheckInLegDto & { action?: string }, overrideReason?: string): Promise<TripTrackingDetails> {
    const result = await this.trackingStore.withShipmentTransaction(shipmentId, async () => {
      const shipment = await this.authorize(user, shipmentId, true);
      if ([UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role) && !overrideReason?.trim()) {
        throw new BadRequestException('Điều phối/quản lý cần dùng thao tác cập nhật thay và cung cấp lý do');
      }
      if (!['ready_to_depart', 'in_transit'].includes(shipment.status)) throw new BadRequestException('Chuyến phải sẵn sàng xuất phát hoặc đang vận chuyển');
      const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
      if (!route) throw new BadRequestException('Chưa có lộ trình');
      const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
      const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
      const timeline = this.buildMilestonesTimeline(legs, stops);
      const target = kind === 'stop' ? timeline.find(m => m.stopId === targetId) : targetId
        ? timeline.find(m => m.legId === targetId && m.itemType === (kind === 'start' ? 'leg_start' : 'leg_end'))
        : timeline.find(m => m.itemType === 'leg_start' && m.status === 'CURRENT');
      if (!target) throw new BadRequestException('Không tìm thấy mốc hợp lệ trong chuyến đi');
      if (kind !== 'start' && shipment.status !== 'in_transit') throw new BadRequestException('Chuyến chưa xuất phát');
      if (kind === 'start' && shipment.status === 'ready_to_depart' && route.plan_status !== 'ready_to_depart') throw new BadRequestException('Kế hoạch chưa sẵn sàng xuất phát');
      const actions: Record<string, string> = { arrived: 'arrive_stop', departed: 'depart_stop', customs_cleared: 'clear_customs' };
      const action = kind === 'start' ? 'start_leg' : kind === 'end' ? 'arrive_leg' : actions[dto.action ?? ''];
      if (target.status !== 'CURRENT' || !target.allowedActions.includes(action)) throw new BadRequestException('Mốc đã hoàn thành, sai thứ tự hoặc thao tác không hợp lệ');
      const staff = await this.trackingStore.findAssignedStaff(shipmentId);
      if (user.role === UserRole.DRIVER_ESCORT) {
        const assignment = staff.find(s => Number(s.user_id) === Number(user.id));
        if (assignment?.role_in_shipment !== target.responsibleRole) throw new ForbiddenException('Vai trò được phân công không phụ trách chặng này');
        if (!assignment.is_confirmed) throw new BadRequestException('Bạn cần xác nhận nhận chuyến trước khi cập nhật');
      }
      const leg = legs.find(l => l.leg_id === target.legId)!;
      const latestLogs = await this.trackingStore.findTripStatusLogs(shipmentId);
      const time = this.eventTime(dto, latestLogs[latestLogs.length - 1]?.occurredAt);
      let previousStatus: string = leg.status;
      let newStatus: string;
      if (kind === 'start') {
        if (leg.actual_departure || leg.status !== 'pending') throw new BadRequestException('Chặng đã xuất phát');
        await this.trackingStore.updateLegStatus(leg.leg_id, 'active', time);
        await this.trackingStore.updateShipmentStatus(shipmentId, 'in_transit');
        await this.trackingStore.updateRoutePlanStatus(route.route_id, 'in_transit');
        newStatus = 'in_transit';
      } else if (kind === 'stop') {
        const stop = stops.find(s => s.route_stop_id === target.stopId)!;
        previousStatus = stop.status;
        newStatus = dto.action!;
        await this.trackingStore.updateStopStatus(stop.route_stop_id, newStatus, Number(user.id), time, newStatus === 'departed', dto.notes);
        await this.trackingStore.recordStopUpdate(stop.route_stop_id, Number(user.id), newStatus, time, dto.notes, dto.vehicleTemperatureC);
      } else {
        await this.trackingStore.updateLegStatus(leg.leg_id, 'completed', undefined, time);
        newStatus = 'completed';
        if (leg.leg_id === legs[legs.length - 1].leg_id) {
          await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
          await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');
        }
      }
      await this.trackingStore.recordTripStatusLog({ shipmentId, routeId: route.route_id, legId: leg.leg_id, routeStopId: target.stopId,
        previousStatus, newStatus, milestoneType: kind === 'stop' ? `stop_${newStatus}` : `leg_${kind}`, milestoneName: `${target.title} — ${newStatus}`,
        notes: dto.notes, updatedBy: Number(user.id), updatedByRole: user.role, occurredAt: time });
      return { shipment, title: target.title, newStatus };
    });
    await this.notifyMilestone(result.shipment, 'Cập nhật hành trình', `${result.shipment.request_code}: ${result.title} — ${result.newStatus}`);
    return this.getTrackingDetails(user, shipmentId);
  }

  startShipment(user: AuthenticatedUser, shipmentId: number, dto: CheckInLegDto): Promise<TripTrackingDetails> {
    return this.applyMilestone(user, shipmentId, 'start', undefined, dto);
  }
  checkInLegStart(user: AuthenticatedUser, shipmentId: number, legId: number, dto: CheckInLegDto): Promise<TripTrackingDetails> {
    return this.applyMilestone(user, shipmentId, 'start', legId, dto);
  }
  checkInStop(user: AuthenticatedUser, shipmentId: number, stopId: number, dto: CheckInStopDto): Promise<TripTrackingDetails> {
    return this.applyMilestone(user, shipmentId, 'stop', stopId, dto);
  }
  checkInLegArrival(user: AuthenticatedUser, shipmentId: number, legId: number, dto: CheckInLegDto): Promise<TripTrackingDetails> {
    return this.applyMilestone(user, shipmentId, 'end', legId, dto);
  }

  async coordinatorOverrideMilestone(user: AuthenticatedUser, shipmentId: number, dto: CoordinatorOverrideDto): Promise<TripTrackingDetails> {
    if (![UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN].includes(user.role)) throw new ForbiddenException();
    const notes = `${dto.notes ?? ''} [Lý do cập nhật thay: ${dto.reason}]`;
    const match = /^(leg|stop)-(\d+)(?:-(start|end))?$/.exec(dto.milestoneId);
    if (!match) throw new BadRequestException('Mã mốc không hợp lệ');
    const allowedActions = match[1] === 'stop'
      ? ['arrive_stop', 'depart_stop', 'clear_customs', 'arrived', 'departed', 'customs_cleared']
      : match[3] === 'start' ? ['start_leg'] : ['complete_leg', 'arrive_leg'];
    if (!allowedActions.includes(dto.action)) throw new BadRequestException('Thao tác không phù hợp với loại mốc');
    const actions: Record<string, string> = { arrive_stop: 'arrived', depart_stop: 'departed', clear_customs: 'customs_cleared' };
    return this.applyMilestone(user, shipmentId, match[1] === 'stop' ? 'stop' : match[3] === 'start' ? 'start' : 'end', Number(match[2]),
      { ...dto, notes, action: actions[dto.action] ?? dto.action }, dto.reason);
  }

  async createHealthLog(user: AuthenticatedUser, shipmentId: number, dto: CreateHealthLogDto): Promise<HorseHealthLogEntity> {
    const result = await this.trackingStore.withShipmentTransaction(shipmentId, async () => {
      const shipment = await this.authorize(user, shipmentId, true);
      if (!['ready_to_depart', 'in_transit'].includes(shipment.status)) throw new BadRequestException('Chỉ ghi sức khỏe cho chuyến sẵn sàng hoặc đang vận chuyển');
      if (user.role !== UserRole.DRIVER_ESCORT) throw new ForbiddenException('Chỉ tài xế hoặc hộ tống được phân công mới được ghi nhật ký sức khỏe');
      const horses = await this.trackingStore.findAssignedHorses(shipmentId);
      if (!horses.some(h => h.horse_id === dto.horseId)) throw new BadRequestException('Ngựa không thuộc chuyến đi này');
      const id = await this.trackingStore.createHorseHealthLog(shipmentId, Number(user.id), dto);
      return { shipment, log: await this.trackingStore.findHealthLogById(id) };
    });
    const abnormal = (dto.temperatureC != null && dto.temperatureC > 38.5) || (dto.vehicleTemperatureC != null && (dto.vehicleTemperatureC < 16 || dto.vehicleTemperatureC > 22)) || ['not_eating', 'stressed'].includes(dto.conditionStatus);
    if (abnormal) {
      try {
        const title = `Cảnh báo sức khỏe: ${result.log.horseName}`;
        const message = `${result.shipment.request_code}: ${result.log.conditionStatusVi}; thân nhiệt ${dto.temperatureC ?? 'chưa đo'}°C; thùng xe ${dto.vehicleTemperatureC ?? 'chưa đo'}°C.`;
        await Promise.all([
          this.notificationsService.createNotification(result.shipment.customer_id, title, message, 'incident', shipmentId),
          this.notificationsService.notifyRole('Fleet & Route Coordinator', title, message, 'incident', shipmentId),
          this.notificationsService.notifyRole('Logistics Manager', title, message, 'incident', shipmentId),
        ]);
      } catch (error) { this.logger.error('Không thể gửi cảnh báo sức khỏe', error instanceof Error ? error.stack : undefined); }
    }
    return result.log;
  }

  async completeShipment(user: AuthenticatedUser, shipmentId: number): Promise<void> {
    await this.trackingStore.withShipmentTransaction(shipmentId, async () => {
      const shipment = await this.authorize(user, shipmentId, true);
      const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
      const legs = route ? await this.trackingStore.findLegsByRouteId(route.route_id) : [];
      if (!legs.length || legs.some(l => l.status !== 'completed')) throw new BadRequestException('Chưa hoàn tất các chặng');
      if (shipment.status === 'completed') return;
      await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');
      await this.trackingStore.recordTripStatusLog({ shipmentId, routeId: route.route_id, previousStatus: shipment.status, newStatus: 'completed',
        milestoneType: 'trip_complete', milestoneName: 'Hoàn tất chuyến đi', updatedBy: Number(user.id), updatedByRole: user.role });
    });
  }
}
