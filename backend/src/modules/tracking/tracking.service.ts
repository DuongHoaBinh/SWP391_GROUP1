import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import { basename, join } from 'path';
import { TrackingStore } from './tracking.store';
import { RoutesService } from '../routes/routes.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  areSameLocations,
  buildConsolidatedRoadItinerary,
  ConsolidatedRoadItinerary,
} from '../../common/road-trip-sequencing';
import { assertSafeExternalOrUploadUrl, verifyUploadedFileMagicBytes } from '../../common/utils/upload-validation';
import { canMarkNoShow } from '../orders/return-policy';
import {
  DEFAULT_EQUINE_VITAL_CONFIG,
  EquineVitalConfig,
  evaluateEquineHealthAlert,
} from './vitals-policy';
import {
  GeoPoint,
  radiusForStop,
  evaluateGeofence,
  distanceMeters,
  interpolateAlongPolyline,
  decimatePath,
} from './geofence-policy';
import {
  CheckInLegDto,
  CheckInStopDto,
  CoordinatorOverrideDto,
  CreateHealthLogDto,
  HorseConditionStatus,
  HorseHealthLogEntity,
  LiveOverviewItem,
  LiveTrackingDetails,
  LiveTrackingLeg,
  LiveTrackingStop,
  LiveTrackingVitalsItem,
  LiveVehiclePosition,
  LocationInput,
  PositionPingBatchDto,
  PositionPingResult,
  TrackingMilestoneItem,
  TrackingSystemSettings,
  TripTrackingDetails,
  ShipmentTimelineResponse,
  TimelineItemDto,
} from './tracking.types';

/** Trạng thái đơn cho phép ghi mốc trạm / đến chặng (sau khi đã xuất phát, trước khi đóng chuyến). */
const ACTIVE_JOURNEY_STATUSES = ['in_transit', 'return_pending'];
/** Trạng thái đơn cho phép ghi nhật ký sức khỏe hành trình (kiểm tra trước giờ đi tới khi kết thúc). */
const HEALTH_LOG_ALLOWED_STATUSES = ['ready_to_depart', 'in_transit', 'return_pending'];
/** Trạm coi là đã xong (khớp tiêu chí của checkInLegArrival; trạm xuất cảnh đa phương thức kết thúc ở customs_cleared). */
const STOP_DONE_STATUSES = ['departed', 'customs_cleared', 'cleared'];

/** Tài xế/áp tải ngoài hiện trường (không phải Manager/Admin/Coordinator). */
function isFieldStaff(user: AuthenticatedUser): boolean {
  const roleStr = String(user.role || '').toUpperCase();
  const isSupervisor = roleStr.includes('COORDINATOR') || roleStr.includes('MANAGER') || roleStr.includes('ADMIN');
  return !isSupervisor && (roleStr.includes('DRIVER') || roleStr.includes('ESCORT'));
}

/** Cho phép lệch đồng hồ thiết bị tối đa 5 phút; mốc/nhật ký ở tương lai xa hơn bị từ chối. */
const FUTURE_EVENT_TOLERANCE_MS = 5 * 60 * 1000;
const HEALTH_ATTACHMENT_UPLOAD_PREFIX = '/api/tracking/health-logs/attachments/';

/**
 * Ảnh nhật ký sức khỏe chỉ được là:
 * - file đã tải qua POST /tracking/shipments/:id/health-logs/upload (tên file phẳng, không có thư mục); hoặc
 * - URL ảnh http(s) bên ngoài mà UI tài xế cho phép dán.
 * Mọi scheme khác (javascript:, data:, file:, đường dẫn tương đối…) bị từ chối vì ảnh được hiển thị cho khách.
 */
function assertHealthAttachmentUrl(url: string): void {
  if (url.startsWith(HEALTH_ATTACHMENT_UPLOAD_PREFIX)) {
    const fileName = url.slice(HEALTH_ATTACHMENT_UPLOAD_PREFIX.length);
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName) && !fileName.includes('..')) return;
  } else if (/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url)) {
    return;
  }
  throw new BadRequestException(
    'Ảnh đính kèm không hợp lệ. Chỉ chấp nhận ảnh tải lên qua hệ thống hoặc URL ảnh http(s).',
  );
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly trackingStore: TrackingStore,
    private readonly notificationsService: NotificationsService,
    private readonly routesService: RoutesService,
    @Optional() private readonly documentsService?: DocumentsService,
  ) {}

  async getMyTrips(user: AuthenticatedUser): Promise<any[]> {
    return this.trackingStore.findMyAssignedTrips(Number(user.id), String(user.role));
  }

  private async resolveOperationalActorRole(shipmentId: number, user: AuthenticatedUser): Promise<string> {
    const roleStr = String(user.role || '').toUpperCase();
    if (roleStr.includes('DRIVER') || roleStr.includes('ESCORT')) {
      if (typeof this.trackingStore?.findAssignedStaff === 'function') {
        const assigned = await this.trackingStore.findAssignedStaff(shipmentId);
        const match = assigned.find((s) => Number(s.user_id) === Number(user.id));
        if (match?.role_in_shipment) return String(match.role_in_shipment);
      }
      if (user.specialization === 'escort' || user.email?.toLowerCase().includes('escort')) return 'escort';
      if (user.specialization === 'driver' || user.email?.toLowerCase().includes('driver')) return 'driver';
    }
    return String(user.role);
  }

  private evaluateEventTimestamp(actualTime?: string, notes?: string): { eventTime: Date; isBackdated: boolean } {
    if (!actualTime) return { eventTime: new Date(), isBackdated: false };
    const parsed = new Date(actualTime);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException('Thời điểm actualTime không hợp lệ.');
    }
    if (parsed.getTime() - Date.now() > FUTURE_EVENT_TOLERANCE_MS) {
      throw new BadRequestException('Thời điểm check-in (actualTime) không được ở tương lai.');
    }
    const isBackdated = Math.abs(Date.now() - parsed.getTime()) > 30 * 60 * 1000;
    if (isBackdated && (!notes || !notes.trim())) {
      throw new BadRequestException(
        'Check-in bù ngoài thời gian thực (> 30 phút) bắt buộc phải nhập ghi chú giải trình (notes).',
      );
    }
    return { eventTime: parsed, isBackdated };
  }

  private readonly lastPingTimeByUser = new Map<number, number>();

  private async validateLocationAndGeofence(
    user: AuthenticatedUser,
    location: LocationInput | undefined,
    targetCoords: GeoPoint | null,
    targetStopOrLeg: {
      stopType?: string | null;
      geofenceRadiusM?: number | null;
      locationRefType?: string | null;
      name?: string;
    },
    manualReason?: string | null,
    evidenceUrl?: string | null,
  ): Promise<{
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
    locationSource: string | null;
    distanceToStopM: number | null;
    geofencePassed: boolean | null;
    manualReason: string | null;
    evidenceUrl: string | null;
    flagged: boolean;
  }> {
    if (!location) {
      // Tài xế/áp tải phải gửi vị trí GPS, hoặc check-in thủ công (source = manual) kèm lý do + ảnh.
      // Chỉ Manager/Admin cập nhật thay từ xa (coordinator-override) mới được bỏ trống; log vẫn bị gắn cờ.
      if (isFieldStaff(user)) {
        throw new BadRequestException({
          code: 'LOCATION_REQUIRED',
          message: 'Vui lòng bật định vị GPS hoặc check-in thủ công kèm lý do và ảnh bằng chứng.',
        });
      }
      return {
        lat: null,
        lng: null,
        accuracyM: null,
        locationSource: manualReason ? 'manual' : null,
        distanceToStopM: null,
        geofencePassed: false,
        manualReason: manualReason?.trim() ?? null,
        evidenceUrl: evidenceUrl?.trim() ?? null,
        flagged: true,
      };
    }

    const source = location.source || 'gps';

    if (source === 'simulated') {
      const simSetting =
        typeof this.trackingStore?.getSetting === 'function'
          ? await this.trackingStore.getSetting('tracking.simulation_enabled')
          : null;
      const isSimEnabled =
        simSetting === true || simSetting === 'true' || process.env.TRACKING_SIMULATION_ENABLED === 'true';
      if (!isSimEnabled) {
        throw new ForbiddenException({
          code: 'SIMULATION_DISABLED',
          message: 'Chế độ giả lập vị trí hiện đang bị tắt bởi quản trị viên.',
        });
      }
    }

    if (source === 'manual') {
      if (!manualReason || manualReason.trim().length < 10) {
        throw new BadRequestException('Check-in thủ công bắt buộc phải có lý do giải trình rõ ràng (tối thiểu 10 ký tự).');
      }
      if (!evidenceUrl || !evidenceUrl.trim()) {
        throw new BadRequestException('Check-in thủ công bắt buộc phải có ảnh bằng chứng thực địa.');
      }
      assertSafeExternalOrUploadUrl(evidenceUrl);

      // Gửi thông báo tới Logistics Manager
      const locLabel = targetStopOrLeg.name || 'Điểm mốc';
      await this.notificationsService.notifyRole(
        'LOGISTICS_MANAGER',
        'Cảnh báo check-in thủ công ngoài vị trí',
        `Tài xế/Hộ tống ${user.fullName || user.email} vừa thực hiện check-in thủ công tại "${locLabel}". Lý do: "${manualReason.trim()}".`,
        'incident',
      );

      return {
        lat: Number(location.lat),
        lng: Number(location.lng),
        accuracyM: location.accuracyM !== undefined && location.accuracyM !== null ? Number(location.accuracyM) : null,
        locationSource: 'manual',
        distanceToStopM: targetCoords ? Math.round(distanceMeters(location, targetCoords)) : null,
        geofencePassed: false,
        manualReason: manualReason.trim(),
        evidenceUrl: evidenceUrl.trim(),
        flagged: true,
      };
    }

    // Đối với 'gps' hoặc 'simulated': tính toán geofence so với targetCoords
    const geofenceConfig =
      (typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.geofence')
        : null) || {};
    const radiusM = radiusForStop(targetStopOrLeg, geofenceConfig);

    const geoResult = evaluateGeofence({
      position: location,
      stop: targetCoords,
      radiusM,
      maxAccuracyM: geofenceConfig.maxAccuracyM,
    });

    if (geoResult.status === 'outside') {
      throw new ConflictException({
        code: 'OUTSIDE_GEOFENCE',
        distanceM: geoResult.distanceM,
        radiusM,
        message: `Vị trí hiện tại cách điểm mốc ${geoResult.distanceM}m, vượt quá bán kính cho phép (${radiusM}m). Vui lòng thử lại gần hơn hoặc check-in thủ công kèm lý do và ảnh.`,
      });
    }

    if (geoResult.status === 'low_accuracy') {
      throw new ConflictException({
        code: 'LOW_GPS_ACCURACY',
        message: 'Độ chính xác GPS quá thấp (vượt ngưỡng cho phép), vui lòng kiểm tra lại thiết bị và thử lại.',
      });
    }

    const isNoStopCoords = geoResult.status === 'no_stop_coordinates';

    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      accuracyM: location.accuracyM !== undefined && location.accuracyM !== null ? Number(location.accuracyM) : null,
      locationSource: source,
      distanceToStopM: geoResult.distanceM,
      geofencePassed: isNoStopCoords ? null : true,
      manualReason: isNoStopCoords ? 'Điểm chưa có tọa độ' : null,
      evidenceUrl: null,
      flagged: isNoStopCoords,
    };
  }

  async getVitalConfig(): Promise<EquineVitalConfig> {
    if (typeof this.trackingStore?.findActiveVitalConfig === 'function') {
      return this.trackingStore.findActiveVitalConfig();
    }
    return DEFAULT_EQUINE_VITAL_CONFIG;
  }

  async updateVitalConfig(user: AuthenticatedUser, patch: Partial<EquineVitalConfig>): Promise<EquineVitalConfig> {
    const current = await this.getVitalConfig();
    const next: EquineVitalConfig = { ...current, ...patch };
    if (
      !(next.tempAmberLowMin < next.tempGreenMin && next.tempGreenMin <= next.tempGreenMax && next.tempGreenMax < next.tempAmberHighMax)
    ) {
      throw new BadRequestException('Ngưỡng thân nhiệt không hợp lệ: phải thỏa tempAmberLowMin < tempGreenMin <= tempGreenMax < tempAmberHighMax.');
    }
    if (
      !(next.hrAmberLowMin < next.hrGreenMin && next.hrGreenMin <= next.hrGreenMax && next.hrGreenMax < next.hrAmberHighMax)
    ) {
      throw new BadRequestException('Ngưỡng nhịp tim không hợp lệ: phải thỏa hrAmberLowMin < hrGreenMin <= hrGreenMax < hrAmberHighMax.');
    }
    return this.trackingStore.updateVitalConfig(next, Number(user.id));
  }

  async handleUploadedEvidencePhotos(
    user: AuthenticatedUser,
    shipmentId: number,
    files: Express.Multer.File[],
  ): Promise<{ files: string[] }> {
    const cleanupFiles = () => {
      for (const f of files || []) {
        if (f?.path && fs.existsSync(f.path)) {
          try {
            fs.unlinkSync(f.path);
          } catch {}
        }
      }
    };

    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) {
      cleanupFiles();
      throw new NotFoundException('Không tìm thấy chuyến đi');
    }
    try {
      await this.assertAssignedForDriverEscort(user, shipmentId);
    } catch (err) {
      cleanupFiles();
      throw err;
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 tệp ảnh hợp lệ (JPG, PNG, WEBP).');
    }
    if (files.length > 5) {
      cleanupFiles();
      throw new BadRequestException('Tối đa 5 ảnh cho mỗi lần tải lên.');
    }
    try {
      for (const file of files) {
        verifyUploadedFileMagicBytes(file, 'image');
      }
    } catch (err) {
      cleanupFiles();
      throw err;
    }
    return {
      files: files.map((f) => `/api/tracking/evidence/attachments/${basename(f.filename)}`),
    };
  }

  async getAuthorizedEvidencePhotoPath(
    user: AuthenticatedUser,
    filename: string,
  ): Promise<{ absolutePath: string; fileName: string }> {
    const safeName = basename(filename);
    if (!safeName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      throw new BadRequestException('Tên tệp ảnh không hợp lệ.');
    }
    const allowed = await this.trackingStore.isEvidencePhotoAccessibleToUser(
      safeName,
      Number(user.id),
      String(user.role),
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền truy cập ảnh minh chứng của chuyến đi này.');
    }
    const absolutePath = join(process.cwd(), 'uploads', 'tracking-evidence', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp ảnh trên máy chủ lưu trữ.');
    }
    return { absolutePath, fileName: safeName };
  }

  async handleUploadedHealthPhotos(
    user: AuthenticatedUser,
    shipmentId: number,
    files: Express.Multer.File[],
  ): Promise<{ files: string[] }> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) {
      for (const f of files || []) {
        if (f.path && fs.existsSync(f.path)) try { fs.unlinkSync(f.path); } catch {}
      }
      throw new NotFoundException('Không tìm thấy chuyến đi');
    }
    try {
      await this.assertAssignedForDriverEscort(user, shipmentId);
    } catch (err) {
      for (const f of files || []) {
        if (f.path && fs.existsSync(f.path)) try { fs.unlinkSync(f.path); } catch {}
      }
      throw err;
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 tệp ảnh hợp lệ (JPG, PNG, WEBP).');
    }
    if (files.length > 5) {
      for (const f of files) {
        if (f.path && fs.existsSync(f.path)) try { fs.unlinkSync(f.path); } catch {}
      }
      throw new BadRequestException('Tối đa 5 ảnh cho mỗi lần tải lên.');
    }
    for (const file of files) {
      verifyUploadedFileMagicBytes(file, 'image');
    }
    return {
      files: files.map((f) => `/api/tracking/health-logs/attachments/${basename(f.filename)}`),
    };
  }

  async getAuthorizedHealthPhotoPath(
    user: AuthenticatedUser,
    filename: string,
  ): Promise<{ absolutePath: string; fileName: string }> {
    const safeName = basename(filename);
    const allowed = await this.trackingStore.isHealthPhotoAccessibleToUser(
      safeName,
      Number(user.id),
      String(user.role),
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền truy cập ảnh nhật ký sức khỏe của chuyến đi này.');
    }
    const absolutePath = join(process.cwd(), 'uploads', 'health-logs', safeName);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Không tìm thấy tệp ảnh trên máy chủ lưu trữ.');
    }
    return { absolutePath, fileName: safeName };
  }

  private async assertAssignedForDriverEscort(user: AuthenticatedUser, shipmentId: number): Promise<void> {
    const roleStr = String(user.role || '').toUpperCase();
    const isSupervisor =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');
    if (isSupervisor) return;

    if (roleStr.includes('DRIVER') || roleStr.includes('ESCORT')) {
      const assignedStaff = await this.trackingStore.findAssignedStaff(shipmentId);
      const isAssigned = assignedStaff.some((s) => Number(s.user_id) === Number(user.id));
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ được phép xem và thao tác trên chuyến đi đã được phân công cho mình');
      }
    }
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

    await this.assertAssignedForDriverEscort(user, shipmentId);

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
    const rawStatusLogs = await this.trackingStore.findTripStatusLogs(shipmentId);

    const isCustomer = String(user.role).toUpperCase() === 'CUSTOMER';
    const hasConsolidatedRoadTrip = legs.some((l) => Boolean(l.road_trip_id));

    let effectiveLegs = legs;
    let effectiveStops = stops;
    let statusLogs = rawStatusLogs;
    let consolidationContext: { itinerary: ConsolidatedRoadItinerary; shipments: any[] } | undefined;
    let consolidatedRouteSummary: string | null = null;

    if (isCustomer) {
      const transferStopIds = new Set(
        stops.filter((s) => s.stop_type === 'transfer_hub').map((s) => Number(s.route_stop_id)),
      );
      effectiveStops = stops
        .filter((s) => s.stop_type !== 'transfer_hub')
        .map((s, idx) => ({ ...s, sequence_no: idx + 1 }));
      effectiveLegs = legs.map((l, idx) => {
        if (!l.road_trip_id) return l;
        return {
          ...l,
          road_trip_id: null,
          origin_location: idx === 0 ? shipment.origin_location : l.origin_location,
          destination_location: idx === legs.length - 1 ? shipment.destination_location : l.destination_location,
        };
      });
      if (hasConsolidatedRoadTrip) {
        statusLogs = rawStatusLogs
          .filter((log) => !log.routeStopId || !transferStopIds.has(Number(log.routeStopId)))
          .map((log) => ({
            ...log,
            milestoneName:
              log.milestoneType === 'leg_departure'
                ? `Xuất phát: ${shipment.origin_location}`
                : log.milestoneType === 'leg_arrival'
                ? `Đến đích: ${shipment.destination_location}`
                : log.milestoneName,
            notes:
              typeof log.notes === 'string' && log.notes.toLowerCase().includes('chuyến ghép')
                ? 'Cập nhật tiến độ vận chuyển'
                : log.notes,
          }));
      }
    } else if (hasConsolidatedRoadTrip) {
      const context = await this.loadConsolidationContext(legs, stops);
      if (context) {
        consolidationContext = context;
        consolidatedRouteSummary = this.formatConsolidatedSummary(context.roadTripId, context.itinerary);
      }
    }

    // Build timeline milestones dynamically from route_leg and route_stop, enriched with notes from statusLogs
    const milestones = this.buildMilestonesTimeline(effectiveLegs, effectiveStops, statusLogs, consolidationContext);

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
    const assignedVehicle = effectiveLegs.find((l) => l.vehicle_plate)?.vehicle_plate || 'Xe thùng chuyên dụng';

    const finalRequestCode = `REQ-${String(shipmentId).padStart(3, '0')}`;

    return {
      shipmentId,
      requestCode: finalRequestCode,
      customerRequestCode: finalRequestCode,
      requestTitle: shipment.request_title || shipment.route_name || `${shipment.origin_location?.split(',')[0]} → ${shipment.destination_location?.split(',')[0]}`,
      customerName: shipment.customer_name || shipment.contact_name,
      origin: shipment.origin_location,
      destination: shipment.destination_location,
      shipmentStatus: shipment.status,
      routePlanStatus: route?.plan_status || shipment.status,
      currentMilestone: currentMilestoneText,
      consolidatedRouteSummary,
      eta: effectiveLegs[effectiveLegs.length - 1]?.planned_arrival ? new Date(effectiveLegs[effectiveLegs.length - 1].planned_arrival).toISOString() : null,
      totalDistanceKm: route?.total_distance_km ? Number(route.total_distance_km) : null,
      assignedVehicle,
      assignedDriver: driverStaff
        ? (!isCustomer && driverStaff.phone ? `${driverStaff.full_name} (${driverStaff.phone})` : driverStaff.full_name)
        : null,
      assignedEscort: escortStaff
        ? (!isCustomer && escortStaff.phone ? `${escortStaff.full_name} (${escortStaff.phone})` : escortStaff.full_name)
        : null,
      assignedHorses: assignedHorses.map((h) => ({
        id: h.horse_id,
        shipmentHorseId: h.shipment_horse_id ? Number(h.shipment_horse_id) : undefined,
        name: h.name,
        breed: h.breed,
        microchipNo: h.microchip_no,
        passportNo: h.passport_no,
      })),
      milestones,
      healthLogs,
      statusLogs,
      tripType: shipment.trip_type || 'one_way',
      returnStatus: shipment.return_status || null,
      returnDepartureAt: shipment.return_departure_at ? new Date(shipment.return_departure_at).toISOString() : null,
      returnWaitMinutes: shipment.return_wait_minutes ?? 120,
      returnNoShow: Boolean(shipment.return_no_show),
      lastUpdated: new Date().toISOString(),
    };
  }

  private async loadConsolidationContext(
    legs: any[],
    stops: any[],
  ): Promise<{ roadTripId: number; itinerary: ConsolidatedRoadItinerary; shipments: any[] } | null> {
    const roadLeg = legs.find((l) => Boolean(l.road_trip_id));
    if (!roadLeg?.road_trip_id) return null;
    if (typeof this.trackingStore.findShipmentsByRoadTripId !== 'function') return null;

    const roadTripId = Number(roadLeg.road_trip_id);
    const shipments = await this.trackingStore.findShipmentsByRoadTripId(roadTripId);
    if (!shipments || shipments.length <= 1) return null;

    const itinerary = buildConsolidatedRoadItinerary({
      shipments: shipments.map((s) => ({
        shipmentId: Number(s.shipment_id),
        requestCode: s.request_code || `REQ-${String(s.shipment_id).padStart(3, '0')}`,
        originLocation: s.origin_location,
        destinationLocation: s.destination_location,
      })),
      corridorStops: stops.map((s) => ({
        routeStopId: s.route_stop_id,
        sequenceNo: s.sequence_no,
        stopType: s.stop_type,
        locationName: s.location_name,
        country: s.country,
      })),
    });

    return { roadTripId, itinerary, shipments };
  }

  private formatConsolidatedSummary(roadTripId: number, itinerary: ConsolidatedRoadItinerary): string {
    const pickLabel = itinerary.orderedOrigins
      .map((o) => `${o.location.split(',')[0].trim()} (Đón ${o.requestCodes.map((c) => `#${c}`).join(', ')})`)
      .join(' → ');
    const dropLabel = itinerary.orderedDestinations
      .map((d) => `${d.location.split(',')[0].trim()} (Trả ${d.requestCodes.map((c) => `#${c}`).join(', ')})`)
      .join(' → ');
    return `Chuyến ghép #${roadTripId}: ${pickLabel} → ${dropLabel}`;
  }

  private buildMilestonesTimeline(
    legs: any[],
    stops: any[],
    statusLogs?: any[],
    consolidationContext?: { itinerary: ConsolidatedRoadItinerary; shipments: any[] },
  ): TrackingMilestoneItem[] {
    const hasReturnLegs = legs.some((l) => (l as any).direction === 'return');
    const isMultiModalFlight = !hasReturnLegs && legs.some((l) => l.leg_type === 'flight') && legs.length >= 2;

    let items: TrackingMilestoneItem[] = [];
    if (isMultiModalFlight) {
      items = this.buildSimplifiedMultiModalMilestones(legs, stops);
    } else {
      items = this.buildStandardTimeline(legs, stops, consolidationContext);
    }

    // Gắn ghi chú thực địa (notes) và người xác nhận (updatedBy) từ lịch sử cập nhật statusLogs
    if (statusLogs && statusLogs.length > 0) {
      for (const item of items) {
        let matchingLog = statusLogs.find(
          (l) => item.stopId && l.routeStopId === item.stopId && l.notes,
        );

        if (!matchingLog && item.legId) {
          if (item.itemType === 'leg_start') {
            matchingLog = statusLogs.find(
              (l) => l.legId === item.legId && l.milestoneType === 'leg_departure' && l.notes,
            );
          } else if (item.itemType === 'leg_end') {
            matchingLog = statusLogs.find(
              (l) => l.legId === item.legId && (l.milestoneType === 'leg_arrival' || l.milestoneType?.includes('arrival')) && l.notes,
            );
          }
        }

        if (!matchingLog) {
          matchingLog = statusLogs.find(
            (l) => (l.milestoneName?.includes(item.title) || l.milestoneName?.includes(item.location)) && l.notes,
          );
        }

        if (matchingLog) {
          if (!item.notes) item.notes = matchingLog.notes;
          if (!item.updatedBy) {
            item.updatedBy = matchingLog.updatedByName
              ? `${matchingLog.updatedByName} (${matchingLog.updatedByRole || 'Thực địa'})`
              : (matchingLog.updatedByRole || 'Nhân sự thực địa');
          }
          item.lat = matchingLog.lat ?? null;
          item.lng = matchingLog.lng ?? null;
          item.locationSource = matchingLog.locationSource ?? null;
          item.distanceToStopM = matchingLog.distanceToStopM ?? null;
          item.geofencePassed = matchingLog.geofencePassed ?? null;
          item.flagged = Boolean(matchingLog.flagged);
          item.manualReason = matchingLog.manualReason ?? null;
          item.evidenceUrl = matchingLog.evidenceUrl ?? null;
        }
      }
    }

    return items;
  }

  private classifyMultimodalStops(legs: any[], stops: any[]): {
    legRoad1: any;
    legFlight: any;
    legRoadLast: any;
    stopExport: any | null;
    stopImport: any | null;
  } {
    const legRoad1 = legs[0];
    const legFlight = legs.find((l) => l.leg_type === 'flight') || legs[1];
    const legRoadLast = legs[legs.length - 1];

    const isVnStop = (s: any) => {
      const c = (s.country || '').toLowerCase();
      const loc = (s.location_name || '').toLowerCase();
      return (
        c.includes('vietnam') ||
        c.includes('việt nam') ||
        loc.includes('tân sơn nhất') ||
        loc.includes('nội bài') ||
        loc.includes('việt nam')
      );
    };

    const stopExport =
      stops.find((s) => s.leg_id && legRoad1 && Number(s.leg_id) === Number(legRoad1.leg_id)) ||
      stops.find((s) => isVnStop(s)) ||
      (stops.length >= 2 && (!stops[0].leg_id || Number(stops[0].leg_id) === Number(legRoad1?.leg_id))
        ? stops[0]
        : stops.length === 1 && !stops[0].country && !stops[0].leg_id
          ? stops[0]
          : null);

    const stopImport =
      stops.find(
        (s) =>
          s.route_stop_id !== stopExport?.route_stop_id &&
          s.leg_id &&
          legRoadLast &&
          Number(s.leg_id) === Number(legRoadLast.leg_id),
      ) ||
      stops.find((s) => s.route_stop_id !== stopExport?.route_stop_id) ||
      null;

    return { legRoad1, legFlight, legRoadLast, stopExport, stopImport };
  }

  // 6 Mốc Tinh Gọn dành riêng cho Tuyến Đa Phương Thức (Đường bộ VN -> Bay Quốc Tế -> Đường bộ Nước Ngoài)
  private buildSimplifiedMultiModalMilestones(legs: any[], stops: any[]): TrackingMilestoneItem[] {
    const items: TrackingMilestoneItem[] = [];
    let foundFirstIncomplete = false;

    const { legRoad1, legFlight, legRoadLast, stopExport, stopImport } =
      this.classifyMultimodalStops(legs, stops);

    // --- MỐC 1: Xe xuất phát tại trang trại khách hàng ---
    const isM1Done =
      legRoad1.actual_departure !== null ||
      legRoad1.status === 'active' ||
      legRoad1.status === 'departed' ||
      legRoad1.status === 'in_transit' ||
      legRoad1.status === 'completed';

    let m1Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM1Done) {
      m1Status = 'COMPLETED';
    } else if (!foundFirstIncomplete) {
      m1Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    items.push({
      id: `leg-${legRoad1.leg_id}-start`,
      itemType: 'leg_start',
      legId: legRoad1.leg_id,
      seq: 1,
      title: `Xe xuất phát tại trang trại: ${legRoad1.origin_location}`,
      location: legRoad1.origin_location,
      status: m1Status,
      plannedTime: legRoad1.planned_departure ? new Date(legRoad1.planned_departure).toISOString() : null,
      actualTime: legRoad1.actual_departure ? new Date(legRoad1.actual_departure).toISOString() : null,
      isCustomsBorder: false,
      legType: 'road',
      responsibleRole: 'driver',
      notes: null,
      updatedBy: null,
      allowedActions: m1Status === 'CURRENT' ? ['start_leg'] : [],
    });

    // --- MỐC 2: Xe đã tới sân bay và vượt qua kiểm dịch xuất cảnh ---
    const isM2Done =
      (stopExport && (stopExport.status === 'customs_cleared' || stopExport.status === 'departed')) ||
      legRoad1.status === 'completed' ||
      legRoad1.actual_arrival !== null;

    let m2Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM2Done) {
      m2Status = 'COMPLETED';
    } else if (!foundFirstIncomplete && isM1Done) {
      m2Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    const m2Actions: string[] = [];
    if (m2Status === 'CURRENT') {
      if (!stopExport) {
        m2Actions.push('arrive_leg');
      } else if (stopExport.status === 'pending') {
        m2Actions.push('arrive_stop');
      } else if (stopExport.status === 'arrived') {
        m2Actions.push('clear_customs');
      } else {
        m2Actions.push('depart_stop');
      }
    }

    items.push({
      id: stopExport ? `stop-${stopExport.route_stop_id}` : `leg-${legRoad1.leg_id}-end`,
      itemType: stopExport ? 'stop' : 'leg_end',
      legId: legRoad1.leg_id,
      stopId: stopExport?.route_stop_id || null,
      seq: 2,
      title: `Xe đã tới sân bay & vượt qua kiểm dịch: ${stopExport ? stopExport.location_name : legRoad1.destination_location}`,
      location: stopExport ? `${stopExport.location_name}, ${stopExport.country || 'Vietnam'}` : legRoad1.destination_location,
      status: m2Status,
      plannedTime: stopExport?.planned_arrival ? new Date(stopExport.planned_arrival).toISOString() : (legRoad1.planned_arrival ? new Date(legRoad1.planned_arrival).toISOString() : null),
      actualTime: stopExport?.actual_departure
        ? new Date(stopExport.actual_departure).toISOString()
        : stopExport?.actual_arrival
        ? new Date(stopExport.actual_arrival).toISOString()
        : (legRoad1.actual_arrival ? new Date(legRoad1.actual_arrival).toISOString() : null),
      isCustomsBorder: true,
      legType: 'road',
      responsibleRole: 'driver',
      notes: stopExport?.notes || null,
      updatedBy: stopExport?.updated_by_name || null,
      allowedActions: m2Actions,
    });

    // --- MỐC 3: Ngựa bắt đầu xuất phát từ sân bay (Cất cánh) ---
    const isM3Done =
      legFlight.actual_departure !== null ||
      legFlight.status === 'active' ||
      legFlight.status === 'departed' ||
      legFlight.status === 'in_transit' ||
      legFlight.status === 'completed';

    let m3Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM3Done) {
      m3Status = 'COMPLETED';
    } else if (!foundFirstIncomplete && isM2Done) {
      m3Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    items.push({
      id: `leg-${legFlight.leg_id}-start`,
      itemType: 'leg_start',
      legId: legFlight.leg_id,
      seq: 3,
      title: `Ngựa bắt đầu xuất phát từ sân bay (Cất cánh): ${legFlight.origin_location}`,
      location: legFlight.origin_location,
      status: m3Status,
      plannedTime: legFlight.planned_departure ? new Date(legFlight.planned_departure).toISOString() : null,
      actualTime: legFlight.actual_departure ? new Date(legFlight.actual_departure).toISOString() : null,
      isCustomsBorder: false,
      legType: 'flight',
      responsibleRole: 'escort',
      notes: null,
      updatedBy: null,
      allowedActions: m3Status === 'CURRENT' ? ['start_leg'] : [],
    });

    // --- MỐC 4: Ngựa đã tới điểm bay / Sân bay đích (Hạ cánh an toàn) ---
    const isM4Done = legFlight.actual_arrival !== null || legFlight.status === 'completed';

    let m4Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM4Done) {
      m4Status = 'COMPLETED';
    } else if (!foundFirstIncomplete && isM3Done) {
      m4Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    items.push({
      id: `leg-${legFlight.leg_id}-end`,
      itemType: 'leg_end',
      legId: legFlight.leg_id,
      seq: 4,
      title: `Ngựa đã tới điểm bay / Hạ cánh an toàn: ${legFlight.destination_location}`,
      location: legFlight.destination_location,
      status: m4Status,
      plannedTime: legFlight.planned_arrival ? new Date(legFlight.planned_arrival).toISOString() : null,
      actualTime: legFlight.actual_arrival ? new Date(legFlight.actual_arrival).toISOString() : null,
      isCustomsBorder: false,
      legType: 'flight',
      responsibleRole: 'escort',
      notes: null,
      updatedBy: null,
      allowedActions: m4Status === 'CURRENT' ? ['arrive_leg'] : [],
    });

    // --- MỐC 5: Ngựa đã vượt qua hải quan & kiểm dịch sân bay đến ---
    const isM5Done =
      (stopImport && (stopImport.status === 'customs_cleared' || stopImport.status === 'departed')) ||
      (legRoadLast.actual_departure !== null && legRoadLast.status !== 'pending');

    let m5Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM5Done) {
      m5Status = 'COMPLETED';
    } else if (!foundFirstIncomplete && isM4Done) {
      m5Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    const m5Actions: string[] = [];
    if (m5Status === 'CURRENT') {
      if (!stopImport) {
        m5Actions.push('start_leg');
      } else if (stopImport.status === 'pending') {
        m5Actions.push('arrive_stop');
      } else if (stopImport.status === 'arrived') {
        m5Actions.push('clear_customs');
      } else {
        m5Actions.push('depart_stop');
      }
    }

    items.push({
      id: stopImport ? `stop-${stopImport.route_stop_id}` : `leg-${legRoadLast.leg_id}-start`,
      itemType: stopImport ? 'stop' : 'leg_start',
      legId: legRoadLast.leg_id,
      stopId: stopImport?.route_stop_id || null,
      seq: 5,
      title: `Ngựa đã vượt qua hải quan & kiểm dịch sân bay đến: ${stopImport ? stopImport.location_name : legRoadLast.origin_location}`,
      location: stopImport ? `${stopImport.location_name}, ${stopImport.country || 'Quốc tế'}` : legRoadLast.origin_location,
      status: m5Status,
      plannedTime: stopImport?.planned_arrival ? new Date(stopImport.planned_arrival).toISOString() : (legRoadLast.planned_departure ? new Date(legRoadLast.planned_departure).toISOString() : null),
      actualTime: stopImport?.actual_departure
        ? new Date(stopImport.actual_departure).toISOString()
        : stopImport?.actual_arrival
        ? new Date(stopImport.actual_arrival).toISOString()
        : (legRoadLast.actual_departure ? new Date(legRoadLast.actual_departure).toISOString() : null),
      isCustomsBorder: true,
      legType: 'road',
      responsibleRole: 'escort',
      notes: stopImport?.notes || null,
      updatedBy: stopImport?.updated_by_name || null,
      allowedActions: m5Actions,
    });

    // --- MỐC 6: Ngựa đã tới đích đến an toàn ---
    const isM6Done = legRoadLast.actual_arrival !== null || legRoadLast.status === 'completed';

    let m6Status: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
    if (isM6Done) {
      m6Status = 'COMPLETED';
    } else if (!foundFirstIncomplete && isM5Done) {
      m6Status = 'CURRENT';
      foundFirstIncomplete = true;
    }

    items.push({
      id: `leg-${legRoadLast.leg_id}-end`,
      itemType: 'leg_end',
      legId: legRoadLast.leg_id,
      seq: 6,
      title: `Ngựa đã tới đích đến an toàn: ${legRoadLast.destination_location}`,
      location: legRoadLast.destination_location,
      status: m6Status,
      plannedTime: legRoadLast.planned_arrival ? new Date(legRoadLast.planned_arrival).toISOString() : null,
      actualTime: legRoadLast.actual_arrival ? new Date(legRoadLast.actual_arrival).toISOString() : null,
      isCustomsBorder: false,
      legType: 'road',
      responsibleRole: 'escort',
      notes: null,
      updatedBy: null,
      allowedActions: m6Status === 'CURRENT' ? ['arrive_leg'] : [],
    });

    return items;
  }

  /**
   * Deterministic mapping of stops to a leg when route_stop.leg_id may be null.
   * Shared by buildStandardTimeline, getShipmentTimeline, checkInStop, and checkInLegArrival
   * so milestone progression and vertical timeline stay 100% synchronized.
   */
  private getStopsForLeg(
    leg: any,
    legIndex: number,
    legsSubset: any[],
    stopsSubset: any[],
    classifiedStops?: ReturnType<TrackingService['classifyMultimodalStops']> | null,
  ): any[] {
    const matched = stopsSubset.filter((s) => {
      if (s.leg_id) return Number(s.leg_id) === Number(leg.leg_id);
      if (legsSubset.length === 1) return true;
      if (classifiedStops) {
        if (classifiedStops.legRoad1 && Number(leg.leg_id) === Number(classifiedStops.legRoad1.leg_id)) {
          return classifiedStops.stopExport?.route_stop_id === s.route_stop_id;
        }
        if (classifiedStops.legRoadLast && Number(leg.leg_id) === Number(classifiedStops.legRoadLast.leg_id)) {
          return classifiedStops.stopImport?.route_stop_id === s.route_stop_id;
        }
        return false;
      }
      return Number(s.sequence_no) === 1
        ? legIndex === 0
        : legIndex === legsSubset.length - 1;
    });
    return matched.sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));
  }

  // Luồng tiêu chuẩn cho các tuyến đường bộ nội địa
  private buildStandardTimeline(
    legs: any[],
    stops: any[],
    consolidationContext?: { itinerary: ConsolidatedRoadItinerary; shipments: any[] },
  ): TrackingMilestoneItem[] {
    const items: TrackingMilestoneItem[] = [];
    let milestoneSeq = 1;
    let foundFirstIncomplete = false;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const legStops = this.getStopsForLeg(leg, i, legs, stops);

      const isConsolidatedLeg = Boolean(leg.road_trip_id && consolidationContext?.itinerary);
      const itinerary = isConsolidatedLeg ? consolidationContext!.itinerary : undefined;
      const startCodes = itinerary?.orderedOrigins[0]?.requestCodes.map((c) => `#${c}`).join(', ');
      const endGroup = itinerary?.orderedDestinations[itinerary.orderedDestinations.length - 1];
      const endCodes = endGroup?.requestCodes.map((c) => `#${c}`).join(', ');

      const isLegDeparted =
        leg.actual_departure !== null ||
        ['active', 'departed', 'in_transit', 'completed'].includes(leg.status);
      let legStartStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
      if (isLegDeparted) {
        legStartStatus = 'COMPLETED';
      } else if (!foundFirstIncomplete) {
        legStartStatus = 'CURRENT';
        foundFirstIncomplete = true;
      }

      items.push({
        id: `leg-${leg.leg_id}-start`,
        itemType: 'leg_start',
        legId: leg.leg_id,
        seq: milestoneSeq++,
        title: startCodes
          ? `Xuất phát chặng ${leg.sequence_no} (Đón ${startCodes}): ${leg.origin_location}`
          : `Xuất phát chặng ${leg.sequence_no}: ${leg.origin_location}`,
        location: leg.origin_location,
        status: legStartStatus,
        plannedTime: leg.planned_departure ? new Date(leg.planned_departure).toISOString() : null,
        actualTime: leg.actual_departure ? new Date(leg.actual_departure).toISOString() : null,
        isCustomsBorder: false,
        legType: leg.leg_type || 'road',
        responsibleRole: leg.leg_type === 'flight' || leg.leg_type === 'sea' ? 'escort' : 'driver',
        notes: null,
        updatedBy: null,
        allowedActions: legStartStatus === 'CURRENT' ? ['start_leg'] : [],
      });

      for (const stop of legStops) {
        const isCustoms = stop.stop_type === 'quarantine' || stop.stop_type === 'border_check';
        const isQuarantine = stop.stop_type === 'quarantine';
        const isStopDone =
          stop.status === 'departed' ||
          (!isQuarantine && isCustoms && (stop.status === 'customs_cleared' || stop.status === 'cleared'));

        let stopStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
        if (isStopDone) {
          stopStatus = 'COMPLETED';
        } else if (stop.status === 'arrived' || (isQuarantine && (stop.status === 'customs_cleared' || stop.status === 'cleared'))) {
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
            if (isCustoms) {
              stopActions.push('clear_customs');
            } else {
              stopActions.push('depart_stop');
            }
          } else if (stop.status === 'customs_cleared' || stop.status === 'cleared') {
            stopActions.push('depart_stop');
          }
        }

        items.push({
          id: `stop-${stop.route_stop_id}`,
          itemType: 'stop',
          legId: leg.leg_id,
          stopId: stop.route_stop_id,
          seq: milestoneSeq++,
          title: this.formatStopMilestoneTitle(stop, itinerary),
          location: `${stop.location_name}, ${stop.country || 'Vietnam'}`,
          status: stopStatus,
          plannedTime: stop.planned_arrival ? new Date(stop.planned_arrival).toISOString() : null,
          actualTime: stop.actual_departure ? new Date(stop.actual_departure).toISOString() : (stop.actual_arrival ? new Date(stop.actual_arrival).toISOString() : null),
          isCustomsBorder: isCustoms,
          legType: leg.leg_type || 'road',
          responsibleRole: leg.leg_type === 'flight' || leg.leg_type === 'sea' ? 'escort' : 'driver',
          notes: stop.notes || null,
          updatedBy: stop.updated_by_name || null,
          allowedActions: stopActions,
        });
      }

      const finalDestShipmentIds = new Set(endGroup?.shipmentIds || []);
      const hasPendingFinalDestSibling =
        isConsolidatedLeg &&
        finalDestShipmentIds.size > 0 &&
        consolidationContext!.shipments.some(
          (s) =>
            finalDestShipmentIds.has(Number(s.shipment_id)) &&
            s.leg_status !== 'completed' &&
            !s.leg_actual_arrival,
        );
      const isLegArrived =
        (leg.actual_arrival !== null || leg.status === 'completed') && !hasPendingFinalDestSibling;
      const allLegStopsCompleted = legStops.every((s) =>
        s.stop_type === 'quarantine'
          ? s.status === 'departed'
          : s.status === 'departed' || s.status === 'customs_cleared' || s.status === 'cleared',
      );
      let legEndStatus: 'PENDING' | 'CURRENT' | 'COMPLETED' = 'PENDING';
      if (isLegArrived) {
        legEndStatus = 'COMPLETED';
      } else if (!foundFirstIncomplete && isLegDeparted && allLegStopsCompleted) {
        legEndStatus = 'CURRENT';
        foundFirstIncomplete = true;
      }

      items.push({
        id: `leg-${leg.leg_id}-end`,
        itemType: 'leg_end',
        legId: leg.leg_id,
        seq: milestoneSeq++,
        title: endCodes
          ? `Đến đích chặng ${leg.sequence_no} (Trả ${endCodes}): ${leg.destination_location}`
          : `Đến đích chặng ${leg.sequence_no}: ${leg.destination_location}`,
        location: leg.destination_location,
        status: legEndStatus,
        plannedTime: leg.planned_arrival ? new Date(leg.planned_arrival).toISOString() : null,
        actualTime: leg.actual_arrival ? new Date(leg.actual_arrival).toISOString() : null,
        isCustomsBorder: false,
        legType: leg.leg_type || 'road',
        responsibleRole: leg.leg_type === 'flight' || leg.leg_type === 'sea' ? 'escort' : 'driver',
        notes: null,
        updatedBy: null,
        allowedActions: legEndStatus === 'CURRENT' ? ['arrive_leg'] : [],
      });
    }

    return items;
  }

  private formatStopMilestoneTitle(stop: any, itinerary?: ConsolidatedRoadItinerary): string {
    if (stop.stop_type === 'transfer_hub' && itinerary) {
      const matched = itinerary.stops.find(
        (s) => s.stopType === 'transfer_hub' && areSameLocations(s.locationName, stop.location_name),
      );
      if (matched) {
        const codes = matched.requestCodes.map((c) => `#${c}`).join(', ');
        return matched.stopRole === 'pickup'
          ? `Điểm đón hàng ghép (${codes}): ${stop.location_name}`
          : `Điểm trả hàng ghép (${codes}): ${stop.location_name}`;
      }
    }
    return `${stop.location_name} (${this.getStopTypeVi(stop.stop_type)})`;
  }

  private getStopTypeVi(type: string): string {
    const map: Record<string, string> = {
      rest: 'Nghỉ dưỡng ngựa',
      quarantine: 'Kiểm dịch thú y',
      refuel: 'Tiếp nhiên liệu',
      border_check: 'Cửa khẩu / Hải quan',
      transfer_hub: 'Điểm đón / trả ghép chuyến',
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
    await this.assertAssignedForDriverEscort(user, shipmentId);

    if (
      [
        'requested',
        'change_requested',
        'rejected',
        'cancelled',
        'cancelled_operational',
        'completed',
      ].includes(shipment.status)
    ) {
      throw new ConflictException(
        `Chuyến đi đang ở trạng thái "${shipment.status}". Không thể xuất phát.`,
      );
    }

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const targetLeg = legs.find((l) => l.leg_id === Number(legId));
    if (!targetLeg) throw new NotFoundException(`Không tìm thấy chặng #${legId}`);

    // Role check: driver for road, escort for flight, coordinator/manager can override
    this.assertStaffCanUpdateLeg(user, targetLeg);

    // Mốc chỉ đi tiến: chặng đã xuất phát / hoàn thành không được "xuất phát" lại
    // (trước đây sẽ reset chặng về active và ghi đè actual_departure cũ, làm mất lịch sử).
    if (targetLeg.actual_departure || (targetLeg.status && targetLeg.status !== 'pending')) {
      throw new ConflictException(
        `Chặng #${targetLeg.sequence_no} đã ${targetLeg.status === 'completed' ? 'hoàn thành' : 'xuất phát'}, không thể xuất phát lại. Nếu cần điều chỉnh, vui lòng báo Manager để ghi nhận sửa đổi có lý do.`,
      );
    }

    if (targetLeg.sequence_no === 1 && shipment.status !== 'in_transit') {
      const readiness = await this.routesService.getTripPlanReadiness(user, shipmentId);
      if (!readiness.isReadyToDepart) {
        throw new UnprocessableEntityException({
          message: readiness.pendingConditions.join('; '),
          missingRequirements: readiness.pendingConditions,
        });
      }
      shipment.status = 'ready_to_depart';
    } else if (
      targetLeg.sequence_no > 1 &&
      shipment.status !== 'ready_to_depart' &&
      shipment.status !== 'in_transit' &&
      shipment.status !== 'return_pending'
    ) {
      throw new ConflictException(
        `Chuyến đi đang ở trạng thái "${shipment.status}". Chỉ chuyến "Ready to depart", "In transit" hoặc "Return pending" mới có thể xuất phát chặng #${targetLeg.sequence_no}.`,
      );
    }

    // Sequence check: previous leg must be completed
    if (targetLeg.sequence_no > 1) {
      const prevLeg = legs.find((l) => l.sequence_no === targetLeg.sequence_no - 1);
      if (prevLeg && prevLeg.status !== 'completed' && !prevLeg.actual_arrival) {
        throw new ConflictException(
          `Không thể xuất phát chặng #${targetLeg.sequence_no} khi chặng #${prevLeg.sequence_no} chưa hoàn thành!`,
        );
      }
    }

    const { eventTime: now, isBackdated } = this.evaluateEventTimestamp(dto.actualTime, dto.notes);
    const actorRole = await this.resolveOperationalActorRole(shipmentId, user);

    // Step 10: GPS Geofence & Location evidence validation
    const legCoords =
      typeof this.trackingStore?.findLegCoordinates === 'function'
        ? await this.trackingStore.findLegCoordinates(legId)
        : null;
    const originPoint: GeoPoint | null =
      legCoords && legCoords.originLat != null && legCoords.originLng != null
        ? { lat: legCoords.originLat, lng: legCoords.originLng }
        : null;

    const locEvidence = await this.validateLocationAndGeofence(
      user,
      dto.location,
      originPoint,
      {
        stopType: 'origin',
        geofenceRadiusM: 300,
        locationRefType: 'address',
        name: targetLeg.origin_location,
      },
      dto.manualReason,
      dto.evidenceUrl,
    );

    // Step 5: Nếu xuất phát chặng về (direction: return)
    const legDirection = (targetLeg as any).direction || 'outbound';
    if (legDirection === 'return') {
      if ((shipment as any).return_status === 'cancelled') {
        throw new ConflictException('Chặng về đã bị hủy, không thể xuất phát');
      }
      if ((shipment as any).return_status === 'no_show') {
        throw new ConflictException('Chặng về đã bị đánh dấu no-show, không thể xuất phát');
      }
      await this.trackingStore.updateShipmentStatus(shipmentId, 'in_transit');
      await this.trackingStore.updateShipmentReturnStatus(shipmentId, 'in_progress');
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'in_transit');
      await this.trackingStore.recordTripStatusLog({
        shipmentId,
        routeId: route.route_id,
        legId: targetLeg.leg_id,
        previousStatus: 'return_pending',
        newStatus: 'in_transit',
        milestoneType: 'leg_departure',
        milestoneName: `Bắt đầu khởi hành chặng về #${targetLeg.sequence_no}`,
        notes: `Bắt đầu khởi hành chặng về #${targetLeg.sequence_no} (${targetLeg.origin_location} → ${targetLeg.destination_location})`,
        updatedBy: Number(user.id),
        updatedByRole: actorRole || String(user.role),
        isBackdated,
      });
    }

    // Update leg status to 'active'
    await this.trackingStore.updateLegStatus(legId, 'active', now, null);

    // Transition shipment from 'ready_to_depart' to 'in_transit' if starting 1st leg
    if (targetLeg.sequence_no === 1 && shipment.status === 'ready_to_depart') {
      await this.trackingStore.updateShipmentStatus(shipmentId, 'in_transit');
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'in_transit');

      // Send auto notification to Customer
      const custOrigin = targetLeg.road_trip_id ? (shipment.origin_location || targetLeg.origin_location) : targetLeg.origin_location;
      const custDest = targetLeg.road_trip_id ? (shipment.destination_location || targetLeg.destination_location) : targetLeg.destination_location;
      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Chuyến vận chuyển ngựa đã xuất phát!',
        `Đơn vận chuyển #${shipment.request_code} đã bắt đầu khởi hành chặng 1 (${custOrigin} → ${custDest}).`,
        'status_update',
        shipmentId,
      );

      // Send auto notification to Coordinator
      const actor = await this.resolveStaffActor(shipmentId, user);
      const coordTitle = `Chuyến đi #${shipment.request_code} đã xuất phát thực tế`;
      const coordMessage = `${actor.displayName} đã bấm xác nhận xuất phát tại trang trại của khách (${targetLeg.origin_location}). Hệ thống đã kích hoạt giám sát thời gian thực.`;
      if (route.assigned_coordinator_id) {
        await this.notificationsService.createNotification(
          route.assigned_coordinator_id,
          coordTitle,
          coordMessage,
          'status_update',
          shipmentId,
        );
      } else {
        await this.notificationsService.notifyRole(
          'LOGISTICS_MANAGER',
          coordTitle,
          coordMessage,
          'status_update',
          shipmentId,
        );
      }
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
      updatedByRole: actorRole,
      isBackdated,
      lat: locEvidence.lat,
      lng: locEvidence.lng,
      accuracyM: locEvidence.accuracyM,
      locationSource: locEvidence.locationSource,
      distanceToStopM: locEvidence.distanceToStopM,
      geofencePassed: locEvidence.geofencePassed,
      manualReason: locEvidence.manualReason,
      evidenceUrl: locEvidence.evidenceUrl,
      flagged: locEvidence.flagged,
    });

    if (
      locEvidence.lat != null &&
      locEvidence.lng != null &&
      locEvidence.locationSource !== 'manual' &&
      typeof this.trackingStore?.saveVehiclePositionPings === 'function'
    ) {
      await this.trackingStore.saveVehiclePositionPings([{
        shipmentId,
        legId,
        vehicleId: targetLeg.vehicle_id || null,
        reportedBy: Number(user.id),
        lat: locEvidence.lat,
        lng: locEvidence.lng,
        accuracyM: locEvidence.accuracyM,
        source: locEvidence.locationSource === 'simulated' ? 'simulated' : 'gps',
        recordedAt: now,
        isBackdated,
      }]);
    }

    await this.syncSiblingLegStart(user, targetLeg, now, dto.notes, actorRole, isBackdated);

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
    await this.assertAssignedForDriverEscort(user, shipmentId);
    this.assertJourneyActive(shipment.status, 'cập nhật trạm dừng');

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
    const targetStop = stops.find((s) => s.route_stop_id === Number(stopId));
    if (!targetStop) throw new NotFoundException(`Không tìm thấy trạm dừng #${stopId}`);

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const hasReturnLegs = legs.some((l) => (l as any).direction === 'return');
    const isMultiModalFlight = !hasReturnLegs && legs.some((l) => l.leg_type === 'flight') && legs.length >= 2;
    const classifiedStops = isMultiModalFlight ? this.classifyMultimodalStops(legs, stops) : null;
    const isImportStop = Boolean(
      classifiedStops?.stopImport && targetStop.route_stop_id === classifiedStops.stopImport.route_stop_id,
    );

    const parentLeg =
      legs.find((l) => l.leg_id === targetStop.leg_id) ||
      legs.find((l, idx) =>
        this.getStopsForLeg(l, idx, legs, stops, classifiedStops).some(
          (s) => Number(s.route_stop_id) === Number(targetStop.route_stop_id),
        ),
      ) ||
      (isMultiModalFlight && isImportStop
        ? classifiedStops!.legRoadLast
        : isMultiModalFlight
          ? classifiedStops!.legRoad1
          : legs.length === 1
            ? legs[0]
            : legs.find((l) => l.leg_type !== 'flight') || legs[0]);

    // DEC-07: Driver & Escort đều được phép check-in chéo dự phòng nếu đã được phân công chuyến; ghi rõ updated_by_role.
    const actorRole = await this.resolveOperationalActorRole(shipmentId, user);

    // Rule: Chặng phải bắt đầu rồi mới được check-in trạm dừng (riêng trạm nhập cảnh sau chặng bay chỉ cần chặng bay đã hạ cánh)
    const flightCompletedForImportStop =
      isMultiModalFlight &&
      isImportStop &&
      (classifiedStops?.legFlight?.status === 'completed' || classifiedStops?.legFlight?.actual_arrival !== null);
    if (!parentLeg || (!parentLeg.actual_departure && parentLeg.status === 'pending' && !flightCompletedForImportStop)) {
      throw new ConflictException('Chặng vận chuyển chưa xuất phát! Vui lòng bấm "Xuất phát" chặng trước khi cập nhật trạm dừng.');
    }

    // Sequence & state machine checking inside the stop (strict monotonic forward transition)
    const normalizedCurrent = targetStop.status === 'cleared' ? 'customs_cleared' : (targetStop.status || 'pending');
    if (normalizedCurrent === 'departed') {
      throw new ConflictException(`Trạm dừng "${targetStop.location_name}" đã hoàn tất rời trạm, không thể cập nhật lại trạng thái "${dto.action}"`);
    }
    if (dto.action === 'arrived' && normalizedCurrent !== 'pending') {
      throw new ConflictException(`Trạm dừng "${targetStop.location_name}" đang ở trạng thái "${normalizedCurrent}", không thể quay lại "arrived"`);
    }
    // Không nhảy cóc: các trạm đứng trước trong cùng chặng (cùng chiều đi/về) phải đã rời trạm.
    // Chuyến ghép cũ (road_trip) bỏ qua vì trạm được đồng bộ giữa các đơn anh em.
    if (dto.action === 'arrived' && !parentLeg?.road_trip_id) {
      const direction = (targetStop as any).direction || 'outbound';
      const unfinishedEarlier = stops.filter(
        (s) =>
          s.route_stop_id !== targetStop.route_stop_id &&
          (s.leg_id ?? null) === (targetStop.leg_id ?? null) &&
          ((s as any).direction || 'outbound') === direction &&
          Number(s.sequence_no) < Number(targetStop.sequence_no) &&
          !STOP_DONE_STATUSES.includes(String(s.status)),
      );
      if (unfinishedEarlier.length > 0) {
        throw new ConflictException(
          `Phải hoàn tất các trạm trước theo đúng thứ tự (${unfinishedEarlier.map((s) => s.location_name).join(', ')}) rồi mới check-in "${targetStop.location_name}".`,
        );
      }
    }
    if (dto.action === 'customs_cleared' && normalizedCurrent !== 'arrived') {
      throw new ConflictException('Phải check-in "Đã tới trạm" (arrived) trước khi xác nhận thông quan / kiểm dịch (customs_cleared)');
    }
    if (dto.action === 'customs_cleared' && shipment.status === 'in_transit') {
      let complianceValid = !Boolean(shipment.in_transit_compliance_alert);
      if (
        complianceValid &&
        this.documentsService &&
        typeof this.documentsService.isFlow2CompletedForPayment === 'function'
      ) {
        complianceValid = await this.documentsService.isFlow2CompletedForPayment(shipmentId);
        if (!complianceValid && typeof this.documentsService.flagInTransitComplianceAlert === 'function') {
          await this.documentsService.flagInTransitComplianceAlert(shipmentId);
        }
      }
      if (!complianceValid) {
        throw new UnprocessableEntityException({
          message:
            'Hồ sơ pháp lý / kiểm dịch đã hết hạn hoặc không đạt chuẩn trong quá trình vận chuyển (BR-F2-06). Thao tác customs_cleared bị chặn cho tới khi bổ sung hồ sơ gia hạn được duyệt hoặc mở sự cố biên giới (Flow 5).',
          missingRequirements: ['valid_in_transit_compliance'],
        });
      }
    }
    if (dto.action === 'departed') {
      if (normalizedCurrent === 'pending') {
        throw new ConflictException('Không thể bấm "Đã rời" khi xe chưa cập nhật "Đã tới" trạm dừng này!');
      }
      const needsCustomsClearance = ['border_check', 'quarantine'].includes(String(targetStop.stop_type));
      if (needsCustomsClearance && normalizedCurrent !== 'customs_cleared') {
        throw new UnprocessableEntityException({
          message: `Trạm "${targetStop.location_name}" thuộc loại kiểm dịch/hải quan, bắt buộc hoàn tất "customs_cleared" trước khi rời trạm`,
          missingRequirements: ['customs_cleared'],
        });
      }

      // Step 10: Mandatory vitals check when departing 'rest' or 'quarantine' stops
      if (['rest', 'quarantine'].includes(String(targetStop.stop_type))) {
        const arrivalTime = targetStop.actual_arrival ? new Date(targetStop.actual_arrival) : new Date(0);
        const horses =
          typeof this.trackingStore?.findHorsesInOrder === 'function'
            ? await this.trackingStore.findHorsesInOrder(shipmentId)
            : [];
        const healthLogs =
          typeof this.trackingStore?.findHealthLogsForStop === 'function'
            ? await this.trackingStore.findHealthLogsForStop(shipmentId, arrivalTime, targetStop.route_stop_id)
            : [];

        const missingHorses: Array<{ id: number; name: string }> = [];
        for (const h of horses) {
          const horseId = Number(h.horse_id ?? h.id ?? (h as any).horseId);
          const horseName = h.horse_name ?? h.name ?? (h as any).horseName ?? `Ngựa #${horseId}`;
          const hasVitals = healthLogs.some((l) => {
            const lHorseId = l.horse_id ?? l.horseId;
            const lHorseName = l.horse_name ?? l.horseName;
            const lTemp = l.temperature_c ?? l.temperatureC;
            const lHr = l.heart_rate_bpm ?? l.heartRateBpm;
            const matchId = lHorseId != null && Number(lHorseId) === horseId;
            const matchName = lHorseName && String(lHorseName).toLowerCase() === horseName.toLowerCase();
            const valid = lTemp != null && lHr != null;
            return (matchId || matchName) && valid;
          });
          if (!hasVitals) {
            missingHorses.push({ id: horseId, name: horseName });
          }
        }

        if (missingHorses.length > 0) {
          throw new ConflictException({
            code: 'VITALS_REQUIRED',
            message: `Bắt buộc kiểm tra và ghi nhận sinh hiệu (nhiệt độ & nhịp tim) cho tất cả ngựa trước khi rời trạm dừng ${targetStop.location_name}.`,
            missingHorses,
          });
        }
      }
    }

    const { eventTime: now, isBackdated } = this.evaluateEventTimestamp(dto.actualTime, dto.notes);
    const isDeparture = dto.action === 'departed';

    // Step 10: Validate location & geofence for stop check-in
    const stopCoords =
      typeof this.trackingStore?.findStopCoordinates === 'function'
        ? await this.trackingStore.findStopCoordinates(stopId)
        : null;
    const targetPoint: GeoPoint | null =
      stopCoords && stopCoords.lat != null && stopCoords.lng != null
        ? { lat: stopCoords.lat, lng: stopCoords.lng }
        : null;

    const locEvidence = await this.validateLocationAndGeofence(
      user,
      dto.location,
      targetPoint,
      {
        stopType: targetStop.stop_type,
        geofenceRadiusM: targetStop.geofence_radius_m,
        locationRefType: targetStop.location_ref_type ?? stopCoords?.locationRefType ?? null,
        name: targetStop.location_name,
      },
      dto.manualReason,
      dto.evidenceUrl,
    );

    await this.trackingStore.updateStopStatus(
      stopId,
      dto.action,
      Number(user.id),
      now,
      isDeparture,
      dto.notes,
      actorRole,
      isBackdated,
      locEvidence,
    );

    // Tuyến đa phương thức:
    // - Trạm xuất cảnh hoàn tất -> hoàn tất chặng đường bộ 1 & giải phóng xe tải về available.
    // - Trạm nhập cảnh hoàn tất -> kích hoạt chặng đường bộ cuối để hoàn tất Mốc #6.
    if (isMultiModalFlight && (dto.action === 'customs_cleared' || dto.action === 'departed')) {
      if (!isImportStop && parentLeg && parentLeg.sequence_no === 1 && parentLeg.leg_type === 'road') {
        await this.trackingStore.updateLegStatus(parentLeg.leg_id, 'completed', undefined, now);
        if (parentLeg.vehicle_id) {
          await this.trackingStore.updateVehicleStatus(parentLeg.vehicle_id, 'available');
        }
      } else if (isImportStop && classifiedStops?.legRoadLast && !classifiedStops.legRoadLast.actual_departure) {
        await this.trackingStore.updateLegStatus(classifiedStops.legRoadLast.leg_id, 'active', now, null);
      }
    }

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
      legId: targetStop.leg_id || parentLeg?.leg_id || null,
      routeStopId: stopId,
      previousStatus: targetStop.status,
      newStatus: dto.action,
      milestoneType: dto.action === 'customs_cleared' ? 'stop_customs_cleared' : (isDeparture ? 'stop_departure' : 'stop_arrival'),
      milestoneName: `${targetStop.location_name} - ${dto.action.toUpperCase()}`,
      notes: dto.notes,
      updatedBy: Number(user.id),
      updatedByRole: actorRole,
      isBackdated,
      lat: locEvidence.lat,
      lng: locEvidence.lng,
      accuracyM: locEvidence.accuracyM,
      locationSource: locEvidence.locationSource,
      distanceToStopM: locEvidence.distanceToStopM,
      geofencePassed: locEvidence.geofencePassed,
      manualReason: locEvidence.manualReason,
      evidenceUrl: locEvidence.evidenceUrl,
      flagged: locEvidence.flagged,
    });

    if (
      locEvidence.lat != null &&
      locEvidence.lng != null &&
      locEvidence.locationSource !== 'manual' &&
      typeof this.trackingStore?.saveVehiclePositionPings === 'function'
    ) {
      await this.trackingStore.saveVehiclePositionPings([{
        shipmentId,
        legId: targetStop.leg_id || parentLeg?.leg_id || null,
        vehicleId: parentLeg?.vehicle_id || null,
        reportedBy: Number(user.id),
        lat: locEvidence.lat,
        lng: locEvidence.lng,
        accuracyM: locEvidence.accuracyM,
        source: locEvidence.locationSource === 'simulated' ? 'simulated' : 'gps',
        recordedAt: now,
        isBackdated,
      }]);
    }

    await this.syncSiblingStopCheckIn(user, targetStop, parentLeg, dto, now, isDeparture, actorRole, isBackdated);

    if (isDeparture && targetStop.stop_type === 'transfer_hub' && parentLeg?.road_trip_id) {
      await this.completeConsolidatedDropoffShipments(user, targetStop, stops, parentLeg, now, dto.notes, actorRole, isBackdated);
    }

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
    await this.assertAssignedForDriverEscort(user, shipmentId);

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    if (!route) throw new NotFoundException('Chưa có lộ trình');

    const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
    const targetLeg = legs.find((l) => l.leg_id === Number(legId));
    if (!targetLeg) throw new NotFoundException(`Không tìm thấy chặng #${legId}`);

    if (shipment.status === 'completed' || targetLeg.status === 'completed') {
      throw new ConflictException('Chặng vận chuyển này đã hoàn thành trước đó!');
    }
    this.assertJourneyActive(shipment.status, 'xác nhận đến chặng');

    // Rule: Chặng phải bắt đầu rồi mới được bấm đến
    if (!targetLeg.actual_departure && targetLeg.status === 'pending') {
      throw new ConflictException('Không thể bấm "Đã đến" khi chặng này chưa bấm "Đã xuất phát"!');
    }

    // Rule: Tất cả các trạm dừng thuộc đúng chặng này phải đã hoàn thành
    const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
    const hasReturnLegs = legs.some((l) => (l as any).direction === 'return');
    const isMultiModalFlight = !hasReturnLegs && legs.some((l) => l.leg_type === 'flight') && legs.length >= 2;
    const classifiedStops = isMultiModalFlight ? this.classifyMultimodalStops(legs, stops) : null;
    const targetLegIdx = legs.findIndex((l) => Number(l.leg_id) === Number(legId));
    const legStops = this.getStopsForLeg(
      targetLeg,
      targetLegIdx >= 0 ? targetLegIdx : 0,
      legs,
      stops,
      classifiedStops,
    );
    const unfinishedStops = legStops.filter((s) =>
      s.stop_type === 'quarantine'
        ? s.status !== 'departed'
        : !['departed', 'customs_cleared', 'cleared'].includes(s.status),
    );
    if (unfinishedStops.length > 0) {
      throw new ConflictException(
        `Còn ${unfinishedStops.length} trạm dừng chưa hoàn tất rời trạm (${unfinishedStops.map((s) => s.location_name).join(', ')})!`,
      );
    }

    const { eventTime: now, isBackdated } = this.evaluateEventTimestamp(dto.actualTime, dto.notes);
    const actorRole = await this.resolveOperationalActorRole(shipmentId, user);

    // Step 10: Validate location & geofence for leg arrival
    const legCoords =
      typeof this.trackingStore?.findLegCoordinates === 'function'
        ? await this.trackingStore.findLegCoordinates(legId)
        : null;
    const destPoint: GeoPoint | null =
      legCoords && legCoords.destinationLat != null && legCoords.destinationLng != null
        ? { lat: legCoords.destinationLat, lng: legCoords.destinationLng }
        : null;

    const locEvidence = await this.validateLocationAndGeofence(
      user,
      dto.location,
      destPoint,
      {
        stopType: 'destination',
        geofenceRadiusM: 300,
        locationRefType: 'address',
        name: targetLeg.destination_location,
      },
      dto.manualReason,
      dto.evidenceUrl,
    );

    // Complete this leg
    await this.trackingStore.updateLegStatus(legId, 'completed', undefined, now);

    // Tuyến đa phương thức: Khi chặng đường bộ 1 tới sân bay hoặc cảng biển hoàn thành, giải phóng xe tải về available
    if (targetLeg.leg_type === 'road' && targetLeg.sequence_no < legs.length) {
      const nextLeg = legs.find((l) => l.sequence_no === targetLeg.sequence_no + 1);
      if (nextLeg && (nextLeg.leg_type === 'flight' || nextLeg.leg_type === 'sea') && targetLeg.vehicle_id) {
        await this.trackingStore.updateVehicleStatus(targetLeg.vehicle_id, 'available');
      }
    }

    // Tuyến đa phương thức: Chặng đường bộ cuối sẽ do nhân sự xác nhận tại Mốc #5 (thông quan / khởi hành chặng cuối)
    if (targetLeg.leg_type === 'flight' && targetLeg.sequence_no < legs.length) {
      const nextLeg = legs.find((l) => l.sequence_no === targetLeg.sequence_no + 1);
      if (nextLeg && !nextLeg.actual_departure) {
        // Giữ nguyên trạng thái chờ tại Mốc #5 để không tự động nhảy cóc từ Mốc #4 sang Mốc #6
      }
    }

    // Step 5: Round-trip status handling
    const isRoundTrip = (shipment as any).trip_type === 'round_trip';
    const outboundLegs = legs.filter((l) => ((l as any).direction || 'outbound') === 'outbound');
    const isLastOutboundLeg = outboundLegs.length > 0 && targetLeg.sequence_no === Math.max(...outboundLegs.map((l) => l.sequence_no));
    const isFinalLeg = targetLeg.sequence_no === legs.length;
    const customerDest = shipment.destination_location || targetLeg.destination_location;

    if (isRoundTrip && isLastOutboundLeg && !isFinalLeg) {
      // Chặng đi hoàn thành đối với đơn khứ hồi: chuyển sang return_pending, giữ ngựa in_transit
      await this.trackingStore.updateShipmentStatus(shipmentId, 'return_pending');
      await this.trackingStore.recordTripStatusLog({
        shipmentId,
        routeId: route.route_id,
        legId: targetLeg.leg_id,
        previousStatus: 'in_transit',
        newStatus: 'return_pending',
        milestoneType: 'leg_arrival',
        milestoneName: `Hoàn tất chặng đi #${targetLeg.sequence_no}: Đến ${customerDest}`,
        notes: 'Chặng đi hoàn tất an toàn. Đang chờ xuất phát chặng về (return_pending).',
        updatedBy: Number(user.id),
        updatedByRole: actorRole || String(user.role),
        isBackdated,
        lat: locEvidence.lat,
        lng: locEvidence.lng,
        accuracyM: locEvidence.accuracyM,
        locationSource: locEvidence.locationSource,
        distanceToStopM: locEvidence.distanceToStopM,
        geofencePassed: locEvidence.geofencePassed,
        manualReason: locEvidence.manualReason,
        evidenceUrl: locEvidence.evidenceUrl,
        flagged: locEvidence.flagged,
      });

      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Chặng đi đã hoàn tất an toàn!',
        `Chuyến vận chuyển #${shipment.request_code} đã hoàn tất chặng đi tại ${customerDest}. Ngựa tiếp tục được lưu giữ chăm sóc chờ khởi hành chặng về.`,
        'status_update',
        shipmentId,
      );
    } else if (isFinalLeg && shipment.status !== 'completed') {
      // Hoàn tất toàn bộ chuyến (đơn một chiều hoặc chặng cuối đơn khứ hồi)
      await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
      if (isRoundTrip) {
        await this.trackingStore.updateShipmentReturnStatus(shipmentId, 'completed');
      }
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');

      // Send auto notification to Customer
      const finalDest = isRoundTrip
        ? (targetLeg.destination_location || shipment.origin_location || shipment.destination_location)
        : (shipment.destination_location || targetLeg.destination_location);
      await this.notificationsService.createNotification(
        shipment.customer_id,
        'Ngựa đã tới địa điểm bàn giao an toàn!',
        `Chuyến vận chuyển #${shipment.request_code} đã hoàn thành toàn bộ lộ trình và cập bến tại ${finalDest}. Sẵn sàng bàn giao ngựa.`,
        'handover_complete',
        shipmentId,
      );

      // Send auto notification to Coordinator
      const actor = await this.resolveStaffActor(shipmentId, user);
      const coordEndTitle = `Chuyến đi #${shipment.request_code} đã hoàn thành bàn giao`;
      const coordEndMessage = `${actor.displayName} đã xác nhận cập bến an toàn tại điểm đích (${finalDest}) và bàn giao ngựa thành công.`;
      if (route.assigned_coordinator_id) {
        await this.notificationsService.createNotification(
          route.assigned_coordinator_id,
          coordEndTitle,
          coordEndMessage,
          'handover_complete',
          shipmentId,
        );
      } else {
        await this.notificationsService.notifyRole(
          'LOGISTICS_MANAGER',
          coordEndTitle,
          coordEndMessage,
          'handover_complete',
          shipmentId,
        );
      }
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
      updatedByRole: actorRole,
      isBackdated,
      lat: locEvidence.lat,
      lng: locEvidence.lng,
      accuracyM: locEvidence.accuracyM,
      locationSource: locEvidence.locationSource,
      distanceToStopM: locEvidence.distanceToStopM,
      geofencePassed: locEvidence.geofencePassed,
      manualReason: locEvidence.manualReason,
      evidenceUrl: locEvidence.evidenceUrl,
      flagged: locEvidence.flagged,
    });

    if (
      locEvidence.lat != null &&
      locEvidence.lng != null &&
      locEvidence.locationSource !== 'manual' &&
      typeof this.trackingStore?.saveVehiclePositionPings === 'function'
    ) {
      await this.trackingStore.saveVehiclePositionPings([{
        shipmentId,
        legId: targetLeg.leg_id,
        vehicleId: targetLeg.vehicle_id || null,
        reportedBy: Number(user.id),
        lat: locEvidence.lat,
        lng: locEvidence.lng,
        accuracyM: locEvidence.accuracyM,
        source: locEvidence.locationSource === 'simulated' ? 'simulated' : 'gps',
        recordedAt: now,
        isBackdated,
      }]);
    }

    await this.syncSiblingLegArrival(user, targetLeg, now, dto.notes, actorRole, isBackdated);

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
    const roleStr = String(user.role || '').toUpperCase();
    const isOpsRole =
      roleStr.includes('DRIVER') ||
      roleStr.includes('ESCORT') ||
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');
    if (!isOpsRole) {
      throw new ForbiddenException('Chỉ nhân sự vận hành hoặc điều phối mới có quyền ghi nhật ký sức khỏe ngựa.');
    }

    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    const isSupervisor =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');
    if (!isSupervisor) {
      const assigned = await this.trackingStore.findAssignedStaff(shipmentId);
      const isAssigned = assigned.some((s) => Number(s.user_id) === Number(user.id));
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ có thể ghi nhật ký sức khỏe cho chuyến đi được phân công cho mình.');
      }
    }

    if (shipment.status === 'completed') {
      throw new ConflictException('Chuyến đi đã hoàn tất toàn bộ lộ trình, không thể ghi thêm nhật ký sức khỏe!');
    }
    // Danh sách cho phép (thay cho danh sách chặn cũ vốn bỏ sót đơn đã hủy / hoàn tiền / chờ thanh toán).
    if (!HEALTH_LOG_ALLOWED_STATUSES.includes(shipment.status)) {
      throw new ConflictException(
        `Chuyến đi đang ở trạng thái "${shipment.status}", chỉ ghi nhật ký sức khỏe hành trình khi chuyến đã sẵn sàng xuất phát hoặc đang vận chuyển.`,
      );
    }

    // Luôn khóa cứng nhật ký sức khỏe theo mốc hiện tại đang diễn ra, không cho phép ghi nhận cho mốc quá khứ
    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    let finalLegName = dto.legName;
    let resolvedRouteStopId: number | null = dto.routeStopId ?? null;
    if (route?.route_id) {
      const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
      const stops = await this.trackingStore.findStopsByRouteId(route.route_id);
      const consolidationContext = legs.some((l) => Boolean(l.road_trip_id))
        ? (await this.loadConsolidationContext(legs, stops)) ?? undefined
        : undefined;
      const milestones = this.buildMilestonesTimeline(legs, stops, undefined, consolidationContext);
      const activeM = milestones.find((m) => m.status === 'CURRENT');
      if (activeM) {
        finalLegName = `#${activeM.seq} - ${activeM.title}`;
        if (!resolvedRouteStopId && activeM.stopId) {
          resolvedRouteStopId = Number(activeM.stopId);
        }
      }
      if (!resolvedRouteStopId && stops.length > 0) {
        const activeStop = stops.find((s) => s.status === 'arrived' || s.status === 'customs_cleared');
        if (activeStop?.route_stop_id) {
          resolvedRouteStopId = Number(activeStop.route_stop_id);
        }
      }
    }

    const rawAttachments = (Array.isArray(dto.attachments) ? dto.attachments : []).map((att) => String(att).trim());
    if (rawAttachments.length > 5) {
      throw new BadRequestException('Tối đa 5 ảnh đính kèm cho mỗi bản ghi sức khỏe ngựa.');
    }
    for (const att of rawAttachments) {
      assertHealthAttachmentUrl(att);
    }

    const recordedAtDate = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if (!Number.isFinite(recordedAtDate.getTime())) {
      throw new BadRequestException('Thời điểm recordedAt không hợp lệ.');
    }
    if (recordedAtDate.getTime() - Date.now() > FUTURE_EVENT_TOLERANCE_MS) {
      throw new BadRequestException('Thời điểm ghi nhận sức khỏe (recordedAt) không được ở tương lai.');
    }

    // Nhật ký sức khỏe phải gắn với đúng một con ngựa thuộc chuyến này (không ghi cho ngựa của đơn khác).
    const resolvedHorse = await this.resolveShipmentHorse(shipmentId, dto.horseId, dto.horseName);
    dto = { ...dto, horseId: resolvedHorse.horseId, horseName: resolvedHorse.horseName };

    const vitalCfg = await this.getVitalConfig();
    const prevLog =
      typeof this.trackingStore?.findLatestHealthLogForHorse === 'function'
        ? await this.trackingStore.findLatestHealthLogForHorse(shipmentId, dto.horseId, dto.horseName)
        : null;
    const evaluation = evaluateEquineHealthAlert(
      {
        conditionStatus: dto.conditionStatus,
        temperatureC: dto.temperatureC,
        heartRateBpm: dto.heartRateBpm,
        respiratoryRateBpm: dto.respiratoryRate ?? null,
        recordedAt: recordedAtDate,
      },
      prevLog,
      vitalCfg,
    );
    const recordedByRole = await this.resolveOperationalActorRole(shipmentId, user);

    const logId = await this.trackingStore.createHorseHealthLog({
      shipmentId,
      horseId: dto.horseId,
      horseName: dto.horseName,
      legName: finalLegName || null,
      recordedBy: Number(user.id),
      recordedByRole,
      conditionStatus: dto.conditionStatus,
      temperatureC: dto.temperatureC,
      heartRateBpm: dto.heartRateBpm,
      respiratoryRateBpm: dto.respiratoryRate ?? null,
      routeStopId: resolvedRouteStopId,
      lat: dto.location?.lat != null ? Number(dto.location.lat) : null,
      lng: dto.location?.lng != null ? Number(dto.location.lng) : null,
      locationSource: dto.location?.source ?? null,
      alertTier: evaluation.alertTier,
      alertReason: evaluation.alertReason,
      notes: dto.notes,
      attachmentsJson: rawAttachments.length ? JSON.stringify(rawAttachments) : null,
      recordedAt: recordedAtDate,
    });

    if (evaluation.alertTier === 'red') {
      const assigned =
        typeof this.trackingStore?.findAssignedStaff === 'function'
          ? await this.trackingStore.findAssignedStaff(shipmentId)
          : [];
      const reqCode = shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`;
      
      const customerVitalsDetail =
        typeof this.trackingStore?.getSetting === 'function'
          ? await this.trackingStore.getSetting('tracking.customer_vitals_detail')
          : true;
      const showDetailToCustomer = customerVitalsDetail !== false && customerVitalsDetail !== 'false';

      const customerRedMsg = showDetailToCustomer
        ? `${evaluation.alertReason || 'Chỉ số sinh hiệu vượt ngưỡng ĐỎ'} - Ngựa ${dto.horseName} (Đơn ${reqCode}). ${dto.notes || ''}`.trim()
        : `🚨 CẢNH BÁO SỨC KHỎE: Ngựa ${dto.horseName} (${reqCode}) đang được đội ngũ thú y theo dõi và chăm sóc đặc biệt trên hành trình. Chúng tôi sẽ cập nhật thêm khi có chuyển biến mới.`;

      const managerRedMsg = `${evaluation.alertReason || 'Chỉ số sinh hiệu vượt ngưỡng ĐỎ'} - Ngựa ${dto.horseName} (Đơn ${reqCode}). ${dto.notes || ''}`.trim();

      await Promise.allSettled([
        this.notificationsService.createNotification(
          shipment.customer_id,
          `🚨 CẢNH BÁO SỨC KHỎE: ${dto.horseName}`,
          customerRedMsg,
          'incident',
          shipmentId,
        ),
        this.notificationsService.notifyRole(
          'Logistics Manager',
          `🚨 RED ALERT THÚ Y: ${dto.horseName} (${reqCode})`,
          managerRedMsg,
          'incident',
          shipmentId,
        ),
      ]);

      for (const staff of assigned) {
        await this.notificationsService.createNotification(
          staff.user_id,
          `⚠️ Cảnh báo ĐỎ thú y: Ngựa ${dto.horseName}`,
          managerRedMsg,
          'incident',
          shipmentId,
        );
      }
    } else if (evaluation.alertTier === 'amber_escalatable') {
      const reqCode = shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`;
      const amberMsg = `${evaluation.alertReason || 'Theo dõi Vàng (leo thang)'} - Ngựa ${dto.horseName} (Đơn ${reqCode}).`.trim();
      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `⚠️ Cảnh báo VÀNG (Leo thang): ${dto.horseName} (${reqCode})`,
        amberMsg,
        'incident',
        shipmentId,
      );
    } else if (evaluation.alertTier === 'amber_observational') {
      const reqCode = shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`;
      await this.notificationsService.notifyRole(
        'Logistics Manager',
        `Theo dõi môi trường Vàng: ${dto.horseName} (${reqCode})`,
        evaluation.alertReason || `Ghi nhận quan sát môi trường cho ngựa ${dto.horseName}.`,
        'status_update',
        shipmentId,
      );
    }

    const logs = await this.trackingStore.findHorseHealthLogs(shipmentId);
    const created = logs.find((l) => l.id === logId);
    if (!created) {
      return {
        id: logId,
        shipmentId,
        horseId: dto.horseId ?? null,
        horseName: dto.horseName,
        legName: finalLegName || null,
        recordedBy: Number(user.id),
        recordedByRole,
        conditionStatus: dto.conditionStatus,
        temperatureC: dto.temperatureC ?? null,
        heartRateBpm: dto.heartRateBpm ?? null,
        respiratoryRateBpm: dto.respiratoryRate ?? null,
        routeStopId: resolvedRouteStopId,
        alertTier: evaluation.alertTier,
        alertReason: evaluation.alertReason,
        notes: dto.notes ?? null,
        attachments: rawAttachments,
        recordedAt: recordedAtDate.toISOString(),
      };
    }
    return created;
  }

  // Step 7: Coordinator marks trip Completed
  async completeShipment(user: AuthenticatedUser, shipmentId: number): Promise<void> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }
    await this.assertAssignedForDriverEscort(user, shipmentId);
    if (shipment.status === 'completed') {
      return;
    }
    if (shipment.status === 'return_pending') {
      const retStatus = String(shipment.return_status || '').toLowerCase();
      if (!['completed', 'cancelled', 'no_show'].includes(retStatus)) {
        throw new ConflictException(
          'Không thể hoàn tất đơn khi chặng về chưa hoàn thành hoặc chưa bị hủy',
        );
      }
    } else if (shipment.status !== 'in_transit') {
      throw new ConflictException(
        `Chỉ chuyến đi đang ở trạng thái "in_transit" mới có thể đánh dấu hoàn thành. Trạng thái hiện tại: "${shipment.status}"`,
      );
    }

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    await this.trackingStore.updateShipmentStatus(shipmentId, 'completed');
    if (route) {
      await this.trackingStore.updateRoutePlanStatus(route.route_id, 'completed');
    }

    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route?.route_id || 0,
      previousStatus: shipment.status,
      newStatus: 'completed',
      milestoneType: 'trip_status_change',
      milestoneName: 'Chuyến đi hoàn tất',
      notes: `Đánh dấu hoàn thành bởi ${user.fullName || user.email} (${user.role})`,
      updatedBy: Number(user.id),
      updatedByRole: user.role,
    });
  }

    private async resolveStaffActor(shipmentId: number, user: AuthenticatedUser) {
    const assignedStaff = await this.trackingStore.findAssignedStaff(shipmentId);
    const currentStaff =
      assignedStaff.find((s) => Number(s.user_id) === Number(user.id)) ||
      (user.email ? assignedStaff.find((s) => s.email?.toLowerCase() === user.email.toLowerCase()) : null);

    let staffName = currentStaff?.full_name || user.fullName;
    if (!staffName && user.id) {
      const dbUser = await this.trackingStore.findUserById(Number(user.id));
      if (dbUser?.full_name) staffName = dbUser.full_name;
    }
    if (!staffName) {
      staffName = user.email ? user.email.split('@')[0] : 'Nhân sự vận hành';
    }

    const roleStr = String(user.role || '').toUpperCase();
    const isEscortStaff =
      currentStaff?.role_in_shipment === 'escort' ||
      currentStaff?.specialization === 'escort' ||
      user.specialization === 'escort' ||
      (user.email ? user.email.toLowerCase().includes('escort') : false);

    const isDriverStaff =
      currentStaff?.role_in_shipment === 'driver' ||
      currentStaff?.specialization === 'driver' ||
      user.specialization === 'driver' ||
      (user.email ? user.email.toLowerCase().includes('driver') : false);

    const actorRoleName = isEscortStaff
      ? 'Bác sĩ thú y / Nhân viên áp tải'
      : isDriverStaff
      ? 'Tài xế lái xe'
      : roleStr.includes('COORDINATOR')
      ? 'Điều phối viên'
      : 'Quản lý';

    return {
      actorRoleName,
      staffName,
      displayName: `${actorRoleName} ${staffName}`,
    };
  }

  /** Mốc trạm / đến chặng chỉ ghi khi chuyến đang chạy (không ghi vào đơn đã hoàn tất, hủy, hoàn tiền…). */
  private assertJourneyActive(status: string, actionLabel: string): void {
    if (!ACTIVE_JOURNEY_STATUSES.includes(status)) {
      throw new ConflictException(
        `Chuyến đi đang ở trạng thái "${status}", không thể ${actionLabel}. Chỉ chuyến đang vận chuyển mới được cập nhật mốc.`,
      );
    }
  }

  /**
   * Xác định con ngựa của nhật ký sức khỏe trong danh sách ngựa của chuyến.
   * Ưu tiên horseId; nếu thiếu thì khớp đúng một ngựa theo tên. Tên lưu lại lấy từ hồ sơ ngựa,
   * không lấy tên tự do client gửi, để nhật ký/cảnh báo luôn trỏ đúng ngựa.
   */
  private async resolveShipmentHorse(
    shipmentId: number,
    horseId: number | undefined,
    horseName: string,
  ): Promise<{ horseId: number | undefined; horseName: string }> {
    if (typeof this.trackingStore?.findAssignedHorses !== 'function') {
      return { horseId, horseName };
    }
    const horses = (await this.trackingStore.findAssignedHorses(shipmentId)).map((h: any) => ({
      id: Number(h.horse_id ?? h.id),
      name: String(h.name ?? h.horse_name ?? '').trim(),
    }));
    let match: { id: number; name: string } | undefined;
    if (horseId !== undefined && horseId !== null) {
      match = horses.find((h) => h.id === Number(horseId));
    } else {
      const wanted = String(horseName || '').trim().toLowerCase();
      const byName = horses.filter((h) => h.name.toLowerCase() === wanted);
      match = byName.length === 1 ? byName[0] : undefined;
    }
    if (!match) {
      throw new BadRequestException('Ngựa được chọn không thuộc chuyến đi này. Vui lòng chọn đúng ngựa trong chuyến.');
    }
    return { horseId: match.id, horseName: match.name || horseName };
  }

  private assertStaffCanUpdateLeg(user: AuthenticatedUser, leg: any): void {
    const roleStr = String(user.role).toUpperCase();
    const isManagerOrCoordinator =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');

    if (isManagerOrCoordinator) return;

    const isFieldStaffRole = roleStr.includes('DRIVER') || roleStr.includes('ESCORT');
    if (!isFieldStaffRole) {
      throw new ForbiddenException('Tài khoản của bạn không có quyền cập nhật mốc hành trình chuyến đi.');
    }

    if (leg.leg_type === 'road' || leg.leg_type === 'flight' || leg.leg_type === 'sea') {
      const isDriverOrEscort =
        user.specialization === 'driver' ||
        user.specialization === 'escort' ||
        roleStr.includes('DRIVER') ||
        roleStr.includes('ESCORT') ||
        user.email.toLowerCase().includes('driver') ||
        user.email.toLowerCase().includes('escort');
      if (!isDriverOrEscort) {
        throw new ForbiddenException('Chỉ Tài xế lái xe hoặc Bác sĩ thú y áp tải (Escort) mới được cập nhật chặng hành trình!');
      }
    }
  }

  async getHealthLogsByHorseId(
    user: AuthenticatedUser,
    horseId: number,
  ): Promise<any[]> {
    const roleUpper = String(user.role || '').toUpperCase();
    if (roleUpper === 'CUSTOMER') {
      const isOwner = await this.trackingStore.isHorseOwnedByUser(horseId, Number(user.id));
      if (!isOwner) {
        throw new ForbiddenException('Bạn chỉ có thể xem lịch sử y tế của ngựa thuộc tài khoản của mình');
      }
    } else if (roleUpper === 'DRIVER_ESCORT') {
      const isAssigned =
        typeof this.trackingStore.isHorseAssignedToDriver === 'function'
          ? await this.trackingStore.isHorseAssignedToDriver(horseId, Number(user.id))
          : false;
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ có thể xem lịch sử sức khỏe của ngựa thuộc chuyến đi được phân công cho mình');
      }
    }
    return this.trackingStore.findHorseHealthLogsByHorseId(horseId);
  }

  private async notifyCoordinator(
    coordinatorId: number | null | undefined,
    title: string,
    message: string,
    notifType: 'status_update' | 'handover_complete',
    shipmentId: number,
  ): Promise<void> {
    if (coordinatorId) {
      await this.notificationsService.createNotification(coordinatorId, title, message, notifType, shipmentId);
    } else {
      await this.notificationsService.notifyRole('LOGISTICS_MANAGER', title, message, notifType, shipmentId);
    }
  }

  /** Đồng bộ xuất phát cho các đơn cùng chuyến đường bộ (road_trip_id). */
  private async syncSiblingLegStart(
    user: AuthenticatedUser,
    targetLeg: any,
    now: Date,
    notes?: string,
    actorRole?: string,
    isBackdated: boolean = false,
  ): Promise<void> {
    if (!targetLeg?.road_trip_id) return;
    try {
      const siblings = await this.trackingStore.findSiblingLegsByRoadTrip(
        Number(targetLeg.road_trip_id),
        Number(targetLeg.leg_id),
      );
      for (const sib of siblings) {
        if (sib.actual_departure || sib.status !== 'pending') continue;
        if (sib.sequence_no === 1 && sib.shipment_status === 'ready_to_depart') {
          const readiness = await this.routesService.getTripPlanReadiness(user, Number(sib.shipment_id));
          if (!readiness.isReadyToDepart) continue;
          await this.trackingStore.updateLegStatus(Number(sib.leg_id), 'active', now, null);
          await this.trackingStore.updateShipmentStatus(Number(sib.shipment_id), 'in_transit');
          await this.trackingStore.updateRoutePlanStatus(Number(sib.route_id), 'in_transit');
          const sibOrigin = sib.shipment_origin_location || sib.origin_location;
          const sibDest = sib.shipment_destination_location || sib.destination_location;
          await this.notificationsService.createNotification(
            Number(sib.customer_id),
            'Chuyến vận chuyển ngựa đã xuất phát!',
            `Đơn vận chuyển #${sib.request_code} đã bắt đầu khởi hành chặng ${sib.sequence_no} (${sibOrigin} → ${sibDest}).`,
            'status_update',
            Number(sib.shipment_id),
          );
          const actor = await this.resolveStaffActor(Number(sib.shipment_id), user);
          await this.notifyCoordinator(
            sib.assigned_coordinator_id,
            `Chuyến đi #${sib.request_code} đã xuất phát thực tế`,
            `${actor.displayName} đã xác nhận xuất phát chuyến ghép #${targetLeg.road_trip_id} (${sib.origin_location}).`,
            'status_update',
            Number(sib.shipment_id),
          );
        } else if (sib.shipment_status === 'in_transit') {
          await this.trackingStore.updateLegStatus(Number(sib.leg_id), 'active', now, null);
        } else {
          continue;
        }
        await this.trackingStore.recordTripStatusLog({
          shipmentId: Number(sib.shipment_id),
          routeId: Number(sib.route_id),
          legId: Number(sib.leg_id),
          previousStatus: sib.status,
          newStatus: 'in_transit',
          milestoneType: 'leg_departure',
          milestoneName: `Xuất phát chặng ${sib.sequence_no}: ${sib.origin_location}`,
          notes: notes || `Đồng bộ xuất phát chuyến ghép #${targetLeg.road_trip_id}`,
          updatedBy: Number(user.id),
          updatedByRole: actorRole || user.role,
          isBackdated,
        });
      }
    } catch (err) {
      this.logger.error('Lỗi đồng bộ xuất phát chuyến ghép', err as Error);
    }
  }

  /** Đồng bộ check-in trạm dừng cho các đơn cùng chuyến đường bộ (road_trip_id). */
  private async syncSiblingStopCheckIn(
    user: AuthenticatedUser,
    targetStop: any,
    parentLeg: any,
    dto: CheckInStopDto,
    now: Date,
    isDeparture: boolean,
    actorRole?: string,
    isBackdated: boolean = false,
  ): Promise<void> {
    if (!parentLeg?.road_trip_id) return;
    const rank: Record<string, number> = { pending: 0, arrived: 1, customs_cleared: 2, departed: 3 };
    const targetRank = rank[dto.action] ?? 0;
    const targetName = String(targetStop.location_name || '').trim().toLowerCase();
    try {
      const siblings = await this.trackingStore.findSiblingLegsByRoadTrip(
        Number(parentLeg.road_trip_id),
        Number(parentLeg.leg_id),
      );
      for (const sib of siblings) {
        if (sib.shipment_status !== 'in_transit') continue;
        const sibStops = await this.trackingStore.findStopsByRouteId(Number(sib.route_id));
        const sibStop = sibStops.find(
          (s) =>
            (!s.leg_id || Number(s.leg_id) === Number(sib.leg_id)) &&
            (areSameLocations(s.location_name, targetStop.location_name) ||
              String(s.location_name || '').trim().toLowerCase() === targetName),
        );
        if (!sibStop || (rank[sibStop.status] ?? 0) >= targetRank) continue;
        await this.trackingStore.updateStopStatus(
          Number(sibStop.route_stop_id),
          dto.action,
          Number(user.id),
          now,
          isDeparture,
          dto.notes,
          actorRole,
          isBackdated,
        );
        if (dto.action === 'customs_cleared') {
          await this.notificationsService.createNotification(
            Number(sib.customer_id),
            'Ngựa đã hoàn tất thông quan & kiểm dịch!',
            `Đoàn xe đơn #${sib.request_code} đã hoàn tất kiểm tra thú y & hải quan tại "${sibStop.location_name}".`,
            'status_update',
            Number(sib.shipment_id),
          );
        }
        await this.trackingStore.recordTripStatusLog({
          shipmentId: Number(sib.shipment_id),
          routeId: Number(sib.route_id),
          legId: sibStop.leg_id || Number(sib.leg_id),
          routeStopId: Number(sibStop.route_stop_id),
          previousStatus: sibStop.status,
          newStatus: dto.action,
          milestoneType:
            dto.action === 'customs_cleared'
              ? 'stop_customs_cleared'
              : isDeparture
              ? 'stop_departure'
              : 'stop_arrival',
          milestoneName: `${sibStop.location_name} - ${dto.action.toUpperCase()}`,
          notes: dto.notes || `Đồng bộ trạm dừng chuyến ghép #${parentLeg.road_trip_id}`,
          updatedBy: Number(user.id),
          updatedByRole: actorRole || user.role,
          isBackdated,
        });
      }
    } catch (err) {
      this.logger.error('Lỗi đồng bộ trạm dừng chuyến ghép', err as Error);
    }
  }

  /** Hoàn tất riêng các đơn hàng có điểm đến là trạm trả hàng ghép vừa rời trạm, giữ các đơn đi tiếp vẫn active. */
  private async completeConsolidatedDropoffShipments(
    user: AuthenticatedUser,
    targetStop: any,
    stops: any[],
    parentLeg: any,
    now: Date,
    notes?: string,
    actorRole?: string,
    isBackdated: boolean = false,
  ): Promise<void> {
    if (typeof this.trackingStore.findShipmentsByRoadTripId !== 'function') return;
    try {
      const roadTripId = Number(parentLeg.road_trip_id);
      const shipments = await this.trackingStore.findShipmentsByRoadTripId(roadTripId);
      if (shipments.length <= 1) return;

      const itinerary = buildConsolidatedRoadItinerary({
        shipments: shipments.map((s) => ({
          shipmentId: Number(s.shipment_id),
          requestCode: s.request_code || `REQ-${String(s.shipment_id).padStart(3, '0')}`,
          originLocation: s.origin_location,
          destinationLocation: s.destination_location,
        })),
        corridorStops: stops.map((s) => ({
          routeStopId: s.route_stop_id,
          sequenceNo: s.sequence_no,
          stopType: s.stop_type,
          locationName: s.location_name,
          country: s.country,
        })),
      });

      const dropoffItem = itinerary.stops.find(
        (st) => st.stopRole === 'dropoff' && areSameLocations(st.locationName, targetStop.location_name),
      );
      if (!dropoffItem || dropoffItem.shipmentIds.length === 0) return;

      const targetIds = new Set(dropoffItem.shipmentIds);
      for (const s of shipments) {
        const sId = Number(s.shipment_id);
        if (!targetIds.has(sId) || s.shipment_status !== 'in_transit' || s.leg_status === 'completed') continue;
        const isFinalLeg = Number(s.leg_sequence_no || 1) >= Number(s.total_legs || 1);
        await this.trackingStore.updateLegStatus(Number(s.leg_id), 'completed', undefined, now);
        if (isFinalLeg) {
          await this.trackingStore.updateShipmentStatus(sId, 'completed');
          await this.trackingStore.updateRoutePlanStatus(Number(s.route_id), 'completed');
          await this.notificationsService.createNotification(
            Number(s.customer_id),
            'Ngựa đã tới địa điểm bàn giao an toàn!',
            `Chuyến vận chuyển #${s.request_code} đã hoàn thành toàn bộ lộ trình và cập bến tại ${s.destination_location}. Sẵn sàng bàn giao ngựa.`,
            'handover_complete',
            sId,
          );
          const actor = await this.resolveStaffActor(sId, user);
          await this.notifyCoordinator(
            s.assigned_coordinator_id,
            `Chuyến đi #${s.request_code} đã hoàn thành bàn giao`,
            `${actor.displayName} đã xác nhận bàn giao ngựa tại điểm trả (${s.destination_location}) thuộc chuyến ghép #${roadTripId}.`,
            'handover_complete',
            sId,
          );
        }
        await this.trackingStore.recordTripStatusLog({
          shipmentId: sId,
          routeId: Number(s.route_id),
          legId: Number(s.leg_id),
          routeStopId: Number(targetStop.route_stop_id),
          previousStatus: s.leg_status || 'active',
          newStatus: 'completed',
          milestoneType: 'leg_arrival',
          milestoneName: `Hoàn tất bàn giao tại điểm trả: ${s.destination_location}`,
          notes: notes || `Hoàn tất trả hàng tại ${targetStop.location_name}`,
          updatedBy: Number(user.id),
          updatedByRole: actorRole || user.role,
          isBackdated,
        });
      }
    } catch (err) {
      this.logger.error('Lỗi hoàn tất đơn tại điểm trả ghép chuyến', err as Error);
    }
  }

  /** Đồng bộ hoàn tất chặng/đến đích cho các đơn cùng chuyến đường bộ (road_trip_id). */
  private async syncSiblingLegArrival(
    user: AuthenticatedUser,
    targetLeg: any,
    now: Date,
    notes?: string,
    actorRole?: string,
    isBackdated: boolean = false,
  ): Promise<void> {
    if (!targetLeg?.road_trip_id) return;
    try {
      const siblings = await this.trackingStore.findSiblingLegsByRoadTrip(
        Number(targetLeg.road_trip_id),
        Number(targetLeg.leg_id),
      );
      for (const sib of siblings) {
        if (sib.shipment_status !== 'in_transit' || sib.status === 'completed') continue;
        const sibLegs = await this.trackingStore.findLegsByRouteId(Number(sib.route_id));
        const sibStops = await this.trackingStore.findStopsByRouteId(Number(sib.route_id));
        const sibLegStops = sibStops.filter((s) =>
          s.leg_id ? Number(s.leg_id) === Number(sib.leg_id) : sibLegs.length === 1,
        );
        if (sibLegStops.some((s) => s.status !== 'departed' && s.status !== 'customs_cleared')) {
          continue;
        }
        await this.trackingStore.updateLegStatus(Number(sib.leg_id), 'completed', undefined, now);
        const sibDest = sib.shipment_destination_location || sib.destination_location;
        const isSibFinalLeg = Number(sib.sequence_no) === sibLegs.length;
        if (isSibFinalLeg) {
          await this.trackingStore.updateShipmentStatus(Number(sib.shipment_id), 'completed');
          await this.trackingStore.updateRoutePlanStatus(Number(sib.route_id), 'completed');
          await this.notificationsService.createNotification(
            Number(sib.customer_id),
            'Ngựa đã tới địa điểm bàn giao an toàn!',
            `Chuyến vận chuyển #${sib.request_code} đã hoàn thành toàn bộ lộ trình và cập bến tại ${sibDest}. Sẵn sàng bàn giao ngựa.`,
            'handover_complete',
            Number(sib.shipment_id),
          );
          const actor = await this.resolveStaffActor(Number(sib.shipment_id), user);
          await this.notifyCoordinator(
            sib.assigned_coordinator_id,
            `Chuyến đi #${sib.request_code} đã hoàn thành bàn giao`,
            `${actor.displayName} đã xác nhận cập bến chuyến ghép #${targetLeg.road_trip_id} (${sibDest}).`,
            'handover_complete',
            Number(sib.shipment_id),
          );
        }
        await this.trackingStore.recordTripStatusLog({
          shipmentId: Number(sib.shipment_id),
          routeId: Number(sib.route_id),
          legId: Number(sib.leg_id),
          previousStatus: sib.status,
          newStatus: 'completed',
          milestoneType: 'leg_arrival',
          milestoneName: `Hoàn tất chặng ${sib.sequence_no}: Đến ${sibDest}`,
          notes: notes || `Đồng bộ hoàn tất chuyến ghép #${targetLeg.road_trip_id}`,
          updatedBy: Number(user.id),
          updatedByRole: actorRole || user.role,
          isBackdated,
        });
      }
    } catch (err) {
      this.logger.error('Lỗi đồng bộ đến đích chuyến ghép', err as Error);
    }
  }

  // --- Step 5: Đánh dấu no-show chặng về ---
  async markReturnNoShow(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: { notes?: string; evidenceUrls?: string[] },
  ) {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    await this.assertAssignedForDriverEscort(user, shipmentId);

    if ((shipment as any).trip_type !== 'round_trip') {
      throw new BadRequestException('Chỉ có thể đánh dấu no-show cho chuyến khứ hồi');
    }

    if ((shipment as any).return_status === 'no_show' || (shipment as any).return_status === 'completed') {
      throw new ConflictException('Chặng về đã kết thúc trước đó');
    }

    if (!shipment.return_departure_at) {
      throw new BadRequestException('Chuyến đi chưa có thời điểm khởi hành chặng về');
    }

    const { allowed, allowedAt } = canMarkNoShow({
      returnDepartureAt: new Date(shipment.return_departure_at),
      waitMinutes: Number(shipment.return_wait_minutes ?? 120),
      now: new Date(Date.now()),
    });

    if (!allowed) {
      throw new ConflictException({
        message: `Chưa đến thời điểm được phép đánh dấu no-show (cần chờ tối thiểu ${shipment.return_wait_minutes ?? 120} phút sau giờ đón). Sớm nhất lúc: ${allowedAt.toISOString()}`,
        allowedAt: allowedAt.toISOString(),
      });
    }

    for (const url of dto.evidenceUrls || []) {
      assertSafeExternalOrUploadUrl(url);
    }

    await this.trackingStore.markReturnNoShow({
      shipmentId,
      actorId: Number(user.id),
      notes: dto.notes,
      evidenceUrls: dto.evidenceUrls,
    });

    const actor = await this.resolveStaffActor(shipmentId, user);
    const logNotes = dto.notes ? `Khách không giao ngựa chặng về (no-show): ${dto.notes}` : 'Khách không giao ngựa chặng về (no-show)';
    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    const actorRole = await this.resolveOperationalActorRole(shipmentId, user);
    await this.trackingStore.recordTripStatusLog({
      shipmentId,
      routeId: route?.route_id || 0,
      previousStatus: String(shipment.status),
      newStatus: 'completed',
      milestoneType: 'no_show',
      milestoneName: 'No-show chặng về',
      notes: logNotes,
      updatedBy: Number(user.id),
      updatedByRole: actorRole || String(user.role),
    });

    const code = shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.createNotification(
      shipment.customer_id,
      `Đơn khứ hồi ${code} - Ghi nhận No-show chặng về`,
      `Tài xế đã chờ quá thời gian quy định tại điểm đón chặng về nhưng không nhận được ngựa. Chuyến đi đã được đóng lại theo chính sách no-show (không hoàn cước chặng về).`,
      'status_update',
      shipmentId,
    );

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Đơn ${code} - Tài xế đánh dấu no-show chặng về`,
      `${actor.displayName} đã ghi nhận khách không giao ngựa tại điểm đón chặng về đơn ${code}. Chuyến đi đã hoàn tất.`,
      'status_update',
      shipmentId,
    );

    return {
      success: true,
      returnStatus: 'no_show',
      shipmentStatus: 'completed',
      returnNoShow: true,
    };
  }

  // --- Step 10: Vehicle Position Pings, Live Tracking & Overview ---

  async recordPositionPings(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: PositionPingBatchDto,
  ): Promise<PositionPingResult> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');
    await this.assertAssignedForDriverEscort(user, shipmentId);

    const pings = Array.isArray(dto.pings) ? dto.pings : [];
    if (pings.length === 0) {
      return { accepted: 0, skipped: 0, dropped: 0, shipmentId };
    }
    if (pings.length > 100) {
      throw new BadRequestException('Mỗi đợt gửi pings tối đa 100 điểm.');
    }

    // Check simulation setting
    const hasSimulated = pings.some((p) => p.source === 'simulated');
    if (hasSimulated) {
      const simSetting = await this.trackingStore.getSetting('tracking.simulation_enabled');
      const isSimEnabled =
        simSetting === true || simSetting === 'true' || process.env.TRACKING_SIMULATION_ENABLED === 'true';
      if (!isSimEnabled) {
        throw new ForbiddenException({
          code: 'SIMULATION_DISABLED',
          message: 'Chế độ giả lập vị trí hiện đang bị tắt bởi quản trị viên.',
        });
      }
    }

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    let activeLegId: number | null = null;
    let vehicleId: number | null = null;
    if (route) {
      const legs = await this.trackingStore.findLegsByRouteId(route.route_id);
      const activeLeg = legs.find((l) => l.status === 'active' || l.status === 'in_transit') || legs[0];
      if (activeLeg) {
        activeLegId = activeLeg.leg_id;
        vehicleId = activeLeg.vehicle_id || null;
      }
    }

    const now = Date.now();
    const twoMinutesAhead = now + 2 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    let dropped = 0;
    const validPingsToSave: Array<any> = [];

    // Rate limiting check for real-time gps pings
    const hasRealtimeGps = pings.some((p) => (!p.source || p.source === 'gps') && !p.recordedAt);
    if (hasRealtimeGps) {
      const lastPingTime = this.lastPingTimeByUser.get(Number(user.id)) || 0;
      if (now - lastPingTime < 10000 && pings.length === 1) {
        // Enforce 10s minimum spacing for real-time single pings (skip storing duplicates or rate limit)
      }
      this.lastPingTimeByUser.set(Number(user.id), now);
    }

    for (const p of pings) {
      if (p.lat == null || p.lng == null || isNaN(Number(p.lat)) || isNaN(Number(p.lng))) {
        dropped++;
        continue;
      }

      const pingTime = p.recordedAt ? new Date(p.recordedAt).getTime() : now;
      if (isNaN(pingTime)) {
        dropped++;
        continue;
      }

      // Drop future pings > 2 mins
      if (pingTime > twoMinutesAhead) {
        dropped++;
        continue;
      }

      // Drop stale pings > 24 hours
      if (pingTime < twentyFourHoursAgo) {
        dropped++;
        continue;
      }

      const isBackdated = pingTime < fiveMinutesAgo;
      const source = p.source === 'simulated' ? 'simulated' : 'gps';

      validPingsToSave.push({
        shipmentId,
        legId: activeLegId,
        vehicleId,
        reportedBy: Number(user.id),
        lat: Number(p.lat),
        lng: Number(p.lng),
        speedKmh: p.speedKmh != null ? Number(p.speedKmh) : null,
        headingDeg: p.headingDeg != null ? Number(p.headingDeg) : null,
        accuracyM: p.accuracyM != null ? Number(p.accuracyM) : null,
        source,
        recordedAt: new Date(pingTime),
        isBackdated,
      });
    }

    if (validPingsToSave.length > 0) {
      await this.trackingStore.saveVehiclePositionPings(validPingsToSave);
    }

    return {
      accepted: validPingsToSave.length,
      skipped: dropped,
      dropped,
      shipmentId,
    };
  }

  async getLiveTracking(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<LiveTrackingDetails> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Không tìm thấy chuyến đi');

    const roleStr = String(user.role || '').toUpperCase();
    const isCustomer = roleStr.includes('CUSTOMER');
    if (isCustomer && Number(shipment.customer_id) !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền truy cập dữ liệu chuyến đi này.');
    }

    await this.assertAssignedForDriverEscort(user, shipmentId);

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    const legs = route ? await this.trackingStore.findLegsByRouteId(route.route_id) : [];
    const rawStops = route ? await this.trackingStore.findStopsByRouteId(route.route_id) : [];
    const stops = isCustomer
      ? rawStops.filter((s) => s.stop_type !== 'transfer_hub').map((s, idx) => ({ ...s, sequence_no: idx + 1 }))
      : rawStops;

    const latestPing = await this.trackingStore.findLatestPing(shipmentId);
    let vehiclePosition: LiveVehiclePosition | null = null;
    if (latestPing) {
      vehiclePosition = {
        lat: Number(latestPing.lat),
        lng: Number(latestPing.lng),
        speedKmh: latestPing.speed_kmh != null ? Number(latestPing.speed_kmh) : null,
        headingDeg: latestPing.heading_deg != null ? Number(latestPing.heading_deg) : null,
        accuracyM: latestPing.accuracy_m != null ? Number(latestPing.accuracy_m) : null,
        source: latestPing.source || 'gps',
        recordedAt: new Date(latestPing.recorded_at).toISOString(),
        isBackdated: Boolean(latestPing.is_backdated),
      };
    } else {
      const logs = await this.trackingStore.findTripStatusLogs(shipmentId);
      const logWithLocation = logs.find((l) => l.lat != null && l.lng != null);
      if (logWithLocation) {
        vehiclePosition = {
          lat: Number(logWithLocation.lat),
          lng: Number(logWithLocation.lng),
          speedKmh: null,
          headingDeg: null,
          accuracyM: logWithLocation.accuracyM != null ? Number(logWithLocation.accuracyM) : null,
          source: (logWithLocation.locationSource as any) || 'gps',
          recordedAt: new Date(logWithLocation.createdAt || Date.now()).toISOString(),
          isBackdated: Boolean(logWithLocation.isBackdated),
        };
      }
    }

    const recentPings = await this.trackingStore.findRecentPingsForShipment(shipmentId, 1000);
    const rawPath = recentPings.map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      t: new Date(p.recorded_at).toISOString(),
      recordedAt: new Date(p.recorded_at).toISOString(),
      source: (p.source as any) || 'gps',
    }));
    const path = decimatePath(rawPath, 500);

    const geofenceConfig =
      (typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.geofence')
        : null) || {};

    const liveStops: LiveTrackingStop[] = await Promise.all(
      stops.map(async (s) => {
        let lat = s.lat != null ? Number(s.lat) : null;
        let lng = s.lng != null ? Number(s.lng) : null;
        let refType = s.location_ref_type ?? null;

        if ((lat === null || lng === null) && typeof this.trackingStore?.findStopCoordinates === 'function') {
          const resolved = await this.trackingStore.findStopCoordinates(s.route_stop_id);
          if (resolved && resolved.lat != null && resolved.lng != null) {
            lat = resolved.lat;
            lng = resolved.lng;
            refType = refType ?? resolved.locationRefType ?? null;
          }
        }

        const effectiveRadiusM = radiusForStop(
          {
            stopType: s.stop_type,
            geofenceRadiusM: s.geofence_radius_m != null ? Number(s.geofence_radius_m) : null,
            locationRefType: refType,
          },
          geofenceConfig,
        );

        return {
          stopId: s.route_stop_id,
          routeStopId: s.route_stop_id,
          sequenceNo: s.sequence_no,
          name: s.location_name,
          locationName: s.location_name,
          type: s.stop_type,
          stopType: s.stop_type,
          lat,
          lng,
          geofenceRadiusM: effectiveRadiusM,
          status: s.status,
          actualArrival: s.actual_arrival ? new Date(s.actual_arrival).toISOString() : null,
          actualDeparture: s.actual_departure ? new Date(s.actual_departure).toISOString() : null,
        };
      }),
    );

    const liveLegs: LiveTrackingLeg[] = legs.map((l) => {
      const rawPolyline = l.route_polyline || l.polyline_json || null;
      let parsedPolyline: Array<[number, number]> = [];
      if (typeof rawPolyline === 'string' && rawPolyline.trim()) {
        try {
          const parsed = JSON.parse(rawPolyline);
          if (Array.isArray(parsed)) {
            parsedPolyline = parsed
              .map((pt): [number, number] | null => {
                if (Array.isArray(pt) && pt.length >= 2) {
                  const lat = Number(pt[0]);
                  const lng = Number(pt[1]);
                  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
                }
                if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
                  const lat = Number((pt as { lat: unknown }).lat);
                  const lng = Number((pt as { lng: unknown }).lng);
                  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
                }
                return null;
              })
              .filter((pt): pt is [number, number] => pt !== null);
          }
        } catch {}
      }
      const normalizedType: 'road' | 'flight' | 'sea' =
        l.leg_type === 'flight' ? 'flight' : l.leg_type === 'sea' ? 'sea' : 'road';
      return {
        legId: l.leg_id,
        sequenceNo: l.sequence_no,
        direction: ((l as any).direction || 'outbound') as 'outbound' | 'return',
        type: normalizedType,
        legType: l.leg_type,
        originLocation: l.origin_location,
        destinationLocation: l.destination_location,
        status: l.status,
        polyline: parsedPolyline,
        actualDeparture: l.actual_departure ? new Date(l.actual_departure).toISOString() : null,
        actualArrival: l.actual_arrival ? new Date(l.actual_arrival).toISOString() : null,
        polylineJson: rawPolyline,
      };
    });

    const completedStopsScore = stops.reduce((sum, s) => {
      if (s.status === 'departed' || s.status === 'completed') return sum + 1;
      if (s.status === 'customs_cleared' || s.status === 'cleared') return sum + 0.75;
      if (s.status === 'arrived') return sum + 0.5;
      return sum;
    }, 0);
    const totalStops = stops.length;
    const progressPct =
      shipment.status === 'completed'
        ? 100
        : totalStops > 0
          ? Math.min(99, Math.round((completedStopsScore / totalStops) * 100))
          : 0;

    const activeLeg = legs.find((l) => l.status === 'active' || l.status === 'in_transit');
    const activeStop = stops.find((s) => s.status === 'arrived' || s.status === 'customs_cleared');

    const horses =
      typeof this.trackingStore?.findHorsesInOrder === 'function'
        ? await this.trackingStore.findHorsesInOrder(shipmentId)
        : [];
    const customerVitalsDetail =
      typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.customer_vitals_detail')
        : null;
    const hideVitalsDetail = isCustomer && (customerVitalsDetail === false || customerVitalsDetail === 'false');

    const vitalsSummary: LiveTrackingVitalsItem[] = [];
    for (const h of horses) {
      const horseId = Number(h.horse_id ?? h.id ?? (h as any).horseId);
      const horseName = h.horse_name ?? h.name ?? (h as any).horseName ?? `Ngựa #${horseId}`;
      const latestLog = await this.trackingStore.findLatestHealthLogForHorse(shipmentId, horseId, horseName);

      if (latestLog) {
        vitalsSummary.push({
          horseId,
          horseName,
          conditionStatus: latestLog.conditionStatus || HorseConditionStatus.STABLE,
          alertTier: latestLog.alertTier,
          temperatureC: hideVitalsDetail ? null : (latestLog.temperatureC ?? null),
          heartRateBpm: hideVitalsDetail ? null : (latestLog.heartRateBpm ?? null),
          respiratoryRate: hideVitalsDetail ? null : (latestLog.respiratoryRateBpm ?? null),
          respiratoryRateBpm: hideVitalsDetail ? null : (latestLog.respiratoryRateBpm ?? null),
          alertReason: hideVitalsDetail ? (latestLog.alertTier === 'red' ? 'Đang được theo dõi y tế đặc biệt' : null) : (latestLog.alertReason ?? null),
          recordedAt: latestLog.recordedAt ? new Date(latestLog.recordedAt).toISOString() : null,
        });
      } else {
        vitalsSummary.push({
          horseId,
          horseName,
          conditionStatus: HorseConditionStatus.STABLE,
          alertTier: 'green',
          temperatureC: null,
          heartRateBpm: null,
          respiratoryRate: null,
          respiratoryRateBpm: null,
          alertReason: null,
          recordedAt: null,
        });
      }
    }

    const simSetting =
      typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.simulation_enabled')
        : null;
    const simulationEnabled =
      simSetting === true || simSetting === 'true' || process.env.TRACKING_SIMULATION_ENABLED === 'true';

    const isSimulated = vehiclePosition?.source === 'simulated';
    const etaStr = shipment.estimated_delivery_at ? new Date(shipment.estimated_delivery_at).toISOString() : null;

    return {
      shipmentId,
      requestCode: shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`,
      status: shipment.status,
      simulation: isSimulated,
      isSimulated,
      simulationEnabled,
      vehicle: vehiclePosition,
      vehiclePosition,
      path,
      legs: liveLegs,
      stops: liveStops,
      progress: {
        percent: progressPct,
        completedKm: 0,
        totalKm: route?.total_distance_km ? Number(route.total_distance_km) : 0,
      },
      progressPct,
      currentLegId: activeLeg?.leg_id ?? null,
      currentStopId: activeStop?.route_stop_id ?? null,
      etaFinalAt: etaStr,
      estimatedArrival: etaStr,
      latestVitals: vitalsSummary,
      vitalsSummary,
    };
  }

  async getLiveOverview(
    user: AuthenticatedUser,
    alertFilter?: string,
  ): Promise<LiveOverviewItem[]> {
    const roleStr = String(user.role || '').toUpperCase();
    const isStaff =
      roleStr.includes('COORDINATOR') ||
      roleStr.includes('MANAGER') ||
      roleStr.includes('ADMIN');

    if (!isStaff) {
      throw new ForbiddenException('Chỉ điều phối viên, quản lý hoặc quản trị viên mới có quyền xem bản đồ tổng quan.');
    }

    const activeShipments =
      typeof this.trackingStore?.findActiveShipmentsForLiveOverview === 'function'
        ? await this.trackingStore.findActiveShipmentsForLiveOverview()
        : [];
    const result: LiveOverviewItem[] = [];

    for (const s of activeShipments) {
      const shipmentId = Number(s.shipment_id);
      const latestPing =
        typeof this.trackingStore?.findLatestPing === 'function'
          ? await this.trackingStore.findLatestPing(shipmentId)
          : null;

      const horses =
        typeof this.trackingStore?.findHorsesInOrder === 'function'
          ? await this.trackingStore.findHorsesInOrder(shipmentId)
          : [];
      let highestAlertTier: 'green' | 'amber' | 'red' = 'green';
      let alertCount = 0;

      for (const h of horses) {
        const horseId = Number(h.horse_id ?? h.id ?? (h as any).horseId);
        const horseName = h.horse_name ?? h.name ?? (h as any).horseName ?? `Ngựa #${horseId}`;
        const latestLog = await this.trackingStore.findLatestHealthLogForHorse(shipmentId, horseId, horseName);
        if (latestLog) {
          if (latestLog.alertTier === 'red') {
            highestAlertTier = 'red';
            alertCount++;
          } else if (latestLog.alertTier?.startsWith('amber') && highestAlertTier !== 'red') {
            highestAlertTier = 'amber';
            alertCount++;
          }
        }
      }

      if (alertFilter && alertFilter !== 'all') {
        if (alertFilter === 'red' && highestAlertTier !== 'red') continue;
        if (alertFilter === 'amber' && highestAlertTier !== 'amber') continue;
        if (alertFilter === 'alert' && highestAlertTier === 'green') continue;
      }

      const lastPingTime = latestPing?.recorded_at ? new Date(latestPing.recorded_at).getTime() : null;
      const lastPingAgoSeconds = lastPingTime ? Math.round((Date.now() - lastPingTime) / 1000) : null;

      const driverName = s.driver_name || null;
      const vehiclePlate = s.vehicle_plate || null;
      const horsesCount = Number(s.horses_count || horses.length || s.requested_horse_count || 0);

      result.push({
        shipmentId,
        requestCode: s.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`,
        customerName: s.contact_name || 'Khách hàng',
        driverName,
        assignedDriver: driverName,
        vehiclePlate,
        assignedVehicle: vehiclePlate,
        horsesCount,
        originLocation: s.origin_location,
        destinationLocation: s.destination_location,
        status: s.status,
        currentMilestone: null,
        latestPosition: latestPing
          ? {
              lat: Number(latestPing.lat),
              lng: Number(latestPing.lng),
              speedKmh: latestPing.speed_kmh != null ? Number(latestPing.speed_kmh) : null,
              headingDeg: latestPing.heading_deg != null ? Number(latestPing.heading_deg) : null,
              accuracyM: latestPing.accuracy_m != null ? Number(latestPing.accuracy_m) : null,
              source: latestPing.source || 'gps',
              recordedAt: new Date(latestPing.recorded_at).toISOString(),
            }
          : null,
        alertTier: highestAlertTier,
        latestAlertTier: highestAlertTier,
        alertCount,
        isSimulated: latestPing?.source === 'simulated',
        lastPingAgoSeconds,
      });
    }

    return result;
  }

  async getTrackingSettings(): Promise<TrackingSystemSettings> {
    const geofence =
      (typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.geofence')
        : null) || {
        defaultRadiusM: 300,
        largeSiteRadiusM: 1000,
        bufferAccuracyM: 100,
        maxAccuracyM: 200,
      };
    const simSetting =
      typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.simulation_enabled')
        : null;
    const simulationEnabled =
      simSetting === true || simSetting === 'true' || process.env.TRACKING_SIMULATION_ENABLED === 'true';

    const vitalsSetting =
      typeof this.trackingStore?.getSetting === 'function'
        ? await this.trackingStore.getSetting('tracking.customer_vitals_detail')
        : null;
    const customerVitalsDetail = vitalsSetting !== false && vitalsSetting !== 'false';

    return {
      geofence,
      geofenceRadiusDefaultM: geofence.defaultRadiusM,
      geofenceRadiusLargeSiteM: geofence.largeSiteRadiusM,
      simulationEnabled,
      customerVitalsDetail,
    };
  }

  async updateTrackingSettings(
    user: AuthenticatedUser,
    patch: Partial<TrackingSystemSettings>,
  ): Promise<TrackingSystemSettings> {
    const roleStr = String(user.role || '').toUpperCase();
    if (!roleStr.includes('ADMIN')) {
      throw new ForbiddenException('Chỉ Quản trị viên (ADMIN) mới có quyền chỉnh sửa cài đặt hệ thống định vị & giám sát.');
    }

    if (patch.geofence !== undefined && typeof this.trackingStore?.setSetting === 'function') {
      await this.trackingStore.setSetting('tracking.geofence', patch.geofence);
    } else if (
      (patch.geofenceRadiusDefaultM !== undefined || patch.geofenceRadiusLargeSiteM !== undefined) &&
      typeof this.trackingStore?.setSetting === 'function'
    ) {
      const current = await this.getTrackingSettings();
      const updatedGeofence = {
        ...current.geofence,
        defaultRadiusM: patch.geofenceRadiusDefaultM ?? current.geofence?.defaultRadiusM ?? 300,
        largeSiteRadiusM: patch.geofenceRadiusLargeSiteM ?? current.geofence?.largeSiteRadiusM ?? 1000,
        bufferAccuracyM: current.geofence?.bufferAccuracyM ?? 100,
        maxAccuracyM: current.geofence?.maxAccuracyM ?? 200,
      };
      await this.trackingStore.setSetting('tracking.geofence', updatedGeofence);
    }
    if (patch.simulationEnabled !== undefined && typeof this.trackingStore?.setSetting === 'function') {
      await this.trackingStore.setSetting('tracking.simulation_enabled', patch.simulationEnabled);
    }
    if (patch.customerVitalsDetail !== undefined && typeof this.trackingStore?.setSetting === 'function') {
      await this.trackingStore.setSetting('tracking.customer_vitals_detail', patch.customerVitalsDetail);
    }

    return this.getTrackingSettings();
  }

  async getShipmentTimeline(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<ShipmentTimelineResponse> {
    const shipment = await this.trackingStore.findShipmentById(shipmentId);
    if (!shipment) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const isCustomer = String(user.role).toUpperCase() === 'CUSTOMER';
    if (isCustomer && shipment.customer_id !== Number(user.id)) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin chuyến đi của khách hàng khác');
    }

    await this.assertAssignedForDriverEscort(user, shipmentId);

    const route = await this.trackingStore.findRouteByShipmentId(shipmentId);
    const routeId = route?.route_id || shipment.route_id;

    let legs: any[] = [];
    let stops: any[] = [];
    if (routeId) {
      legs = await this.trackingStore.findLegsByRouteId(routeId);
      stops = await this.trackingStore.findStopsByRouteId(routeId);
    }

    const rawStatusLogs = await this.trackingStore.findTripStatusLogs(shipmentId);
    const healthLogs = await this.trackingStore.findHorseHealthLogs(shipmentId);
    const assignedStaff = await this.trackingStore.findAssignedStaff(shipmentId);
    let customerVitalsDetail = true;
    if (typeof this.trackingStore?.getSetting === 'function') {
      const vitalsRaw = await this.trackingStore.getSetting('tracking.customer_vitals_detail');
      customerVitalsDetail = vitalsRaw !== false && vitalsRaw !== 'false';
    }

    // Build timeline items
    const items: TimelineItemDto[] = [];
    const status = String(shipment.status || 'requested').toLowerCase();
    const tripType = shipment.trip_type === 'round_trip' ? 'round_trip' : 'one_way';
    const paymentRefundTs =
      typeof this.trackingStore?.findPaymentAndRefundTimestamps === 'function'
        ? await this.trackingStore.findPaymentAndRefundTimestamps(shipmentId)
        : { paidAt: null, refundedAt: null };

    // ── 1. PRE-TRIP GROUP ──
    const isCancelledOrRejected = ['rejected', 'cancelled', 'cancelled_operational'].includes(status);
    const isPaid =
      Boolean(paymentRefundTs.paidAt || shipment.paid_at || shipment.payment_received_at) ||
      [
        'paid_pending_review',
        'approved',
        'planning',
        'confirmed',
        'ready_to_depart',
        'in_transit',
        'return_pending',
        'arrived',
        'completed',
        'delivered',
        'refund_requested',
        'refunded',
      ].includes(status);
    const paymentActualAt =
      paymentRefundTs.paidAt || shipment.paid_at || shipment.payment_received_at || (isPaid ? shipment.created_at : null);
    items.push({
      id: 'pre_payment',
      group: 'pre_trip',
      kind: 'payment',
      title: 'Thanh toán cước vận chuyển',
      subtitle: isPaid ? 'Đã hoàn tất thanh toán VietQR' : 'Chờ khách hàng thanh toán',
      status: isPaid ? 'done' : status === 'awaiting_payment' ? 'current' : isCancelledOrRejected ? 'failed' : 'upcoming',
      plannedAt: shipment.created_at ? new Date(shipment.created_at).toISOString() : null,
      actualAt: paymentActualAt ? new Date(paymentActualAt).toISOString() : null,
    });

    const isApproved = [
      'approved',
      'planning',
      'confirmed',
      'ready_to_depart',
      'in_transit',
      'return_pending',
      'arrived',
      'completed',
      'delivered',
    ].includes(status);
    const approvalActualAt = shipment.feasibility_reviewed_at || shipment.feasibility_decided_at || (isApproved ? shipment.approved_at : null);
    items.push({
      id: 'pre_approval',
      group: 'pre_trip',
      kind: 'approval',
      title: 'Phê duyệt khả thi & kế hoạch',
      subtitle: isApproved
        ? 'Logistics Manager đã phê duyệt'
        : isCancelledOrRejected
        ? 'Đơn đã bị từ chối hoặc hủy'
        : 'Đang thẩm định khả thi tuyến & xe',
      status: isApproved
        ? 'done'
        : ['paid_pending_review', 'requested', 'under_review', 'change_requested'].includes(status)
        ? 'current'
        : isCancelledOrRejected
        ? 'failed'
        : 'upcoming',
      actualAt: approvalActualAt ? new Date(approvalActualAt).toISOString() : null,
    });

    const isDocsCompliant = ['ready_to_depart', 'in_transit', 'return_pending', 'arrived', 'completed', 'delivered'].includes(status);
    items.push({
      id: 'pre_documents',
      group: 'pre_trip',
      kind: 'documents',
      title: 'Hồ sơ kiểm dịch & giấy tờ thú y',
      subtitle: isDocsCompliant ? 'Đủ điều kiện xuất phát (Tier A/B)' : 'Đang rà soát và kiểm duyệt giấy tờ',
      status: isDocsCompliant ? 'done' : ['approved', 'planning', 'confirmed'].includes(status) ? 'current' : 'upcoming',
    });

    const isDispatched = ['ready_to_depart', 'in_transit', 'return_pending', 'arrived', 'completed', 'delivered'].includes(status);
    const driverStaff = assignedStaff.find((s) => s.role_in_shipment === 'driver');
    items.push({
      id: 'pre_dispatch',
      group: 'pre_trip',
      kind: 'depot',
      title: 'Điều phối xe & tài xế sẵn sàng',
      subtitle: isDispatched
        ? (isCustomer ? 'Phương tiện chuyên dụng đã sẵn sàng' : `Xe đã bàn giao cho tài xế ${driverStaff?.full_name || ''}`.trim())
        : 'Đang xếp lịch phương tiện & nhân sự',
      status: isDispatched ? 'done' : status === 'confirmed' ? 'current' : 'upcoming',
    });

    // ── 2. OUTBOUND & RETURN GROUPS ──
    const outboundLegs = legs.filter((l) => (l.direction || 'outbound') === 'outbound');
    const returnLegs = legs.filter((l) => l.direction === 'return');
    const outboundStops = stops.filter((s) => (s.direction || 'outbound') === 'outbound');
    const returnStops = stops.filter((s) => s.direction === 'return');

    const mapStopKind = (stopType?: string, legType?: string): any => {
      if (legType === 'flight') return 'airport';
      if (legType === 'sea' || stopType === 'seaport') return 'seaport';
      if (stopType === 'border_check') return 'border';
      if (stopType === 'quarantine') return 'quarantine';
      if (stopType === 'rest') return 'rest';
      if (stopType === 'transfer_hub') return 'transfer';
      if (stopType === 'delivery') return 'delivery';
      return 'other';
    };

    const isLegDepartedHelper = (leg: any) =>
      Boolean(leg.actual_departure) ||
      ['active', 'departed', 'in_transit', 'completed', 'arrived'].includes(String(leg.status || '').toLowerCase());

    const isLegCompletedHelper = (leg: any) =>
      Boolean(leg.actual_arrival) || String(leg.status || '').toLowerCase() === 'completed';

    const outboundAllCompleted =
      outboundLegs.length === 0 ||
      status === 'return_pending' ||
      status === 'completed' ||
      outboundLegs.every((l) => isLegCompletedHelper(l));

    let foundOperationalCurrent = false;

    const processLegsAndStops = (
      legsSubset: any[],
      stopsSubset: any[],
      group: 'outbound' | 'return',
      canGroupStart: boolean,
    ) => {
      const assignedStopIds = new Set<number>();
      const isGroupMultimodalFlight =
        legsSubset.some((l) => l.leg_type === 'flight') && legsSubset.length >= 2;
      const classifiedGroupStops = isGroupMultimodalFlight
        ? this.classifyMultimodalStops(legsSubset, stopsSubset)
        : null;

      for (let legIdx = 0; legIdx < legsSubset.length; legIdx++) {
        const leg = legsSubset[legIdx];
        const isFirstLegOfGroup = legIdx === 0;
        const isLastLegOfGroup = legIdx === legsSubset.length - 1;
        const prevLegDone =
          legIdx === 0
            ? canGroupStart
            : isLegCompletedHelper(legsSubset[legIdx - 1]);

        const isLegDeparted =
          isLegDepartedHelper(leg) ||
          (status === 'completed' && group === 'outbound') ||
          (status === 'completed' && group === 'return' && String(shipment.return_status || '').toLowerCase() !== 'no_show' && !Boolean(shipment.return_no_show));

        const isMultimodalImportRoadLeg = Boolean(
          classifiedGroupStops?.stopImport &&
            classifiedGroupStops?.legRoadLast &&
            Number(leg.leg_id) === Number(classifiedGroupStops.legRoadLast.leg_id),
        );
        const isMultimodalExportRoadLeg = Boolean(
          classifiedGroupStops?.stopExport &&
            classifiedGroupStops?.legRoad1 &&
            Number(leg.leg_id) === Number(classifiedGroupStops.legRoad1.leg_id),
        );

        const legStartLog = rawStatusLogs.find(
          (l) => l.milestoneType === 'leg_departure' && Number(l.legId) === Number(leg.leg_id),
        );
        const startPlanned = leg.planned_departure ? new Date(leg.planned_departure).toISOString() : null;
        const startActual = leg.actual_departure
          ? new Date(leg.actual_departure).toISOString()
          : (legStartLog ? new Date(legStartLog.createdAt).toISOString() : null);

        let startDelayMins: number | null = null;
        if (startPlanned && startActual) {
          startDelayMins = Math.round((new Date(startActual).getTime() - new Date(startPlanned).getTime()) / 60000);
        }

        const isStartCurrent =
          !isMultimodalImportRoadLeg &&
          !isLegDeparted &&
          !foundOperationalCurrent &&
          prevLegDone &&
          (group === 'outbound'
            ? ['ready_to_depart', 'in_transit'].includes(status)
            : ['return_pending', 'in_transit'].includes(status));

        if (isStartCurrent) foundOperationalCurrent = true;
        const startStatus: 'done' | 'current' | 'upcoming' = isLegDeparted
          ? 'done'
          : isStartCurrent
          ? 'current'
          : 'upcoming';

        const startPhotos = legStartLog?.evidenceUrl
          ? [{ url: legStartLog.evidenceUrl, alt: leg.origin_location || 'Check-in evidence' }]
          : undefined;

        if (!isMultimodalImportRoadLeg) {
          items.push({
            id: isFirstLegOfGroup ? `${group}_pickup` : `${group}_leg_${leg.leg_id}_start`,
            milestoneId: `leg-${leg.leg_id}-start`,
            legId: Number(leg.leg_id),
            group,
            kind: isFirstLegOfGroup
              ? (group === 'return' ? 'return_start' : 'pickup')
              : leg.leg_type === 'flight'
              ? 'airport'
              : leg.leg_type === 'sea'
              ? 'seaport'
              : 'pickup',
            title: isFirstLegOfGroup
              ? (group === 'return'
                  ? `Khởi hành chặng về: ${leg.origin_location}`
                  : `Đón ngựa tại: ${leg.origin_location}`)
              : `Xuất phát chặng ${leg.sequence_no}: ${leg.origin_location}`,
            subtitle: leg.origin_location,
            status: startStatus,
            plannedAt: startPlanned,
            actualAt: startStatus === 'upcoming' ? null : startActual,
            delayMinutes: startStatus === 'upcoming' ? null : startDelayMins,
            locationSource:
              startStatus === 'upcoming'
                ? undefined
                : ((legStartLog?.locationSource as any) || (leg.checkin_source as any) || (startActual ? 'gps' : undefined)),
            flagged: startStatus === 'upcoming' ? false : Boolean(legStartLog?.flagged),
            photos: startStatus === 'upcoming' ? undefined : startPhotos,
            actorLabel:
              isCustomer || startStatus === 'upcoming'
                ? undefined
                : (legStartLog?.updatedByName || (startStatus === 'done' ? driverStaff?.full_name : undefined)),
            note: startStatus === 'upcoming' ? undefined : (legStartLog?.notes || undefined),
          });
        }

        // Stops belonging to this leg (matching buildStandardTimeline / multimodal classifier)
        const legStops = this.getStopsForLeg(
          leg,
          legIdx,
          legsSubset,
          stopsSubset,
          classifiedGroupStops,
        ).filter((s) => {
          const sid = Number(s.route_stop_id || 0);
          return !(sid && assignedStopIds.has(sid));
        });

        let allStopsForLegDone = true;
        for (const stop of legStops) {
          if (stop.route_stop_id) assignedStopIds.add(Number(stop.route_stop_id));
          const isCustoms = stop.stop_type === 'quarantine' || stop.stop_type === 'border_check';
          const isQuarantine = stop.stop_type === 'quarantine';
          const stopStatusRaw = String(stop.status || 'pending').toLowerCase();
          const isMultimodalImportStop = Boolean(
            classifiedGroupStops?.stopImport &&
              Number(stop.route_stop_id) === Number(classifiedGroupStops.stopImport.route_stop_id),
          );
          const isMultimodalExportStop = Boolean(
            classifiedGroupStops?.stopExport &&
              Number(stop.route_stop_id) === Number(classifiedGroupStops.stopExport.route_stop_id),
          );
          const isStopDone =
            stopStatusRaw === 'departed' ||
            stopStatusRaw === 'completed' ||
            ((!isQuarantine || isMultimodalExportStop || isMultimodalImportStop) &&
              isCustoms &&
              (stopStatusRaw === 'customs_cleared' || stopStatusRaw === 'cleared')) ||
            (isMultimodalExportStop && isLegCompletedHelper(leg)) ||
            (isMultimodalImportStop && isLegDepartedHelper(leg)) ||
            (group === 'outbound' && (status === 'return_pending' || status === 'completed')) ||
            (group === 'return' && status === 'completed' && !Boolean(shipment.return_no_show) && String(shipment.return_status || '').toLowerCase() !== 'no_show');

          if (!isStopDone) {
            allStopsForLegDone = false;
          }

          if (isCustomer && stop.stop_type === 'transfer_hub') continue;

          const stopLogsForStop = rawStatusLogs.filter(
            (l) => Number(l.routeStopId) === Number(stop.route_stop_id),
          );
          const stopLog = stopLogsForStop[stopLogsForStop.length - 1];
          const isStopInProgress =
            stopStatusRaw === 'arrived' ||
            (isQuarantine && !isMultimodalExportStop && !isMultimodalImportStop && (stopStatusRaw === 'customs_cleared' || stopStatusRaw === 'cleared'));
          const flightDoneForImport =
            isMultimodalImportStop &&
            Boolean(classifiedGroupStops?.legFlight && isLegCompletedHelper(classifiedGroupStops.legFlight));
          const isStopCurrent =
            !isStopDone &&
            (isStopInProgress || (!foundOperationalCurrent && (isLegDeparted || flightDoneForImport)));

          if (isStopCurrent) foundOperationalCurrent = true;
          const stopTimelineStatus: 'done' | 'current' | 'upcoming' = isStopDone
            ? 'done'
            : isStopCurrent
            ? 'current'
            : 'upcoming';

          const stopPlanned = stop.planned_arrival ? new Date(stop.planned_arrival).toISOString() : null;
          const stopActual = stop.actual_departure
            ? new Date(stop.actual_departure).toISOString()
            : stop.actual_arrival
            ? new Date(stop.actual_arrival).toISOString()
            : (stopLog ? new Date(stopLog.createdAt).toISOString() : null);

          let delayMins: number | null = null;
          if (stopPlanned && stopActual) {
            delayMins = Math.round((new Date(stopActual).getTime() - new Date(stopPlanned).getTime()) / 60000);
          }

          const stopHealthLogs = healthLogs.filter(
            (h) => Number(h.routeStopId ?? (h as any).route_stop_id) === Number(stop.route_stop_id),
          );
          const vitalsList = stopHealthLogs.map((h) => {
            const temp = h.temperatureC ?? (h as any).temperature_c;
            const hr = h.heartRateBpm ?? (h as any).heart_rate_bpm;
            const cond = h.conditionStatus ?? (h as any).condition_status;
            const hName = h.horseName ?? (h as any).horse_name;
            const tier = h.alertTier ?? (h as any).alert_tier;
            const showRaw = !isCustomer || customerVitalsDetail === true;
            const vitalsText = showRaw && temp && hr
              ? `${temp}°C, ${hr} bpm`
              : (cond === 'stable' ? 'Ổn định' : 'Cần chú ý');
            return {
              horseName: hName,
              tier: (tier || (cond === 'stable' ? 'green' : 'amber_observational')) as any,
              text: vitalsText,
            };
          });

          const stopPhotos = stopLogsForStop
            .filter((l) => Boolean(l.evidenceUrl))
            .map((l, idx) => ({
              url: l.evidenceUrl as string,
              alt: `${stop.location_name || 'Stop'} #${idx + 1}`,
            }));

          const stopProgressPct =
            stopTimelineStatus === 'current'
              ? (stopStatusRaw === 'customs_cleared' || stopStatusRaw === 'cleared'
                  ? 75
                  : stopStatusRaw === 'arrived'
                  ? 50
                  : undefined)
              : undefined;

          items.push({
            id: `${group}_stop_${stop.route_stop_id || stop.sequence_no}`,
            milestoneId: stop.route_stop_id ? `stop-${stop.route_stop_id}` : null,
            legId: Number(leg.leg_id),
            stopId: stop.route_stop_id ? Number(stop.route_stop_id) : null,
            group,
            kind: mapStopKind(stop.stop_type, leg.leg_type),
            title: stop.location_name || `Trạm dừng #${stop.sequence_no}`,
            subtitle: stop.address || stop.city || stop.country,
            status: stopTimelineStatus,
            plannedAt: stopPlanned,
            actualAt: stopTimelineStatus === 'upcoming' ? null : stopActual,
            delayMinutes: stopTimelineStatus === 'upcoming' ? null : delayMins,
            progressPercent: stopProgressPct,
            locationSource:
              stopTimelineStatus === 'upcoming'
                ? undefined
                : ((stopLog?.locationSource as any) || (stop.checkin_source as any) || (stopActual ? 'gps' : undefined)),
            flagged: stopTimelineStatus === 'upcoming' ? false : Boolean(stopLog?.flagged),
            vitals: vitalsList.length > 0 ? vitalsList : undefined,
            photos: stopTimelineStatus === 'upcoming' || stopPhotos.length === 0 ? undefined : stopPhotos,
            actorLabel:
              isCustomer || stopTimelineStatus === 'upcoming'
                ? undefined
                : (stopLog?.updatedByName || stop.updated_by_name || (stopTimelineStatus === 'done' ? driverStaff?.full_name : undefined)),
            note: stopTimelineStatus === 'upcoming' ? undefined : (stop.notes || stopLog?.notes || undefined),
          });
        }

        if (isMultimodalExportRoadLeg) {
          continue;
        }

        // Leg End item
        const isLegDelivered =
          isLegCompletedHelper(leg) ||
          (group === 'outbound' && (status === 'return_pending' || status === 'completed')) ||
          (group === 'return' && status === 'completed' && !Boolean(shipment.return_no_show) && String(shipment.return_status || '').toLowerCase() !== 'no_show');
        const legEndLog = rawStatusLogs.find(
          (l) => l.milestoneType === 'leg_arrival' && Number(l.legId) === Number(leg.leg_id),
        );
        const endPlanned = leg.planned_arrival ? new Date(leg.planned_arrival).toISOString() : null;
        const endActual = leg.actual_arrival
          ? new Date(leg.actual_arrival).toISOString()
          : (legEndLog ? new Date(legEndLog.createdAt).toISOString() : null);

        let endDelayMins: number | null = null;
        if (endPlanned && endActual) {
          endDelayMins = Math.round((new Date(endActual).getTime() - new Date(endPlanned).getTime()) / 60000);
        }

        const isLegEndCurrent =
          !isLegDelivered &&
          !foundOperationalCurrent &&
          (isLegDeparted || (isMultimodalImportRoadLeg && allStopsForLegDone)) &&
          allStopsForLegDone;
        if (isLegEndCurrent) foundOperationalCurrent = true;

        const endStatus: 'done' | 'current' | 'upcoming' = isLegDelivered
          ? 'done'
          : isLegEndCurrent
          ? 'current'
          : 'upcoming';

        const endPhotos = legEndLog?.evidenceUrl
          ? [{ url: legEndLog.evidenceUrl, alt: leg.destination_location || 'Arrival evidence' }]
          : undefined;

        items.push({
          id: isLastLegOfGroup ? `${group}_delivery` : `${group}_leg_${leg.leg_id}_end`,
          milestoneId: `leg-${leg.leg_id}-end`,
          legId: Number(leg.leg_id),
          group,
          kind: isLastLegOfGroup
            ? 'delivery'
            : leg.leg_type === 'flight'
            ? 'airport'
            : leg.leg_type === 'sea'
            ? 'seaport'
            : 'delivery',
          title: isLastLegOfGroup
            ? (group === 'return'
                ? `Cập bến về đích: ${leg.destination_location}`
                : `Bàn giao tại đích: ${leg.destination_location}`)
            : `Đến điểm cuối chặng ${leg.sequence_no}: ${leg.destination_location}`,
          subtitle: leg.destination_location,
          status: endStatus,
          plannedAt: endPlanned,
          actualAt: endStatus === 'upcoming' ? null : endActual,
          delayMinutes: endStatus === 'upcoming' ? null : endDelayMins,
          locationSource:
            endStatus === 'upcoming'
              ? undefined
              : ((legEndLog?.locationSource as any) || (leg.checkin_source as any) || (endActual ? 'gps' : undefined)),
          flagged: endStatus === 'upcoming' ? false : Boolean(legEndLog?.flagged),
          photos: endStatus === 'upcoming' ? undefined : endPhotos,
          actorLabel:
            isCustomer || endStatus === 'upcoming'
              ? undefined
              : (legEndLog?.updatedByName || (endStatus === 'done' ? driverStaff?.full_name : undefined)),
          note: endStatus === 'upcoming' ? undefined : (legEndLog?.notes || undefined),
        });
      }
    };

    if (outboundLegs.length > 0) {
      processLegsAndStops(outboundLegs, outboundStops, 'outbound', true);
    }
    if (tripType === 'round_trip' && returnLegs.length > 0) {
      processLegsAndStops(returnLegs, returnStops, 'return', outboundAllCompleted);
    }

    // ── 3. POST-TRIP GROUP ──
    const isCompleted = status === 'completed';
    const isNoShow =
      Boolean(shipment.return_no_show) ||
      status === 'no_show' ||
      String(shipment.return_status || '').toLowerCase() === 'no_show';
    const isRefunded = status === 'refunded';

    if (isNoShow) {
      items.push({
        id: 'post_noshow',
        group: 'post_trip',
        kind: 'no_show',
        title: 'Khách không giao ngựa chặng về (No-Show)',
        subtitle: `Tài xế đã chờ đủ ${shipment.return_wait_minutes ?? 120} phút theo chính sách`,
        status: 'failed',
        actualAt: shipment.return_cancelled_at
          ? new Date(shipment.return_cancelled_at).toISOString()
          : shipment.actual_arrival_date
          ? new Date(shipment.actual_arrival_date).toISOString()
          : new Date().toISOString(),
      });
    } else if (isRefunded) {
      const refundedAt = paymentRefundTs.refundedAt || shipment.refunded_at || shipment.updated_at || null;
      items.push({
        id: 'post_refund',
        group: 'post_trip',
        kind: 'refund',
        title: 'Đã hoàn tiền đơn hàng',
        subtitle: 'Hoàn tiền 100% qua chuyển khoản ngân hàng',
        status: 'failed',
        actualAt: refundedAt ? new Date(refundedAt).toISOString() : new Date().toISOString(),
      });
    } else {
      items.push({
        id: 'post_handover',
        group: 'post_trip',
        kind: 'handover',
        title: 'Biên bản bàn giao & kiểm tra thể trạng',
        subtitle: isCompleted ? 'Đã ký nhận bàn giao ngựa an toàn' : 'Biên bản giao nhận tại điểm đến',
        status: isCompleted ? 'done' : 'upcoming',
      });
      items.push({
        id: 'post_completed',
        group: 'post_trip',
        kind: 'delivery',
        title: 'Hoàn tất toàn bộ hành trình',
        subtitle: isCompleted ? 'Chuyến đi kết thúc thành công' : 'Chờ hoàn tất',
        status: isCompleted ? 'done' : 'upcoming',
      });
    }

    const doneItems = items.filter((it) => it.status === 'done').length;
    const progressPercent = items.length > 0 ? Math.round((doneItems / items.length) * 100) : 0;

    const finalRequestCode = isCustomer && shipment.customer_request_code
      ? shipment.customer_request_code
      : (shipment.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`);

    return {
      shipmentId,
      requestCode: finalRequestCode,
      status: shipment.status,
      tripType,
      returnStatus: shipment.return_status,
      progressPercent,
      etaFinalAt: legs[legs.length - 1]?.planned_arrival ? new Date(legs[legs.length - 1].planned_arrival).toISOString() : null,
      items,
    };
  }
}
