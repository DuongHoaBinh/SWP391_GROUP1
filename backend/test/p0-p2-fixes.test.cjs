const test = require('node:test');
const assert = require('node:assert/strict');

const { isRoadSeparatedByOcean } = require('../dist/modules/routes/distance.service');
const { PricingService } = require('../dist/modules/orders/pricing.service');
const { calculateFreight } = require('../dist/modules/orders/pricing-policy');
const { calculateInsurance, packages, suggestPayout, DEFAULT_PAYOUT_RULES_V2 } = require('../dist/modules/orders/insurance-policy');
const { evaluateEquineHealthAlert, classifyRespiratoryRate } = require('../dist/modules/tracking/vitals-policy');
const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { OrdersService } = require('../dist/modules/orders/orders.service');

const ROAD_TARIFF = {
  openingFeePerVehicle: 1500000,
  distanceTiers: [{ upToKm: null, pricePerKm: 25000 }],
  careFeePerHorse: 500000,
  deadheadPerKm: 15000,
  nightSurchargePerVehicle: 1000000,
  borderCrossingFee: 3000000,
  roundingUnit: 1000,
  averageSpeedKmh: 50,
};

const AIR_TARIFF = {
  baseFeePerHorse: 25000000,
  pricePerKmPerHorse: 45000,
  airportHandlingPerHorse: 5000000,
  roundingUnit: 1000,
  averageSpeedKmh: 700,
};

const SEA_TARIFF = {
  vessel: { baseFeePerHorse: 15000000, pricePerKmPerHorse: 20000 },
  roundingUnit: 1000,
};

test('P0.7: FleetService.updateStaffShift respects explicit releaseActiveTrips=true regardless of dutyStatus and returns real activeTrips', async () => {
  let capturedReleaseFlag = null;
  const fakeFleetStore = {
    updateStaffShift: async (_id, _shift, _status, shouldRelease) => {
      capturedReleaseFlag = shouldRelease;
      return true;
    },
    countActiveTripsForStaff: async () => 1,
  };
  const service = new FleetService(fakeFleetStore, {});
  const res1 = await service.updateStaffShift(5, { currentShift: 'Ca Sáng', dutyStatus: 'ON_DUTY', releaseActiveTrips: true });
  assert.equal(capturedReleaseFlag, true, 'Explicit releaseActiveTrips=true must release non-in-transit assignments');
  assert.equal(res1.activeTrips, 1, 'Must return live activeTrips count (in_transit/return_pending remain)');

  await service.updateStaffShift(5, { currentShift: 'Ca Sáng', dutyStatus: 'ON_DUTY', releaseActiveTrips: false });
  assert.equal(capturedReleaseFlag, false, 'releaseActiveTrips=false must not release trips');
});

test('P0.3: OrdersService.cancelReturnLegByCustomer rejects unpaid awaiting_payment order', async () => {
  const { ConflictException } = require('@nestjs/common');
  const fakeOrdersStore = {
    findShipmentById: async () => ({
      id: 99,
      customerId: 10,
      tripType: 'round_trip',
      status: 'awaiting_payment',
      returnStatus: 'scheduled',
      returnDepartureAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      returnFreight: 50000000,
      returnInsuranceFee: 2000000,
    }),
  };
  const service = new OrdersService(fakeOrdersStore, {}, {}, {}, {});
  await assert.rejects(
    () => service.cancelReturnLegByCustomer({ id: '10', email: 'c@test.com', role: 'CUSTOMER' }, 99, 'change mind'),
    ConflictException,
  );
});

test('P1.2: Road ocean-crossing detection blocks Vietnam -> Japan/Australia/USA and counts 4 borders for VN -> Singapore', async () => {
  const { UnprocessableEntityException } = require('@nestjs/common');
  assert.equal(
    isRoadSeparatedByOcean(
      { lat: 10.77, lng: 106.7, country: 'Vietnam', address: 'TP.HCM' },
      { lat: 35.67, lng: 139.65, country: 'Japan', address: 'Tokyo, Japan' },
    ),
    true,
  );
  assert.equal(
    isRoadSeparatedByOcean(
      { lat: 10.77, lng: 106.7, country: 'Vietnam', address: 'TP.HCM' },
      { lat: 1.42, lng: 103.76, country: 'Singapore', address: 'Singapore Turf Club' },
    ),
    false,
  );

  const fakePricingStore = {
    getActiveTariffs: async () => ({ road: { params: ROAD_TARIFF, version: 1 }, air: { params: AIR_TARIFF, version: 1 } }),
    getRoadVehicleClasses: async () => [{ code: 'truck_2', nameVi: 'Xe 2 chỗ', horseCapacity: 2, priceCoefficient: 1 }],
    getActiveOwnDepots: async () => [{ id: 1, code: 'VN-HCM', name: 'Thủ Đức', lat: 10.85, lng: 106.75 }],
    getAirportsWithEquineRamp: async () => [
      { id: 1, code: 'SGN', name: 'Tân Sơn Nhất', country: 'Vietnam', lat: 10.8188, lng: 106.6519 },
      { id: 2, code: 'SIN', name: 'Changi', country: 'Singapore', lat: 1.3644, lng: 103.9915 },
    ],
  };
  const fakeDistanceService = {
    getRoadDistance: async () => ({ distanceKm: 2400, durationHours: 48, source: 'osrm' }),
  };
  const pricing = new PricingService(fakePricingStore, fakeDistanceService);

  await assert.rejects(
    () =>
      pricing.buildRouteContext({
        mode: 'road',
        sample: {
          origin: { address: 'TP.HCM, Vietnam', lat: 10.77, lng: 106.7, country: 'Vietnam' },
          destination: { address: 'Tokyo, Japan', lat: 35.67, lng: 139.65, country: 'Japan' },
          horses: [{ quantity: 1 }],
        },
      }),
    UnprocessableEntityException,
  );

  const vnSg = await pricing.buildRouteContext({
    mode: 'road',
    sample: {
      origin: { address: 'TP.HCM, Vietnam', lat: 10.77, lng: 106.7, country: 'Vietnam' },
      destination: { address: 'Singapore Turf Club', lat: 1.42, lng: 103.76, country: 'Singapore' },
      horses: [{ quantity: 1 }],
    },
  });
  assert.equal(vnSg.freightBase.roadLegs[0].borderCrossings, 4, 'VN -> SG road crosses 4 borders (VN-KH-TH-MY-SG)');
});

test('P1.3: Air mode blocks same-airport trips and includes realistic international dwell time (+6.5h)', async () => {
  const { UnprocessableEntityException } = require('@nestjs/common');
  const fakePricingStore = {
    getActiveTariffs: async () => ({ road: { params: ROAD_TARIFF, version: 1 }, air: { params: AIR_TARIFF, version: 1 } }),
    getAirportsWithEquineRamp: async () => [
      { id: 1, code: 'SGN', name: 'Tân Sơn Nhất', country: 'Vietnam', lat: 10.8188, lng: 106.6519 },
      { id: 2, code: 'SIN', name: 'Changi', country: 'Singapore', lat: 1.3644, lng: 103.9915 },
    ],
  };
  const fakeDistanceService = {
    getRoadDistance: async () => ({ distanceKm: 20, durationHours: 0.6, source: 'osrm' }),
  };
  const pricing = new PricingService(fakePricingStore, fakeDistanceService);

  await assert.rejects(
    () =>
      pricing.buildRouteContext({
        mode: 'air',
        sample: {
          origin: { address: 'Quận 1, TP.HCM', lat: 10.77, lng: 106.7, country: 'Vietnam' },
          destination: { address: 'Củ Chi, TP.HCM', lat: 11.0, lng: 106.51, country: 'Vietnam' },
          horses: [{ quantity: 1 }],
        },
      }),
    UnprocessableEntityException,
  );

  const sgnSin = await pricing.buildRouteContext({
    mode: 'air',
    sample: {
      origin: { address: 'TP.HCM, Vietnam', lat: 10.77, lng: 106.7, country: 'Vietnam' },
      destination: { address: 'Singapore Turf Club', lat: 1.42, lng: 103.76, country: 'Singapore' },
      horses: [{ quantity: 1 }],
    },
  });
  const flightLeg = sgnSin.legs.find((l) => l.key === 'flight');
  assert.ok(flightLeg && flightLeg.durationHours >= 8.0, `Expected SGN->SIN air leg >= 8h including 6.5h dwell, got ${flightLeg?.durationHours}`);
});

test('P1.5: Sea vessel pricing calculates flat per-horse vessel freight cleanly (no private stall surcharge)', () => {
  const oneHorse = calculateFreight(
    {
      mode: 'sea',
      seaMode: 'vessel',
      horses: [{ horseId: 1, quantity: 1 }],
      vehicles: [{ classCode: 'truck_2', priceCoefficient: 1, capacity: 2, deadheadKm: 10 }],
      roadLegs: [{ key: 'to_hub', distanceKm: 20, borderCrossings: 0 }],
      seaKm: 1000,
    },
    { road: ROAD_TARIFF, sea: SEA_TARIFF },
  );
  const twoHorses = calculateFreight(
    {
      mode: 'sea',
      seaMode: 'vessel',
      horses: [{ horseId: 1, quantity: 1 }, { horseId: 2, quantity: 1 }],
      vehicles: [{ classCode: 'truck_2', priceCoefficient: 1, capacity: 2, deadheadKm: 10 }],
      roadLegs: [{ key: 'to_hub', distanceKm: 20, borderCrossings: 0 }],
      seaKm: 1000,
    },
    { road: ROAD_TARIFF, sea: SEA_TARIFF },
  );
  assert.ok(twoHorses.total > oneHorse.total, 'Two horses on sea vessel must cost more than one horse');
  assert.ok(!oneHorse.lines.some((l) => /Chuồng riêng/i.test(l.label)));
});

test('P2.2: Insurance Standard emergencyVetCovered=true; rejects premium >= declaredValue; basic 0 VND explains cap', () => {
  const stdPkg = packages.find((p) => p.code === 'standard');
  assert.equal(stdPkg.emergencyVetCovered, true);

  assert.throws(
    () => calculateInsurance({ declaredValue: 1000000, declaredCurrency: 'VND', insurancePackage: 'premium' }),
    /Giá trị khai báo/,
  );

  const basicM4Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'basic' && r.severity === 'M4');
  const suggestion = suggestPayout({ rule: basicM4Rule, declaredValueVnd: 0 });
  assert.equal(suggestion.amount, 50000000);
});

test('P2.4: Vitals policy evaluates respiratoryRateBpm for Amber and Red alerts', () => {
  assert.equal(classifyRespiratoryRate(14), 'green');
  assert.equal(classifyRespiratoryRate(25), 'amber');
  assert.equal(classifyRespiratoryRate(36), 'red');

  const res = evaluateEquineHealthAlert({
    conditionStatus: 'stable',
    temperatureC: 38.0,
    heartRateBpm: 36,
    respiratoryRateBpm: 35,
  });
  assert.equal(res.alertTier, 'red');
  assert.ok(res.alertReason && res.alertReason.includes('nhịp thở'));
});
