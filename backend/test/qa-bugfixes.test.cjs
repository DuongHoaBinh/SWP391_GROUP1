const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} = require('@nestjs/common');

const { UserRole } = require('../dist/modules/auth/auth.types');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { HorseGender, HorseStatus } = require('../dist/modules/horses/horses.types');
const { HorsesController } = require('../dist/modules/horses/horses.controller');
const { HorsesService } = require('../dist/modules/horses/horses.service');
const { HorsesStore } = require('../dist/modules/horses/horses.store');
const { DocumentsController } = require('../dist/modules/documents/documents.controller');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { OrdersController } = require('../dist/modules/orders/orders.controller');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { OrdersStore } = require('../dist/modules/orders/orders.store');
const { OrdersOpsController } = require('../dist/modules/orders/orders-ops.controller');
const { OrdersOpsService } = require('../dist/modules/orders/orders-ops.service');
const { OrdersOpsStore } = require('../dist/modules/orders/orders-ops.store');
const { InsuranceClaimController } = require('../dist/modules/orders/insurance-claim.controller');
const { InsuranceClaimService } = require('../dist/modules/orders/insurance-claim.service');
const { PricingController } = require('../dist/modules/orders/pricing.controller');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { FleetController } = require('../dist/modules/fleet/fleet.controller');
const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { FleetStore } = require('../dist/modules/fleet/fleet.store');
const { CityRestrictionsController } = require('../dist/modules/fleet/city-restrictions.controller');
const { AllocationService } = require('../dist/modules/fleet/allocation.service');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { IncidentsController } = require('../dist/modules/incidents/incidents.controller');
const { IncidentsService } = require('../dist/modules/incidents/incidents.service');
const { ShipmentStatus } = require('../dist/modules/orders/orders.types');
const { VehicleStatus } = require('../dist/modules/fleet/fleet.types');

function ctxFor(handler, role) {
  return {
    getHandler: () => handler,
    getClass: () => null,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 42, role } }),
    }),
  };
}

test('Bug #3: RolesGuard blocks DRIVER_ESCORT across horses writes, documents, financial/insurance, reservations; locks fleet/vehicles to Manager/Admin', () => {
  const guard = new RolesGuard(new Reflector());

  const denyDriverOnly = [
    HorsesController.prototype.createHorse,
    HorsesController.prototype.updateHorse,
    HorsesController.prototype.deleteHorse,
    HorsesController.prototype.uploadAvatar,
    HorsesController.prototype.uploadPhoto,
    DocumentsController.prototype.getDocuments,
    DocumentsController.prototype.getDocumentById,
    DocumentsController.prototype.downloadDocumentFile,
    DocumentsController.prototype.deleteDocument,
    DocumentsController.prototype.getDocumentsByHorse,
    DocumentsController.prototype.getOrderComplianceChecklist,
    OrdersController.prototype.getOrderInvoice,
    OrdersController.prototype.getRefundFormInfo,
    OrdersOpsController.prototype.getDisbursements,
    OrdersOpsController.prototype.streamDisbursementReceipt,
    OrdersOpsController.prototype.getOrderRefunds,
    OrdersOpsController.prototype.streamRefundReceipt,
    InsuranceClaimController.prototype.getShipmentPayoutTable,
    InsuranceClaimController.prototype.listClaimsByShipment,
    InsuranceClaimController.prototype.getClaimById,
    InsuranceClaimController.prototype.getClaimEvidence,
    CityRestrictionsController.prototype.reservations,
  ];

  for (const handler of denyDriverOnly) {
    assert.throws(
      () => guard.canActivate(ctxFor(handler, UserRole.DRIVER_ESCORT)),
      /Access denied/,
      `DRIVER_ESCORT must be denied on ${handler.name}`,
    );
    assert.equal(guard.canActivate(ctxFor(handler, UserRole.CUSTOMER)), true, `CUSTOMER allowed on ${handler.name}`);
    assert.equal(guard.canActivate(ctxFor(handler, UserRole.LOGISTICS_MANAGER)), true, `MANAGER allowed on ${handler.name}`);
    assert.equal(guard.canActivate(ctxFor(handler, UserRole.ADMIN)), true, `ADMIN allowed on ${handler.name}`);
  }

  for (const handler of [FleetController.prototype.getVehicles, FleetController.prototype.getVehicleById]) {
    assert.throws(() => guard.canActivate(ctxFor(handler, UserRole.CUSTOMER)), /Access denied/);
    assert.throws(() => guard.canActivate(ctxFor(handler, UserRole.DRIVER_ESCORT)), /Access denied/);
    assert.equal(guard.canActivate(ctxFor(handler, UserRole.LOGISTICS_MANAGER)), true);
    assert.equal(guard.canActivate(ctxFor(handler, UserRole.ADMIN)), true);
  }
});

test('Bug #3: Service-level assignment isolation for DRIVER_ESCORT on routes, horses, health-logs, fleet assignments', async () => {
  const driverAssigned = { id: '77', role: UserRole.DRIVER_ESCORT };
  const driverOther = { id: '88', role: UserRole.DRIVER_ESCORT };

  // RoutesService: recordStopProgress & reads
  const routesSvc = new RoutesService(
    {
      findStopById: async () => ({ id: 5, routeId: 9, locationName: 'Border' }),
      findRouteById: async () => ({ id: 9, shipmentId: 100 }),
      findRouteByShipmentId: async () => ({ id: 9, shipmentId: 100, legs: [], stops: [] }),
      createStopUpdate: async () => {},
      applyDepartureReadiness: async () => ({ isPlanConfirmed: true, isLegalCompliant: true, isPaymentSucceeded: true }),
    },
    { findById: async () => ({ id: 100, customerId: 5, status: 'confirmed', requestedHorseCount: 1 }) },
    {
      findAssignedStaff: async () => [{ userId: 77, roleInShipment: 'driver' }],
      findAssignedVehicles: async () => [],
      findRequiredStallSlots: async () => 1,
    },
    { isFlow2CompletedForPayment: async () => true },
    { createNotification: async () => {} },
    { onChange: () => {}, changed: async () => {} },
  );

  await assert.rejects(() => routesSvc.recordStopProgress(driverOther, 5, { status: 'arrived' }), ForbiddenException);
  await assert.doesNotReject(() => routesSvc.recordStopProgress(driverAssigned, 5, { status: 'arrived' }));
  await assert.rejects(() => routesSvc.getRouteByShipmentId(100, driverOther), ForbiddenException);
  await assert.doesNotReject(() => routesSvc.getRouteByShipmentId(100, driverAssigned));
  await assert.rejects(() => routesSvc.findOptionalRouteByShipmentId(100, driverOther), ForbiddenException);
  await assert.rejects(() => routesSvc.getFullTripPlan(100, driverOther), ForbiddenException);
  await assert.rejects(() => routesSvc.getTripPlanReadiness(driverOther, 100), ForbiddenException);
  await assert.doesNotReject(() => routesSvc.getTripPlanReadiness(driverAssigned, 100));

  // HorsesService: getHorseById
  const horsesSvc = new HorsesService({
    findById: async () => ({ id: 12, ownerId: 5, name: 'Thunder' }),
    isHorseAssignedToDriver: async (_hid, uid) => uid === 77,
  });
  await assert.rejects(() => horsesSvc.getHorseById(driverOther, 12), ForbiddenException);
  const horseRes = await horsesSvc.getHorseById(driverAssigned, 12);
  assert.equal(horseRes.id, 12);

  // TrackingService: getHealthLogsByHorseId
  const trackingSvc = new TrackingService(
    {
      isHorseAssignedToDriver: async (_hid, uid) => uid === 77,
      findHorseHealthLogsByHorseId: async () => [{ id: 1 }],
    },
    {},
    {},
  );
  await assert.rejects(() => trackingSvc.getHealthLogsByHorseId(driverOther, 12), ForbiddenException);
  const logs = await trackingSvc.getHealthLogsByHorseId(driverAssigned, 12);
  assert.equal(logs.length, 1);

  // FleetService: getShipmentAssignments
  const fleetSvc = new FleetService(
    {
      findAssignedVehicles: async () => [],
      findAssignedStaff: async () => [{ userId: 77, roleInShipment: 'driver' }],
    },
    { findById: async () => ({ id: 100, customerId: 5 }) },
    {},
  );
  await assert.rejects(() => fleetSvc.getShipmentAssignments(100, driverOther), ForbiddenException);
  const asg = await fleetSvc.getShipmentAssignments(100, driverAssigned);
  assert.equal(asg.staff.length, 1);

  // AllocationService: getShipmentReservations denies DRIVER_ESCORT
  const allocSvc = new AllocationService({});
  await assert.rejects(() => allocSvc.getShipmentReservations(driverAssigned, 100), ForbiddenException);

  // DocumentsService & OrdersStore & InsuranceClaimService deny DRIVER_ESCORT
  const docsSvc = new DocumentsService({}, {}, {});
  await assert.rejects(() => docsSvc.getDocuments(driverAssigned), ForbiddenException);
  await assert.rejects(() => docsSvc.getDocumentById(driverAssigned, 1), ForbiddenException);
  await assert.rejects(() => docsSvc.getDocumentsByHorse(driverAssigned, 12), ForbiddenException);
  await assert.rejects(() => docsSvc.getOrderComplianceChecklist(driverAssigned, 100), ForbiddenException);

  const ordersStore = new OrdersStore({});
  await assert.rejects(() => ordersStore.getOrderInvoice(100, 77, 'DRIVER_ESCORT'), ForbiddenException);
  await assert.rejects(() => ordersStore.getRefundFormInfo(100, 77, 'DRIVER_ESCORT'), ForbiddenException);

  const claimSvc = new InsuranceClaimService({}, {}, {});
  await assert.rejects(() => claimSvc.getShipmentPayoutTable(driverAssigned, 100), ForbiddenException);
  await assert.rejects(() => claimSvc.listClaimsByShipment(driverAssigned, 100), ForbiddenException);
});

test('Bug #5: Duplicate microchip_no / passport_no returns 409 ConflictException (both proactive check & ER_DUP_ENTRY fallback)', async () => {
  const horsesSvc = new HorsesService({
    findByOwnerId: async () => [],
    findByMicrochipNo: async (chip) => (chip === '985000000111' ? { id: 99, ownerId: 2, status: HorseStatus.RETIRED } : undefined),
    findByPassportNo: async (pass) => (pass === 'FEI-DUP-001' ? { id: 98, ownerId: 2, status: HorseStatus.ACTIVE } : undefined),
  });

  await assert.rejects(
    () =>
      horsesSvc.createHorse(
        { id: '5', role: UserRole.CUSTOMER },
        { name: 'Alpha', microchipNo: '985000000111', passportNo: 'FEI-NEW-001', gender: HorseGender.GELDING },
      ),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );

  await assert.rejects(
    () =>
      horsesSvc.createHorse(
        { id: '5', role: UserRole.CUSTOMER },
        { name: 'Beta', microchipNo: '985000000222', passportNo: 'FEI-DUP-001', gender: HorseGender.GELDING },
      ),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );

  // DB ER_DUP_ENTRY fallback on HorsesStore.create
  const dupPool = {
    execute: async () => {
      const e = new Error("Duplicate entry 'FEI-RACE' for key 'horse.passport_no'");
      e.code = 'ER_DUP_ENTRY';
      e.errno = 1062;
      e.sqlMessage = e.message;
      throw e;
    },
  };
  const horsesStore = new HorsesStore(dupPool);
  await assert.rejects(
    () => horsesStore.create(5, { name: 'Race', microchipNo: '985000000333', passportNo: 'FEI-RACE' }),
    (err) => err instanceof ConflictException && err.message.includes('FEI-RACE'),
  );
});

test('Bug #8: Invalid pricing mode and non-numeric query params return 400 BadRequestException', () => {
  const pricingCtrl = new PricingController({ getTariffHistory: () => [] });
  assert.throws(() => pricingCtrl.getTariffHistory(undefined, 'VN'), BadRequestException);
  assert.throws(() => pricingCtrl.getTariffHistory('rocket', 'VN'), BadRequestException);
  assert.deepEqual(pricingCtrl.getTariffHistory('road', 'VN'), []);

  const docsCtrl = new DocumentsController({ getDocuments: () => [] });
  assert.throws(() => docsCtrl.getDocuments({ id: '1', role: UserRole.ADMIN }, undefined, 'abc'), BadRequestException);
  assert.throws(() => docsCtrl.getDocuments({ id: '1', role: UserRole.ADMIN }, undefined, '-5'), BadRequestException);

  const fleetCtrl = new FleetController({ getAllVehicles: () => [] });
  assert.throws(() => fleetCtrl.getVehicles(undefined, undefined, 'abc'), BadRequestException);

  const incCtrl = new IncidentsController({ listChangeRequests: () => [] });
  assert.throws(() => incCtrl.listChangeRequests('abc', undefined, undefined), BadRequestException);
  assert.throws(() => incCtrl.listChangeRequests(undefined, 'NaN', undefined), BadRequestException);
});

test('Bug #9: FleetStore findVehicleById & findVehiclesByIds use computed_status SQL consistently', async () => {
  const seenSql = [];
  const mockPool = {
    execute: async (sql) => {
      seenSql.push(sql);
      return [[{
        vehicle_id: 3,
        vehicle_type: 'truck',
        plate_or_code: '51C-12345',
        capacity: 4,
        status: 'available',
        computed_status: 'in_use',
        is_reserved_only: 1,
        assigned_shipment_id: 20,
        assigned_shipment_status: 'confirmed',
        current_location: 'HCM',
        created_at: new Date(),
      }]];
    },
    query: async (sql) => {
      seenSql.push(sql);
      return [[{
        vehicle_id: 3,
        vehicle_type: 'truck',
        plate_or_code: '51C-12345',
        capacity: 4,
        status: 'available',
        computed_status: 'in_use',
        is_reserved_only: 1,
        assigned_shipment_id: 20,
        assigned_shipment_status: 'confirmed',
        current_location: 'HCM',
        created_at: new Date(),
      }]];
    },
  };

  const fleetStore = new FleetStore(mockPool);
  const one = await fleetStore.findVehicleById(3);
  const many = await fleetStore.findVehiclesByIds([3]);
  assert.equal(one.status, VehicleStatus.IN_USE);
  assert.equal(one.assignedShipmentId, 20);
  assert.equal(many[0].status, VehicleStatus.IN_USE);
  assert.equal(many[0].assignedShipmentId, 20);
  assert.ok(seenSql.every((s) => s.includes('computed_status') && s.includes('active_res')));
});

test('Bug #10: completeOrder aligns service & store on return_pending based on return_status', async () => {
  const manager = { id: '2', role: UserRole.LOGISTICS_MANAGER };

  // return_pending with scheduled return leg -> 409 ConflictException
  const svcScheduled = new OrdersService(
    { findShipmentById: async () => ({ id: 50, status: ShipmentStatus.RETURN_PENDING, returnStatus: 'scheduled' }) },
    {},
    {},
  );
  await assert.rejects(() => svcScheduled.completeOrder(manager, 50), ConflictException);

  // Store also allows return_pending when return_status='cancelled' and rejects when 'scheduled'
  const makeTxStore = (returnStatus) => {
    const conn = {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute: async (sql) => {
        if (sql.includes('SELECT status, return_status FROM shipment')) {
          return [[{ status: 'return_pending', return_status: returnStatus }]];
        }
        if (sql.includes('SELECT vehicle_id FROM shipment_vehicle')) return [[]];
        if (sql.includes("SET status = 'completed'")) return [{ affectedRows: 1 }];
        return [{ affectedRows: 1 }];
      },
    };
    return new OrdersStore({ getConnection: async () => conn });
  };

  await assert.rejects(() => makeTxStore('scheduled').completeShipment(50, 2, false), ConflictException);
  const completed = await makeTxStore('cancelled').completeShipment(50, 2, false);
  assert.equal(completed, true);

  // TrackingService.completeShipment also aligns on return_pending based on return_status
  let trackingUpdatedStatus = null;
  const makeTrackingCompleteSvc = (returnStatus) =>
    new TrackingService(
      {
        findShipmentById: async () => ({ shipment_id: 50, status: 'return_pending', return_status: returnStatus }),
        findRouteByShipmentId: async () => ({ route_id: 9 }),
        updateShipmentStatus: async (_id, status) => { trackingUpdatedStatus = status; },
        updateRoutePlanStatus: async () => {},
        recordTripStatusLog: async () => {},
      },
      {},
      {},
    );
  await assert.rejects(() => makeTrackingCompleteSvc('scheduled').completeShipment(manager, 50), ConflictException);
  await makeTrackingCompleteSvc('cancelled').completeShipment(manager, 50);
  assert.equal(trackingUpdatedStatus, 'completed');
});

test('Bug #11: Flow 5 emergency_vet_covered enforces 20M VND cap for Standard, allows unlimited for Premium, updates Basic error copy', async () => {
  const makeSvc = (summary) =>
    new IncidentsService(
      {
        findIncidentById: async () => ({ id: 10, shipmentId: 201, customerId: 60 }),
        findShipmentSummary: async () => summary,
        createChangeRequest: async (input) => ({ id: 99, requestCode: 'REQ-201', ...input }),
      },
      { notifyRole: async () => {}, createNotification: async () => 1 },
    );

  // Basic -> 422 with updated copy mentioning Standard & Premium
  await assert.rejects(
    () =>
      makeSvc({
        shipmentId: 201,
        customerId: 60,
        status: 'in_transit',
        hasEmergencyVetCoverage: false,
        emergencyVetCapVnd: 0,
        usedEmergencyVetCostVnd: 0,
      }).createChangeRequest(
        { id: '2', role: UserRole.LOGISTICS_MANAGER },
        10,
        { changeType: 'cost', reason: 'Vet', estimatedExtraCost: 5_000_000, costAllocation: 'emergency_vet_covered' },
      ),
    (err) => err instanceof UnprocessableEntityException && err.message.includes('Standard') && err.message.includes('Premium'),
  );

  // Standard: 15M used + 6M new = 21M > 20M cap -> 422
  await assert.rejects(
    () =>
      makeSvc({
        shipmentId: 201,
        customerId: 60,
        status: 'in_transit',
        hasEmergencyVetCoverage: true,
        emergencyVetCapVnd: 20_000_000,
        usedEmergencyVetCostVnd: 15_000_000,
      }).createChangeRequest(
        { id: '2', role: UserRole.LOGISTICS_MANAGER },
        10,
        { changeType: 'cost', reason: 'Vet', estimatedExtraCost: 6_000_000, costAllocation: 'emergency_vet_covered' },
      ),
    (err) => err instanceof UnprocessableEntityException && err.message.includes('20.000.000'),
  );

  // Standard: 15M used + 5M new = 20M == 20M cap -> OK
  const okStd = await makeSvc({
    shipmentId: 201,
    customerId: 60,
    status: 'in_transit',
    hasEmergencyVetCoverage: true,
    emergencyVetCapVnd: 20_000_000,
    usedEmergencyVetCostVnd: 15_000_000,
  }).createChangeRequest(
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
    10,
    { changeType: 'cost', reason: 'Vet', estimatedExtraCost: 5_000_000, costAllocation: 'emergency_vet_covered' },
  );
  assert.equal(okStd.id, 99);

  // Premium: emergencyVetCapVnd = null -> 50M OK
  const okPrem = await makeSvc({
    shipmentId: 201,
    customerId: 60,
    status: 'in_transit',
    hasEmergencyVetCoverage: true,
    emergencyVetCapVnd: null,
    usedEmergencyVetCostVnd: 30_000_000,
  }).createChangeRequest(
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
    10,
    { changeType: 'cost', reason: 'Vet', estimatedExtraCost: 50_000_000, costAllocation: 'emergency_vet_covered' },
  );
  assert.equal(okPrem.id, 99);
});
