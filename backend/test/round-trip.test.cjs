// Step 5 sau review 11/2026: Vận chuyển khứ hồi và chính sách no-show
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');

const {
  currentReturnPolicy,
  calculateReturnCancellationRefund,
  calculateRescheduleFee,
  canMarkNoShow,
} = require('../dist/modules/orders/return-policy');

const {
  calculateFreight,
} = require('../dist/modules/orders/pricing-policy');

const { QuotesService } = require('../dist/modules/orders/quotes.service');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const TEST_GPS = { lat: 10.8, lng: 106.7, accuracyM: 10, source: 'gps' }; // tài xế bắt buộc gửi vị trí khi check-in

const policy = currentReturnPolicy();

// 1. calculateReturnCancellationRefund: đúng 168 giờ → 80%; 167 giờ 59 phút → 50%; đúng 72 giờ → 50%; 71 giờ 59 phút → 0%; cause = company → 100% cước + 100% bảo hiểm
test('1. calculateReturnCancellationRefund: các mốc 168h, 167h59m, 72h, 71h59m và company', () => {
  const returnFreight = 10000000;
  const returnInsuranceFee = 2000000;
  const departureAt = new Date('2026-12-20T10:00:00.000Z');

  // a. Đúng 168 giờ trước giờ đón -> 80% cước chặng về + 100% bảo hiểm
  const exactly168h = new Date(departureAt.getTime() - 168 * 3600 * 1000);
  const res168 = calculateReturnCancellationRefund({
    returnFreight,
    returnInsuranceFee,
    returnDepartureAt: departureAt,
    cancelledAt: exactly168h,
    cause: 'customer',
    policy,
  });
  assert.equal(res168.refundPercent, 80);
  assert.equal(res168.freightRefund, 8000000);
  assert.equal(res168.insuranceRefund, 2000000);
  assert.equal(res168.total, 10000000);

  // b. 167 giờ 59 phút (167.9833 hours) -> 50% cước chặng về + 100% bảo hiểm
  const at167h59m = new Date(departureAt.getTime() - (167 * 3600 + 59 * 60) * 1000);
  const res167 = calculateReturnCancellationRefund({
    returnFreight,
    returnInsuranceFee,
    returnDepartureAt: departureAt,
    cancelledAt: at167h59m,
    cause: 'customer',
    policy,
  });
  assert.equal(res167.refundPercent, 50);
  assert.equal(res167.freightRefund, 5000000);
  assert.equal(res167.insuranceRefund, 2000000);
  assert.equal(res167.total, 7000000);

  // c. Đúng 72 giờ trước giờ đón -> 50% cước chặng về + 100% bảo hiểm
  const exactly72h = new Date(departureAt.getTime() - 72 * 3600 * 1000);
  const res72 = calculateReturnCancellationRefund({
    returnFreight,
    returnInsuranceFee,
    returnDepartureAt: departureAt,
    cancelledAt: exactly72h,
    cause: 'customer',
    policy,
  });
  assert.equal(res72.refundPercent, 50);
  assert.equal(res72.freightRefund, 5000000);
  assert.equal(res72.insuranceRefund, 2000000);
  assert.equal(res72.total, 7000000);

  // d. 71 giờ 59 phút -> 0% cước chặng về + 100% bảo hiểm
  const at71h59m = new Date(departureAt.getTime() - (71 * 3600 + 59 * 60) * 1000);
  const res71 = calculateReturnCancellationRefund({
    returnFreight,
    returnInsuranceFee,
    returnDepartureAt: departureAt,
    cancelledAt: at71h59m,
    cause: 'customer',
    policy,
  });
  assert.equal(res71.refundPercent, 0);
  assert.equal(res71.freightRefund, 0);
  assert.equal(res71.insuranceRefund, 2000000);
  assert.equal(res71.total, 2000000);

  // e. cause = company -> 100% cước + 100% bảo hiểm
  const resComp = calculateReturnCancellationRefund({
    returnFreight,
    returnInsuranceFee,
    returnDepartureAt: departureAt,
    cancelledAt: at71h59m,
    cause: 'company',
    policy,
  });
  assert.equal(resComp.refundPercent, 100);
  assert.equal(resComp.freightRefund, 10000000);
  assert.equal(resComp.insuranceRefund, 2000000);
  assert.equal(resComp.total, 12000000);
});

// 2. calculateRescheduleFee: >= 168 giờ miễn phí; < 168 giờ = 10% làm tròn
test('2. calculateRescheduleFee: >= 168 giờ miễn phí; < 168 giờ = 10% làm tròn', () => {
  const returnFreight = 15000000;
  const departureAt = new Date('2026-12-25T08:00:00.000Z');

  // >= 168h
  const freeAt = new Date(departureAt.getTime() - 200 * 3600 * 1000);
  const resFree = calculateRescheduleFee({
    returnFreight,
    returnDepartureAt: departureAt,
    requestedAt: freeAt,
    policy,
  });
  assert.equal(resFree.free, true);
  assert.equal(resFree.fee, 0);

  // < 168h
  const feeAt = new Date(departureAt.getTime() - 100 * 3600 * 1000);
  const resFee = calculateRescheduleFee({
    returnFreight,
    returnDepartureAt: departureAt,
    requestedAt: feeAt,
    policy,
  });
  assert.equal(resFee.free, false);
  assert.equal(resFee.fee, 1500000); // 10% of 15,000,000
});

// 3. canMarkNoShow: trước returnDepartureAt + 120 phút → false (kèm allowedAt), đúng mốc → true
test('3. canMarkNoShow: trước returnDepartureAt + 120 phút → false (kèm allowedAt), đúng mốc → true', () => {
  const returnDepartureAt = new Date('2026-12-20T08:00:00.000Z');
  const waitMinutes = 120;
  const allowedAtExpected = new Date('2026-12-20T10:00:00.000Z');

  // Trước 120 phút
  const beforeTime = new Date('2026-12-20T09:59:59.000Z');
  const resBefore = canMarkNoShow({
    returnDepartureAt,
    waitMinutes,
    now: beforeTime,
  });
  assert.equal(resBefore.allowed, false);
  assert.equal(resBefore.allowedAt.toISOString(), allowedAtExpected.toISOString());

  // Đúng mốc 120 phút
  const exactTime = new Date('2026-12-20T10:00:00.000Z');
  const resExact = canMarkNoShow({
    returnDepartureAt,
    waitMinutes,
    now: exactTime,
  });
  assert.equal(resExact.allowed, true);

  // Sau mốc 120 phút
  const afterTime = new Date('2026-12-20T10:30:00.000Z');
  const resAfter = canMarkNoShow({
    returnDepartureAt,
    waitMinutes,
    now: afterTime,
  });
  assert.equal(resAfter.allowed, true);
});

// 4. Báo giá khứ hồi: chặng về = giá chặng đảo chiều × 0,9 làm tròn lên 1.000; bảo hiểm = phí × 2 × 0,9
test('4. Báo giá khứ hồi: chặng về = giá đảo chiều × 0,9 làm tròn lên 1.000; bảo hiểm = phí × 2 × 0,9', async () => {
  const fakeStore = {
    findHorseById: async (id) => ({
      horseId: id,
      ownerId: 10,
      name: 'Chiến Mã',
      status: 'active',
      requiresPrivateStall: false,
    }),
    createQuote: async (data) => 501,
  };

  const fakePricingService = {
    previewPricing: async (dto) => {
      // Outbound (from A to B) total = 20,000,000
      // Return (from B to A) total = 20,000,000
      return {
        legs: [
          { key: 'main', from: dto.sample.origin.address, to: dto.sample.destination.address, distanceKm: 300, durationHours: 6, source: 'ors' },
        ],
        requiredStallSlots: 1,
        vehicles: [{ classCode: 'van_2', className: 'Xe Van 2 chỗ', count: 1, deadheadKm: 20 }],
        lines: [
          { code: 'freight', label: 'Cước vận chuyển', quantity: 1, unit: 'chuyến', unitPrice: 20000000, amount: 20000000 },
        ],
        subtotal: 20000000,
        rounding: 0,
        total: 20000000,
        tariffVersions: { road: 1 },
        warnings: [],
      };
    },
  };

  const quotesService = new QuotesService(fakeStore, fakePricingService);
  const user = { id: 10, role: 'customer' };

  // Chuyến đi ngày 2026-12-10, giờ về 2026-12-15 (sau 6h + 12h)
  const result = await quotesService.createQuote(user, {
    origin: { address: 'Trang trại A, Đồng Nai', lat: 10.95, lng: 106.82 },
    destination: { address: 'Trang trại B, Đà Lạt', lat: 11.94, lng: 108.45 },
    departureDate: '2026-12-10',
    transportMode: 'road',
    tripType: 'round_trip',
    returnDepartureAt: '2026-12-15T08:00:00.000Z',
    horses: [
      { horseId: 1, quantity: 1, declaredValue: 100000000, declaredCurrency: 'VND', insurancePackage: 'standard' },
    ],
  });

  assert.equal(result.tripType, 'round_trip');
  assert.equal(result.outbound.freight.total, 20000000);
  // Return freight: 20,000,000 * 0.9 = 18,000,000
  assert.equal(result.return.freight.total, 18000000);
  assert.equal(result.returnFreight, 18000000);

  // Insurance: one way standard for 100M VND = 1,500,000
  // Round trip insurance (-10% return leg, matching freight): 1,500,000 + Math.round(1,500,000 * 0.9) = 2,850,000
  assert.equal(result.insurance.total, 2850000);
  assert.equal(result.insurance.outboundTotal, 1500000);
  assert.equal(result.insurance.returnTotal, 1350000);

  // Grand total = 20,000,000 + 18,000,000 + 2,850,000 = 40,850,000
  assert.equal(result.total, 40850000);
});

// 5. Tạo đơn khứ hồi thiếu acceptReturnPolicy → 400; có → lưu snapshot
test('5. Tạo đơn khứ hồi thiếu acceptReturnPolicy → 400; có → lưu snapshot', async () => {
  let savedSnapshot = null;
  const fakeStore = {
    createShipment: async (customerId, dto) => {
      if (dto.tripType === 'round_trip' && !dto.acceptReturnPolicy) {
        throw new BadRequestException('Bạn phải đồng ý chính sách hủy chặng về và no-show để đặt chuyến khứ hồi');
      }
      savedSnapshot = currentReturnPolicy();
      return 101;
    },
    findShipmentById: async (id) => ({
      id,
      tripType: 'round_trip',
      returnPolicySnapshot: savedSnapshot,
      requestCode: 'REQ-101',
    }),
  };

  const fakeNotifications = {
    notifyRole: async () => {},
  };

  const ordersService = new OrdersService(fakeStore, fakeNotifications);
  ordersService.assertValidRequestedDate = async () => {};
  ordersService.getOrderCutoffPolicy = async () => ({ minLeadDays: 1, earliestDepartureDate: '2026-12-01' });

  const user = { id: 10, role: 'customer' };

  // Thiếu acceptReturnPolicy
  await assert.rejects(
    async () => {
      await ordersService.createOrder(user, {
        contactPhone: '0901234567',
        contactEmail: 'user@example.com',
        requestedHorseCount: 1,
        originLocation: 'A',
        destinationLocation: 'B',
        requestedDate: '2026-12-10T08:00:00.000Z',
        tripType: 'round_trip',
        acceptReturnPolicy: false,
        isLegacySeed: true,
      });
    },
    (err) => err instanceof BadRequestException && err.message.includes('đồng ý chính sách'),
  );

  // Có acceptReturnPolicy = true
  const order = await ordersService.createOrder(user, {
    contactPhone: '0901234567',
    contactEmail: 'user@example.com',
    requestedHorseCount: 1,
    originLocation: 'A',
    destinationLocation: 'B',
    requestedDate: '2026-12-10T08:00:00.000Z',
    tripType: 'round_trip',
    acceptReturnPolicy: true,
    isLegacySeed: true,
  });

  assert.equal(order.id, 101);
  assert.equal(order.tripType, 'round_trip');
  assert.ok(order.returnPolicySnapshot);
  assert.equal(order.returnPolicySnapshot.version, 'return-v1');
});

// 6. Hủy chặng về bởi khách khác chủ → 403; khi return_status = 'in_progress' → 409
test('6. Hủy chặng về bởi khách khác chủ → 403; khi return_status = in_progress → 409', async () => {
  const fakeStore = {
    findShipmentById: async (id) => ({
      id,
      customerId: 10,
      tripType: 'round_trip',
      returnStatus: id === 202 ? 'in_progress' : 'scheduled',
      returnDepartureAt: '2026-12-25T08:00:00.000Z',
      returnFreight: 10000000,
      returnInsuranceFee: 1000000,
      returnPolicySnapshot: policy,
    }),
    cancelReturnLeg: async () => {},
  };

  const fakeNotifications = {
    notifyRole: async () => {},
  };

  const ordersService = new OrdersService(fakeStore, fakeNotifications);

  // Khách khác chủ (user id 99 != 10) -> 403
  await assert.rejects(
    async () => {
      await ordersService.cancelReturnLegByCustomer({ id: 99, role: 'customer' }, 201, 'Bận việc');
    },
    (err) => err instanceof ForbiddenException,
  );

  // Khi return_status = in_progress -> 409
  await assert.rejects(
    async () => {
      await ordersService.cancelReturnLegByCustomer({ id: 10, role: 'customer' }, 202, 'Bận việc');
    },
    (err) => err instanceof ConflictException && err.message.includes('in_progress'),
  );
});

// 7. No-show bởi tài xế không được phân công → 403; quá sớm → 409; hợp lệ → completed, no-show = true
test('7. No-show bởi tài xế không phân công → 403; quá sớm → 409; hợp lệ → completed, return_no_show = true', async () => {
  let savedStatus = null;
  let savedReturnStatus = null;
  let savedNoShow = false;

  const fakeTrackingStore = {
    findShipmentById: async (id) => ({
      shipment_id: id,
      customer_id: 10,
      status: 'return_pending',
      trip_type: 'round_trip',
      return_status: 'scheduled',
      return_departure_at: '2026-12-20T08:00:00.000Z',
      return_wait_minutes: 120,
    }),
    findAssignedStaff: async (id) => [
      { user_id: 20, role_in_shipment: 'driver' },
    ],
    findUserById: async (id) => ({ id, full_name: 'Driver 1' }),
    findRouteByShipmentId: async () => ({ route_id: 1 }),
    markReturnNoShow: async (data) => {
      savedStatus = 'completed';
      savedReturnStatus = 'no_show';
      savedNoShow = true;
    },
    recordTripStatusLog: async () => {},
  };

  const fakeRoutesService = {};
  const fakeNotifications = {
    createNotification: async () => {},
    notifyRole: async () => {},
  };

  const trackingService = new TrackingService(fakeTrackingStore, fakeNotifications, fakeRoutesService);

  // a. Tài xế không được phân công (user id 99 != 20) -> 403
  await assert.rejects(
    async () => {
      await trackingService.markReturnNoShow({ id: 99, role: 'driver' }, 301, { notes: 'Không thấy khách' });
    },
    (err) => err instanceof ForbiddenException,
  );

  // b. Quá sớm: thử gọi khi chưa đủ 120 phút chờ
  // Giả lập giờ hiện tại là return_departure_at + 30 phút (trước 120 phút)
  const origDateNow = Date.now;
  try {
    Date.now = () => new Date('2026-12-20T08:30:00.000Z').getTime();
    await assert.rejects(
      async () => {
        await trackingService.markReturnNoShow({ id: 20, role: 'driver' }, 301, { notes: 'Chưa thấy khách' });
      },
      (err) => err instanceof ConflictException && err.getResponse().allowedAt !== undefined,
    );

    // c. Hợp lệ: giờ hiện tại là return_departure_at + 125 phút
    Date.now = () => new Date('2026-12-20T10:05:00.000Z').getTime();
    const result = await trackingService.markReturnNoShow({ id: 20, role: 'driver' }, 301, { notes: 'Đã chờ 125 phút' });
    assert.equal(result.success, true);
    assert.equal(result.returnStatus, 'no_show');
    assert.equal(result.shipmentStatus, 'completed');
    assert.equal(result.returnNoShow, true);
    assert.equal(savedStatus, 'completed');
    assert.equal(savedReturnStatus, 'no_show');
    assert.equal(savedNoShow, true);
  } finally {
    Date.now = origDateNow;
  }
});

// 8. Chặng đi xong với đơn khứ hồi → return_pending; đơn một chiều → completed như cũ
test('8. Chặng đi xong với đơn khứ hồi → return_pending; đơn một chiều → completed như cũ', async () => {
  let updatedShipmentStatus = null;

  const createTrackingService = (tripType) => {
    const legs = [
      { leg_id: 1, sequence_no: 1, direction: 'outbound', status: 'active', actual_departure: new Date() },
      ...(tripType === 'round_trip'
        ? [{ leg_id: 2, sequence_no: 2, direction: 'return', status: 'pending', actual_departure: null }]
        : []),
    ];

    const fakeTrackingStore = {
      findShipmentById: async (id) => ({
        shipment_id: id,
        customer_id: 10,
        status: 'in_transit',
        trip_type: tripType,
        destination_location: 'Đà Lạt',
      }),
      findAssignedStaff: async () => [{ user_id: 20 }],
      findRouteByShipmentId: async () => ({ route_id: 1, assigned_coordinator_id: 5 }),
      findLegsByRouteId: async () => legs,
      findStopsByRouteId: async () => [],
      findAssignedHorses: async () => [],
      findHorseHealthLogs: async () => [],
      findTripStatusLogs: async () => [],
      findUserById: async (id) => ({ id, full_name: 'Driver 1' }),
      findRouteDetailsById: async () => null,
      updateLegStatus: async () => {},
      updateShipmentStatus: async (id, st) => { updatedShipmentStatus = st; },
      updateShipmentReturnStatus: async () => {},
      updateRoutePlanStatus: async () => {},
      recordTripStatusLog: async () => {},
    };

    const fakeNotifications = {
      createNotification: async () => {},
      notifyRole: async () => {},
    };

    return new TrackingService(fakeTrackingStore, fakeNotifications, {});
  };

  const user = { id: 20, role: 'driver' };

  // a. Đơn khứ hồi: chặng 1 (outbound) hoàn thành -> return_pending
  const roundTripService = createTrackingService('round_trip');
  await roundTripService.checkInLegArrival(user, 401, 1, { location: TEST_GPS });
  assert.equal(updatedShipmentStatus, 'return_pending');

  // b. Đơn một chiều: chặng 1 (final leg) hoàn thành -> completed
  const oneWayService = createTrackingService('one_way');
  await oneWayService.checkInLegArrival(user, 402, 1, { location: TEST_GPS });
  assert.equal(updatedShipmentStatus, 'completed');
});

// 9. Đơn một chiều có chặng return khi lưu kế hoạch → 400
test('9. Đơn một chiều có chặng return khi lưu kế hoạch → 400', async () => {
  const fakeOrdersStore = {
    findById: async (id) => ({
      id,
      tripType: 'one_way', // Đơn một chiều
      requestedHorseCount: 1,
    }),
  };

  const fakeRoutesStore = {
    findRouteByShipmentId: async () => ({ id: 10, planStatus: 'draft' }),
    createRoute: async () => 10,
  };

  const fakeFleetStore = {
    findAllVehicles: async () => [],
  };

  const routesService = new RoutesService(fakeRoutesStore, fakeOrdersStore, fakeFleetStore, {}, {});

  const user = { id: 5, role: 'coordinator' };

  // Đơn một chiều chứa chặng direction: 'return' -> 400
  await assert.rejects(
    async () => {
      await routesService.buildDetailedPlan(user, 501, {
        routeName: 'Tuyến thử nghiệm',
        legs: [
          {
            sequenceNo: 1,
            legType: 'road',
            originLocation: 'A',
            destinationLocation: 'B',
            direction: 'return', // Bị cấm với đơn một chiều
          },
        ],
        stops: [],
      });
    },
    (err) => err instanceof BadRequestException && err.message.includes('chặng về'),
  );

  // Đơn khứ hồi nhưng không có chặng return nào -> 400
  fakeOrdersStore.findById = async (id) => ({
    id,
    tripType: 'round_trip', // Đơn khứ hồi
    requestedHorseCount: 1,
  });

  await assert.rejects(
    async () => {
      await routesService.buildDetailedPlan(user, 502, {
        routeName: 'Tuyến khứ hồi thiếu chặng về',
        legs: [
          {
            sequenceNo: 1,
            legType: 'road',
            originLocation: 'A',
            destinationLocation: 'B',
            direction: 'outbound',
          },
        ],
        stops: [],
      });
    },
    (err) => err instanceof BadRequestException && err.message.includes('phải có ít nhất 1 chặng về'),
  );
});
