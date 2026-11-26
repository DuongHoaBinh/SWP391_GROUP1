const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { TrackingStore } = require('../dist/modules/tracking/tracking.store');
const { UserRole } = require('../dist/modules/auth/auth.types');
const TEST_GPS = { lat: 10.8, lng: 106.7, accuracyM: 10, source: 'gps' }; // tài xế bắt buộc gửi vị trí khi check-in

test('W0-orders: DRIVER_ESCORT getAllOrders filters by assigned staff and getOrderById blocks unassigned', async () => {
  let calledAssigned = false;
  const service = new OrdersService(
    {
      findShipmentsByAssignedStaff: async (userId) => {
        calledAssigned = true;
        assert.equal(userId, 20);
        return [{ id: 101 }];
      },
      findAllShipments: async () => {
        throw new Error('Should not call findAllShipments for DRIVER_ESCORT');
      },
      findShipmentById: async (id) => ({ id, customerId: 6, status: 'confirmed' }),
      isStaffAssignedToShipment: async (_id, uid) => uid === 20,
    },
    { createNotification: async () => {}, notifyRole: async () => {} },
  );

  const list = await service.getAllOrders(undefined, { id: '20', role: UserRole.DRIVER_ESCORT });
  assert.equal(calledAssigned, true);
  assert.equal(list.length, 1);

  await assert.rejects(
    service.getOrderById({ id: '99', role: UserRole.DRIVER_ESCORT }, 101),
    (err) => err.getStatus?.() === 403,
  );
  const owned = await service.getOrderById({ id: '20', role: UserRole.DRIVER_ESCORT }, 101);
  assert.equal(owned.id, 101);
});

test('W0-orders: approveOrder / rejectOrder / requestChanges / updateOrder throw 409 Conflict on wrong status', async () => {
  const service = new OrdersService(
    { findShipmentById: async () => ({ id: 10, customerId: 6, status: 'confirmed' }) },
    { createNotification: async () => {}, notifyRole: async () => {} },
  );
  const mgr = { id: '2', role: UserRole.LOGISTICS_MANAGER };
  const cust = { id: '6', role: UserRole.CUSTOMER };

  await assert.rejects(service.approveOrder(mgr, 10, { transportCost: 5000000 }), (e) => e.getStatus?.() === 409);
  await assert.rejects(service.rejectOrder(mgr, 10, { reason: 'No' }), (e) => e.getStatus?.() === 409);
  await assert.rejects(service.requestChanges(mgr, 10, { reason: 'Fix' }), (e) => e.getStatus?.() === 409);
  await assert.rejects(service.updateOrder(cust, 10, {}), (e) => e.getStatus?.() === 409);
});

test('W0-documents: owner auth, authority rejection invalidation, supersession, and approved delete guard', async () => {
  const calls = [];
  const doc1 = {
    id: 55,
    horseId: 4,
    ownerId: 6,
    uploadedBy: 3, // Uploaded by Specialist on behalf of Customer #6
    regulationId: 1,
    docType: 'health_certificate',
    fileUrl: '/uploads/documents/a.pdf',
    status: 'approved',
    isArchived: false,
    approvals: [{ id: 1, status: 'rejected' }],
  };
  const service = new DocumentsService(
    {
      findDocumentById: async (id) => (id === 55 ? { ...doc1 } : { ...doc1, id: 56, status: 'submitted', uploadedBy: 6 }),
      findOrderDetails: async () => ({ customer_id: 6, destination_location: 'Vietnam', expected_arrival_date: '2099-05-01' }),
      findRegulations: async () => [{ id: 1, documentType: 'health_certificate' }],
      findHorsesInOrder: async () => [{ horse_id: 4, name: 'Shadow' }],
      findDocumentsByHorseId: async () => [{ ...doc1 }],
      hasRequirementsSent: async () => true,
      createAuthorityApproval: async () => 10,
      updateDocumentReview: async (...args) => calls.push(['updateReview', ...args]),
      findActiveShipmentIdsByHorseId: async () => [77],
      supersedeDocument: async (...args) => {
        calls.push(['supersede', ...args]);
        return 56;
      },
    },
    { createNotification: async (...args) => calls.push(['notify', ...args]), notifyRole: async () => {} },
    { changed: async (oid) => calls.push(['lifecycle', oid]) },
  );

  // Customer #6 can read doc uploaded by Specialist #3 because ownerId is 6
  const viewed = await service.getDocumentById({ id: '6', role: UserRole.CUSTOMER }, 55);
  assert.equal(viewed.id, 55);

  // Authority rejection means doc is NOT compliant even if doc.status was 'approved'
  const checklist = await service.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(checklist.isFullyCompliant, false);
  assert.equal(checklist.approvedDocumentsCount, 0);

  // recordAuthorityApproval rejected updates review status & re-evaluates lifecycle & notifies owner #6
  await service.recordAuthorityApproval({ id: '3', role: UserRole.LOGISTICS_MANAGER }, 55, {
    authorityName: 'Cục Thú y',
    status: 'rejected',
    notes: 'Expired lab',
  });
  assert.ok(calls.some((c) => c[0] === 'updateReview' && c[1] === 55 && c[2] === 'rejected'));
  assert.ok(calls.some((c) => c[0] === 'lifecycle' && c[1] === 77));
  assert.ok(calls.some((c) => c[0] === 'notify' && c[1] === 6));

  // Customer cannot delete an approved document (409 Conflict)
  await assert.rejects(
    service.deleteDocument({ id: '6', role: UserRole.CUSTOMER }, 55),
    (e) => e.getStatus?.() === 409,
  );

  // Append-only reupload creates new doc #56 via supersedeDocument
  const reuploaded = await service.reuploadDocument({ id: '6', role: UserRole.CUSTOMER }, 55, undefined, {
    fileUrl: '/uploads/documents/b.pdf',
    notes: 'New cert',
  });
  assert.equal(reuploaded.id, 56);
  assert.ok(calls.some((c) => c[0] === 'supersede' && c[1] === 55));
});

test('W0-fleet: assignStaff locks reassignment after confirmed unless someone is declined/unconfirmed', async () => {
  const lockedService = new FleetService(
    { findAssignedStaff: async () => [{ userId: 5, roleInShipment: 'driver', isConfirmed: true }] },
    { findById: async () => ({ id: 88, status: 'confirmed' }) },
    {},
  );
  await assert.rejects(
    lockedService.assignStaff({ id: '4', role: UserRole.LOGISTICS_MANAGER }, 88, {
      assignments: [{ userId: 20, roleInShipment: 'driver' }],
    }),
    (e) => e.getStatus?.() === 409,
  );

  let replaced = false;
  const recoveryService = new FleetService(
    {
      findAssignedStaff: async () => [
        { userId: 5, roleInShipment: 'driver', isConfirmed: false, confirmationNotes: 'TỪ CHỐI: Busy' },
      ],
      assignStaff: async () => { replaced = true; },
      findSiblingShipmentsOnSameRoadTrip: async () => [],
    },
    { findById: async () => ({ id: 88, status: 'confirmed' }) },
    { createNotification: async () => {} },
  );
  await recoveryService.assignStaff({ id: '4', role: UserRole.LOGISTICS_MANAGER }, 88, {
    assignments: [{ userId: 20, roleInShipment: 'driver' }],
  });
  assert.equal(replaced, true);
});

test('W0-routes: reviewTripPlan preserves Flow 1 transportCost (409 on change) and publishTripPlan throws 422', async () => {
  let updatedPricing = false;
  const routesSvc = new RoutesService(
    {
      findRouteByShipmentId: async () => ({ id: 12, shipmentId: 44, planStatus: 'pending_approval', assignedCoordinatorId: 4 }),
      findRouteById: async () => ({ id: 12, shipmentId: 44, planStatus: 'approved', assignedCoordinatorId: 4 }),
      updatePlanStatus: async () => {},
    },
    {
      findById: async () => ({ id: 44, transportCost: 7000000, totalCost: 8500000, insuranceFee: 1500000 }),
      updatePricing: async () => { updatedPricing = true; },
    },
    {}, {}, { createNotification: async () => {} }, {},
  );

  await routesSvc.reviewTripPlan({ id: '2', role: UserRole.LOGISTICS_MANAGER, email: 'mgr@example.com' }, 44, {
    status: 'approved',
    transportCost: 9000000,
  });
  assert.equal(updatedPricing, true);

  updatedPricing = false;
  await routesSvc.reviewTripPlan({ id: '2', role: UserRole.LOGISTICS_MANAGER, email: 'mgr@example.com' }, 44, {
    status: 'approved',
  });
  assert.equal(updatedPricing, false);

  // publishTripPlan returns 422 when Gate 2 fails
  routesSvc.getTripPlanReadiness = async () => ({
    isReadyToDepart: false,
    pendingConditions: ['Missing compliance'],
  });
  await assert.rejects(
    routesSvc.publishTripPlan({ id: '4', role: UserRole.LOGISTICS_MANAGER }, 44, {}),
    (e) => e.getStatus?.() === 422,
  );
});

test('W0-tracking: unassigned driver gets 403, multimodal arrived keeps road leg active, border stop requires customs_cleared, complete sets horses active', async () => {
  const legUpdates = [];
  const store = {
    findShipmentById: async () => ({ shipment_id: 90, customer_id: 6, status: 'in_transit', request_code: 'REQ-090' }),
    findRouteByShipmentId: async () => ({ route_id: 19, plan_status: 'in_transit' }),
    findAssignedStaff: async () => [{ user_id: 5, role_in_shipment: 'driver' }],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
    findLegsByRouteId: async () => [
      { leg_id: 31, sequence_no: 1, leg_type: 'road', vehicle_id: 2, status: 'active', actual_departure: new Date(), planned_arrival: '2099-05-01T08:00:00.000Z' },
      { leg_id: 32, sequence_no: 2, leg_type: 'flight', status: 'pending', actual_departure: null, planned_arrival: '2099-05-01T12:00:00.000Z' },
    ],
    findStopsByRouteId: async () => [
      { route_stop_id: 71, route_id: 19, leg_id: 31, sequence_no: 1, stop_type: 'border_check', location_name: 'Mộc Bài', country: 'Vietnam', status: 'pending' },
    ],
    updateStopStatus: async () => {},
    updateLegStatus: async (...args) => legUpdates.push(args),
    updateVehicleStatus: async () => {},
    recordTripStatusLog: async () => {},
  };

  const service = new TrackingService(store, { createNotification: async () => {}, notifyRole: async () => {} }, {});

  // Unassigned driver #20 gets 403 Forbidden
  await assert.rejects(
    service.getTrackingDetails({ id: '20', role: UserRole.DRIVER_ESCORT }, 90),
    (e) => e.getStatus?.() === 403,
  );

  // Assigned driver #5 sees ISO-8601 ETA & multimodal arrived does NOT complete road leg 1
  const details = await service.checkInStop({ id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com' }, 90, 71, { action: 'arrived', location: TEST_GPS });
  assert.equal(details.eta, '2099-05-01T12:00:00.000Z');
  assert.equal(legUpdates.length, 0);

  // Border stop arrived -> departed directly is blocked with 422 (missing customs_cleared)
  store.findStopsByRouteId = async () => [
    { route_stop_id: 71, route_id: 19, leg_id: 31, sequence_no: 1, stop_type: 'border_check', location_name: 'Mộc Bài', country: 'Vietnam', status: 'arrived' },
  ];
  await assert.rejects(
    service.checkInStop({ id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com' }, 90, 71, { action: 'departed', location: TEST_GPS }),
    (e) => e.getStatus?.() === 422,
  );

  // Backward transition pending -> departed throws 409
  store.findStopsByRouteId = async () => [
    { route_stop_id: 71, route_id: 19, leg_id: 31, sequence_no: 1, stop_type: 'rest', location_name: 'Trạm nghỉ', country: 'Vietnam', status: 'pending' },
  ];
  await assert.rejects(
    service.checkInStop({ id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com' }, 90, 71, { action: 'departed', location: TEST_GPS }),
    (e) => e.getStatus?.() === 409,
  );

  // completeShipment sets horses to 'active' (not 'delivered') in TrackingStore
  const sqlCalls = [];
  const tStore = new TrackingStore();
  tStore.pool = { execute: async (sql) => { sqlCalls.push(sql); return [{ affectedRows: 1 }]; } };
  await tStore.updateShipmentStatus(90, 'completed');
  assert.ok(sqlCalls.some((s) => s.includes('UPDATE horse') && s.includes("SET status = 'active'") && !s.includes("'delivered'")));
});

test('F2-authority: kết quả cơ quan không thay thế bước thẩm định nội bộ', async () => {
  const calls = [];
  const docs = {
    1: { id: 1, horseId: 4, ownerId: 6, status: 'submitted', isArchived: false, docType: 'export_permit' },
    2: { id: 2, horseId: 4, ownerId: 6, status: 'rejected', isArchived: false, docType: 'export_permit' },
    3: { id: 3, horseId: 4, ownerId: 6, status: 'approved', isArchived: true, docType: 'export_permit' },
    4: { id: 4, horseId: 4, ownerId: 6, status: 'approved', isArchived: false, docType: 'export_permit' },
  };
  const service = new DocumentsService(
    {
      findDocumentById: async (id) => (docs[id] ? { ...docs[id] } : undefined),
      createAuthorityApproval: async (...args) => { calls.push(['authority', ...args]); return 1; },
      updateDocumentReview: async (...args) => calls.push(['updateReview', ...args]),
      createReviewLog: async (entry) => calls.push(['reviewLog', entry]),
      findActiveShipmentIdsByHorseId: async () => [],
    },
    { createNotification: async () => {}, notifyRole: async () => {} },
    { changed: async () => {} },
  );
  const mgr = { id: '3', role: UserRole.LOGISTICS_MANAGER };
  const is409 = (e) => e.getStatus?.() === 409;

  // Chưa thẩm định nội bộ → không được ghi cơ quan approved, không đổi trạng thái tài liệu
  await assert.rejects(service.recordAuthorityApproval(mgr, 1, { authorityName: 'AVS', status: 'approved' }), is409);
  // Tài liệu đã bị từ chối hoặc đã bị thay thế → không hồi sinh
  await assert.rejects(service.recordAuthorityApproval(mgr, 2, { authorityName: 'AVS', status: 'approved' }), is409);
  await assert.rejects(service.recordAuthorityApproval(mgr, 3, { authorityName: 'AVS', status: 'approved' }), is409);
  assert.equal(calls.length, 0);

  // Đã duyệt nội bộ → ghi nhận cơ quan approved, không cập nhật lại trạng thái tài liệu
  await service.recordAuthorityApproval(mgr, 4, { authorityName: 'AVS', status: 'approved' });
  assert.ok(calls.some((c) => c[0] === 'authority' && c[1] === 4));
  assert.ok(!calls.some((c) => c[0] === 'updateReview'));

  // Ghi "pending" cho tài liệu đang chờ thẩm định vẫn được phép (đã nộp cơ quan)
  await service.recordAuthorityApproval(mgr, 1, { authorityName: 'AVS', status: 'pending' });

  // Cơ quan từ chối → rejected kèm người ghi nhận và review log
  await service.recordAuthorityApproval(mgr, 4, { authorityName: 'AVS', status: 'rejected', notes: 'Sai số microchip' });
  const upd = calls.find((c) => c[0] === 'updateReview');
  assert.equal(upd[1], 4);
  assert.equal(upd[2], 'rejected');
  assert.equal(upd[6], 3);
  const log = calls.find((c) => c[0] === 'reviewLog');
  assert.equal(log[1].fromStatus, 'approved');
  assert.equal(log[1].toStatus, 'rejected');
  assert.equal(log[1].reviewerId, 3);
});
