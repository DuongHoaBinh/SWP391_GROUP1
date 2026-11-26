// Flow 4: DTO đầu vào trước đây là interface nên ValidationPipe bỏ qua; dữ liệu sai gây lỗi 500 ở DB.
// Test chạy đúng ValidationPipe như main.ts (whitelist + transform) và các kiểm tra ở TrackingService.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const dto = require('../dist/modules/tracking/dto/tracking-input.dto');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const validate = (metatype, value) => pipe.transform(value, { type: 'body', metatype });
const rejects400 = (p) => assert.rejects(p, (e) => e.getStatus?.() === 400);

// --- Check-in mốc ---
test('TC04: check-in trạm với action lạ "teleport" → 400', async () => {
  await rejects400(validate(dto.CheckInStopDto, { action: 'teleport' }));
});

test('Check-in trạm hợp lệ giữ đủ field UI gửi (không bị whitelist xóa)', async () => {
  const body = {
    action: 'arrived',
    actualTime: '2026-11-26T08:00:00.000Z',
    notes: 'tới trạm',
    location: { lat: 0, lng: 0, source: 'manual' },
    manualReason: 'Mất sóng GPS tại trạm',
    evidenceUrl: '/uploads/documents/a.jpg',
  };
  const out = await validate(dto.CheckInStopDto, body);
  assert.deepEqual({ ...out, location: { ...out.location } }, body);
});

test('Vị trí ngoài phạm vi / nguồn lạ / actualTime sai định dạng → 400', async () => {
  await rejects400(validate(dto.CheckInLegDto, { location: { lat: 200, lng: 10 } }));
  await rejects400(validate(dto.CheckInLegDto, { location: { lat: 10, lng: 10, source: 'teleport' } }));
  await rejects400(validate(dto.CheckInLegDto, { location: { lat: 'abc', lng: 10 } }));
  await rejects400(validate(dto.CheckInLegDto, { actualTime: 'hôm qua' }));
});

test('Override: action stop sai → 400; thiếu action vẫn hợp lệ; giữ field reason', async () => {
  await rejects400(validate(dto.CoordinatorOverrideDto, { milestoneId: 'stop-1', action: 'fly' }));
  const out = await validate(dto.CoordinatorOverrideDto, { milestoneId: 'leg-1-start', reason: 'mất sóng', notes: 'x' });
  assert.equal(out.reason, 'mất sóng');
});

// --- Nhật ký sức khỏe ---
test('TC12: tình trạng "dancing", nhiệt độ "abc", nhịp tim âm → 400', async () => {
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: 'A', conditionStatus: 'dancing' }));
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: 'A', conditionStatus: 'stable', temperatureC: 'abc' }));
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: 'A', conditionStatus: 'stable', heartRateBpm: -5 }));
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: 'A', conditionStatus: 'stable', temperatureC: 60 }));
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: '', conditionStatus: 'stable' }));
  await rejects400(validate(dto.CreateHealthLogDto, { horseName: 'A', conditionStatus: 'stable', attachments: ['1', '2', '3', '4', '5', '6'] }));
});

test('Nhật ký sức khỏe hợp lệ từ UI giữ đủ field', async () => {
  const body = {
    horseId: 1, horseName: 'Xích Thố', legName: '#2 - Trạm nghỉ', conditionStatus: 'stressed',
    temperatureC: 38.2, heartRateBpm: 44, notes: 'hơi căng thẳng',
    attachments: ['/api/tracking/health-logs/attachments/1700000000-123.jpg'],
  };
  const out = await validate(dto.CreateHealthLogDto, body);
  assert.deepEqual({ ...out }, body);
});

test('Ping GPS: >100 điểm hoặc source lạ → 400; ping hợp lệ (không recordedAt) được giữ', async () => {
  const many = Array.from({ length: 101 }, () => ({ lat: 10, lng: 106, source: 'gps' }));
  await rejects400(validate(dto.PositionPingBatchDto, { pings: many }));
  await rejects400(validate(dto.PositionPingBatchDto, { pings: [{ lat: 10, lng: 106, source: 'manual' }] }));
  const out = await validate(dto.PositionPingBatchDto, { pings: [{ lat: 10, lng: 106, source: 'gps', speedKmh: null }] });
  assert.equal(out.pings.length, 1);
});

// --- Kiểm tra ở service ---
function makeService({ horses = [{ horse_id: 1, name: 'Xích Thố' }, { horse_id: 2, name: 'Bạch Long' }] } = {}) {
  const created = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 10, customer_id: 12, status: 'in_transit', request_code: 'REQ-010' }),
    findAssignedStaff: async () => [{ user_id: 17, role_in_shipment: 'driver' }],
    findRouteByShipmentId: async () => null,
    findAssignedHorses: async () => horses,
    findLatestHealthLogForHorse: async () => null,
    getSetting: async () => null,
    createHorseHealthLog: async (d) => { created.push(d); return created.length; },
    findHorseHealthLogs: async () => created.map((d, i) => ({ id: i + 1, ...d })),
  };
  const svc = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, {});
  return { svc, created };
}
const driver = { id: '17', role: 'DRIVER_ESCORT', email: 'driver@example.com' };
const base = { horseName: 'Xích Thố', conditionStatus: 'stable', temperatureC: 38, heartRateBpm: 36 };

test('TC11: ghi sức khỏe cho ngựa không thuộc chuyến → 400', async () => {
  const { svc, created } = makeService();
  await rejects400(svc.createHealthLog(driver, 10, { ...base, horseId: 999, horseName: 'Ngựa lạ' }));
  await rejects400(svc.createHealthLog(driver, 10, { ...base, horseId: undefined, horseName: 'Không có' }));
  assert.equal(created.length, 0);
});

test('Ngựa đúng chuyến: lưu theo horseId và tên chuẩn trong hồ sơ; thiếu horseId thì khớp theo tên', async () => {
  const { svc, created } = makeService();
  await svc.createHealthLog(driver, 10, { ...base, horseId: 2, horseName: 'tên client gửi sai' });
  await svc.createHealthLog(driver, 10, { ...base, horseId: undefined, horseName: 'xích thố' });
  assert.deepEqual(created.map((c) => [c.horseId, c.horseName]), [[2, 'Bạch Long'], [1, 'Xích Thố']]);
});

test('TC13: ảnh đính kèm scheme nguy hiểm / đường dẫn lạ → 400; ảnh upload và URL http(s) hợp lệ', async () => {
  const { svc, created } = makeService();
  for (const bad of [
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/api/tracking/health-logs/attachments/../../.env',
    '/uploads/documents/x.pdf',
    'file:///etc/passwd',
  ]) {
    await rejects400(svc.createHealthLog(driver, 10, { ...base, horseId: 1, attachments: [bad] }));
  }
  assert.equal(created.length, 0);
  await svc.createHealthLog(driver, 10, {
    ...base, horseId: 1,
    attachments: ['/api/tracking/health-logs/attachments/1700000000-123.jpg', 'https://cdn.example.com/horse.jpg'],
  });
  assert.equal(created.length, 1);
});

test('TC09: recordedAt ở tương lai → 400; lệch đồng hồ ≤ 5 phút vẫn nhận', async () => {
  const { svc, created } = makeService();
  await rejects400(svc.createHealthLog(driver, 10, { ...base, horseId: 1, recordedAt: new Date(Date.now() + 2 * 3600e3).toISOString() }));
  await svc.createHealthLog(driver, 10, { ...base, horseId: 1, recordedAt: new Date(Date.now() + 60e3).toISOString() });
  assert.equal(created.length, 1);
});

test('TC09: check-in mốc với actualTime ở tương lai → 400', async () => {
  const { svc } = makeService();
  assert.throws(
    () => svc.evaluateEventTimestamp(new Date(Date.now() + 2 * 3600e3).toISOString(), 'nhập trước'),
    (e) => e.getStatus?.() === 400,
  );
  assert.doesNotThrow(() => svc.evaluateEventTimestamp(new Date(Date.now() + 60e3).toISOString()));
});
