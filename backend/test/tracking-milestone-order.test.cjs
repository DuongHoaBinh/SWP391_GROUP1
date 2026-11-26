// Flow 4: mốc hành trình chỉ đi tiến, đúng thứ tự, đúng trạng thái chuyến (TC01, TC03, TC05, TC06, TC10).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');

const driver = { id: '17', role: 'DRIVER_ESCORT', email: 'driver@example.com', fullName: 'Tài xế 1' };
const manager = { id: '2', role: 'LOGISTICS_MANAGER', email: 'manager@example.com', fullName: 'Manager' };
const GPS = { lat: 11.9, lng: 108.4, accuracyM: 10, source: 'gps' };
const status = (code) => (e) => e.getStatus?.() === code;

function make({ shipmentStatus = 'in_transit', legs, stops = [], horses = [{ horse_id: 1, name: 'Xích Thố' }] }) {
  const calls = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 10, customer_id: 12, status: shipmentStatus, request_code: 'REQ-010' }),
    findAssignedStaff: async () => [{ user_id: 17, role_in_shipment: 'driver', full_name: 'Tài xế 1' }],
    findRouteByShipmentId: async () => ({ route_id: 1, plan_status: 'in_transit' }),
    findLegsByRouteId: async () => legs.map((l) => ({ ...l })),
    findStopsByRouteId: async () => stops.map((s) => ({ ...s })),
    findLegCoordinates: async () => null,
    findStopCoordinates: async () => null,
    getSetting: async () => null,
    updateLegStatus: async (...a) => calls.push(['leg', ...a]),
    updateStopStatus: async (id, st) => calls.push(['stop', id, st]),
    updateShipmentStatus: async (...a) => calls.push(['shipment', ...a]),
    updateRoutePlanStatus: async () => {},
    recordTripStatusLog: async (l) => calls.push(['log', l.milestoneType, l.flagged]),
    saveVehiclePositionPings: async () => {},
    findHorsesInOrder: async () => horses,
    findAssignedHorses: async () => horses,
    findHealthLogsForStop: async () => [],
    findLatestHealthLogForHorse: async () => null,
    createHorseHealthLog: async (d) => { calls.push(['health', d.horseId]); return 1; },
    findHorseHealthLogs: async () => [],
  };
  const routes = { getTripPlanReadiness: async () => ({ isReadyToDepart: true, pendingConditions: [] }) };
  const svc = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, routes);
  svc.syncSiblingLegStart = async () => {};
  svc.syncSiblingStopCheckIn = async () => {};
  svc.resolveStaffActor = async () => ({ displayName: 'Tài xế 1' });
  svc.getTrackingDetails = async () => 'ok';
  return { svc, calls };
}

const pendingLeg = { leg_id: 1, sequence_no: 1, leg_type: 'road', status: 'pending', actual_departure: null, origin_location: 'A', destination_location: 'B' };
const activeLeg = { ...pendingLeg, status: 'active', actual_departure: new Date() };
const stop = (id, seq, st = 'pending', extra = {}) => ({ route_stop_id: id, leg_id: 1, sequence_no: seq, stop_type: 'refuel', status: st, location_name: `Trạm ${seq}`, ...extra });

// TC01
test('TC01: tài xế check-in không gửi vị trí → 400 LOCATION_REQUIRED', async () => {
  const { svc, calls } = make({ shipmentStatus: 'ready_to_depart', legs: [pendingLeg] });
  await assert.rejects(svc.checkInLegStart(driver, 10, 1, {}), (e) => e.getStatus?.() === 400 && e.response?.code === 'LOCATION_REQUIRED');
  assert.equal(calls.length, 0);
});

test('TC01: tài xế check-in thủ công kèm lý do + ảnh vẫn được (mất GPS)', async () => {
  const { svc, calls } = make({ shipmentStatus: 'ready_to_depart', legs: [pendingLeg] });
  await svc.checkInLegStart(driver, 10, 1, {
    location: { lat: 0, lng: 0, source: 'manual' }, manualReason: 'Mất sóng GPS trong hầm', evidenceUrl: '/uploads/documents/x.jpg',
  });
  assert.ok(calls.some((c) => c[0] === 'log' && c[2] === true), 'check-in thủ công phải bị gắn cờ');
});

test('TC01: Manager cập nhật thay (coordinator-override) không cần vị trí, log bị gắn cờ', async () => {
  const { svc, calls } = make({ shipmentStatus: 'ready_to_depart', legs: [pendingLeg] });
  await svc.coordinatorOverrideMilestone(manager, 10, { milestoneId: 'leg-1-start', notes: 'Tài xế mất sóng, gọi hotline' });
  assert.ok(calls.some((c) => c[0] === 'log' && c[1] === 'leg_departure' && c[2] === true));
});

// TC03
for (const leg of [
  { label: 'đã hoàn thành', data: { ...pendingLeg, status: 'completed', actual_departure: new Date(), actual_arrival: new Date() } },
  { label: 'đang chạy', data: activeLeg },
]) {
  test(`TC03: xuất phát lại chặng ${leg.label} → 409, không ghi đè giờ xuất phát`, async () => {
    const { svc, calls } = make({ legs: [leg.data] });
    await assert.rejects(svc.checkInLegStart(driver, 10, 1, { location: GPS }), status(409));
    assert.ok(!calls.some((c) => c[0] === 'leg'));
  });
}

// TC05
test('TC05: tới trạm #2 khi trạm #1 chưa xong → 409', async () => {
  const { svc, calls } = make({ legs: [activeLeg], stops: [stop(101, 1), stop(102, 2)] });
  await assert.rejects(svc.checkInStop(driver, 10, 102, { action: 'arrived', location: GPS }), status(409));
  assert.ok(!calls.some((c) => c[0] === 'stop'));
});

test('TC05: đi đúng thứ tự (trạm #1 đã rời / đã thông quan) → tới trạm #2 được', async () => {
  for (const done of ['departed', 'customs_cleared']) {
    const { svc, calls } = make({ legs: [activeLeg], stops: [stop(101, 1, done), stop(102, 2)] });
    await svc.checkInStop(driver, 10, 102, { action: 'arrived', location: GPS });
    assert.ok(calls.some((c) => c[0] === 'stop' && c[1] === 102 && c[2] === 'arrived'));
  }
});

test('TC05: trạm chặng về không bị chặn bởi trạm chặng đi chưa xong', async () => {
  const { svc, calls } = make({
    legs: [activeLeg],
    stops: [stop(101, 1, 'pending', { direction: 'outbound' }), stop(201, 2, 'pending', { direction: 'return' })],
  });
  await svc.checkInStop(driver, 10, 201, { action: 'arrived', location: GPS });
  assert.ok(calls.some((c) => c[0] === 'stop' && c[1] === 201));
});

// TC06
for (const st of ['completed', 'cancelled_operational', 'refunded', 'planning']) {
  test(`TC06: check-in trạm khi đơn "${st}" → 409`, async () => {
    const { svc, calls } = make({ shipmentStatus: st, legs: [activeLeg], stops: [stop(101, 1)] });
    await assert.rejects(svc.checkInStop(driver, 10, 101, { action: 'arrived', location: GPS }), status(409));
    assert.ok(!calls.some((c) => c[0] === 'stop'));
  });
}

test('TC06: xác nhận đến chặng khi đơn đã hủy vận hành → 409', async () => {
  const { svc } = make({ shipmentStatus: 'cancelled_operational', legs: [activeLeg] });
  await assert.rejects(svc.checkInLegArrival(driver, 10, 1, { location: GPS }), status(409));
});

// TC10
for (const st of ['cancelled', 'cancelled_operational', 'refund_requested', 'refunded', 'awaiting_payment', 'paid_pending_review', 'completed', 'confirmed']) {
  test(`TC10: ghi sức khỏe khi đơn "${st}" → 409`, async () => {
    const { svc, calls } = make({ shipmentStatus: st, legs: [activeLeg] });
    await assert.rejects(
      svc.createHealthLog(driver, 10, { horseId: 1, horseName: 'Xích Thố', conditionStatus: 'stable', temperatureC: 38, heartRateBpm: 36 }),
      status(409),
    );
    assert.ok(!calls.some((c) => c[0] === 'health'));
  });
}

for (const st of ['ready_to_depart', 'in_transit', 'return_pending']) {
  test(`TC10: ghi sức khỏe khi đơn "${st}" vẫn được`, async () => {
    const { svc, calls } = make({ shipmentStatus: st, legs: [activeLeg] });
    await svc.createHealthLog(driver, 10, { horseId: 1, horseName: 'Xích Thố', conditionStatus: 'stable', temperatureC: 38, heartRateBpm: 36 });
    assert.ok(calls.some((c) => c[0] === 'health'));
  });
}
