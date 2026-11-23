const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} = require('@nestjs/common');
const { IncidentsService } = require('../dist/modules/incidents/incidents.service');
const { IncidentsStore } = require('../dist/modules/incidents/incidents.store');
const { HandoverService } = require('../dist/modules/tracking/handover.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('Flow 5: emergency_vet_covered rejects non-Premium shipments with 422', async () => {
  const mockStore = {
    findIncidentById: async () => ({ id: 10, shipmentId: 201, customerId: 60 }),
    findShipmentSummary: async () => ({
      shipmentId: 201,
      customerId: 60,
      status: 'in_transit',
      hasEmergencyVetCoverage: false,
    }),
  };
  const service = new IncidentsService(mockStore, { notifyRole: async () => {}, createNotification: async () => 1 });

  await assert.rejects(
    () =>
      service.createChangeRequest(
        { id: 4, role: UserRole.LOGISTICS_MANAGER },
        10,
        {
          changeType: 'cost',
          reason: 'Cấp cứu thú y khẩn cấp',
          estimatedExtraCost: 5_000_000,
          costAllocation: 'emergency_vet_covered',
        },
      ),
    (err) => err instanceof UnprocessableEntityException && err.getStatus() === 422,
  );
});

test('Flow 5: approving operating_cost change request inserts shipment_operating_cost without touching shipment_invoice & rejects re-review (409)', async () => {
  const executedSql = [];
  let rowStatus = 'pending';

  const mockConn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      executedSql.push(normalized);
      if (normalized.startsWith('SELECT cr.*, s.customer_id')) {
        return [
          [
            {
              change_id: 55,
              shipment_id: 301,
              incident_id: 12,
              requested_by: 4,
              approved_by: rowStatus === 'pending' ? null : 2,
              change_type: 'route',
              old_value: 'QL1A',
              new_value: 'Cao tốc Bắc Nam',
              reason: 'Sạt lở đường',
              estimated_extra_cost: 2_500_000,
              cost_allocation: 'operating_cost',
              crosses_new_border: 0,
              status: rowStatus,
              decision_notes: null,
              requested_at: '2026-11-19T10:00:00Z',
              approved_at: rowStatus === 'pending' ? null : '2026-11-19T10:05:00Z',
              published_at: null,
              published_by: null,
              ripple_notified_count: 0,
              customer_id: 60,
            },
          ],
        ];
      }
      if (normalized.startsWith('UPDATE shipment_change_request')) {
        rowStatus = 'approved';
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('INSERT INTO shipment_operating_cost')) {
        return [{ insertId: 901 }];
      }
      if (normalized.startsWith('SELECT cr.*, req.full_name')) {
        return [
          [
            {
              change_id: 55,
              shipment_id: 301,
              incident_id: 12,
              requested_by: 4,
              approved_by: 2,
              change_type: 'route',
              old_value: 'QL1A',
              new_value: 'Cao tốc Bắc Nam',
              reason: 'Sạt lở đường',
              estimated_extra_cost: 2_500_000,
              cost_allocation: 'operating_cost',
              crosses_new_border: 0,
              status: 'approved',
              decision_notes: 'Duyệt chi phí phát sinh',
              requested_at: '2026-11-19T10:00:00Z',
              approved_at: '2026-11-19T10:05:00Z',
              published_at: null,
              published_by: null,
              ripple_notified_count: 0,
              requester_name: 'Coord',
              approver_name: 'Manager',
            },
          ],
        ];
      }
      return [[]];
    },
  };

  const store = new IncidentsStore({ getConnection: async () => mockConn });
  const res = await store.reviewChangeRequest(55, 2, 'approved', 'Duyệt chi phí phát sinh');
  assert.equal(res.record.status, 'approved');
  assert.equal(res.record.estimatedExtraCost, 2_500_000);
  assert.ok(
    executedSql.some((s) => s.includes('INSERT INTO shipment_operating_cost') && s.includes("'incident_absorbed'")),
    'Must record operating cost row with valid ENUM category incident_absorbed',
  );
  assert.ok(
    !executedSql.some((s) => s.includes('shipment_invoice')),
    'Flow 5 Invariant 2: Must NEVER modify shipment_invoice',
  );

  await assert.rejects(
    () => store.reviewChangeRequest(55, 2, 'rejected', 'Late tamper'),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );
});

test('Flow 5: publishChangeRequest alerts Logistics Manager (merged compliance role) on crossesNewBorder and isolates sibling customer ripple alerts', async () => {
  const roleNotifs = [];
  const userNotifs = [];

  const mockStore = {
    publishChangeRequest: async () => ({
      record: {
        id: 77,
        shipmentId: 101,
        requestCode: 'REQ-101',
        incidentId: 15,
        requestedBy: 4,
        approvedBy: 2,
        changeType: 'route',
        oldValue: 'Cửa khẩu Cầu Treo',
        newValue: 'Cửa khẩu Lao Bảo',
        reason: 'Tắc biên giới',
        estimatedExtraCost: 0,
        costAllocation: 'none',
        crossesNewBorder: true,
        status: 'approved',
        decisionNotes: null,
        requestedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        publishedBy: 4,
        rippleNotifiedCount: 2,
      },
      affectedBorderGate: 'Lao Bảo Gate',
      affectedCustomers: [
        { shipmentId: 101, customerId: 60, requestCode: 'REQ-101' },
        { shipmentId: 102, customerId: 61, requestCode: 'REQ-102' },
      ],
    }),
  };

  const service = new IncidentsService(mockStore, {
    notifyRole: async (roleName, title, msg, type, shipmentId) => {
      roleNotifs.push({ roleName, title, msg, type, shipmentId });
    },
    createNotification: async (userId, title, msg, type, shipmentId) => {
      userNotifs.push({ userId, title, msg, type, shipmentId });
      return 1;
    },
  });

  await service.publishChangeRequest({ id: 4, role: UserRole.LOGISTICS_MANAGER }, 77);

  assert.ok(
    roleNotifs.some((n) => n.roleName === 'Logistics Manager' && n.type === 'document_missing'),
    'Must notify Logistics Manager when route crosses new border',
  );
  assert.equal(userNotifs.length, 2);
  const cust60Notif = userNotifs.find((n) => n.userId === 60);
  const cust61Notif = userNotifs.find((n) => n.userId === 61);
  assert.ok(cust60Notif.msg.includes('REQ-101') && !cust60Notif.msg.includes('REQ-102'));
  assert.ok(cust61Notif.msg.includes('REQ-102') && !cust61Notif.msg.includes('REQ-101'));
});

test('Flow 6: Handover enforces driver assignment (403), active shipment status (409), mandatory dispute evidence (400), and maxCompensation cap (422)', async () => {
  const notifs = [];
  let maxCap = 50_000_000;
  let shipmentStatus = 'confirmed';
  let assigned = false;

  const mockStore = {
    isDriverAssigned: async () => assigned,
    findShipmentAndHorse: async () => ({
      customerId: 6,
      shipmentStatus,
      destinationLocation: 'Đà Nẵng',
      horseId: 12,
      horseName: 'Thunder',
      maxCompensation: maxCap,
    }),
    findHandoverWithOwner: async () => ({
      id: 301,
      shipmentId: 88,
      requestCode: 'REQ-088',
      shipmentHorseId: 50,
      horseId: 12,
      horseName: 'Thunder',
      maxCompensation: maxCap,
      customerId: 6,
      status: 'pending',
    }),
    respondHandover: async (_id, _uid, payload) => ({
      id: 301,
      shipmentId: 88,
      requestCode: 'REQ-088',
      shipmentHorseId: 50,
      horseId: 12,
      horseName: 'Thunder',
      maxCompensation: maxCap,
      disputeReason: payload.disputeReason,
      status: payload.action === 'dispute' ? 'disputed' : 'confirmed',
    }),
    resolveDispute: async (_id, _mid, notes, comp) => ({
      id: 301,
      shipmentId: 88,
      requestCode: 'REQ-088',
      shipmentHorseId: 50,
      horseId: 12,
      horseName: 'Thunder',
      maxCompensation: maxCap,
      resolutionNotes: notes,
      compensationAmount: comp,
      status: 'confirmed',
    }),
  };

  const service = new HandoverService(mockStore, {
    notifyRole: async (r, t, m, type) => notifs.push({ r, t, type }),
    createNotification: async (u, t, m, type) => {
      notifs.push({ u, t, type });
      return 1;
    },
  });

  // Unassigned driver blocked 403
  await assert.rejects(
    () =>
      service.createHandover(
        { id: 99, role: UserRole.DRIVER_ESCORT },
        88,
        { shipmentHorseId: 50, receivedByName: 'Mr. Owner' },
      ),
    (err) => err instanceof ForbiddenException && err.getStatus() === 403,
  );

  // Assigned driver before in_transit blocked 409
  assigned = true;
  await assert.rejects(
    () =>
      service.createHandover(
        { id: 5, role: UserRole.DRIVER_ESCORT },
        88,
        { shipmentHorseId: 50, receivedByName: 'Mr. Owner' },
      ),
    (err) => err instanceof ConflictException && err.getStatus() === 409,
  );

  // Customer dispute without evidence blocked 400
  await assert.rejects(
    () =>
      service.respondHandover(
        { id: 6, role: UserRole.CUSTOMER },
        301,
        { action: 'dispute', disputeReason: 'Trầy xước chân trái' },
        [],
      ),
    (err) => err instanceof BadRequestException && err.getStatus() === 400,
  );

  // Customer dispute with evidence transitions cleanly
  const disputed = await service.respondHandover(
    { id: 6, role: UserRole.CUSTOMER },
    301,
    {
      action: 'dispute',
      disputeReason: 'Trầy xước chân trái',
      evidenceUrls: ['https://example.com/injury.jpg'],
    },
    [],
  );
  assert.equal(disputed.status, 'disputed');

  // Manager resolveDispute exceeding maxCompensation (50M) blocked 422
  await assert.rejects(
    () =>
      service.resolveDispute(
        { id: 2, role: UserRole.LOGISTICS_MANAGER },
        301,
        { resolutionNotes: 'Bồi thường vượt trần', compensationAmount: 60_000_000 },
      ),
    (err) => err instanceof UnprocessableEntityException && err.getStatus() === 422,
  );

  // Valid resolveDispute <= 50M closes handover to confirmed
  const resolved = await service.resolveDispute(
    { id: 2, role: UserRole.LOGISTICS_MANAGER },
    301,
    { resolutionNotes: 'Đã thanh toán chi phí chăm sóc thú y theo bảo hiểm', compensationAmount: 10_000_000 },
  );
  assert.equal(resolved.status, 'confirmed');
  assert.equal(resolved.compensationAmount, 10_000_000);
});
