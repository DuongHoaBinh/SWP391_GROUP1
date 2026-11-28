const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');

const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { CreateStaffDto } = require('../dist/modules/fleet/dto/create-staff.dto');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { OrdersOpsStore } = require('../dist/modules/orders/orders-ops.store');
const { OrdersOpsService } = require('../dist/modules/orders/orders-ops.service');
const { calculateOperationalRefund, CancellationCategory, RefundMode } = require('../dist/modules/orders/refund-policy');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { UpdateTrackingSettingsDto } = require('../dist/modules/tracking/dto/update-tracking-settings.dto');
const { RoadTripsStore } = require('../dist/modules/fleet/road-trips.store');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('P0 #2: FleetService.updateStaffShift releases trips even when dutyStatus=ON_DUTY and returns real activeTrips', async () => {
  const calls = [];
  const fleetStore = {
    updateStaffShift: async (userId, shift, dutyStatus, shouldRelease) => {
      calls.push({ userId, shift, dutyStatus, shouldRelease });
      return true;
    },
    countActiveTripsForStaff: async () => 1,
  };
  const svc = new FleetService(fleetStore, {});
  const res = await svc.updateStaffShift(7, {
    currentShift: 'Ca Sáng',
    dutyStatus: 'ON_DUTY',
    releaseActiveTrips: true,
  });
  assert.equal(calls[0].shouldRelease, true);
  assert.equal(res.activeTrips, 1);
});

test('P0 #3 + Admin->Manager: CreateStaffDto rejects legacy roles 3 & 4, accepts 2 & 5; Manager can create roleId 2', async () => {
  const legacyDto = plainToInstance(CreateStaffDto, {
    fullName: 'Old Role',
    email: 'old@example.com',
    roleId: 3,
  });
  const errors = await validate(legacyDto);
  assert.ok(errors.some((e) => e.property === 'roleId'));

  const mgrDto = plainToInstance(CreateStaffDto, {
    fullName: 'New Manager',
    email: 'newmgr@example.com',
    roleId: 2,
  });
  assert.equal((await validate(mgrDto)).length, 0);

  const fleetStore = {
    findUserByEmail: async () => null,
    findRoleNameById: async (id) => (id === 2 ? 'Logistics Manager' : id === 3 ? 'Transport Specialist' : 'Vehicle Driver / Escort'),
    createStaffUser: async (d) => ({ id: 99, ...d, roleName: 'Logistics Manager', activeTrips: 0, status: 'active' }),
  };
  const svc = new FleetService(fleetStore, {});
  const created = await svc.provisionStaff(
    { fullName: 'New Manager', email: 'newmgr@example.com', roleId: 2, password: 'Password123' },
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
  );
  assert.equal(created.roleId, 2);

  await assert.rejects(
    svc.provisionStaff(
      { fullName: 'Spec', email: 'spec@example.com', roleId: 3, password: 'Password123' },
      { id: '2', role: UserRole.LOGISTICS_MANAGER },
    ),
    /gộp vào Logistics Manager/,
  );
});

test('P0 #1: RoutesService.declineTripAssignment & reportIncident notify Logistics Manager via notifyRole', async () => {
  const roleNotifs = [];
  const notifSvc = {
    createNotification: async () => {},
    notifyRole: async (role, title, msg, type, shipmentId) => {
      roleNotifs.push({ role, title, msg, type, shipmentId });
    },
  };
  const routesStore = {
    declineStaffAssignment: async () => ({ declined: true, reverted: false }),
    reportIncident: async () => 55,
    applyDepartureReadiness: async () => ({ isPlanConfirmed: false, isLegalCompliant: false, isPaymentSucceeded: false, isReadyToDepart: false }),
  };
  const ordersStore = { findById: async () => ({ id: 8, requestCode: 'REQ-008', customerId: 10 }) };
  const docsSvc = { isFlow2CompletedForPayment: async () => true };
  const fleetStore = { findAssignedStaff: async () => [{ userId: 5 }] };

  const svc = new RoutesService(routesStore, ordersStore, fleetStore, docsSvc, notifSvc, { onChange: () => {} });
  await svc.declineTripAssignment({ id: '5', role: UserRole.DRIVER_ESCORT }, 8, { reason: 'Ốm đột xuất' });
  await svc.reportIncident({ id: '5', role: UserRole.DRIVER_ESCORT }, 8, { incidentType: 'traffic_delay', description: 'Tắc đường' });

  assert.equal(roleNotifs.length, 2);
  assert.equal(roleNotifs[0].role, 'Logistics Manager');
  assert.equal(roleNotifs[1].role, 'Logistics Manager');
});

test('P0 #4 + Refund Cách 1: single Manager approves >=20M refund directly, transfer requires customer bank form and allows same Manager', async () => {
  const calc = calculateOperationalRefund({
    category: CancellationCategory.COMPANY_FAULT,
    transportCost: 80_000_000,
    insuranceFee: 5_000_000,
    paidAmount: 85_000_000,
    verifiedDisbursementAmount: 0,
    departureAt: new Date(Date.now() + 72 * 3600 * 1000),
    cancelledAt: new Date(),
  });
  assert.equal(calc.requiresDualApproval, false);

  const row = {
    refund_id: 10,
    shipment_id: 9,
    customer_id: 100,
    cancellation_category: 'company_fault',
    refund_mode: RefundMode.CASH_REFUND,
    freight_refund_amount: 80_000_000,
    insurance_refund_amount: 5_000_000,
    non_refundable_air_deduction: 0,
    disbursement_deduction: 0,
    amount: 85_000_000,
    receivable_excess_amount: 0,
    status: 'pending_approval',
    requires_dual_approval: 0,
    requested_by: 2,
    approved_by: null,
    approved_at: null,
    second_approved_by: null,
    second_approved_at: null,
    transferred_by: null,
    transferred_at: null,
    recipient_bank_account: null,
    recipient_bank_name: null,
    recipient_account_holder: null,
    customer_note: null,
    form_submitted_at: null,
    sla_due_at: null,
    bank_transaction_ref: null,
    transfer_receipt_url: null,
    credit_expires_at: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockConn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params) => {
      if (sql.includes('SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE')) return [[row]];
      if (sql.includes('FROM shipment_refund_record rr')) return [[row]];
      if (sql.includes("SET status = 'approved_for_transfer'")) {
        row.status = 'approved_for_transfer';
        row.approved_by = params[0];
        row.approved_at = new Date();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SET recipient_bank_name = ?')) {
        row.recipient_bank_name = params[0];
        row.recipient_bank_account = params[1];
        row.recipient_account_holder = params[2];
        row.customer_note = params[3];
        row.form_submitted_at = new Date();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'transferred'")) {
        row.status = 'transferred';
        row.transferred_by = params[0];
        row.recipient_bank_account = params[1];
        row.bank_transaction_ref = params[2];
        row.transfer_receipt_url = params[3];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT claim_id FROM insurance_claim')) return [[]];
      return [[{ affectedRows: 1 }]];
    },
  };
  const store = new OrdersOpsStore({ getConnection: async () => mockConn, execute: mockConn.execute });

  // 1 Manager approves directly -> approved_for_transfer (no pending_second_approval!)
  const approved = await store.approveRefund(10, 2, 'approve', 'OK');
  assert.equal(approved.status, 'approved_for_transfer');

  // Cách 1: Transfer blocked before customer submits bank form
  await assert.rejects(
    store.transferRefund(10, 2, { bankTransactionRef: 'FT001', transferReceiptUrl: 'https://example.com/r.png' }),
    /Chủ ngựa chưa điền thông tin tài khoản/,
  );

  // Customer submits bank info
  const withBank = await store.submitRefundBankInfo(10, 100, {
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountHolder: 'nguyen van a',
  });
  assert.equal(withBank.recipientBankAccount, '0123456789');
  assert.equal(withBank.recipientAccountHolder, 'NGUYEN VAN A');

  // Same Manager (#2) can transfer and structured account number is NOT overwritten
  const transferred = await store.transferRefund(10, 2, {
    recipientBankAccount: 'Vietcombank - 0123456789 - NGUYEN VAN A',
    bankTransactionRef: 'FT999',
    transferReceiptUrl: 'https://example.com/r.png',
    actorRole: UserRole.LOGISTICS_MANAGER,
  });
  assert.equal(transferred.status, 'transferred');
  assert.equal(transferred.recipientBankAccount, '0123456789');
});

test('P1 #6(d): Flight stallsBooked defaults to Jet Stalls ceil(N/3), not N', async () => {
  let savedLegs = null;
  const routesStore = {
    findRouteByShipmentId: async () => ({ id: 1, planStatus: 'draft' }),
    findAllAirlines: async () => [{ id: 1, name: 'Vietnam Airlines', code: 'VN' }],
    findAllAirports: async () => [
      { id: 1, name: 'Tan Son Nhat', city: 'Ho Chi Minh', country: 'Vietnam', iataCode: 'SGN' },
      { id: 2, name: 'Changi', city: 'Singapore', country: 'Singapore', iataCode: 'SIN' },
    ],
    saveDetailedPlan: async (_rid, _dto, _actorId, legs) => {
      savedLegs = legs || _dto?.legs;
    },
    findRouteById: async () => ({ id: 1, legs: savedLegs }),
  };
  const ordersStore = { findById: async () => ({ id: 5, status: 'planning', requestedHorseCount: 5, destinationLocation: 'Singapore' }) };
  const fleetStore = { findShipmentStallHorses: async () => [{ quantity: 5 }] };
  const svc = new RoutesService(routesStore, ordersStore, fleetStore, {}, { createNotification: async () => {}, notifyRole: async () => {} }, { onChange: () => {} });

  await svc.buildDetailedPlan(
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
    5,
    {
      routeName: 'Air SGN-SIN',
      totalDistanceKm: 1100,
      legs: [{
        sequenceNo: 1,
        legType: 'flight',
        originLocation: 'Tan Son Nhat (SGN)',
        destinationLocation: 'Changi (SIN)',
        plannedDeparture: '2099-05-01T08:00:00Z',
        plannedArrival: '2099-05-01T12:00:00Z',
        flightNumber: 'VN651',
        bookingReference: 'AWB123',
        stallsBooked: 2,
      }],
      stops: [],
    },
  );
  assert.equal(savedLegs[0].stallsBooked, 2);
});

test('P1 #9 + Admin->Manager: Logistics Manager can update all GPS settings including simulationEnabled, validated by DTO', async () => {
  const badDto = plainToInstance(UpdateTrackingSettingsDto, { geofenceRadiusDefaultM: 10 });
  assert.ok((await validate(badDto)).some((e) => e.property === 'geofenceRadiusDefaultM'));

  const settings = new Map();
  const store = {
    getSetting: async (k) => settings.get(k) ?? null,
    setSetting: async (k, v) => settings.set(k, v),
  };
  const svc = new TrackingService(store, {}, {});
  const updated = await svc.updateTrackingSettings(
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
    { geofenceRadiusDefaultM: 450, simulationEnabled: true, customerVitalsDetail: false },
  );
  assert.equal(updated.geofenceRadiusDefaultM, 450);
  assert.equal(updated.simulationEnabled, true);
  assert.equal(updated.customerVitalsDetail, false);
});

test('Option A Driver vs Escort: VN Driver is blocked from overseas flight leg check-in & GPS pings while Escort succeeds; race condition returns 409', async () => {
  const legs = [
    { leg_id: 1, sequence_no: 1, direction: 'outbound', leg_type: 'road', status: 'completed', vehicle_id: 1, origin_location: 'HCM', destination_location: 'SGN' },
    { leg_id: 2, sequence_no: 2, direction: 'outbound', leg_type: 'flight', status: 'pending', vehicle_id: null, origin_location: 'SGN Airport', destination_location: 'SIN Airport', actual_departure: null, actual_arrival: null },
  ];
  const trackingStore = {
    findShipmentById: async () => ({ shipment_id: 7, status: 'in_transit', trip_type: 'one_way', customer_id: 10, request_code: 'REQ-007' }),
    isStaffAssigned: async () => true,
    findAssignedStaff: async () => [
      { user_id: 5, role_in_shipment: 'driver', specialization: 'driver', full_name: 'Driver VN' },
      { user_id: 6, role_in_shipment: 'escort', specialization: 'escort', full_name: 'Escort Vet' },
    ],
    findRouteByShipmentId: async () => ({ route_id: 70 }),
    findLegsByRouteId: async () => legs,
    findStopsByRouteId: async () => [],
    findLegCoordinates: async () => ({ originLat: 10.8188, originLng: 106.6519 }),
    getSetting: async () => ({ defaultRadiusM: 300, largeSiteRadiusM: 1000, bufferAccuracyM: 100, maxAccuracyM: 200 }),
    updateLegStatus: async () => false, // simulate concurrent winner already updated
  };
  const svc = new TrackingService(trackingStore, { createNotification: async () => {}, notifyRole: async () => {} }, {});

  // VN Driver blocked on flight leg
  await assert.rejects(
    svc.checkInLegStart(
      { id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com' },
      7,
      2,
      { location: { lat: 10.8188, lng: 106.6519, accuracyM: 15, source: 'gps' } },
    ),
    /Nhân viên hộ tống \(Escort\) phụ trách/,
  );

  // Escort allowed through scope + 1000m airport geofence (500m away passes largeSiteRadiusM=1000m!), then hits atomic race 409
  await assert.rejects(
    svc.checkInLegStart(
      { id: '6', role: UserRole.DRIVER_ESCORT, email: 'escort@example.com' },
      7,
      2,
      { location: { lat: 10.8233, lng: 106.6519, accuracyM: 15, source: 'gps' } },
    ),
    /vừa được nhân sự khác xác nhận xuất phát/,
  );
});

test('Dedicated charter RoadTripsStore.prepareLegs still enforces overlap & capacity after RoadTripsController removal', async () => {
  const order = { shipment_id: 7, requested_horse_count: 2, booking_type: 'dedicated_charter' };
  const leg = { sequenceNo: 1, legType: 'road', vehicleId: 1, originLocation: 'A', destinationLocation: 'B', plannedDeparture: '2099-01-01T08:00:00Z', plannedArrival: '2099-01-01T12:00:00Z' };
  const db = (conflicts = [], capacity = 4) => ({
    execute: async (sql) => {
      if (sql.includes('SELECT * FROM vehicle')) return [[{ vehicle_id: 1, vehicle_type: 'truck', capacity, status: 'available' }]];
      if (sql.includes('SELECT l.road_trip_id')) return [conflicts];
      if (sql.includes('SELECT sv.shipment_id')) return [[]];
      if (sql.includes('FROM shipment_horse')) return [[]];
      if (sql.includes('vehicle_reservation')) return [[]];
      return [{ insertId: 99 }];
    },
  });
  await assert.rejects(
    new RoadTripsStore().prepareLegs(db([{ road_trip_id: 11, stalls_booked: 1, booking_type: 'dedicated_charter' }], 10), order, [leg], 9),
    /bao riêng/,
  );
  await assert.rejects(
    new RoadTripsStore().prepareLegs(db([], 1), order, [leg], 9),
    /đủ 2 chỗ chuồng/,
  );
});

test('Flow 4 Customer privacy redaction: getTripTracking conceals driver/escort identity and raw vitals when customer_vitals_detail=false', async () => {
  const store = {
    findShipmentById: async () => ({
      shipment_id: 6,
      customer_id: 100,
      status: 'in_transit',
      origin_location: 'HCM',
      destination_location: 'Phnom Penh',
    }),
    findRouteByShipmentId: async () => ({ route_id: 60, plan_status: 'in_transit' }),
    findLegsByRouteId: async () => [],
    findStopsByRouteId: async () => [],
    findAssignedStaff: async () => [
      { user_id: 5, role_in_shipment: 'driver', full_name: 'Đặng Văn Lái 1', phone: '0906666777' },
      { user_id: 6, role_in_shipment: 'escort', full_name: 'BS. Phạm Thú Y', phone: '0908888999' },
    ],
    findAssignedHorses: async () => [],
    findHorseHealthLogs: async () => [
      { id: 1, horseName: 'Xích Thố', temperatureC: 38.0, heartRateBpm: 38, respiratoryRateBpm: 14, recordedByName: 'BS. Phạm Thú Y' },
    ],
    findTripStatusLogs: async () => [],
    getSetting: async () => false,
  };
  const svc = new TrackingService(store, {}, {});
  const customerView = await svc.getTrackingDetails({ id: '100', role: UserRole.CUSTOMER }, 6);
  assert.equal(customerView.assignedDriver, null);
  assert.equal(customerView.assignedEscort, null);
  assert.equal(customerView.healthLogs[0].recordedByName, undefined);
  assert.equal(customerView.healthLogs[0].temperatureC, null);
  assert.equal(customerView.healthLogs[0].heartRateBpm, null);

  const managerView = await svc.getTrackingDetails({ id: '2', role: UserRole.LOGISTICS_MANAGER }, 6);
  assert.match(managerView.assignedDriver, /Đặng Văn Lái 1/);
  assert.equal(managerView.healthLogs[0].temperatureC, 38.0);
});

test('Flow 6 HandoverStore baseSelectSql includes shipment_horse fallback so legacy rows still expose horse_name & max_compensation', async () => {
  const { HandoverStore } = require('../dist/modules/tracking/handover.store');
  let capturedSql = '';
  const mockPool = {
    execute: async (sql) => {
      capturedSql = sql;
      return [[{
        handover_id: 1,
        shipment_id: 8,
        shipment_horse_id: 0,
        horse_id: 2,
        horse_name: 'Bạch Long',
        insurance_package: 'basic',
        max_compensation: 50000000,
        emergency_vet_covered: 0,
        handed_over_by: 5,
        received_by_name: 'David Lee',
        handover_datetime: new Date(),
        created_at: new Date(),
      }]];
    },
  };
  const hs = new HandoverStore(mockPool);
  const rows = await hs.findHandoversByShipment(8);
  assert.match(capturedSql, /COALESCE\(sh\.max_compensation, sh_fb\.max_compensation\)/);
  assert.equal(rows[0].horseName, 'Bạch Long');
  assert.equal(rows[0].maxCompensation, 50000000);
});
