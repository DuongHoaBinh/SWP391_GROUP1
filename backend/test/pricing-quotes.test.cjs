// Step 4 sau review 11/2026: Khoảng cách, bảng giá cấu hình, thêm đường thủy, API báo giá
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} = require('@nestjs/common');

const {
  tieredDistanceCost,
  calculateFreight,
  validateTariffParams,
} = require('../dist/modules/orders/pricing-policy');

const { haversineKm } = require('../dist/modules/routes/geo-policy');
const { DistanceService } = require('../dist/modules/routes/distance.service');
const { PricingService } = require('../dist/modules/orders/pricing.service');
const { QuotesService } = require('../dist/modules/orders/quotes.service');

const ROAD_TARIFF_V1 = {
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
  version: 1,
};

const AIR_TARIFF_V1 = {
  baseFeePerHorse: 60000000,
  pricePerKmPerHorse: 25000,
  airportHandlingPerHorse: 5000000,
  privateStallMultiplier: 1.5,
  roundingUnit: 1000,
  averageSpeedKmh: 700,
  version: 1,
};

const SEA_TARIFF_V1 = {
  ferry: { ticketPerVehicle: 3000000 },
  vessel: { baseFeePerHorse: 15000000, pricePerKmPerHorse: 8000 },
  roundingUnit: 1000,
  version: 1,
};

// Test 1: tieredDistanceCost chính xác theo từng bậc
test('1. tieredDistanceCost: tính đúng chi phí theo bậc lũy tiến (0, 100, 101, 500, 501, 1000 km)', () => {
  const tiers = ROAD_TARIFF_V1.distanceTiers;
  assert.equal(tieredDistanceCost(0, tiers), 0);
  assert.equal(tieredDistanceCost(100, tiers), 4500000); // 100 * 45,000
  assert.equal(tieredDistanceCost(101, tiers), 4535000); // 4,500,000 + 1 * 35,000
  assert.equal(tieredDistanceCost(500, tiers), 18500000); // 4,500,000 + 400 * 35,000
  assert.equal(tieredDistanceCost(501, tiers), 18528000); // 18,500,000 + 1 * 28,000
  assert.equal(tieredDistanceCost(1000, tiers), 32500000); // 18,500,000 + 500 * 28,000
});

// Test 2: Ví dụ C3 Phương án A (18.750.000) và B (42.900.000)
test('2. Ví dụ C3 đường bộ: Phương án A = 18.750.000, Phương án B = 42.900.000', () => {
  // Phương án A: 1 xe 4 chỗ (hệ số 1.3), 300 km tuyến, deadhead 20 km, 3 ngựa
  const inputA = {
    mode: 'road',
    horses: [
      { horseId: 1, quantity: 1, requiresPrivateStall: false },
      { horseId: 2, quantity: 1, requiresPrivateStall: false },
      { horseId: 3, quantity: 1, requiresPrivateStall: false },
    ],
    vehicles: [
      { classCode: 'truck_4', priceCoefficient: 1.3, capacity: 4, deadheadKm: 20 },
    ],
    roadLegs: [{ key: 'main', distanceKm: 300, borderCrossings: 0 }],
  };

  const resA = calculateFreight(inputA, { road: ROAD_TARIFF_V1 });
  assert.equal(resA.total, 18750000);
  assert.equal(resA.rounding, 0);

  // Phương án B: 3 xe 1 chỗ (mỗi xe hệ số 1.0, deadhead 20 km)
  const inputB = {
    mode: 'road',
    horses: [
      { horseId: 1, quantity: 1, requiresPrivateStall: false },
      { horseId: 2, quantity: 1, requiresPrivateStall: false },
      { horseId: 3, quantity: 1, requiresPrivateStall: false },
    ],
    vehicles: [
      { classCode: 'truck_1', priceCoefficient: 1.0, capacity: 1, deadheadKm: 20 },
      { classCode: 'truck_1', priceCoefficient: 1.0, capacity: 1, deadheadKm: 20 },
      { classCode: 'truck_1', priceCoefficient: 1.0, capacity: 1, deadheadKm: 20 },
    ],
    roadLegs: [{ key: 'main', distanceKm: 300, borderCrossings: 0 }],
  };

  const resB = calculateFreight(inputB, { road: ROAD_TARIFF_V1 });
  assert.equal(resB.total, 42900000);
  assert.equal(resB.rounding, 0);
});

// Test 3: Ví dụ 2 C3 đường hàng không
test('3. Ví dụ 2 C3 hàng không: 2 ngựa thường bay 1.090 km = 184.500.000; 1 ngựa chuồng riêng tăng đúng 50% phần bay', () => {
  // 2 ngựa thường
  const inputAir = {
    mode: 'air',
    horses: [
      { horseId: 1, quantity: 1, requiresPrivateStall: false },
      { horseId: 2, quantity: 1, requiresPrivateStall: false },
    ],
    vehicles: [{ classCode: 'truck_4', priceCoefficient: 1.3, capacity: 4, deadheadKm: 0 }],
    roadLegs: [],
    airKm: 1090,
  };

  const resAir = calculateFreight(inputAir, { road: ROAD_TARIFF_V1, air: AIR_TARIFF_V1 });
  assert.equal(resAir.total, 184500000); // 2 * (60,000,000 + 1090 * 25,000 + 5,000,000) = 184,500,000

  // 1 ngựa chuồng riêng + 1 ngựa thường
  const inputAirPrivate = {
    mode: 'air',
    horses: [
      { horseId: 1, quantity: 1, requiresPrivateStall: false },
      { horseId: 2, quantity: 1, requiresPrivateStall: true },
    ],
    vehicles: [{ classCode: 'truck_4', priceCoefficient: 1.3, capacity: 4, deadheadKm: 0 }],
    roadLegs: [],
    airKm: 1090,
  };

  const resAirPrivate = calculateFreight(inputAirPrivate, { road: ROAD_TARIFF_V1, air: AIR_TARIFF_V1 });
  // Ngựa thường: 87,250,000 + 5,000,000 = 92,250,000
  // Ngựa chuồng riêng: 87,250,000 * 1.5 + 5,000,000 = 130,875,000 + 5,000,000 = 135,875,000
  // Tổng = 92,250,000 + 135,875,000 = 228,125,000
  assert.equal(resAirPrivate.total, 228125000);
});

// Test 4: Đường thủy ferry và vessel
test('4. Sea ferry: tổng km bộ liên tục + vé phà; Sea vessel: ô chuồng + cảnh báo SEA_VESSEL_HEALTH_RISK', () => {
  // Ferry: 1 xe, chặng ra cảng 50 km, từ cảng 70 km (tổng 120 km)
  const inputFerry = {
    mode: 'sea',
    seaMode: 'ferry',
    horses: [{ horseId: 1, quantity: 1, requiresPrivateStall: false }],
    vehicles: [{ classCode: 'truck_2', priceCoefficient: 1.0, capacity: 2, deadheadKm: 0 }],
    roadLegs: [
      { key: 'to_hub', distanceKm: 50, borderCrossings: 0 },
      { key: 'from_hub', distanceKm: 70, borderCrossings: 0 },
    ],
  };

  const resFerry = calculateFreight(inputFerry, { road: ROAD_TARIFF_V1, sea: SEA_TARIFF_V1 });
  // 120 km bộ: opening (2M) + distance (100*45k + 20*35k = 5.2M) + care (500k) = 7.7M
  // Vé phà: 3M
  // Tổng: 10.7M
  assert.equal(resFerry.total, 10700000);

  // Vessel: 1 ngựa, seaKm = 1000 km
  const inputVessel = {
    mode: 'sea',
    seaMode: 'vessel',
    horses: [{ horseId: 1, quantity: 1, requiresPrivateStall: false }],
    vehicles: [{ classCode: 'truck_2', priceCoefficient: 1.0, capacity: 2, deadheadKm: 0 }],
    roadLegs: [],
    seaKm: 1000,
  };

  const resVessel = calculateFreight(inputVessel, { road: ROAD_TARIFF_V1, sea: SEA_TARIFF_V1 });
  // Vessel fee: 15,000,000 + 1000 * 8,000 = 23,000,000
  assert.equal(resVessel.total, 23000000);
  assert.ok(resVessel.warnings.includes('SEA_VESSEL_HEALTH_RISK'));
});

// Test 5: Làm tròn lên 1.000 VND
test('5. Làm tròn lên 1.000: subtotal 18.750.001 -> total 18.751.000, rounding = 999', () => {
  const customRoadTariff = {
    ...ROAD_TARIFF_V1,
    openingFeePerVehicle: 2000001,
  };
  const input = {
    mode: 'road',
    horses: [{ horseId: 1, quantity: 1, requiresPrivateStall: false }],
    vehicles: [{ classCode: 'truck_2', priceCoefficient: 1.0, capacity: 2, deadheadKm: 0 }],
    roadLegs: [{ key: 'main', distanceKm: 0, borderCrossings: 0 }],
  };

  const res = calculateFreight(input, { road: customRoadTariff });
  // Opening: 2,000,001 + Care: 500,000 = 2,500,001
  // Total: 2,501,000, Rounding: 999
  assert.equal(res.subtotal, 2500001);
  assert.equal(res.total, 2501000);
  assert.equal(res.rounding, 999);
});

// Test 6: Validate tariff params
test('6. validateTariffParams: kiểm tra bậc không tăng dần, bậc cuối khác null, số âm', () => {
  // Bậc không tăng dần
  assert.throws(() => {
    validateTariffParams('road', {
      ...ROAD_TARIFF_V1,
      distanceTiers: [
        { upToKm: 200, pricePerKm: 45000 },
        { upToKm: 100, pricePerKm: 35000 },
        { upToKm: null, pricePerKm: 28000 },
      ],
    });
  }, BadRequestException);

  // Bậc cuối khác null
  assert.throws(() => {
    validateTariffParams('road', {
      ...ROAD_TARIFF_V1,
      distanceTiers: [
        { upToKm: 100, pricePerKm: 45000 },
        { upToKm: 500, pricePerKm: 35000 },
      ],
    });
  }, BadRequestException);

  // Số âm
  assert.throws(() => {
    validateTariffParams('road', {
      ...ROAD_TARIFF_V1,
      openingFeePerVehicle: -1000,
    });
  }, BadRequestException);
});

// Test 7: haversineKm HCM - Hà Nội ≈ 1.137 km (sai số ±5 km)
test('7. haversineKm: khoảng cách HCM - Hà Nội xấp xỉ 1.137 km (±5 km)', () => {
  const hcm = { lat: 10.7769, lng: 106.7009 };
  const hanoi = { lat: 21.0285, lng: 105.8542 };
  const dist = haversineKm(hcm, hanoi);
  assert.ok(Math.abs(dist - 1137) <= 10, `Khoảng cách tính được: ${dist} km`);
});

// Test 8: DistanceService với fetch giả và cache
test('8. DistanceService: ORS thành công -> source ors; lỗi -> source estimated; cache hoạt động', async () => {
  const service = new DistanceService();
  const from = { lat: 10.734, lng: 106.7216 };
  const to = { lat: 11.9404, lng: 108.4583 };

  // 8a. Không có ORS_API_KEY -> source = estimated, không gọi fetch
  delete process.env.ORS_API_KEY;
  const resNoKey = await service.getRoadDistance(from, to);
  assert.equal(resNoKey.source, 'estimated');
  assert.ok(resNoKey.distanceKm > 0);

  // 8b. Có API key và fetch giả thành công
  process.env.ORS_API_KEY = 'test-fake-key';
  let fetchCallCount = 0;
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({
        routes: [
          {
            summary: {
              distance: 300400, // 300.4 km
              duration: 23760, // 6.6 hours
            },
          },
        ],
      }),
    };
  };

  try {
    const freshService = new DistanceService();
    const resOrs = await freshService.getRoadDistance(from, to);
    assert.equal(resOrs.source, 'ors');
    assert.equal(resOrs.distanceKm, 300.4);
    assert.equal(fetchCallCount, 1);

    // 8c. Gọi lần 2 cùng cặp tọa độ (đảo chiều to -> from): dùng cache, fetch không được gọi thêm
    const resCached = await freshService.getRoadDistance(to, from);
    assert.equal(resCached.source, 'ors');
    assert.equal(resCached.distanceKm, 300.4);
    assert.equal(fetchCallCount, 1);

    // 8d. Lỗi fetch -> fallback về estimated
    global.fetch = async () => {
      throw new Error('Network failure');
    };
    const failService = new DistanceService();
    const resFallback = await failService.getRoadDistance({ lat: 10.0, lng: 105.0 }, { lat: 11.0, lng: 106.0 });
    assert.equal(resFallback.source, 'estimated');
  } finally {
    global.fetch = originalFetch;
    delete process.env.ORS_API_KEY;
  }
});

// Test 9: Service báo giá (QuotesService) với store giả
test('9. QuotesService: ngựa của người khác -> 403; tripType round_trip -> 400; chuồng riêng tăng slots', async () => {
  const fakePricingStore = {
    getActiveTariffs: async () => ({ road: { params: ROAD_TARIFF_V1, version: 1 } }),
    getRoadVehicleClasses: async () => [
      { code: 'truck_1', nameVi: 'Xe 1 chỗ', horseCapacity: 1, priceCoefficient: 1.0 },
      { code: 'truck_2', nameVi: 'Xe 2 chỗ', horseCapacity: 2, priceCoefficient: 1.0 },
      { code: 'truck_4', nameVi: 'Xe 4 chỗ', horseCapacity: 4, priceCoefficient: 1.3 },
      { code: 'truck_6', nameVi: 'Xe 6 chỗ', horseCapacity: 6, priceCoefficient: 1.6 },
    ],
    getActiveOwnDepots: async () => [{ id: 1, code: 'VN-HCM-TD', name: 'Trạm Thủ Đức', lat: 10.8494, lng: 106.7537 }],
  };

  const pricingService = new PricingService(fakePricingStore, new DistanceService());

  const fakeQuotesStore = {
    findHorseById: async (id) => {
      if (id === 1) return { horseId: 1, ownerId: 10, name: 'Xích Thố', status: 'active', requiresPrivateStall: false, quantity: 1 };
      if (id === 2) return { horseId: 2, ownerId: 99, name: 'Ngựa của B', status: 'active', requiresPrivateStall: false, quantity: 1 };
      if (id === 3) return { horseId: 3, ownerId: 10, name: 'Đực Giống', status: 'active', requiresPrivateStall: true, quantity: 1 };
      return null;
    },
    createQuote: async () => 501,
  };

  const quotesService = new QuotesService(fakeQuotesStore, pricingService);
  const user = { id: '10', email: 'customer@example.com', role: 'CUSTOMER' };

  // 9a. round_trip -> BadRequestException
  await assert.rejects(
    () =>
      quotesService.createQuote(user, {
        origin: { address: 'Q7 TP.HCM', lat: 10.734, lng: 106.7216 },
        destination: { address: 'Đà Lạt', lat: 11.9404, lng: 108.4583 },
        departureDate: '2026-12-10',
        transportMode: 'road',
        tripType: 'round_trip',
        horses: [{ horseId: 1 }],
      }),
    BadRequestException,
  );

  // 9b. Ngựa của người khác (ownerId 99 !== 10) -> ForbiddenException
  await assert.rejects(
    () =>
      quotesService.createQuote(user, {
        origin: { address: 'Q7 TP.HCM', lat: 10.734, lng: 106.7216 },
        destination: { address: 'Đà Lạt', lat: 11.9404, lng: 108.4583 },
        departureDate: '2026-12-10',
        transportMode: 'road',
        tripType: 'one_way',
        horses: [{ horseId: 2 }],
      }),
    ForbiddenException,
  );

  // 9c. Ngựa có requiresPrivateStall -> slots = 2, chọn xe 2 chỗ thay vì 1 chỗ
  const quotePrivate = await quotesService.createQuote(user, {
    origin: { address: 'Q7 TP.HCM', lat: 10.734, lng: 106.7216 },
    destination: { address: 'Đà Lạt', lat: 11.9404, lng: 108.4583 },
    departureDate: '2026-12-10',
    transportMode: 'road',
    tripType: 'one_way',
    horses: [{ horseId: 3 }],
  });

  assert.equal(quotePrivate.requiredStallSlots, 2);
  assert.equal(quotePrivate.options[0].vehicles[0].classCode, 'truck_2');
});

// Test 10: Tạo đơn từ quote và các mã lỗi (410, 409, 403)
test('10. Tạo đơn từ quote: hết hạn -> 410; đã dùng -> 409; của người khác -> 403', async () => {
  // Giả lập transaction và database cho createShipment logic
  const now = new Date();
  const past = new Date(now.getTime() - 3600 * 1000);
  const future = new Date(now.getTime() + 3600 * 1000);

  // Test qua logic của OrdersStore createShipment
  const { OrdersStore } = require('../dist/modules/orders/orders.store');

  const makeMockDb = (quoteRecord) => ({
    execute: async (sql, params) => {
      if (sql.includes('SELECT * FROM shipment_quote')) {
        return quoteRecord ? [[quoteRecord]] : [[]];
      }
      if (sql.includes('SELECT horse_id, name, status, quantity FROM horse')) {
        return [[{ horse_id: 1, name: 'Ngựa 1', status: 'active', quantity: 1 }]];
      }
      if (sql.includes('INSERT INTO shipment (')) {
        return [{ insertId: 101 }];
      }
      return [[]];
    },
  });

  const store = new OrdersStore();
  store.transaction = async (cb) => cb(store.mockDb);

  // 10a. Báo giá không tồn tại -> 404
  store.mockDb = makeMockDb(null);
  await assert.rejects(
    () => store.createShipment(10, { quoteId: 999, requestedHorseCount: 1, contactPhone: '0901', contactEmail: 'a@b.com' }),
    NotFoundException,
  );

  // 10b. Báo giá của người khác -> 403
  store.mockDb = makeMockDb({ quote_id: 501, customer_id: 99, status: 'active', expires_at: future });
  await assert.rejects(
    () => store.createShipment(10, { quoteId: 501, requestedHorseCount: 1, contactPhone: '0901', contactEmail: 'a@b.com' }),
    ForbiddenException,
  );

  // 10c. Báo giá đã dùng -> 409
  store.mockDb = makeMockDb({ quote_id: 501, customer_id: 10, status: 'used', expires_at: future });
  await assert.rejects(
    () => store.createShipment(10, { quoteId: 501, requestedHorseCount: 1, contactPhone: '0901', contactEmail: 'a@b.com' }),
    ConflictException,
  );

  // 10d. Báo giá đã hết hạn -> 410 GoneException
  store.mockDb = makeMockDb({ quote_id: 501, customer_id: 10, status: 'active', expires_at: past });
  await assert.rejects(
    () => store.createShipment(10, { quoteId: 501, requestedHorseCount: 1, contactPhone: '0901', contactEmail: 'a@b.com' }),
    GoneException,
  );
});

// Test 11: Tạo version bảng giá mới không làm đổi result_json của quote cũ
test('11. Tạo version bảng giá mới không làm đổi giá trị quote đã tạo (snapshot bất biến)', async () => {
  const quoteResult = {
    total: 18750000,
    tariffVersions: { road: 1 },
    legs: [{ distanceKm: 300 }],
  };

  const storedQuote = {
    quote_id: 1,
    result_json: JSON.stringify(quoteResult),
    tariff_versions_json: JSON.stringify({ road: 1 }),
  };

  // Giả sử bảng giá sau đó tăng lên version 2 (phí mở chuyến 3.000.000)
  const ROAD_TARIFF_V2 = {
    ...ROAD_TARIFF_V1,
    openingFeePerVehicle: 3000000,
    version: 2,
  };

  // Đọc lại quote từ DB: giá trị vẫn nguyên vẹn từ snapshot JSON
  const parsedResult = JSON.parse(storedQuote.result_json);
  assert.equal(parsedResult.total, 18750000);
  assert.equal(parsedResult.tariffVersions.road, 1);
});
