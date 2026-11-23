// Step 3 sau review 11/2026: trạm xe, loại phương tiện + sức chứa, ngựa cần chuồng riêng chiếm 2 chỗ, bỏ gom chuyến.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, GoneException } = require('@nestjs/common');
const {
  PRIVATE_STALL_SLOTS,
  computeRequiredStallSlots,
  loadRequiredStallSlots,
  assertRoadCapacity,
} = require('../dist/modules/fleet/capacity-policy');
const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { RoadTripsController } = require('../dist/modules/fleet/road-trips.controller');
const {
  assertNewBookingType,
  resolveResubmitBookingType,
  normalizeBookingType,
} = require('../dist/modules/orders/booking-policy');

const CLASSES = {
  truck_1: { code: 'truck_1', mode: 'road', nameVi: 'Xe 1 chỗ', horseCapacity: 1 },
  truck_4: { code: 'truck_4', mode: 'road', nameVi: 'Xe 4 chỗ', horseCapacity: 4 },
  jet_stall: { code: 'jet_stall', mode: 'air', nameVi: 'Jet stall', horseCapacity: 3 },
  ferry_slot: { code: 'ferry_slot', mode: 'sea', nameVi: 'Phà', horseCapacity: null },
};
const DEPOTS = {
  1: { id: 1, code: 'VN-HCM-TD', name: 'Trạm Thủ Đức', isActive: true, vehicleCount: 2 },
  2: { id: 2, code: 'VN-CT', name: 'Trạm Cần Thơ', isActive: false, vehicleCount: 0 },
  3: { id: 3, code: 'TH-BKK', name: 'Đối tác Bangkok', isActive: true, vehicleCount: 0 },
};

function makeFleetStore() {
  const store = {
    created: [],
    updated: [],
    deletedDepots: [],
    findAllVehicles: async () => [{ id: 9, plateOrCode: '51C-000.01' }],
    findVehicleById: async (id) => ({ id, plateOrCode: 'X', capacity: 4, vehicleClassCode: 'truck_4' }),
    findVehicleClassByCode: async (code) => CLASSES[code],
    findDepotById: async (id) => DEPOTS[id],
    findDepotByCode: async (code) => Object.values(DEPOTS).find((d) => d.code === code.toUpperCase()),
    createVehicle: async (input) => { store.created.push(input); return 50; },
    updateVehicle: async (id, patch) => { store.updated.push({ id, patch }); },
    deleteDepot: async (id) => { store.deletedDepots.push(id); },
  };
  return store;
}
const makeFleetService = (store) => new FleetService(store, {}, { createNotification: async () => 1 });

test('Số chỗ chuồng: ngựa cần chuồng riêng chiếm 2 chỗ; không có ngựa thì dùng số ngựa của đơn', () => {
  assert.equal(PRIVATE_STALL_SLOTS, 2);
  assert.equal(computeRequiredStallSlots([{ quantity: 1 }, { quantity: 1, requiresPrivateStall: true }]), 3);
  assert.equal(computeRequiredStallSlots([{ quantity: 2, requiresPrivateStall: true }]), 4);
  assert.equal(computeRequiredStallSlots([], 3), 3);
  assert.equal(computeRequiredStallSlots([{ quantity: null }]), 1);
});

test('loadRequiredStallSlots đọc shipment_horse + horse.requires_private_stall', async () => {
  const db = { execute: async (sql, params) => {
    assert.match(sql, /FROM shipment_horse/);
    assert.deepEqual(params, [7]);
    return [[{ quantity: 1, requires_private_stall: 1 }, { quantity: 2, requires_private_stall: 0 }]];
  } };
  assert.equal(await loadRequiredStallSlots(db, 7, 3), 4);
});

test('3 ngựa trong đó 1 ngựa cần chuồng riêng không vừa xe 3 chỗ, vừa xe 4 chỗ', () => {
  const slots = computeRequiredStallSlots([{ quantity: 2 }, { quantity: 1, requiresPrivateStall: true }]);
  assert.throws(() => assertRoadCapacity(slots, [1], [{ id: 1, capacity: 3 }]), /đủ 4 chỗ chuồng/);
  assert.doesNotThrow(() => assertRoadCapacity(slots, [2], [{ id: 2, capacity: 4 }]));
});

test('Tạo xe theo loại: vehicleType và sức chứa lấy từ loại, bỏ qua capacity gửi lên', async () => {
  const store = makeFleetStore();
  await makeFleetService(store).createVehicle({ plateOrCode: '51C-123.45', vehicleClassCode: 'truck_4', depotId: 1, capacity: 99 });
  assert.deepEqual(
    { type: store.created[0].vehicleType, cap: store.created[0].capacity, cls: store.created[0].vehicleClassCode, depot: store.created[0].depotId },
    { type: 'truck', cap: 4, cls: 'truck_4', depot: 1 },
  );
});

test('Loại không cố định sức chứa (phà) bắt buộc nhập capacity; jet stall map sang aircraft_stall', async () => {
  const store = makeFleetStore();
  const service = makeFleetService(store);
  await assert.rejects(service.createVehicle({ plateOrCode: 'FERRY-1', vehicleClassCode: 'ferry_slot' }), BadRequestException);
  await service.createVehicle({ plateOrCode: 'FERRY-2', vehicleClassCode: 'ferry_slot', capacity: 6 });
  await service.createVehicle({ plateOrCode: 'JS-1', vehicleClassCode: 'jet_stall' });
  assert.equal(store.created[0].vehicleType, 'container');
  assert.equal(store.created[0].capacity, 6);
  assert.equal(store.created[1].vehicleType, 'aircraft_stall');
  assert.equal(store.created[1].depotId, null);
});

test('Xe đường bộ phải thuộc trạm đang hoạt động; loại không tồn tại bị từ chối', async () => {
  const service = makeFleetService(makeFleetStore());
  await assert.rejects(service.createVehicle({ plateOrCode: 'A', vehicleClassCode: 'truck_1' }), /phải thuộc một trạm/);
  await assert.rejects(service.createVehicle({ plateOrCode: 'B', vehicleClassCode: 'truck_1', depotId: 2 }), /tạm ngưng/);
  await assert.rejects(service.createVehicle({ plateOrCode: 'C', vehicleClassCode: 'truck_1', depotId: 404 }), /không tồn tại/);
  await assert.rejects(service.createVehicle({ plateOrCode: 'D', vehicleClassCode: 'rocket', depotId: 1 }), /không có trong danh mục/);
});

test('Đổi loại xe cập nhật sức chứa theo loại; chuyển trạm được kiểm tra', async () => {
  const store = makeFleetStore();
  const service = makeFleetService(store);
  await service.updateVehicle(5, { vehicleClassCode: 'truck_1', depotId: 3 });
  assert.equal(store.updated[0].patch.capacity, 1);
  assert.equal(store.updated[0].patch.vehicleType, 'truck');
  assert.equal(store.updated[0].patch.depotId, 3);
  await assert.rejects(service.updateVehicle(5, { depotId: 2 }), /tạm ngưng/);
});

test('Trạm: trùng mã trả 409; còn xe thì không cho xóa; trạm trống xóa được', async () => {
  const store = makeFleetStore();
  const service = makeFleetService(store);
  await assert.rejects(
    service.createDepot({ code: 'vn-hcm-td', name: 'X', country: 'Vietnam', city: 'HCM', lat: 1, lng: 1 }),
    ConflictException,
  );
  await assert.rejects(service.deleteDepot(1), /còn 2 xe/);
  await service.deleteDepot(3);
  assert.deepEqual(store.deletedDepots, [3]);
});

test('Bỏ gom chuyến: đơn mới luôn bao chuyến, gửi shared_stall trả 400', () => {
  assert.equal(normalizeBookingType(), 'dedicated_charter');
  assert.equal(assertNewBookingType(undefined), 'dedicated_charter');
  assert.equal(assertNewBookingType('dedicated_charter'), 'dedicated_charter');
  assert.throws(() => assertNewBookingType('shared_stall'), BadRequestException);
});

test('Gửi lại đơn cũ: giữ ghép chuyến nếu không đổi, được đổi sang bao chuyến, không được đổi sang ghép', () => {
  assert.equal(resolveResubmitBookingType(undefined, 'shared_stall'), 'shared_stall');
  assert.equal(resolveResubmitBookingType('shared_stall', 'shared_stall'), 'shared_stall');
  assert.equal(resolveResubmitBookingType('dedicated_charter', 'shared_stall'), 'dedicated_charter');
  assert.throws(() => resolveResubmitBookingType('shared_stall', 'dedicated_charter'), BadRequestException);
});

test('POST /fleet/road-trips trả 410 Gone; danh sách vẫn xem được', async () => {
  const controller = new RoadTripsController({ list: async () => [{ id: 1 }], create: async () => assert.fail('must not create') });
  assert.throws(() => controller.create({ id: '1' }, {}), GoneException);
  assert.deepEqual(await controller.list(), [{ id: 1 }]);
});
