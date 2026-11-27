const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { planNetworkRoute } = require('../dist/modules/routes/route-network.policy');
const { RouteNetworkStore } = require('../dist/modules/routes/route-network.store');
const { RoutePlanningError } = require('../dist/modules/routes/route-network.types');
const { PlanNetworkRouteDto } = require('../dist/modules/routes/dto/plan-network-route.dto');

const MOCK_NETWORK = {
  seaports: [
    {
      id: 1,
      code: 'VN-CLI',
      name: 'Cảng Cát Lái (TP.HCM)',
      nameEn: 'Cat Lai Port',
      countryCode: 'VN',
      lat: 10.7617,
      lng: 106.7894,
      isInternational: true,
      supportsFerry: false,
      supportsVessel: true,
      hasQuarantine: true,
    },
    {
      id: 2,
      code: 'SG-PSA',
      name: 'Cảng Pasir Panjang (Singapore)',
      nameEn: 'Pasir Panjang Terminal',
      countryCode: 'SG',
      lat: 1.2737,
      lng: 103.7909,
      isInternational: true,
      supportsFerry: false,
      supportsVessel: true,
      hasQuarantine: true,
    },
    {
      id: 3,
      code: 'ID-JKT',
      name: 'Cảng Tanjung Priok (Jakarta)',
      nameEn: 'Tanjung Priok Port',
      countryCode: 'ID',
      lat: -6.104,
      lng: 106.88,
      isInternational: true,
      supportsFerry: false,
      supportsVessel: true,
      hasQuarantine: true,
    },
    {
      id: 4,
      code: 'CN-TSN',
      name: 'Cảng Thiên Tân',
      nameEn: 'Tianjin Port',
      countryCode: 'CN',
      lat: 38.97,
      lng: 117.8,
      isInternational: true,
      supportsFerry: false,
      supportsVessel: true,
      hasQuarantine: true,
    },
  ],
  seaLanes: [
    {
      id: 10,
      fromPortId: 1,
      toPortId: 2,
      seaMode: 'vessel',
      distanceKm: 1202,
      typicalHours: 52,
      viaPoints: [[8.3, 107], [5, 105.8], [1.4, 104.55]],
      notes: 'Cát Lái – Singapore',
    },
    {
      id: 11,
      fromPortId: 2,
      toPortId: 3,
      seaMode: 'vessel',
      distanceKm: 1022,
      typicalHours: 45,
      viaPoints: [[0.6, 104.8], [-2.55, 107.1]],
      notes: 'Singapore – Jakarta',
    },
    {
      id: 12,
      fromPortId: 1,
      toPortId: 4,
      seaMode: 'vessel',
      distanceKm: 4434,
      typicalHours: 185,
      viaPoints: [[15, 110.6], [24.38, 118.1], [35.6, 120.8]],
      notes: 'Long-haul >168h test lane',
    },
  ],
  airports: [
    {
      id: 1,
      code: 'SGN',
      name: 'Tân Sơn Nhất',
      city: 'TP.HCM',
      countryCode: 'VN',
      lat: 10.8185,
      lng: 106.6519,
      hasQuarantine: true,
      hasEquineRamp: true,
      airRole: 'gateway',
    },
    {
      id: 2,
      code: 'CGK',
      name: 'Soekarno-Hatta',
      city: 'Jakarta',
      countryCode: 'ID',
      lat: -6.1256,
      lng: 106.6559,
      hasQuarantine: true,
      hasEquineRamp: true,
      airRole: 'gateway',
    },
    {
      id: 3,
      code: 'PEK',
      name: 'Beijing Capital',
      city: 'Beijing',
      countryCode: 'CN',
      lat: 40.0799,
      lng: 116.6031,
      hasQuarantine: true,
      hasEquineRamp: true,
      airRole: 'hub',
    },
  ],
  borderCrossings: [],
  restStops: [],
};

test('RouteNetwork (vessel-only): rejects seaMode=ferry with FERRY_NOT_SUPPORTED and never suggests ferry', () => {
  assert.throws(
    () =>
      planNetworkRoute(MOCK_NETWORK, {
        mode: 'sea',
        seaMode: 'ferry',
        origin: { lat: 10.78, lng: 106.7, country: 'Vietnam', label: 'TP.HCM' },
        destination: { lat: 1.35, lng: 103.82, country: 'Singapore', label: 'Singapore' },
      }),
    (err) => {
      assert.ok(err instanceof RoutePlanningError);
      assert.equal(err.code, 'FERRY_NOT_SUPPORTED');
      assert.ok(!err.suggestions.some((s) => s.seaMode === 'ferry'), 'must never suggest ferry');
      assert.ok(err.suggestions.some((s) => s.mode === 'sea' && s.seaMode === 'vessel'), 'should suggest vessel');
      return true;
    },
  );
});

test('RouteNetwork (vessel-only): plans VN -> SG vessel voyage with offshore viaPoints and ferryCrossings=0', () => {
  const plan = planNetworkRoute(MOCK_NETWORK, {
    mode: 'sea',
    seaMode: 'vessel',
    origin: { lat: 10.78, lng: 106.7, country: 'Vietnam', label: 'TP.HCM' },
    destination: { lat: 1.35, lng: 103.82, country: 'Singapore', label: 'Singapore' },
  });
  assert.equal(plan.mode, 'sea');
  assert.equal(plan.seaMode, 'vessel');
  assert.equal(plan.totals.ferryCrossings, 0);
  const seaLeg = plan.legs.find((l) => l.type === 'sea');
  assert.ok(seaLeg, 'must contain a sea leg');
  assert.equal(seaLeg.seaMode, 'vessel');
  assert.equal(seaLeg.distanceKm, 1202);
  assert.equal(seaLeg.geometry.length, 5, 'port + 3 viaPoints + port');
});

test('RouteNetwork (vessel-only): allows long-haul >168h vessel sea voyages without 7-day cap', () => {
  const plan = planNetworkRoute(MOCK_NETWORK, {
    mode: 'sea',
    seaMode: 'vessel',
    origin: { lat: 10.78, lng: 106.7, country: 'Vietnam', label: 'TP.HCM' },
    destination: { lat: 39.08, lng: 117.2, country: 'China', label: 'Tianjin' },
  });
  assert.equal(plan.mode, 'sea');
  assert.equal(plan.seaMode, 'vessel');
  const seaLeg = plan.legs.find((l) => l.type === 'sea');
  assert.ok(seaLeg && seaLeg.distanceKm === 4434 && seaLeg.durationHours >= 185);
});

test('RouteNetwork (vessel-only): road across sea landmasses never suggests ferry', () => {
  assert.throws(
    () =>
      planNetworkRoute(MOCK_NETWORK, {
        mode: 'road',
        origin: { lat: 10.78, lng: 106.7, country: 'Vietnam', label: 'TP.HCM' },
        destination: { lat: -6.2, lng: 106.85, country: 'Indonesia', label: 'Jakarta' },
      }),
    (err) => {
      assert.ok(err instanceof RoutePlanningError);
      assert.equal(err.code, 'ROAD_DIFFERENT_LANDMASS');
      assert.ok(!err.suggestions.some((s) => s.seaMode === 'ferry'));
      assert.ok(err.suggestions.some((s) => s.mode === 'sea' && s.seaMode === 'vessel'));
      assert.ok(err.suggestions.some((s) => s.mode === 'air'));
      return true;
    },
  );
});

test('PlanNetworkRouteDto: rejects seaMode=ferry and accepts vessel or omitted seaMode', async () => {
  const badDto = plainToInstance(PlanNetworkRouteDto, {
    mode: 'sea',
    seaMode: 'ferry',
    origin: { lat: 10.78, lng: 106.7 },
    destination: { lat: 1.35, lng: 103.82 },
  });
  const badErrors = await validate(badDto);
  assert.ok(badErrors.some((e) => e.property === 'seaMode'), 'DTO must reject seaMode=ferry');

  const okDto = plainToInstance(PlanNetworkRouteDto, {
    mode: 'sea',
    seaMode: 'vessel',
    origin: { lat: 10.78, lng: 106.7 },
    destination: { lat: 1.35, lng: 103.82 },
  });
  const okErrors = await validate(okDto);
  assert.equal(okErrors.length, 0);
});

test('RouteNetworkStore.loadNetwork: filters vessel-only and via_points IS NOT NULL (no 168h cap)', async () => {
  const queries = [];
  const mockPool = {
    async query(sql) {
      queries.push(String(sql));
      return [[]];
    },
  };
  const store = new RouteNetworkStore(mockPool);
  await store.loadNetwork();
  const seaRouteQuery = queries.find((q) => q.includes('FROM sea_route'));
  assert.ok(seaRouteQuery, 'Expected sea_route query');
  assert.match(seaRouteQuery, /sea_mode\s*=\s*'vessel'/i);
  assert.doesNotMatch(seaRouteQuery, /typical_hours\s*<=\s*168/i);
  assert.match(seaRouteQuery, /via_points\s+IS\s+NOT\s+NULL/i);
  const seaportQuery = queries.find((q) => q.includes('FROM seaport'));
  assert.ok(seaportQuery, 'Expected seaport query');
  assert.match(seaportQuery, /supports_vessel\s*=\s*TRUE/i);
});
