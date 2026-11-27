const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { RoutesStore } = require('../dist/modules/routes/routes.store');
const { FleetStore } = require('../dist/modules/fleet/fleet.store');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { TrackingStore } = require('../dist/modules/tracking/tracking.store');

const MOCK_AIRPORTS = [
  { id: 1, iataCode: 'SGN', icaoCode: 'VVTS', name: 'Tân Sơn Nhất', city: 'TP.HCM', country: 'Vietnam', hasQuarantineFacility: true, hasEquineCargoRamp: true, lat: 10.8185, lng: 106.6519 },
  { id: 2, iataCode: 'SIN', icaoCode: 'WSSS', name: 'Changi International', city: 'Singapore', country: 'Singapore', hasQuarantineFacility: true, hasEquineCargoRamp: true, lat: 1.3644, lng: 103.9915 },
];

const MOCK_STOPS = [
  { id: 10, name: 'Cửa khẩu Quốc tế Mộc Bài', stopType: 'border_check', address: 'Tây Ninh', city: 'Tây Ninh', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 11.076, lng: 106.174 },
];

test('composeDraftSuggestion: road-only cross-border fallback (REQ-003) NEVER forces Air and adds border_check stop', () => {
  const suggestion = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 3,
        originLocation: 'Trang trại Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Phnom Penh Equestrian Club, Cambodia',
        originLat: 10.97,
        originLng: 106.51,
        destinationLat: 11.55,
        destinationLng: 104.92,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'International',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: null,
      reservations: [{ reservationId: 1, vehicleId: 7, direction: 'outbound' }],
    },
    MOCK_AIRPORTS,
    MOCK_STOPS,
  );

  assert.equal(suggestion.source, 'shipment_fallback');
  assert.equal(suggestion.transportMode, 'road');
  assert.equal(suggestion.legs.length, 1);
  assert.equal(suggestion.legs[0].legType, 'road');
  assert.equal(suggestion.legs[0].vehicleId, 7);
  assert.equal(suggestion.legs[0].plannedDeparture, '2026-12-10T01:00:00.000Z');
  assert.ok(
    suggestion.stops.some((s) => s.stopType === 'border_check'),
    'cross-border road shipment should include border_check stop for BR-F3-03',
  );
});

test('composeDraftSuggestion: air quote routePlan maps airports, stops, pickupAt, and exact outbound reserved vehicle', () => {
  const suggestion = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 21,
        originLocation: 'Quận 7, TP.HCM',
        destinationLocation: 'Singapore Turf Club, Singapore',
        originLat: 10.73,
        originLng: 106.72,
        destinationLat: 1.42,
        destinationLng: 103.76,
        requestedHorseCount: 4,
        transportMode: 'air',
        transportationType: 'International',
        tripType: 'one_way',
        pickupAt: '2026-12-15T15:30:00.000Z', // city-ban adjusted pickup time
        departureDate: '2026-12-15',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: {
        quoteId: 99,
        transportMode: 'air',
        tripType: 'one_way',
        inputJson: { pickupAt: '2026-12-15T15:30:00.000Z' },
        resultJson: {
          routePlan: {
            legs: [
              { type: 'road', fromName: 'Quận 7, TP.HCM', toName: 'Sân bay Tân Sơn Nhất (SGN)', distanceKm: 18, durationHours: 1 },
              {
                type: 'air',
                fromName: 'Tân Sơn Nhất (SGN)',
                toName: 'Changi International (SIN)',
                fromCode: 'SGN',
                toCode: 'SIN',
                distanceKm: 1093,
                durationHours: 2.2,
                stops: [{ stopType: 'quarantine', name: 'Changi Animal & Plant Quarantine', countryCode: 'SG' }],
              },
              { type: 'road', fromName: 'Changi International (SIN)', toName: 'Singapore Turf Club', distanceKm: 32, durationHours: 1 },
            ],
          },
        },
      },
      reservations: [
        { reservationId: 101, vehicleId: 12, direction: 'outbound' },
        { reservationId: 102, vehicleId: 15, direction: 'outbound' },
      ],
    },
    MOCK_AIRPORTS,
    MOCK_STOPS,
  );

  assert.equal(suggestion.source, 'quote_route_plan');
  assert.equal(suggestion.transportMode, 'air');
  assert.deepEqual(suggestion.reservedOutboundVehicleIds, [12, 15]);
  assert.equal(suggestion.legs.length, 3);
  assert.equal(suggestion.legs[0].legType, 'road');
  assert.equal(suggestion.legs[0].vehicleId, 12);
  assert.equal(suggestion.legs[0].plannedDeparture, '2026-12-15T15:30:00.000Z');
  assert.equal(suggestion.legs[1].legType, 'flight');
  assert.equal(suggestion.legs[1].departureAirportId, 1);
  assert.equal(suggestion.legs[1].arrivalAirportId, 2);
  assert.equal(suggestion.legs[1].departureAirportCode, 'SGN');
  assert.equal(suggestion.legs[1].arrivalAirportCode, 'SIN');
  assert.equal(suggestion.legs[1].stallsBooked, 2, '4 horses -> ceil(4/3) = 2 air jet stalls');
  assert.equal(suggestion.legs[2].legType, 'road');
  assert.equal(suggestion.legs[2].vehicleId, null, 'overseas delivery road leg leaves domestic vehicleId null');
  assert.equal(suggestion.stops.length, 1);
  assert.equal(suggestion.stops[0].stopType, 'quarantine');
});

test('composeDraftSuggestion: sea vessel quote produces road -> sea -> road with stallsBooked >= 1', () => {
  const suggestion = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 22,
        originLocation: 'Trang trại Củ Chi, TP.HCM',
        destinationLocation: 'Singapore Turf Club, Singapore',
        originLat: 10.97,
        originLng: 106.51,
        destinationLat: 1.42,
        destinationLng: 103.76,
        requestedHorseCount: 3,
        transportMode: 'sea',
        transportationType: 'International',
        tripType: 'one_way',
        pickupAt: '2026-12-20T00:00:00.000Z',
        departureDate: '2026-12-20',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: {
        quoteId: 100,
        transportMode: 'sea',
        tripType: 'one_way',
        inputJson: {},
        resultJson: {
          routePlan: {
            legs: [
              { type: 'road', fromName: 'Trang trại Củ Chi, TP.HCM', toName: 'Cảng Cát Lái (TP.HCM)', distanceKm: 42, durationHours: 1.5 },
              { type: 'sea', fromName: 'Cảng Cát Lái (TP.HCM)', toName: 'Cảng Pasir Panjang (Singapore)', distanceKm: 1202, durationHours: 52 },
              { type: 'road', fromName: 'Cảng Pasir Panjang (Singapore)', toName: 'Singapore Turf Club', distanceKm: 28, durationHours: 1 },
            ],
          },
        },
      },
      reservations: [{ reservationId: 201, vehicleId: 9, direction: 'outbound' }],
    },
    MOCK_AIRPORTS,
    MOCK_STOPS,
  );

  assert.equal(suggestion.transportMode, 'sea');
  assert.equal(suggestion.legs.length, 3);
  assert.equal(suggestion.legs[0].legType, 'road');
  assert.equal(suggestion.legs[0].vehicleId, 9);
  assert.equal(suggestion.legs[1].legType, 'sea');
  assert.equal(suggestion.legs[1].stallsBooked, 3);
  assert.equal(suggestion.legs[2].legType, 'road');
  assert.equal(suggestion.legs[2].vehicleId, null);
});

test('composeDraftSuggestion: round_trip generates both outbound and return legs with return vehicle', () => {
  const suggestion = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 23,
        originLocation: 'Trang trại Củ Chi, TP.HCM',
        destinationLocation: 'Đà Lạt, Lâm Đồng',
        originLat: 10.97,
        originLng: 106.51,
        destinationLat: 11.94,
        destinationLng: 108.45,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'Domestic',
        tripType: 'round_trip',
        pickupAt: '2026-12-22T01:00:00.000Z',
        departureDate: '2026-12-22',
        returnDepartureAt: '2026-12-26T02:00:00.000Z',
        allocationSnapshot: null,
      },
      quote: {
        quoteId: 101,
        transportMode: 'road',
        tripType: 'round_trip',
        inputJson: {},
        resultJson: {
          legs: [{ key: 'road', from: 'Trang trại Củ Chi, TP.HCM', to: 'Đà Lạt, Lâm Đồng', distanceKm: 310, durationHours: 6.5 }],
        },
      },
      reservations: [
        { reservationId: 301, vehicleId: 4, direction: 'outbound' },
        { reservationId: 302, vehicleId: 5, direction: 'return' },
      ],
    },
    MOCK_AIRPORTS,
    MOCK_STOPS,
  );

  assert.equal(suggestion.tripType, 'round_trip');
  assert.equal(suggestion.legs.length, 2);
  assert.equal(suggestion.legs[0].direction, 'outbound');
  assert.equal(suggestion.legs[0].vehicleId, 4);
  assert.equal(suggestion.legs[1].direction, 'return');
  assert.equal(suggestion.legs[1].vehicleId, 5);
  assert.equal(suggestion.legs[1].plannedDeparture, '2026-12-26T02:00:00.000Z');
  assert.equal(suggestion.legs[1].originLocation, 'Đà Lạt, Lâm Đồng');
  assert.equal(suggestion.legs[1].destinationLocation, 'Trang trại Củ Chi, TP.HCM');
});

test('FleetStore sea-leg parity: validateStaffEligibilityAndSchedule checks only Leg 1 road for driver on sea route & findAvailableStaff includes sea', async () => {
  const executed = [];
  const handleSql = async (sql, params) => {
    executed.push({ sql: String(sql), params });
    if (String(sql).includes('FROM `user` u')) {
      if (String(sql).includes('active_trips_count')) {
        return [[]];
      }
      return [[{ user_id: 50, full_name: 'Tài xế A', status: 'active', role_name: 'Vehicle Driver' }]];
    }
    if (String(sql).includes('FROM route_leg rl')) {
      return [[
        { leg_type: 'road', vehicle_id: 9, sequence_no: 1, road_trip_id: null, planned_departure: '2026-12-20T00:00:00.000Z', planned_arrival: '2026-12-20T02:00:00.000Z' },
        { leg_type: 'sea', vehicle_id: null, sequence_no: 2, road_trip_id: null, planned_departure: '2026-12-20T04:00:00.000Z', planned_arrival: '2026-12-22T08:00:00.000Z' },
      ]];
    }
    if (String(sql).includes('SELECT DISTINCT s.shipment_id')) {
      return [[]];
    }
    return [[]];
  };
  const mockPool = { execute: handleSql, query: handleSql };
  const store = new FleetStore(mockPool);
  store.findSiblingShipmentsOnSameRoadTrip = async () => [];

  await store.validateStaffEligibilityAndSchedule(22, [50], [{ userId: 50, roleInShipment: 'driver' }]);
  const conflictQueries = executed.filter((q) => q.sql.includes('SELECT DISTINCT s.shipment_id'));
  assert.equal(conflictQueries.length, 1, 'Driver on sea shipment must only be conflict-checked for Leg 1 road, NOT multi-day sea leg');
  assert.equal(conflictQueries[0].params[2], '2026-12-20T02:00:00.000Z');

  await store.findAvailableStaff();
  const availSql = executed.find((q) => q.sql.includes('active_trips_count'));
  assert.ok(availSql, 'Expected findAvailableStaff query');
  assert.match(availSql.sql, /rl_fl\.leg_type\s+IN\s*\(\s*'flight'\s*,\s*'sea'\s*\)/i);
});

test('TrackingService sea-leg parity: releases Leg 1 VN truck to available when nextLeg is sea', async () => {
  const releasedVehicles = [];
  const trackingStore = {
    findShipmentById: async () => ({
      shipment_id: 22,
      status: 'in_transit',
      trip_type: 'one_way',
      destination_location: 'Singapore Turf Club',
      customer_id: 10,
    }),
    findAssignedStaffByShipment: async () => [{ user_id: 50, role_in_shipment: 'driver' }],
    findRouteByShipmentId: async () => ({ route_id: 77, plan_status: 'in_transit' }),
    findLegsByRouteId: async () => [
      {
        leg_id: 501,
        sequence_no: 1,
        direction: 'outbound',
        leg_type: 'road',
        origin_location: 'Trang trại Củ Chi',
        destination_location: 'Cảng Cát Lái',
        vehicle_id: 9,
        status: 'in_progress',
        actual_departure: new Date('2026-12-20T00:00:00.000Z'),
        actual_arrival: null,
      },
      {
        leg_id: 502,
        sequence_no: 2,
        direction: 'outbound',
        leg_type: 'sea',
        origin_location: 'Cảng Cát Lái',
        destination_location: 'Cảng Pasir Panjang',
        vehicle_id: null,
        status: 'pending',
        actual_departure: null,
        actual_arrival: null,
      },
    ],
    findStopsByRouteId: async () => [],
    findLegCoordinates: async () => null,
    updateLegStatus: async () => {},
    updateVehicleStatus: async (vehicleId, status) => {
      releasedVehicles.push({ vehicleId, status });
    },
    recordTripStatusLog: async () => 999,
  };
  const notifications = { createNotification: async () => {}, notifyRoles: async () => {} };
  const service = new TrackingService(trackingStore, notifications, {});
  service.assertAssignedForDriverEscort = async () => {};
  service.resolveOperationalActorRole = async () => 'VEHICLE_DRIVER';
  service.getTrackingDetails = async () => ({ shipmentId: 22 });
  service.validateLocationAndGeofence = async () => ({
    lat: 10.76,
    lng: 106.79,
    accuracyM: 20,
    locationSource: 'gps',
    distanceToStopM: 50,
    gpsStatus: 'verified',
    manualReason: null,
    evidenceUrl: null,
  });

  await service.checkInLegArrival(
    { id: 50, role: 'VEHICLE_DRIVER', email: 'driver@example.com' },
    22,
    501,
    { notes: 'Bàn giao ngựa tại Cảng Cát Lái' },
  );

  assert.deepEqual(releasedVehicles, [{ vehicleId: 9, status: 'available' }]);
});

test('RoutesStore.confirmAndInvoice: rejects sea leg with stalls_booked < 1', async () => {
  const handleConnSql = async (sql) => {
    const s = String(sql);
    if (s.includes('FROM shipment WHERE shipment_id = ? FOR UPDATE')) {
      return [[{
        shipment_id: 22,
        customer_id: 10,
        status: 'planning',
        total_cost: 50000000,
        transport_cost: 48000000,
        insurance_fee: 2000000,
        requested_horse_count: 2,
        payment_flow: 'prepaid',
        booking_type: 'dedicated_charter',
      }]];
    }
    if (s.includes('FROM route WHERE shipment_id = ?')) {
      return [[{ route_id: 77, route_name: 'Sea Route', plan_status: 'approved' }]];
    }
    if (s.includes('FROM shipment_assignment')) {
      return [[{ user_id: 50, role_in_shipment: 'driver', is_confirmed: 0, confirmation_notes: null }]];
    }
    if (s.includes('FROM route_leg WHERE route_id = ?')) {
      return [[
        {
          leg_id: 502,
          sequence_no: 1,
          leg_type: 'sea',
          origin_location: 'Cảng Cát Lái',
          destination_location: 'Cảng Pasir Panjang',
          planned_departure: '2026-12-20T04:00:00.000Z',
          planned_arrival: '2026-12-22T08:00:00.000Z',
          vehicle_id: null,
          stalls_booked: 0,
        },
      ]];
    }
    return [[]];
  };
  const mockConn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    execute: handleConnSql,
    query: handleConnSql,
  };
  const mockPool = { async getConnection() { return mockConn; } };
  const store = new RoutesStore({ prepareLegs: async () => [] }, mockPool);

  await assert.rejects(
    () => store.confirmAndInvoice(22, 50),
    (err) => err instanceof BadRequestException,
  );
});

test('RoutesStore.findDraftSuggestionContext: uses valid schema columns (no request_code, uses vr.start_at/end_at)', async () => {
  const queries = [];
  const mockPool = {
    async execute(sql) {
      const s = String(sql);
      queries.push(s);
      if (s.includes('FROM shipment')) {
        return [[{
          shipment_id: 3,
          origin_location: 'TP.HCM',
          destination_location: 'Phnom Penh',
          origin_lat: 10.78,
          origin_lng: 106.7,
          destination_lat: 11.55,
          destination_lng: 104.92,
          transportation_type: 'International',
          transport_mode: 'road',
          sea_mode: null,
          trip_type: 'one_way',
          departure_date: '2026-12-10T01:00:00.000Z',
          pickup_at: null,
          return_departure_at: null,
          requested_horse_count: 2,
          quote_id: null,
          allocation_snapshot: null,
        }]];
      }
      if (s.includes('FROM vehicle_reservation')) {
        return [[{
          vehicle_id: 7,
          direction: 'outbound',
          start_at: '2026-12-10T00:00:00.000Z',
          end_at: '2026-12-10T10:00:00.000Z',
          plate_or_code: 'DEMO-51C-002',
          capacity: 4,
        }]];
      }
      return [[]];
    },
  };
  const store = new RoutesStore({ prepareLegs: async () => [] }, mockPool);
  const ctx = await store.findDraftSuggestionContext(3);
  assert.ok(ctx);
  assert.equal(ctx.shipment.requestCode, 'REQ-003');
  assert.equal(ctx.reservations[0].reservedFrom, '2026-12-10T00:00:00.000Z');
  assert.doesNotMatch(queries[0], /\brequest_code\b/);
  assert.match(queries[1], /\bvr\.start_at\b/);
  assert.match(queries[1], /\bvr\.end_at\b/);
});

test('composeDraftSuggestion: REQ-003 with transportationType="road" (TP.HCM -> Phnom Penh) detects cross-border and selects Moc Bai with GPS coords', () => {
  const multiStops = [
    { id: 1, name: 'Eastern Creek Quarantine Facility', stopType: 'quarantine', address: 'Sydney', city: 'Sydney', country: 'Australia', hasVeterinarian: true, hasStalls: true, lat: -33.805, lng: 150.852 },
    { id: 2, name: 'Cửa khẩu Quốc tế Hữu Nghị', stopType: 'border_check', address: 'Lạng Sơn', city: 'Lạng Sơn', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 21.9833, lng: 106.7167 },
    { id: 3, name: 'Trạm kiểm dịch Thú y Vùng VI (Cảng SGN Cargo)', stopType: 'quarantine', address: 'Tân Bình', city: 'TP.HCM', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 10.815, lng: 106.66 },
    { id: 4, name: 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài', stopType: 'quarantine', address: 'QL22, Bến Cầu', city: 'Tây Ninh', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 11.0667, lng: 106.1833 },
    { id: 5, name: 'Tuas Checkpoint & Equine Holding Facility', stopType: 'border_check', address: 'Tuas', city: 'Tuas', country: 'Singapore', hasVeterinarian: true, hasStalls: true, lat: 1.3436, lng: 103.6364 },
  ];

  // With coordinates
  const withCoords = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 3,
        originLocation: 'Trạm Điều phối Thủ Đức (TP.HCM)',
        destinationLocation: 'Trạm Đối tác Phnom Penh (Campuchia)',
        originLat: 10.85,
        originLng: 106.75,
        destinationLat: 11.5564,
        destinationLng: 104.9282,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'road',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: null,
      reservations: [{ reservationId: 1, vehicleId: 7, direction: 'outbound' }],
    },
    MOCK_AIRPORTS,
    multiStops,
  );

  assert.equal(withCoords.stops.length, 1);
  assert.equal(withCoords.stops[0].locationName, 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài');
  assert.equal(withCoords.stops[0].stopType, 'quarantine');
  assert.equal(withCoords.stops[0].lat, 11.0667);
  assert.equal(withCoords.stops[0].lng, 106.1833);
  assert.equal(withCoords.stops[0].geofenceRadiusM, 1000);
  assert.equal(withCoords.stops[0].locationRefType, 'master_stop');
  assert.equal(withCoords.stops[0].locationRefId, 4);

  // Without shipment coordinates -> corridor heuristic still picks Moc Bai
  const withoutCoords = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 3,
        originLocation: 'Trạm Điều phối Thủ Đức (TP.HCM)',
        destinationLocation: 'Trạm Đối tác Phnom Penh (Campuchia)',
        originLat: null,
        originLng: null,
        destinationLat: null,
        destinationLng: null,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'road',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: null,
      reservations: [],
    },
    MOCK_AIRPORTS,
    multiStops,
  );

  assert.equal(withoutCoords.stops.length, 1);
  assert.equal(withoutCoords.stops[0].locationName, 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài');
  assert.equal(withoutCoords.stops[0].locationRefId, 4);

  // Domestic road order with transportationType="road" does NOT add spurious border stop
  const domestic = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 99,
        originLocation: 'Trạm Điều phối Thủ Đức (TP.HCM)',
        destinationLocation: 'Trang trại Đà Lạt, Lâm Đồng',
        originLat: 10.85,
        originLng: 106.75,
        destinationLat: 11.94,
        destinationLng: 108.45,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'road',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: null,
      reservations: [],
    },
    MOCK_AIRPORTS,
    multiStops,
  );
  assert.equal(domestic.stops.length, 0);
});

test('composeDraftSuggestion: preserves PlannedStop.type="quarantine", coords, and routePlan checkpoint waypoints', () => {
  const suggestion = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 30,
        originLocation: 'TP.HCM, Vietnam',
        destinationLocation: 'Phnom Penh, Cambodia',
        originLat: 10.85,
        originLng: 106.75,
        destinationLat: 11.55,
        destinationLng: 104.92,
        requestedHorseCount: 2,
        transportMode: 'road',
        transportationType: 'road',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: {
        quoteId: 300,
        transportMode: 'road',
        tripType: 'one_way',
        inputJson: {},
        resultJson: {
          routePlan: {
            isDomestic: false,
            legs: [
              {
                type: 'road',
                fromName: 'TP.HCM',
                toName: 'Cửa khẩu Quốc tế Mộc Bài – Bavet',
                distanceKm: 75,
                durationHours: 2,
                stops: [
                  {
                    code: 'VN-R-CUCHI',
                    name: 'Trạm nghỉ Củ Chi',
                    type: 'rest',
                    coords: [10.973, 106.494],
                    countryCode: 'VN',
                  },
                ],
              },
              {
                type: 'road',
                fromName: 'Cửa khẩu Quốc tế Mộc Bài – Bavet',
                toName: 'Phnom Penh',
                distanceKm: 170,
                durationHours: 4,
                stops: [],
              },
            ],
            waypoints: [
              {
                type: 'checkpoint',
                name: 'Cửa khẩu Quốc tế Mộc Bài – Bavet',
                countryCode: 'VN',
                coords: [11.0743, 106.1821],
              },
            ],
          },
        },
      },
      reservations: [],
    },
    MOCK_AIRPORTS,
    MOCK_STOPS,
  );

  assert.equal(suggestion.stops.length, 2);
  assert.equal(suggestion.stops[0].stopType, 'rest');
  assert.equal(suggestion.stops[0].lat, 10.973);
  assert.equal(suggestion.stops[0].lng, 106.494);
  assert.equal(suggestion.stops[1].stopType, 'border_check');
  assert.equal(suggestion.stops[1].locationName, 'Cửa khẩu Quốc tế Mộc Bài – Bavet');
  assert.equal(suggestion.stops[1].lat, 11.0743);
  assert.equal(suggestion.stops[1].lng, 106.1821);
  assert.equal(suggestion.stops[1].geofenceRadiusM, 1000);
});

test('RoutesStore.replaceRouteStops & findStopsByRouteId: persists and returns stop GPS coordinates, geofenceRadiusM, ref, direction, and leg_id', async () => {
  const executed = [];
  const mockPool = {
    async execute(sql, params) {
      const s = String(sql);
      executed.push({ sql: s, params });
      if (s.includes('SELECT leg_id, sequence_no FROM route_leg')) {
        return [[{ leg_id: 701, sequence_no: 1 }]];
      }
      if (s.includes('SELECT route_stop_id')) {
        return [[{
          route_stop_id: 901,
          route_id: 55,
          leg_id: 701,
          sequence_no: 1,
          direction: 'outbound',
          stop_type: 'border_check',
          location_name: 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài',
          country: 'Vietnam',
          planned_arrival: '2026-12-10T04:00:00.000Z',
          planned_departure: '2026-12-10T05:00:00.000Z',
          lat: '11.066700',
          lng: '106.183300',
          geofence_radius_m: 1000,
          location_ref_type: 'master_stop',
          location_ref_id: 4,
          status: 'pending',
        }]];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const store = new RoutesStore({ prepareLegs: async () => [] }, mockPool);
  await store.replaceRouteStops(55, [
    {
      sequenceNo: 1,
      legSequenceNo: 1,
      direction: 'outbound',
      stopType: 'border_check',
      locationName: 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài',
      country: 'Vietnam',
      plannedArrival: '2026-12-10T04:00:00.000Z',
      plannedDeparture: '2026-12-10T05:00:00.000Z',
      lat: 11.0667,
      lng: 106.1833,
      geofenceRadiusM: 1000,
      locationRefType: 'master_stop',
      locationRefId: 4,
    },
  ]);

  const insertCall = executed.find((q) => q.sql.includes('INSERT INTO route_stop'));
  assert.ok(insertCall, 'expected INSERT INTO route_stop');
  assert.match(insertCall.sql, /\blat\b/);
  assert.match(insertCall.sql, /\blng\b/);
  assert.match(insertCall.sql, /\bgeofence_radius_m\b/);
  assert.match(insertCall.sql, /\blocation_ref_type\b/);
  assert.match(insertCall.sql, /\blocation_ref_id\b/);
  assert.equal(insertCall.params[1], 701, 'legSequenceNo 1 resolved to leg_id 701');
  assert.equal(insertCall.params[9], 11.0667);
  assert.equal(insertCall.params[10], 106.1833);
  assert.equal(insertCall.params[11], 1000);
  assert.equal(insertCall.params[12], 'master_stop');
  assert.equal(insertCall.params[13], 4);

  const stops = await store.findStopsByRouteId(55);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].lat, 11.0667);
  assert.equal(stops[0].lng, 106.1833);
  assert.equal(stops[0].geofenceRadiusM, 1000);
  assert.equal(stops[0].locationRefType, 'master_stop');
  assert.equal(stops[0].locationRefId, 4);
});

test('RoutesService.buildDetailedPlan: enriches stops from master_stop catalog so GPS check-in has coordinates', async () => {
  let savedDto = null;
  const routesStore = {
    findRouteByShipmentId: async () => ({ id: 55, shipmentId: 3, planStatus: 'draft', stops: [] }),
    findAllMasterStops: async () => MOCK_STOPS,
    saveDetailedPlan: async (_routeId, dto) => { savedDto = dto; },
    findRouteById: async () => ({ id: 55, shipmentId: 3, planStatus: 'draft' }),
  };
  const ordersStore = {
    findById: async () => ({
      id: 3,
      requestedHorseCount: 2,
      tripType: 'one_way',
      transportationType: 'road',
      originLocation: 'TP.HCM, Vietnam',
      destinationLocation: 'Phnom Penh, Cambodia',
    }),
  };
  const fleetStore = {
    findRequiredStallSlots: async () => 2,
    findShipmentReservations: async () => [],
    findVehiclesByIds: async () => [{ id: 7, capacity: 4, plateOrCode: 'TRK-07' }],
  };
  const documentsService = {
    detectRecognizedCountry: (loc) => (String(loc).includes('Cambodia') ? 'Cambodia' : 'Vietnam'),
  };
  const svc = new RoutesService(routesStore, ordersStore, fleetStore, documentsService, {}, { onChange() {} });

  await svc.buildDetailedPlan(
    { id: 1, role: 'LOGISTICS_MANAGER', email: 'm@test.local', fullName: 'Manager' },
    3,
    {
      routeName: 'Road VN-KH',
      totalDistanceKm: 240,
      legs: [
        {
          sequenceNo: 1,
          legType: 'road',
          originLocation: 'TP.HCM, Vietnam',
          destinationLocation: 'Phnom Penh, Cambodia',
          vehicleId: 7,
          plannedDeparture: '2026-12-10T01:00:00.000Z',
          plannedArrival: '2026-12-10T08:00:00.000Z',
        },
      ],
      stops: [
        // Stop matching master_stop by name without lat/lng -> should auto-populate GPS coords
        {
          sequenceNo: 1,
          stopType: 'border_check',
          locationName: 'Cửa khẩu Quốc tế Mộc Bài',
        },
        // Manually geocoded stop -> should preserve lat/lng
        {
          sequenceNo: 2,
          stopType: 'rest',
          locationName: 'Trạm nghỉ địa phương Tây Ninh',
          country: 'Vietnam',
          lat: 11.31,
          lng: 106.1,
        },
      ],
    },
  );

  assert.ok(savedDto);
  assert.equal(savedDto.stops[0].lat, 11.076);
  assert.equal(savedDto.stops[0].lng, 106.174);
  assert.equal(savedDto.stops[0].locationRefType, 'master_stop');
  assert.equal(savedDto.stops[0].locationRefId, 10);
  assert.equal(savedDto.stops[0].country, 'Vietnam');

  assert.equal(savedDto.stops[1].lat, 11.31);
  assert.equal(savedDto.stops[1].lng, 106.1);
  assert.equal(savedDto.stops[1].locationRefType, 'address');
});

test('TrackingStore.findStopCoordinates & TrackingService.getLiveTracking: resolves border_crossing / master_stop by refId and exposes geofenceRadiusM', async () => {
  const queries = [];
  const mockPool = {
    async execute(sql, params) {
      const s = String(sql);
      queries.push({ sql: s, params });
      if (s.includes('SELECT * FROM route_stop WHERE route_stop_id = ?')) {
        if (params[0] === 901) {
          return [[{
            route_stop_id: 901,
            route_id: 55,
            leg_id: 701,
            sequence_no: 1,
            stop_type: 'border_check',
            location_name: 'Cửa khẩu Mộc Bài (đổi tên nhẹ)',
            country: 'Vietnam',
            lat: null,
            lng: null,
            geofence_radius_m: null,
            location_ref_type: 'master_stop',
            location_ref_id: 4,
            status: 'pending',
          }]];
        }
        return [[{
          route_stop_id: 902,
          route_id: 55,
          leg_id: 701,
          sequence_no: 2,
          stop_type: 'border_check',
          location_name: 'Cửa khẩu Quốc tế Mộc Bài – Bavet',
          country: 'Vietnam',
          lat: null,
          lng: null,
          geofence_radius_m: null,
          location_ref_type: null,
          location_ref_id: null,
          status: 'pending',
        }]];
      }
      if (s.includes('FROM master_stop WHERE stop_id = ?')) {
        return [[{ lat: '11.066700', lng: '106.183300' }]];
      }
      if (s.includes('FROM master_stop')) {
        return [[]];
      }
      if (s.includes('FROM border_crossing')) {
        return [[{ lat: '11.074300', lng: '106.182100' }]];
      }
      return [[]];
    },
  };

  const trackingStore = new TrackingStore(mockPool);
  const byRefId = await trackingStore.findStopCoordinates(901);
  assert.ok(byRefId);
  assert.equal(byRefId.lat, 11.0667);
  assert.equal(byRefId.lng, 106.1833);

  const byBorderTable = await trackingStore.findStopCoordinates(902);
  assert.ok(byBorderTable);
  assert.equal(byBorderTable.lat, 11.0743);
  assert.equal(byBorderTable.lng, 106.1821);

  // Live tracking fallback resolves null-lat stops and populates default geofenceRadiusM (1000m for border_check, 300m for rest)
  const svc = new TrackingService(
    {
      findShipmentById: async () => ({ shipment_id: 3, customer_id: 10, status: 'in_transit' }),
      findAssignedStaff: async () => [{ user_id: 50, role_in_shipment: 'driver' }],
      findRouteByShipmentId: async () => ({ route_id: 55 }),
      findLegsByRouteId: async () => [],
      findStopsByRouteId: async () => [
        { route_stop_id: 901, sequence_no: 1, location_name: 'Cửa khẩu Mộc Bài', stop_type: 'border_check', lat: null, lng: null, geofence_radius_m: null, status: 'pending' },
        { route_stop_id: 903, sequence_no: 2, location_name: 'Trạm nghỉ Củ Chi', stop_type: 'rest', lat: 10.973, lng: 106.494, geofence_radius_m: null, status: 'pending' },
      ],
      findStopCoordinates: async (id) => (id === 901 ? { lat: 11.0667, lng: 106.1833, locationRefType: 'master_stop' } : null),
      findLatestPing: async () => null,
      findTripStatusLogs: async () => [],
      findRecentPingsForShipment: async () => [],
      findHorsesInOrder: async () => [],
      findHorseHealthLogs: async () => [],
      getSetting: async () => null,
    },
    { createNotification: async () => {}, notifyRole: async () => {} },
    {},
  );

  const live = await svc.getLiveTracking({ id: 50, role: 'DRIVER_ESCORT' }, 3);
  assert.equal(live.stops.length, 2);
  assert.equal(live.stops[0].lat, 11.0667);
  assert.equal(live.stops[0].lng, 106.1833);
  assert.equal(live.stops[0].geofenceRadiusM, 1000);
  assert.equal(live.stops[1].lat, 10.973);
  assert.equal(live.stops[1].lng, 106.494);
  assert.equal(live.stops[1].geofenceRadiusM, 300);
});

test('composeDraftSuggestion: REQ-002 (TP.HCM -> Bangkok, null coords, transportationType="road") picks Moc Bai via city coords instead of Huu Nghi Lang Son', () => {
  const orderedCatalog = [
    // Alphabetically first in Vietnam: Huu Nghi (Lang Son, China border)
    { id: 5, name: 'Cửa khẩu Quốc tế Hữu Nghị', stopType: 'border_check', address: 'Lạng Sơn', city: 'Lạng Sơn', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 21.9833, lng: 106.7167 },
    { id: 2, name: 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài', stopType: 'quarantine', address: 'QL22, Bến Cầu', city: 'Tây Ninh', country: 'Vietnam', hasVeterinarian: true, hasStalls: true, lat: 11.0667, lng: 106.1833 },
    { id: 6, name: 'Tuas Checkpoint & Equine Holding Facility', stopType: 'border_check', address: 'Tuas', city: 'Tuas', country: 'Singapore', hasVeterinarian: true, hasStalls: true, lat: 1.3436, lng: 103.6364 },
  ];

  const req002 = RoutesService.composeDraftSuggestion(
    {
      shipment: {
        shipmentId: 2,
        originLocation: 'Trạm Điều phối Thủ Đức (TP.HCM)',
        destinationLocation: 'Trạm Đối tác Bangkok (Thái Lan)',
        originLat: null,
        originLng: null,
        destinationLat: null,
        destinationLng: null,
        requestedHorseCount: 2,
        transportMode: null,
        transportationType: 'road',
        tripType: 'one_way',
        pickupAt: '2026-12-10T01:00:00.000Z',
        departureDate: '2026-12-10',
        returnDepartureAt: null,
        allocationSnapshot: null,
      },
      quote: null,
      reservations: [],
    },
    MOCK_AIRPORTS,
    orderedCatalog,
  );

  assert.equal(req002.stops.length, 1);
  assert.equal(req002.stops[0].locationName, 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài');
  assert.equal(req002.stops[0].locationRefId, 2);
});

test('TrackingStore.resolveLocationCoords: isolates per-table errors (border_crossing missing -> still resolves airport with refType) & strips parenthetical suffix', async () => {
  const mockPool = {
    async execute(sql, params) {
      const s = String(sql);
      if (s.includes('FROM border_crossing')) {
        const err = new Error("Table 'border_crossing' doesn't exist");
        err.code = 'ER_NO_SUCH_TABLE';
        throw err;
      }
      if (s.includes('FROM master_stop')) {
        if (String(params[0]).toLowerCase() === 'cửa khẩu quốc tế mộc bài') {
          return [[{ lat: '11.066700', lng: '106.183300' }]];
        }
        return [[]];
      }
      if (s.includes('FROM airport')) {
        if (String(params[0]).toLowerCase().includes('tân sơn nhất')) {
          return [[{ lat: '10.818500', lng: '106.651900' }]];
        }
        return [[]];
      }
      return [[]];
    },
  };

  const store = new TrackingStore(mockPool);
  // 1. border_crossing throws, yet airport lookup MUST still execute and return refType='airport'
  const airportRes = await store.resolveLocationCoords('Sân bay Quốc tế Tân Sơn Nhất');
  assert.ok(airportRes, 'airport lookup must not be aborted when border_crossing fails');
  assert.equal(airportRes.lat, 10.8185);
  assert.equal(airportRes.lng, 106.6519);
  assert.equal(airportRes.refType, 'airport');

  // 2. Trailing parenthetical "(Tây Ninh)" stripped on secondary candidate matches master_stop
  const parenRes = await store.resolveLocationCoords('Cửa khẩu Quốc tế Mộc Bài (Tây Ninh)');
  assert.ok(parenRes, 'parenthetical suffix should be stripped for secondary lookup');
  assert.equal(parenRes.lat, 11.0667);
  assert.equal(parenRes.lng, 106.1833);
  assert.equal(parenRes.refType, 'master_stop');
});

test('TrackingService.checkInStop: propagates resolved airport refType from findStopCoordinates so 1000m geofence applies', async () => {
  const updated = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 10, customer_id: 5, status: 'in_transit', request_code: 'REQ-010' }),
    findAssignedStaff: async () => [{ user_id: 50, role_in_shipment: 'driver' }],
    findRouteByShipmentId: async () => ({ route_id: 88, plan_status: 'in_transit' }),
    findStopsByRouteId: async () => [
      {
        route_stop_id: 910,
        route_id: 88,
        leg_id: 710,
        sequence_no: 1,
        stop_type: 'other',
        location_name: 'Sân bay Quốc tế Tân Sơn Nhất',
        country: 'Vietnam',
        lat: null,
        lng: null,
        geofence_radius_m: null,
        location_ref_type: null,
        status: 'pending',
      },
    ],
    findLegsByRouteId: async () => [
      { leg_id: 710, sequence_no: 1, leg_type: 'road', status: 'active', actual_departure: new Date('2026-12-10T01:00:00Z') },
    ],
    findStopCoordinates: async () => ({
      routeStopId: 910,
      routeId: 88,
      legId: 710,
      sequenceNo: 1,
      stopType: 'other',
      locationName: 'Sân bay Quốc tế Tân Sơn Nhất',
      country: 'Vietnam',
      lat: 10.8185,
      lng: 106.6519,
      geofenceRadiusM: null,
      locationRefType: 'airport',
      actualArrival: null,
      actualDeparture: null,
      status: 'pending',
    }),
    getSetting: async () => null,
    updateStopStatus: async (...args) => { updated.push(args); },
    recordTripStatusLog: async () => {},
    saveVehiclePositionPings: async () => 1,
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
  };
  const service = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, {});
  service.getTrackingDetails = async () => ({ shipmentId: 10 });

  // ~600m north of SGN airport -> outside 300m default, INSIDE 1000m airport geofence
  await service.checkInStop(
    { id: 50, role: 'DRIVER_ESCORT', email: 'd@test.local', fullName: 'Driver' },
    10,
    910,
    {
      action: 'arrived',
      location: { lat: 10.8239, lng: 106.6519, accuracyM: 15, source: 'gps' },
    },
  );
  assert.equal(updated.length, 1);
  const locEvidence = updated[0][8];
  assert.equal(locEvidence.geofencePassed, true);
  assert.equal(locEvidence.flagged, false);
});

test('RoutesStore.consolidateSharedRoadTripWaypoints & in-transit reroute: preserve stop GPS coords and legSequenceNo', async () => {
  const executed = [];
  const mockConn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query() { return [[]]; },
    async execute(sql, params) {
      const s = String(sql);
      executed.push({ sql: s, params });
      if (s.includes('FROM route_leg rl') && s.includes('WHERE rl.road_trip_id = ?')) {
        return [[
          {
            shipment_id: 1,
            origin_location: 'Củ Chi, TP.HCM',
            destination_location: 'Phnom Penh, Campuchia',
            request_code: 'REQ-001',
            route_id: 10,
            leg_id: 100,
            leg_origin: 'Củ Chi, TP.HCM',
            leg_dest: 'Phnom Penh, Campuchia',
          },
          {
            shipment_id: 2,
            origin_location: 'Thủ Đức, TP.HCM',
            destination_location: 'Phnom Penh, Campuchia',
            request_code: 'REQ-002',
            route_id: 20,
            leg_id: 200,
            leg_origin: 'Thủ Đức, TP.HCM',
            leg_dest: 'Phnom Penh, Campuchia',
          },
        ]];
      }
      if (s.includes('FROM route_stop') && s.includes('WHERE route_id IN')) {
        return [[
          {
            route_stop_id: 500,
            route_id: 10,
            leg_id: 100,
            sequence_no: 1,
            stop_type: 'border_check',
            location_name: 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài',
            country: 'Vietnam',
            planned_arrival: null,
            planned_departure: null,
            lat: '11.066700',
            lng: '106.183300',
            geofence_radius_m: 1000,
            location_ref_type: 'master_stop',
            location_ref_id: 2,
            status: 'pending',
            actual_arrival: null,
            actual_departure: null,
            updated_by: null,
            notes: null,
          },
        ]];
      }
      if (s.includes('FROM road_trip WHERE road_trip_id = ?')) {
        return [[{ origin_location: 'Thủ Đức, TP.HCM', destination_location: 'Phnom Penh, Campuchia' }]];
      }
      if (s.includes('FROM shipment_horse')) {
        return [[]];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const store = new RoutesStore({ prepareLegs: async () => [] }, { getConnection: async () => mockConn });
  await store.consolidateSharedRoadTripWaypoints(77, mockConn, 10);

  const siblingBorderInsert = executed.find(
    (q) => q.sql.includes('INSERT INTO route_stop') && q.params[0] === 20 && q.params[4] === 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài',
  );
  assert.ok(siblingBorderInsert, 'Sibling route #20 should receive propagated border stop');
  assert.match(siblingBorderInsert.sql, /\blat\b/);
  assert.match(siblingBorderInsert.sql, /\blng\b/);
  assert.equal(siblingBorderInsert.params[8], 11.0667);
  assert.equal(siblingBorderInsert.params[9], 106.1833);
  assert.equal(siblingBorderInsert.params[10], 1000);
  assert.equal(siblingBorderInsert.params[11], 'master_stop');
  assert.equal(siblingBorderInsert.params[12], 2);
});

test('RoutesService.createOrUpdateRoute: enriches legacy route stops from master_stop catalog', async () => {
  let replacedStops = null;
  const routesStore = {
    findRouteByShipmentId: async () => ({ id: 60, shipmentId: 3, planStatus: 'draft' }),
    updateRouteDetails: async () => {},
    findAllMasterStops: async () => MOCK_STOPS,
    replaceRouteStops: async (_routeId, stops) => { replacedStops = stops; },
    findRouteById: async () => ({ id: 60, shipmentId: 3, planStatus: 'draft' }),
  };
  const ordersStore = {
    findById: async () => ({ id: 3, status: 'planning' }),
  };
  const svc = new RoutesService(routesStore, ordersStore, {}, {}, {}, { onChange() {} });
  await svc.createOrUpdateRoute(
    { id: 1, role: 'LOGISTICS_MANAGER', email: 'm@test.local', fullName: 'Manager' },
    3,
    {
      routeName: 'Legacy Route',
      stops: [
        { sequenceNo: 1, stopType: 'border_check', locationName: 'Cửa khẩu Quốc tế Mộc Bài' },
        { sequenceNo: 2, stopType: 'rest', locationName: 'Trạm nghỉ B', lat: 11.2, lng: 105.5 },
      ],
    },
  );
  assert.ok(Array.isArray(replacedStops));
  assert.equal(replacedStops[0].lat, 11.076);
  assert.equal(replacedStops[0].lng, 106.174);
  assert.equal(replacedStops[0].locationRefType, 'master_stop');
  assert.equal(replacedStops[0].locationRefId, 10);
  assert.equal(replacedStops[1].lat, 11.2);
  assert.equal(replacedStops[1].lng, 105.5);
});
