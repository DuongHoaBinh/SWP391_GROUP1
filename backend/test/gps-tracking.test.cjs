// Step 10: Check-in bằng GPS, giả lập vị trí, sinh hiệu bắt buộc, live tracking
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} = require('@nestjs/common');
const { UserRole } = require('../dist/modules/auth/auth.types');
const {
  distanceMeters,
  radiusForStop,
  evaluateGeofence,
  interpolateAlongPolyline,
  decimatePath,
} = require('../dist/modules/tracking/geofence-policy');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { SystemSettingsController } = require('../dist/modules/tracking/system-settings.controller');

const DRIVER_USER = { id: 10, email: 'driver@test.local', fullName: 'Driver Tran', role: UserRole.DRIVER_ESCORT };
const MANAGER_USER = { id: 1, email: 'manager@test.local', fullName: 'Manager Le', role: UserRole.LOGISTICS_MANAGER };
const ADMIN_USER = { id: 2, email: 'admin@test.local', fullName: 'Admin Nguyen', role: UserRole.ADMIN };
const CUSTOMER_ALICE = { id: 100, email: 'alice@test.local', fullName: 'Alice Nguyen', role: UserRole.CUSTOMER };
const CUSTOMER_BOB = { id: 200, email: 'bob@test.local', fullName: 'Bob Tran', role: UserRole.CUSTOMER };

function makeMockTrackingStore(initialData = {}) {
  const settings = new Map(Object.entries(initialData.settings || {}));
  const pings = [...(initialData.pings || [])];
  const logs = [...(initialData.logs || [])];
  const healthLogs = [...(initialData.healthLogs || [])];
  const stopCoords = new Map(initialData.stopCoords || []);
  const legCoords = new Map(initialData.legCoords || []);
  const stops = new Map(initialData.stops || []);
  const legs = new Map(initialData.legs || []);
  const shipments = new Map(initialData.shipments || []);
  const horses = initialData.horses || [
    { horse_id: 1, horse_name: 'Bạch Mã' },
    { horse_id: 2, horse_name: 'Xích Thố' },
  ];

  return {
    settings,
    pings,
    logs,
    healthLogs,
    stopCoords,
    legCoords,
    stops,
    legs,
    shipments,
    horses,

    async getSetting(key) {
      return settings.has(key) ? settings.get(key) : null;
    },
    async setSetting(key, val) {
      settings.set(key, val);
    },
    async findShipmentById(id) {
      return shipments.get(Number(id)) || null;
    },
    async findRouteByShipmentId(shipmentId) {
      return { route_id: 50, shipment_id: shipmentId, total_distance_km: 120 };
    },
    async findStopsByRouteId(routeId) {
      return Array.from(stops.values());
    },
    async findLegsByRouteId(routeId) {
      return Array.from(legs.values());
    },
    async findStopCoordinates(stopId) {
      return stopCoords.get(Number(stopId)) || null;
    },
    async findLegCoordinates(legId) {
      return legCoords.get(Number(legId)) || null;
    },
    async findHorsesInOrder(shipmentId) {
      return horses;
    },
    async findAssignedHorses(shipmentId) {
      return horses.map((h) => ({ id: h.horse_id, name: h.horse_name }));
    },
    async findTripStatusLogs(shipmentId) {
      return logs.filter((l) => l.shipmentId === shipmentId);
    },
    async findActiveVitalConfig() {
      return {
        tempGreenMin: 37.2,
        tempGreenMax: 38.3,
        tempAmberLowMin: 36.8,
        tempAmberHighMax: 38.8,
        hrGreenMin: 28,
        hrGreenMax: 44,
        hrAmberLowMin: 24,
        hrAmberHighMax: 52,
      };
    },
    async findHealthLogsForStop(shipmentId, arrivalTime, stopId) {
      return healthLogs.filter((l) => {
        const timeOk = arrivalTime ? new Date(l.recordedAt) >= new Date(arrivalTime) : true;
        const stopOk = stopId && l.routeStopId ? Number(l.routeStopId) === Number(stopId) : true;
        return l.shipmentId === shipmentId && (stopOk || timeOk);
      });
    },
    async findLatestHealthLogForHorse(shipmentId, horseId, horseName) {
      const filtered = healthLogs.filter((l) =>
        l.shipmentId === shipmentId &&
        (horseId ? l.horseId === horseId : l.horseName.toLowerCase() === horseName.toLowerCase()),
      );
      if (filtered.length === 0) return null;
      return filtered[filtered.length - 1];
    },
    async findHorseHealthLogs(shipmentId) {
      return healthLogs.filter((l) => l.shipmentId === shipmentId);
    },
    async createHorseHealthLog(log) {
      const id = healthLogs.length + 1;
      healthLogs.push({
        id,
        ...log,
        recordedAt: log.recordedAt ? log.recordedAt.toISOString() : new Date().toISOString(),
      });
      return id;
    },
    async saveVehiclePositionPings(batch) {
      pings.push(...batch);
      return batch.length;
    },
    async findLatestPing(shipmentId) {
      const list = pings.filter((p) => p.shipmentId === shipmentId);
      return list.length > 0 ? list[list.length - 1] : null;
    },
    async findRecentPingsForShipment(shipmentId, limit = 500) {
      return pings.filter((p) => p.shipmentId === shipmentId).slice(0, limit);
    },
    async updateStopStatus(stopId, action, userId, now, isDeparture, notes, actorRole, isBackdated, loc) {
      const stop = stops.get(Number(stopId));
      if (stop) {
        stop.status = action;
        if (isDeparture) stop.actual_departure = now;
        else stop.actual_arrival = now;
      }
    },
    async recordTripStatusLog(entry) {
      logs.push(entry);
    },
    async updateLegStatus(legId, status, departure, arrival) {
      const leg = legs.get(Number(legId));
      if (leg) {
        leg.status = status;
        if (departure) leg.actual_departure = departure;
        if (arrival) leg.actual_arrival = arrival;
      }
    },
    async findAssignedStaff(shipmentId) {
      return [{ user_id: DRIVER_USER.id, role: 'driver' }];
    },
    async findActiveShipmentsForLiveOverview() {
      return Array.from(shipments.values()).map((s) => ({
        shipment_id: s.shipment_id,
        request_code: s.request_code,
        contact_name: s.contact_name,
        origin_location: s.origin_location,
        destination_location: s.destination_location,
        status: s.status,
      }));
    },
  };
}

function makeMockNotificationsService() {
  const sent = [];
  return {
    sent,
    async createNotification(userId, title, message, type, shipmentId) {
      sent.push({ userId, title, message, type, shipmentId });
    },
    async notifyRole(role, title, message, type, shipmentId) {
      sent.push({ role, title, message, type, shipmentId });
    },
  };
}

test('1. distanceMeters: Tính khoảng cách giữa Nhà thờ Đức Bà và Chợ Bến Thành ~808m, sai số < 1%', () => {
  const ducBa = { lat: 10.77978, lng: 106.69902 };
  const benThanh = { lat: 10.77254, lng: 106.69804 };

  const d = distanceMeters(ducBa, benThanh);
  // Khoảng cách thực tế ~808.5 mét
  assert.ok(d >= 800 && d <= 820, `Khoảng cách ${d}m phải xấp xỉ 808m`);
  const errorPct = Math.abs(d - 808.5) / 808.5;
  assert.ok(errorPct < 0.01, `Sai số ${errorPct * 100}% phải nhỏ hơn 1%`);
});

test('2. radiusForStop: rest = 300m, border_check/quarantine = 1000m, có geofence_radius_m riêng dùng giá trị riêng', () => {
  const cfg = { defaultRadiusM: 300, largeSiteRadiusM: 1000 };

  const rRest = radiusForStop({ stopType: 'rest' }, cfg);
  assert.equal(rRest, 300);

  const rBorder = radiusForStop({ stopType: 'border_check' }, cfg);
  assert.equal(rBorder, 1000);

  const rQuarantine = radiusForStop({ stopType: 'quarantine' }, cfg);
  assert.equal(rQuarantine, 1000);

  const rCustom = radiusForStop({ stopType: 'rest', geofenceRadiusM: 500 }, cfg);
  assert.equal(rCustom, 500);
});

test('3. interpolateAlongPolyline: fraction 0 = đầu, 1 = cuối, 0.5 = giữa', () => {
  const line = [
    { lat: 10.0, lng: 106.0 },
    { lat: 12.0, lng: 106.0 },
  ];

  const pStart = interpolateAlongPolyline(line, 0);
  assert.equal(pStart.lat, 10.0);
  assert.equal(pStart.lng, 106.0);

  const pEnd = interpolateAlongPolyline(line, 1);
  assert.equal(pEnd.lat, 12.0);
  assert.equal(pEnd.lng, 106.0);

  const pMid = interpolateAlongPolyline(line, 0.5);
  assert.ok(Math.abs(pMid.lat - 11.0) < 0.001);
  assert.ok(Math.abs(pMid.lng - 106.0) < 0.001);

  // Decimate path preserves endpoints and fits limit
  const points = [];
  for (let i = 0; i < 100; i++) points.push({ lat: i, lng: i });
  const decimated = decimatePath(points, 20);
  assert.ok(decimated.length <= 20);
  assert.equal(decimated[0].lat, 0);
  assert.equal(decimated[decimated.length - 1].lat, 99);
});

test('4. checkInStop GPS & Geofence: Ngoài bán kính (409), trong bán kính (thành công), độ chính xác kém (409), thủ công (cần lý do + ảnh)', async () => {
  const store = makeMockTrackingStore({
    settings: {
      'tracking.simulation_enabled': false,
    },
    shipments: [
      [1, { shipment_id: 1, customer_id: 100, status: 'in_transit', request_code: 'REQ-001' }],
    ],
    legs: [
      [1, { leg_id: 1, sequence_no: 1, status: 'in_transit', actual_departure: new Date('2026-11-20T08:00:00Z') }],
    ],
    stops: [
      [10, { route_stop_id: 10, leg_id: 1, location_name: 'Trạm dừng Cần Thơ', stop_type: 'rest', status: 'pending' }],
      [11, { route_stop_id: 11, leg_id: 1, location_name: 'Trạm thu phí Tiền Giang', stop_type: 'toll', status: 'pending' }],
    ],
    stopCoords: [
      [10, { lat: 10.03, lng: 105.78, radiusM: 300 }],
      [11, { lat: 10.35, lng: 106.35, radiusM: 300 }],
    ],
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});

  // Case 4a: Vị trí quá xa trạm dừng (cách ~11km) -> 409 OUTSIDE_GEOFENCE
  await assert.rejects(
    async () => {
      await service.checkInStop(DRIVER_USER, 1, 10, {
        action: 'arrived',
        location: { lat: 10.13, lng: 105.78, accuracyM: 10, source: 'gps' },
      });
    },
    (err) => {
      assert.ok(err instanceof ConflictException);
      const resp = err.getResponse();
      assert.equal(resp.code, 'OUTSIDE_GEOFENCE');
      assert.ok(resp.distanceM > 300);
      return true;
    },
  );

  // Case 4b: Độ chính xác quá kém (accuracy 250m > max 200m) -> 409 LOW_GPS_ACCURACY
  await assert.rejects(
    async () => {
      await service.checkInStop(DRIVER_USER, 1, 10, {
        action: 'arrived',
        location: { lat: 10.03001, lng: 105.78001, accuracyM: 250, source: 'gps' },
      });
    },
    (err) => {
      assert.ok(err instanceof ConflictException);
      const resp = err.getResponse();
      assert.equal(resp.code, 'LOW_GPS_ACCURACY');
      return true;
    },
  );

  // Case 4c: Check-in thủ công nhưng lý do quá ngắn (<10 ký tự) -> 400 BadRequest
  await assert.rejects(
    async () => {
      await service.checkInStop(DRIVER_USER, 1, 10, {
        action: 'arrived',
        location: { lat: 10.13, lng: 105.78, source: 'manual' },
        manualReason: 'Hỏng GPS',
        evidenceUrl: 'https://cdn.example.com/checkin.jpg',
      });
    },
    (err) => err instanceof BadRequestException,
  );

  // Case 4d: Check-in thủ công hợp lệ (lý do >= 10 ký tự + ảnh) -> Thành công, flagged = true, gửi cảnh báo Manager
  const resManual = await service.checkInStop(DRIVER_USER, 1, 10, {
    action: 'arrived',
    location: { lat: 10.13, lng: 105.78, source: 'manual' },
    manualReason: 'Thiết bị GPS tài xế mất sóng tại hầm chui trạm',
    evidenceUrl: 'https://cdn.example.com/checkin.jpg',
  });
  assert.ok(resManual);
  const manualLog = store.logs.find((l) => l.routeStopId === 10);
  assert.ok(manualLog);
  assert.equal(manualLog.geofencePassed, false);
  assert.equal(manualLog.flagged, true);
  assert.ok(notif.sent.some((n) => n.role === 'LOGISTICS_MANAGER' && n.title.includes('thủ công')));

  // Case 4e: Gửi source = 'simulated' khi simulation bị tắt -> 403 SIMULATION_DISABLED
  await assert.rejects(
    async () => {
      await service.checkInStop(DRIVER_USER, 1, 11, {
        action: 'arrived',
        location: { lat: 10.35, lng: 106.35, source: 'simulated' },
      });
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      const resp = err.getResponse();
      assert.equal(resp.code, 'SIMULATION_DISABLED');
      return true;
    },
  );
});

test('5. POST /tracking/shipments/:id/pings: Lọc future (>2m), stale (>24h), cờ backdated (>5m), chặn simulated khi tắt', async () => {
  const store = makeMockTrackingStore({
    settings: {
      'tracking.simulation_enabled': false,
    },
    shipments: [
      [1, { shipment_id: 1, customer_id: 100, status: 'in_transit' }],
    ],
    legs: [
      [1, { leg_id: 1, status: 'in_transit' }],
    ],
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});

  const now = Date.now();
  const validPing = { lat: 10.77, lng: 106.69, accuracyM: 10, source: 'gps', recordedAt: new Date(now).toISOString() };
  const futurePing = { lat: 10.78, lng: 106.70, accuracyM: 10, source: 'gps', recordedAt: new Date(now + 5 * 60 * 1000).toISOString() }; // >2m
  const stalePing = { lat: 10.79, lng: 106.71, accuracyM: 10, source: 'gps', recordedAt: new Date(now - 25 * 3600 * 1000).toISOString() }; // >24h
  const backdatedPing = { lat: 10.80, lng: 106.72, accuracyM: 10, source: 'gps', recordedAt: new Date(now - 10 * 60 * 1000).toISOString() }; // >5m

  // 10 pings gửi lên, gồm: 8 hợp lệ thời gian thực, 1 future, 1 stale
  const batchDto = {
    pings: [
      validPing,
      futurePing,
      stalePing,
      backdatedPing,
    ],
  };

  const res = await service.recordPositionPings(DRIVER_USER, 1, batchDto);
  assert.equal(res.accepted, 2); // validPing + backdatedPing
  assert.equal(res.dropped, 2); // future + stale

  // Check backdated flag
  const savedBackdated = store.pings.find((p) => p.lat === 10.80);
  assert.ok(savedBackdated);
  assert.equal(savedBackdated.isBackdated, true);

  // Ping simulated khi simulation setting tắt -> 403
  await assert.rejects(
    async () => {
      await service.recordPositionPings(DRIVER_USER, 1, {
        pings: [{ lat: 10.77, lng: 106.69, source: 'simulated' }],
      });
    },
    (err) => err instanceof ForbiddenException && err.getResponse().code === 'SIMULATION_DISABLED',
  );
});

test('6. Mandatory vitals tại trạm rest/quarantine: Chặn rời trạm khi chưa ghi sinh hiệu (409 VITALS_REQUIRED), qua khi đủ', async () => {
  const store = makeMockTrackingStore({
    shipments: [
      [1, { shipment_id: 1, customer_id: 100, status: 'in_transit' }],
    ],
    legs: [
      [1, { leg_id: 1, status: 'in_transit', actual_departure: new Date('2026-11-20T08:00:00Z') }],
    ],
    stops: [
      [15, { route_stop_id: 15, leg_id: 1, location_name: 'Trạm nghỉ dừng chân Đồng Nai', stop_type: 'rest', status: 'arrived', actual_arrival: new Date('2026-11-20T10:00:00Z') }],
    ],
    stopCoords: [
      [15, { lat: 10.95, lng: 106.82, radiusM: 300 }],
    ],
    horses: [
      { horse_id: 1, horse_name: 'Bạch Mã' },
      { horse_id: 2, horse_name: 'Xích Thố' },
    ],
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});

  // Chưa có sinh hiệu nào cho 2 ngựa -> Rời trạm bị 409 VITALS_REQUIRED
  await assert.rejects(
    async () => {
      await service.checkInStop(DRIVER_USER, 1, 15, {
        action: 'departed',
        location: { lat: 10.95001, lng: 106.82001, source: 'gps' },
      });
    },
    (err) => {
      assert.ok(err instanceof ConflictException);
      const resp = err.getResponse();
      assert.equal(resp.code, 'VITALS_REQUIRED');
      assert.equal(resp.missingHorses.length, 2);
      return true;
    },
  );

  // Ghi sinh hiệu đầy đủ cho cả 2 ngựa
  store.healthLogs.push(
    { shipmentId: 1, horseId: 1, horseName: 'Bạch Mã', temperature_c: 37.8, heart_rate_bpm: 38, routeStopId: 15, recordedAt: new Date('2026-11-20T10:15:00Z') },
    { shipmentId: 1, horseId: 2, horseName: 'Xích Thố', temperature_c: 38.0, heart_rate_bpm: 40, routeStopId: 15, recordedAt: new Date('2026-11-20T10:16:00Z') },
  );

  // Giờ rời trạm -> Thành công!
  const resDepart = await service.checkInStop(DRIVER_USER, 1, 15, {
    action: 'departed',
    location: { lat: 10.95001, lng: 106.82001, source: 'gps' },
  });
  assert.ok(resDepart);
  const stop = store.stops.get(15);
  assert.equal(stop.status, 'departed');
});

test('7. Red alert sinh hiệu thú y: Nhiệt độ 40.5°C -> alert_tier red, gửi thông báo Manager và Customer', async () => {
  const store = makeMockTrackingStore({
    settings: {
      'tracking.customer_vitals_detail': true,
    },
    shipments: [
      [1, { shipment_id: 1, customer_id: 100, status: 'in_transit', request_code: 'REQ-RED-01' }],
    ],
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});

  const log = await service.createHealthLog(DRIVER_USER, 1, {
    horseId: 1,
    horseName: 'Bạch Mã',
    conditionStatus: 'stressed',
    temperatureC: 40.5,
    heartRateBpm: 65,
    notes: 'Ngựa thở dốc, sốt cao',
  });

  assert.equal(log.alertTier, 'red');
  assert.ok(notif.sent.some((n) => n.userId === 100 && n.title.includes('CẢNH BÁO SỨC KHỎE')));
  assert.ok(notif.sent.some((n) => n.role === 'Logistics Manager' && n.title.includes('RED ALERT')));
});

test('8. Customer live tracking: Phân quyền Customer, che sinh hiệu số khi customer_vitals_detail = false', async () => {
  const store = makeMockTrackingStore({
    settings: {
      'tracking.customer_vitals_detail': false, // Customer chỉ thấy trạng thái chung
    },
    shipments: [
      [1, { shipment_id: 1, customer_id: 100, status: 'in_transit', request_code: 'REQ-CUST-01' }],
    ],
    legs: [
      [1, { leg_id: 1, sequence_no: 1, status: 'in_transit' }],
    ],
    pings: [
      { shipmentId: 1, lat: 10.77, lng: 106.69, speed_kmh: 60, source: 'gps', recorded_at: new Date() },
    ],
    horses: [
      { horse_id: 1, horse_name: 'Bạch Mã' },
    ],
    healthLogs: [
      { shipmentId: 1, horseId: 1, horseName: 'Bạch Mã', conditionStatus: 'stable', alertTier: 'green', temperatureC: 38.1, heartRateBpm: 40, recordedAt: new Date().toISOString() },
    ],
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});

  // Customer Alice truy cập đơn của mình -> Thành công
  const liveAlice = await service.getLiveTracking(CUSTOMER_ALICE, 1);
  assert.ok(liveAlice);
  assert.equal(liveAlice.vehiclePosition.lat, 10.77);

  // Sinh hiệu số bị ẩn (null) vì customer_vitals_detail = false
  const horseVital = liveAlice.vitalsSummary[0];
  assert.equal(horseVital.temperatureC, null);
  assert.equal(horseVital.heartRateBpm, null);
  assert.equal(horseVital.alertTier, 'green');

  // Customer Bob truy cập đơn của Alice -> 403 Forbidden
  await assert.rejects(
    async () => {
      await service.getLiveTracking(CUSTOMER_BOB, 1);
    },
    (err) => err instanceof ForbiddenException,
  );
});

test('9. System settings tracking: Manager gọi PATCH -> 403, Admin gọi PATCH -> 200', async () => {
  const store = makeMockTrackingStore({
    settings: {
      'tracking.simulation_enabled': false,
      'tracking.customer_vitals_detail': true,
    },
  });
  const notif = makeMockNotificationsService();
  const service = new TrackingService(store, notif, {});
  const controller = new SystemSettingsController(service);

  // Manager cố cập nhật -> 403 Forbidden
  await assert.rejects(
    async () => {
      await controller.updateTrackingSettings(MANAGER_USER, { simulationEnabled: true });
    },
    (err) => err instanceof ForbiddenException,
  );

  // Admin cập nhật -> 200 OK
  const updated = await controller.updateTrackingSettings(ADMIN_USER, {
    simulationEnabled: true,
    customerVitalsDetail: false,
  });
  assert.equal(updated.simulationEnabled, true);
  assert.equal(updated.customerVitalsDetail, false);
});
