const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { buildConsolidatedRoadItinerary } = require('../dist/common/road-trip-sequencing');
const { UserRole } = require('../dist/modules/auth/auth.types');

const driverUser = { id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com', specialization: 'driver', fullName: 'Tài xế 1' };

test('domestic single-leg road stop check-in does NOT complete leg 1 or release vehicle', async () => {
  const legUpdates = [];
  const vehicleUpdates = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 125, customer_id: 13, status: 'in_transit', request_code: 'REQ-125' }),
    findRouteByShipmentId: async () => ({ route_id: 8, plan_status: 'in_transit' }),
    findStopsByRouteId: async () => [{ route_stop_id: 17, route_id: 8, leg_id: 11, sequence_no: 1, stop_type: 'rest', location_name: 'Cam Ranh', country: 'Vietnam', status: 'pending' }],
    findLegsByRouteId: async () => [{ leg_id: 11, sequence_no: 1, leg_type: 'road', vehicle_id: 3, road_trip_id: null, status: 'active', actual_departure: new Date() }],
    updateStopStatus: async () => {},
    updateLegStatus: async (...args) => legUpdates.push(args),
    updateVehicleStatus: async (...args) => vehicleUpdates.push(args),
    recordTripStatusLog: async () => {},
    findAssignedStaff: async () => [],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
  };
  const service = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, {});
  await service.checkInStop(driverUser, 125, 17, { action: 'arrived' });
  assert.equal(legUpdates.length, 0);
  assert.equal(vehicleUpdates.length, 0);
});

test('multi-modal flight stop check-in on leg 1 still completes road leg 1', async () => {
  const legUpdates = [];
  const vehicleUpdates = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 33, customer_id: 6, status: 'in_transit', request_code: 'REQ-033' }),
    findRouteByShipmentId: async () => ({ route_id: 3, plan_status: 'in_transit' }),
    findStopsByRouteId: async () => [{ route_stop_id: 5, route_id: 3, leg_id: 7, sequence_no: 1, stop_type: 'quarantine', location_name: 'Sân bay Tân Sơn Nhất', country: 'Vietnam', status: 'arrived' }],
    findLegsByRouteId: async () => [
      { leg_id: 7, sequence_no: 1, leg_type: 'road', vehicle_id: 2, road_trip_id: null, status: 'active', actual_departure: new Date() },
      { leg_id: 8, sequence_no: 2, leg_type: 'flight', vehicle_id: null, road_trip_id: null, status: 'pending', actual_departure: null },
    ],
    updateStopStatus: async () => {},
    updateLegStatus: async (...args) => legUpdates.push(args),
    updateVehicleStatus: async (...args) => vehicleUpdates.push(args),
    recordTripStatusLog: async () => {},
    findAssignedStaff: async () => [],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
  };
  const service = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, {});
  await service.checkInStop(driverUser, 33, 5, { action: 'customs_cleared' });
  assert.equal(legUpdates.length, 1);
  assert.equal(legUpdates[0][0], 7);
  assert.equal(legUpdates[0][1], 'completed');
  assert.deepEqual(vehicleUpdates, [[2, 'available']]);
});

test('shared road_trip syncs leg start, stop check-in and leg completion across sibling shipments', async () => {
  const legUpdates = [];
  const stopUpdates = [];
  const shipmentUpdates = [];
  const routePlanUpdates = [];
  const logs = [];
  const notifications = [];

  const siblingStops = [{ route_stop_id: 21, route_id: 7, leg_id: 12, sequence_no: 1, stop_type: 'rest', location_name: 'Cam Ranh', country: 'Vietnam', status: 'pending' }];
  const siblingLeg = { leg_id: 12, route_id: 7, shipment_id: 127, sequence_no: 1, leg_type: 'road', vehicle_id: 3, road_trip_id: 1, status: 'pending', actual_departure: null, origin_location: 'HCM', destination_location: 'HN', request_code: 'REQ-127', customer_id: 6, shipment_status: 'ready_to_depart', assigned_coordinator_id: 4 };
  const primaryStops = [{ route_stop_id: 17, route_id: 8, leg_id: 11, sequence_no: 1, stop_type: 'rest', location_name: 'Cam Ranh', country: 'Vietnam', status: 'pending' }];
  const primaryLeg = { leg_id: 11, route_id: 8, shipment_id: 125, sequence_no: 1, leg_type: 'road', vehicle_id: 3, road_trip_id: 1, status: 'pending', actual_departure: null, origin_location: 'HCM', destination_location: 'HN' };

  const store = {
    findShipmentById: async id => ({ shipment_id: id, customer_id: id === 125 ? 13 : 6, status: primaryLeg.status === 'pending' ? 'ready_to_depart' : 'in_transit', request_code: `REQ-${id}` }),
    findRouteByShipmentId: async id => ({ route_id: id === 125 ? 8 : 7, plan_status: 'in_transit', assigned_coordinator_id: 4 }),
    findLegsByRouteId: async routeId => (routeId === 8 ? [primaryLeg] : [siblingLeg]),
    findStopsByRouteId: async routeId => (routeId === 8 ? primaryStops : siblingStops),
    findSiblingLegsByRoadTrip: async () => [siblingLeg],
    updateLegStatus: async (legId, status, dep, arr) => {
      legUpdates.push({ legId, status });
      const target = legId === 11 ? primaryLeg : siblingLeg;
      target.status = status;
      if (dep !== undefined) target.actual_departure = dep;
      if (arr !== undefined) target.actual_arrival = arr;
    },
    updateStopStatus: async (stopId, status) => {
      stopUpdates.push({ stopId, status });
      const s = stopId === 17 ? primaryStops[0] : siblingStops[0];
      s.status = status;
    },
    updateShipmentStatus: async (id, status) => {
      shipmentUpdates.push({ id, status });
      if (id === 127) siblingLeg.shipment_status = status;
    },
    updateRoutePlanStatus: async (routeId, status) => routePlanUpdates.push({ routeId, status }),
    updateVehicleStatus: async () => {},
    recordTripStatusLog: async log => logs.push(log),
    findAssignedStaff: async () => [],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
  };

  const service = new TrackingService(
    store,
    { createNotification: async (...args) => notifications.push(args), notifyRole: async () => {} },
    { getTripPlanReadiness: async () => ({ isReadyToDepart: true, pendingConditions: [] }) },
  );

  await service.checkInLegStart(driverUser, 125, 11, {});
  assert.deepEqual(legUpdates.map(x => [x.legId, x.status]), [[11, 'active'], [12, 'active']]);
  assert.deepEqual(shipmentUpdates, [[125, 'in_transit'], [127, 'in_transit']].map(([id, status]) => ({ id, status })));

  await service.checkInStop(driverUser, 125, 17, { action: 'arrived' });
  await service.checkInStop(driverUser, 125, 17, { action: 'departed' });
  assert.deepEqual(stopUpdates, [
    { stopId: 17, status: 'arrived' },
    { stopId: 21, status: 'arrived' },
    { stopId: 17, status: 'departed' },
    { stopId: 21, status: 'departed' },
  ]);
  assert.equal(primaryLeg.status, 'active');
  assert.equal(siblingLeg.status, 'active');

  await service.checkInLegArrival(driverUser, 125, 11, {});
  assert.equal(primaryLeg.status, 'completed');
  assert.equal(siblingLeg.status, 'completed');
  assert.ok(shipmentUpdates.some(x => x.id === 125 && x.status === 'completed'));
  assert.ok(shipmentUpdates.some(x => x.id === 127 && x.status === 'completed'));
  assert.ok(logs.some(l => l.shipmentId === 127 && l.milestoneType === 'leg_arrival'));
  assert.ok(notifications.some(n => n[0] === 6 && n[4] === 127));
});

test('buildConsolidatedRoadItinerary orders farther->closer pickups and closer->farther dropoffs cleanly', () => {
  // Case 1: 2 origins -> 1 shared destination (reversed input order)
  const oneDest = buildConsolidatedRoadItinerary({
    shipments: [
      { shipmentId: 127, requestCode: 'REQ-127', originLocation: 'thủ đức, hồ chí minh,việt nam', destinationLocation: 'Đống Đa, Ha Noi, Vietnam' },
      { shipmentId: 125, requestCode: 'REQ-125', originLocation: 'Củ Chi, Ho chi Minh, Vietnam', destinationLocation: 'Đống Đa, Ha Noi, Vietnam' },
    ],
    corridorStops: [
      { stopType: 'rest', locationName: 'Cam Ranh' },
      { stopType: 'rest', locationName: 'Đà Nẵng' },
      { stopType: 'rest', locationName: 'Vinh' },
    ],
  });
  assert.equal(oneDest.canonicalOrigin, 'Củ Chi, Ho chi Minh, Vietnam');
  assert.equal(oneDest.canonicalDestination, 'Đống Đa, Ha Noi, Vietnam');
  assert.deepEqual(
    oneDest.stops.map((s) => [s.stopRole, s.locationName]),
    [
      ['pickup', 'thủ đức, hồ chí minh,việt nam'],
      ['transit', 'Cam Ranh'],
      ['transit', 'Đà Nẵng'],
      ['transit', 'Vinh'],
    ],
  );

  // Case 2: 2 different origins -> 2 different destinations (even without corridor stops)
  const twoDestNoCorridor = buildConsolidatedRoadItinerary({
    shipments: [
      { shipmentId: 127, requestCode: 'REQ-127', originLocation: 'thủ đức, hồ chí minh,việt nam', destinationLocation: 'quận hoàng mai, hà nội,việt nam' },
      { shipmentId: 125, requestCode: 'REQ-125', originLocation: 'Củ Chi, Ho chi Minh, Vietnam', destinationLocation: 'Đống Đa, Ha Noi, Vietnam' },
    ],
    corridorStops: [],
  });
  assert.equal(twoDestNoCorridor.canonicalOrigin, 'Củ Chi, Ho chi Minh, Vietnam');
  assert.equal(twoDestNoCorridor.canonicalDestination, 'Đống Đa, Ha Noi, Vietnam');
  assert.deepEqual(
    twoDestNoCorridor.stops.map((s) => [s.stopRole, s.locationName]),
    [
      ['pickup', 'thủ đức, hồ chí minh,việt nam'],
      ['dropoff', 'quận hoàng mai, hà nội,việt nam'],
    ],
  );

  // Case 3: Reverse direction North -> South
  const northToSouth = buildConsolidatedRoadItinerary({
    shipments: [
      { shipmentId: 201, requestCode: 'REQ-201', originLocation: 'Hoàng Mai, Hà Nội', destinationLocation: 'Thủ Đức, TP. Hồ Chí Minh' },
      { shipmentId: 202, requestCode: 'REQ-202', originLocation: 'Sóc Sơn, Hà Nội', destinationLocation: 'Củ Chi, TP. Hồ Chí Minh' },
    ],
    corridorStops: [{ stopType: 'rest', locationName: 'Vinh' }, { stopType: 'rest', locationName: 'Cam Ranh' }],
  });
  assert.equal(northToSouth.canonicalOrigin, 'Sóc Sơn, Hà Nội');
  assert.equal(northToSouth.canonicalDestination, 'Củ Chi, TP. Hồ Chí Minh');
  assert.deepEqual(
    northToSouth.stops.map((s) => [s.stopRole, s.locationName]),
    [
      ['pickup', 'Hoàng Mai, Hà Nội'],
      ['transit', 'Vinh'],
      ['transit', 'Cam Ranh'],
      ['dropoff', 'Thủ Đức, TP. Hồ Chí Minh'],
    ],
  );
});

test('consolidated road trip enforces customer privacy, full driver milestones, and partial dropoff handover', async () => {
  const shipmentsDb = {
    125: {
      shipment_id: 125, customer_id: 13, status: 'in_transit', request_code: 'REQ-125', customer_request_code: 'REQ-001',
      origin_location: 'Củ Chi, Ho chi Minh, Vietnam', destination_location: 'Đống Đa, Ha Noi, Vietnam', route_id: 8, assigned_coordinator_id: 4,
    },
    127: {
      shipment_id: 127, customer_id: 6, status: 'in_transit', request_code: 'REQ-127', customer_request_code: 'REQ-002',
      origin_location: 'thủ đức, hồ chí minh,việt nam', destination_location: 'quận hoàng mai, hà nội,việt nam', route_id: 7, assigned_coordinator_id: 4,
    },
  };
  const legsDb = {
    8: [{ leg_id: 11, route_id: 8, sequence_no: 1, leg_type: 'road', road_trip_id: 1, vehicle_id: 3, origin_location: 'Củ Chi, Ho chi Minh, Vietnam', destination_location: 'Đống Đa, Ha Noi, Vietnam', status: 'active', actual_departure: new Date(), actual_arrival: null }],
    7: [{ leg_id: 12, route_id: 7, sequence_no: 1, leg_type: 'road', road_trip_id: 1, vehicle_id: 3, origin_location: 'Củ Chi, Ho chi Minh, Vietnam', destination_location: 'Đống Đa, Ha Noi, Vietnam', status: 'active', actual_departure: new Date(), actual_arrival: null }],
  };
  const makeStops = (routeId, baseId) => [
    { route_stop_id: baseId + 1, route_id: routeId, leg_id: routeId === 8 ? 11 : 12, sequence_no: 1, stop_type: 'transfer_hub', location_name: 'thủ đức, hồ chí minh,việt nam', country: 'Việt Nam', status: 'departed', actual_departure: new Date() },
    { route_stop_id: baseId + 2, route_id: routeId, leg_id: routeId === 8 ? 11 : 12, sequence_no: 2, stop_type: 'rest', location_name: 'Cam Ranh', country: 'Việt Nam', status: 'departed', actual_departure: new Date() },
    { route_stop_id: baseId + 3, route_id: routeId, leg_id: routeId === 8 ? 11 : 12, sequence_no: 3, stop_type: 'transfer_hub', location_name: 'quận hoàng mai, hà nội,việt nam', country: 'Việt Nam', status: 'pending', actual_arrival: null, actual_departure: null },
  ];
  const stopsDb = { 8: makeStops(8, 100), 7: makeStops(7, 200) };
  const logsDb = {
    125: [],
    127: [
      { id: 1, shipmentId: 127, routeId: 7, legId: 12, routeStopId: null, milestoneType: 'leg_departure', milestoneName: 'Xuất phát chặng 1: Củ Chi, Ho chi Minh, Vietnam', notes: 'Đồng bộ xuất phát chuyến ghép #1' },
      { id: 2, shipmentId: 127, routeId: 7, legId: 12, routeStopId: 201, milestoneType: 'stop_arrival', milestoneName: 'thủ đức - ARRIVED', notes: 'Đồng bộ trạm dừng chuyến ghép #1' },
    ],
  };
  const notifications = [];
  const vehicleReleases = [];

  const store = {
    findShipmentById: async (id) => shipmentsDb[id],
    findRouteByShipmentId: async (id) => ({ route_id: id === 125 ? 8 : 7, plan_status: shipmentsDb[id].status === 'completed' ? 'completed' : 'in_transit', assigned_coordinator_id: 4 }),
    findLegsByRouteId: async (routeId) => legsDb[routeId],
    findStopsByRouteId: async (routeId) => stopsDb[routeId],
    findShipmentsByRoadTripId: async () => [
      { ...shipmentsDb[125], leg_id: 11, leg_sequence_no: 1, total_legs: 1, leg_status: legsDb[8][0].status, leg_actual_arrival: legsDb[8][0].actual_arrival, shipment_status: shipmentsDb[125].status },
      { ...shipmentsDb[127], leg_id: 12, leg_sequence_no: 1, total_legs: 1, leg_status: legsDb[7][0].status, leg_actual_arrival: legsDb[7][0].actual_arrival, shipment_status: shipmentsDb[127].status },
    ],
    findSiblingLegsByRoadTrip: async (roadTripId, excludeLegId) => {
      const target = excludeLegId === 11 ? { leg: legsDb[7][0], s: shipmentsDb[127] } : { leg: legsDb[8][0], s: shipmentsDb[125] };
      if (target.s.status !== 'in_transit') return [];
      return [{ ...target.leg, shipment_id: target.s.shipment_id, shipment_status: target.s.status, customer_id: target.s.customer_id, request_code: target.s.request_code, assigned_coordinator_id: 4, shipment_origin_location: target.s.origin_location, shipment_destination_location: target.s.destination_location }];
    },
    updateStopStatus: async (stopId, status) => {
      for (const arr of Object.values(stopsDb)) {
        const s = arr.find((x) => x.route_stop_id === stopId);
        if (s) s.status = status;
      }
    },
    updateLegStatus: async (legId, status, dep, arr) => {
      for (const arrLegs of Object.values(legsDb)) {
        const l = arrLegs.find((x) => x.leg_id === legId);
        if (l) {
          l.status = status;
          if (dep !== undefined) l.actual_departure = dep;
          if (arr !== undefined) l.actual_arrival = arr;
        }
      }
    },
    updateShipmentStatus: async (id, status) => { shipmentsDb[id].status = status; },
    updateRoutePlanStatus: async () => {},
    updateVehicleStatus: async (vId, st) => { vehicleReleases.push([vId, st]); },
    recordTripStatusLog: async (log) => { (logsDb[log.shipmentId] ||= []).push(log); },
    findAssignedStaff: async () => [],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async (id) => logsDb[id] || [],
  };

  const service = new TrackingService(store, { createNotification: async (...args) => notifications.push(args), notifyRole: async () => {} }, {});

  // 1. Driver sees full 5-milestone consolidated path on BOTH #125 and #127
  const driver127 = await service.getTrackingDetails(driverUser, 127);
  assert.ok(driver127.consolidatedRouteSummary.includes('Củ Chi'));
  assert.ok(driver127.consolidatedRouteSummary.includes('thủ đức'));
  assert.ok(driver127.consolidatedRouteSummary.includes('quận hoàng mai'));
  assert.ok(driver127.consolidatedRouteSummary.includes('Đống Đa'));
  assert.equal(driver127.milestones.length, 5);
  assert.match(driver127.milestones[0].title, /Củ Chi/);
  assert.match(driver127.milestones[1].title, /Điểm đón hàng ghép.*thủ đức/);
  assert.match(driver127.milestones[3].title, /Điểm trả hàng ghép.*quận hoàng mai/);
  assert.equal(driver127.milestones[3].status, 'CURRENT');
  assert.match(driver127.milestones[4].title, /Đống Đa/);

  // 2. Customer 6 (#127) privacy: NEVER sees Cu Chi, Dong Da, transfer_hub stops, or consolidated summary
  const customerUser = { id: '6', role: UserRole.CUSTOMER, email: 'cust@example.com' };
  const cust127 = await service.getTrackingDetails(customerUser, 127);
  assert.equal(cust127.consolidatedRouteSummary, null);
  assert.deepEqual(
    cust127.milestones.map((m) => m.location),
    ['thủ đức, hồ chí minh,việt nam', 'Cam Ranh, Việt Nam', 'quận hoàng mai, hà nội,việt nam'],
  );
  assert.ok(!JSON.stringify(cust127).includes('Củ Chi'));
  assert.ok(!JSON.stringify(cust127).includes('Đống Đa'));
  assert.ok(!JSON.stringify(cust127).toLowerCase().includes('chuyến ghép'));

  // 3. Partial dropoff at Hoang Mai completes #127 WITHOUT completing #125 or Dong Da milestone
  await service.checkInStop(driverUser, 125, 103, { action: 'arrived' });
  const afterDropoff125 = await service.checkInStop(driverUser, 125, 103, { action: 'departed' });
  assert.equal(shipmentsDb[127].status, 'completed');
  assert.equal(shipmentsDb[125].status, 'in_transit');
  assert.equal(vehicleReleases.length, 0);
  assert.ok(notifications.some((n) => n[0] === 6 && String(n[2]).includes('quận hoàng mai') && !String(n[2]).includes('Đống Đa')));
  assert.equal(afterDropoff125.milestones[4].status, 'CURRENT');

  const driver127AfterDrop = await service.getTrackingDetails(driverUser, 127);
  assert.equal(driver127AfterDrop.milestones[4].status, 'CURRENT');

  // 4. Customer routes service also masks shared leg & strips transfer_hub stops
  const routesSvc = new RoutesService(
    {
      findRouteByShipmentId: async () => ({
        id: 7,
        shipmentId: 127,
        legs: [{ id: 12, sequenceNo: 1, legType: 'road', roadTripId: 1, originLocation: 'Củ Chi, Ho chi Minh, Vietnam', destinationLocation: 'Đống Đa, Ha Noi, Vietnam' }],
        stops: [
          { id: 201, sequenceNo: 1, stopType: 'transfer_hub', locationName: 'thủ đức, hồ chí minh,việt nam' },
          { id: 202, sequenceNo: 2, stopType: 'rest', locationName: 'Cam Ranh' },
          { id: 203, sequenceNo: 3, stopType: 'transfer_hub', locationName: 'quận hoàng mai, hà nội,việt nam' },
        ],
      }),
    },
    { findById: async () => ({ id: 127, customerId: 6, originLocation: 'thủ đức, hồ chí minh,việt nam', destinationLocation: 'quận hoàng mai, hà nội,việt nam' }) },
    {}, {}, {},
  );
  const maskedRoute = await routesSvc.getRouteByShipmentId(127, customerUser);
  assert.equal(maskedRoute.legs[0].roadTripId, null);
  assert.equal(maskedRoute.legs[0].originLocation, 'thủ đức, hồ chí minh,việt nam');
  assert.equal(maskedRoute.legs[0].destinationLocation, 'quận hoàng mai, hà nội,việt nam');
  assert.deepEqual(maskedRoute.stops.map((s) => s.locationName), ['Cam Ranh']);
});
