// Step 9 (review 11/2026): phân bổ nhiều xe, giữ chỗ xe, trạm đối tác, giờ cấm đô thị, ETA có nghỉ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConflictException } = require('@nestjs/common');

const { generateAllocationOptions, jetStallCount, vesselPenCount } = require('../dist/modules/fleet/allocation-policy');
const {
  isBannedAt,
  nextAllowedTime,
  allowedWindowsForDate,
  toLocal,
  localToUtc,
} = require('../dist/modules/fleet/city-restriction-policy');
const { estimateJourney } = require('../dist/modules/fleet/journey-time-policy');
const { reserveVehicles, releaseShipmentReservations } = require('../dist/modules/fleet/vehicle-reservation');
const { applyConvoyCapacity } = require('../dist/modules/fleet/capacity-policy');
const { transitionShipment } = require('../dist/modules/orders/order-state-machine');
const { calculateFreight } = require('../dist/modules/orders/pricing-policy');
const { PricingService } = require('../dist/modules/orders/pricing.service');
const { QuoteAllocationService } = require('../dist/modules/orders/quote-allocation.service');

const ROAD_VN = {
  openingFeePerVehicle: 2000000,
  distanceTiers: [
    { upToKm: 100, pricePerKm: 45000 },
    { upToKm: 500, pricePerKm: 35000 },
    { upToKm: null, pricePerKm: 28000 },
  ],
  careFeePerHorse: 500000,
  deadheadPerKm: 15000,
  nightSurchargePerVehicle: 1000000,
  borderCrossingFee: 3000000,
  roundingUnit: 1000,
  averageSpeedKmh: 50,
};
const ROAD_PARTNER = {
  ...ROAD_VN,
  openingFeePerVehicle: 3000000,
  distanceTiers: [
    { upToKm: 100, pricePerKm: 54000 },
    { upToKm: 500, pricePerKm: 42000 },
    { upToKm: null, pricePerKm: 33600 },
  ],
  deadheadPerKm: 18000,
};
const AIR = { baseFeePerHorse: 60000000, pricePerKmPerHorse: 25000, airportHandlingPerHorse: 5000000, privateStallMultiplier: 1.5, roundingUnit: 1000, averageSpeedKmh: 700 };

const truck = (id, classCode, capacity, coef, heavy) => ({
  vehicleId: id, plate: `51C-${id}`, classCode, className: classCode, capacity, priceCoefficient: coef, isHeavyTruck: heavy,
});
const truck1 = (id) => truck(id, 'truck_1', 1, 1.0, false);
const truck4 = (id) => truck(id, 'truck_4', 4, 1.3, true);

// Ví dụ C3: 3 ngựa thường, 300 km (main), deadhead 20 km
const horses3 = [{ horseId: 1, quantity: 3, requiresPrivateStall: false }];
const priceC3 = (vehicles) =>
  calculateFreight(
    { mode: 'road', horses: horses3, vehicles: vehicles.map((v) => ({ ...v })), roadLegs: [{ key: 'main', distanceKm: 300, borderCrossings: 0 }] },
    { road: ROAD_VN },
  ).total;
const depot = (id, name, deadheadKm, vehicles) => ({ depotId: id, depotName: name, deadheadKm, vehicles });

test('1. Ví dụ C3: 1 xe 4 chỗ = 18.750.000; 3 xe 1 chỗ = 42.900.000; chỉ 1 xe 1 chỗ → chia 3 ngày', () => {
  const a = generateAllocationOptions({ requiredSlots: 3, horseCount: 3, depots: [depot(1, 'Thủ Đức', 20, [truck1(1), truck4(2)])], priceVehicleSet: priceC3 });
  assert.equal(a.recommended, 'cheapest');
  const cheapest = a.options.find((o) => o.optionCode === 'cheapest');
  assert.equal(cheapest.totalFreight, 18750000);
  assert.deepEqual(cheapest.vehicles.map((v) => v.classCode), ['truck_4']);

  const b = generateAllocationOptions({ requiredSlots: 3, horseCount: 3, depots: [depot(1, 'Thủ Đức', 20, [truck1(1), truck1(2), truck1(3)])], priceVehicleSet: priceC3 });
  const threeSmall = b.options.find((o) => o.vehicles.length === 3);
  assert.ok(threeSmall, 'phải có phương án 3 xe 1 chỗ');
  assert.equal(threeSmall.totalFreight, 42900000);

  const c = generateAllocationOptions({ requiredSlots: 3, horseCount: 3, depots: [depot(1, 'Thủ Đức', 20, [truck1(1)])], priceVehicleSet: priceC3 });
  assert.equal(c.options.length, 1);
  assert.equal(c.options[0].optionCode, 'split_days');
  assert.equal(c.options[0].vehicles[0].trips, 3);
  assert.equal(c.options[0].extraDays, 2);
  assert.equal(c.options[0].totalFreight, 42900000); // chưa cộng chạy rỗng quay đầu (turnaroundCost mặc định 0)
  const withTurnaround = generateAllocationOptions({
    requiredSlots: 3, horseCount: 3, depots: [depot(1, 'Thủ Đức', 20, [truck1(1)])], priceVehicleSet: priceC3, turnaroundCost: () => 4500000,
  });
  assert.equal(withTurnaround.options[0].totalFreight, 42900000 + 2 * 4500000);
});

test('2. Ngựa chuồng riêng: 2 thường + 1 chuồng riêng = 4 chỗ → xe 4 chỗ; xe 3 chỗ không được chọn', () => {
  const required = 2 + 2;
  const r = generateAllocationOptions({
    requiredSlots: required, horseCount: 3,
    depots: [depot(1, 'Trạm A', 10, [truck(1, 'truck_3', 3, 1.2, true), truck4(2)])],
    priceVehicleSet: (vs) => vs.reduce((s, v) => s + v.capacity * 1000, 0),
  });
  for (const o of r.options) {
    assert.ok(!o.vehicles.some((v) => v.classCode === 'truck_3' && o.vehicles.length === 1), 'xe 3 chỗ một mình không đủ');
    assert.ok(o.vehicles.reduce((s, v) => s + v.capacity * v.trips, 0) >= required);
  }
  assert.deepEqual(r.options[0].vehicles.map((v) => v.classCode), ['truck_4']);
});

test('3. Không trạm nào đủ → two_depots; vẫn không đủ → split_days; không có xe → options rỗng', () => {
  const two = generateAllocationOptions({
    requiredSlots: 2, horseCount: 2,
    depots: [depot(1, 'Gần', 10, [truck1(1)]), depot(2, 'Xa', 40, [truck1(2)])],
    priceVehicleSet: priceC3,
  });
  assert.equal(two.options[0].optionCode, 'two_depots');
  assert.deepEqual(new Set(two.options[0].vehicles.map((v) => v.depotId)), new Set([1, 2]));

  const split = generateAllocationOptions({
    requiredSlots: 3, horseCount: 3,
    depots: [depot(1, 'Gần', 10, [truck1(1)]), depot(2, 'Xa', 40, [truck1(2)])],
    priceVehicleSet: priceC3,
  });
  assert.deepEqual(split.options.map((o) => o.optionCode), ['split_days']);

  const none = generateAllocationOptions({ requiredSlots: 3, horseCount: 3, depots: [depot(1, 'Rỗng', 5, [])], priceVehicleSet: priceC3 });
  assert.deepEqual(none.options, []);
  assert.equal(none.recommended, null);
  assert.equal(none.shortageSlots, 3);
});

test('4. Gộp phương án trùng tập xe; tối đa 3 phương án; earliest = trạm gần nhất', () => {
  const many = generateAllocationOptions({
    requiredSlots: 4, horseCount: 4,
    depots: [
      depot(1, 'Gần, đắt', 5, [truck1(1), truck1(2), truck1(3), truck1(4)]),
      depot(2, 'Xa, rẻ', 50, [truck4(5)]),
      depot(3, 'Rất xa', 90, [truck(6, 'truck_6', 6, 1.6, true), truck(7, 'truck_2', 2, 1.0, false), truck(8, 'truck_2', 2, 1.0, false)]),
    ],
    priceVehicleSet: (vs) => vs.reduce((s, v) => s + 2000000 + 10000000 * v.priceCoefficient + v.deadheadKm * 15000, 0),
  });
  assert.ok(many.options.length <= 3);
  const keys = many.options.map((o) => o.vehicles.map((v) => v.vehicleId).sort().join(','));
  assert.equal(new Set(keys).size, keys.length, 'không có phương án trùng');
  const earliest = many.options.find((o) => o.optionCode === 'earliest');
  if (earliest) assert.equal(earliest.maxDeadheadKm, 5);

  const same = generateAllocationOptions({ requiredSlots: 3, horseCount: 3, depots: [depot(1, 'A', 20, [truck4(2)])], priceVehicleSet: priceC3 });
  assert.equal(same.options.length, 1, 'cheapest = fewest = earliest được gộp làm một');
});

test('5. jetStallCount và vesselPenCount', () => {
  assert.equal(jetStallCount([{ quantity: 3, requiresPrivateStall: false }]), 1);
  assert.equal(jetStallCount([{ quantity: 4, requiresPrivateStall: false }]), 2);
  assert.equal(jetStallCount([{ quantity: 2, requiresPrivateStall: false }, { quantity: 1, requiresPrivateStall: true }]), 2);
  assert.equal(jetStallCount([{ quantity: 1, requiresPrivateStall: true }]), 1);
  assert.equal(vesselPenCount([{ quantity: 2 }, { quantity: 1, requiresPrivateStall: true }]), 4);
});

const HCM = {
  city: 'Hồ Chí Minh', centerLat: 10.7769, centerLng: 106.7009, radiusKm: 12, appliesToHeavyTruck: true,
  bannedFrom: '06:00', bannedTo: '22:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], effectiveFrom: '2025-01-01', isActive: true,
};
const HOLIDAY = [{ city: 'Hồ Chí Minh', exceptionDate: '2026-04-30', bannedFrom: '04:00', bannedTo: '11:30' }];
const QUAN_1 = { lat: 10.7757, lng: 106.7004 };
const BINH_DUONG = { lat: 11.1, lng: 106.65 };

test('6. Giờ cấm: Quận 1 lúc 09:00 → dời 22:00 (đêm); 23:00 không dời; ngoài bán kính / xe nhẹ không dời; qua nửa đêm; ngày lễ', () => {
  const nineAm = localToUtc('2026-12-10', '09:00');
  const r = nextAllowedTime(nineAm, QUAN_1, true, [HCM], HOLIDAY);
  assert.equal(r.shifted, true);
  assert.equal(r.isNight, true);
  assert.deepEqual(toLocal(r.allowedAt), { date: '2026-12-10', time: '22:00', isoWeekday: 4 });
  assert.match(r.reasonVi, /22:00/);

  const elevenPm = localToUtc('2026-12-10', '23:00');
  const r2 = nextAllowedTime(elevenPm, QUAN_1, true, [HCM], HOLIDAY);
  assert.equal(r2.shifted, false);
  assert.equal(r2.isNight, true);

  assert.equal(nextAllowedTime(nineAm, BINH_DUONG, true, [HCM]).shifted, false, 'ngoài bán kính');
  assert.equal(nextAllowedTime(nineAm, QUAN_1, false, [HCM]).shifted, false, 'xe không nặng');

  // Khung cấm qua nửa đêm 22:00 → 05:00
  const overnight = { ...HCM, bannedFrom: '22:00', bannedTo: '05:00' };
  assert.equal(isBannedAt({ date: '2026-12-10', time: '23:30', isoWeekday: 4 }, [overnight]).banned, true);
  const early = isBannedAt({ date: '2026-12-11', time: '03:00', isoWeekday: 5 }, [overnight]);
  assert.equal(early.banned, true);
  assert.deepEqual(early.until, { date: '2026-12-11', time: '05:00' });
  assert.equal(isBannedAt({ date: '2026-12-11', time: '12:00', isoWeekday: 5 }, [overnight]).banned, false);
  assert.deepEqual(allowedWindowsForDate('2026-12-11', QUAN_1, true, [overnight]), [{ from: '05:00', to: '22:00' }]);

  // Ngày lễ 30/4: lịch ngoại lệ 04:00–11:30 thay cho khung thường
  assert.equal(isBannedAt({ date: '2026-04-30', time: '05:00', isoWeekday: 4 }, [HCM], HOLIDAY).banned, true);
  assert.equal(isBannedAt({ date: '2026-04-30', time: '13:00', isoWeekday: 4 }, [HCM], HOLIDAY).banned, false);
  const holidayShift = nextAllowedTime(localToUtc('2026-04-30', '09:00'), QUAN_1, true, [HCM], HOLIDAY);
  assert.equal(toLocal(holidayShift.allowedAt).time, '11:30');
  assert.equal(holidayShift.isNight, false);
  assert.deepEqual(allowedWindowsForDate('2026-12-10', QUAN_1, true, [HCM]), [{ from: '00:00', to: '06:00' }, { from: '22:00', to: '24:00' }]);
});

test('7. Quy đổi múi giờ: 02:00 UTC = 09:00 Asia/Ho_Chi_Minh', () => {
  assert.equal(toLocal(new Date('2026-12-10T02:00:00Z')).time, '09:00');
  assert.equal(localToUtc('2026-12-10', '09:00').toISOString(), '2026-12-10T02:00:00.000Z');
  assert.equal(toLocal(new Date('2026-12-10T17:30:00Z')).date, '2026-12-11');
});

test('8. estimateJourney: 10 giờ lái → 1 điểm nghỉ; 30 giờ → có nghỉ bắt buộc 24 giờ', () => {
  const ten = estimateJourney({ driveHours: 10 });
  assert.equal(ten.restStops, 1);
  assert.equal(ten.mandatoryRests, 0);
  assert.equal(ten.totalHours, 11);
  const thirty = estimateJourney({ driveHours: 30 });
  assert.equal(thirty.mandatoryRests, 1);
  assert.ok(thirty.totalHours >= 30 + 24);
  assert.ok(thirty.breakdownVi.some((l) => l.includes('24 giờ')));
  assert.equal(estimateJourney({ driveHours: 5 }).restStops, 0);
});

/** DB giả mô phỏng bảng vehicle_reservation + khóa xe. */
function reservationDb() {
  const state = { reservations: [], shipments: { 1: 'awaiting_payment', 2: 'awaiting_payment' }, locks: [] };
  const exec = async (sql, params = []) => {
    if (sql.includes('FROM vehicle WHERE vehicle_id IN')) {
      state.locks.push(params.slice());
      return [params.map((id) => ({ vehicle_id: id, status: 'available' }))];
    }
    if (sql.includes('FROM vehicle_reservation vr JOIN shipment s')) {
      const n = params.length - 3;
      const ids = params.slice(0, n).map(Number);
      const [exclude, end, start] = params.slice(n);
      const inactive = ['completed', 'cancelled', 'cancelled_operational', 'rejected', 'refunded', 'refund_requested'];
      return [state.reservations
        .filter((r) => ids.includes(r.vehicle_id) && r.shipment_id !== exclude && ['active', 'consumed'].includes(r.status)
          && !inactive.includes(state.shipments[r.shipment_id]) && r.start < end && r.end > start)
        .map((r) => ({ vehicle_id: r.vehicle_id }))];
    }
    if (sql.includes('FROM route_leg l')) return [[]];
    if (sql.includes('INSERT INTO vehicle_reservation')) {
      const [shipment_id, vehicle_id, direction, start, end] = params;
      state.reservations.push({ shipment_id, vehicle_id, direction, start, end, status: 'active' });
      return [{ insertId: state.reservations.length }];
    }
    if (sql.includes("UPDATE vehicle_reservation SET status = 'released'")) {
      const [reason, shipmentId] = params;
      for (const r of state.reservations) {
        if (r.shipment_id === shipmentId && ['active', 'consumed'].includes(r.status)) Object.assign(r, { status: 'released', reason });
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT status, payment_flow')) return [[{ status: state.shipments[params[0]], payment_flow: 'prepaid' }]];
    if (sql.includes('UPDATE shipment SET status = ?')) {
      state.shipments[params[1]] = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO shipment_status_history')) return [{ insertId: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { state, execute: exec, query: exec };
}

test('9. Giữ chỗ: 2 đơn cùng xe cùng khung giờ → đơn thứ 2 bị 409; đơn hết hạn → reservation released', async () => {
  const db = reservationDb();
  const start = new Date('2026-12-10T00:00:00Z');
  const end = new Date('2026-12-10T12:00:00Z');
  await reserveVehicles(db, { shipmentId: 1, vehicleIds: [7, 3], start, end });
  assert.deepEqual(db.state.locks[0], [3, 7], 'khóa xe theo vehicle_id ASC');
  await assert.rejects(
    reserveVehicles(db, { shipmentId: 2, vehicleIds: [3], start: new Date('2026-12-10T06:00:00Z'), end: new Date('2026-12-10T20:00:00Z') }),
    (err) => err instanceof ConflictException && /báo giá lại/.test(err.message),
  );
  // Khung giờ không trùng thì giữ được
  await reserveVehicles(db, { shipmentId: 2, vehicleIds: [3], start: new Date('2026-12-11T00:00:00Z'), end: new Date('2026-12-11T10:00:00Z') });

  // Hết hạn thanh toán: awaiting_payment → cancelled qua state machine → nhả xe
  await transitionShipment(db, { shipmentId: 1, to: 'cancelled', actorId: null, actorRole: 'SYSTEM', reasonCode: 'payment_expired' });
  const mine = db.state.reservations.filter((r) => r.shipment_id === 1);
  assert.ok(mine.every((r) => r.status === 'released' && r.reason === 'payment_expired'));
  // Sau khi nhả, đơn khác giữ lại được xe 3 trong khung cũ
  await reserveVehicles(db, { shipmentId: 2, vehicleIds: [3], start, end });

  // Nhả thủ công cũng bỏ qua khi bảng chưa migrate
  await releaseShipmentReservations({ execute: async () => { const e = new Error("Table 'vehicle_reservation' doesn't exist"); e.code = 'ER_NO_SUCH_TABLE'; throw e; } }, 9, 'x');

  // Đoàn xe đã giữ chỗ: xe dẫn đầu được tính tổng sức chứa của đoàn
  const convoy = applyConvoyCapacity([{ id: 1, capacity: 1 }, { id: 9, capacity: 1 }], [
    { vehicleId: 1, capacity: 1, direction: 'outbound' }, { vehicleId: 2, capacity: 1, direction: 'outbound' }, { vehicleId: 3, capacity: 1, direction: 'outbound' },
  ]);
  assert.equal(convoy.find((v) => v.id === 1).capacity, 3);
  assert.equal(convoy.find((v) => v.id === 9).capacity, 1);
});

test('10. Chặng giao ở nước ngoài dùng trạm partner gần nhất + tariff PARTNER; giờ cấm cộng phụ phí đêm', async () => {
  const airports = [
    { id: 1, code: 'SGN', name: 'Tân Sơn Nhất', lat: 10.8188, lng: 106.6519 },
    { id: 2, code: 'SIN', name: 'Changi', lat: 1.3644, lng: 103.9915 },
  ];
  const pricingStore = {
    getActiveTariffs: async (region) => region === 'PARTNER'
      ? { road: { params: ROAD_PARTNER, version: 1 }, air: null, sea: null }
      : { road: { params: ROAD_VN, version: 1 }, air: { params: AIR, version: 1 }, sea: null },
    getAirportsWithEquineRamp: async () => airports,
  };
  const distance = { getRoadDistance: async (a, b) => ({ distanceKm: 20, durationHours: 0.5, source: 'estimated' }) };
  const pricing = new PricingService(pricingStore, distance);
  const allocationStore = {
    getSetting: async () => null,
    listRestrictionRules: async () => [HCM],
    listRestrictionExceptions: async () => [],
    findActiveDepots: async (type) => type === 'partner'
      ? [
          { depotId: 20, code: 'TH-BKK', name: 'Đối tác Bangkok', country: 'Thailand', city: 'Bangkok', lat: 13.7563, lng: 100.5018, type: 'partner' },
          { depotId: 21, code: 'SG-SIN', name: 'Đối tác Singapore', country: 'Singapore', city: 'Singapore', lat: 1.3521, lng: 103.8198, type: 'partner' },
        ]
      : [{ depotId: 1, code: 'VN-HCM-TD', name: 'Trạm Thủ Đức', country: 'Vietnam', city: 'HCM', lat: 10.8494, lng: 106.7537, type: 'own' }],
    findAvailableVehiclesByDepot: async () => [
      { depotId: 1, depotCode: 'VN-HCM-TD', depotName: 'Trạm Thủ Đức', country: 'Vietnam', city: 'HCM', lat: 10.8494, lng: 106.7537, vehicles: [truck(11, 'truck_2', 2, 1.0, false), truck4(12)] },
    ],
  };
  const service = new QuoteAllocationService(pricing, distance, allocationStore);
  const result = await service.allocate({
    mode: 'air',
    origin: { address: 'Quận 1, TP.HCM', country: 'Vietnam', ...QUAN_1 },
    destination: { address: 'Singapore', country: 'Singapore', lat: 1.3, lng: 103.85 },
    horses: [{ quantity: 2, requiresPrivateStall: false }],
    pickupAt: localToUtc('2026-12-10', '09:00'),
  });
  assert.equal(result.partnerDepot.name, 'Đối tác Singapore');
  assert.equal(result.context.tariffs.partnerRoad.openingFeePerVehicle, 3000000);
  assert.equal(result.jetStallsRequired, 1);
  assert.ok(result.options.length >= 1);
  const lightOpt = result.options.find((o) => o.vehicles.every((v) => !v.isHeavyTruck));
  assert.ok(lightOpt, 'xe 2 chỗ (không nặng) là một phương án');
  const fromHubOpening = lightOpt.freight.lines.find((l) => l.code === 'from_hub_vehicle_1_opening');
  assert.equal(fromHubOpening.amount, 3000000, 'chặng từ sân bay đến tính theo bảng giá đối tác');
  const fromHubDeadhead = lightOpt.freight.lines.find((l) => l.code === 'from_hub_vehicle_1_deadhead');
  assert.equal(fromHubDeadhead.amount, 20 * 18000);
  // Xe không nặng: không bị dời giờ, không phụ phí đêm
  assert.equal(lightOpt.pickupShifted, false);
  assert.equal(lightOpt.nightSurcharge, false);

  // Không có trạm đối tác trong 300 km → tariff VN + cảnh báo
  const noPartner = new QuoteAllocationService(pricing, distance, { ...allocationStore, findActiveDepots: async () => [] });
  const r2 = await noPartner.allocate({
    mode: 'air',
    origin: { address: 'Quận 1', country: 'Vietnam', ...QUAN_1 },
    destination: { address: 'Singapore', country: 'Singapore', lat: 1.3, lng: 103.85 },
    horses: [{ quantity: 2, requiresPrivateStall: false }],
    pickupAt: localToUtc('2026-12-10', '09:00'),
  });
  assert.ok(r2.warnings.includes('NO_PARTNER_DEPOT'));
  assert.equal(r2.context.tariffs.partnerRoad, undefined);

  // Đường bộ, chỉ có xe tải nặng, đón Quận 1 lúc 9h → dời 22h + phụ phí đêm
  const heavyOnly = new QuoteAllocationService(pricing, distance, {
    ...allocationStore,
    findAvailableVehiclesByDepot: async () => [
      { depotId: 1, depotCode: 'VN-HCM-TD', depotName: 'Trạm Thủ Đức', country: 'Vietnam', city: 'HCM', lat: 10.8494, lng: 106.7537, vehicles: [truck4(12)] },
    ],
  });
  const r3 = await heavyOnly.allocate({
    mode: 'road',
    origin: { address: 'Quận 1', country: 'Vietnam', ...QUAN_1 },
    destination: { address: 'Đà Lạt', country: 'Vietnam', lat: 11.94, lng: 108.45 },
    horses: [{ quantity: 3, requiresPrivateStall: false }],
    pickupAt: localToUtc('2026-12-10', '09:00'),
  });
  const opt = r3.options[0];
  assert.equal(opt.pickupShifted, true);
  assert.ok(opt.warnings.includes('PICKUP_SHIFTED_CITY_BAN'));
  assert.equal(toLocal(new Date(opt.pickupAt)).time, '22:00');
  assert.equal(opt.nightSurcharge, true);
  assert.ok(opt.freight.lines.some((l) => l.code === 'main_vehicle_1_night' && l.amount === 1000000));

  // Không có xe → options rỗng + gợi ý ngày (tối đa 3)
  let calls = 0;
  const empty = new QuoteAllocationService(pricing, distance, {
    ...allocationStore,
    findAvailableVehiclesByDepot: async () => {
      calls += 1;
      return calls >= 3 ? [{ depotId: 1, depotCode: 'X', depotName: 'Trạm', country: 'Vietnam', city: 'HCM', lat: 10.85, lng: 106.75, vehicles: [truck4(12)] }] : [];
    },
  });
  const r4 = await empty.allocate({
    mode: 'road',
    origin: { address: 'Thủ Đức', country: 'Vietnam', lat: 10.85, lng: 106.76 },
    destination: { address: 'Đà Lạt', country: 'Vietnam', lat: 11.94, lng: 108.45 },
    horses: [{ quantity: 3, requiresPrivateStall: false }],
    pickupAt: localToUtc('2026-12-10', '09:00'),
  });
  assert.deepEqual(r4.options, []);
  assert.equal(r4.shortage.suggestedDates.length, 3);
  assert.equal(r4.shortage.suggestedDates[0], '2026-12-12');
});
