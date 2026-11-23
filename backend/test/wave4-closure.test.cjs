const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, UnprocessableEntityException } = require('@nestjs/common');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { computeLifoStallAssignments } = require('../dist/common/road-trip-sequencing');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('BR-F3-03: buildDetailedPlan rejects duplicate sequenceNo and overlapping legs with 400, accepts chronological legs', async () => {
  let savedDto = null;
  const service = new RoutesService(
    {
      findRouteByShipmentId: async () => ({ id: 10, shipmentId: 100, planStatus: 'draft' }),
      saveDetailedPlan: async (_id, dto) => { savedDto = dto; },
      findRouteById: async (id) => ({ id, shipmentId: 100, planStatus: 'draft' }),
    },
    { findById: async () => ({ id: 100, status: 'planning', requestedHorseCount: 1 }) },
    { findVehiclesByIds: async () => [{ id: 1, capacity: 4 }] },
    { isFlow2CompletedForPayment: async () => false },
    { createNotification: async () => 1 },
    { changed: async () => {}, onChange: () => {} },
  );

  // Overlapping consecutive legs rejected with 400
  await assert.rejects(
    () =>
      service.buildDetailedPlan(
        { id: 4, role: UserRole.LOGISTICS_MANAGER },
        100,
        {
          routeName: 'Overlapping Legs',
          legs: [
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: 'A',
              destinationLocation: 'B',
              plannedDeparture: '2026-12-01T08:00:00Z',
              plannedArrival: '2026-12-01T14:00:00Z',
            },
            {
              sequenceNo: 2,
              legType: 'flight',
              originLocation: 'B',
              destinationLocation: 'C',
              plannedDeparture: '2026-12-01T12:00:00Z',
              plannedArrival: '2026-12-01T18:00:00Z',
            },
          ],
          stops: [],
        },
      ),
    (err) => err instanceof BadRequestException && err.getStatus() === 400,
  );

  // Duplicate sequenceNo rejected with 400
  await assert.rejects(
    () =>
      service.buildDetailedPlan(
        { id: 4, role: UserRole.LOGISTICS_MANAGER },
        100,
        {
          routeName: 'Duplicate Seq',
          legs: [
            { sequenceNo: 1, legType: 'road', originLocation: 'A', destinationLocation: 'B' },
            { sequenceNo: 1, legType: 'road', originLocation: 'B', destinationLocation: 'C' },
          ],
          stops: [],
        },
      ),
    (err) => err instanceof BadRequestException && err.getStatus() === 400,
  );

  // Valid sequential legs accepted
  await service.buildDetailedPlan(
    { id: 4, role: UserRole.LOGISTICS_MANAGER },
    100,
    {
      routeName: 'Sequential Legs',
      legs: [
        {
          sequenceNo: 1,
          legType: 'road',
          originLocation: 'A',
          destinationLocation: 'B',
          plannedDeparture: '2026-12-01T08:00:00Z',
          plannedArrival: '2026-12-01T12:00:00Z',
        },
        {
          sequenceNo: 2,
          legType: 'flight',
          originLocation: 'B',
          destinationLocation: 'C',
          plannedDeparture: '2026-12-01T14:00:00Z',
          plannedArrival: '2026-12-01T18:00:00Z',
        },
      ],
      stops: [],
    },
  );
  assert.equal(savedDto.legs.length, 2);
});

test('Spec v3.1 HTTP 409 Alignment: confirmed route lock & pre-transit completeOrder return 409 Conflict', async () => {
  const routesService = new RoutesService(
    { findRouteByShipmentId: async () => ({ id: 10, shipmentId: 100, planStatus: 'confirmed', activeIncident: null }) },
    { findById: async () => ({ id: 100, status: 'confirmed', requestedHorseCount: 1 }) },
    {},
    {},
    {},
    { changed: async () => {}, onChange: () => {} },
  );

  await assert.rejects(
    () => routesService.setStrategicFramework({ id: 2 }, 100, { managerVehicleType: 'Truck' }),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );
  await assert.rejects(
    () =>
      routesService.buildDetailedPlan(
        { id: 4 },
        100,
        { routeName: 'Locked', legs: [{ sequenceNo: 1, legType: 'road', originLocation: 'A', destinationLocation: 'B' }], stops: [] },
      ),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );

  const ordersService = new OrdersService(
    { findShipmentById: async () => ({ id: 100, status: 'ready_to_depart', customerId: 6 }) },
    { createNotification: async () => 1 },
  );
  await assert.rejects(
    () => ordersService.completeOrder({ id: 2, role: UserRole.LOGISTICS_MANAGER }, 100),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );
});

test('BR-F3-04: computeLifoStallAssignments assigns earlier drop-off lowest stall numbers & preserves manual overrides', () => {
  const orderedDestinations = [
    { location: 'Đà Nẵng', shipmentIds: [127], requestCodes: ['REQ-127'] },
    { location: 'Hà Nội', shipmentIds: [125], requestCodes: ['REQ-125'] },
  ];
  const updates = computeLifoStallAssignments(orderedDestinations, [
    { shipmentHorseId: 10, shipmentId: 125, quantity: 1, stallNumber: null },
    { shipmentHorseId: 11, shipmentId: 127, quantity: 2, stallNumber: null },
  ]);
  assert.deepEqual(updates, [
    { shipmentHorseId: 11, shipmentId: 127, stallNumber: 'S1-S2' },
    { shipmentHorseId: 10, shipmentId: 125, stallNumber: 'S3' },
  ]);

  const preserved = computeLifoStallAssignments(orderedDestinations, [
    { shipmentHorseId: 11, shipmentId: 127, quantity: 1, stallNumber: 'MANUAL-2' },
    { shipmentHorseId: 10, shipmentId: 125, quantity: 1, stallNumber: null },
  ]);
  assert.deepEqual(preserved, [
    { shipmentHorseId: 10, shipmentId: 125, stallNumber: 'S3' },
  ]);
});

test('BR-F2-02: getOrderComplianceChecklist computes orderCutoffDate and Tier-B earlyIssuanceWarning advisory', async () => {
  const departureIso = '2026-12-30T08:00:00.000Z';
  const service = new DocumentsService(
    {
      findOrderDetails: async () => ({
        shipment_id: 200,
        customer_id: 6,
        origin_location: 'TP.HCM, Vietnam',
        destination_location: 'Singapore Turf Club, Singapore',
        transportation_type: 'International',
        transport_mode: 'air',
        booking_type: 'shared_stall',
        requested_date: departureIso,
        departure_date: departureIso,
      }),
      findRegulations: async () => [
        {
          id: 1,
          country: 'Singapore',
          docTier: 'A',
          leadTimeDays: 14,
          requiresAuthorityApproval: false,
          minValidityBufferHours: 48,
          documentType: 'import_permit',
          transportMode: 'air',
        },
        {
          id: 2,
          country: 'Singapore',
          docTier: 'B',
          leadTimeDays: 1,
          requiresAuthorityApproval: false,
          minValidityBufferHours: 48,
          documentType: 'vet_health_cert',
          transportMode: 'air',
        },
      ],
      findHorsesInOrder: async () => [{ horse_id: 50, name: 'Comet', microchip_no: '985', passport_no: 'FEI-50' }],
      findDocumentsByHorseId: async () => [
        {
          id: 90,
          horseId: 50,
          regulationId: 2,
          status: 'submitted',
          issueDate: '2026-12-01', // Issued 29 days early (< D-10 for international Tier B)
          expiryDate: '2027-01-10',
        },
      ],
      hasRequirementsSent: async () => true,
    },
    { createNotification: async () => 1 },
    { onChange: () => {} },
  );

  const checklist = await service.getOrderComplianceChecklist(
    { id: 6, role: UserRole.CUSTOMER },
    200,
  );
  // maxTierALead = 14 -> orderCutoffDays = max(7, 14+2) = 16 -> 2026-12-30 - 16d = 2026-12-14
  assert.equal(checklist.orderCutoffDate, '2026-12-14');
  assert.equal(checklist.tierADeadline, '2026-12-16');
  assert.ok(checklist.horses[0].documents[0].earlyIssuanceWarning);
});

test('Wave 5 Order Cutoff: createOrder & updateOrder reject violations with 422 ORDER_CUTOFF_VIOLATION and allow >= earliestDepartureDate', async () => {
  const docsService = new DocumentsService(
    {
      findRegulations: async (country) => {
        if (country === 'Singapore') {
          return [{ id: 24, country: 'Singapore', docTier: 'A', leadTimeDays: 14, transportMode: 'both' }];
        }
        return [];
      },
    },
    { createNotification: async () => 1 },
    { onChange: () => {} },
  );

  const createdPayloads = [];
  const ordersService = new OrdersService(
    {
      createShipment: async (_custId, dto) => {
        createdPayloads.push(dto);
        return 501;
      },
      updateAndResubmitShipment: async () => true,
      findShipmentById: async (id) => ({
        id,
        customerId: 6,
        status: 'change_requested',
        bookingType: 'shared_stall',
        originLocation: 'TP.HCM, Vietnam',
        destinationLocation: 'Singapore Turf Club, Singapore',
        transportationType: 'International',
        transportMode: 'air',
        requestCode: 'REQ-501',
      }),
    },
    { notifyRole: async () => 1, createNotification: async () => 1 },
    docsService,
  );

  const dayIso = (offsetDays) => {
    const now = new Date();
    const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offsetDays * 86_400_000;
    return new Date(utc).toISOString();
  };

  // Step 3 (review 11/2026): bỏ gom chuyến — đơn mới gửi shared_stall bị từ chối 400 trước khi xét cutoff
  await assert.rejects(
    () =>
      ordersService.createOrder(
        { id: 6, role: UserRole.CUSTOMER, email: 'cust@test.local' },
        {
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          transportationType: 'Domestic',
          bookingType: 'shared_stall',
          requestedDate: dayIso(5),
        },
      ),
    (err) => err.getStatus() === 400 && /ghép chuyến/.test(err.message),
  );

  // Domestic dedicated_charter requires >= 2d; +1d must reject 422 and +2d succeeds
  await assert.rejects(
    () =>
      ordersService.createOrder(
        { id: 6, role: UserRole.CUSTOMER, email: 'cust@test.local' },
        {
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          transportationType: 'Domestic',
          bookingType: 'dedicated_charter',
          requestedDate: dayIso(1),
        },
      ),
    (err) => err instanceof UnprocessableEntityException && err.getStatus() === 422 && err.getResponse().code === 'ORDER_CUTOFF_VIOLATION',
  );
  await ordersService.createOrder(
    { id: 6, role: UserRole.CUSTOMER, email: 'cust@test.local' },
    {
      originLocation: 'Củ Chi, TP.HCM, Vietnam',
      destinationLocation: 'Đà Nẵng, Vietnam',
      transportationType: 'Domestic',
      bookingType: 'dedicated_charter',
      requestedDate: dayIso(2),
    },
  );
  assert.equal(createdPayloads.length, 1);

  // International Singapore (leadTimeDays=14 -> minLeadDays=16): +15d updateOrder rejects 422; +16d succeeds
  await assert.rejects(
    () =>
      ordersService.updateOrder(
        { id: 6, role: UserRole.CUSTOMER, email: 'cust@test.local' },
        501,
        { requestedDate: dayIso(15) },
      ),
    (err) => err instanceof UnprocessableEntityException && err.getStatus() === 422 && err.getResponse().code === 'ORDER_CUTOFF_VIOLATION',
  );
  const updated = await ordersService.updateOrder(
    { id: 6, role: UserRole.CUSTOMER, email: 'cust@test.local' },
    501,
    { requestedDate: dayIso(16) },
  );
  assert.equal(updated.id, 501);
});

test('Wave 5 BR-F3-03: International routes require >= 1 border_check or quarantine stop while Domestic routes allow stops=[]', async () => {
  const docsService = new DocumentsService({}, { createNotification: async () => 1 }, { onChange: () => {} });
  let savedCount = 0;
  let currentOrder = {
    id: 200,
    status: 'planning',
    requestedHorseCount: 1,
    transportationType: 'International',
    originLocation: 'TP.HCM, Vietnam',
    destinationLocation: 'Singapore Turf Club, Singapore',
  };
  const routesService = new RoutesService(
    {
      findRouteByShipmentId: async () => ({ id: 20, shipmentId: currentOrder.id, planStatus: 'draft' }),
      saveDetailedPlan: async () => { savedCount++; },
      findRouteById: async (id) => ({ id, shipmentId: currentOrder.id, planStatus: 'draft' }),
    },
    { findById: async () => currentOrder },
    { findVehiclesByIds: async () => [{ id: 1, capacity: 4 }] },
    docsService,
    { createNotification: async () => 1 },
    { changed: async () => {}, onChange: () => {} },
  );

  // International without border_check / quarantine stop -> 400
  await assert.rejects(
    () =>
      routesService.buildDetailedPlan(
        { id: 4, role: UserRole.LOGISTICS_MANAGER },
        200,
        {
          routeName: 'Intl Missing Stop',
          legs: [{ sequenceNo: 1, legType: 'flight', originLocation: 'SGN', destinationLocation: 'SIN' }],
          stops: [{ sequenceNo: 1, legSequenceNo: 1, stopType: 'rest', locationName: 'Transit Lounge' }],
        },
      ),
    (err) => err instanceof BadRequestException && err.getStatus() === 400,
  );

  // International with border_check stop -> succeeds
  await routesService.buildDetailedPlan(
    { id: 4, role: UserRole.LOGISTICS_MANAGER },
    200,
    {
      routeName: 'Intl Valid Border Stop',
      legs: [{ sequenceNo: 1, legType: 'flight', originLocation: 'SGN', destinationLocation: 'SIN' }],
      stops: [{ sequenceNo: 1, legSequenceNo: 1, stopType: 'border_check', locationName: 'Changi Border Gate' }],
    },
  );
  assert.equal(savedCount, 1);

  // Domestic route with stops: [] -> continues to succeed
  currentOrder = {
    id: 201,
    status: 'planning',
    requestedHorseCount: 1,
    transportationType: 'Domestic',
    originLocation: 'Củ Chi, TP.HCM, Vietnam',
    destinationLocation: 'Đà Nẵng, Vietnam',
  };
  await routesService.buildDetailedPlan(
    { id: 4, role: UserRole.LOGISTICS_MANAGER },
    201,
    {
      routeName: 'Domestic Direct',
      legs: [{ sequenceNo: 1, legType: 'road', originLocation: 'Củ Chi', destinationLocation: 'Đà Nẵng' }],
      stops: [],
    },
  );
  assert.equal(savedCount, 2);
});

test('UI Audit Fix: findOptionalRouteByShipmentId returns { route: null } without 404 and preserves 403 customer isolation', async () => {
  const routesService = new RoutesService(
    { findRouteByShipmentId: async () => undefined },
    { findById: async () => ({ id: 88, customerId: 6, originLocation: 'A', destinationLocation: 'B' }) },
    {},
    {},
    {},
    { changed: async () => {}, onChange: () => {} },
  );

  const staffRes = await routesService.findOptionalRouteByShipmentId(88, {
    id: 2,
    role: UserRole.LOGISTICS_MANAGER,
  });
  assert.deepEqual(staffRes, { route: null });

  const ownerRes = await routesService.findOptionalRouteByShipmentId(88, {
    id: 6,
    role: UserRole.CUSTOMER,
  });
  assert.deepEqual(ownerRes, { route: null });

  await assert.rejects(
    () => routesService.findOptionalRouteByShipmentId(88, { id: 99, role: UserRole.CUSTOMER }),
    (err) => err.getStatus?.() === 403,
  );
});
